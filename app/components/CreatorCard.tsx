import type { CreatorStats } from "@/lib/data";
import { ShopeeSalesDetail } from "@/app/components/ShopeeSalesDetail";
import { LONG_RPM, SHORTS_RPM } from "@/lib/creator-earnings";

const SHORTS_GOAL = 30;
const REVENUE_GOAL = 1700;

function ProgressBar({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(Math.max((value / goal) * 100, 0), 100) : 0;
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatRpm(n: number) {
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
        <div className="rpm-badges">
          <span className="rpm-badge rpm-badge-long">🎬 RPM {formatRpm(LONG_RPM)}</span>
          <span className="rpm-badge rpm-badge-shorts">⚡ RPM {formatRpm(SHORTS_RPM)}</span>
        </div>
      </div>

      <div className="creator-total">
        <div className="creator-total-value malachite">{formatCurrency(stats.totalEarnings)}</div>
        <div className="creator-total-label">
          {formatNumber(stats.totalViews)} views · {stats.viewsSharePct.toFixed(1)}% do total do
          período
        </div>
        <div className="creator-video-counts">
          <span>{formatNumber(stats.periodCount)} vídeos no período</span>
          <span>{formatNumber(stats.monthCount)} vídeos no mês</span>
        </div>
      </div>

      <div className="creator-goals">
        <div className="creator-goal">
          <div className="creator-goal-header">
            <span>⚡ Meta de Shorts (mês)</span>
            <span className="text-muted-small">
              {formatNumber(stats.monthShortsCount)} / {SHORTS_GOAL}
            </span>
          </div>
          <ProgressBar value={stats.monthShortsCount} goal={SHORTS_GOAL} />
        </div>
        <div className="creator-goal">
          <div className="creator-goal-header">
            <span>💰 Meta de Receita (mês)</span>
            <span className="text-muted-small">
              {formatCurrency(stats.monthEarnings)} / {formatCurrency(REVENUE_GOAL)}
            </span>
          </div>
          <ProgressBar value={stats.monthEarnings} goal={REVENUE_GOAL} />
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

        <div className="creator-breakdown-item creator-cakto">
          <div className="creator-breakdown-header">
            <span>💰 Vendas Cakto (28d)</span>
            <span className="text-muted-small">
              {stats.caktoOrders != null ? `${stats.caktoOrders} pedido(s)` : "—"}
            </span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="creator-cakto-value">{formatCurrency(stats.caktoAmount)}</span>
          </div>
        </div>

        <div className="creator-breakdown-item creator-shopee">
          <div className="creator-breakdown-header">
            <span>🛒 Vendas Shopee (28d)</span>
            <span className="text-muted-small">
              {stats.shopeeOrders != null ? `${stats.shopeeOrders} pedido(s)` : "—"}
            </span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="creator-shopee-value">{formatCurrency(stats.shopeeAmount)}</span>
          </div>
          {stats.shopeeSales && <ShopeeSalesDetail sales={stats.shopeeSales} />}
        </div>
      </div>
    </div>
  );
}
