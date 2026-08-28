"use client";

import { useEffect, useState } from "react";
import type { CreatorStats } from "@/lib/data";
import {
  LONG_COUNT_GOAL,
  LONG_REVENUE_GOAL,
  LONG_VIEWS_GOAL,
  SHORTS_COUNT_GOAL,
  SHORTS_REVENUE_GOAL,
  SHORTS_VIEWS_GOAL,
} from "@/lib/creator-earnings";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthRangeFullLabel() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now);
  return `01 a ${lastDay} de ${month}`;
}

function GoalRow({
  icon,
  label,
  value,
  goal,
  format,
}: {
  icon: string;
  label: string;
  value: number;
  goal: number;
  format: (n: number) => string;
}) {
  const pct = goal > 0 ? Math.min(Math.max((value / goal) * 100, 0), 100) : 0;
  return (
    <div className="goal-drawer-row">
      <div className="creator-goal-header">
        <span>
          {icon} {label}
        </span>
        <span className="text-muted-small">
          {format(value)} / {format(goal)}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CreatorGoalsButton({ stats }: { stats: CreatorStats }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className="btn-ver-metas" onClick={() => setOpen(true)}>
        🎯 Ver metas de {stats.label}
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Metas de {stats.label}</h2>
                <p className="drawer-subtitle">{monthRangeFullLabel()}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="goal-drawer-section">
              <h3 className="goal-drawer-section-title">⚡ Shorts</h3>
              <GoalRow
                icon="🎯"
                label="Meta de Shorts"
                value={stats.monthShortsCount}
                goal={SHORTS_COUNT_GOAL}
                format={formatNumber}
              />
              <GoalRow
                icon="💰"
                label="Meta de receita com Shorts"
                value={stats.monthShortsEarnings}
                goal={SHORTS_REVENUE_GOAL}
                format={formatCurrency}
              />
              <GoalRow
                icon="👀"
                label="Meta de views com Shorts"
                value={stats.monthShortsViews}
                goal={SHORTS_VIEWS_GOAL}
                format={formatNumber}
              />
            </div>

            <div className="goal-drawer-section">
              <h3 className="goal-drawer-section-title">🎬 Vídeos longos</h3>
              <GoalRow
                icon="🎯"
                label="Meta de vídeos longos"
                value={stats.monthLongCount}
                goal={LONG_COUNT_GOAL}
                format={formatNumber}
              />
              <GoalRow
                icon="💰"
                label="Meta de receita com vídeos longos"
                value={stats.monthLongEarnings}
                goal={LONG_REVENUE_GOAL}
                format={formatCurrency}
              />
              <GoalRow
                icon="👀"
                label="Meta de views com vídeos longos"
                value={stats.monthLongViews}
                goal={LONG_VIEWS_GOAL}
                format={formatNumber}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
