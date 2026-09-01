"use client";

import { useState } from "react";
import type { CreatorStats, GanhosVideoRow } from "@/lib/data";
import { ShopeeSalesDetail } from "@/app/components/ShopeeSalesDetail";
import { CreatorGoalsButton } from "@/app/components/CreatorGoalsButton";
import { CreatorAuditButton } from "@/app/components/CreatorAuditButton";
import { CreatorInsightsModal } from "@/app/components/CreatorInsightsModal";
import { LONG_RPM, SHORTS_RPM } from "@/lib/creator-earnings";
import { IconFilm, IconZap, IconDollar, IconCalendar, IconCart } from "@/app/components/Icons";
import { formatNumber, formatCurrency } from "@/lib/format-br";

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

function formatRpm(n: number) {
  return formatCurrency(n);
}

export function CreatorCard({
  stats,
  monthLabel,
  monthFullLabel,
  daysLeft,
  daysElapsed,
  videos,
  isManualRevenue,
}: {
  stats: CreatorStats;
  // Labels de data (fuso São Paulo) calculados uma vez no server component
  // pai e repassados como prop — nunca recalculados aqui dentro, pra não
  // arriscar diferença entre o render do servidor e o da hidratação.
  monthLabel: string;
  monthFullLabel: string;
  daysLeft: number;
  daysElapsed: number;
  // Vídeos desse criador no período de 28 dias, com receita por vídeo —
  // alimenta o drawer de Auditoria.
  videos: GanhosVideoRow[];
  isManualRevenue: boolean;
}) {
  const [insightsOpen, setInsightsOpen] = useState(false);

  return (
    <div
      className="creator-card facet creator-card-clickable"
      role="button"
      tabIndex={0}
      onClick={() => setInsightsOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setInsightsOpen(true);
        }
      }}
    >
      <div className="creator-card-top">
        <div>
          <span className="card-label">{stats.hashtag}</span>
          <h3 className="creator-name">{stats.label}</h3>
        </div>
        <div className="rpm-badges">
          <span className="rpm-badge rpm-badge-long">
            <IconFilm /> RPM {formatRpm(LONG_RPM)}
          </span>
          <span className="rpm-badge rpm-badge-shorts">
            <IconZap /> RPM {formatRpm(SHORTS_RPM)}
          </span>
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
            <span className="icon-label">
              <IconZap /> Meta de Shorts (mês)
            </span>
            <span className="text-muted-small">
              {formatNumber(stats.monthShortsCount)} / {SHORTS_GOAL}
            </span>
          </div>
          <ProgressBar value={stats.monthShortsCount} goal={SHORTS_GOAL} />
        </div>
        <div className="creator-goal">
          <div className="creator-goal-header">
            <span className="icon-label">
              <IconDollar /> Meta de Receita (mês)
            </span>
            <span className="text-muted-small">
              {formatCurrency(stats.monthEarnings)} / {formatCurrency(REVENUE_GOAL)}
            </span>
          </div>
          <ProgressBar value={stats.monthEarnings} goal={REVENUE_GOAL} />
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <CreatorGoalsButton stats={stats} monthFullLabel={monthFullLabel} />
        </div>
      </div>

      <div className="creator-breakdown-item creator-month">
        <div className="creator-breakdown-header">
          <span className="icon-label">
            <IconCalendar /> Ganhos do mês ({monthLabel})
          </span>
          <span className="text-muted-small">{formatNumber(stats.monthViews)} views</span>
        </div>
        <div className="creator-breakdown-stats">
          <span className="malachite creator-month-value">{formatCurrency(stats.monthEarnings)}</span>
        </div>
      </div>

      <div className="creator-breakdown-item creator-outside-month">
        <div className="creator-breakdown-header">
          <span className="icon-label">
            <IconCalendar /> Ganhos anteriores ao mês
          </span>
          <span className="text-muted-small">
            {formatNumber(Math.max(stats.totalViews - stats.monthViews, 0))} views
          </span>
        </div>
        <div className="creator-breakdown-stats">
          <span className="creator-outside-month-value">
            {formatCurrency(Math.max(stats.totalEarnings - stats.monthEarnings, 0))}
          </span>
        </div>
        <p className="creator-outside-month-note">
          Parte do período de 28 dias que cai antes do dia 01 — não conta na meta do mês.
        </p>
      </div>

      <div className="creator-breakdown">
        <div className="creator-breakdown-item">
          <div className="creator-breakdown-header">
            <span className="icon-label">
              <IconFilm /> Vídeos longos
            </span>
            <span className="text-muted-small">{stats.longCount} vídeo(s)</span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="amber">{formatNumber(stats.longViews)} views</span>
            <span className="malachite">{formatCurrency(stats.longEarnings)}</span>
          </div>
        </div>

        <div className="creator-breakdown-item">
          <div className="creator-breakdown-header">
            <span className="icon-label">
              <IconZap /> Shorts
            </span>
            <span className="text-muted-small">{stats.shortsCount} vídeo(s)</span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="amber">{formatNumber(stats.shortsViews)} views</span>
            <span className="malachite">{formatCurrency(stats.shortsEarnings)}</span>
          </div>
        </div>

        <div className="creator-breakdown-item creator-cakto">
          <div className="creator-breakdown-header">
            <span className="icon-label">
              <IconDollar /> Vendas Cakto (28d)
            </span>
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
            <span className="icon-label">
              <IconCart /> Vendas Shopee (28d)
            </span>
            <span className="text-muted-small">
              {stats.shopeeOrders != null ? `${stats.shopeeOrders} pedido(s)` : "—"}
            </span>
          </div>
          <div className="creator-breakdown-stats">
            <span className="creator-shopee-value">{formatCurrency(stats.shopeeAmount)}</span>
          </div>
          {stats.shopeeSales && (
            <div onClick={(e) => e.stopPropagation()}>
              <ShopeeSalesDetail sales={stats.shopeeSales} />
            </div>
          )}
        </div>

        <div className="creator-audit" onClick={(e) => e.stopPropagation()}>
          <CreatorAuditButton stats={stats} videos={videos} isManualRevenue={isManualRevenue} />
        </div>
      </div>

      {insightsOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <CreatorInsightsModal
            stats={stats}
            daysLeft={daysLeft}
            daysElapsed={daysElapsed}
            onClose={() => setInsightsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
