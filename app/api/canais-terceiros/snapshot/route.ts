import { NextResponse } from "next/server";
import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";
import { fetchRecentChannelVideos } from "@/lib/youtube-channel";

export const dynamic = "force-dynamic";

// RECENT_VIDEOS_PER_CHANNEL igual ao usado em /api/canais-terceiros/vph —
// mesma amostra de vídeos recentes, pra manter os dois consistentes
// (o card "ao vivo" e o histórico gravado por esse snapshot olham pros
// mesmos vídeos de cada canal).
const RECENT_VIDEOS_PER_CHANNEL = 10;

// POST/GET /api/canais-terceiros/snapshot
//
// Chamado 1x/dia pelo cron nativo da Vercel (ver vercel.json). Pra cada
// canal ativo em `tracked_channels`, busca os vídeos recentes e grava o
// view_count atual em `tracked_channel_video_history` (upsert por
// vídeo/dia — ver migration 0006). É esse histórico que alimenta o
// gráfico "Views por dia" da aba Canais: sem ele, a aba só mostra o VPH
// instantâneo (desde a publicação), sem tendência ao longo do tempo.
//
// Sem autenticação por secret, de propósito — segue o MESMO padrão já
// usado em /api/sync e /api/ganhos/sync (rota "escondida" só pelo path,
// sem checar header). Se algum dia quiser travar isso, dá pra adicionar
// um CRON_SECRET e checar o header Authorization aqui.
export async function POST() {
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("tracked_channels")
      .select("*")
      .eq("active", true);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const channels = (data as TrackedChannelRow[]) || [];
    if (channels.length === 0) {
      return NextResponse.json({ success: true, channels_scanned: 0, videos_saved: 0 });
    }

    const now = new Date().toISOString();
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
            captured_at: now,
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
        .upsert(rows, { onConflict: "youtube_video_id,captured_date" });

      if (upsertError) {
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      channels_scanned: channels.length,
      videos_saved: rows.length,
      errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Também aceita GET, pra facilitar testar na mão pelo navegador — mesmo
// padrão de /api/sync e /api/ganhos/sync.
export async function GET() {
  return POST();
}
