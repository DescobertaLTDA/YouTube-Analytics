import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { fetchAllChannelVideos, isShortVideo } from "@/lib/youtube-channel";
import { CREATORS, matchCreators } from "@/lib/creator-earnings";
import { getCreatorEarnings } from "@/lib/data";

export const dynamic = "force-dynamic";

// Chamado pelo botão "Atualizar" da aba Ganhos. Varre TODO o canal, acha
// os vídeos com #lucas / #matheus / #rafael no título ou descrição, e
// substitui o conteúdo da tabela `creator_videos` pelo resultado da
// varredura atual.
export async function POST() {
  try {
    const supabase = getServiceSupabase();

    const channelVideos = await fetchAllChannelVideos();

    if (channelVideos.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nenhum vídeo encontrado no canal. Confira o YOUTUBE_CHANNEL_ID / YOUTUBE_API_KEY.",
        },
        { status: 200 }
      );
    }

    const now = new Date().toISOString();
    const rows: {
      creator: string;
      youtube_video_id: string;
      title: string;
      thumbnail_url: string;
      view_count: number;
      duration_seconds: number;
      is_short: boolean;
      published_at: string;
      synced_at: string;
    }[] = [];

    for (const video of channelVideos) {
      const text = `${video.title} ${video.description}`;
      const matched = matchCreators(text);
      const isShort = isShortVideo(video.durationSeconds);

      // Vídeo sem nenhuma hashtag: ainda entra na tabela (creator: "") pra
      // contar nas views totais do canal no período (aba Ganhos), mas não
      // é atribuído a nenhum criador nem aparece nas abas Vídeos/Shorts.
      const creatorsForVideo = matched.length > 0 ? matched : [""];

      for (const creator of creatorsForVideo) {
        rows.push({
          creator,
          youtube_video_id: video.id,
          title: video.title,
          thumbnail_url: video.thumbnailUrl,
          view_count: video.viewCount,
          duration_seconds: video.durationSeconds,
          is_short: isShort,
          published_at: video.publishedAt,
          synced_at: now,
        });
      }
    }

    // Substitui tudo: apaga o resultado da varredura anterior e insere o
    // atual. Mais simples e evita ficar com vídeos "fantasma" que
    // perderam a hashtag ou saíram do canal.
    const { error: deleteError } = await supabase
      .from("creator_videos")
      .delete()
      .neq("youtube_video_id", "__never_matches__");

    if (deleteError) throw deleteError;

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("creator_videos").insert(rows);
      if (insertError) throw insertError;
    }

    // Grava (upsert por dia) o view_count atual de CADA vídeo do canal —
    // inclusive os antigos, sem hashtag, fora da janela de 28 dias etc.
    // É esse histórico dia-a-dia que permite calcular "views do período"
    // como um delta real (visualizações recebidas nos últimos 28 dias),
    // igual o YouTube Analytics faz, em vez de aproximar isso pela data de
    // publicação do vídeo (que ignora vídeo antigo ainda recebendo views).
    // onConflict em (youtube_video_id, captured_date) faz apenas 1 registro
    // por vídeo por dia, mesmo rodando o sync várias vezes no mesmo dia.
    const historyRows = channelVideos.map((video) => ({
      youtube_video_id: video.id,
      view_count: video.viewCount,
      is_short: isShortVideo(video.durationSeconds),
      published_at: video.publishedAt,
      captured_at: now,
    }));

    const { error: historyError } = await supabase
      .from("creator_video_view_history")
      .upsert(historyRows, { onConflict: "youtube_video_id,captured_date" });

    if (historyError) {
      // Não derruba o sync por causa disso — só loga. Sem o histórico de
      // hoje, o cálculo do período só fica um pouco menos preciso (vai se
      // corrigir sozinho no próximo sync que funcionar).
      console.error("⚠️ Não consegui gravar o histórico diário de views:", historyError);
    }

    // Grava um retrato da receita de cada criador nesse instante — é isso
    // que alimenta o gráfico de linha (histórico) da aba Ganhos. Só INSERT,
    // nunca apaga o que já tinha, diferente da `creator_videos` acima.
    try {
      const earnings = await getCreatorEarnings();
      const snapshotRows = earnings.creators.map((stats) => ({
        creator: stats.key,
        captured_at: now,
        total_views: stats.totalViews,
        total_earnings: stats.totalEarnings,
        shorts_views: stats.shortsViews,
        shorts_earnings: stats.shortsEarnings,
        long_views: stats.longViews,
        long_earnings: stats.longEarnings,
      }));
      if (snapshotRows.length > 0) {
        const { error: snapshotError } = await supabase
          .from("creator_earnings_snapshots")
          .insert(snapshotRows);
        if (snapshotError) {
          console.error("⚠️ Não consegui gravar o snapshot de histórico:", snapshotError);
        }
      }
    } catch (snapshotErr) {
      // Não deixa a sincronização falhar por causa do histórico — só loga.
      console.error("⚠️ Erro ao gravar histórico de receita:", snapshotErr);
    }

    const perCreatorCount = CREATORS.map(({ key, label }) => ({
      creator: label,
      videos: rows.filter((r) => r.creator === key).length,
    }));

    const matchedCount = rows.filter((r) => r.creator !== "").length;

    return NextResponse.json({
      success: true,
      synced_at: now,
      channel_videos_scanned: channelVideos.length,
      matched_videos: matchedCount,
      per_creator: perCreatorCount,
    });
  } catch (error: any) {
    console.error("❌ Erro ao sincronizar ganhos:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno" },
      { status: 500 }
    );
  }
}

// Também aceita GET, pra facilitar testar/agendar via cron se quiser.
export async function GET() {
  return POST();
}
