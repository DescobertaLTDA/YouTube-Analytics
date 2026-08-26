import Link from "next/link";  // <-- ADICIONE ESTA LINHA
import { getDashboardData } from "@/lib/data";
import { RoteiroButton } from "@/app/components/RoteiroButton";
import { notFound } from "next/navigation";

export const revalidate = 0;

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { 
    day: "2-digit", 
    month: "short", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

// Busca os dados do vídeo específico
async function getVideoData(videoId: string) {
  const allData = await getDashboardData();
  return allData.find(item => item.video.id === videoId);
}

export default async function VideoPage({ params }: { params: { id: string } }) {
  const videoData = await getVideoData(params.id);
  
  if (!videoData) {
    notFound();
  }

  const { video, latest, viewsPerDay, daysLive, manual, revenue, history, changes } = videoData;

  // Dados para o gráfico (histórico de views)
  const chartData = history.map(snapshot => ({
    date: formatDate(snapshot.captured_at),
    views: snapshot.view_count || 0
  }));

  return (
    <main className="page">
      {/* Header com voltar */}
      <div className="header-row">
        <div>
          <Link href="/" className="back-link">
            ← Voltar ao painel
          </Link>
          <span className="eyebrow">{video.channel_label ?? "Vídeo"}</span>
          <h1 className="title">{latest?.title ?? "Sem título"}</h1>
          <p className="subtitle">
            ID: {video.youtube_video_id} · Publicado em {formatDate(video.published_at)}
          </p>
        </div>
        <div className="sync-pill">
          último snapshot: <strong>{formatDate(latest?.captured_at)}</strong>
        </div>
      </div>

      {/* Grid de estatísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value-large malachite">{formatNumber(latest?.view_count)}</div>
          <div className="stat-label">Views Totais</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large amber">{viewsPerDay != null ? formatNumber(viewsPerDay) : "—"}</div>
          <div className="stat-label">Views / Dia · {daysLive || 0}d</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{manual?.ctr != null ? `${manual.ctr}%` : "—"}</div>
          <div className="stat-label">CTR (Studio)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{manual?.retention_pct != null ? `${manual.retention_pct}%` : "—"}</div>
          <div className="stat-label">Retenção (Studio)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large malachite">{formatCurrency(revenue)}</div>
          <div className="stat-label">Receita Estimada</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{manual?.rpm != null ? `R$ ${manual.rpm}` : "—"}</div>
          <div className="stat-label">RPM</div>
        </div>
      </div>

      {/* Gráfico - Placeholder simples */}
      <div className="chart-section">
        <h2>📊 Evolução de Views</h2>
        <div className="chart-container">
          {chartData.length > 0 ? (
            <div className="chart-bars">
              {chartData.map((item, index) => {
                const maxViews = Math.max(...chartData.map(d => d.views), 1);
                const height = Math.max((item.views / maxViews) * 100, 5);
                return (
                  <div key={index} className="chart-bar-wrapper">
                    <div 
                      className="chart-bar" 
                      style={{ height: `${height}%` }}
                    />
                    <span className="chart-label">{item.date}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="chart-empty">Nenhum dado de histórico disponível</p>
          )}
        </div>
      </div>

      {/* Roteiro */}
      <div className="roteiro-section">
        <div className="roteiro-header">
          <h2>📝 Roteiro do Vídeo</h2>
          <RoteiroButton 
            videoId={video.youtube_video_id}
            videoTitle={latest?.title || 'Sem título'}
            videoLabel={video.channel_label || 'Vídeo'}
          />
        </div>
        
        {/* Lista de roteiros já enviados */}
        <div className="roteiros-list">
          <p className="text-muted">Clique em "Enviar Roteiro" para adicionar o transcript deste vídeo.</p>
          {/* Aqui você pode buscar e listar os roteiros já enviados para este vídeo */}
        </div>
      </div>

      {/* Histórico de mudanças */}
      <div className="changes-section">
        <h2>📋 Histórico de Alterações</h2>
        {changes.length === 0 && (
          <div className="no-changes">Nenhuma alteração registrada ainda</div>
        )}
        {changes.slice(0, 10).map((c) => (
          <div className="change-item" key={c.id}>
            <span className="change-field">{c.changed_field}</span>
            <span className="change-old">{c.old_value || "—"}</span>
            <span className="change-arrow">→</span>
            <span className="change-new">{c.new_value || "—"}</span>
            <span className="change-date">{formatDate(c.detected_at)}</span>
          </div>
        ))}
      </div>

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
