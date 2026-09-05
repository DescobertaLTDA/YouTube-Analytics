import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getDailyVideoRevenue } from "@/lib/youtube-revenue";

export const dynamic = "force-dynamic";

// Rota de USO ÚNICO: preenche retroativamente `creator_video_view_history`
// com o view_count ACUMULADO por vídeo/dia, reconstruído a partir da
// YouTube Analytics API.
//
// ATENÇÃO — ISTO CORRIGE UM BUG DE DADOS (2026): a versão anterior desta
// rota gravava em `view_count` as views GANHAS naquele dia específico (a
// métrica `views` da Analytics API com `dimensions=day`), mas o resto do
// app (getCreatorEarnings, getCreatorDailyEarnings,
// getCreatorMonthlyEarningsHistory) trata TODO `view_count` da tabela como
// se fosse o ACUMULADO desde sempre daquele vídeo — igual o que o cron
// `/api/ganhos/sync` grava, via `statistics.viewCount` da YouTube Data
// API — e calcula o ganho de cada dia como
// `view_count(hoje) - view_count(ontem)`.
//
// Misturar os dois sentidos na mesma coluna gerava um salto gigantesco e
// artificial bem no dia em que a série passava de "backfill" (views do
// dia, número pequeno) pra "cron" (acumulado, número grande) — na prática
// visto como um mês inteiro com views muito acima do normal no histórico
// mensal (ex: um mês reportando 12+ milhões de views quando os vizinhos
// tinham ~2-4 milhões).
//
// A versão abaixo reconstrói o acumulado de verdade: parte do view_count
// ATUAL de cada vídeo (já salvo em `creator_videos`, sempre o total mais
// recente da última varredura via "Atualizar") como âncora, e anda pra
// trás no tempo subtraindo, dia a dia, as views GANHAS naquele dia (que a
// Analytics API dá certinho). O resultado é uma série de acumulados 100%
// equivalente ao que o cron grava — o resto do app nem percebe se aquele
// dia veio do cron ou deste backfill.
//
// IMPORTANTE — se você já rodou a versão ANTIGA desta rota antes, ela já
// inseriu linhas erradas (views diárias no lugar de acumulado) na tabela.
// Apague essas linhas ANTES de rodar esta versão corrigida, senão o
// `ignoreDuplicates` abaixo preserva o dado errado que já está lá (ver
// instruções fornecidas à parte — o marcador é `captured_at` batendo
// exatamente em `T12:00:00Z`, que só esta rota grava; o cron sempre grava
// o horário real da sincronização).
//
// O que essa rota NÃO faz:
// - Não sobrescreve dias que JÁ existem em creator_video_view_history
//   (upsert com `ignoreDuplicates: true`) — o cron diário sempre tem
//   prioridade; a Analytics API só tapa buraco de dias sem nenhum
//   registro ainda (de antes do cron existir, ou apagados manualmente).
// - Não inventa nada pros ~1-2 dias mais recentes que a Analytics API
//   ainda não processou — eles ficam de fora e o app cai sozinho pra
//   estimativa por RPM nesse meio tempo (ver getCreatorDailyEarnings).
//
// Uso: GET /api/ganhos/backfill?days=270 (query opcional, default 35) —
// aumente o `days` pra cobrir Janeiro (por ex. days=260 a partir de
// setembro). Rode uma vez, confira o resultado, e pode apagar esse
// arquivo depois.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") || "35");

    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const db = getServiceSupabase();

    // `view_count` aqui já é o TOTAL ACUMULADO atual de cada vídeo (mesmo
    // campo que o cron grava, atualizado a cada "Atualizar") — é a âncora
    // usada pra reconstruir o acumulado de dias passados de cada vídeo.
    const { data: creatorVideoRows } = await db
      .from("creator_videos")
      .select("youtube_video_id, view_count, is_short, published_at");

    type VideoMeta = { viewCountNow: number; isShort: boolean; publishedAt: string | null };
    const videoMeta = new Map<string, VideoMeta>();
    for (const v of (creatorVideoRows as
      | { youtube_video_id: string; view_count: number; is_short: boolean; published_at: string | null }[]
      | null) || []) {
      // Um vídeo colab aparece 1x por criador em creator_videos — o
      // view_count é o mesmo em todas, então só precisamos da primeira.
      if (!videoMeta.has(v.youtube_video_id)) {
        videoMeta.set(v.youtube_video_id, {
          viewCountNow: v.view_count ?? 0,
          isShort: v.is_short,
          publishedAt: v.published_at,
        });
      }
    }

    const videoIds = Array.from(videoMeta.keys());

    // Guarda só os erros ÚNICOS (por status+mensagem) pra não devolver 121
    // linhas repetidas quando todos os vídeos falham pelo mesmo motivo.
    const errorsSeen = new Map<
      string,
      { status: number | null; message: string; exemploVideoId: string; ocorrencias: number }
    >();
    const rows = await getDailyVideoRevenue(startDate, endDate, videoIds, (videoId, status, message) => {
      const key = `${status}|${message}`;
      const existing = errorsSeen.get(key);
      if (existing) {
        existing.ocorrencias++;
      } else {
        errorsSeen.set(key, { status, message, exemploVideoId: videoId, ocorrencias: 1 });
      }
    });

    if (rows === null) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OAuth da YouTube Analytics API não configurado ou falhou. Confira YOUTUBE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN.",
        },
        { status: 200 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "A API não retornou nenhuma linha pro período pedido.",
          inserted: 0,
          errosDaApi: Array.from(errorsSeen.values()),
        },
        { status: 200 }
      );
    }

    // Agrupa as views DIÁRIAS (não acumuladas) por vídeo.
    const byVideo = new Map<string, { date: string; views: number }[]>();
    for (const row of rows) {
      const list = byVideo.get(row.videoId) || [];
      list.push({ date: row.date, views: row.views });
      byVideo.set(row.videoId, list);
    }

    const historyRows: {
      youtube_video_id: string;
      view_count: number;
      is_short: boolean;
      published_at: string | null;
      captured_at: string;
      captured_date: string;
    }[] = [];

    for (const [videoId, series] of byVideo) {
      const meta = videoMeta.get(videoId);
      if (!meta) continue; // não deveria acontecer: videoIds vem de videoMeta

      // Ordena ASCENDENTE, mas a reconstrução do acumulado anda de trás
      // pra frente: começa em "hoje" (view_count atual, real) e vai
      // subtraindo as views de cada dia pra chegar no acumulado do dia
      // anterior. O último dia da série (o mais recente que a Analytics
      // API já processou, ~1-2 dias atrás) recebe o view_count ATUAL como
      // aproximação — uma margem de erro de 1-2 dias de views só nesse
      // ponto; o resto da série sai exato a partir daí.
      const sorted = series.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

      let runningCumulative = meta.viewCountNow;
      const cumulativeByDate = new Map<string, number>();
      for (let i = sorted.length - 1; i >= 0; i--) {
        cumulativeByDate.set(sorted[i].date, Math.max(Math.round(runningCumulative), 0));
        runningCumulative -= sorted[i].views;
      }

      for (const { date } of sorted) {
        historyRows.push({
          youtube_video_id: videoId,
          view_count: cumulativeByDate.get(date) ?? 0,
          is_short: meta.isShort,
          published_at: meta.publishedAt,
          captured_at: `${date}T12:00:00Z`,
          captured_date: date,
        });
      }
    }

    // ignoreDuplicates: true garante que um dia já gravado pelo cron
    // diário (com o view_count exato daquele momento) nunca é sobrescrito
    // por esse backfill retroativo.
    const { error, count } = await db
      .from("creator_video_view_history")
      .upsert(historyRows, {
        onConflict: "youtube_video_id,captured_date",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) throw error;

    const uniqueDates = Array.from(new Set(rows.map((r) => r.date))).sort();

    return NextResponse.json({
      success: true,
      periodoConsultado: { startDate, endDate },
      diasRetornadosPelaApi: uniqueDates,
      linhasRecebidasDaApi: rows.length,
      linhasNovasInseridas: count ?? historyRows.length,
      obs:
        "view_count gravado aqui já é o ACUMULADO reconstruído (não mais views isoladas do dia) — compatível com o que o cron grava. Dias recentes que não aparecem em 'diasRetornadosPelaApi' ainda não foram processados pela Analytics API (~1-2 dias de atraso); eles serão preenchidos automaticamente pelo sync diário normal.",
    });
  } catch (error) {
    console.error("❌ Erro no backfill de creator_video_view_history:", error);
    return NextResponse.json(
      { success: false, message: "Erro no backfill.", error: String(error) },
      { status: 500 }
    );
  }
}
