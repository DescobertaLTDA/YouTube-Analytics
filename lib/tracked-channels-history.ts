import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";

export type TrackedChannelMeta = {
  channelId: string;
  title: string;
  avatarUrl: string | null;
};

export type ChannelViewsHistoryPoint = {
  capturedAt: string; // YYYY-MM-DD
  channelId: string;
  totalViews: number; // views ganhas NESSE dia (delta, não acumulado)
};

export type TrackedChannelsHistory = {
  channels: TrackedChannelMeta[];
  points: ChannelViewsHistoryPoint[];
};

// Views ganhas POR DIA (não acumulado) de cada canal rastreado — mesma
// técnica de delta usada em getCreatorDailyEarnings (lib/data.ts): pra
// cada vídeo, compara o view_count de um dia fechado com o do dia
// anterior gravado em `tracked_channel_video_history` (ver migration
// 0006), e soma as diferenças por canal/dia. Alimenta o gráfico "Views
// por dia" da aba Canais.
//
// Diferente da aba Ganhos, aqui não tem receita nem RPM — canal de
// terceiro não é nosso, só serve pra comparar RITMO de crescimento de
// views entre canais.
export async function getTrackedChannelsViewsHistory(days = 28): Promise<TrackedChannelsHistory> {
  const db = getServiceSupabase();

  // +1 dia de folga pra ter o "dia anterior" de referência do primeiro
  // ponto exibido (mesmo motivo do getCreatorDailyEarnings).
  const historyStartDate = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  type HistoryRow = { youtube_video_id: string; youtube_channel_id: string; view_count: number; captured_date: string };
  const PAGE_SIZE = 1000;
  const historyRows: HistoryRow[] = [];
  let historyError: unknown = null;

  // Paginado em loop, mesmo motivo do getCreatorDailyEarnings: sem isso,
  // o corte padrão de 1000 linhas do Supabase/PostgREST trunca o
  // histórico bem antes do fim da janela pedida.
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: pageData, error: pageError } = await db
      .from("tracked_channel_video_history")
      .select("youtube_video_id, youtube_channel_id, view_count, captured_date")
      .gte("captured_date", historyStartDate)
      .order("captured_date", { ascending: true })
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
    return { channels: [], points: [] };
  }

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
  const activeChannelIds = new Set(channels.map((c) => c.channelId));

  const byVideo = new Map<string, HistoryRow[]>();
  for (const row of historyRows) {
    // Ignora histórico de canais já removidos (soft-delete) — não tem
    // como mostrar uma linha/avatar de um canal que não está mais na
    // lista ativa.
    if (!activeChannelIds.has(row.youtube_channel_id)) continue;
    const list = byVideo.get(row.youtube_video_id) || [];
    list.push(row);
    byVideo.set(row.youtube_video_id, list);
  }

  // data (YYYY-MM-DD) -> channelId -> views ganhas naquele dia
  const byDate = new Map<string, Map<string, number>>();

  for (const [, rows] of byVideo) {
    const sorted = rows.slice().sort((a, b) => (a.captured_date < b.captured_date ? -1 : 1));
    const channelId = sorted[0]?.youtube_channel_id;
    if (!channelId) continue;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      // Nunca negativo — recontagem do YouTube, vídeo reprocessado etc.
      // não geram "perda" de views no gráfico.
      const deltaViews = Math.max((curr.view_count || 0) - (prev.view_count || 0), 0);
      if (deltaViews === 0) continue;

      const dayBucket = byDate.get(curr.captured_date) || new Map<string, number>();
      dayBucket.set(channelId, (dayBucket.get(channelId) || 0) + deltaViews);
      byDate.set(curr.captured_date, dayBucket);
    }
  }

  const dates = Array.from(byDate.keys()).sort().slice(-days);

  const points: ChannelViewsHistoryPoint[] = [];
  for (const date of dates) {
    const dayBucket = byDate.get(date)!;
    for (const channel of channels) {
      points.push({
        capturedAt: date,
        channelId: channel.channelId,
        totalViews: dayBucket.get(channel.channelId) || 0,
      });
    }
  }

  return { channels, points };
}
