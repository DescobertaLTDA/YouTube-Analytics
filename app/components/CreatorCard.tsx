import type { CreatorStats } from "@/lib/data";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthRangeLabel() {
  const now = new Date();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(now);
  const day = now.getDate();
  return `01 a ${day} de ${month}`;
}

export function CreatorCard({ stats }: { stats: CreatorStats }) {
  return (
    <div className="creator-card facet">
      <div className="creator-card-top">
        <div>
          <span className="card-label">{stats.hashtag}</span>
          <h3 className="creator-name">{stats.label}</h3>
        </div>
        <span className="rpm-badge">RPM {stats.rpm.toFixed(2)}</span>
      </div>

      <div className="creator-total">
        <div className="creator-total-value malachite">{formatCurrency(stats.totalEarnings)}</div>
        <div className="creator-total-label">
          {formatNumber(stats.totalViews)} views · {stats.viewsSharePct.toFixed(1)}% do total do
          período
        </div>
      </div>

      <div className="creator-breakdown-item creator-month">
        <div className="creator-breakdown-header">
          <span>📅 Ganhos do mês ({monthRangeLabel()})</span>
          <span className="text-muted-small">{formatNumber(stats.monthViews)} views</span>
        </div>
        <div className="creator-breakdown-stats">
          <span className="malachite creator-month-value">{formatCurrency(stats.monthEarnings)}</span>
        </div>
      </div>

      <div className="creator-breakdown">
        <div className="creator-breakdown-item">
          <div className="creator-breakdown-header">
            <span>🎬 Vídeos longos</span>
            <span className="text-muted-small">{stats.longCount} vídeo(s)</span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="amber">{formatNumber(stats.longViews)} views</span>
            <span className="malachite">{formatCurrency(stats.longEarnings)}</span>
          </div>
        </div>

        <div className="creator-breakdown-item">
          <div className="creator-breakdown-header">
            <span>⚡ Shorts</span>
            <span className="text-muted-small">{stats.shortsCount} vídeo(s)</span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="amber">{formatNumber(stats.shortsViews)} views</span>
            <span className="malachite">{formatCurrency(stats.shortsEarnings)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
