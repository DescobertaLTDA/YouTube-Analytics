-- 0006_tracked_channel_view_history.sql
-- Histórico diário de view_count dos vídeos recentes de cada canal de
-- terceiro rastreado (tabela `tracked_channels`, ver 0005). Guardado 1x
-- por dia pelo cron de `/api/canais-terceiros/snapshot`, seguindo o MESMO
-- padrão de `creator_video_view_history` (upsert por vídeo/dia, chave em
-- youtube_video_id + captured_date): mesmo se o cron rodar mais de uma
-- vez no mesmo dia (retry, teste manual etc.), fica só 1 linha por
-- vídeo/dia, sempre com o snapshot mais recente daquele dia.
--
-- Diferente de `creator_video_view_history`, aqui NÃO tem `is_short` nem
-- receita — canal de terceiro não é nosso, não tem RPM/ganho pra
-- calcular, só serve pra comparar RITMO de crescimento de views entre
-- canais (o gráfico "Views por dia" da aba Canais).

create table if not exists tracked_channel_video_history (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null,
  youtube_video_id text not null,
  view_count bigint not null,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  captured_date date not null default current_date,
  unique (youtube_video_id, captured_date)
);

create index if not exists tracked_channel_video_history_channel_date_idx
  on tracked_channel_video_history (youtube_channel_id, captured_date);
