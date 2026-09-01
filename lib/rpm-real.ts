// Lookup do RPM real por vídeo, importado via CSV do YouTube Studio
// (ver Parte 3 = endpoint de upload, tabela `video_rpm_real`).
//
// Usado pela Parte 5 do plano "Importar RPM real via CSV": os pontos de
// cálculo de ganhos em `lib/data.ts` vão chamar `getRealRpmMap()` uma vez
// e consultar o mapa por `youtube_video_id`, em vez de bater no banco
// vídeo a vídeo.
//
// Se não houver RPM real pra um vídeo, o mapa simplesmente não tem aquela
// chave — quem consome decide o fallback (RPM fixo).
//
// Usa o cliente de service_role (não o anônimo) porque `video_rpm_real`
// tem RLS ligado sem nenhuma política de leitura cadastrada — com o
// cliente anônimo, toda consulta aqui falhava silenciosamente (erro
// logado, mapa vazio) e o cálculo de ganhos caía 100% no RPM fixo mesmo
// quando havia RPM real importado via CSV. Este módulo só é chamado a
// partir de `lib/data.ts`, sempre em código de servidor, então usar
// service_role aqui é seguro (mesmo padrão já usado pras outras tabelas
// da aba Ganhos).

import { getServiceSupabase } from "./supabase";
import { estimateEarnings } from "./creator-earnings";

export type RealRpmEntry = {
  rpm: number;
  receita: number | null;
  views: number | null;
};

export type RealRpmMap = Map<string, RealRpmEntry>;

/**
 * Busca todos os RPMs reais salvos em `video_rpm_real` e devolve um mapa
 * `youtube_video_id -> { rpm, receita, views }` pra lookup O(1).
 *
 * Cada `youtube_video_id` tem no máximo uma linha na tabela (upsert na
 * importação do CSV), então não tem ambiguidade de qual pegar.
 */
export async function getRealRpmMap(): Promise<RealRpmMap> {
  const map: RealRpmMap = new Map();

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("video_rpm_real")
    .select("youtube_video_id, rpm, receita, views");

  if (error) {
    console.error("❌ Erro ao ler video_rpm_real:", error);
    return map;
  }

  for (const row of data ?? []) {
    if (!row.youtube_video_id || row.rpm == null) continue;
    map.set(row.youtube_video_id, {
      rpm: Number(row.rpm),
      receita: row.receita == null ? null : Number(row.receita),
      views: row.views == null ? null : Number(row.views),
    });
  }

  return map;
}

/**
 * Busca o RPM real de um único vídeo. Prefira `getRealRpmMap()` quando for
 * consultar vários vídeos (evita 1 query por vídeo).
 */
export async function getRealRpmForVideo(youtubeVideoId: string): Promise<number | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("video_rpm_real")
    .select("rpm")
    .eq("youtube_video_id", youtubeVideoId)
    .maybeSingle();

  if (error) {
    console.error("❌ Erro ao ler video_rpm_real p/ vídeo:", youtubeVideoId, error);
    return null;
  }

  return data?.rpm == null ? null : Number(data.rpm);
}

/**
 * Soma a receita estimada de um grupo de vídeos, usando o RPM real de
 * cada um quando existir (fallback pro fixo, vídeo a vídeo).
 *
 * Existe pra substituir o padrão antigo de "somar as views do grupo e
 * aplicar um RPM único em cima do total" (ex: `estimateEarnings(shortsViews,
 * true)`) — que ficou incorreto assim que RPM real entrou em cena, porque
 * dois vídeos do mesmo formato podem ter RPM real bem diferente entre si.
 * Somar por vídeo é o único jeito de cada um usar o RPM que é dele.
 */
export function sumEstimatedEarnings(
  rows: { view_count: number; is_short: boolean; youtube_video_id: string }[],
  realRpmMap: RealRpmMap
): number {
  return Math.round(
    rows.reduce(
      (sum, r) =>
        sum + estimateEarnings(r.view_count || 0, r.is_short, realRpmMap.get(r.youtube_video_id)?.rpm),
      0
    ) * 100
  ) / 100;
}
