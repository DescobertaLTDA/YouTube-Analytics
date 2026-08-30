import { getYoutubeAccessToken } from "./youtube-analytics-auth";

export type DailyVideoRevenue = {
  date: string; // YYYY-MM-DD
  videoId: string;
  estimatedRevenue: number;
  views: number;
};

// Busca a receita OFICIAL (relatório real do YouTube, métrica
// `estimatedRevenue`) por vídeo e por dia, num intervalo — pra usar no
// lugar da estimativa por RPM sempre que já estiver disponível.
//
// Duas ressalvas importantes:
// - O YouTube costuma liberar esse dado com ~2 dias de atraso, então os
//   dias mais recentes simplesmente não vêm na resposta.
// - Mesmo assim é chamado de "estimatedRevenue" pelo próprio Google — o
//   valor pode ser ajustado retroativamente por até uns 3 meses (fraude
//   de clique detectada depois, disputa de copyright etc.).
//
// Retorna `null` (nunca lança) quando o OAuth ainda não está configurado
// ou a chamada falha por qualquer motivo — quem usa isso deve tratar
// `null` exatamente como "essa fonte não está disponível agora, cai pra
// RPM", pra nunca travar a página de Ganhos por causa da integração.
export async function getDailyVideoRevenue(
  startDate: string,
  endDate: string
): Promise<DailyVideoRevenue[] | null> {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) return null;

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "estimatedRevenue,views",
    dimensions: "day,video",
    maxResults: "10000",
  });

  try {
    const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Dado de receita muda pouco de um request pro outro no mesmo dia,
      // mas não custa nada garantir que não fica em cache do Next.
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("❌ Erro ao buscar receita real na YouTube Analytics API:", await response.text());
      return null;
    }

    const data = (await response.json()) as { rows?: [string, string, number, number][] };
    const rows = data.rows || [];

    // Ordem das colunas é a mesma ordem de `dimensions` + `metrics` da
    // request: day, video, estimatedRevenue, views.
    return rows.map(([date, videoId, estimatedRevenue, views]) => ({
      date,
      videoId,
      estimatedRevenue: Number(estimatedRevenue) || 0,
      views: Number(views) || 0,
    }));
  } catch (error) {
    console.error("❌ Erro ao buscar receita real na YouTube Analytics API:", error);
    return null;
  }
}
