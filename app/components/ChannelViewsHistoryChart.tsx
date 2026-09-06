"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { IconEye } from "@/app/components/Icons";
import { totalViewsByChannelInWindow, type TrackedChannelsHistory } from "@/lib/tracked-channels-history";
import { formatNumber, formatNumberCompact, formatDateHourShort, formatDateTime } from "@/lib/format-br";

const HEIGHT = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const FALLBACK_WIDTH = 700;

const TZ = "America/Sao_Paulo";

const shortDate = (iso: string) => formatDateHourShort(iso, { timeZone: TZ });
const longDate = (iso: string) => formatDateTime(iso);

// Paleta de cores por canal — diferente da aba Ganhos (Lucas/Matheus/
// Rafael têm cor fixa de propósito), aqui a lista de canais é dinâmica
// (a pessoa adiciona/remove quando quiser), então a cor é atribuída pela
// ORDEM em que o canal foi adicionado (`added_at`, já vem assim de
// getTrackedChannelsViewsHistory) — estável entre renders, mas pode
// mudar se um canal for removido e a ordem dos outros mudar.
const PALETTE = [
  "#e21e2c",
  "#0057ff",
  "#00b341",
  "#f5a623",
  "#9013fe",
  "#00b8d9",
  "#ff6f91",
  "#795548",
  "#607d8b",
  "#c2185b",
];

function colorForIndex(i: number) {
  return PALETTE[i % PALETTE.length];
}

