"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CreatorStats } from "@/lib/data";
import { IconTarget, IconDollar, IconEye, IconZap, IconFilm } from "@/app/components/Icons";
import {
  LONG_COUNT_GOAL,
  LONG_REVENUE_GOAL,
  LONG_VIEWS_GOAL,
  SHORTS_COUNT_GOAL,
  SHORTS_REVENUE_GOAL,
  SHORTS_VIEWS_GOAL,
} from "@/lib/creator-earnings";
import { formatNumber, formatCurrency } from "@/lib/format-br";

function GoalRow({
  icon,
  label,
  value,
  goal,
  format,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  goal: number;
  format: (n: number) => string;
}) {
  const pct = goal > 0 ? Math.min(Math.max((value / goal) * 100, 0), 100) : 0;
  return (
    <div className="goal-drawer-row">
      <div className="creator-goal-header">
        <span className="icon-label">
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

export function CreatorGoalsButton({
  stats,
  monthFullLabel,
}: {
  stats: CreatorStats;
  monthFullLabel: string;
}) {
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
      <button type="button" className="btn-ver-metas icon-label" onClick={() => setOpen(true)}>
        <IconTarget /> Ver metas de {stats.label}
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Metas de {stats.label}</h2>
                <p className="drawer-subtitle">{monthFullLabel}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="goal-drawer-section">
              <h3 className="goal-drawer-section-title icon-label">
                <IconZap /> Shorts
              </h3>
              <GoalRow
                icon={<IconTarget />}
                label="Meta de Shorts"
                value={stats.monthShortsCount}
                goal={SHORTS_COUNT_GOAL}
                format={formatNumber}
              />
              <GoalRow
                icon={<IconDollar />}
                label="Meta de receita com Shorts"
                value={stats.monthShortsEarnings}
                goal={SHORTS_REVENUE_GOAL}
                format={formatCurrency}
              />
              <GoalRow
                icon={<IconEye />}
                label="Meta de views com Shorts"
                value={stats.monthShortsViews}
                goal={SHORTS_VIEWS_GOAL}
                format={formatNumber}
              />
            </div>

            <div className="goal-drawer-section">
              <h3 className="goal-drawer-section-title icon-label">
                <IconFilm /> Vídeos longos
              </h3>
              <GoalRow
                icon={<IconTarget />}
                label="Meta de vídeos longos"
                value={stats.monthLongCount}
                goal={LONG_COUNT_GOAL}
                format={formatNumber}
              />
              <GoalRow
                icon={<IconDollar />}
                label="Meta de receita com vídeos longos"
                value={stats.monthLongEarnings}
                goal={LONG_REVENUE_GOAL}
                format={formatCurrency}
              />
              <GoalRow
                icon={<IconEye />}
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
