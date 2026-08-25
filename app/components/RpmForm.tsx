"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RpmForm({
  videoId,
  currentRpm,
}: {
  videoId: string;
  currentRpm: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentRpm != null ? String(currentRpm) : "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    setSavedOk(false);
    try {
      const res = await fetch("/api/rpm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, rpm: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "falha ao salvar");
      }
      setSavedOk(true);
      router.refresh();
    } catch {
      alert("Não consegui salvar o RPM. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rpm-form">
      <span className="rpm-label">RPM (R$)</span>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="ex: 4.50"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSavedOk(false);
        }}
        className="rpm-input"
      />
      <button onClick={handleSave} disabled={saving || !value} className="rpm-save">
        {saving ? "salvando..." : "salvar"}
      </button>
      {savedOk && <span className="rpm-saved">✓ salvo</span>}
    </div>
  );
}
