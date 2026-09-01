import {
  supabase,
  getServiceSupabase,
  VideoRow,
  SnapshotRow,
  ManualAnalyticsRow,
  ChangeLogRow,
  TranscriptRow,
  TranscriptSegmentRow,
  CreatorVideoRow,
  ManualRevenueRow,
  CreatorEarningsSnapshotRow,
} from "./supabase";
import { isShortVideo } from "./youtube-channel";
import { CREATORS, CreatorKey, SHORTS_RPM, estimateEarnings } from "./creator-earnings";
import { getRealRpmMap, sumEstimatedEarnings } from "./rpm-real";
import { getDailyVideoRevenue } from "./youtube-revenue";
import { getAllOrders, sumPaidAmount } from "./cakto";
import { averageVphByFormat, VphFormat } from "./vph";
import {
  getAllConversions,
  filterByCreator,
  sumPaidCommission,
  countPaidOrders,
  paidSaleDetails,
  type ShopeeSaleDetail,
} from "./shopee";

export type VideoSource = "manual" | "auto";

export type VideoWithStats = {
  video: VideoRow;
  latest: SnapshotRow | null;
  previous: SnapshotRow | null;
  viewsPerDay: number | null;
  daysLive: number | null;
  manual: ManualAnalyticsRow | null;
  revenue: number | null;
  changes: ChangeLogRow[];
  history: SnapshotRow[];
  isShort: boolean;
  // "manual" = cadastrado na tabela `videos` (tem histórico de snapshots,
  // CTR/retenção do Studio, change log). "auto" = achado só pela varredura
  // por hashtag da aba Ganhos (tabela `creator_videos`), sem esse histórico.
  source: VideoSource;
};

export async function getDashboardData(): Promise<VideoWithStats[]> {
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("published_at", { ascending: true });

  if (!videos || videos.length === 0) return [];

  // As 3 consultas de cada vídeo (snapshots, analytics_manual, change_log)
  // não dependem umas das outras, então rodam em paralelo com Promise.all —
  // e todos os vídeos também são processados em paralelo entre si. Isso
  // troca N×3 idas sequenciais ao banco por uma única "onda" de requests,
  // o que é o principal motivo do site demorar pra carregar as páginas.
  const results = await Promise.all(
    (videos as VideoRow[]).map(async (video) => {
      const [{ data: snapshots }, { data: manualRows }, { data: changeRows }] =
        await Promise.all([
          supabase
            .from("video_snapshots")
            .select("*")
            .eq("video_id", video.id)
            .order("captured_at", { ascending: false })
            .limit(30),
          supabase
            .from("analytics_manual")
            .select("*")
            .eq("video_id", video.id)
            .order("report_date", { ascending: false })
            .limit(1),
          supabase
            .from("change_log")
            .select("*")
            .eq("video_id", video.id)
            .order("detected_at", { ascending: false })
            .limit(10),
        ]);

      const history = ((snapshots as SnapshotRow[]) || []).slice().reverse();
      const latest = history.length > 0 ? history[history.length - 1] : null;
      const previous = history.length > 1 ? history[history.length - 2] : null;

      let viewsPerDay: number | null = null;
      let daysLive: number | null = null;

      if (video.published_at && latest?.view_count != null) {
        const published = new Date(video.published_at).getTime();
        const now = new Date(latest.captured_at).getTime();
        const days = Math.max((now - published) / (1000 * 60 * 60 * 24), 1);
        daysLive = Math.round(days * 10) / 10;
        viewsPerDay = Math.round((latest.view_count / days) * 10) / 10;
      }

      const manual = (manualRows && manualRows[0]) || null;

      // Receita estimada = (views totais / 1000) × RPM informado manualmente
      const revenue =
        manual?.rpm != null && latest?.view_count != null
          ? Math.round(((latest.view_count / 1000) * manual.rpm) * 100) / 100
          : null;

      return {
        video,
        latest,
        previous,
        viewsPerDay,
        daysLive,
        manual,
        revenue,
        changes: (changeRows as ChangeLogRow[]) || [],
        history,
        isShort: isShortVideo(latest?.duration_seconds),
        source: "manual" as const,
      };
    })
  );

  return results;
}

// Vídeos que existem em `creator_videos` (achados pela varredura por
// hashtag da aba Ganhos) mas nunca foram cadastrados manualmente na tabela
// `videos`. Cada um vira um VideoWithStats "leve": sem histórico de
// snapshots, CTR/retenção do Studio ou change log — só o snapshot mais
// recente da última sincronização de Ganhos. A receita usa a mesma fórmula
// (RPM fixo) da aba Ganhos, pra ficar consistente.
async function getAutoDiscoveredRows(): Promise<VideoWithStats[]> {
  const db = getServiceSupabase();
  const { data, error } = await db.from("creator_videos").select("*");

  if (error) {
    console.error("❌ Erro ao ler creator_videos p/ Vídeos/Shorts:", error);
    return [];
  }

  const rows = (data as CreatorVideoRow[]) || [];
  const realRpmMap = await getRealRpmMap();

  // Um vídeo pode ter mais de uma hashtag (ex: colab #lucas + #matheus) —
  // agrupa por youtube_video_id pra não listar o mesmo vídeo duas vezes.
  const byVideoId = new Map<string, CreatorVideoRow[]>();
  for (const row of rows) {
    const list = byVideoId.get(row.youtube_video_id) || [];
    list.push(row);
    byVideoId.set(row.youtube_video_id, list);
  }

  const results: VideoWithStats[] = [];

  for (const [youtubeVideoId, group] of byVideoId) {
    // Vídeos sem hashtag (creator: "") entram em creator_videos só pra
    // contar nas views totais do período da aba Ganhos — não devem
    // aparecer automaticamente aqui em Vídeos/Shorts.
    const taggedGroup = group.filter((r) => r.creator !== "");
    if (taggedGroup.length === 0) continue;

    const first = taggedGroup[0];
    const creatorLabel = taggedGroup
      .map((r) => CREATORS.find((c) => c.key === r.creator)?.label || r.creator)
      .join(" + ");

    let viewsPerDay: number | null = null;
    let daysLive: number | null = null;
    if (first.published_at) {
      const published = new Date(first.published_at).getTime();
      const now = new Date(first.synced_at).getTime();
      const days = Math.max((now - published) / (1000 * 60 * 60 * 24), 1);
      daysLive = Math.round(days * 10) / 10;
      viewsPerDay = Math.round((first.view_count / days) * 10) / 10;
    }

    const syntheticId = `auto-${youtubeVideoId}`;
    const fakeSnapshot: SnapshotRow = {
      id: syntheticId,
      video_id: syntheticId,
      captured_at: first.synced_at,
      title: first.title,
      description: null,
      thumbnail_url: first.thumbnail_url,
      view_count: first.view_count,
      like_count: null,
      comment_count: null,
      duration_seconds: first.duration_seconds,
    };

    results.push({
      video: {
        id: syntheticId,
        youtube_video_id: youtubeVideoId,
        channel_label: creatorLabel,
        published_at: first.published_at,
      },
      latest: fakeSnapshot,
      previous: null,
      viewsPerDay,
      daysLive,
      manual: null,
      revenue: estimateEarnings(
        first.view_count,
        first.is_short,
        realRpmMap.get(youtubeVideoId)?.rpm
      ),
      changes: [],
      history: [fakeSnapshot],
      isShort: first.is_short,
      source: "auto" as const,
    });
  }

  return results;
}

