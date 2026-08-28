-- 0003_creator_earnings.sql
-- Suporte à aba "Ganhos": vídeos do canal descobertos por hashtag
-- (#lucas, #matheus, #rafael) + duração dos vídeos já cadastrados,
-- usada para separar as abas "Vídeos" (longos) e "Shorts".

-- 1. Duração (em segundos) de cada snapshot de vídeo já cadastrado
--    manualmente. Usada para classificar um vídeo como Short (<= 180s)
--    ou vídeo longo.
alter table video_snapshots
  add column if not exists duration_seconds integer;

-- 2. Vídeos do canal encontrados por hashtag na varredura da aba Ganhos.
--    A tabela é totalmente substituída a cada clique em "Atualizar"
--    (ver app/api/ganhos/sync/route.ts) — não é histórico, é o estado
--    mais recente da varredura.
create table if not exists creator_videos (
  id uuid primary key default gen_random_uuid(),
  creator text not null,                    -- 'lucas' | 'matheus' | 'rafael'
  youtube_video_id text not null,
  title text,
  thumbnail_url text,
  view_count bigint not null default 0,
  duration_seconds integer,
  is_short boolean not null default false,
  published_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (creator, youtube_video_id)
);

create index if not exists creator_videos_creator_idx
  on creator_videos (creator);

create index if not exists creator_videos_is_short_idx
  on creator_videos (creator, is_short);
