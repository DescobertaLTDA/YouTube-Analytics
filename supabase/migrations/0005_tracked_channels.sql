-- 0005_tracked_channels.sql
-- Canais de terceiros (concorrentes/referências) rastreados via API
-- pública do YouTube — sem OAuth, só precisa que o canal seja público.
-- Usado pra comparar o VPH (views por hora) dos vídeos recentes deles
-- contra os nossos, sem precisar de acesso à conta do dono do canal.
--
-- Lista dinâmica: a pessoa adiciona/remove canal quando quiser (aba
-- "Canais" do dashboard). `active = false` é usado como soft-delete (a
-- rota DELETE marca assim em vez de apagar a linha), pra manter o
-- histórico de quando cada canal foi adicionado/removido.

create table if not exists tracked_channels (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null,
  channel_title text,
  avatar_url text,
  added_at timestamptz not null default now(),
  active boolean not null default true,
  unique (youtube_channel_id)
);

create index if not exists tracked_channels_active_idx
  on tracked_channels (active);