// Usada pelas abas Vídeos e Shorts: junta os vídeos cadastrados manualmente
// (`videos`, com histórico completo) com os achados automaticamente pela
// varredura de hashtag da aba Ganhos (`creator_videos`) que ainda não foram
// cadastrados manualmente — sem duplicar quando o mesmo vídeo está nos dois
// lugares (o cadastro manual, mais completo, sempre vence).
export async function getAllVideoRows(): Promise<VideoWithStats[]> {
  const [manualRows, autoRows] = await Promise.all([
    getDashboardData(),
    getAutoDiscoveredRows(),
  ]);

  const manualYoutubeIds = new Set(manualRows.map((r) => r.video.youtube_video_id));
  const autoOnly = autoRows.filter((r) => !manualYoutubeIds.has(r.video.youtube_video_id));

  return [...manualRows, ...autoOnly].sort((a, b) => {
    const aTime = a.video.published_at ? new Date(a.video.published_at).getTime() : 0;
    const bTime = b.video.published_at ? new Date(b.video.published_at).getTime() : 0;
    return aTime - bTime;
  });
}

export type TranscriptWithSegments = {
  transcript: TranscriptRow;
  segments: TranscriptSegmentRow[];
};

// Lista os transcripts arquivados, cada um com sua minutagem (segments) já
// ordenada por timestamp — usado na página /transcripts.
export async function getTranscripts(): Promise<TranscriptWithSegments[]> {
  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (!transcripts || transcripts.length === 0) return [];

  const results: TranscriptWithSegments[] = [];

  for (const transcript of transcripts as TranscriptRow[]) {
    const { data: segments } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("transcript_id", transcript.id)
      .order("timestamp_seconds", { ascending: true });

    results.push({ transcript, segments: (segments as TranscriptSegmentRow[]) || [] });
  }

  return results;
}

// Lista simplificada de vídeos pra popular o <select> do formulário de
// importação (vincular a transcrição a um vídeo já cadastrado é opcional).
export async function getVideoOptions(): Promise<Pick<VideoRow, "id" | "channel_label" | "youtube_video_id">[]> {
  const { data } = await supabase
    .from("videos")
    .select("id, channel_label, youtube_video_id")
    .order("published_at", { ascending: true });

  return data || [];
}

export type CreatorStats = {
  key: CreatorKey;
  label: string;
  hashtag: string;
  shortsViews: number;
  shortsCount: number;
  shortsEarnings: number;
  longViews: number;
  longCount: number;
  longEarnings: number;
  totalViews: number;
  totalEarnings: number;
  viewsSharePct: number; // % das views totais do período que são desse criador
  rpm: number;
  // Ganhos estimados do dia 01 do mês atual até hoje (sempre por RPM — o
  // valor real digitado manualmente é escopado aos últimos 28 dias, não
  // dá pra ratear ele num range de mês diferente).
  monthViews: number;
  monthEarnings: number;
  // Quantidade de vídeos publicados pelo criador dentro da janela de 28
  // dias (soma de shortsCount + longCount, exposto separado por
  // conveniência pro card).
  periodCount: number;
  // Quantidade de vídeos publicados do dia 01 do mês atual até hoje.
  monthCount: number;
  monthShortsCount: number;
  // Breakdown do mês por formato — usado no drawer "Ver metas".
  monthLongCount: number;
  monthShortsViews: number;
  monthLongViews: number;
  monthShortsEarnings: number;
  monthLongEarnings: number;
  // Vendas reais na Cakto nos últimos 28 dias, identificadas por
  // utm_campaign=<key> (ex: utm_campaign=lucas). null quando a API da Cakto
  // não está configurada ou a chamada falhou — nesse caso o card mostra "—"
  // em vez de quebrar a página inteira.
  caktoOrders: number | null;
  caktoAmount: number | null;
  // Vendas reais na Shopee nos últimos 28 dias, identificadas por
  // sub_id=<key> (ex: sub_id=lucas). null quando a API da Shopee não está
  // configurada ou a chamada falhou — nesse caso o card mostra "—" em vez
  // de quebrar a página inteira.
  shopeeOrders: number | null;
  shopeeAmount: number | null;
  // Detalhe de cada venda paga (produto, loja, comissão, data do clique e
  // da compra) — pra dar pra ver no dashboard quais compras compõem o
  // total, mesmo quando o produto é diferente do que foi divulgado
  // (compra dentro da janela do cookie de atribuição).
  shopeeSales: ShopeeSaleDetail[] | null;
};

export type GanhosVideoRow = {
  youtubeVideoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  creatorLabel: string;
  isShort: boolean;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  revenue: number;
};

