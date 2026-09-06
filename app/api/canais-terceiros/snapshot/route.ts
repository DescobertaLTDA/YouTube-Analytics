import { NextRequest, NextResponse } from "next/server";
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
// Chamado 1x/HORA por um GitHub Actions externo (Vercel Hobby só permite
// cron nativo 1x/dia, ver .github/workflows/hourly-sync.yml). Pra cada
// canal ativo em `tracked_channels`, busca os vídeos recentes e grava o
// view_count atual em `tracked_channel_video_history` (upsert por
// vídeo/HORA — ver migration tracked_channel_history_hourly). É esse
// histórico que alimenta o gráfico "Views por hora" da aba Canais: sem
// ele, a aba só mostra o VPH instantâneo (desde a publicação), sem
// tendência ao longo do tempo.
//
// Agora exige CRON_SECRET no header Authorization: quem chama deixou de
// ser só o cron "escondido" da Vercel e passou a ser um scheduler externo
// batendo numa URL pública, então precisa de autenticação de verdade.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

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
export async function GET(request: NextRequest) {
  return POST(request);
}