// Próxima hora CHEIA em UTC (minuto 0) — mesmo corte usado em
// runCanaisTerceirosSnapshot (lib/canais-terceiros-snapshot.ts,
// `capturedHour.setUTCMinutes(0, 0, 0)`), que é quando o cron do GitHub
// Actions dispara a captura (.github/workflows/main.yml, "0 * * * *").
// É só aritmética sobre o timestamp (instante absoluto), então funciona
// igual em qualquer fuso do navegador — não precisa converter pra UTC
// "na mão".
function msUntilNextHour(now: number): number {
  const HOUR_MS = 60 * 60 * 1000;
  return Math.ceil(now / HOUR_MS) * HOUR_MS - now;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// Contagem regressiva até a próxima captura horária (cron), pra mostrar
// no lugar da mensagem "sem histórico ainda" — dá um horizonte de tempo
// em vez de deixar a pessoa recarregando a página sem saber quanto falta.
function NextCaptureCountdown() {
  const [msLeft, setMsLeft] = useState(() => msUntilNextHour(Date.now()));

  useEffect(() => {
    const tick = () => setMsLeft(msUntilNextHour(Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="chart-countdown">
      Próxima captura agendada em <strong>{formatCountdown(msLeft)}</strong>
      <span className="chart-countdown-note">
        {" "}
        (o cron roda na hora cheia — pode levar alguns minutos a mais pra rodar de fato)
      </span>
    </div>
  );
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function niceNumber(value: number, round: boolean): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

function niceYScale(maxValue: number, tickCount = 4): { max: number; ticks: number[] } {
  const safeMax = Math.max(maxValue, 1);
  const roughStep = safeMax / (tickCount - 1);
  const step = niceNumber(roughStep, true);
  const niceMax = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: niceMax, ticks };
}

type PlottedPoint = { x: number; y: number; value: number };

export function ChannelViewsHistoryChart({
  history,
  selectedChannelId,
  onSelectChannel,
}: {
  history: TrackedChannelsHistory;
  // Canal fixado por CLIQUE na tira de avatares — controla o card
  // "Últimas 48 horas" ao lado. `null` = ninguém clicou ainda, o card
  // usa o líder de views das últimas 48h como padrão (ver
  // ChannelsHourlySection, que é quem decide o fallback).
  selectedChannelId?: string | null;
  onSelectChannel?: (channelId: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Canal em destaque — controlado pelo hover na LOGO abaixo do gráfico
  // (não pela linha em si). Enquanto um canal está em destaque, a linha
  // dele fica opaca/normal e as outras ficam esmaecidas.
  const [highlightedChannel, setHighlightedChannel] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => setWidth(el.clientWidth || FALLBACK_WIDTH);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { channels, points } = history;

  // Ordena a tira de avatares por views das últimas 48h (mais views
  // primeiro), mas guarda o ÍNDICE ORIGINAL (ordem de `added_at`) pra
  // cor continuar estável — reordenar a lista de exibição não pode fazer
  // as cores do gráfico trocarem de canal a cada refresh.
  const viewsWindow = totalViewsByChannelInWindow(history, 48);
  const sortedChannels = channels
    .map((channel, colorIndex) => ({ channel, colorIndex, views: viewsWindow.get(channel.channelId) || 0 }))
    .sort((a, b) => b.views - a.views);

  const timestamps = useMemo(
    () =>
      Array.from(new Set(points.map((p) => p.capturedAt))).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [points]
  );

  if (channels.length === 0) {
    return (
      <div className="chart-section">
        <h2 className="icon-label"><IconEye /> Views por hora</h2>
        <div className="chart-empty">
          Adicione pelo menos um canal na aba Canais pra começar a acompanhar o crescimento de
          views hora a hora.
        </div>
      </div>
    );
  }

  if (timestamps.length < 2) {
    return (
      <div className="chart-section">
        <h2 className="icon-label"><IconEye /> Views por hora</h2>
        <div className="chart-empty">
          Ainda não tem histórico suficiente pra desenhar o gráfico. A captura roda 1x por hora —
          depois de ter pelo menos 2 horas diferentes registradas, a linha aparece aqui.
        </div>
        <NextCaptureCountdown />
      </div>
    );
  }

  const chartWidth = width - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) =>
    PAD_LEFT + (timestamps.length > 1 ? (i / (timestamps.length - 1)) * chartWidth : 0);

  const maxViews = Math.max(1, ...points.map((p) => p.totalViews));
  const { max: yMax, ticks: yTicks } = niceYScale(maxViews, 5);
  const yFor = (value: number) => PAD_TOP + chartHeight - (value / yMax) * chartHeight;

  const seriesPoints = channels.map((channel, i) => ({
    channelId: channel.channelId,
    color: colorForIndex(i),
    points: timestamps.map((t, ti): PlottedPoint => {
      const point = points.find((p) => p.capturedAt === t && p.channelId === channel.channelId);
      const views = point?.totalViews ?? 0;
      return { x: xFor(ti), y: yFor(views), value: views };
    }),
  }));

  const handlePointerMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * width;
      const relY = ((e.clientY - rect.top) / rect.height) * HEIGHT;
      let closest = 0;
      let closestDist = Infinity;
      timestamps.forEach((_, i) => {
        const dist = Math.abs(xFor(i) - relX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setHoverIndex(closest);

      // Acha a linha mais próxima do cursor NAQUELE instante (eixo Y) —
      // é o que faz o tooltip mostrar só o canal daquela linha em vez
      // de todos de uma vez. Reaproveita o mesmo highlightedChannel que
      // já é usado pelo hover na tira de avatares abaixo do gráfico.
      let nearestChannel: string | null = null;
      let nearestYDist = Infinity;
      seriesPoints.forEach(({ channelId, points: pts }) => {
        const yDist = Math.abs(pts[closest].y - relY);
        if (yDist < nearestYDist) {
          nearestYDist = yDist;
          nearestChannel = channelId;
        }
      });
      setHighlightedChannel(nearestChannel);
    },
    [timestamps, width, seriesPoints] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const hoverX = hoverIndex !== null ? xFor(hoverIndex) : null;

  const TOOLTIP_WIDTH = 210;
  const clampedTooltipX =
    hoverX !== null ? Math.max(TOOLTIP_WIDTH / 2, Math.min(width - TOOLTIP_WIDTH / 2, hoverX)) : 0;

  const desiredXLabels = width < 480 ? 4 : width < 700 ? 6 : 8;
  const xStep = Math.max(1, Math.round((timestamps.length - 1) / (desiredXLabels - 1)));
  const xTickIndices = Array.from(
    new Set([...Array.from({ length: timestamps.length }, (_, i) => i).filter((i) => i % xStep === 0), timestamps.length - 1])
  ).sort((a, b) => a - b);

  return (
    <div className="chart-section">
      <h2 className="icon-label"><IconEye /> Views por hora</h2>
      <p className="chart-subtitle">
        Views ganhas na hora por canal rastreado (captura 1x por hora) — dá pra comparar o ritmo de
        crescimento entre eles, não é o VPH instantâneo de um vídeo específico.
      </p>

      <div className="chart-line-wrapper" ref={wrapperRef}>
        <svg
          className="chart-line"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          preserveAspectRatio="none"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => {
            setHoverIndex(null);
            setHighlightedChannel(null);
          }}
        >
          {yTicks.map((tick, i) => (
            <line
              key={i}
              x1={PAD_LEFT}
              y1={yFor(tick)}
              x2={width - PAD_RIGHT}
              y2={yFor(tick)}
              stroke="#eef0f3"
              strokeWidth={1}
            />
          ))}

          {yTicks.map((tick, i) => (
            <text
              key={i}
              x={PAD_LEFT - 10}
              y={yFor(tick)}
              fontSize="11"
              fill="#9aa1ab"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatNumberCompact(tick)}
            </text>
          ))}

          {xTickIndices.map((i) => (
            <line
              key={i}
              x1={xFor(i)}
              y1={PAD_TOP}
              x2={xFor(i)}
              y2={PAD_TOP + chartHeight}
              stroke="#f4f5f7"
              strokeWidth={1}
            />
          ))}

          <line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={PAD_LEFT}
            y2={PAD_TOP + chartHeight}
            stroke="#e2e5ea"
            strokeWidth={1}
          />
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP + chartHeight}
            x2={width - PAD_RIGHT}
            y2={PAD_TOP + chartHeight}
            stroke="#e2e5ea"
            strokeWidth={1}
          />

          {hoverX !== null && (
            <line
              x1={hoverX}
              y1={PAD_TOP}
              x2={hoverX}
              y2={PAD_TOP + chartHeight}
              stroke="#c4c9cf"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Linhas desenhadas em duas passadas: primeiro todas as
              "não destacadas" (esmaecidas quando tem hover ativo),
              depois a destacada por cima — assim ela nunca fica coberta
              por outra linha cruzando em cima. */}
          {seriesPoints
            .filter((s) => s.channelId !== highlightedChannel)
            .map(({ channelId, points: pts, color }) => (
              <path
                key={channelId}
                d={smoothPath(pts)}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={highlightedChannel ? 0.15 : 1}
                style={{ transition: "opacity 0.15s ease" }}
              />
            ))}
          {seriesPoints
            .filter((s) => s.channelId === highlightedChannel)
            .map(({ channelId, points: pts, color }) => (
              <path
                key={channelId}
                d={smoothPath(pts)}
                fill="none"
                stroke={color}
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

          {hoverIndex !== null &&
            seriesPoints.map(({ channelId, points: pts, color }) => (
              <circle
                key={channelId}
                cx={pts[hoverIndex].x}
                cy={pts[hoverIndex].y}
                r={4.5}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={highlightedChannel && highlightedChannel !== channelId ? 0.15 : 1}
              />
            ))}

          {xTickIndices.map((i) => (
            <text
              key={i}
              x={xFor(i)}
              y={HEIGHT - 10}
              fontSize="11"
              fill="#9aa1ab"
              textAnchor={i === 0 ? "start" : i === timestamps.length - 1 ? "end" : "middle"}
            >
              {shortDate(timestamps[i])}
            </text>
          ))}
        </svg>

        {hoverIndex !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(clampedTooltipX / width) * 100}%`,
              width: TOOLTIP_WIDTH,
            }}
          >
            <div className="chart-tooltip-date">{longDate(timestamps[hoverIndex])}</div>
            {seriesPoints
              .filter(({ channelId }) => !highlightedChannel || channelId === highlightedChannel)
              .map(({ channelId, points: pts, color }) => {
              const channel = channels.find((c) => c.channelId === channelId);
              return (
                <div className="chart-tooltip-row" key={channelId}>
                  <span className="chart-tooltip-dot" style={{ background: color }} />
                  <span className="chart-tooltip-name">{channel?.title}</span>
                  <span className="chart-tooltip-value" style={{ color }}>
                    {formatNumber(pts[hoverIndex].value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Avatares de cada canal, borda na mesma cor da linha — passar o
          mouse destaca só aquela linha no gráfico acima. As logos em si
          NÃO esmaecem (só a linha do gráfico faz isso) — aqui é só um
          hover leve pra indicar qual está ativo. */}
      <div className="chart-channel-avatars">
        {sortedChannels.map(({ channel, colorIndex }) => {
          const color = colorForIndex(colorIndex);
          const isHighlighted = highlightedChannel === channel.channelId;
          const isSelected = selectedChannelId === channel.channelId;
          return (
            <button
              type="button"
              key={channel.channelId}
              className={`chart-channel-avatar-item${isHighlighted ? " chart-channel-avatar-item--active" : ""}${
                isSelected ? " chart-channel-avatar-item--selected" : ""
              }`}
              onMouseEnter={() => setHighlightedChannel(channel.channelId)}
              onMouseLeave={() => setHighlightedChannel(null)}
              onFocus={() => setHighlightedChannel(channel.channelId)}
              onBlur={() => setHighlightedChannel(null)}
              onClick={() => onSelectChannel?.(channel.channelId)}
            >
              <span className="chart-channel-avatar-ring" style={{ borderColor: color }}>
                {channel.avatarUrl ? (
                  <img src={channel.avatarUrl} alt="" />
                ) : (
                  <span className="chart-channel-avatar-fallback" style={{ background: color }}>
                    {channel.title.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="chart-channel-avatar-label">{channel.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
