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
  currentMonthLabel,
  currentMonthEarnings,
  currentMonthViews,
}: {
  creatorKey: CreatorKey;
  creatorLabel: string;
  // Mês em curso (ainda não fechado) — vem direto das stats já calculadas
  // na página principal (stats.monthEarnings/monthViews), sem precisar de
  // outra chamada pesada só pra mostrar isso no topo do histórico, igual
  // o "Seus ganhos" do próprio YouTube Studio faz com "setembro (em
  // curso)".
  currentMonthLabel: string;
  currentMonthEarnings: number;
  currentMonthViews: number;
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

  // fetchKey muda toda vez que o usuário clica em "Tentar de novo" —
  // força o efeito abaixo a rodar de novo mesmo já tendo dado erro antes.
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!open || months !== null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // A varredura de histórico mensal é pesada (tabela inteira +
    // chamadas à API do YouTube por vídeo) e pode legitimamente demorar
    // — mas sem um limite no lado do cliente, uma falha de rede ou uma
    // function que trava na Vercel deixa o drawer preso em "Carregando
    // histórico..." pra sempre, sem qualquer sinal pro criador. 55s dá
    // uma folga curta em relação ao maxDuration=60s da function, pra
    // quase sempre ser a própria resposta do servidor a chegar primeiro.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    fetch("/api/ganhos/historico", { signal: controller.signal })
      .then(async (res) => {
        const result = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(result?.error || `Erro ${res.status} ao carregar histórico`);
        }
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        if (result?.error) throw new Error(result.error);
        const history = result?.history?.[creatorKey] ?? [];
        setMonths(history as MonthlyEarningsPoint[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        setError(
          isAbort
            ? "Demorou demais pra responder. Tente de novo em alguns segundos."
            : err instanceof Error
            ? err.message
            : "Erro ao carregar histórico"
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, months, creatorKey, fetchKey]);

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

              {/* Mês em curso primeiro, igual o "Seus ganhos" do YouTube Studio —
                  não depende do fetch de histórico, então aparece na hora. */}
              <div className="history-month-row history-month-row-current">
                <div className="history-month-info">
                  <span className="icon-label history-month-label">
                    <IconCalendar /> {currentMonthLabel}
                    <span className="history-current-badge">em curso</span>
                  </span>
                  <span className="text-muted-small">{formatNumber(currentMonthViews)} views</span>
                </div>
                <span className="history-month-value history-month-value-current">
                  {formatCurrency(currentMonthEarnings)}
                </span>
              </div>

              {loading && <div className="no-changes">Carregando histórico...</div>}

              {error && (
                <div className="no-changes history-error">
                  <span>Não deu pra carregar o histórico: {error}</span>
                  <button
                    type="button"
                    className="btn-historico-retry"
                    onClick={() => {
                      setMonths(null);
                      setFetchKey((k) => k + 1);
                    }}
                  >
                    Tentar de novo
                  </button>
                </div>
              )}

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
