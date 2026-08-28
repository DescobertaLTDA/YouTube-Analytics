"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(manualRevenueAmount != null ? String(manualRevenueAmount) : "");
  const [saving, setSaving] = useState(false);

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
      setEditing(false);
      router.refresh();
    } catch {
      alert("Não consegui salvar o valor. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="stat-card stat-card-revenue-editing">
        <span className="rpm-label">Valor real (28d)</span>
        <div className="revenue-edit-row">
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            placeholder="ex: 480.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rpm-input"
          />
          <button
            onClick={() => save(value ? Number(value) : null)}
            disabled={saving}
            className="rpm-save"
          >
            {saving ? "salvando..." : "salvar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(manualRevenueAmount != null ? String(manualRevenueAmount) : "");
              setEditing(false);
            }}
            disabled={saving}
            className="rpm-save rpm-cancel"
          >
            cancelar
          </button>
        </div>
        <span className="text-muted-small revenue-edit-hint">
          deixe vazio ou zero pra usar a estimativa automática
        </span>
      </div>
    );
  }

  return (
    <div className="stat-card stat-card-revenue">
      <button
        type="button"
        className="stat-edit-pencil"
        onClick={() => setEditing(true)}
        aria-label="Editar valor real"
        title="Editar valor real"
      >
        ✎
      </button>
      <div className="stat-value-large malachite">{formatCurrency(periodEarnings)}</div>
      <div className="stat-label">
        {isManualRevenue ? "Receita real · 28d" : "Receita estimada · 28d"}
      </div>
    </div>
  );
}
