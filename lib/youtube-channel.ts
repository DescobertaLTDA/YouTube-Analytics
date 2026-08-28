// Funções pra varrer TODOS os uploads de um canal do YouTube — usado pela
// aba "Ganhos" pra achar automaticamente os vídeos com #lucas, #matheus e
// #rafael, e também pela sincronização da aba Vídeos/Shorts pra saber a
// duração de cada vídeo cadastrado.

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

// Canal padrão (pode ser sobrescrito por env var sem precisar mexer no código).
export const DEFAULT_CHANNEL_ID = "UCJWArKWSlKLzTOekfIHxOHw";

export function getChannelId(): string {
  return process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID;
}

export interface ChannelVideoRaw {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  viewCount: number;
  durationSeconds: number;
  publishedAt: string;
}

/**
 * Converte duração ISO 8601 (ex: "PT4M13S", "PT58S", "PT1H2M3S") em segundos.
 */
export function parseIsoDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Regra atual do YouTube (2024+): Shorts têm até 3 minutos.
export const SHORT_MAX_SECONDS = 180;

export function isShortVideo(durationSeconds: number | null | undefined): boolean {
  return durationSeconds != null && durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;
}

/**
 * Busca o ID da playlist "uploads" do canal — é a forma mais barata (em
 * cota da API) de listar todo o histórico de vídeos de um canal, melhor do
 * que usar search.list.
 */
export async function getUploadsPlaylistId(channelId: string = getChannelId()): Promise<string | null> {
  const url = `${YOUTUBE_API_URL}/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`❌ Erro ao buscar canal ${channelId}: ${response.status}`);
    return null;
  }
  const data = await response.json();
  const uploadsId = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  return uploadsId || null;
}

/**
 * Lista os IDs de TODOS os vídeos de uma playlist (paginando até o fim).
 * Limite de segurança de 4000 vídeos (80 páginas) pra nunca entrar num
 * loop infinito por engano.
 */
export async function getAllPlaylistVideoIds(playlistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined = undefined;
  let pages = 0;
  const MAX_PAGES = 80;

  do {
    const url = `${YOUTUBE_API_URL}/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${
      pageToken ? `&pageToken=${pageToken}` : ""
    }`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ Erro ao listar playlist ${playlistId}: ${response.status}`);
      break;
    }
    const data = await response.json();
    for (const item of data.items || []) {
      const videoId = item?.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  return ids;
}

/**
 * Busca snippet + estatísticas + duração de uma lista de vídeos (em lotes
 * de 50, limite da API).
 */
export async function fetchChannelVideosDetails(videoIds: string[]): Promise<ChannelVideoRaw[]> {
  if (videoIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const results: ChannelVideoRaw[] = [];

  for (const chunk of chunks) {
    const ids = chunk.join(",");
    const url = `${YOUTUBE_API_URL}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ Erro ao buscar lote de vídeos do canal: ${response.status}`);
      continue;
    }
    const data = await response.json();
    for (const item of data.items || []) {
      results.push({
        id: item.id,
        title: item.snippet?.title || "",
        description: item.snippet?.description || "",
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || "",
        viewCount: parseInt(item.statistics?.viewCount) || 0,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        publishedAt: item.snippet?.publishedAt,
      });
    }
  }

  return results;
}

/**
 * Varre o canal inteiro e retorna todos os vídeos com detalhes completos
 * (snippet, views, duração). Usada pela aba Ganhos pra depois filtrar por
 * hashtag.
 */
export async function fetchAllChannelVideos(
  channelId: string = getChannelId()
): Promise<ChannelVideoRaw[]> {
  const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
  if (!uploadsPlaylistId) return [];

  const videoIds = await getAllPlaylistVideoIds(uploadsPlaylistId);
  if (videoIds.length === 0) return [];

  return fetchChannelVideosDetails(videoIds);
}
