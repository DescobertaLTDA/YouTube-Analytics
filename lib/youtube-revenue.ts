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

// Falha passageira (rate limit, hiccup momentâneo da API do Google) não
// pode virar "esse vídeo não tem receita real hoje" — isso é exatamente o
// tipo de coisa que fazia o número trocar sozinho na tela (uma chamada
// falha, cai pra estimativa; a próxima carga da página a chamada funciona,
// volta pro valor real). Por isso cada vídeo tenta até MAX_ATTEMPTS vezes
// antes de desistir e deixar a função de cima cair pra estimativa por RPM.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// Só vale a pena tentar de novo erro que é claramente passageiro. 401/403
// (token inválido/sem permissão) e 400 (request malformada) não se
// resolvem tentando de novo — só 429 (rate limit) e 5xx (erro do lado do
// Google) costumam ser transitórios.
function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true; // erro de rede/timeout — tenta de novo
  return status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
// Busca a receita OFICIAL do CANAL INTEIRO (sem filtro de vídeo) num
// intervalo — o mesmo número que aparece em "Seus ganhos" no YouTube
// Studio. Serve pra comparar contra a soma da receita só dos vídeos que o
// painel rastreia (creator_videos) e descobrir se a diferença é "cauda"
// (vídeos publicados no canal que nunca entraram na varredura por
// hashtag/cadastro manual, então nunca aparecem em nenhum dos 3 cards de
// criador nem no card "sem criador" — esse card só cobre vídeos já
// rastreados sem hashtag reconhecida).
//
// Mesmas ressalvas de atraso/ajuste retroativo do getDailyVideoRevenue.
// Retorna `null` quando o OAuth não está configurado.
export async function getChannelRevenueTotal(
  startDate: string,
  endDate: string
): Promise<{ estimatedRevenue: number; views: number } | null> {
  const accessToken = await getYoutubeAccessToken();
  if (!accessToken) return null;

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "estimatedRevenue,views",
    currency: "BRL",
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        const canRetry = isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS;
        console.error(
          `❌ Erro ao buscar receita total do canal na YouTube Analytics API` +
            (canRetry ? ` (tentativa ${attempt}/${MAX_ATTEMPTS}, vai tentar de novo):` : ":"),
          text
        );
        if (canRetry) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        return null;
      }

      const data = (await response.json()) as { rows?: [number, number][] };
      const [row] = data.rows || [];
      if (!row) return { estimatedRevenue: 0, views: 0 };

      const [estimatedRevenue, views] = row;
      return { estimatedRevenue: Number(estimatedRevenue) || 0, views: Number(views) || 0 };
    } catch (error) {
      const canRetry = attempt < MAX_ATTEMPTS;
      console.error(
        `❌ Erro ao buscar receita total do canal na YouTube Analytics API` +
          (canRetry ? ` (tentativa ${attempt}/${MAX_ATTEMPTS}, vai tentar de novo):` : ":"),
        error
      );
      if (canRetry) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      return null;
    }
  }

  return null;
}

export async function getDailyVideoRevenue(
  startDate: string,
  endDate: string,
  videoIds: string[],
  // Callback opcional pra quem chamar (ex: rota de backfill) conseguir
  // expor a causa real de uma falha por vídeo na resposta HTTP, sem
  // depender de olhar os logs da função na Vercel.
  onError?: (videoId: string, status: number | null, message: string) => void
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
      // Sem esse parâmetro, a API devolve estimatedRevenue em USD por
      // padrão (documentado em developers.google.com/youtube/analytics/metrics)
      // — e o resto do app trata esse número como se já fosse R$ (formata
      // com formatCurrency/símbolo R$). Sem essa conversão, todo RPM/receita
      // vindo da API real ficava ~5x mais baixo que o valor de fato em
      // reais (ex: RPM Shorts aparecendo R$0,06 em vez de ~R$0,31 já
      // convertido, quase idêntico ao RPM fixo estimado de R$0,32 — a
      // pista que confirmou o bug).
      currency: "BRL",
    });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          // Dado de receita muda pouco de um request pro outro no mesmo dia,
          // mas não custa nada garantir que não fica em cache do Next.
          cache: "no-store",
        });

        if (!response.ok) {
          const text = await response.text();
          const canRetry = isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS;
          console.error(
            `❌ Erro ao buscar receita real do vídeo ${videoId} na YouTube Analytics API` +
              (canRetry ? ` (tentativa ${attempt}/${MAX_ATTEMPTS}, vai tentar de novo):` : ":"),
            text
          );
          if (canRetry) {
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          onError?.(videoId, response.status, text);
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
        return;
      } catch (error) {
        const canRetry = attempt < MAX_ATTEMPTS;
        console.error(
          `❌ Erro ao buscar receita real do vídeo ${videoId} na YouTube Analytics API` +
            (canRetry ? ` (tentativa ${attempt}/${MAX_ATTEMPTS}, vai tentar de novo):` : ":"),
          error
        );
        if (canRetry) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        onError?.(videoId, null, String(error));
        return;
      }
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
