"use client";

import { useEffect, useState } from "react";
import type { MonthlyEarningsPoint } from "@/lib/data";
import type { CreatorKey } from "@/lib/creator-earnings";
import { IconHistory, IconCalendar } from "@/app/components/Icons";
import { formatNumber, formatCurrency } from "@/lib/format-br";

// Botão "Histórico de Ganhos" do card de cada criador. Ao abrir, busca sob
// demanda (fetch em /api/ganhos/historico) o total de views e receita
// estimada de cada mês calendário fechado (dia 01 ao último dia do mês)
// desde que a coleta diária de views começou a rodar — não é carregado
// junto com o resto da página porque varre o histórico inteiro, mais
// pesado que o resto do dashboard.
export function CreatorEarningsHistoryButton({
  creatorKey,
  creatorLabel,
}: {
  creatorKey: CreatorKey;
  creatorLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<MonthlyEarningsPoint[] | null>(null);

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

  useEffect(() => {
    if (!open || months !== null || loading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/ganhos/historico")
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        if (result.error) throw new Error(result.error);
        const history = result.history?.[creatorKey] ?? [];
        setMonths(history as MonthlyEarningsPoint[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar histórico");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, months, loading, creatorKey]);

  return (
    <>
      <button
        type="button"
        className="btn-historico icon-label"
        onClick={() => setOpen(true)}
      >
        <IconHistory /> Histórico de Ganhos
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Histórico de Ganhos de {creatorLabel}</h2>
                <p className="drawer-subtitle">Ganhos estimados por mês, dia 01 ao último dia</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="drawer-body">
              <p className="audit-note">
                Cobre só a receita do YouTube (Shorts + vídeos longos), estimada por RPM — ou pela
                receita oficial já liberada pelo YouTube, quando disponível. Vendas Shopee e Cakto de
                meses passados não entram aqui: essas duas fontes só guardam o total dos últimos 28
                dias, sem histórico mensal.
              </p>

              {loading && <div className="no-changes">Carregando histórico...</div>}

              {error && <div className="no-changes">Não deu pra carregar o histórico: {error}</div>}

              {!loading && !error && months && months.length === 0 && (
                <div className="no-changes">
                  Ainda não há mês fechado no histórico — a coleta diária de views precisa cobrir um
                  mês inteiro antes de aparecer aqui.
                </div>
              )}

              {!loading &&
                !error &&
                months &&
                months.length > 0 &&
                months.map((m) => (
                  <div className="history-month-row" key={m.monthKey}>
                    <div className="history-month-info">
                      <span className="icon-label history-month-label">
                        <IconCalendar /> {m.label}
                      </span>
                      <span className="text-muted-small">
                        {m.rangeLabel} · {formatNumber(m.views)} views
                      </span>
                    </div>
                    <span className="history-month-value">{formatCurrency(m.earnings)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
