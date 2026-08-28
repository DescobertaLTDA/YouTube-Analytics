import type { CreatorStats } from "@/lib/data";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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
          ganhos estimados · {formatNumber(stats.totalViews)} views
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
