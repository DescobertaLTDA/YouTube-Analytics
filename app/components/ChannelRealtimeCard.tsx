"use client";

import { useEffect, useMemo, useState } from "react";
import { IconEye } from "@/app/components/Icons";
import type { TrackedChannelsHistory } from "@/lib/tracked-channels-history";
import { formatNumber, formatDateHourShort } from "@/lib/format-br";

const TZ = "America/Sao_Paulo";
const WINDOW_HOURS = 48;

type TopVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  isShort: boolean;
  views: number;
};

type TopVideosResponse = {
  totalViews: number;
  videos: TopVideo[];
  error?: string;
};

export function ChannelRealtimeCard({
  history,
  selectedChannelId,
}: {
  history: TrackedChannelsHistory;
  selectedChannelId: string | null;
}) {
  const channel = history.channels.find((c) => c.channelId === selectedChannelId) || null;

  // Barras horárias — reusa o mesmo `points` que já alimenta o gráfico de
  // linha, só que filtrado pro canal selecionado e recortado nas últimas
  // 48 horas (cada barra = 1 captura do cron, que já roda de hora em
  // hora). Não busca nada novo no banco pra isso.
  // Barras horárias — sempre exatamente WINDOW_HOURS posições, começando
  // "agora" (hora cheia atual, mesmo corte usado no cron —
  // setUTCMinutes(0,0,0), ver lib/canais-terceiros-snapshot.ts) e voltando
  // hora a hora. Gerar os slots assim (em vez de só listar as horas que
  // JÁ existem em `history.points`) é o que garante 48 barras finas desde
  // o primeiro dia — se só existirem 6-7 horas de histórico ainda, as
  // horas mais antigas simplesmente entram como barra zerada, em vez de
  // esticar as poucas barras existentes pra ocupar a largura toda.
  const hourlyBars = useMemo(() => {
    if (!selectedChannelId) return [];
    const nowHour = new Date();
    nowHour.setUTCMinutes(0, 0, 0);

    const pointsByHour = new Map(
      history.points.filter((p) => p.channelId === selectedChannelId).map((p) => [p.capturedAt, p.totalViews])
    );

    const bars: { hour: string; views: number }[] = [];
    for (let i = WINDOW_HOURS - 1; i >= 0; i--) {
      const hourIso = new Date(nowHour.getTime() - i * 60 * 60 * 1000).toISOString();
      bars.push({ hour: hourIso, views: pointsByHour.get(hourIso) ?? 0 });
    }
    return bars;
  }, [history.points, selectedChannelId]);

  const totalFromBars = useMemo(() => hourlyBars.reduce((sum, b) => sum + b.views, 0), [hourlyBars]);
  const maxBar = Math.max(1, ...hourlyBars.map((b) => b.views));

  // Top vídeos: esse dado (título/thumbnail) não vem do histórico salvo
  // (só tem view_count por hora), então busca ao vivo na API só quando o
  // canal selecionado muda.
  const [topVideos, setTopVideos] = useState<TopVideo[] | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);

  useEffect(() => {
    if (!selectedChannelId) {
      setTopVideos(null);
      return;
    }
    let cancelled = false;
    setLoadingVideos(true);
    setTopVideos(null);

    fetch(`/api/canais-terceiros/top-videos?channelId=${encodeURIComponent(selectedChannelId)}&hours=${WINDOW_HOURS}`)
      .then((res) => res.json() as Promise<TopVideosResponse>)
      .then((data) => {
        if (cancelled) return;
        setTopVideos(data.videos || []);
      })
      .catch(() => {
        if (!cancelled) setTopVideos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVideos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChannelId]);

  if (!channel) {
    return (
      <div className="card realtime-card">
        <h2 className="icon-label">
          <IconEye /> Últimas {WINDOW_HOURS} horas
        </h2>
        <div className="chart-empty">Selecione um canal na tira de avatares pra ver o detalhe aqui.</div>
      </div>
    );
  }

  return (
    <div className="card realtime-card">
      <h2 className="icon-label">
        <IconEye /> Últimas {WINDOW_HOURS} horas
      </h2>

      <div className="realtime-channel">
        <span className="realtime-channel-avatar">
          {channel.avatarUrl ? (
            <img src={channel.avatarUrl} alt="" />
          ) : (
            <span className="realtime-channel-avatar-fallback">{channel.title.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="realtime-channel-title">{channel.title}</span>
      </div>

      <div className="realtime-total">{formatNumber(totalFromBars)}</div>
      <div className="realtime-subtitle">Visualizações · Últimas {WINDOW_HOURS} horas</div>

      <div className="realtime-bars" title="Cada barra é 1 hora fechada (mesma captura do gráfico ao lado)">
        {hourlyBars.map((b, i) => (
          <div
            key={b.hour}
            className="realtime-bar"
            style={{ height: `${Math.max(4, (b.views / maxBar) * 100)}%` }}
            title={`${formatDateHourShort(b.hour, { timeZone: TZ })} · ${formatNumber(b.views)} views`}
          />
        ))}
      </div>
      <div className="realtime-bars-labels">
        <span>{WINDOW_HOURS}h atrás</span>
        <span>Agora</span>
      </div>

      <div className="realtime-videos-label">Conteúdo principal</div>
      {loadingVideos && <div className="chart-empty realtime-videos-empty">Carregando…</div>}
      {!loadingVideos && topVideos && topVideos.length === 0 && (
        <div className="chart-empty realtime-videos-empty">Sem vídeos com views nesse período.</div>
      )}
      {!loadingVideos &&
        topVideos?.map((video) => (
          <div className="realtime-video-row" key={video.videoId}>
            {video.thumbnailUrl ? (
              <img className="realtime-video-thumb" src={video.thumbnailUrl} alt="" />
            ) : (
              <span className="realtime-video-thumb realtime-video-thumb-fallback" />
            )}
            <span className="realtime-video-info">
              <span
                className={`realtime-video-dot ${video.isShort ? "realtime-video-dot-short" : "realtime-video-dot-long"}`}
              />
              <span className="realtime-video-title" title={video.title}>
                {video.title}
              </span>
            </span>
            <span className="realtime-video-views">{formatNumber(video.views)}</span>
          </div>
        ))}
    </div>
  );
}