export type GanhosData = {
  creators: CreatorStats[];
  lastSyncedAt: string | null;
  totalVideosScanned: number;
  // Janela de 28 dias usada no cálculo. periodViews/periodEarnings somam
  // as views GANHAS nessa janela por todo vídeo do canal (via delta no
  // histórico diário em creator_video_view_history), não só as views
  // totais dos vídeos publicados dentro dela.
  periodStart: string;
  periodEnd: string;
  periodViews: number;
  periodEarnings: number;
  // true quando periodEarnings veio do valor real digitado manualmente,
  // false quando é estimativa por RPM.
  isManualRevenue: boolean;
  manualRevenueAmount: number | null;
  // Quantos vídeos publicados no período (28d) não têm nenhuma hashtag de
  // criador (#lucas / #matheus / #rafael) — contam nas views totais do
  // canal mas não em nenhum card de criador.
  noHashtagCount: number;
  // Detalhe dos vídeos sem hashtag do período (mesmos que compõem
  // noHashtagCount) — alimenta o modal que abre ao clicar nos cards
  // "Vídeos sem criador" / "Saldo sem criador".
  noHashtagVideos: GanhosVideoRow[];
  // Um vídeo por linha (dedupe de colabs com 2+ hashtags), mais recente
  // primeiro — alimenta o histórico paginado da aba Ganhos.
  periodVideos: GanhosVideoRow[];
  // Top 10 vídeos publicados do dia 01 do mês atual até hoje, ordenados
  // pela maior receita estimada (RPM) — alimenta o card de destaque
  // "Top 10 do mês" da aba Ganhos.
  topVideosMonth: GanhosVideoRow[];
  // Média de VPH de Shorts e de vídeo longo calculada sobre TODO o
  // histórico do canal (não só o período de 28 dias ou o Top 10 do mês) —
  // usada como referência única do selo "Nx acima da média" tanto no
  // Histórico de Vídeos quanto no Top 10 do Mês, pra um mesmo vídeo não
  // mostrar multiplicadores diferentes em cada card.
  avgVphByFormat: Record<VphFormat, number | null>;
};

// Lê a tabela `creator_videos` (populada pela varredura por hashtag em
// /api/ganhos/sync), filtra pelos últimos 28 dias (por data de publicação)
// e agrega em estatísticas por criador — views e ganhos, separados entre
// Shorts e vídeos longos. A receita total do período usa o valor real
// digitado manualmente quando existir; senão cai na estimativa por RPM.
// Cada criador recebe a fatia da receita total proporcional à sua % de
// views no período (não mais um cálculo independente por criador).
// Busca as vendas pagas na Cakto de cada criador (filtrando por
// utm_campaign=<key>) dentro do período informado, e soma pedidos + valor.
// Falha de forma isolada: se a API da Cakto não estiver configurada ou der
// erro, retorna null pra todos os criadores em vez de derrubar a página
// inteira de Ganhos (que também depende do Supabase).
async function getCaktoSalesByCreator(
  periodStart: Date,
  periodEnd: Date
): Promise<Record<CreatorKey, { orders: number; amount: number } | null>> {
  const result = {} as Record<CreatorKey, { orders: number; amount: number } | null>;

  try {
    const perCreator = await Promise.all(
      CREATORS.map(async ({ key }) => {
        const orders = await getAllOrders({
          utm_campaign: key,
          status: "paid",
          paidAt__gte: periodStart.toISOString(),
          paidAt__lt: periodEnd.toISOString(),
        });
        return { key, orders: orders.length, amount: sumPaidAmount(orders) };
      })
    );

    for (const c of perCreator) result[c.key] = { orders: c.orders, amount: c.amount };
  } catch (error) {
    console.error("❌ Erro ao buscar vendas na Cakto:", error);
    for (const { key } of CREATORS) result[key] = null;
  }

  return result;
}

// Busca as vendas pagas na Shopee de cada criador. Traz TODAS as vendas do
// período de uma vez (a API só filtra pelo sub_id 1, que é fixo pra conta
// toda) e separa por criador comparando subId2 no código.
// Falha de forma isolada, igual a getCaktoSalesByCreator.
async function getShopeeSalesByCreator(
  periodStart: Date,
  periodEnd: Date
): Promise<
  Record<CreatorKey, { orders: number; amount: number; sales: ShopeeSaleDetail[] } | null>
> {
  const result = {} as Record<
    CreatorKey,
    { orders: number; amount: number; sales: ShopeeSaleDetail[] } | null
  >;

  try {
    const allOrders = await getAllConversions({
      purchaseTimeStart: periodStart,
      purchaseTimeEnd: periodEnd,
    });

    for (const { key } of CREATORS) {
      const creatorOrders = filterByCreator(allOrders, key);
      result[key] = {
        orders: countPaidOrders(creatorOrders),
        amount: sumPaidCommission(creatorOrders),
        sales: paidSaleDetails(creatorOrders),
      };
    }
  } catch (error) {
    console.error("❌ Erro ao buscar vendas na Shopee:", error);
    for (const { key } of CREATORS) result[key] = null;
  }

  return result;
}

