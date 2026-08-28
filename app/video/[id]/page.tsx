import Link from "next/link";
import { getAllVideoRows } from "@/lib/data";
import { RoteiroButton } from "@/app/components/RoteiroButton";
import { RoteirosList } from "@/app/components/RoteirosList";
import { notFound } from "next/navigation";
import { IconSearch, IconBarChart, IconFileText, IconClipboard } from "@/app/components/Icons";

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

// Formata data apenas para o gráfico (mais curta)
function formatChartDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'short'
  });
}

async function getVideoData(videoId: string) {
  const allData = await getAllVideoRows();
  return allData.find(item => item.video.id === videoId);
}

export default async function VideoPage({ params }: { params: { id: string } }) {
  const videoData = await getVideoData(params.id);
  
  if (!videoData) {
    notFound();
  }

  const { video, latest, viewsPerDay, daysLive, manual, revenue, history, changes, isShort, source } =
    videoData;
  const backHref = isShort ? "/shorts" : "/videos";
  const backLabel = isShort ? "← Voltar aos Shorts" : "← Voltar aos Vídeos";

  // Dados para o gráfico - ordenados por data (mais antigo primeiro)
  const chartData = [...history]
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())
    .map(snapshot => ({
      date: formatChartDate(snapshot.captured_at),
      views: snapshot.view_count || 0,
      fullDate: snapshot.captured_at
    }));

  const youtubeVideoId = video.youtube_video_id;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <Link href={backHref} className="back-link">
            {backLabel}
          </Link>
          <span className="eyebrow">{video.channel_label ?? "Vídeo"}</span>
          <h1 className="title">{latest?.title ?? "Sem título"}</h1>
          <p className="subtitle">
            ID: {youtubeVideoId} · Publicado em {formatDate(video.published_at)}
          </p>
          {source === "auto" && (
            <p className="subtitle icon-label" style={{ marginTop: 4 }}>
              <IconSearch /> Achado automaticamente pela varredura de hashtag da aba Ganhos — ainda não
              cadastrado manualmente, então não tem histórico de views nem dados do Studio ainda.
            </p>
          )}
        </div>
        <div className="sync-pill">
          último snapshot: <strong>{formatDate(latest?.captured_at)}</strong>
        </div>
      </div>

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

      {/* GRÁFICO CORRIGIDO */}
      <div className="chart-section">
        <h2 className="icon-label">
          <IconBarChart /> Evolução de Views
        </h2>
        <div className="chart-container">
          {chartData.length > 1 ? (
            <div className="chart-line-wrapper">
              <svg className="chart-line" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid meet">
                {/* Grid lines */}
                <line x1="0" y1="40" x2="600" y2="40" stroke="#e9ecef" strokeWidth="1" />
                <line x1="0" y1="80" x2="600" y2="80" stroke="#e9ecef" strokeWidth="1" />
                <line x1="0" y1="120" x2="600" y2="120" stroke="#e9ecef" strokeWidth="1" />
                <line x1="0" y1="160" x2="600" y2="160" stroke="#e9ecef" strokeWidth="1" />
                
                {/* Área sob a linha */}
                <polygon
                  points={(() => {
                    const maxViews = Math.max(...chartData.map(d => d.views), 1);
                    const points = chartData.map((d, i) => {
                      const x = (i / (chartData.length - 1)) * 600;
                      const y = 200 - (d.views / maxViews) * 160 - 20;
                      return `${x},${y}`;
                    }).join(' ');
                    return points + ` 600,180 0,180`;
                  })()}
                  fill="url(#areaGradient)"
                  opacity="0.3"
                />
                
                {/* Linha do gráfico */}
                <polyline
                  points={(() => {
                    const maxViews = Math.max(...chartData.map(d => d.views), 1);
                    return chartData.map((d, i) => {
                      const x = (i / (chartData.length - 1)) * 600;
                      const y = 200 - (d.views / maxViews) * 160 - 20;
                      return `${x},${y}`;
                    }).join(' ');
                  })()}
                  fill="none"
                  stroke="#4a90e2"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {/* Gradient */}
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4a90e2" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#4a90e2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Pontos de dados */}
                {chartData.map((d, i) => {
                  const maxViews = Math.max(...chartData.map(p => p.views), 1);
                  const x = (i / (chartData.length - 1)) * 600;
                  const y = 200 - (d.views / maxViews) * 160 - 20;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="5"
                      fill="#4a90e2"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  );
                })}
                
                {/* Labels das datas */}
                {chartData.map((d, i) => {
                  const x = (i / (chartData.length - 1)) * 600;
                  return (
                    <text
                      key={i}
                      x={x}
                      y="195"
                      textAnchor="middle"
                      fontSize="10"
                      fill="#97a19c"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {d.date}
                    </text>
                  );
                })}
              </svg>
            </div>
          ) : (
            <p className="chart-empty">Dados insuficientes para gerar o gráfico</p>
          )}
        </div>
      </div>

      {/* ROTEIRO COM TIMESTAMPS CLICÁVEIS */}
      <div className="roteiro-section">
        <div className="roteiro-header">
          <h2 className="icon-label">
            <IconFileText /> Roteiro do Vídeo
          </h2>
          <RoteiroButton 
            videoId={youtubeVideoId}
            videoTitle={latest?.title || 'Sem título'}
            videoLabel={video.channel_label || 'Vídeo'}
          />
        </div>
        
        <RoteirosList videoId={youtubeVideoId} />
      </div>

      <div className="changes-section">
        <h2 className="icon-label">
          <IconClipboard /> Histórico de Alterações
        </h2>
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
