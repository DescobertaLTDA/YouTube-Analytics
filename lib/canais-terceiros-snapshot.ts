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
//   GitHub Actions de hora em hora (ver .github/workflows/main.yml).
//   Usa truncateToHour=true (padrão): grava sempre na hora CHEIA, pra
//   uma re-execução do cron na mesma hora fazer upsert em cima do mesmo
//   registro em vez de duplicar linha.
// - /api/canais-terceiros/refresh: sem secret, chamada pelo botão
//   "Atualizar" do site (AtualizarButton.tsx) — o navegador nunca pode
//   saber o CRON_SECRET (ficaria visível no DevTools de qualquer
//   pessoa), então esse gatilho manual usa essa rota separada. Chama
//   com truncateToHour=false: grava no timestamp EXATO do clique, não
//   arredondado — assim cada clique em "Atualizar" cria um ponto NOVO
//   no histórico (em vez de só sobrescrever o registro da hora cheia
//   em silêncio), permitindo ver o crescimento de views entre dois
//   cliques manuais sem esperar a próxima hora do cron.
export async function runCanaisTerceirosSnapshot(
  opts: { truncateToHour?: boolean } = {}
): Promise<SnapshotResult> {
  const { truncateToHour = true } = opts;
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
  // Chave de unicidade do histórico (`captured_hour`): hora cheia pro
  // cron automático (dedup por hora), timestamp exato pro clique manual
  // (cada clique é um ponto próprio). Ver comentário da função acima.
  let capturedHourIso: string;
  if (truncateToHour) {
    const capturedHour = new Date(now);
    capturedHour.setUTCMinutes(0, 0, 0);
    capturedHourIso = capturedHour.toISOString();
  } else {
    capturedHourIso = nowIso;
  }

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
