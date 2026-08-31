-- 0004_video_rpm_real.sql
-- Suporte à importação de RPM real por vídeo, via CSV exportado do
-- YouTube Studio ("Dados da tabela.csv", aba Conteúdo).
--
-- Guarda o RPM real mais recente conhecido de cada vídeo (identificado
-- pelo youtube_video_id), pra ser usado no cálculo de receita da aba
-- Ganhos no lugar do RPM fixo (SHORTS_RPM / LONG_RPM), quando disponível.
--
-- Cada importação de CSV faz upsert por youtube_video_id: a linha é
-- sempre substituída pelo valor mais recente daquele vídeo (não é
-- histórico — é o estado atual, igual o padrão já usado em
-- `creator_videos`). Se no futuro fizer sentido guardar histórico por
-- período, dá pra trocar a unique constraint pra
-- (youtube_video_id, report_start, report_end).

create table if not exists video_rpm_real (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null,
  rpm numeric not null,              -- RPM (BRL) do vídeo, direto do CSV
  receita numeric,                   -- "Receita estimada (BRL)" do vídeo no período do CSV
  views bigint,                      -- "Visualizações" (ou "Visualizações intencionais") do CSV
  report_start date,                 -- início do período coberto pelo export (ex: 2026-08-03)
  report_end date,                   -- fim do período coberto pelo export (ex: 2026-08-31)
  updated_at timestamptz not null default now(),
  unique (youtube_video_id)
);

create index if not exists video_rpm_real_video_idx
  on video_rpm_real (youtube_video_id);
