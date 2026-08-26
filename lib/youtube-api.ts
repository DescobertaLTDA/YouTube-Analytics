import { supabase, VideoRow, SnapshotRow } from "./supabase";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

export interface YouTubeVideoData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

/**
 * Busca dados de um vídeo específico no YouTube
 */
export async function fetchYouTubeVideo(videoId: string): Promise<YouTubeVideoData | null> {
  try {
    const url = `${YOUTUBE_API_URL}/videos?part=snippet,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ Erro na API do YouTube: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.error(`❌ Vídeo não encontrado: ${videoId}`);
      return null;
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const statistics = item.statistics;

    return {
      id: item.id,
      title: snippet.title,
      description: snippet.description || "",
      thumbnailUrl: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url || "",
      viewCount: parseInt(statistics.viewCount) || 0,
      likeCount: parseInt(statistics.likeCount) || 0,
      commentCount: parseInt(statistics.commentCount) || 0,
      publishedAt: snippet.publishedAt,
    };
  } catch (error) {
    console.error(`❌ Erro ao buscar vídeo ${videoId}:`, error);
    return null;
  }
}

/**
 * Busca dados de múltiplos vídeos de uma vez (até 50 por vez)
 */
export async function fetchMultipleYouTubeVideos(videoIds: string[]): Promise<YouTubeVideoData[]> {
  if (videoIds.length === 0) return [];
  
  // YouTube API limita a 50 IDs por requisição
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const results: YouTubeVideoData[] = [];
  
  for (const chunk of chunks) {
    try {
      const ids = chunk.join(",");
      const url = `${YOUTUBE_API_URL}/videos?part=snippet,statistics&id=${ids}&key=${YOUTUBE_API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      
      if (data.items) {
        for (const item of data.items) {
          results.push({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description || "",
            thumbnailUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || "",
            viewCount: parseInt(item.statistics.viewCount) || 0,
            likeCount: parseInt(item.statistics.likeCount) || 0,
            commentCount: parseInt(item.statistics.commentCount) || 0,
            publishedAt: item.snippet.publishedAt,
          });
        }
      }
    } catch (error) {
      console.error("❌ Erro ao buscar lote de vídeos:", error);
    }
  }

  return results;
}

/**
 * Detecta mudanças entre dois snapshots
 */
export function detectChanges(
  previous: SnapshotRow | null,
  current: YouTubeVideoData
): { field: string; oldValue: string | null; newValue: string }[] {
  const changes = [];

  if (!previous) {
    // Primeiro snapshot, não há mudanças para detectar
    return changes;
  }

  // Compara título
  if (previous.title !== current.title) {
    changes.push({
      field: "title",
      oldValue: previous.title,
      newValue: current.title,
    });
  }

  // Compara descrição
  if (previous.description !== current.description) {
    changes.push({
      field: "description",
      oldValue: previous.description,
      newValue: current.description,
    });
  }

  // Compara thumbnail
  if (previous.thumbnail_url !== current.thumbnailUrl) {
    changes.push({
      field: "thumbnail_url",
      oldValue: previous.thumbnail_url,
      newValue: current.thumbnailUrl,
    });
  }

  return changes;
}

/**
 * Analisa o impacto da mudança nas views
 */
export function analyzeViewImpact(
  changes: { field: string; oldValue: string | null; newValue: string }[],
  previousViews: number | null,
  currentViews: number,
  daysSinceLastSnapshot: number
): { field: string; viewsBefore: number; viewsAfter: number; growth: number; impact: string }[] {
  if (!previousViews) return [];

  const viewGrowth = currentViews - previousViews;
  const growthPerDay = daysSinceLastSnapshot > 0 ? viewGrowth / daysSinceLastSnapshot : viewGrowth;

  return changes.map((change) => ({
    field: change.field,
    viewsBefore: previousViews,
    viewsAfter: currentViews,
    growth: viewGrowth,
    impact: growthPerDay > 0 ? "positivo 📈" : growthPerDay < 0 ? "negativo 📉" : "neutro ➡️",
  }));
}
