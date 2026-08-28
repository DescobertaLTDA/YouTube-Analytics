import { supabase, VideoRow, SnapshotRow } from "./supabase";
import { parseIsoDuration } from "./youtube-channel";

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
  durationSeconds: number;
}

export interface Change {
  field: string;
  oldValue: string | null;
  newValue: string;
}

export interface ViewImpact {
  field: string;
  viewsBefore: number;
  viewsAfter: number;
  growth: number;
  impact: string;
}

export interface ViewImpactDetailed {
  field: string;
  viewsBefore: number;
  viewsAfter: number;
  growth: number;
  growthPerDay: number;
  trend: string;
  impact: string;
  recommendation: string;
}

/**
 * Busca dados de um vídeo específico no YouTube
 */
export async function fetchYouTubeVideo(videoId: string): Promise<YouTubeVideoData | null> {
  try {
    const url = `${YOUTUBE_API_URL}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    
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
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
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
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const results: YouTubeVideoData[] = [];
  
  for (const chunk of chunks) {
    try {
      const ids = chunk.join(",");
      const url = `${YOUTUBE_API_URL}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`;
      
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
            durationSeconds: parseIsoDuration(item.contentDetails?.duration),
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
): Change[] {
  const changes: Change[] = [];

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
  changes: Change[],
  previousViews: number | null,
  currentViews: number,
  daysSinceLastSnapshot: number
): ViewImpact[] {
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

/**
 * Analisa o impacto da mudança nas views com mais detalhes
 * Inclui recomendações baseadas no tipo de mudança e tendência
 */
export function analyzeViewImpactDetailed(
  changes: Change[],
  previousViews: number | null,
  currentViews: number,
  daysSinceLastSnapshot: number,
  previousSnapshots: { view_count: number; captured_at: string }[] = []
): ViewImpactDetailed[] {
  if (!previousViews) return [];

  const viewGrowth = currentViews - previousViews;
  const growthPerDay = daysSinceLastSnapshot > 0 ? viewGrowth / daysSinceLastSnapshot : viewGrowth;

  // Calcula média de crescimento antes da mudança (últimos 7 dias)
  let previousAverageGrowth = 0;
  if (previousSnapshots.length >= 2) {
    const sorted = [...previousSnapshots].sort((a, b) => 
      new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
    const recent = sorted.slice(-7); // últimos 7 snapshots
    
    if (recent.length >= 2) {
      const oldestViews = recent[0].view_count;
      const newestViews = recent[recent.length - 1].view_count;
      const days = (new Date(recent[recent.length - 1].captured_at).getTime() - 
                    new Date(recent[0].captured_at).getTime()) / (1000 * 60 * 60 * 24);
      previousAverageGrowth = days > 0 ? (newestViews - oldestViews) / days : 0;
    }
  }

  return changes.map((change) => {
    let trend = "mantido";
    let impact = "neutro ➡️";
    let recommendation = "Manter estratégia atual";

    // Compara crescimento atual com a média anterior
    if (growthPerDay > previousAverageGrowth * 1.2) {
      trend = "melhorou 🚀";
      impact = "positivo 📈";
      recommendation = `A mudança no ${change.field} trouxe um aumento de views! Considere replicar essa estratégia.`;
    } else if (growthPerDay < previousAverageGrowth * 0.8) {
      trend = "piorou 📉";
      impact = "negativo 📉";
      recommendation = `A mudança no ${change.field} pode ter afetado negativamente as views. Considere reverter ou testar uma nova abordagem.`;
    } else {
      recommendation = `A mudança no ${change.field} não teve impacto significativo nas views.`;
    }

    // Recomendações específicas por campo
    if (change.field === "thumbnail_url") {
      if (trend === "melhorou 🚀") {
        recommendation = "🖼️ A nova thumbnail está performando bem! Continue testando variações que destacam cores e faces.";
      } else if (trend === "piorou 📉") {
        recommendation = "🖼️ A nova thumbnail pode estar confundindo os espectadores. Tente algo mais simples ou com mais contraste.";
      } else {
        recommendation = "🖼️ A mudança na thumbnail não teve impacto significativo. Teste variações com mais contraste ou elementos emocionais.";
      }
    } else if (change.field === "title") {
      if (trend === "melhorou 🚀") {
        recommendation = "📝 O novo título está atraindo mais cliques! Use palavras-chave e gatilhos de curiosidade.";
      } else if (trend === "piorou 📉") {
        recommendation = "📝 O título pode estar muito longo ou não ter um gancho forte. Tente algo mais direto e com promessa de valor.";
      } else {
        recommendation = "📝 O título não teve impacto significativo. Considere testar títulos com números, perguntas ou curiosidades.";
      }
    } else if (change.field === "description") {
      if (trend === "melhorou 🚀") {
        recommendation = "📄 A nova descrição está engajando mais! Continue usando palavras-chave e chamadas para ação.";
      } else if (trend === "piorou 📉") {
        recommendation = "📄 A descrição pode estar muito longa ou confusa. Mantenha concisa e com links relevantes.";
      } else {
        recommendation = "📄 A descrição não teve impacto significativo. Adicione links, hashtags e uma chamada para ação clara.";
      }
    }

    return {
      field: change.field,
      viewsBefore: previousViews,
      viewsAfter: currentViews,
      growth: viewGrowth,
      growthPerDay: Math.round(growthPerDay * 100) / 100,
      trend: trend,
      impact: impact,
      recommendation: recommendation,
    };
  });
}

/**
 * Calcula a tendência de views baseado nos snapshots
 */
export function calculateViewTrend(
  snapshots: { view_count: number; captured_at: string }[]
): { trend: 'up' | 'down' | 'stable'; growthPerDay: number; days: number } {
  if (snapshots.length < 2) {
    return { trend: 'stable', growthPerDay: 0, days: 0 };
  }

  const sorted = [...snapshots].sort((a, b) => 
    new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );

  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  const days = (new Date(newest.captured_at).getTime() - new Date(oldest.captured_at).getTime()) / (1000 * 60 * 60 * 24);
  
  if (days === 0) {
    return { trend: 'stable', growthPerDay: 0, days: 0 };
  }

  const growth = (newest.view_count - oldest.view_count) / days;
  const growthPerDay = Math.round(growth * 100) / 100;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (growthPerDay > 10) {
    trend = 'up';
  } else if (growthPerDay < -10) {
    trend = 'down';
  }

  return { trend, growthPerDay, days: Math.round(days) };
}

/**
 * Formata números para exibição
 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

/**
 * Formata moeda para exibição
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/**
 * Formata data para exibição
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { 
    day: "2-digit", 
    month: "short", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

/**
 * Formata data para o gráfico (mais curta)
 */
export function formatChartDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'short'
  });
}

/**
 * Extrai informações do transcript
 */
export function extractTranscriptInfo(roteiro: string): {
  sourceTitle: string | null;
  youtubeVideoId: string | null;
  segmentCount: number;
  durationSeconds: number;
} {
  const lines = roteiro.split('\n');
  let sourceTitle: string | null = null;
  let youtubeVideoId: string | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const content = trimmed.replace(/^#\s*/, '').trim();
      if (content.includes('youtube.com') || content.includes('youtu.be')) {
        const match = content.match(/(?:watch\?v=|watch\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
        if (match) youtubeVideoId = match[1];
      } else if (!content.includes('tactiq.io') && !content.includes('http')) {
        sourceTitle = content;
      }
    }
  }

  // Conta segmentos com timestamp
  const timestampRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
  const timestampLines = lines.filter(line => timestampRegex.test(line.trim()));
  const segmentCount = timestampLines.length;

  // Calcula duração
  let durationSeconds = 0;
  if (timestampLines.length > 0) {
    const lastLine = timestampLines[timestampLines.length - 1];
    const match = lastLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (match) {
      const [_, h, m, s, ms] = match;
      durationSeconds = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
  }

  return {
    sourceTitle,
    youtubeVideoId,
    segmentCount,
    durationSeconds: Math.round(durationSeconds)
  };
}

/**
 * Extrai timestamps do roteiro para exibição
 */
export function extractTimestamps(roteiro: string): { time: string; text: string }[] {
  const lines = roteiro.split('\n');
  const timestampRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(.*)$/;
  const segments: { time: string; text: string }[] = [];
  
  for (const line of lines) {
    const match = line.trim().match(timestampRegex);
    if (match) {
      segments.push({
        time: match[1].slice(0, 8), // Pega só HH:MM:SS
        text: match[2]
      });
    }
  }
  
  return segments;
}

/**
 * Remove cabeçalho do transcript (linhas com #)
 */
export function cleanTranscript(roteiro: string): string {
  const lines = roteiro.split('\n');
  const cleaned = lines.filter(line => !line.trim().startsWith('#'));
  return cleaned.join('\n');
}
