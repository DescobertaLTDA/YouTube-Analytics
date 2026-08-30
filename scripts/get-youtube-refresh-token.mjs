#!/usr/bin/env node
// Rode este script UMA VEZ, no seu computador, pra conseguir o
// refresh_token da API de receita do YouTube
// (yt-analytics-monetary.readonly). Depois é só colar o refresh_token no
// .env.local e nas env vars da Vercel — o app nunca mais precisa passar
// por esse fluxo de novo (a menos que você revogue o acesso na sua Conta
// Google, ou peça um novo por qualquer motivo).
//
// Pré-requisito: ter criado uma credencial OAuth tipo "Aplicativo para
// computador" (Desktop app) no Google Cloud Console, com a Tela de
// permissão OAuth já tendo o escopo yt-analytics-monetary.readonly e o
// seu e-mail como usuário de teste.
//
// Uso:
//   YOUTUBE_OAUTH_CLIENT_ID=xxx YOUTUBE_OAUTH_CLIENT_SECRET=yyy node scripts/get-youtube-refresh-token.mjs
//
// O script abre (imprime) uma URL de login do Google. Entre com a CONTA
// DONA DO CANAL, autorize, e o refresh_token aparece no terminal.

import http from "node:http";

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
const PORT = 53682; // Desktop app aceita qualquer porta loopback — essa é só uma escolha
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/yt-analytics-monetary.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "❌ Defina YOUTUBE_OAUTH_CLIENT_ID e YOUTUBE_OAUTH_CLIENT_SECRET (do Google Cloud Console) antes de rodar."
  );
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // essencial — sem isso o Google não devolve refresh_token
    prompt: "consent", // força reemitir o refresh_token mesmo se já autorizou antes
  });

console.log("\n👉 Abra esse link no navegador, LOGADO NA CONTA GOOGLE DONA DO CANAL:\n");
console.log(authUrl);
console.log(`\nAguardando você autorizar... (ouvindo em ${REDIRECT_URI})\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    res.end(`Autorização recusada: ${errorParam}. Pode fechar essa aba.`);
    server.close();
    console.error(`\n❌ Autorização recusada: ${errorParam}\n`);
    process.exit(1);
  }

  if (!code) {
    res.end("Não veio nenhum código na URL. Confira o link e tente de novo.");
    return;
  }

  res.end("✅ Pode fechar essa aba — o token já foi capturado no terminal.");
  server.close();

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenResponse.json();

  if (!tokens.refresh_token) {
    console.error(
      "\n❌ Não veio refresh_token na resposta. Isso costuma acontecer quando você já autorizou esse\n" +
        "   app antes. Revogue o acesso em https://myaccount.google.com/permissions e rode de novo.\n"
    );
    console.error(tokens);
    process.exit(1);
  }

  console.log("\n✅ Copie esse refresh_token pro seu .env.local e pras env vars da Vercel:\n");
  console.log(tokens.refresh_token);
  console.log("\n(Guarde com segurança — quem tiver esse valor consegue ler seus dados de receita.)\n");
  process.exit(0);
});

server.listen(PORT);
