import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { 
  fetchMultipleYouTubeVideos, 
  detectChanges, 
  analyzeViewImpact 
} from "@/lib/youtube-api";

export const dynamic = 'force-dynamic';

// ✅ GET - Sincronizar vídeos
export async function GET(req: NextRequest) {
  try {
    // Verifica se tem a chave secreta (para segurança)
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && token !== cronSecret && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    // 1. Busca todos os vídeos cadastrados
    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select("id, youtube_video_id, channel_label")
      .order("published_at", { ascending: true });

    if (videosError) throw videosError;

    if (!videos || videos.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "Nenhum vídeo cadastrado para sincronizar" 
      });
    }

    console.log(`📹 Sincronizando ${videos.length} vídeos...`);

    // 2. Busca dados atualizados do YouTube
    const videoIds = videos.map(v => v.youtube_video_id);
    const youtubeData = await fetchMultipleYouTubeVideos(videoIds);

    if (youtubeData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: "Nenhum dado retornado da API do YouTube" 
      });
    }

    console.log(`✅ ${youtubeData.length} vídeos encontrados no YouTube`);

    const results = [];
    const changesDetected = [];

    // 3. Para cada vídeo, processa os dados
    for (const video of videos) {
      const currentData = youtubeData.find(y => y.id === video.youtube_video_id);
      if (!currentData) continue;

      // Busca o último snapshot
      const { data: snapshots } = await supabase
        .from("video_snapshots")
        .select("*")
        .eq("video_id", video.id)
        .order("captured_at", { ascending: false })
        .limit(1);

      const previousSnapshot = snapshots?.[0] || null;

      // 4. Detecta mudanças
      const changes = detectChanges(previousSnapshot, currentData);
      
      // 5. Calcula impacto nas views
      let impact = null;
      if (previousSnapshot && previousSnapshot.view_count !== null) {
        const daysSince = previousSnapshot.captured_at 
          ? (new Date().getTime() - new Date(previousSnapshot.captured_at).getTime()) / (1000 * 60 * 60 * 24)
          : 1;
        
        impact = analyzeViewImpact(
          changes,
          previousSnapshot.view_count,
          currentData.viewCount,
          Math.max(daysSince, 1)
        );
      }

      // 6. Salva o novo snapshot
      const { data: newSnapshot, error: insertError } = await supabase
        .from("video_snapshots")
        .insert({
          video_id: video.id,
          captured_at: new Date().toISOString(),
          title: currentData.title,
          description: currentData.description,
          thumbnail_url: currentData.thumbnailUrl,
          view_count: currentData.viewCount,
          like_count: currentData.likeCount,
          comment_count: currentData.commentCount,
          duration_seconds: currentData.durationSeconds,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`❌ Erro ao salvar snapshot para ${video.youtube_video_id}:`, insertError);
        continue;
      }

      // 7. Se houve mudanças, registra no change_log
      if (changes.length > 0) {
        for (const change of changes) {
          const { error: changeError } = await supabase
            .from("change_log")
            .insert({
              video_id: video.id,
              changed_field: change.field,
              old_value: change.oldValue,
              new_value: change.newValue,
              detected_at: new Date().toISOString(),
            });

          if (changeError) {
            console.error(`❌ Erro ao registrar mudança:`, changeError);
          }
        }

        changesDetected.push({
          video_id: video.youtube_video_id,
          video_title: video.channel_label,
          changes: changes,
          impact: impact,
        });
      }

      results.push({
        video_id: video.youtube_video_id,
        title: currentData.title,
        views: currentData.viewCount,
        has_changes: changes.length > 0,
        changes: changes,
        impact: impact,
      });
    }

    return NextResponse.json({
      success: true,
      synced_at: new Date().toISOString(),
      total_videos: videos.length,
      synced: results.length,
      changes_detected: changesDetected.length,
      results: results,
      changes_detailed: changesDetected,
    });
  } catch (error: any) {
    console.error("❌ Erro na sincronização:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno" },
      { status: 500 }
    );
  }
}

// ✅ POST - Também executa a sincronização
export async function POST(req: NextRequest) {
  return GET(req);
}
