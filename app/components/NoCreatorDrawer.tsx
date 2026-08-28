"use client";

import { useEffect, useState } from "react";
import type { GanhosVideoRow } from "@/lib/data";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NoCreatorDrawer({
  count,
  amount,
  videos,
}: {
  count: number;
  amount: number;
  videos: GanhosVideoRow[];
}) {
  const [open, setOpen] = useState(false);
  const sortedVideos = [...videos].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));

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
      <button type="button" className="stat-card stat-card-clickable" onClick={() => setOpen(true)}>
        <div className="stat-value-large">{formatNumber(count)}</div>
        <div className="stat-label">Vídeos sem criador</div>
      </button>

      <button type="button" className="stat-card stat-card-clickable" onClick={() => setOpen(true)}>
        <div className="stat-value-large amber">{formatCurrency(amount)}</div>
        <div className="stat-label">Saldo sem criador</div>
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Vídeos sem criador</h2>
                <p className="drawer-subtitle">Sem hashtag no período · ordenado por receita</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="drawer-summary">
              <div className="drawer-summary-item">
                <span className="drawer-summary-value">{formatNumber(count)}</span>
                <span className="drawer-summary-label">vídeos sem criador</span>
              </div>
              <div className="drawer-summary-item">
                <span className="drawer-summary-value amber">{formatCurrency(amount)}</span>
                <span className="drawer-summary-label">saldo total sem criador</span>
              </div>
            </div>

            <div className="drawer-body">
              {sortedVideos.length === 0 && (
                <div className="no-changes">Nenhum vídeo sem criador no período.</div>
              )}

              {sortedVideos.map((v) => (
                <div className="drawer-video-row" key={v.youtubeVideoId}>
                  {v.thumbnailUrl && (
                    <img className="drawer-video-thumb" src={v.thumbnailUrl} alt={v.title ?? ""} />
                  )}
                  <div className="drawer-video-info">
                    <a
                      href={`https://youtube.com/watch?v=${v.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="drawer-video-title"
                    >
                      {v.title ?? "sem título"}
                    </a>
                    <div className="drawer-video-meta">
                      <span className="text-muted-small">{v.isShort ? "Short" : "Vídeo longo"}</span>
                      <span className="text-muted-small">{formatDate(v.publishedAt)}</span>
                    </div>
                  </div>

                  <div className="drawer-video-stats">
                    <div className="drawer-video-stat">
                      <span className="drawer-video-stat-value malachite">{formatNumber(v.viewCount)}</span>
                      <span className="drawer-video-stat-label">views</span>
                    </div>
                    <div className="drawer-video-stat">
                      <span className="drawer-video-stat-value">{formatDuration(v.durationSeconds)}</span>
                      <span className="drawer-video-stat-label">duração</span>
                    </div>
                    <div className="drawer-video-stat">
                      <span className="drawer-video-stat-value amber">{formatCurrency(v.revenue)}</span>
                      <span className="drawer-video-stat-label">receita</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
