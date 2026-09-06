"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconEye } from "@/app/components/Icons";
import type { TrackedChannelsHistory } from "@/lib/tracked-channels-history";
import { formatNumber, formatDateHourRangeLabel } from "@/lib/format-br";

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

    // Chave por TIMESTAMP (epoch ms), não pela string crua — o Postgres
    // devolve `capturedAt` como "...T17:00:00+00:00" (sem milissegundos),
    // enquanto aqui geramos "...T17:00:00.000Z" via toISOString(). As
    // strings nunca batem, então antes essa comparação direta zerava o
    // total sempre, mesmo com histórico real (o gráfico ao lado não sofre
    // disso porque compara strings vindas todas da mesma fonte).
    const pointsByHour = new Map(
      history.points
        .filter((p) => p.channelId === selectedChannelId)
        .map((p) => [new Date(p.capturedAt).getTime(), p.totalViews])
    );

    const bars: { hour: string; views: number }[] = [];
    for (let i = WINDOW_HOURS - 1; i >= 0; i--) {
      const hourDate = new Date(nowHour.getTime() - i * 60 * 60 * 1000);
      bars.push({ hour: hourDate.toISOString(), views: pointsByHour.get(hourDate.getTime()) ?? 0 });
    }
    return bars;
  }, [history.points, selectedChannelId]);

  const totalFromBars = useMemo(() => hourlyBars.reduce((sum, b) => sum + b.views, 0), [hourlyBars]);
  const maxBar = Math.max(1, ...hourlyBars.map((b) => b.views));

  // Índice da barra em hover — controla o tooltip flutuante (mesmo padrão
  // visual do tooltip do gráfico "Views por hora" ao lado, só que com
  // faixa de hora "Ontem, 14:00 – 15:00" em vez de data completa). Posição
  // calculada em PIXELS (não %) a partir da largura real do container, pra
  // dar pra colar o tooltip nas bordas sem ele vazar pra fora do card.
  const barsWrapperRef = useRef<HTMLDivElement>(null);
  const [barsWrapperWidth, setBarsWrapperWidth] = useState(0);
  const [hoverBarIndex, setHoverBarIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = barsWrapperRef.current;
    if (!el) return;
    const update = () => setBarsWrapperWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const TOOLTIP_WIDTH = 190;
  const hoverBarCenterPx =
    hoverBarIndex !== null && hourlyBars.length > 0
      ? ((hoverBarIndex + 0.5) / hourlyBars.length) * barsWrapperWidth
      : 0;
  const clampedTooltipLeftPx = Math.max(
    TOOLTIP_WIDTH / 2,
    Math.min(barsWrapperWidth - TOOLTIP_WIDTH / 2, hoverBarCenterPx)
  );

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

      <div className="realtime-bars-wrapper" ref={barsWrapperRef}>
        <div className="realtime-bars" onMouseLeave={() => setHoverBarIndex(null)}>
          {hourlyBars.map((b, i) => (
            <div
              key={b.hour}
              className="realtime-bar"
              style={{ height: `${Math.max(4, (b.views / maxBar) * 100)}%` }}
              onMouseEnter={() => setHoverBarIndex(i)}
            />
          ))}
        </div>

        {hoverBarIndex !== null && (
          <div
            className="realtime-bar-tooltip"
            style={{ left: clampedTooltipLeftPx, width: TOOLTIP_WIDTH }}
          >
            <div className="realtime-bar-tooltip-date">
              {formatDateHourRangeLabel(hourlyBars[hoverBarIndex].hour, { timeZone: TZ })}
            </div>
            <div className="realtime-bar-tooltip-value">{formatNumber(hourlyBars[hoverBarIndex].views)}</div>
          </div>
        )}
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
          <a
            className="realtime-video-row"
            key={video.videoId}
            href={
              video.isShort
                ? `https://www.youtube.com/shorts/${video.videoId}`
                : `https://www.youtube.com/watch?v=${video.videoId}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
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
          </a>
        ))}
    </div>
  );
}
