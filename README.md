# YouTube Analytics — Painel (Pedras e Minerais)

Dashboard em Next.js + Supabase para acompanhar views/dia e trocas de título/thumbnail/descrição
do canal, além dos ganhos estimados por criador.

## Abas do site

- **Ganhos** (`/`) — 3 cards, um por criador (Lucas, Matheus, Rafael), com views e ganhos
  estimados, separados entre Shorts e vídeos longos. Os vídeos de cada criador são achados
  automaticamente: o site varre TODO o canal (`YOUTUBE_CHANNEL_ID`) e considera qualquer vídeo
  que tenha `#lucas`, `#matheus` ou `#rafael` no título ou na descrição. Um vídeo com mais de
  uma hashtag conta pra mais de um criador.
  - **RPM fixo**: R$ 0,22.
  - **Fórmula de ganhos**: `views × RPM ÷ 1000 ÷ 2`.
  - O botão **Atualizar** dispara `POST /api/ganhos/sync`, que varre o canal de novo e substitui
    o conteúdo da tabela `creator_videos` pelo resultado mais recente.
- **Vídeos** (`/videos`) — vídeos longos (> 3 min) cadastrados manualmente na tabela `videos`.
- **Shorts** (`/shorts`) — vídeos curtos (≤ 3 min) da mesma tabela `videos`. A classificação usa
  a duração retornada pela YouTube Data API (`contentDetails.duration`), salva em
  `video_snapshots.duration_seconds` a cada sincronização (`/api/sync`).
- **Transcripts** (`/transcripts`) e **Mudanças** (`/changes`) — como antes.

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
- `video_snapshots` — snapshot diário (views, likes, comentários, título, descrição, thumbnail,
  duração em segundos)
- `analytics_manual` — CTR, impressões, retenção, RPM (importados manualmente do Studio)
- `change_log` — histórico de quando título/thumbnail/descrição mudaram
- `creator_videos` — resultado da última varredura por hashtag da aba Ganhos (criador, video ID,
  views, duração, se é Short). É recriada do zero a cada clique em "Atualizar", não é histórico.

**Rode a migration `supabase/migrations/0003_creator_earnings.sql`** no projeto Supabase antes
de usar a aba Ganhos e as abas Vídeos/Shorts — ela cria a tabela `creator_videos` e adiciona a
coluna `duration_seconds` em `video_snapshots`.

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