export async function getCreatorEarnings(): Promise<GanhosData> {
  // Usa o client com service_role pra não depender de RLS estar liberado
  // pra leitura anônima nessas tabelas.
  const db = getServiceSupabase();

  const [{ data, error }, { data: manualRevenueRows, error: manualRevenueError }, realRpmMap] =
    await Promise.all([
      db.from("creator_videos").select("*"),
      db.from("manual_revenue").select("*").eq("id", "current").limit(1),
      getRealRpmMap(),
    ]);

  if (error) {
    console.error("❌ Erro ao ler creator_videos:", error);
  }
  if (manualRevenueError) {
    console.error("❌ Erro ao ler manual_revenue:", manualRevenueError);
  }

  const allRows = (data as CreatorVideoRow[]) || [];

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Views "do período" = views GANHAS nos últimos 28 dias (igual o YouTube
  // Analytics), não mais os vídeos publicados nos últimos 28 dias.
  // Usa o histórico diário gravado em creator_video_view_history (um
  // view_count por vídeo por dia) pra calcular, por vídeo, o delta entre
  // o view_count de hoje e o de ~28 dias atrás — incluindo vídeos antigos
  // que continuam recebendo views, que o filtro por published_at ignorava.
  const { data: historyData, error: historyError } = await db
    .from("creator_video_view_history")
    .select("youtube_video_id, view_count, captured_date")
    .order("captured_date", { ascending: true });

  if (historyError) {
    console.error("❌ Erro ao ler creator_video_view_history:", historyError);
  }

  const periodStartDate = periodStart.toISOString().slice(0, 10);
  const earliestByVideo = new Map<string, number>();
  const baselineAtOrBeforePeriod = new Map<string, number>();

  for (const h of (historyData as { youtube_video_id: string; view_count: number; captured_date: string }[]) || []) {
    if (!earliestByVideo.has(h.youtube_video_id)) {
      earliestByVideo.set(h.youtube_video_id, h.view_count || 0);
    }
    if (h.captured_date <= periodStartDate) {
      // Ordenado ascendente, então a última sobrescrita é a mais recente
      // ainda dentro (ou antes) do início do período — a baseline certa.
      baselineAtOrBeforePeriod.set(h.youtube_video_id, h.view_count || 0);
    }
  }

  function periodViewsFor(videoId: string, currentViews: number, publishedAt: string | null): number {
    // Vídeo publicado dentro da janela: todas as views dele já são "do
    // período" (não existiam antes), então a baseline é zero.
    if (publishedAt && new Date(publishedAt).getTime() >= periodStart.getTime()) {
      return currentViews;
    }
    // Vídeo antigo com histórico de antes do período: delta real.
    if (baselineAtOrBeforePeriod.has(videoId)) {
      return Math.max(currentViews - (baselineAtOrBeforePeriod.get(videoId) || 0), 0);
    }
    // Vídeo antigo mas só passamos a rastreá-lo DEPOIS do início do
    // período (histórico começa no meio da janela): usa a captura mais
    // antiga que temos como baseline. Sub-estima um pouco os primeiros
    // dias, mas converge pro valor certo conforme o histórico acumula.
    if (earliestByVideo.has(videoId)) {
      return Math.max(currentViews - (earliestByVideo.get(videoId) || 0), 0);
    }
    // Nenhum histórico ainda pra esse vídeo (primeiro sync depois do
    // deploy dessa mudança) — melhor mostrar 0 do que contar a vida toda
    // do vídeo como "views dos últimos 28 dias". Se corrige sozinho a
    // partir do próximo sync diário.
    return 0;
  }

  // `rows` mantém o mesmo formato de sempre, só que `view_count` agora é
  // "views ganhas no período" em vez de "views totais do vídeo" — assim
  // todo o resto do cálculo (por criador, Shorts x longos, receita,
  // histórico de vídeos do período) continua igual, mas com o número
  // certo por baixo.
  const rows = allRows
    .map((r) => ({ ...r, view_count: periodViewsFor(r.youtube_video_id, r.view_count || 0, r.published_at) }))
    .filter((r) => r.view_count > 0);

  // Dia 01 do mês atual até agora. `monthRows` (por published_at) segue
  // usado só pra CONTAGEM de vídeos publicados no mês (metas de
  // quantidade, tipo "Meta de Shorts"). Views e receita do mês usam
  // `monthViewRows` logo abaixo, que soma o que cada vídeo ganhou de
  // views DENTRO do mês — inclusive vídeos antigos que continuam
  // recebendo views — em vez de só os publicados esse mês.
  const monthStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
  const monthRows = allRows.filter((r) => {
    if (!r.published_at) return false;
    const published = new Date(r.published_at).getTime();
    return published >= monthStart.getTime() && published <= periodEnd.getTime();
  });

  // Views "do mês" = views ganhas desde o dia 01 até agora, pra QUALQUER
  // vídeo (novo ou antigo) — mesma lógica de `periodViewsFor`, só que com
  // baseline no início do mês em vez de 28 dias atrás.
  const monthStartDate = monthStart.toISOString().slice(0, 10);
  const baselineAtOrBeforeMonthStart = new Map<string, number>();

  for (const h of (historyData as { youtube_video_id: string; view_count: number; captured_date: string }[]) || []) {
    if (h.captured_date <= monthStartDate) {
      baselineAtOrBeforeMonthStart.set(h.youtube_video_id, h.view_count || 0);
    }
  }

  function monthViewsFor(videoId: string, currentViews: number, publishedAt: string | null): number {
    // Vídeo publicado dentro do mês: todas as views dele são "do mês".
    if (publishedAt && new Date(publishedAt).getTime() >= monthStart.getTime()) {
      return currentViews;
    }
    // Vídeo antigo com histórico de antes/no início do mês: delta real.
    if (baselineAtOrBeforeMonthStart.has(videoId)) {
      return Math.max(currentViews - (baselineAtOrBeforeMonthStart.get(videoId) || 0), 0);
    }
    // Só passamos a rastreá-lo depois do início do mês: usa a captura
    // mais antiga como baseline (mesma limitação do periodViewsFor).
    if (earliestByVideo.has(videoId)) {
      return Math.max(currentViews - (earliestByVideo.get(videoId) || 0), 0);
    }
    return 0;
  }

  const monthViewRows = allRows
    .map((r) => ({ ...r, view_count: monthViewsFor(r.youtube_video_id, r.view_count || 0, r.published_at) }))
    .filter((r) => r.view_count > 0);

  // Vendas reais na Cakto (28 dias) por criador — identificadas pela UTM
  // utm_campaign=<key> no link de checkout de cada um. Se a API não estiver
  // configurada (ou alguma chamada falhar), cai tudo pra null e o card
  // mostra "—" em vez de derrubar a página de Ganhos inteira.
  const [caktoSales, shopeeSales] = await Promise.all([
    getCaktoSalesByCreator(periodStart, periodEnd),
    getShopeeSalesByCreator(periodStart, periodEnd),
  ]);

  const manualAmount =
    manualRevenueRows && manualRevenueRows[0]
      ? (manualRevenueRows[0] as ManualRevenueRow).amount
      : null;

  // Views totais do período, somando os 3 criadores. Um vídeo com 2
  // hashtags (colab) conta pra cada criador separadamente — de propósito,
  // igual já era antes.
  const periodViews = rows.reduce((sum, r) => sum + (r.view_count || 0), 0);
  const periodShortsViews = rows.filter((r) => r.is_short).reduce((sum, r) => sum + (r.view_count || 0), 0);
  const periodLongViews = rows.filter((r) => !r.is_short).reduce((sum, r) => sum + (r.view_count || 0), 0);
  // "" é o valor legado (nunca escaneado com hashtag); "SEM DONO" é o
  // rótulo usado depois que passamos a etiquetar esses vídeos direto no
  // banco. Os dois contam como órfão pra esse card.
  const noHashtagCount = rows.filter((r) => r.creator === "" || r.creator === "SEM DONO").length;

  // Zero ou não preenchido conta como "sem valor manual" — volta a usar a
  // estimativa por RPM automaticamente, sem precisar de um botão separado.
  const isManualRevenue = manualAmount != null && manualAmount > 0;
  // Estimativa por RPM: Shorts e vídeos longos usam RPM diferente (longos
  // rendem bem mais — R$5,50 contra R$0,32 dos Shorts), então soma cada um
  // separado em vez de aplicar um RPM único pra tudo. E dentro de cada
  // formato, soma vídeo a vídeo (não views totais x 1 RPM), porque cada
  // vídeo pode ter seu próprio RPM real importado via CSV.
  const estimatedPeriodEarnings =
    sumEstimatedEarnings(rows.filter((r) => r.is_short), realRpmMap) +
    sumEstimatedEarnings(rows.filter((r) => !r.is_short), realRpmMap);
  const periodEarnings = isManualRevenue ? (manualAmount as number) : estimatedPeriodEarnings;

  // Vídeos órfãos (sem hashtag de criador) do período — alimenta o modal
  // que abre ao clicar nos cards "Vídeos sem criador" / "Saldo sem
  // criador". Mesma dedupe por youtube_video_id dos outros vídeos, e a
  // mesma fórmula de receita usada em periodVideos/topVideosMonth.
  const noHashtagByVideoId = new Map<string, CreatorVideoRow[]>();
  for (const row of rows) {
    if (row.creator !== "" && row.creator !== "SEM DONO") continue;
    const list = noHashtagByVideoId.get(row.youtube_video_id) || [];
    list.push(row);
    noHashtagByVideoId.set(row.youtube_video_id, list);
  }

  const noHashtagVideos: GanhosVideoRow[] = Array.from(noHashtagByVideoId.entries())
    .map(([youtubeVideoId, group]) => {
      const first = group[0];
      // Com valor manual ativo, o total bate com o que foi digitado — mas
      // a fatia de CADA vídeo é proporcional ao peso RPM dele (não à sua
      // % bruta de views), senão vídeo longo (RPM bem mais alto) fica
      // artificialmente esmagado num pool de views dominado por Shorts.
      // Mesmo princípio já usado pra dividir shortsEarnings/longEarnings
      // por criador (ver `creators` abaixo), só que agora vídeo a vídeo.
      const videoWeight = estimateEarnings(
        first.view_count,
        first.is_short,
        realRpmMap.get(youtubeVideoId)?.rpm
      );
      const revenue = isManualRevenue
        ? estimatedPeriodEarnings > 0
          ? Math.round(periodEarnings * (videoWeight / estimatedPeriodEarnings) * 100) / 100
          : 0
        : videoWeight;

      return {
        youtubeVideoId,
        title: first.title,
        thumbnailUrl: first.thumbnail_url,
        creatorLabel: "sem hashtag",
        isShort: first.is_short,
        viewCount: first.view_count,
        likeCount: first.like_count,
        commentCount: first.comment_count,
        durationSeconds: first.duration_seconds,
        publishedAt: first.published_at,
        revenue,
      };
    })
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    });

  const creators: CreatorStats[] = CREATORS.map(({ key, label, hashtag }) => {
    const creatorRows = rows.filter((r) => r.creator === key);
    const shorts = creatorRows.filter((r) => r.is_short);
    const longs = creatorRows.filter((r) => !r.is_short);

    const shortsViews = shorts.reduce((sum, r) => sum + (r.view_count || 0), 0);
    const longViews = longs.reduce((sum, r) => sum + (r.view_count || 0), 0);
    const totalViews = shortsViews + longViews;

    const viewsSharePct = periodViews > 0 ? (totalViews / periodViews) * 100 : 0;

    let shortsEarnings: number;
    let longEarnings: number;

    if (isManualRevenue) {
      // Com valor real digitado, não dá pra saber o breakdown exato por
      // tipo — mas em vez de ratear só pela % de views (o que ignora que
      // vídeo longo rende muito mais por view que Shorts), pesa a fatia de
      // cada tipo pela receita estimada de cada formato (RPM + divisor
      // próprios de cada um — vídeo longo não tem o /2 que Shorts tem).
      // Assim o total bate com o valor real digitado, mas a divisão
      // respeita a diferença de monetização entre os dois formatos.
      const totalEarnings =
        periodViews > 0 ? Math.round(periodEarnings * (totalViews / periodViews) * 100) / 100 : 0;
      const shortsWeight = sumEstimatedEarnings(shorts, realRpmMap);
      const longWeight = sumEstimatedEarnings(longs, realRpmMap);
      const totalWeight = shortsWeight + longWeight;
      shortsEarnings =
        totalWeight > 0 ? Math.round(totalEarnings * (shortsWeight / totalWeight) * 100) / 100 : 0;
      longEarnings = Math.round((totalEarnings - shortsEarnings) * 100) / 100;
    } else {
      // Estimativa: soma vídeo a vídeo, usando o RPM real de cada um
      // quando existir (fallback pro fixo do formato) — bem mais preciso
      // que aplicar um RPM único em cima da soma de views do criador,
      // ainda mais agora que RPMs reais variam vídeo a vídeo.
      shortsEarnings = sumEstimatedEarnings(shorts, realRpmMap);
      longEarnings = sumEstimatedEarnings(longs, realRpmMap);
    }

    const totalEarnings = Math.round((shortsEarnings + longEarnings) * 100) / 100;
    // RPM médio efetivo do criador — mistura os dois RPMs de acordo com o
    // quanto de cada tipo ele tem, só pra exibir no card.
    const blendedRpm = totalViews > 0 ? ((totalEarnings * 2 * 1000) / totalViews) : SHORTS_RPM;

    // RPM efetivo de cada formato no período — quando há valor real
    // digitado em "Ganhos", isso já reflete a divisão proporcional real
    // (shortsEarnings/longEarnings acima); sem valor real, cai exatamente
    // no RPM fixo de sempre. O fallback (quando o período não tem views
    // daquele formato) usa estimateEarnings(1000, ...) em vez do RPM cru,
    // porque Shorts tem a divisão extra por 2 embutida na fórmula — assim
    // o fallback fica consistente com o cálculo normal.
    const effectiveShortsRpm =
      shortsViews > 0 ? (shortsEarnings / shortsViews) * 1000 : estimateEarnings(1000, true);
    const effectiveLongRpm =
      longViews > 0 ? (longEarnings / longViews) * 1000 : estimateEarnings(1000, false);

    // Ganhos do mês (dia 01 até hoje) — usa o RPM efetivo do período (real
    // quando houver, estimado quando não houver) em vez de sempre estimar
    // por RPM fixo, pra ficar consistente com o card de "Vídeos longos" /
    // "Shorts" do período.
    // Contagem de vídeos publicados esse mês (meta de quantidade) —
    // continua baseada em published_at, sem mudança.
    const monthCreatorRows = monthRows.filter((r) => r.creator === key);
    const monthCount = monthCreatorRows.length;
    const monthShortsCount = monthCreatorRows.filter((r) => r.is_short).length;
    const monthLongCount = monthCount - monthShortsCount;

    // Views/receita do mês — agora inclui views ganhas esse mês por
    // vídeos antigos, não só vídeos publicados esse mês.
    const monthViewCreatorRows = monthViewRows.filter((r) => r.creator === key);
    const monthShortsViews = monthViewCreatorRows
      .filter((r) => r.is_short)
      .reduce((sum, r) => sum + (r.view_count || 0), 0);
    const monthLongViews = monthViewCreatorRows
      .filter((r) => !r.is_short)
      .reduce((sum, r) => sum + (r.view_count || 0), 0);
    const monthViews = monthShortsViews + monthLongViews;
    const monthShortsEarnings = Math.round((monthShortsViews / 1000) * effectiveShortsRpm * 100) / 100;
    const monthLongEarnings = Math.round((monthLongViews / 1000) * effectiveLongRpm * 100) / 100;
    const monthEarnings = Math.round((monthShortsEarnings + monthLongEarnings) * 100) / 100;

    const cakto = caktoSales[key];
    const shopee = shopeeSales[key];

    return {
      key,
      label,
      hashtag,
      shortsViews,
      shortsCount: shorts.length,
      shortsEarnings,
      longViews,
      longCount: longs.length,
      longEarnings,
      totalViews,
      totalEarnings,
      viewsSharePct: Math.round(viewsSharePct * 10) / 10,
      rpm: Math.round(blendedRpm * 100) / 100,
      monthViews,
      monthEarnings,
      periodCount: shorts.length + longs.length,
      monthCount,
      monthShortsCount,
      monthLongCount,
      monthShortsViews,
      monthLongViews,
      monthShortsEarnings,
      monthLongEarnings,
      caktoOrders: cakto ? cakto.orders : null,
      caktoAmount: cakto ? cakto.amount : null,
      shopeeOrders: shopee ? shopee.orders : null,
      shopeeAmount: shopee ? shopee.amount : null,
      shopeeSales: shopee ? shopee.sales : null,
    };
  });

  const lastSyncedAt = allRows.reduce<string | null>((latest, r) => {
    if (!r.synced_at) return latest;
    if (!latest || new Date(r.synced_at) > new Date(latest)) return r.synced_at;
    return latest;
  }, null);

  // Histórico de vídeos do período: um por youtube_video_id (junta as
  // linhas de colabs com 2+ hashtags numa só), mais recente primeiro.
  const byVideoId = new Map<string, CreatorVideoRow[]>();
  for (const row of rows) {
    const list = byVideoId.get(row.youtube_video_id) || [];
    list.push(row);
    byVideoId.set(row.youtube_video_id, list);
  }

  const periodVideos: GanhosVideoRow[] = Array.from(byVideoId.entries())
    .map(([youtubeVideoId, group]) => {
      const first = group[0];
      const taggedGroup = group.filter((r) => r.creator !== "");
      const creatorLabel =
        taggedGroup.length > 0
          ? taggedGroup.map((r) => CREATORS.find((c) => c.key === r.creator)?.label || r.creator).join(" + ")
          : "sem hashtag";

      // Mesma correção do bloco de `noHashtagVideos` acima: com valor
      // manual ativo, divide o total pelo peso RPM de cada vídeo (formato
      // + RPM real quando existir), não pela % bruta de views — senão
      // vídeo longo aparece com receita muito abaixo do real na
      // Auditoria/Histórico.
      const videoWeight = estimateEarnings(
        first.view_count,
        first.is_short,
        realRpmMap.get(youtubeVideoId)?.rpm
      );
      const revenue = isManualRevenue
        ? estimatedPeriodEarnings > 0
          ? Math.round(periodEarnings * (videoWeight / estimatedPeriodEarnings) * 100) / 100
          : 0
        : videoWeight;

      return {
        youtubeVideoId,
        title: first.title,
        thumbnailUrl: first.thumbnail_url,
        creatorLabel,
        isShort: first.is_short,
        viewCount: first.view_count,
        likeCount: first.like_count,
        commentCount: first.comment_count,
        durationSeconds: first.duration_seconds,
        publishedAt: first.published_at,
        revenue,
      };
    })
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    });

  // Top 10 do mês (dia 01 até hoje), por maior receita estimada. Reusa
  // monthRows (já filtrado pro range do mês) e a mesma dedupe por
  // youtube_video_id dos colabs. A receita aqui é sempre a estimativa por
  // RPM — igual ao "Ganhos do mês" de cada card — já que o valor manual só
  // é escopado à janela de 28 dias, não dá pra ratear num range de mês.
  const byVideoIdMonth = new Map<string, CreatorVideoRow[]>();
  for (const row of monthRows) {
    const list = byVideoIdMonth.get(row.youtube_video_id) || [];
    list.push(row);
    byVideoIdMonth.set(row.youtube_video_id, list);
  }

  const topVideosMonth: GanhosVideoRow[] = Array.from(byVideoIdMonth.entries())
    .map(([youtubeVideoId, group]) => {
      const first = group[0];
      const taggedGroup = group.filter((r) => r.creator !== "");
      const creatorLabel =
        taggedGroup.length > 0
          ? taggedGroup.map((r) => CREATORS.find((c) => c.key === r.creator)?.label || r.creator).join(" + ")
          : "sem hashtag";

      return {
        youtubeVideoId,
        title: first.title,
        thumbnailUrl: first.thumbnail_url,
        creatorLabel,
        isShort: first.is_short,
        viewCount: first.view_count,
        likeCount: first.like_count,
        commentCount: first.comment_count,
        durationSeconds: first.duration_seconds,
        publishedAt: first.published_at,
        revenue: estimateEarnings(first.view_count, first.is_short, realRpmMap.get(youtubeVideoId)?.rpm),
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Média global de VPH por formato: usa TODO o histórico do canal
  // (allRows, deduplicado por youtube_video_id — colabs com 2+ hashtags
  // não podem contar em dobro na média), não só o período de 28 dias nem
  // só o Top 10 do mês. É a mesma referência usada nos dois cards abaixo,
  // pra o selo "Nx acima da média" de um vídeo não mudar dependendo de em
  // qual lista ele aparece.
  const byVideoIdAll = new Map<string, CreatorVideoRow>();
  for (const row of allRows) {
    if (!byVideoIdAll.has(row.youtube_video_id)) byVideoIdAll.set(row.youtube_video_id, row);
  }
  const avgVphByFormat = averageVphByFormat(
    Array.from(byVideoIdAll.values()).map((r) => ({
      viewCount: r.view_count,
      publishedAt: r.published_at,
      isShort: r.is_short,
    }))
  );

  return {
    creators,
    lastSyncedAt,
    totalVideosScanned: allRows.length,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    periodViews,
    periodEarnings,
    isManualRevenue,
    manualRevenueAmount: manualAmount,
    noHashtagCount,
    noHashtagVideos,
    periodVideos,
    topVideosMonth,
    avgVphByFormat,
  };
}

export type EarningsHistoryPoint = {
  capturedAt: string;
  creator: CreatorKey;
  totalEarnings: number;
  totalViews: number;
};

// Histórico de receita por criador — um ponto por sincronização (clique em
// "Atualizar"), gravado em `creator_earnings_snapshots` pela rota
// /api/ganhos/sync. É o TOTAL ACUMULADO da janela de 28 dias naquele
// instante (mesmo valor que aparece nos cards), não o ganho daquele dia
// isolado — por isso não é usado no gráfico de linha (ver
// getCreatorDailyEarnings abaixo). Mantido por se um dia for útil mostrar
// a evolução do acumulado do período em vez do dia a dia.
export async function getCreatorEarningsHistory(limit = 60): Promise<EarningsHistoryPoint[]> {
  const db = getServiceSupabase();

  const { data, error } = await db
    .from("creator_earnings_snapshots")
    .select("*")
    .order("captured_at", { ascending: true })
    .limit(limit * CREATORS.length);

  if (error) {
    console.error("❌ Erro ao ler creator_earnings_snapshots:", error);
    return [];
  }

  const rows = (data as CreatorEarningsSnapshotRow[]) || [];

  return rows
    .filter((r) => CREATORS.some((c) => c.key === r.creator))
    .map((r) => ({
      capturedAt: r.captured_at,
      creator: r.creator as CreatorKey,
      totalEarnings: r.total_earnings,
      totalViews: r.total_views,
    }));
}

// Ganho estimado POR DIA (não acumulado) de cada criador — o que alimenta
// o gráfico de linha da aba Ganhos.
//
// Como calcula: `creator_video_view_history` já guarda, pra cada vídeo do
// canal, o view_count "fechado" de cada dia (1 linha por vídeo por dia,
// não importa quantas vezes o sync rodou naquele dia — é upsert por
// youtube_video_id + captured_date). Então pra cada vídeo comparamos o
// view_count de um dia com o do dia anterior: a diferença é exatamente
// quantas views aquele vídeo ganhou NAQUELE dia. Aplicamos o RPM do
// formato dele (Shorts ou longo) só em cima dessa fatia diária, e
// somamos por criador usando a marcação de hashtag atual de
// `creator_videos` (colab conta pra cada criador inteiro, igual o resto
// da aba Ganhos já faz).
//
// Diferente do total acumulado (getCreatorEarningsHistory), aqui NÃO dá
// pra usar a receita real digitada manualmente — ela é um valor único do
// período de 28 dias, sem quebra por dia.
//
// Quando o OAuth da YouTube Analytics API estiver configurado (ver
// lib/youtube-revenue.ts), esse ganho diário usa a receita OFICIAL do
// YouTube por vídeo/dia sempre que ela já estiver disponível (costuma
// vir com ~2 dias de atraso). Pros dias mais recentes, que ainda não têm
// esse dado, ou se o OAuth não estiver configurado, cai pra estimativa
// por RPM — igual funcionava antes.
export async function getCreatorDailyEarnings(days = 28): Promise<EarningsHistoryPoint[]> {
  const db = getServiceSupabase();

  // Busca só a janela relevante (+1 dia de folga pra ter o "dia anterior"
  // de referência do primeiro ponto exibido, pra calcular o delta dele).
  // Sem esse filtro, a query trazia a tabela inteira sem paginação e
  // esbarrava no limite padrão de 1000 linhas do Supabase/PostgREST —
  // com ~1 linha por vídeo-âncora por dia, isso truncava o histórico em
  // ~11-12 dias (sempre os mais ANTIGOS, por causa do order ascending),
  // fazendo o gráfico "últimos 28 dias" parar bem antes de hoje.
  const historyStartDate = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Busca em páginas de 1000 linhas até esgotar a janela. Um único
  // .select() nunca é suficiente aqui: mesmo já filtrado por data, com
  // ~120 vídeos-âncora × 29 dias dá ~3.500 linhas, e o Supabase/PostgREST
  // corta em 1000 linhas por chamada (Max Rows do projeto) não importa
  // quantas o filtro de data deixaria passar — por isso o corte em
  // ~11-12 dias persistia mesmo com o .gte() no lugar. Paginando com
  // .range() em loop, buscamos a janela inteira independente do tamanho.
  type HistoryRow = { youtube_video_id: string; view_count: number; captured_date: string; is_short: boolean };
  const PAGE_SIZE = 1000;
  const historyRows: HistoryRow[] = [];
  let historyError: unknown = null;
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: pageData, error: pageError } = await db
      .from("creator_video_view_history")
      .select("youtube_video_id, view_count, captured_date, is_short")
      .gte("captured_date", historyStartDate)
      .order("captured_date", { ascending: true })
      .range(from, to);

    if (pageError) {
      historyError = pageError;
      break;
    }
    const rows = (pageData as HistoryRow[]) || [];
    historyRows.push(...rows);
    if (rows.length < PAGE_SIZE) break; // última página
  }

  const { data: creatorVideoRows, error: creatorError } = await db
    .from("creator_videos")
    .select("creator, youtube_video_id");

  if (historyError) {
    console.error("❌ Erro ao ler creator_video_view_history:", historyError);
    return [];
  }
  if (creatorError) {
    console.error("❌ Erro ao ler creator_videos:", creatorError);
  }

  // Vídeo -> lista de criadores marcados nele. Colab (2+ hashtags) entra
  // uma vez pra cada criador, de propósito — mesmo critério usado no
  // resto da aba Ganhos.
  const creatorsByVideo = new Map<string, CreatorKey[]>();
  for (const row of (creatorVideoRows as { creator: string; youtube_video_id: string }[]) || []) {
    if (!CREATORS.some((c) => c.key === row.creator)) continue; // ignora "" / "SEM DONO"
    const list = creatorsByVideo.get(row.youtube_video_id) || [];
    list.push(row.creator as CreatorKey);
    creatorsByVideo.set(row.youtube_video_id, list);
  }

  // Receita OFICIAL por vídeo/dia (quando o OAuth estiver configurado).
  // A API não aceita `video` combinado com `day` numa chamada só, então
  // consultamos um vídeo por vez — só pelos vídeos que têm criador
  // atribuído, que são os únicos usados no gráfico abaixo. `null` =
  // integração não configurada (ou falhou), então nada aqui usa receita
  // real e tudo cai pro RPM.
  const today = new Date();
  const startDate = new Date(today.getTime() - (days + 2) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);
  const relevantVideoIds = Array.from(creatorsByVideo.keys());
  const [realRevenueRows, realRpmMap] = await Promise.all([
    getDailyVideoRevenue(startDate, endDate, relevantVideoIds),
    getRealRpmMap(),
  ]);
  const realRevenueByKey = new Map<string, number>();
  for (const row of realRevenueRows || []) {
    realRevenueByKey.set(`${row.date}|${row.videoId}`, row.estimatedRevenue);
  }

  const byVideo = new Map<string, HistoryRow[]>();
  for (const row of historyRows) {
    const list = byVideo.get(row.youtube_video_id) || [];
    list.push(row);
    byVideo.set(row.youtube_video_id, list);
  }

  type Bucket = Record<CreatorKey, { views: number; earnings: number }>;
  const emptyBucket = (): Bucket => ({
    lucas: { views: 0, earnings: 0 },
    matheus: { views: 0, earnings: 0 },
    rafael: { views: 0, earnings: 0 },
  });

  // data (YYYY-MM-DD) -> bucket por criador
  const byDate = new Map<string, Bucket>();

  for (const [videoId, rows] of byVideo) {
    const creators = creatorsByVideo.get(videoId);
    if (!creators || creators.length === 0) continue; // vídeo sem hashtag não entra no gráfico por criador

    const sorted = rows.slice().sort((a, b) => (a.captured_date < b.captured_date ? -1 : 1));

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      // Delta de views entre um dia fechado e o anterior. Nunca negativo
      // (recontagem do YouTube, vídeo reprocessado etc. não geram ganho
      // negativo no gráfico — só ficam de fora).
      const deltaViews = Math.max((curr.view_count || 0) - (prev.view_count || 0), 0);
      if (deltaViews === 0) continue;

      // Receita real desse vídeo nesse dia, se o YouTube já liberou;
      // senão cai pra estimativa por RPM em cima do delta de views.
      const realRevenue = realRevenueByKey.get(`${curr.captured_date}|${videoId}`);
      const dayEarnings =
        realRevenue ?? estimateEarnings(deltaViews, curr.is_short, realRpmMap.get(videoId)?.rpm);

      const bucket = byDate.get(curr.captured_date) || emptyBucket();
      for (const creator of creators) {
        bucket[creator].views += deltaViews;
        bucket[creator].earnings += dayEarnings;
      }
      byDate.set(curr.captured_date, bucket);
    }
  }

  const dates = Array.from(byDate.keys())
    .sort()
    .slice(-days);

  const points: EarningsHistoryPoint[] = [];
  for (const date of dates) {
    const bucket = byDate.get(date)!;
    for (const { key } of CREATORS) {
      points.push({
        capturedAt: date,
        creator: key,
        totalEarnings: Math.round(bucket[key].earnings * 100) / 100,
        totalViews: bucket[key].views,
      });
    }
  }

  return points;
}
