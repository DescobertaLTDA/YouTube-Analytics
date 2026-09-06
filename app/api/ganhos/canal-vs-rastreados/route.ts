import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase, CreatorVideoRow } from "@/lib/supabase";
import { getDailyVideoRevenue, getChannelRevenueTotal } from "@/lib/youtube-revenue";

export const dynamic = "force-dynamic";

// GET /api/ganhos/canal-vs-rastreados?from=2026-08-01&to=2026-08-31
//
// Compara a receita OFICIAL do canal inteiro (igual ao "Seus ganhos" do
// YouTube Studio) contra a soma da receita real só dos vídeos que o painel
// rastreia (tabela creator_videos, resultado da última varredura por
// hashtag da aba Ganhos). A diferença entre os dois é a "cauda": receita de
// vídeos publicados no canal que nunca entraram nessa varredura — por não
// terem #lucas/#matheus/#rafael no título/descrição, ou por serem vídeos
// antigos de antes da hashtag existir.
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
      .select("youtube_video_id")
      .returns<Pick<CreatorVideoRow, "youtube_video_id">[]>();

    if (dbError) {
      return NextResponse.json({ error: `Erro ao ler creator_videos: ${dbError.message}` }, { status: 500 });
    }

    const trackedVideoIds = Array.from(
      new Set((creatorVideos || []).map((v) => v.youtube_video_id))
    );

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

    const trackedRevenue = trackedRevenueRows.reduce((sum, r) => sum + r.estimatedRevenue, 0);
    const trackedViews = trackedRevenueRows.reduce((sum, r) => sum + r.views, 0);

    // Quantos dos vídeos rastreados de fato tiveram alguma linha de receita
    // retornada nesse período (ajuda a diferenciar "vídeo sem receita no
    // período" de "vídeo cuja chamada à API falhou").
    const videosComReceitaNoPeriodo = new Set(trackedRevenueRows.map((r) => r.videoId)).size;

    return NextResponse.json({
      periodo: { from, to },
      canalInteiro: {
        receita: channelTotal.estimatedRevenue,
        views: channelTotal.views,
      },
      videosRastreados: {
        totalVideosNaTabela: trackedVideoIds.length,
        videosComReceitaNoPeriodo,
        receita: trackedRevenue,
        views: trackedViews,
      },
      diferenca: {
        // Positivo = tem receita "sobrando" no canal que não está em
        // nenhum vídeo rastreado (a "cauda"). Negativo seria estranho
        // (indicaria vídeo contado em dobro ou problema de data/fuso).
        receita: Math.round((channelTotal.estimatedRevenue - trackedRevenue) * 100) / 100,
        views: channelTotal.views - trackedViews,
      },
    });
  } catch (error) {
    console.error("❌ Erro ao comparar receita do canal vs. rastreados:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
