import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { CREATORS, CreatorKey, estimateEarnings } from "@/lib/creator-earnings";
import { getRealRpmMap } from "@/lib/rpm-real";
import { getDailyVideoRevenue } from "@/lib/youtube-revenue";
import { sumRealRevenueInRange } from "@/lib/data";

export const dynamic = "force-dynamic";

// GET /api/ganhos/mensal-debug?month=2026-08
//
// Reproduz o MESMO loop de getCreatorMonthlyEarningsHistory (delta de
// view_count entre snapshots consecutivos de creator_video_view_history +
// receita real por vídeo/dia quando disponível, senão estimativa por
// RPM) mas, em vez de só devolver o total final, expõe o que está por
// trás dele:
//
// - quanto do total veio de receita REAL vs. quanto veio de ESTIMATIVA
//   por RPM (testa a hipótese "e se for o RPM?" — se boa parte do total
//   ainda vier de RPM num mês já fechado, o RPM fixo/real usado é
//   candidato forte a explicar a diferença que sobrou);
// - quantos "dia de vídeo" (pares prev/curr) cada categoria cobre;
// - a lista de vídeos com hashtag que tiveram ZERO dia com receita real
//   no mês inteiro — sinal de que a chamada da API falhou pra esse vídeo
//   especificamente (rate limit, vídeo removido/privado etc.), não que a
//   receita real dele é R$0 mesmo.
//
// `month` no formato YYYY-MM (obrigatório).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Parâmetro obrigatório: month=YYYY-MM" }, { status: 400 });
    }

    const db = getServiceSupabase();

    // Mesma paginação da função real, sem filtro de data — precisa do
    // histórico inteiro pra achar o snapshot ANTERIOR ao mês pedido (o
    // "prev" do primeiro par que cai dentro do mês pode ser de antes).
    type HistoryRow = { youtube_video_id: string; view_count: number; captured_date: string; is_short: boolean };
    const PAGE_SIZE = 1000;
    const { count: totalRows, error: countError } = await db
      .from("creator_video_view_history")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return NextResponse.json({ error: `Erro ao contar histórico: ${countError.message}` }, { status: 500 });
    }
    if (!totalRows || totalRows === 0) {
      return NextResponse.json({ error: "Sem histórico de views ainda." }, { status: 200 });
    }

    const pageCount = Math.ceil(totalRows / PAGE_SIZE);
    const pageResults = await Promise.all(
      Array.from({ length: pageCount }, (_, page) => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        return db
          .from("creator_video_view_history")
          .select("youtube_video_id, view_count, captured_date, is_short")
          .order("captured_date", { ascending: true })
          .range(from, to);
      })
    );

    const historyRows: HistoryRow[] = [];
    for (const { data: pageData, error: pageError } of pageResults) {
      if (pageError) {
        return NextResponse.json({ error: `Erro ao ler histórico: ${pageError.message}` }, { status: 500 });
      }
      historyRows.push(...((pageData as HistoryRow[]) || []));
    }

    const { data: creatorVideoRows, error: creatorError } = await db
      .from("creator_videos")
      .select("creator, youtube_video_id");

    if (creatorError) {
      return NextResponse.json({ error: `Erro ao ler creator_videos: ${creatorError.message}` }, { status: 500 });
    }

    const creatorsByVideo = new Map<string, CreatorKey[]>();
    for (const row of (creatorVideoRows as { creator: string; youtube_video_id: string }[]) || []) {
      if (!CREATORS.some((c) => c.key === row.creator)) continue;
      const list = creatorsByVideo.get(row.youtube_video_id) || [];
      list.push(row.creator as CreatorKey);
      creatorsByVideo.set(row.youtube_video_id, list);
    }

    const relevantVideoIds = Array.from(creatorsByVideo.keys());
    const firstDate = historyRows[0].captured_date;
    const lastDate = historyRows[historyRows.length - 1].captured_date;
    const [realRevenueRows, realRpmMap] = await Promise.all([
      getDailyVideoRevenue(firstDate, lastDate, relevantVideoIds),
      getRealRpmMap(),
    ]);

    if (realRevenueRows === null) {
      return NextResponse.json(
        { error: "OAuth da YouTube Analytics API não configurado ou indisponível." },
        { status: 502 }
      );
    }

    const realRevenueByKey = new Map<string, number>();
    // Quantos dias com receita real (mesmo R$0) cada vídeo tem NO MÊS
    // pedido — usado pra achar vídeo com zero dado real no mês inteiro.
    const realDaysInMonthByVideo = new Map<string, number>();
    for (const row of realRevenueRows) {
      realRevenueByKey.set(`${row.date}|${row.videoId}`, row.estimatedRevenue);
      if (row.date.startsWith(month)) {
        realDaysInMonthByVideo.set(row.videoId, (realDaysInMonthByVideo.get(row.videoId) || 0) + 1);
      }
    }

    const byVideo = new Map<string, HistoryRow[]>();
    for (const row of historyRows) {
      const list = byVideo.get(row.youtube_video_id) || [];
      list.push(row);
      byVideo.set(row.youtube_video_id, list);
    }

    type CreatorStat = { realRevenue: number; estimatedRevenue: number; realDayVideoCount: number; estimatedDayVideoCount: number };
    const emptyStat = (): CreatorStat => ({ realRevenue: 0, estimatedRevenue: 0, realDayVideoCount: 0, estimatedDayVideoCount: 0 });
    const statsByCreator: Record<CreatorKey, CreatorStat> = {
      lucas: emptyStat(),
      matheus: emptyStat(),
      rafael: emptyStat(),
    };

    const videosWithNoRealDataInMonth = new Set<string>();
    const videosSeenInMonth = new Set<string>();

    for (const [videoId, rows] of byVideo) {
      const creators = creatorsByVideo.get(videoId);
      if (!creators || creators.length === 0) continue;

      const sorted = rows.slice().sort((a, b) => (a.captured_date < b.captured_date ? -1 : 1));

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (!curr.captured_date.startsWith(month)) continue; // só nos importa o mês pedido

        videosSeenInMonth.add(videoId);

        const deltaViews = Math.max((curr.view_count || 0) - (prev.view_count || 0), 0);
        const { sum: realRevenueSum, hasReal } = sumRealRevenueInRange(
          videoId,
          prev.captured_date,
          curr.captured_date,
          realRevenueByKey
        );

        if (deltaViews === 0 && !hasReal) continue;

        const dayEarnings = hasReal
          ? realRevenueSum
          : estimateEarnings(deltaViews, curr.is_short, realRpmMap.get(videoId)?.rpm);

        for (const creator of creators) {
          if (hasReal) {
            statsByCreator[creator].realRevenue += dayEarnings;
            statsByCreator[creator].realDayVideoCount += 1;
          } else {
            statsByCreator[creator].estimatedRevenue += dayEarnings;
            statsByCreator[creator].estimatedDayVideoCount += 1;
          }
        }
      }

      if (videosSeenInMonth.has(videoId) && !realDaysInMonthByVideo.has(videoId)) {
        videosWithNoRealDataInMonth.add(videoId);
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const porCriador = {} as Record<
      CreatorKey,
      { total: number; real: number; estimado: number; diasVideoReal: number; diasVideoEstimado: number }
    >;
    let totalReal = 0;
    let totalEstimado = 0;
    for (const { key } of CREATORS) {
      const s = statsByCreator[key];
      porCriador[key] = {
        total: round2(s.realRevenue + s.estimatedRevenue),
        real: round2(s.realRevenue),
        estimado: round2(s.estimatedRevenue),
        diasVideoReal: s.realDayVideoCount,
        diasVideoEstimado: s.estimatedDayVideoCount,
      };
      totalReal += s.realRevenue;
      totalEstimado += s.estimatedRevenue;
    }

    return NextResponse.json({
      mes: month,
      porCriador,
      resumo: {
        totalReal: round2(totalReal),
        totalEstimadoPorRpm: round2(totalEstimado),
        // Se isso for uma fatia grande do total, o RPM (ou a falta de
        // dado real pra esses vídeos/dias específicos) é candidato forte
        // a explicar o resto da diferença vs. o card comHashtagDeCriador.
        percentualEstimado: totalReal + totalEstimado > 0
          ? round2((totalEstimado / (totalReal + totalEstimado)) * 100)
          : 0,
      },
      // Vídeos com hashtag que apareceram no loop desse mês mas não têm
      // NENHUM dia de receita real vindo da API no mês inteiro — ou o
      // vídeo genuinamente não gerou receita, ou a chamada da API falhou
      // pra ele (rate limit, vídeo privado/removido, etc.) e todo o mês
      // dele caiu pra RPM sem avisar.
      videosSemDadoRealNoMes: Array.from(videosWithNoRealDataInMonth),
    });
  } catch (error) {
    console.error("❌ Erro no debug mensal:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
