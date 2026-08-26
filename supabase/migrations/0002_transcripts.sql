-- Transcrições importadas (formato tactiq.io) e a minutagem extraída delas.

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete set null,
  youtube_video_id text,            -- extraído da URL no cabeçalho do arquivo tactiq
  source_title text,                -- extraído da 2ª linha "# TÍTULO"
  raw_text text not null,           -- arquivo completo, guardado como veio
  segment_count integer not null default 0,
  duration_seconds numeric,         -- timestamp do último segmento
  uploaded_at timestamptz not null default now()
);

-- cada linha "HH:MM:SS.mmm texto" do transcript, já convertida para segundos
create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  segment_order integer not null,       -- ordem original dentro do arquivo
  timestamp_label text not null,        -- "00:00:00.160", como veio no arquivo
  timestamp_seconds numeric not null,   -- 0.160 — o que permite ordenar/filtrar
  text text not null,
  is_chapter boolean not null default false  -- heurística: linha tipo "Número 15."
);

-- Índices: video_id é usado pra puxar "a transcrição desse vídeo" no dashboard;
-- transcript_id é usado toda vez que a página busca os segmentos de uma transcrição;
-- o índice composto (transcript_id, timestamp_seconds) permite listar a minutagem
-- já em ordem cronológica sem sort em memória.
create index if not exists idx_transcripts_video_id on transcripts (video_id);
create index if not exists idx_transcripts_youtube_video_id on transcripts (youtube_video_id);
create index if not exists idx_transcript_segments_transcript_id on transcript_segments (transcript_id);
create index if not exists idx_transcript_segments_transcript_time
  on transcript_segments (transcript_id, timestamp_seconds);
