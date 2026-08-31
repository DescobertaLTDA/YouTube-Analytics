import { NextResponse } from "next/server";
import { getYoutubeAccessToken } from "@/lib/youtube-analytics-auth";

export const dynamic = "force-dynamic";

// Rota de DIAGNÓSTICO TEMPORÁRIA — não faz parte do app normal.
//
// Motivo de existir: /api/ganhos/backfill está devolvendo 0 linhas da
// YouTube Analytics API pra TODOS os vídeos, em 35 dias, sem nenhum erro
// de API. Isso é consistente com uma hipótese específica: a query usa
// `ids: "channel==MINE"`, que não é o YOUTUBE_CHANNEL_ID do .env — é o
// canal vinculado à CONTA GOOGLE que autorizou o OAuth (rodando
// scripts/get-youtube-refresh-token.mjs). Se essa autorização foi feita
// com uma conta diferente da dona do canal, "MINE" aponta pra outro
// canal (ou nenhum), que não tem os vídeos pedidos — API responde 200 OK
// com rows vazio, sem erro, exatamente como estamos vendo.
//
// Esta rota chama o endpoint /youtube/v3/channels?mine=true da YouTube
// Data API usando o MESMO access token OAuth que o backfill usa, e
// devolve qual canal essa autorização realmente enxerga. Compare o
// channelId/título retornado aqui com o canal real (o que aparece em
// creator_videos / no próprio YouTube Studio).
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

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true",
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
          message: "A API do YouTube recusou a chamada com esse token.",
          status: response.status,
          detalhe: data,
        },
        { status: 200 }
      );
    }

    const channel = data.items?.[0];

    if (!channel) {
      return NextResponse.json({
        success: true,
        message:
          "O token é válido, mas 'mine=true' não retornou NENHUM canal. " +
          "Isso confirma que a conta Google autorizada no OAuth não tem (ou não gerencia) " +
          "nenhum canal do YouTube — precisa refazer o get-youtube-refresh-token.mjs " +
          "logado na conta DONA do canal.",
        totalDeCanaisEncontrados: data.items?.length ?? 0,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "Esse é o canal que a autorização OAuth (usada no backfill/sync de receita) enxerga. " +
        "Compare o channelId abaixo com o ID do canal real (visível na URL do YouTube Studio " +
        "ou nas configurações avançadas do canal).",
      channelId: channel.id,
      channelTitle: channel.snippet?.title,
      totalDeCanaisEncontrados: data.items?.length ?? 0,
      totalDeVideosDoCanal: channel.statistics?.videoCount,
    });
  } catch (error) {
    console.error("❌ Erro no diagnóstico whoami-analytics:", error);
    return NextResponse.json(
      { success: false, message: "Erro no diagnóstico.", error: String(error) },
      { status: 500 }
    );
  }
}
