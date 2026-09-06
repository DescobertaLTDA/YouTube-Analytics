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
  // 48 horas. Não busca nada novo no banco pra isso.
  //
  // IMPORTANTE: aqui NÃO usamos `new Date(...).getTime()` pra casar as
  // horas — já tentei isso e ainda dava 0, porque não tem garantia de que
  // o texto de `captured_hour` devolvido pelo Postgres seja interpretado
  // pelo Date() do jeito esperado (pode faltar o "Z"/offset, e aí o
  // JavaScript lê como horário LOCAL do navegador em vez de UTC,
  // desalinhando tudo de novo). Em vez de confiar em parsing de data,
  // usamos as strings de `capturedAt` EXATAMENTE como vêm do banco —
  // mesma técnica de `totalViewsByChannelInWindow` (lib/tracked-channels-
  // history.ts) e do gráfico de linha ao lado (ChannelViewsHistoryChart),
  // que já funcionam certinho (é literalmente essa comparação que escolhe
  // o canal líder que aparece pré-selecionado aqui).
  const hourlyBars = useMemo(() => {
    if (!selectedChannelId) return [];

    const allHours = Array.from(new Set(history.points.map((p) => p.capturedAt))).sort();
    const lastHours = allHours.slice(-WINDOW_HOURS);

    const viewsByHour = new Map(
      history.points.filter((p) => p.channelId === selectedChannelId).map((p) => [p.capturedAt, p.totalViews])
    );

    // Se ainda não tem WINDOW_HOURS horas de histórico (projeto novo),
    // preenche a esquerda com barras zeradas SEM hora associada (`hour:
    // null`) — mantém sempre WINDOW_HOURS barras na tela sem inventar um
    // timestamp que não existe de verdade nos dados.
    const missing = WINDOW_HOURS - lastHours.length;
    const bars: { hour: string | null; views: number }[] = [];
    for (let i = 0; i < missing; i++) bars.push({ hour: null, views: 0 });
    for (const hour of lastHours) bars.push({ hour, views: viewsByHour.get(hour) ?? 0 });
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
              key={b.hour ?? `pad-${i}`}
              className="realtime-bar"
              style={{ height: `${Math.max(4, (b.views / maxBar) * 100)}%` }}
              onMouseEnter={() => b.hour !== null && setHoverBarIndex(i)}
            />
          ))}
        </div>

        {hoverBarIndex !== null && hourlyBars[hoverBarIndex].hour !== null && (
          <div
            className="realtime-bar-tooltip"
            style={{ left: clampedTooltipLeftPx, width: TOOLTIP_WIDTH }}
          >
            <div className="realtime-bar-tooltip-date">
              {formatDateHourRangeLabel(hourlyBars[hoverBarIndex].hour as string, { timeZone: TZ })}
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
