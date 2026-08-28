"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AtualizarButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function handleClick() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/ganhos/sync", { method: "POST" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || "Erro ao atualizar");
      }

      setMessage({
        type: "success",
        text: `${result.matched_videos} vídeos encontrados (de ${result.channel_videos_scanned} no canal).`,
      });

      router.refresh();
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Tente novamente." });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  return (
    <div className="atualizar-wrap">
      <button className="btn-atualizar" onClick={handleClick} disabled={loading}>
        {loading ? "🔄 Atualizando..." : "🔄 Atualizar"}
      </button>

      {message && (
        <div className="toast-container">
          <div className={`toast toast-${message.type}`}>
            <span className="toast-icon">{message.type === "success" ? "✓" : "✕"}</span>
            <span className="toast-text">{message.text}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => setMessage(null)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
