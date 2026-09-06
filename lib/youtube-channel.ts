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
  likeCount: number;
  commentCount: number;
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
 * Busca nome e avatar (thumbnail) do canal — usado no menu lateral do site.
 * Cacheado por 24h (o avatar quase nunca muda) pra não gastar cota da API
 * a cada carregamento de página.
 */
export interface ChannelInfo {
  title: string;
  avatarUrl: string | null;
}

export async function getChannelInfo(channelId: string = getChannelId()): Promise<ChannelInfo | null> {
  const url = `${YOUTUBE_API_URL}/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url, { next: { revalidate: 86400 } });
  if (!response.ok) {
    console.error(`❌ Erro ao buscar info do canal ${channelId}: ${response.status}`);
    return null;
  }
  const data = await response.json();
  const snippet = data?.items?.[0]?.snippet;
  if (!snippet) return null;

  return {
    title: snippet.title || "",
    avatarUrl:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      null,
  };
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
    const url: string = `${YOUTUBE_API_URL}/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${
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
        likeCount: parseInt(item.statistics?.likeCount) || 0,
        commentCount: parseInt(item.statistics?.commentCount) || 0,
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

/**
 * Busca só os N vídeos MAIS RECENTES de um canal (uma única página da
 * playlist de uploads, que a API já devolve do mais novo pro mais
 * antigo) — usado no rastreamento de VPH de canais de terceiros, onde
 * não faz sentido (nem cabe na cota) varrer o histórico inteiro toda
 * vez que a lista é recarregada.
 */
export async function fetchRecentChannelVideos(
  channelId: string,
  limit = 10
): Promise<ChannelVideoRaw[]> {
  const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
  if (!uploadsPlaylistId) return [];

  const url = `${YOUTUBE_API_URL}/playlistItems?part=contentDetails&maxResults=${Math.min(
    Math.max(limit, 1),
    50
  )}&playlistId=${uploadsPlaylistId}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`❌ Erro ao listar uploads recentes de ${channelId}: ${response.status}`);
    return [];
  }
  const data = await response.json();
  const videoIds: string[] = (data.items || [])
    .map((item: { contentDetails?: { videoId?: string } }) => item?.contentDetails?.videoId)
    .filter((id: string | undefined): id is string => Boolean(id));

  if (videoIds.length === 0) return [];
  return fetchChannelVideosDetails(videoIds);
}

export type ResolvedChannel = {
  channelId: string;
  title: string;
  avatarUrl: string | null;
};

function snippetToResolved(item: {
  id?: string;
  snippet?: { title?: string; channelId?: string; thumbnails?: { high?: { url?: string }; default?: { url?: string } } };
}): ResolvedChannel | null {
  const channelId = item.id || item.snippet?.channelId;
  if (!channelId) return null;
  return {
    channelId,
    title: item.snippet?.title || "",
    avatarUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
  };
}

/**
 * Resolve um canal de terceiro a partir do que a pessoa colar no campo
 * de "adicionar canal": URL completa (/channel/UC..., /@handle,
 * /c/Nome, /user/Nome), um @handle solto, um ID de canal (UC...) direto,
 * ou (último recurso) só o nome do canal digitado à mão.
 *
 * Sempre tenta os caminhos baratos em cota da API primeiro (1 unidade):
 * ID direto -> channels?id=..., handle -> channels?forHandle=..., nome
 * de usuário legado -> channels?forUsername=... . Só cai pra
 * search.list (100 unidades) quando nada acima resolveu, porque é o
 * único jeito de achar um canal só pelo nome digitado.
 */
export async function resolveChannelId(input: string): Promise<ResolvedChannel | null> {
  const raw = input.trim();
  if (!raw) return null;

  let channelId: string | null = null;
  let handle: string | null = null;
  let legacyUsername: string | null = null;

  if (/^UC[\w-]{22}$/.test(raw)) {
    channelId = raw;
  } else {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://youtube.com/${raw.replace(/^\/+/, "")}`);
      const path = url.pathname;
      const channelMatch = path.match(/\/channel\/(UC[\w-]{22})/);
      const handleMatch = path.match(/\/@([\w.-]+)/);
      const legacyMatch = path.match(/\/(?:c|user)\/([\w.-]+)/);
      if (channelMatch) channelId = channelMatch[1];
      else if (handleMatch) handle = `@${handleMatch[1]}`;
      else if (legacyMatch) legacyUsername = legacyMatch[1];
    } catch {
      if (raw.startsWith("@")) handle = raw;
    }
  }

  if (channelId) {
    const url = `${YOUTUBE_API_URL}/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const resolved = snippetToResolved(data?.items?.[0] || {});
      if (resolved) return resolved;
    }
  }

  if (handle) {
    const url = `${YOUTUBE_API_URL}/channels?part=snippet&forHandle=${encodeURIComponent(
      handle
    )}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const resolved = snippetToResolved(data?.items?.[0] || {});
      if (resolved) return resolved;
    }
  }

  if (legacyUsername) {
    const url = `${YOUTUBE_API_URL}/channels?part=snippet&forUsername=${encodeURIComponent(
      legacyUsername
    )}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const resolved = snippetToResolved(data?.items?.[0] || {});
      if (resolved) return resolved;
    }
  }

  // Fallback caro: busca por texto (nome do canal digitado sem @ nem
  // URL). Só chega aqui se nenhum dos caminhos baratos acima resolveu.
  const searchUrl = `${YOUTUBE_API_URL}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(
    raw
  )}&key=${YOUTUBE_API_KEY}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  return snippetToResolved(searchData?.items?.[0] || {});
}
