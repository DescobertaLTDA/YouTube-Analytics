import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { fetchChannelVideosDetails, isShortVideo } from "@/lib/youtube-channel";

export const dynamic = "force-dynamic";

// GET /api/canais-terceiros/top-videos?channelId=UC...&hours=48
//
// Alimenta o card "Últimas N horas" (ChannelRealtimeCard) — mesma ideia
// do card de tempo real do YouTube Studio, mas pra um canal de terceiro
// rastreado. `tracked_channel_video_history` só grava view_count por
// hora (ver 0006_tracked_channel_view_history.sql), sem título/thumbnail,
// então:
// 1) calcula o delta de views de cada vídeo dentro da janela pedida
//    (mesma técnica de getTrackedChannelsViewsHistory, só que por vídeo
//    em vez de agregado por canal/hora);
// 2) pega só os top N vídeos por delta;
// 3) busca título/thumbnail ao vivo na API do YouTube SÓ pra esses (nunca
//    pros dezenas de vídeos do histórico inteiro) — mesmo padrão já usado
//    em /api/canais-terceiros/vph.
const TOP_N = 5;
const PAGE_SIZE = 1000;

type HistoryRow = { youtube_video_id: string; view_count: number; captured_hour: string };

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const channelId = req.nextUrl.searchParams.get("channelId");
    const hours = Number(req.nextUrl.searchParams.get("hours") || 48);

    if (!channelId) {
      return noStoreJson({ error: "channelId é obrigatório" }, { status: 400 });
    }

    const db = getServiceSupabase();
    // +1 hora de folga pra ter a "hora anterior" de referência do primeiro
    // ponto da janela (mesmo motivo do getCreatorDailyEarnings/
    // getTrackedChannelsViewsHistory).
    const startIso = new Date(Date.now() - (hours + 1) * 60 * 60 * 1000).toISOString();

    const rows: HistoryRow[] = [];
    for (let page = 0; ; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await db
        .from("tracked_channel_video_history")
        .select("youtube_video_id, view_count, captured_hour")
        .eq("youtube_channel_id", channelId)
        .gte("captured_hour", startIso)
        .order("captured_hour", { ascending: true })
        .range(from, to);

      if (error) {
        return noStoreJson({ error: error.message }, { status: 500 });
      }
      const pageRows = (data as HistoryRow[]) || [];
      rows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }

    const byVideo = new Map<string, HistoryRow[]>();
    for (const row of rows) {
      const list = byVideo.get(row.youtube_video_id) || [];
      list.push(row);
      byVideo.set(row.youtube_video_id, list);
    }

    const deltaByVideo = new Map<string, number>();
    for (const [videoId, list] of byVideo) {
      const sorted = list.slice().sort((a, b) => (a.captured_hour < b.captured_hour ? -1 : 1));
      let total = 0;
      for (let i = 1; i < sorted.length; i++) {
        // Nunca negativo — mesmo cuidado do resto do app com recontagem
        // do YouTube / vídeo reprocessado.
        total += Math.max((sorted[i].view_count || 0) - (sorted[i - 1].view_count || 0), 0);
      }
      deltaByVideo.set(videoId, total);
    }

    const totalViews = Array.from(deltaByVideo.values()).reduce((a, b) => a + b, 0);

    const topVideoIds = Array.from(deltaByVideo.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([videoId]) => videoId);

    const details = topVideoIds.length > 0 ? await fetchChannelVideosDetails(topVideoIds) : [];
    const detailsById = new Map(details.map((d) => [d.id, d]));

    const videos = topVideoIds.map((videoId) => {
      const detail = detailsById.get(videoId);
      return {
        videoId,
        title: detail?.title || "",
        thumbnailUrl: detail?.thumbnailUrl || "",
        isShort: detail ? isShortVideo(detail.durationSeconds) : false,
        views: deltaByVideo.get(videoId) || 0,
      };
    });

    return noStoreJson({ totalViews, videos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
