"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevenueOverrideForm({ currentAmount }: { currentAmount: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(currentAmount != null ? String(currentAmount) : "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  async function save(amount: number | null) {
    setSaving(true);
    setSavedOk(false);
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
      setSavedOk(true);
      router.refresh();
    } catch {
      alert("Não consegui salvar o valor. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rpm-form">
      <span className="rpm-label">Valor real (28 dias, R$)</span>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="ex: 480.00"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSavedOk(false);
        }}
        className="rpm-input"
      />
      <button onClick={() => save(value ? Number(value) : null)} disabled={saving || !value} className="rpm-save">
        {saving ? "salvando..." : "salvar"}
      </button>
      {currentAmount != null && (
        <button
          onClick={() => {
            setValue("");
            save(null);
          }}
          disabled={saving}
          className="rpm-save"
          style={{ background: "transparent", color: "inherit" }}
        >
          usar estimativa
        </button>
      )}
      {savedOk && <span className="rpm-saved">✓ salvo</span>}
    </div>
  );
}
