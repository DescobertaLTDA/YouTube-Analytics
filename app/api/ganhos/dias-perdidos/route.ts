import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";
import { getDailyVideoRevenue } from "@/lib/youtube-revenue";

export const dynamic = "force-dynamic";

// GET /api/ganhos/dias-perdidos?month=2026-08
//
// Depois do fix do "vazamento pro mês seguinte" (cada dia com receita
// real vai pro balde do MÊS DAQUELE DIA), o único jeito de um dia ainda
// sumir do card mensal é esse dia cair FORA do intervalo de snapshots de
// `creator_video_view_history` daquele vídeo — ou seja:
//
// - ANTES do primeiro snapshot que temos daquele vídeo (ele só passou a
//   ser rastreado/gravado no meio do mês, ou depois dele — vídeo novo no
//   radar, hashtag adicionada tarde, etc.); ou
// - DEPOIS do último snapshot que temos (o vídeo parou de ser
//   sincronizado em algum ponto — removido do canal, ficou privado, saiu
//   da lista que o /api/ganhos/sync varre, etc.) — mesmo que a receita
//   real dele continue existindo normalmente na Analytics API.
//
// Esse endpoint cruza os dois lados: pra cada vídeo com hashtag,
// descobre o primeiro/último dia com snapshot de views, e sinaliza
// qualquer dia do mês pedido em que a API JÁ tem receita real mas esse
// dia cai fora desse intervalo — agrupado por semana, pra achar rápido
// ONDE no mês a coisa quebrou.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Parâmetro obrigatório: month=YYYY-MM" }, { status: 400 });
    }

    const db = getServiceSupabase();

    type HistoryRow = { youtube_video_id: string; captured_date: string };
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
          .select("youtube_video_id, captured_date")
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
    const videoIdsWithCreator = Array.from(creatorsByVideo.keys());

    // Primeiro/último dia com snapshot de views, por vídeo (só dos vídeos
    // com hashtag — são os únicos que entram nos 3 cards mensais).
    const trackedRangeByVideo = new Map<string, { first: string; last: string }>();
    for (const row of historyRows) {
      if (!creatorsByVideo.has(row.youtube_video_id)) continue;
      const existing = trackedRangeByVideo.get(row.youtube_video_id);
      if (!existing) {
        trackedRangeByVideo.set(row.youtube_video_id, { first: row.captured_date, last: row.captured_date });
      } else {
        if (row.captured_date < existing.first) existing.first = row.captured_date;
        if (row.captured_date > existing.last) existing.last = row.captured_date;
      }
    }

    // Receita real por vídeo/dia SÓ do mês pedido — é o "deveria existir
    // no card" contra o qual comparamos o intervalo rastreado.
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${month}-01T00:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCDate(0); // último dia do mês pedido
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const realRevenueRows = await getDailyVideoRevenue(monthStart, monthEnd, videoIdsWithCreator);
    if (realRevenueRows === null) {
      return NextResponse.json(
        { error: "OAuth da YouTube Analytics API não configurado ou indisponível." },
        { status: 502 }
      );
    }

    type LostDay = { date: string; videoId: string; revenue: number; motivo: "antes_do_1o_snapshot" | "depois_do_ultimo_snapshot" | "video_nunca_rastreado" };
    const lostDays: LostDay[] = [];

    for (const row of realRevenueRows) {
      const range = trackedRangeByVideo.get(row.videoId);
      if (!range) {
        // Vídeo com hashtag mas SEM nenhum snapshot de views registrado
        // nunca — nunca vai aparecer em nenhum card mensal.
        lostDays.push({ date: row.date, videoId: row.videoId, revenue: row.estimatedRevenue, motivo: "video_nunca_rastreado" });
        continue;
      }
      if (row.date <= range.first) {
        // <= porque o primeiro snapshot em si nunca vira um "curr" com
        // "prev" (é o índice 0 do array ordenado) — o dia dele também
        // fica de fora do loop de pares.
        lostDays.push({ date: row.date, videoId: row.videoId, revenue: row.estimatedRevenue, motivo: "antes_do_1o_snapshot" });
      } else if (row.date > range.last) {
        lostDays.push({ date: row.date, videoId: row.videoId, revenue: row.estimatedRevenue, motivo: "depois_do_ultimo_snapshot" });
      }
    }

    const totalPerdido = Math.round(lostDays.reduce((sum, d) => sum + d.revenue, 0) * 100) / 100;

    // Agrupa por semana (blocos de 7 dias a partir do dia 1 do mês) pra
    // achar rápido ONDE no mês a coisa quebrou.
    const weekOf = (date: string): string => {
      const day = Number(date.slice(8, 10));
      const weekStart = Math.floor((day - 1) / 7) * 7 + 1;
      const weekEndRaw = weekStart + 6;
      const lastDayOfMonth = Number(monthEnd.slice(8, 10));
      const weekEnd = Math.min(weekEndRaw, lastDayOfMonth);
      return `${month}-${String(weekStart).padStart(2, "0")} a ${month}-${String(weekEnd).padStart(2, "0")}`;
    };

    const porSemana = new Map<string, number>();
    for (const d of lostDays) {
      const key = weekOf(d.date);
      porSemana.set(key, (porSemana.get(key) || 0) + d.revenue);
    }

    // Agrupa por vídeo também, pra saber QUAL vídeo parou de ser
    // rastreado (e quando) — é o dado mais acionável pra corrigir a
    // causa raiz (adicionar de volta ao sync, checar se ficou privado
    // etc.), em vez de só saber "sumiu dinheiro nessa semana".
    const porVideo = new Map<string, { revenue: number; dias: number; motivo: string; primeiroSnapshot: string; ultimoSnapshot: string }>();
    for (const d of lostDays) {
      const range = trackedRangeByVideo.get(d.videoId);
      const existing = porVideo.get(d.videoId);
      if (existing) {
        existing.revenue += d.revenue;
        existing.dias += 1;
      } else {
        porVideo.set(d.videoId, {
          revenue: d.revenue,
          dias: 1,
          motivo: d.motivo,
          primeiroSnapshot: range?.first ?? "—",
          ultimoSnapshot: range?.last ?? "—",
        });
      }
    }

    return NextResponse.json({
      mes: month,
      totalPerdido,
      totalDiasVideoPerdidos: lostDays.length,
      porSemana: Object.fromEntries(
        Array.from(porSemana.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      porVideo: Object.fromEntries(
        Array.from(porVideo.entries())
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .map(([videoId, info]) => [
            videoId,
            {
              revenuePerdida: Math.round(info.revenue * 100) / 100,
              diasPerdidos: info.dias,
              motivo: info.motivo,
              primeiroSnapshotRastreado: info.primeiroSnapshot,
              ultimoSnapshotRastreado: info.ultimoSnapshot,
            },
          ])
      ),
    });
  } catch (error) {
    console.error("❌ Erro ao calcular dias perdidos:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
