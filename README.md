# YouTube Analytics — Painel (Pedras e Minerais)

Dashboard em Next.js + Supabase para acompanhar views/dia e trocas de título/thumbnail/descrição
do canal.

## Deploy na Vercel

1. Suba esta pasta pra um repositório no GitHub.
2. Na Vercel: **New Project → Import** o repositório.
3. Em **Settings → Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ildxajnvgoduikxkcxqv.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (Supabase → Project Settings → API Keys → `anon` `public`)
   - `SUPABASE_SERVICE_ROLE_KEY` = (mesma página → `service_role`, **não** exponha no client)
   - `YOUTUBE_API_KEY` = sua API key da YouTube Data API v3
4. Deploy.

Ou use a **integração oficial Vercel ↔ Supabase** (Vercel → Integrations → Supabase) pra preencher
as duas primeiras variáveis automaticamente.

## Estrutura do banco (já criada no projeto Supabase "YouTube Analytics")

- `videos` — cadastro dos vídeos (video ID do YouTube, rótulo V1/V2/V3..., data de publicação)
- `video_snapshots` — snapshot diário (views, likes, comentários, título, descrição, thumbnail)
- `analytics_manual` — CTR, impressões, retenção, RPM (importados manualmente do Studio)
- `change_log` — histórico de quando título/thumbnail/descrição mudaram

## Importar transcript / roteiro

Na página `/transcripts` dá pra colar o texto exportado do tactiq.io (ou qualquer texto com
linhas `HH:MM:SS.mmm texto`). O site:

1. Guarda o texto bruto na tabela `transcripts`
2. Extrai cada linha de timestamp e grava em `transcript_segments` (a "minutagem")
3. Marca automaticamente linhas tipo `Número 15.` como capítulo, pra navegar rápido
4. Opcionalmente vincula o transcript a um vídeo já cadastrado em `videos`

Rode a migration `supabase/migrations/0002_transcripts.sql` no projeto Supabase antes de usar.

## Próximo passo: Edge Function de coleta diária

Ainda falta escrever e agendar a Edge Function que:
1. Roda 1x/dia (cron)
2. Chama `GET https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={ID}&key={YOUTUBE_API_KEY}`
   pra cada vídeo cadastrado em `videos`
3. Insere um registro novo em `video_snapshots`
4. Compara com o snapshot anterior e grava em `change_log` qualquer diferença em título,
   thumbnail ou descrição

## Local

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```
