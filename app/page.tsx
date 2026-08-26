import { getDashboardData } from "@/lib/data";
import Link from "next/link";

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
    year: "numeric" 
  }).format(new Date(iso));
}

export default async function Home() {
  const rows = await getDashboardData();
  const hasData = rows.length > 0;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Painel de Acompanhamento</h1>
          <p className="subtitle">
            Views por dia, e histórico de trocas de título, thumbnail e descrição — coletados
            automaticamente via YouTube Data API v3.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <div className="nav-links">
            <a className="nav-link active" href="/">painel</a>
            <a className="nav-link" href="/transcripts">transcripts</a>
          </div>
          <div className="sync-pill">
            última sincronização: <strong>{hasData ? formatDate(rows[0].latest?.captured_at) : "—"}</strong>
          </div>
        </div>
      </div>

      {!hasData && (
        <div className="empty facet">
          <h2>Nenhum vídeo cadastrado ainda</h2>
          <p>O banco está pronto, mas a tabela <code>videos</code> está vazia.</p>
        </div>
      )}

      {hasData && (
        <div className="grid-6">
          {rows.map(({ video, latest, viewsPerDay, daysLive, manual, revenue }) => (
            <Link 
              href={`/video/${video.id}`} 
              className="card-link" 
              key={video.id}
            >
              <div className="card facet card-clickable">
                {latest?.thumbnail_url && (
                  <img 
                    className="thumb" 
                    src={latest.thumbnail_url} 
                    alt={latest.title ?? "thumbnail"} 
                  />
                )}

                <div className="card-top">
                  <div>
                    <span className="card-label">{video.channel_label ?? "vídeo"}</span>
                    <h3 className="card-title">{latest?.title ?? "sem título"}</h3>
                  </div>
                </div>

                <div className="stat-row-2">
                  <div className="stat">
                    <div className="stat-value malachite">{formatNumber(latest?.view_count)}</div>
                    <div className="stat-label">views totais</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value amber">{viewsPerDay != null ? formatNumber(viewsPerDay) : "—"}</div>
                    <div className="stat-label">views / dia</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">{manual?.ctr != null ? `${manual.ctr}%` : "—"}</div>
                    <div className="stat-label">CTR</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value malachite">{formatCurrency(revenue)}</div>
                    <div className="stat-label">receita</div>
                  </div>
                </div>

                <div className="card-footer">
                  <span className="card-click-hint">👆 Clique para detalhes</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
