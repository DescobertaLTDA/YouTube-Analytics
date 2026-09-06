import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";

export type TrackedChannelMeta = {
  channelId: string;
  title: string;
  avatarUrl: string | null;
};

export type ChannelViewsHistoryPoint = {
  capturedAt: string; // timestamp ISO da hora cheia
  channelId: string;
  totalViews: number; // views ganhas NESSA hora (delta, não acumulado)
};

export type TrackedChannelsHistory = {
  channels: TrackedChannelMeta[];
  points: ChannelViewsHistoryPoint[];
};

const HOUR_MS = 60 * 60 * 1000;

function hourBucketStart(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

// Views ganhas POR HORA (não acumulado) de cada canal rastreado.
//
// Antes, o delta entre dois snapshots consecutivos era jogado inteiro no
// bucket da hora do snapshot MAIS RECENTE. Isso quebrava a curva toda vez
// que dois snapshots não caíam em horas cheias consecutivas — o que
// acontece sempre que: alguém clica em "Atualizar" fora da hora cheia
// (esse clique grava timestamp exato, não arredondado — ver
// canais-terceiros-snapshot.ts), o cron atrasa, ou pula uma execução.
// Resultado: um pico seguido de um vale artificial, sem relação com o
// ritmo real de crescimento do canal.
//
// Agora o delta é distribuído PROPORCIONALMENTE ao tempo real decorrido
// entre os dois snapshots, espalhando por todos os buckets de hora cheia
// que o intervalo (prev, curr] atravessa. Mesma lógica que serviços como
// o YouTube Studio usam pra manter a curva suave mesmo com amostragem
// irregular.
export async function getTrackedChannelsViewsHistory(hours = 7 * 24): Promise<TrackedChannelsHistory> {
  const db = getServiceSupabase();

  // Busca os CANAIS primeiro, sempre — independente do histórico de
  // views existir ou não (ver comentário original: distingue "sem canal
  // cadastrado" de "tem canal, mas ainda sem histórico").
  const { data: channelRows, error: channelError } = await db
    .from("tracked_channels")
    .select("*")
    .eq("active", true)
    .order("added_at", { ascending: true });

  if (channelError) {
    console.error("❌ Erro ao ler tracked_channels:", channelError);
  }

  const channels: TrackedChannelMeta[] = ((channelRows as TrackedChannelRow[]) || []).map((c) => ({
    channelId: c.youtube_channel_id,
    title: c.channel_title || c.youtube_channel_id,
    avatarUrl: c.avatar_url,
  }));

  if (channels.length === 0) {
    return { channels: [], points: [] };
  }

  // +1 hora de folga pra ter a "hora anterior" de referência do primeiro
  // ponto exibido.
  const historyStartHour = new Date(Date.now() - (hours + 1) * 60 * 60 * 1000).toISOString();

  type HistoryRow = { youtube_video_id: string; youtube_channel_id: string; view_count: number; captured_hour: string };
  const PAGE_SIZE = 1000;
  const historyRows: HistoryRow[] = [];
  let historyError: unknown = null;

  // Paginado em loop — sem isso, o corte padrão de 1000 linhas do
  // Supabase/PostgREST trunca o histórico bem antes do fim da janela pedida.
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: pageData, error: pageError } = await db
      .from("tracked_channel_video_history")
      .select("youtube_video_id, youtube_channel_id, view_count, captured_hour")
      .gte("captured_hour", historyStartHour)
      .order("captured_hour", { ascending: true })
      .range(from, to);

    if (pageError) {
      historyError = pageError;
      break;
    }
    const rows = (pageData as HistoryRow[]) || [];
    historyRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  if (historyError) {
    console.error("❌ Erro ao ler tracked_channel_video_history:", historyError);
    return { channels, points: [] };
  }

  const activeChannelIds = new Set(channels.map((c) => c.channelId));

  const byVideo = new Map<string, HistoryRow[]>();
  for (const row of historyRows) {
    if (!activeChannelIds.has(row.youtube_channel_id)) continue;
    const list = byVideo.get(row.youtube_video_id) || [];
    list.push(row);
    byVideo.set(row.youtube_video_id, list);
  }

  // bucket (ms da hora cheia) -> channelId -> views ganhas naquele bucket
  const byBucket = new Map<number, Map<string, number>>();
  let minBucket: number | null = null;
  let maxBucket: number | null = null;

  const addToBucket = (bucketMs: number, channelId: string, views: number) => {
    if (views <= 0) return;
    const bucket = byBucket.get(bucketMs) || new Map<string, number>();
    bucket.set(channelId, (bucket.get(channelId) || 0) + views);
    byBucket.set(bucketMs, bucket);
    minBucket = minBucket === null ? bucketMs : Math.min(minBucket, bucketMs);
    maxBucket = maxBucket === null ? bucketMs : Math.max(maxBucket, bucketMs);
  };

  for (const [, rows] of byVideo) {
    const sorted = rows.slice().sort((a, b) => (a.captured_hour < b.captured_hour ? -1 : 1));
    const channelId = sorted[0]?.youtube_channel_id;
    if (!channelId) continue;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      // Nunca negativo — recontagem do YouTube, vídeo reprocessado etc.
      // não geram "perda" de views no gráfico.
      const deltaViews = Math.max((curr.view_count || 0) - (prev.view_count || 0), 0);
      if (deltaViews === 0) continue;

      const prevMs = new Date(prev.captured_hour).getTime();
      const currMs = new Date(curr.captured_hour).getTime();
      const elapsedMs = currMs - prevMs;

      if (elapsedMs <= 0) {
        // Timestamps iguais/invertidos (não deveria acontecer) — sem
        // intervalo pra dividir, joga tudo no bucket do mais recente.
        addToBucket(hourBucketStart(currMs), channelId, deltaViews);
        continue;
      }

      const firstBucket = hourBucketStart(prevMs);
      const lastBucket = hourBucketStart(currMs);

      if (firstBucket === lastBucket) {
        // Os dois snapshots caem na mesma hora cheia — nada a dividir.
        addToBucket(lastBucket, channelId, deltaViews);
        continue;
      }

      // Espalha o delta pelos buckets de hora cheia que o intervalo
      // (prevMs, currMs] atravessa, proporcional à fração do intervalo
      // que cai em cada um.
      for (let b = firstBucket; b <= lastBucket; b += HOUR_MS) {
        const overlapStart = Math.max(b, prevMs);
        const overlapEnd = Math.min(b + HOUR_MS, currMs);
        const overlapMs = Math.max(overlapEnd - overlapStart, 0);
        if (overlapMs === 0) continue;
        addToBucket(b, channelId, deltaViews * (overlapMs / elapsedMs));
      }
    }
  }

  if (minBucket === null || maxBucket === null) {
    return { channels, points: [] };
  }

  // Preenche TODOS os buckets de hora no intervalo, mesmo os sem
  // crescimento registrado (0 views) — sem isso, horas "silenciosas"
  // somem do eixo X, o que por si só já dá impressão de buraco no gráfico.
  const allBuckets: number[] = [];
  for (let b = minBucket; b <= maxBucket; b += HOUR_MS) allBuckets.push(b);
  const lastN = allBuckets.slice(-hours);

  const points: ChannelViewsHistoryPoint[] = [];
  for (const bucketMs of lastN) {
    const bucket = byBucket.get(bucketMs);
    for (const channel of channels) {
      const raw = bucket?.get(channel.channelId) || 0;
      points.push({
        capturedAt: new Date(bucketMs).toISOString(),
        channelId: channel.channelId,
        totalViews: Math.round(raw),
      });
    }
  }

  return { channels, points };
}

// Soma o total de views ganhas por canal dentro das ÚLTIMAS `hours` horas
// já presentes em `history.points`. Usado tanto pra ordenar a tira de
// avatares (mais views primeiro) quanto pra decidir qual canal fica
// pré-selecionado no card "Últimas 48 horas".
export function totalViewsByChannelInWindow(
  history: TrackedChannelsHistory,
  hours = 48
): Map<string, number> {
  const allHours = Array.from(new Set(history.points.map((p) => p.capturedAt))).sort();
  const windowHours = new Set(allHours.slice(-hours));

  const totals = new Map<string, number>();
  for (const point of history.points) {
    if (!windowHours.has(point.capturedAt)) continue;
    totals.set(point.channelId, (totals.get(point.channelId) || 0) + point.totalViews);
  }
  return totals;
}
