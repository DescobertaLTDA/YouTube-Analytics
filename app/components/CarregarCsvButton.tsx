"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconUpload } from "@/app/components/Icons";

// Botão "Carregar CSV" — Parte 4 do plano de importação de RPM real.
// Abre o seletor de arquivo, sobe o "Dados da tabela.csv" (exportado do
// YouTube Studio) pro endpoint da Parte 3 (/api/rpm/importar-csv), que faz
// parse + upsert em `video_rpm_real`. Ainda NÃO mexe no cálculo de ganhos
// (isso é a Parte 5) — este botão só importa e guarda os dados.
export function CarregarCsvButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  function handleClick() {
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permite selecionar o mesmo arquivo de novo depois (senão o onChange
    // não dispara na segunda vez).
    e.target.value = "";
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/rpm/importar-csv", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Erro ao importar CSV");
      }

      const skippedText =
        result.skipped > 0 ? ` (${result.skipped} linha(s) ignorada(s))` : "";
      setMessage({
        type: "success",
        text: `${result.imported} vídeo(s) com RPM real importado${skippedText}.`,
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
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <button
        className="btn-atualizar btn-carregar-csv icon-label"
        onClick={handleClick}
        disabled={loading}
      >
        <IconUpload className={loading ? "spin" : undefined} />{" "}
        {loading ? "Importando..." : "Carregar CSV"}
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
