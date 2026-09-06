import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, CreatorVideoRow } from "@/lib/supabase";
import { getDailyVideoRevenue, getChannelRevenueTotal } from "@/lib/youtube-revenue";
import { CREATORS } from "@/lib/creator-earnings";

export const dynamic = "force-dynamic";

// GET /api/ganhos/canal-vs-rastreados?from=2026-08-01&to=2026-08-31
//
// Compara a receita OFICIAL do canal inteiro (igual ao "Seus ganhos" do
// YouTube Studio) contra a soma da receita real só dos vídeos que o painel
// rastreia (tabela creator_videos, resultado da última varredura por
// hashtag da aba Ganhos) — e, dentro desses, separa quanto pertence a
// vídeo COM hashtag de criador (o que entra nos 3 cards / no histórico
// mensal) e quanto pertence a vídeo SEM hashtag nenhuma (creator: "" na
// tabela — existe e é rastreado, mas hoje não é somado em nenhum card
// mensal por criador, só no card avulso "sem criador" do período de 28d).
//
// `from`/`to` no formato YYYY-MM-DD (obrigatórios). O `to` é INCLUSIVO
// (a YouTube Analytics API trata startDate/endDate como inclusivos).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: creatorVideos, error: dbError } = await supabase
      .from("creator_videos")
      .select("youtube_video_id, creator")
      .returns<Pick<CreatorVideoRow, "youtube_video_id" | "creator">[]>();

    if (dbError) {
      return NextResponse.json({ error: `Erro ao ler creator_videos: ${dbError.message}` }, { status: 500 });
    }

    // Um mesmo vídeo pode ter várias linhas (uma por criador com hashtag
    // encontrada). "Tem criador" = pelo menos uma linha com creator
    // reconhecido em CREATORS (ver app/api/ganhos/sync/route.ts, que grava
    // creator: "" pra vídeo sem nenhuma hashtag).
    const creatorKeys = new Set(CREATORS.map((c) => c.key as string));
    const videoHasCreator = new Map<string, boolean>();
    for (const row of creatorVideos || []) {
      const has = creatorKeys.has(row.creator) || videoHasCreator.get(row.youtube_video_id) === true;
      videoHasCreator.set(row.youtube_video_id, has);
    }

    const trackedVideoIds = Array.from(videoHasCreator.keys());
    const comCriadorIds = trackedVideoIds.filter((id) => videoHasCreator.get(id));
    const semCriadorIds = trackedVideoIds.filter((id) => !videoHasCreator.get(id));

    const [channelTotal, trackedRevenueRows] = await Promise.all([
      getChannelRevenueTotal(from, to),
      getDailyVideoRevenue(from, to, trackedVideoIds),
    ]);

    if (channelTotal === null || trackedRevenueRows === null) {
      return NextResponse.json(
        {
          error:
            "OAuth da YouTube Analytics API não configurado ou indisponível — não deu pra buscar nenhum dos dois lados da comparação.",
        },
        { status: 502 }
      );
    }

    const comCriadorSet = new Set(comCriadorIds);
    const semCriadorSet = new Set(semCriadorIds);

    const somaRevenue = (rows: typeof trackedRevenueRows) =>
      rows.reduce((sum, r) => sum + r.estimatedRevenue, 0);
    const somaViews = (rows: typeof trackedRevenueRows) => rows.reduce((sum, r) => sum + r.views, 0);

    const rowsComCriador = trackedRevenueRows.filter((r) => comCriadorSet.has(r.videoId));
    const rowsSemCriador = trackedRevenueRows.filter((r) => semCriadorSet.has(r.videoId));

    const trackedRevenue = somaRevenue(trackedRevenueRows);
    const trackedViews = somaViews(trackedRevenueRows);

    return NextResponse.json({
      periodo: { from, to },
      canalInteiro: {
        receita: channelTotal.estimatedRevenue,
        views: channelTotal.views,
      },
      videosRastreados: {
        totalVideosNaTabela: trackedVideoIds.length,
        receita: trackedRevenue,
        views: trackedViews,
      },
      // Isso é o que hoje NÃO aparece em nenhum dos 3 cards mensais por
      // criador (getCreatorMonthlyEarningsHistory pula vídeo sem hashtag
      // por completo) — provável explicação da diferença entre a soma dos
      // 3 cards e o total do Studio.
      comHashtagDeCriador: {
        totalVideos: comCriadorIds.length,
        receita: Math.round(somaRevenue(rowsComCriador) * 100) / 100,
        views: somaViews(rowsComCriador),
      },
      semHashtagDeCriador: {
        totalVideos: semCriadorIds.length,
        receita: Math.round(somaRevenue(rowsSemCriador) * 100) / 100,
        views: somaViews(rowsSemCriador),
      },
      diferenca: {
        // canal inteiro vs. tudo que o painel rastreia (a "cauda" de vídeo
        // fora do radar) — deve ser pequeno.
        canalVsRastreado: Math.round((channelTotal.estimatedRevenue - trackedRevenue) * 100) / 100,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao comparar receita do canal vs. rastreados:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

