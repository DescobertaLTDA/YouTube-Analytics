"use client";

import { useEffect } from "react";
import type { CreatorStats } from "@/lib/data";
import {
  IconDollar,
  IconZap,
  IconFilm,
  IconTarget,
  IconTrendingUp,
  IconEye,
  IconCalendar,
} from "@/app/components/Icons";
import {
  SHORTS_COUNT_GOAL,
  LONG_COUNT_GOAL,
  SHORTS_REVENUE_GOAL,
  LONG_REVENUE_GOAL,
} from "@/lib/creator-earnings";

function formatNumber(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

// Média simples: total / contagem. Retorna null quando não há vídeos ainda,
// pra mostrar "—" em vez de dividir por zero.
function average(total: number, count: number): number | null {
  if (!count) return null;
  return total / count;
}

// Dias restantes no mês corrente (incluindo hoje), usado pra projetar o
// ritmo diário necessário até a virada do mês.
function daysLeftInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - now.getDate() + 1, 1);
}

function StatBlock({
  icon,
  label,
  value,
  valueClassName,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
}) {
  return (
    <div className="insights-stat">
      <span className="icon-label insights-stat-label" title={label}>
        {icon}
        <span className="insights-stat-label-text">{label}</span>
      </span>
      <span className={`insights-stat-value ${valueClassName || ""}`}>{value}</span>
      {sub && (
        <span className="insights-stat-sub" title={sub}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function CreatorInsightsModal({
  stats,
  onClose,
}: {
  stats: CreatorStats;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Médias por vídeo publicado, com base na janela de 28 dias (período)
  // que já alimenta o resto do card.
  const avgEarningsOverall = average(stats.totalEarnings, stats.periodCount);
  const avgEarningsShorts = average(stats.shortsEarnings, stats.shortsCount);
  const avgEarningsLong = average(stats.longEarnings, stats.longCount);
  const avgViewsShorts = average(stats.shortsViews, stats.shortsCount);
  const avgViewsLong = average(stats.longViews, stats.longCount);

  // Quantos vídeos faltam pra bater a meta de quantidade do mês (nunca
  // negativo — meta já batida mostra 0).
  const shortsCountMissing = Math.max(SHORTS_COUNT_GOAL - stats.monthShortsCount, 0);
  const longCountMissing = Math.max(LONG_COUNT_GOAL - stats.monthLongCount, 0);

  // Quantos vídeos, no ritmo médio de ganho atual, ainda faltam publicar
  // pra cobrir a receita que falta pra meta do mês. Sem média disponível
  // (nenhum vídeo do formato ainda) fica null → mostra "—".
  const shortsRevenueMissing = Math.max(SHORTS_REVENUE_GOAL - stats.monthShortsEarnings, 0);
  const longRevenueMissing = Math.max(LONG_REVENUE_GOAL - stats.monthLongEarnings, 0);
  const shortsVideosToGoal =
    shortsRevenueMissing > 0
      ? avgEarningsShorts && avgEarningsShorts > 0
        ? Math.ceil(shortsRevenueMissing / avgEarningsShorts)
        : null
      : 0;
  const longVideosToGoal =
    longRevenueMissing > 0
      ? avgEarningsLong && avgEarningsLong > 0
        ? Math.ceil(longRevenueMissing / avgEarningsLong)
        : null
      : 0;

  // Ritmo diário necessário até o fim do mês pra bater a meta de receita
  // total (Shorts + longos), com base no que já falta e nos dias restantes.
  const daysLeft = daysLeftInMonth();
  const totalRevenueGoal = SHORTS_REVENUE_GOAL + LONG_REVENUE_GOAL;
  const totalRevenueMissing = Math.max(totalRevenueGoal - stats.monthEarnings, 0);
  const dailyPaceNeeded = totalRevenueMissing > 0 ? totalRevenueMissing / daysLeft : 0;

  // Projeção simples de fechamento do mês: ganhos já feitos + (ritmo médio
  // diário observado até agora × dias restantes). Usa a mesma janela do
  // "Ganhos do mês" do card.
  const now = new Date();
  const daysElapsed = now.getDate();
  const dailyPaceObserved = daysElapsed > 0 ? stats.monthEarnings / daysElapsed : 0;
  const projectedMonthEnd = stats.monthEarnings + dailyPaceObserved * (daysLeft - 1);

  const goalPct =
    totalRevenueGoal > 0
      ? Math.min(Math.round((stats.monthEarnings / totalRevenueGoal) * 100), 999)
      : 0;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Insights de {stats.label}</h2>
            <p className="drawer-subtitle">Médias e projeções · janela de 28 dias</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="goal-drawer-section">
          <h3 className="goal-drawer-section-title icon-label">
            <IconDollar /> Médias de ganhos
          </h3>
          <div className="insights-grid">
            <StatBlock
              icon={<IconTrendingUp />}
              label="Média geral"
              value={formatCurrency(avgEarningsOverall)}
              valueClassName="malachite"
              sub={`${formatNumber(stats.periodCount)} vídeo(s) no período`}
            />
            <StatBlock
              icon={<IconZap />}
              label="Média por Short"
              value={formatCurrency(avgEarningsShorts)}
              sub={
                avgViewsShorts != null
                  ? `${formatNumber(avgViewsShorts)} views em média`
                  : "sem Shorts no período"
              }
            />
            <StatBlock
              icon={<IconFilm />}
              label="Média por longo"
              value={formatCurrency(avgEarningsLong)}
              sub={
                avgViewsLong != null
                  ? `${formatNumber(avgViewsLong)} views em média`
                  : "sem vídeos longos no período"
              }
            />
          </div>
        </div>

        <div className="goal-drawer-section">
          <h3 className="goal-drawer-section-title icon-label">
            <IconTarget /> O que falta pra bater a meta do mês
          </h3>
          <div className="insights-grid">
            <StatBlock
              icon={<IconZap />}
              label="Shorts a postar"
              value={
                shortsVideosToGoal === 0
                  ? "Meta batida"
                  : shortsVideosToGoal != null
                  ? `${formatNumber(shortsVideosToGoal)} vídeo(s)`
                  : `${formatNumber(shortsCountMissing)} vídeo(s) (qtd.)`
              }
              sub={`faltam ${formatCurrency(shortsRevenueMissing)} de receita`}
            />
            <StatBlock
              icon={<IconFilm />}
              label="Longos a postar"
              value={
                longVideosToGoal === 0
                  ? "Meta batida"
                  : longVideosToGoal != null
                  ? `${formatNumber(longVideosToGoal)} vídeo(s)`
                  : `${formatNumber(longCountMissing)} vídeo(s) (qtd.)`
              }
              sub={`faltam ${formatCurrency(longRevenueMissing)} de receita`}
            />
            <StatBlock
              icon={<IconCalendar />}
              label="Ritmo diário"
              value={dailyPaceNeeded > 0 ? formatCurrency(dailyPaceNeeded) : "Meta batida"}
              sub={`${daysLeft} dia(s) restantes no mês`}
            />
          </div>
        </div>

        <div className="goal-drawer-section">
          <h3 className="goal-drawer-section-title icon-label">
            <IconEye /> Projeção de fechamento
          </h3>
          <div className="insights-grid">
            <StatBlock
              icon={<IconTrendingUp />}
              label="Projeção do mês"
              value={formatCurrency(projectedMonthEnd)}
              valueClassName="malachite"
              sub="no ritmo diário observado até agora"
            />
            <StatBlock
              icon={<IconTarget />}
              label="% da meta"
              value={`${goalPct}%`}
              sub={`${formatCurrency(stats.monthEarnings)} / ${formatCurrency(totalRevenueGoal)}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
