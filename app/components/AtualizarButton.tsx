"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconRefresh } from "@/app/components/Icons";

// Curva assintótica: sobe rápido no começo e vai desacelerando, sem nunca
// "mentir" que terminou — nunca passa de 94% sozinha. Só vai a 100% quando
// a API responde de verdade (ver handleClick). Assim a barra sempre parece
// viva, mesmo que a sincronização demore mais que o normal.
function progressFromElapsed(elapsedMs: number): number {
  return 94 * (1 - Math.exp(-elapsedMs / 4000));
}

export function AtualizarButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function handleClick() {
    setResult(null);
    setCompleting(false);
    setElapsedMs(0);
    setLoading(true);
    startRef.current = Date.now();

    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);

    let outcome: { type: "success" | "error"; text: string };
    try {
      // As duas chamadas rodam em paralelo. A captura dos canais
      // rastreados (`/api/canais-terceiros/refresh` — versão sem secret
      // de `/api/canais-terceiros/snapshot`, só pro clique manual daqui)
      // é "melhor esforço": se ela falhar, não derruba o botão inteiro —
      // só o gráfico "Views por hora" fica sem o ponto dessa hora até a
      // próxima tentativa (o GitHub Actions roda de hora em hora de
      // qualquer jeito). O sync principal (`/api/ganhos/sync`) continua
      // sendo o único que decide sucesso/erro do botão, igual antes.
      const [ganhosResponse, snapshotResult] = await Promise.all([
        fetch("/api/ganhos/sync", { method: "POST" }),
        fetch("/api/canais-terceiros/refresh", { method: "POST" }).catch((err) => {
          console.error("⚠️ Falha ao capturar snapshot dos canais rastreados:", err);
          return null;
        }),
      ]);

      if (snapshotResult && !snapshotResult.ok) {
        const snapshotBody = await snapshotResult.json().catch(() => null);
        console.error("⚠️ Snapshot dos canais rastreados retornou erro:", snapshotBody);
      }

      const data = await ganhosResponse.json();

      if (!ganhosResponse.ok || !data.success) {
        throw new Error(data.error || data.message || "Erro ao atualizar");
      }

      outcome = {
        type: "success",
        text: `${data.matched_videos} vídeos encontrados (de ${data.channel_videos_scanned} no canal).`,
      };
      router.refresh();
    } catch (error: any) {
      outcome = { type: "error", text: error.message || "Tente novamente." };
    }

    if (tickRef.current) clearInterval(tickRef.current);
    // Faz a barra "fechar" até 100% em vez de sumir de repente no meio do
    // preenchimento — dá um respiro de ~350ms pra transição ficar suave.
    setCompleting(true);
    setTimeout(() => {
      setLoading(false);
      setResult(outcome);
    }, 350);
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const pct = completing ? 100 : progressFromElapsed(elapsedMs);
  const sprockets = Array.from({ length: 14 });

  return (
    <div className="atualizar-wrap">
      <button className="btn-atualizar icon-label" onClick={handleClick} disabled={loading}>
        <IconRefresh className={loading ? "spin" : undefined} /> {loading ? "Atualizando..." : "Atualizar"}
      </button>

      {loading && (
        <div className="modal-overlay atualizar-overlay">
          <div className="atualizar-progress-modal">
            <div className="atualizar-filmbar">
              <div className="atualizar-filmbar-sprockets atualizar-filmbar-sprockets-top">
                {sprockets.map((_, i) => (
                  <span key={i} />
                ))}
              </div>
              <div className="atualizar-filmbar-track">
                <div
                  className={`atualizar-filmbar-fill${completing ? " is-completing" : ""}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="atualizar-filmbar-thumb" style={{ left: `${pct}%` }}>
                  {seconds}s
                </div>
              </div>
              <div className="atualizar-filmbar-sprockets atualizar-filmbar-sprockets-bottom">
                {sprockets.map((_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="modal-overlay atualizar-overlay">
          <div className={`atualizar-result-modal atualizar-result-${result.type}`}>
            <span className="atualizar-result-icon">{result.type === "success" ? "✓" : "✕"}</span>
            <p className="atualizar-result-text">
              {result.type === "success" ? "Atualizado!" : "Erro ao atualizar"}
            </p>
            <p className="atualizar-result-sub">{result.text}</p>
            <button
              type="button"
              className="btn-atualizar-fechar"
              onClick={() => setResult(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
