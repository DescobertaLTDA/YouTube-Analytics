"use client";

import { useEffect, useState } from "react";
import { IconZap, IconTrash } from "@/app/components/Icons";
import { formatNumber, formatDateShort } from "@/lib/format-br";
import { formatVph } from "@/lib/vph";

type TrackedChannel = {
  id: string;
  youtube_channel_id: string;
  channel_title: string | null;
  avatar_url: string | null;
  added_at: string;
  active: boolean;
};

type TrackedChannelVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  publishedAt: string;
  isShort: boolean;
  vph: number | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl: string | null;
};

// Painel da aba "Canais" — gerencia a lista dinâmica de canais de
// terceiros rastreados (adicionar por URL/@handle/nome, remover) e
// mostra o ranking de VPH (views/hora) dos vídeos recentes deles, pra
// comparação rápida de quem está "bombando" agora.

// Maior VPH entre os vídeos recentes de um canal — usado só pra
// ordenar a tira de avatares (do mais viral pro menos viral agora).
// Não é uma métrica nova: é o mesmo `vph` que já vem em cada vídeo da
// tabela de baixo (lib/vph.ts, views totais ÷ horas desde a
// publicação), só que aqui pegamos o valor máximo por canal.
function maxVphForChannel(channelId: string, videos: TrackedChannelVideo[] | null): number {
  if (!videos) return -1;
  let max = -1;
  for (const v of videos) {
    if (v.channelId === channelId && v.vph != null && v.vph > max) max = v.vph;
  }
  return max;
}

export function TrackedChannelsPanel() {
  const [channels, setChannels] = useState<TrackedChannel[] | null>(null);
  const [videos, setVideos] = useState<TrackedChannelVideo[] | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videoErrors, setVideoErrors] = useState<{ channelTitle: string; message: string }[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadChannels() {
    const res = await fetch("/api/canais-terceiros", { cache: "no-store" });
    const result = await res.json().catch(() => null);
    if (!res.ok) throw new Error(result?.error || "Erro ao carregar canais");
    setChannels(result?.channels || []);
  }

  async function loadVideos() {
    setLoadingVideos(true);
    try {
      const res = await fetch("/api/canais-terceiros/vph", { cache: "no-store" });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.error || "Erro ao carregar VPH");
      setVideos(result?.videos || []);
      setVideoErrors(result?.errors || []);
    } catch (err) {
      // Erro de VPH não impede a gestão da lista de canais — só deixa a
      // tabela de baixo vazia, com o card de canais continuando normal.
      setVideos([]);
      setVideoErrors([]);
      console.error("❌ Erro ao carregar VPH dos canais rastreados:", err);
    } finally {
      setLoadingVideos(false);
    }
  }

  useEffect(() => {
    loadChannels().catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar"));
  }, []);

  useEffect(() => {
    if (channels === null) return;
    if (channels.length === 0) {
      setVideos([]);
      return;
    }
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/canais-terceiros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.error || "Erro ao adicionar canal");
      setInput("");
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar canal");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/canais-terceiros/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || "Erro ao remover canal");
      }
      setChannels((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover canal");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="tracked-channels-panel">
      <form className="tracked-channels-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Cole a URL do canal, @handle ou nome"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rpm-input"
          disabled={adding}
        />
        <button type="submit" className="btn rpm-save" disabled={adding || !input.trim()}>
          {adding ? "adicionando..." : "adicionar canal"}
        </button>
      </form>

      {error && (
        <p className="text-muted-small" style={{ color: "var(--rose)" }}>
          {error}
        </p>
      )}

      {channels === null ? (
        <p className="text-muted">Carregando canais...</p>
      ) : channels.length === 0 ? (
        <p className="text-muted">Nenhum canal rastreado ainda — adicione um acima.</p>
      ) : (
        <div className="tracked-channels-stories">
          {[...channels]
            .sort((a, b) => maxVphForChannel(b.youtube_channel_id, videos) - maxVphForChannel(a.youtube_channel_id, videos))
            .map((c) => {
            const label = c.channel_title || c.youtube_channel_id;
            return (
              <div
                key={c.id}
                className="tracked-channel-story"
                title={`${label} — desde ${formatDateShort(c.added_at)}`}
              >
                <div className="tracked-channel-story-ring">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" />
                  ) : (
                    <span className="tracked-channel-story-fallback">{label.slice(0, 1).toUpperCase()}</span>
                  )}
                  <button
                    type="button"
                    className="tracked-channel-story-remove"
                    onClick={() => handleRemove(c.id)}
                    disabled={removingId === c.id}
                    aria-label={`Remover ${label}`}
                  >
                    <IconTrash size={11} />
                  </button>
                </div>
                <span className="tracked-channel-story-name">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="tracked-channels-subtitle">
        <IconZap size={15} /> vídeos recentes por VPH (views/hora)
      </h3>

      {videoErrors.length > 0 && (
        <div className="text-muted-small" style={{ color: "var(--rose)", marginBottom: 8 }}>
          {videoErrors.map((e, i) => (
            <p key={i} style={{ margin: "2px 0" }}>
              ⚠️ {e.channelTitle}: {e.message}
            </p>
          ))}
        </div>
      )}

      {loadingVideos ? (
        <p className="text-muted">Calculando VPH...</p>
      ) : !videos || videos.length === 0 ? (
        <p className="text-muted">
          {channels && channels.length > 0
            ? "Nenhum vídeo recente encontrado nos canais rastreados."
            : "Adicione um canal acima pra ver o ranking de VPH."}
        </p>
      ) : (
        <div className="tracked-channels-table">
          {videos.map((v) => (
            <a
              key={v.videoId}
              href={`https://youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="tracked-channel-video-row"
            >
              <img src={v.thumbnailUrl} alt="" className="tracked-channel-video-thumb" />
              <div className="tracked-channel-video-info">
                <div className="tracked-channel-video-title">{v.title}</div>
                <div className="text-muted-small">
                  {v.channelTitle} · {formatNumber(v.viewCount)} views · {formatDateShort(v.publishedAt)} ·{" "}
                  {v.isShort ? "short" : "vídeo"}
                </div>
              </div>
              <div className="tracked-channel-video-vph">{formatVph(v.vph)}/h</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
