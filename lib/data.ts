import {
  supabase,
  VideoRow,
  SnapshotRow,
  ManualAnalyticsRow,
  ChangeLogRow,
  TranscriptRow,
  TranscriptSegmentRow,
} from "./supabase";

export type VideoWithStats = {
  video: VideoRow;
  latest: SnapshotRow | null;
  previous: SnapshotRow | null;
  viewsPerDay: number | null;
  daysLive: number | null;
  manual: ManualAnalyticsRow | null;
  revenue: number | null;
  changes: ChangeLogRow[];
  history: SnapshotRow[];
};

export async function getDashboardData(): Promise<VideoWithStats[]> {
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("published_at", { ascending: true });

  if (!videos || videos.length === 0) return [];

  const results: VideoWithStats[] = [];

  for (const video of videos as VideoRow[]) {
    const { data: snapshots } = await supabase
      .from("video_snapshots")
      .select("*")
      .eq("video_id", video.id)
      .order("captured_at", { ascending: false })
      .limit(30);

    const history = ((snapshots as SnapshotRow[]) || []).slice().reverse();
    const latest = history.length > 0 ? history[history.length - 1] : null;
    const previous = history.length > 1 ? history[history.length - 2] : null;

    let viewsPerDay: number | null = null;
    let daysLive: number | null = null;

    if (video.published_at && latest?.view_count != null) {
      const published = new Date(video.published_at).getTime();
      const now = new Date(latest.captured_at).getTime();
      const days = Math.max((now - published) / (1000 * 60 * 60 * 24), 1);
      daysLive = Math.round(days * 10) / 10;
      viewsPerDay = Math.round((latest.view_count / days) * 10) / 10;
    }

    const { data: manualRows } = await supabase
      .from("analytics_manual")
      .select("*")
      .eq("video_id", video.id)
      .order("report_date", { ascending: false })
      .limit(1);

    const manual = (manualRows && manualRows[0]) || null;

    // Receita estimada = (views totais / 1000) × RPM informado manualmente
    const revenue =
      manual?.rpm != null && latest?.view_count != null
        ? Math.round(((latest.view_count / 1000) * manual.rpm) * 100) / 100
        : null;

    const { data: changeRows } = await supabase
      .from("change_log")
      .select("*")
      .eq("video_id", video.id)
      .order("detected_at", { ascending: false })
      .limit(10);

    results.push({
      video,
      latest,
      previous,
      viewsPerDay,
      daysLive,
      manual,
      revenue,
      changes: (changeRows as ChangeLogRow[]) || [],
      history,
    });
  }

  return results;
}

export type TranscriptWithSegments = {
  transcript: TranscriptRow;
  segments: TranscriptSegmentRow[];
};

// Lista os transcripts arquivados, cada um com sua minutagem (segments) já
// ordenada por timestamp — usado na página /transcripts.
export async function getTranscripts(): Promise<TranscriptWithSegments[]> {
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (!transcripts || transcripts.length === 0) return [];

  const results: TranscriptWithSegments[] = [];

  for (const transcript of transcripts as TranscriptRow[]) {
    const { data: segments } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("transcript_id", transcript.id)
      .order("timestamp_seconds", { ascending: true });

    results.push({ transcript, segments: (segments as TranscriptSegmentRow[]) || [] });
  }

  return results;
}

// Lista simplificada de vídeos pra popular o <select> do formulário de
// importação (vincular a transcrição a um vídeo já cadastrado é opcional).
export async function getVideoOptions(): Promise<Pick<VideoRow, "id" | "channel_label" | "youtube_video_id">[]> {
  const { data } = await supabase
    .from("videos")
    .select("id, channel_label, youtube_video_id")
    .order("published_at", { ascending: true });

  return data || [];
}
