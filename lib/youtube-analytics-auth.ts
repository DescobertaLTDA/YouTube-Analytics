// Troca o refresh_token (permanente, gerado uma única vez pelo script
// scripts/get-youtube-refresh-token.mjs) por um access_token de curta
// duração (~1h) — é esse access_token que autentica as chamadas na
// YouTube Analytics API (receita real).
//
// Cacheado em memória dentro do mesmo processo pra não bater no endpoint
// de token do Google a cada request (o cache não sobrevive a um redeploy
// / cold start novo, e tudo bem — só troca de novo na primeira chamada).

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getYoutubeAccessToken(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  // OAuth ainda não configurado (ou faltando alguma env var) — quem
  // chamar isso deve tratar `null` como "usa a estimativa por RPM",
  // nunca deve travar a página de Ganhos por causa disso.
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("❌ Erro ao renovar access_token do YouTube:", await response.text());
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in?: number };
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.accessToken;
  } catch (error) {
    console.error("❌ Erro ao renovar access_token do YouTube:", error);
    return null;
  }
}
