"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type VideoOption = { id: string; channel_label: string | null; youtube_video_id: string };

export function TranscriptForm({ videos }: { videos: VideoOption[] }) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [videoId, setVideoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit() {
    if (!rawText.trim()) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText, video_id: videoId || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "falha ao importar");

      setStatus({
        ok: true,
        message: `Arquivado: ${body.segment_count} linhas de minutagem (${body.chapter_count} capítulos detectados)${
          body.duration_seconds ? `, duração ~${Math.round(body.duration_seconds / 60)} min` : ""
        }.`,
      });
      setRawText("");
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "erro ao importar" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="transcript-form">
      <textarea
        className="transcript-textarea"
        placeholder={"Cole aqui o transcript exportado do tactiq.io (ou qualquer texto com linhas 'HH:MM:SS.mmm texto')..."}
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
      />
      <div className="transcript-actions">
        <select className="transcript-select" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
          <option value="">vincular a um vídeo (opcional)</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.channel_label ?? v.youtube_video_id}
            </option>
          ))}
        </select>
        <button className="transcript-submit" onClick={handleSubmit} disabled={submitting || !rawText.trim()}>
          {submitting ? "processando..." : "arquivar e extrair minutagem"}
        </button>
        {status && (
          <span className={`transcript-status ${status.ok ? "ok" : "error"}`}>
            {status.ok ? "✓ " : "✗ "}
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
