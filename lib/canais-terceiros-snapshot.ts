import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";
import { fetchRecentChannelVideos } from "@/lib/youtube-channel";

// RECENT_VIDEOS_PER_CHANNEL igual ao usado em /api/canais-terceiros/vph —
// mesma amostra de vídeos recentes, pra manter os dois consistentes
// (o card "ao vivo" e o histórico gravado por esse snapshot olham pros
// mesmos vídeos de cada canal).
const RECENT_VIDEOS_PER_CHANNEL = 10;

export type SnapshotResult = {
  success: boolean;
  channels_scanned: number;
  videos_saved: number;
  errors: { channelTitle: string; message: string }[];
  error?: string;
};

// Lógica de captura em si, compartilhada por DUAS rotas:
// - /api/canais-terceiros/snapshot: exige CRON_SECRET, chamada pelo
//   GitHub Actions de hora em hora (ver .github/workflows/hourly-sync.yml).
// - /api/canais-terceiros/refresh: sem secret, chamada pelo botão
//   "Atualizar" do próprio site (AtualizarButton.tsx) — o navegador nunca
//   pode saber o CRON_SECRET (ficaria visível no DevTools de qualquer
//   pessoa), então esse gatilho manual precisa de uma porta separada.
export async function runCanaisTerceirosSnapshot(): Promise<SnapshotResult> {
  const db = getServiceSupabase();
  const { data, error } = await db.from("tracked_channels").select("*").eq("active", true);

  if (error) {
    return { success: false, channels_scanned: 0, videos_saved: 0, errors: [], error: error.message };
  }

  const channels = (data as TrackedChannelRow[]) || [];
  if (channels.length === 0) {
    return { success: true, channels_scanned: 0, videos_saved: 0, errors: [] };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  // Hora cheia (minutos/segundos zerados) — é a chave de unicidade que
  // permite 1 captura por vídeo por HORA em vez de por dia.
  const capturedHour = new Date(now);
  capturedHour.setUTCMinutes(0, 0, 0);
  const capturedHourIso = capturedHour.toISOString();

  const errors: { channelTitle: string; message: string }[] = [];

  const perChannelRows = await Promise.all(
    channels.map(async (channel) => {
      // Isolado por canal: um canal com erro (cota da API, removido do
      // YouTube etc.) não derruba a captura dos outros.
      try {
        const videos = await fetchRecentChannelVideos(channel.youtube_channel_id, RECENT_VIDEOS_PER_CHANNEL);
        return videos.map((v) => ({
          youtube_channel_id: channel.youtube_channel_id,
          youtube_video_id: v.id,
          view_count: v.viewCount,
          published_at: v.publishedAt,
          captured_at: nowIso,
          captured_hour: capturedHourIso,
        }));
      } catch (err) {
        errors.push({
          channelTitle: channel.channel_title || channel.youtube_channel_id,
          message: err instanceof Error ? err.message : "erro desconhecido",
        });
        return [];
      }
    })
  );

  const rows = perChannelRows.flat();

  if (rows.length > 0) {
    const { error: upsertError } = await db
      .from("tracked_channel_video_history")
      .upsert(rows, { onConflict: "youtube_video_id,captured_hour" });

    if (upsertError) {
      return { success: false, channels_scanned: channels.length, videos_saved: 0, errors, error: upsertError.message };
    }
  }

  return {
    success: true,
    channels_scanned: channels.length,
    videos_saved: rows.length,
    errors,
  };
}
