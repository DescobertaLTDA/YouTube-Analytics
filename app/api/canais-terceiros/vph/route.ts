import { NextResponse } from "next/server";
import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";
import { fetchRecentChannelVideos, isShortVideo } from "@/lib/youtube-channel";
import { computeVph } from "@/lib/vph";

export const dynamic = "force-dynamic";

export type TrackedChannelVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  publishedAt: string;
  isShort: boolean;
  vph: number | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl: string | null;
};

// GET /api/canais-terceiros/vph
//
// Pra cada canal ativo em `tracked_channels`, busca os vídeos mais
// recentes (fetchRecentChannelVideos — uma página da playlist de
// uploads, sem varrer o histórico inteiro) e calcula o VPH (views por
// hora desde a publicação, lib/vph.ts — a mesma conta usada nos vídeos
// próprios). Roda ao vivo a cada chamada, sem snapshot em banco: não
// tem como saber a "velocidade" de um vídeo de terceiro sem histórico
// próprio, então o VPH aqui é sempre a média desde a publicação, não a
// velocidade recente — suficiente pra comparar canais entre si.
//
// RECENT_VIDEOS_PER_CHANNEL controla quanto de cota da API é gasto por
// chamada (2 unidades por canal: 1 pra achar a playlist de uploads + 1
// pro lote de vídeos, batendo o limite de 50 IDs por chamada de
// videos.list de sobra).
const RECENT_VIDEOS_PER_CHANNEL = 10;

export async function GET() {
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("tracked_channels")
      .select("*")
      .eq("active", true)
      .order("added_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const channels = (data as TrackedChannelRow[]) || [];
    if (channels.length === 0) {
      return NextResponse.json({ videos: [] });
    }

    const perChannel = await Promise.all(
      channels.map(async (channel) => {
        const videos = await fetchRecentChannelVideos(channel.youtube_channel_id, RECENT_VIDEOS_PER_CHANNEL);
        return videos.map((v): TrackedChannelVideo => ({
          videoId: v.id,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          viewCount: v.viewCount,
          publishedAt: v.publishedAt,
          isShort: isShortVideo(v.durationSeconds),
          vph: computeVph(v.viewCount, v.publishedAt),
          channelId: channel.youtube_channel_id,
          channelTitle: channel.channel_title || "",
          channelAvatarUrl: channel.avatar_url,
        }));
      })
    );

    const videos = perChannel
      .flat()
      .sort((a, b) => (b.vph ?? 0) - (a.vph ?? 0));

    return NextResponse.json({ videos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
