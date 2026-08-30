import { getYoutubeAccessToken } from "./youtube-analytics-auth";

export type DailyVideoRevenue = {
  date: string; // YYYY-MM-DD
  videoId: string;
  estimatedRevenue: number;
  views: number;
};

// Quantas chamadas à API em paralelo — a YouTube Analytics API não aceita
// `video` como dimensão combinada com `day` (só como filtro de UM vídeo
// por vez), então precisamos de uma chamada por vídeo. Um pool pequeno
// evita estourar limite de taxa (rate limit) da API.
const CONCURRENCY = 5;

// Busca a receita OFICIAL (relatório real do YouTube, métrica
// `estimatedRevenue`) por vídeo e por dia, num intervalo — pra usar no
// lugar da estimativa por RPM sempre que já estiver disponível.
//
// Importante: a API do YouTube Analytics NÃO suporta `dimensions=day,video`
// numa única chamada — `video` só existe como filtro de um vídeo por vez
// nos relatórios "Time-based" (ver
// https://developers.google.com/youtube/analytics/channel_reports).
// Por isso fazemos uma chamada por `videoId` recebido, cada uma com
// `dimensions=day` + `filters=video==ID`.
//
// Duas ressalvas importantes:
// - O YouTube costuma liberar esse dado com ~2 dias de atraso, então os
//   dias mais recentes simplesmente não vêm na resposta.
// - Mesmo assim é chamado de "estimatedRevenue" pelo próprio Google — o
//   valor pode ser ajustado retroativamente por até uns 3 meses (fraude
//   de clique detectada depois, disputa de copyright etc.).
//
// Retorna `null` (nunca lança) quando o OAuth ainda não está configurado
// — quem usa isso deve tratar `null` exatamente como "essa fonte não está
// disponível agora, cai pra RPM", pra nunca travar a página de Ganhos por
// causa da integração. Falhas em vídeos individuais são só logadas e
// puladas (não derrubam o restante do resultado).
export async function getDailyVideoRevenue(
  startDate: string,
  endDate: string,
  videoIds: string[]
): Promise<DailyVideoRevenue[] | null> {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) return null;
  if (videoIds.length === 0) return [];

  const results: DailyVideoRevenue[] = [];
  let nextIndex = 0;

  async function fetchOneVideo(videoId: string) {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "estimatedRevenue,views",
      dimensions: "day",
      filters: `video==${videoId}`,
      maxResults: "366",
    });

    try {
      const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        // Dado de receita muda pouco de um request pro outro no mesmo dia,
        // mas não custa nada garantir que não fica em cache do Next.
        cache: "no-store",
      });

      if (!response.ok) {
        console.error(
          `❌ Erro ao buscar receita real do vídeo ${videoId} na YouTube Analytics API:`,
          await response.text()
        );
        return;
      }

      const data = (await response.json()) as { rows?: [string, number, number][] };
      const rows = data.rows || [];

      // Ordem das colunas é a mesma ordem de `dimensions` + `metrics` da
      // request: day, estimatedRevenue, views.
      for (const [date, estimatedRevenue, views] of rows) {
        results.push({
          date,
          videoId,
          estimatedRevenue: Number(estimatedRevenue) || 0,
          views: Number(views) || 0,
        });
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar receita real do vídeo ${videoId} na YouTube Analytics API:`, error);
    }
  }

  async function worker() {
    while (nextIndex < videoIds.length) {
      const videoId = videoIds[nextIndex++];
      await fetchOneVideo(videoId);
    }
  }

  const workerCount = Math.min(CONCURRENCY, videoIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
