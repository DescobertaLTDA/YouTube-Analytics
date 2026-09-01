"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format-br";

// Formata uma string de dígitos (centavos, sem separador) como moeda BRL
// pra exibir dentro do input enquanto a pessoa digita — ex: "297937" vira
// "R$ 2.979,37". Mesma lógica de máscara usada em app de banco: cada
// dígito novo entra pela direita, empurrando os centavos.
function formatDigitsAsCurrency(digits: string): string {
  const clean = digits.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!clean) return "";
  const cents = clean.padStart(3, "0");
  const intPart = cents.slice(0, -2);
  const centPart = cents.slice(-2);
  const intFormatted = new Intl.NumberFormat("pt-BR").format(Number(intPart));
  return `R$ ${intFormatted},${centPart}`;
}

function digitsToNumber(digits: string): number {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return 0;
  return Number(clean) / 100;
}

function numberToDigits(n: number): string {
  return String(Math.round(n * 100));
}

export function RevenueStatCard({
  periodEarnings,
  isManualRevenue,
  manualRevenueAmount,
}: {
  periodEarnings: number;
  isManualRevenue: boolean;
  manualRevenueAmount: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState(
    manualRevenueAmount != null ? numberToDigits(manualRevenueAmount) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDigits(manualRevenueAmount != null ? numberToDigits(manualRevenueAmount) : "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(amount: number | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/ganhos/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "falha ao salvar");
      }
      setOpen(false);
      router.refresh();
    } catch {
      alert("Não consegui salvar o valor. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  const amount = digitsToNumber(digits);

  return (
    <>
      <button
        type="button"
        className="stat-card stat-card-revenue stat-card-clickable"
        onClick={() => setOpen(true)}
        aria-label="Editar valor real"
        title="Clique para inserir o valor real"
      >
        <div className="stat-value-large malachite">{formatCurrency(periodEarnings)}</div>
        <div className="stat-label">
          {isManualRevenue ? "Receita real · 28d" : "Receita estimada · 28d"}
        </div>
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Valor real (28d)</h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="revenue-real-input">Receita real do período</label>
              <input
                id="revenue-real-input"
                type="text"
                inputMode="numeric"
                autoFocus
                placeholder="R$ 0,00"
                value={formatDigitsAsCurrency(digits)}
                onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
                className="rpm-input rpm-input-currency"
              />
              <span className="text-muted-small revenue-edit-hint">
                deixe em branco e salve pra voltar a usar a estimativa automática
              </span>
            </div>

            <div className="modal-actions">
              {manualRevenueAmount != null && (
                <button
                  type="button"
                  onClick={() => {
                    setDigits("");
                    save(null);
                  }}
                  disabled={saving}
                  className="btn btn-outline"
                >
                  usar estimativa
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn btn-outline"
              >
                cancelar
              </button>
              <button
                type="button"
                onClick={() => save(digits ? amount : null)}
                disabled={saving}
                className="btn rpm-save"
              >
                {saving ? "salvando..." : "salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
