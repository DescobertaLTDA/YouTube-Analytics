import { getServiceSupabase, type TrackedChannelRow } from "@/lib/supabase";

export type TrackedChannelMeta = {
  channelId: string;
  title: string;
  avatarUrl: string | null;
};

export type ChannelViewsHistoryPoint = {
  capturedAt: string; // timestamp ISO truncado na hora
  channelId: string;
  totalViews: number; // views ganhas NESSA hora (delta, não acumulado)
};

export type TrackedChannelsHistory = {
  channels: TrackedChannelMeta[];
  points: ChannelViewsHistoryPoint[];
};

// Views ganhas POR HORA (não acumulado) de cada canal rastreado — mesma
// técnica de delta usada em getCreatorDailyEarnings (lib/data.ts): pra
// cada vídeo, compara o view_count de uma hora fechada com o da hora
// anterior gravada em `tracked_channel_video_history` (ver migration
// tracked_channel_history_hourly), e soma as diferenças por canal/hora.
// Alimenta o gráfico "Views por hora" da aba Canais.
//
// Diferente da aba Ganhos, aqui não tem receita nem RPM — canal de
// terceiro não é nosso, só serve pra comparar RITMO de crescimento de
// views entre canais.
export async function getTrackedChannelsViewsHistory(hours = 7 * 24): Promise<TrackedChannelsHistory> {
  const db = getServiceSupabase();

  // Busca os CANAIS primeiro, sempre — independente do histórico de
  // views existir ou não. Antes essa ordem era invertida (histórico
  // primeiro), e se a tabela `tracked_channel_video_history` não
  // existisse ainda (migration 0006 não aplicada) ou desse qualquer
  // outro erro, a função devolvia `channels: []` mesmo com canais já
  // cadastrados — a tela então mostrava "adicione um canal", uma
  // mensagem enganosa pra quem já tinha adicionado. Com os canais
  // buscados à parte, a tela consegue distinguir "sem canal cadastrado"
  // de "tem canal, mas ainda sem histórico suficiente".
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
  // ponto exibido (mesmo motivo do getCreatorDailyEarnings, só que em hora).
  const historyStartHour = new Date(Date.now() - (hours + 1) * 60 * 60 * 1000).toISOString();

  type HistoryRow = { youtube_video_id: string; youtube_channel_id: string; view_count: number; captured_hour: string };
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
    // Erro aqui geralmente significa que a migration 0006 ainda não foi
    // aplicada no banco (tabela não existe) — devolve os CANAIS mesmo
    // assim, sem pontos, pra tela mostrar "sem histórico ainda" em vez
    // de "adicione um canal" (que seria falso: o canal já existe).
    console.error("❌ Erro ao ler tracked_channel_video_history:", historyError);
    return { channels, points: [] };
  }

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

  // hora (ISO truncada) -> channelId -> views ganhas naquela hora
  const byHour = new Map<string, Map<string, number>>();

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

      const hourBucket = byHour.get(curr.captured_hour) || new Map<string, number>();
      hourBucket.set(channelId, (hourBucket.get(channelId) || 0) + deltaViews);
      byHour.set(curr.captured_hour, hourBucket);
    }
  }

  const hourKeys = Array.from(byHour.keys()).sort().slice(-hours);

  const points: ChannelViewsHistoryPoint[] = [];
  for (const hourKey of hourKeys) {
    const hourBucket = byHour.get(hourKey)!;
    for (const channel of channels) {
      points.push({
        capturedAt: hourKey,
        channelId: channel.channelId,
        totalViews: hourBucket.get(channel.channelId) || 0,
      });
    }
  }

  return { channels, points };
}
