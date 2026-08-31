import { NextResponse } from "next/server";
import { getYoutubeAccessToken } from "@/lib/youtube-analytics-auth";

export const dynamic = "force-dynamic";

// Rota de DIAGNÓSTICO TEMPORÁRIA — não faz parte do app normal.
//
// v2: a primeira versão chamava youtube/v3/channels?mine=true (Data API),
// mas o token só tem o escopo yt-analytics-monetary.readonly, que NÃO dá
// acesso à Data API — por isso deu 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT.
// Isso não prova nem descarta a hipótese de canal errado, só mostra que
// usamos a API errada pro teste.
//
// Esta versão usa exclusivamente a YouTube Analytics API (o mesmo
// endpoint que o backfill usa), pedindo dados agregados do CANAL INTEIRO
// nos últimos 90 dias, SEM filtro de vídeo. Isso isola duas hipóteses:
//
// A) Se vier alguma linha aqui (views > 0 pra qualquer dia): o token e o
//    canal têm dados normalmente — o problema do backfill dar 0 linhas
//    é mais provável de ser um descompasso entre os `youtube_video_id`
//    salvos em creator_videos e os vídeos que esse canal realmente tem
//    (ex: IDs de outro canal, ou pertencentes a um canal gerenciado à
//    parte).
// B) Se vier TUDO vazio, igual ao backfill: o canal ligado a essa
//    autorização OAuth não tem nenhum dado de Analytics no período —
//    forte indício de que a autorização foi feita com a conta/canal
//    errado (precisa refazer scripts/get-youtube-refresh-token.mjs
//    logado na conta DONA do canal certo).
//
// Apague esse arquivo depois de confirmar o diagnóstico.
export async function GET() {
  try {
    const accessToken = await getYoutubeAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Não consegui nem obter o access_token (troca do refresh_token falhou). " +
            "Confira YOUTUBE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN nas env vars.",
        },
        { status: 200 }
      );
    }

    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "estimatedRevenue,views",
      dimensions: "day",
      maxResults: "366",
      // Sem `filters=video==...` de propósito — queremos o canal inteiro.
    });

    const response = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: "A YouTube Analytics API recusou a chamada com esse token.",
          status: response.status,
          detalhe: data,
        },
        { status: 200 }
      );
    }

    const rows = (data.rows as [string, number, number][]) || [];
    const totalViews = rows.reduce((sum, r) => sum + (Number(r[2]) || 0), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + (Number(r[1]) || 0), 0);

    return NextResponse.json({
      success: true,
      periodoConsultado: { startDate, endDate },
      diasComDadosRetornados: rows.length,
      totalViewsNoPeriodo: totalViews,
      totalRevenueNoPeriodo: totalRevenue,
      amostraLinhas: rows.slice(0, 5),
      diagnostico:
        rows.length > 0
          ? "O canal ligado a esse token TEM dados de Analytics normalmente. O problema do backfill provavelmente não é canal errado — é descompasso entre os youtube_video_id salvos em creator_videos e os vídeos reais desse canal. Próximo passo: pegar 1 video_id de creator_videos e testar esse endpoint filtrando por ele especificamente."
          : "O canal ligado a esse token NÃO tem NENHUM dado de Analytics nos últimos 90 dias, nem agregado (sem filtro de vídeo). Forte indício de que o OAuth foi autorizado com a conta/canal errado — refaça scripts/get-youtube-refresh-token.mjs logado na conta Google DONA do canal certo.",
    });
  } catch (error) {
    console.error("❌ Erro no diagnóstico whoami-analytics:", error);
    return NextResponse.json(
      { success: false, message: "Erro no diagnóstico.", error: String(error) },
      { status: 500 }
    );
  }
}
