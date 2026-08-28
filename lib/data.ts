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
} from "./supabase";
import { isShortVideo } from "./youtube-channel";
import { CREATORS, CreatorKey, FIXED_RPM, estimateEarnings } from "./creator-earnings";

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
    const first = group[0];
    const creatorLabel = group
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
      revenue: estimateEarnings(first.view_count),
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
};

export type GanhosData = {
  creators: CreatorStats[];
  lastSyncedAt: string | null;
  totalVideosScanned: number;
  // Janela de 28 dias usada pra filtrar quais vídeos entram no cálculo —
  // baseada na data de publicação do vídeo (é a forma mais simples de
  // aproximar "últimos 28 dias" sem precisar de snapshot diário de views).
  periodStart: string;
  periodEnd: string;
  periodViews: number;
  periodEarnings: number;
  // true quando periodEarnings veio do valor real digitado manualmente,
  // false quando é estimativa por RPM.
  isManualRevenue: boolean;
  manualRevenueAmount: number | null;
};

// Lê a tabela `creator_videos` (populada pela varredura por hashtag em
// /api/ganhos/sync), filtra pelos últimos 28 dias (por data de publicação)
// e agrega em estatísticas por criador — views e ganhos, separados entre
// Shorts e vídeos longos. A receita total do período usa o valor real
// digitado manualmente quando existir; senão cai na estimativa por RPM.
// Cada criador recebe a fatia da receita total proporcional à sua % de
// views no período (não mais um cálculo independente por criador).
export async function getCreatorEarnings(): Promise<GanhosData> {
  // Usa o client com service_role pra não depender de RLS estar liberado
  // pra leitura anônima nessas tabelas.
  const db = getServiceSupabase();

  const [{ data, error }, { data: manualRevenueRows, error: manualRevenueError }] =
    await Promise.all([
      db.from("creator_videos").select("*"),
      db.from("manual_revenue").select("*").eq("id", "current").limit(1),
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

  // Só entram no cálculo os vídeos publicados dentro dos últimos 28 dias.
  const rows = allRows.filter((r) => {
    if (!r.published_at) return false;
    const published = new Date(r.published_at).getTime();
    return published >= periodStart.getTime() && published <= periodEnd.getTime();
  });

  const manualAmount =
    manualRevenueRows && manualRevenueRows[0]
      ? (manualRevenueRows[0] as ManualRevenueRow).amount
      : null;

  // Views totais do período, somando os 3 criadores. Um vídeo com 2
  // hashtags (colab) conta pra cada criador separadamente — de propósito,
  // igual já era antes.
  const periodViews = rows.reduce((sum, r) => sum + (r.view_count || 0), 0);

  const isManualRevenue = manualAmount != null;
  const periodEarnings = isManualRevenue
    ? (manualAmount as number)
    : estimateEarnings(periodViews);

  const creators: CreatorStats[] = CREATORS.map(({ key, label, hashtag }) => {
    const creatorRows = rows.filter((r) => r.creator === key);
    const shorts = creatorRows.filter((r) => r.is_short);
    const longs = creatorRows.filter((r) => !r.is_short);

    const shortsViews = shorts.reduce((sum, r) => sum + (r.view_count || 0), 0);
    const longViews = longs.reduce((sum, r) => sum + (r.view_count || 0), 0);
    const totalViews = shortsViews + longViews;

    // Fatia da receita total do período proporcional à % de views desse
    // criador — é aqui que o valor real (quando existe) entra na conta.
    const viewsSharePct = periodViews > 0 ? (totalViews / periodViews) * 100 : 0;
    const totalEarnings =
      periodViews > 0 ? Math.round(periodEarnings * (totalViews / periodViews) * 100) / 100 : 0;

    // Dentro da fatia do criador, Shorts x longos dividem proporcional às
    // views de cada um (mantém a mesma lógica pro breakdown do card).
    const shortsEarnings =
      totalViews > 0 ? Math.round(totalEarnings * (shortsViews / totalViews) * 100) / 100 : 0;
    const longEarnings = Math.round((totalEarnings - shortsEarnings) * 100) / 100;

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
      rpm: FIXED_RPM,
    };
  });

  const lastSyncedAt = allRows.reduce<string | null>((latest, r) => {
    if (!r.synced_at) return latest;
    if (!latest || new Date(r.synced_at) > new Date(latest)) return r.synced_at;
    return latest;
  }, null);

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
  };
}
