import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rota de DIAGNÓSTICO TEMPORÁRIA — faz a troca do refresh_token na unha
// (sem passar pelo cache de youtube-analytics-auth.ts) e consulta o
// endpoint tokeninfo do Google, que devolve o escopo, validade e
// client_id REAIS associados ao access_token gerado — a fonte da
// verdade, sem depender de nenhuma suposição do resto do app.
//
// Apague esse arquivo depois de confirmar o diagnóstico.
export async function GET() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({
      success: false,
      step: "env",
      message: "Alguma das 3 env vars não está definida nessa deployment.",
      temClientId: !!clientId,
      temClientSecret: !!clientSecret,
      temRefreshToken: !!refreshToken,
    });
  }

  // Passo 1: troca o refresh_token por um access_token novo, na unha.
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return NextResponse.json({
      success: false,
      step: "token_exchange",
      message: "A troca do refresh_token falhou (isso NÃO bate com o que o app reporta hoje — se você ver isso, é uma pista nova).",
      status: tokenResponse.status,
      detalhe: tokenData,
      clientIdUsado: clientId,
      // só os 12 primeiros caracteres, pra comparar sem expor o token inteiro
      refreshTokenPrefixo: refreshToken.slice(0, 12),
      refreshTokenTamanho: refreshToken.length,
    });
  }

  const accessToken = tokenData.access_token as string | undefined;

  if (!accessToken) {
    return NextResponse.json({
      success: false,
      step: "token_exchange",
      message: "A troca respondeu OK (200) mas SEM access_token no corpo — isso explicaria tudo.",
      corpoCompleto: tokenData,
    });
  }

  // Passo 2: pergunta pro PRÓPRIO Google o que esse access_token realmente é.
  const tokenInfoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" }
  );
  const tokenInfoData = await tokenInfoResponse.json();

  // Passo 3: usa esse access_token pra chamar a Analytics API, igual o app faz.
  const analyticsParams = new URLSearchParams({
    ids: "channel==MINE",
    startDate: "2026-08-01",
    endDate: "2026-09-05",
    metrics: "estimatedRevenue,views",
    dimensions: "day",
    currency: "BRL",
  });
  const analyticsResponse = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${analyticsParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );
  const analyticsData = await analyticsResponse.json();

  return NextResponse.json({
    success: true,
    step: "done",
    tokenExchange: {
      status: tokenResponse.status,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      accessTokenPrefixo: accessToken.slice(0, 15),
      accessTokenTamanho: accessToken.length,
    },
    tokenInfo: {
      status: tokenInfoResponse.status,
      // Se o Google recusar o tokeninfo, detalhe vem aqui (isso sozinho já é uma pista forte).
      corpo: tokenInfoData,
    },
    analyticsCall: {
      status: analyticsResponse.status,
      corpo: analyticsData,
    },
  });
}
