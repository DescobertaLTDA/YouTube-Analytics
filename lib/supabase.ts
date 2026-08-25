import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
