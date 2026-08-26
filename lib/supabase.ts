import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Cliente com service_role — ignora RLS. Só pode ser usado em código que roda
 * no servidor (Route Handlers, Server Actions). NUNCA importar isso em um
 * componente marcado "use client".
 */
export function getServiceSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey);
}

export type VideoRow = {
  id: string;
  youtube_video_id: string;
  channel_label: string | null;
  published_at: string | null;
};

export type SnapshotRow = {
  id: string;
  video_id: string;
  captured_at: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
};

export type ManualAnalyticsRow = {
  id: string;
  video_id: string;
  report_date: string;
  ctr: number | null;
  impressions: number | null;
  retention_pct: number | null;
  avg_view_duration_seconds: number | null;
  rpm: number | null;
  subscribers_gained: number | null;
};

export type ChangeLogRow = {
  id: string;
  video_id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
};

export type TranscriptRow = {
  id: string;
  video_id: string | null;
  youtube_video_id: string | null;
  source_title: string | null;
  raw_text: string;
  segment_count: number;
  duration_seconds: number | null;
  uploaded_at: string;
};

export type TranscriptSegmentRow = {
  id: string;
  transcript_id: string;
  segment_order: number;
  timestamp_label: string;
  timestamp_seconds: number;
  text: string;
  is_chapter: boolean;
};
