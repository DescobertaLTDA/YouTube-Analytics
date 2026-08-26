import { getServiceSupabase } from "@/lib/supabase";

export const revalidate = 0;

export default async function ChangesPage() {
  const supabase = getServiceSupabase();

  // Busca todas as mudanças com detalhes
  const { data: changes, error } = await supabase
    .from("change_log")
    .select(`
      *,
      videos:video_id (
        youtube_video_id,
        channel_label
      )
    `)
    .order("detected_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Erro ao buscar mudanças:", error);
  }

  // Busca também os snapshots para análise de tendência
  const { data: snapshots } = await supabase
    .from("video_snapshots")
    .select("*")
    .order("captured_at", { ascending: false });

  // Agrupa mudanças por vídeo
  const groupedChanges = changes?.reduce((acc, change) => {
    const key = change.video_id;
    if (!acc[key]) {
      acc[key] = {
        video: change.videos,
        changes: [],
        snapshots: [],
      };
    }
    acc[key].changes.push(change);
    return acc;
  }, {} as Record<string, any>);

  // Adiciona snapshots ao grupo
  if (snapshots) {
    for (const snapshot of snapshots) {
      if (groupedChanges[snapshot.video_id]) {
        groupedChanges[snapshot.video_id].snapshots.push(snapshot);
      }
    }
  }

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Análise</span>
          <h1 className="title">📊 Histórico de Mudanças</h1>
          <p className="subtitle">
            Acompanhe todas as alterações de título, thumbnail e descrição, 
            e veja o impacto nas views.
          </p>
        </div>
        <div className="nav-links">
          <a className="nav-link" href="/">painel</a>
          <a className="nav-link active" href="/changes">mudanças</a>
        </div>
      </div>

      {!changes || changes.length === 0 ? (
        <div className="empty facet">
          <h2>Nenhuma mudança detectada</h2>
          <p>As mudanças aparecerão aqui quando você alterar título, thumbnail ou descrição no YouTube.</p>
        </div>
      ) : (
        <div className="changes-grid">
          {Object.values(groupedChanges || {}).map((group: any) => {
            // Calcula tendência
            const sortedSnapshots = (group.snapshots || [])
              .sort((a: any, b: any) => 
                new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
              );
            
            let trend = "neutral";
            if (sortedSnapshots.length >= 2) {
              const oldest = sortedSnapshots[0];
              const newest = sortedSnapshots[sortedSnapshots.length - 1];
              const days = (new Date(newest.captured_at).getTime() - 
                           new Date(oldest.captured_at).getTime()) / (1000 * 60 * 60 * 24);
              const growth = (newest.view_count - oldest.view_count) / days;
              trend = growth > 100 ? "up" : growth < -100 ? "down" : "neutral";
            }

            return (
              <div key={group.video?.youtube_video_id || "unknown"} className="change-group">
                <div className="change-group-header">
                  <div>
                    <span className="change-group-label">
                      {group.video?.channel_label || "Vídeo"}
                    </span>
                    <h3>
                      {group.video?.youtube_video_id || "ID desconhecido"}
                    </h3>
                    <span className={`change-trend ${trend}`}>
                      {trend === "up" && "📈 Tendência de alta"}
                      {trend === "down" && "📉 Tendência de queda"}
                      {trend === "neutral" && "➡️ Estável"}
                    </span>
                  </div>
                  <span className="change-count">
                    {group.changes.length} alterações
                  </span>
                </div>

                <div className="changes-list">
                  {group.changes.slice(0, 5).map((change: any) => (
                    <div key={change.id} className="change-item-detailed">
                      <span className="change-field-badge">{change.changed_field}</span>
                      <div className="change-values">
                        <span className="change-old-value">
                          {change.old_value?.slice(0, 50) || "vazio"}
                          {change.old_value?.length > 50 && "..."}
                        </span>
                        <span className="change-arrow-detailed">→</span>
                        <span className="change-new-value">
                          {change.new_value?.slice(0, 50) || "vazio"}
                          {change.new_value?.length > 50 && "..."}
                        </span>
                      </div>
                      <span className="change-date-detailed">
                        {new Date(change.detected_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="page-footer">
        supabase · sincronização automática diária
      </footer>
    </main>
  );
}
