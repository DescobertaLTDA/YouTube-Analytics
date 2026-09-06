"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { IconEye, IconPin } from "@/app/components/Icons";
import { totalViewsByChannelInWindow, type TrackedChannelsHistory } from "@/lib/tracked-channels-history";
import { formatNumber, formatNumberCompact, formatDateHourShort, formatDateTime } from "@/lib/format-br";

// Antes era um valor fixo (o gráfico sempre tinha 260px de altura,
// não importa o card). Agora é só o PISO/fallback: a altura real vem do
// wrapper via ResizeObserver (mesma técnica já usada pra largura), pra
// o gráfico crescer e preencher o card quando ele fica mais alto que o
// SVG (dentro do grid .channels-hourly-grid, que estica os dois cards
// pra mesma altura — ver globals.css).
const MIN_HEIGHT = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const FALLBACK_WIDTH = 700;

const TZ = "America/Sao_Paulo";

// @oCanalLigado — fica sempre fixado em primeiro na tira de avatares,
// não importa a colocação dele no ranking de views das últimas 48h.
const PINNED_CHANNEL_ID = "UCJWArKWSlKLzTOekfIHxOHw";

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
  "#8bc34a",
  "#3f51b5",
  "#ff9800",
  "#009688",
  "#d500f9",
  "#455a64",
  "#cddc39",
  "#00acc1",
  "#e91e63",
  "#33691e",
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

// Gera a curva em segmentos individuais (um comando `C` por par de pontos
// consecutivos), usando os MESMOS vizinhos de contexto (p0/p3) que a curva
// única usava — isso permite depois separar só o ÚLTIMO segmento (hora
// atual, ainda em captura) pra desenhar tracejado, sem mudar o traçado da
// curva em si.
function smoothSegments(points: { x: number; y: number }[]): string[] {
  const segments: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    segments.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
  }
  return segments;
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  return `M ${points[0].x},${points[0].y} ${smoothSegments(points).join(" ")}`;
}

// Curva completa dividida em duas partes: tudo até o penúltimo ponto
// (sólido) e só o último trecho (tracejado, quando `splitLast` é true —
// isto é, quando o último ponto é a hora atual, ainda em captura, não uma
// hora fechada de verdade). Com `splitLast` false, `rest` fica vazio e
// `main` é a curva inteira — mesmo resultado de `smoothPath` de antes.
function smoothPathSplit(points: { x: number; y: number }[], splitLast: boolean) {
  if (points.length < 2) return { main: smoothPath(points), rest: "" };
  const segments = smoothSegments(points);
  if (!splitLast || segments.length === 0) {
    return { main: `M ${points[0].x},${points[0].y} ${segments.join(" ")}`, rest: "" };
  }
  const mainSegments = segments.slice(0, -1);
  const lastSegment = segments[segments.length - 1];
  const secondToLast = points[points.length - 2];
  return {
    main: `M ${points[0].x},${points[0].y} ${mainSegments.join(" ")}`,
    rest: `M ${secondToLast.x},${secondToLast.y} ${lastSegment}`,
  };
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
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // Canal em destaque — controlado pelo hover na LOGO abaixo do gráfico
  // (não pela linha em si). Enquanto um canal está em destaque, a linha
  // dele fica opaca/normal e as outras ficam esmaecidas.
  const [highlightedChannel, setHighlightedChannel] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => {
      setWidth(el.clientWidth || FALLBACK_WIDTH);
      // `.chart-line-wrapper` agora tem `flex: 1` (globals.css), então
      // sua altura real acompanha o quanto o card foi esticado pelo grid
      // — nunca menos que MIN_HEIGHT, pra não espremer o gráfico num
      // card muito baixo.
      setHeight(Math.max(el.clientHeight || 0, MIN_HEIGHT));
    };
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
  //
  // @oCanalLigado (UCJWArKWSlKLzTOekfIHxOHw) fica sempre fixado em
  // primeiro, com um pin (ver render mais abaixo) — independe de views.
  // O resto da lista segue normalmente por views desc.
  const viewsWindow = totalViewsByChannelInWindow(history, 48);
  const sortedChannels = channels
    .map((channel, colorIndex) => ({ channel, colorIndex, views: viewsWindow.get(channel.channelId) || 0 }))
    .sort((a, b) => {
      const aPinned = a.channel.channelId === PINNED_CHANNEL_ID;
      const bPinned = b.channel.channelId === PINNED_CHANNEL_ID;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return b.views - a.views;
    });

  const timestamps = useMemo(
    () =>
      Array.from(new Set(points.map((p) => p.capturedAt))).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [points]
  );

  // O último ponto do gráfico é a HORA ATUAL — ainda em captura, não uma
  // hora fechada. Comparado só pelo instante (ms), então funciona igual
  // em qualquer fuso do navegador (mesma técnica de `msUntilNextHour`
  // acima). Usado pra desenhar esse último trecho tracejado em vez de
  // sólido, e avisar que o valor ainda vai subir.
  const HOUR_MS = 60 * 60 * 1000;
  const lastTimestamp = timestamps[timestamps.length - 1];
  const isLastBucketPartial =
    !!lastTimestamp &&
    new Date(lastTimestamp).getTime() === Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

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
  const chartHeight = height - PAD_TOP - PAD_BOTTOM;

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
      const relY = ((e.clientY - rect.top) / rect.height) * height;
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
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          // Estilo inline em PIXELS (não %) — sobrepõe o `.chart-line {
          // height: 240px }` fixo do CSS global (usado pelos outros
          // gráficos do site) sem reintroduzir o problema de altura
          // circular que a versão com `height: 100%` causava.
          style={{ height }}
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
              por outra linha cruzando em cima. Cada linha, por sua vez,
              é desenhada em duas partes quando o último bucket é a hora
              atual (`isLastBucketPartial`): o trecho sólido até a
              penúltima hora (fechada) e o último trecho tracejado (hora
              em andamento, valor ainda vai subir). */}
          {seriesPoints
            .filter((s) => s.channelId !== highlightedChannel)
            .map(({ channelId, points: pts, color }) => {
              const { main, rest } = smoothPathSplit(pts, isLastBucketPartial);
              const opacity = highlightedChannel ? 0.15 : 1;
              return (
                <g key={channelId} style={{ transition: "opacity 0.15s ease" }} opacity={opacity}>
                  <path d={main} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  {rest && (
                    <path
                      d={rest}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="5 4"
                    />
                  )}
                </g>
              );
            })}
          {seriesPoints
            .filter((s) => s.channelId === highlightedChannel)
            .map(({ channelId, points: pts, color }) => {
              const { main, rest } = smoothPathSplit(pts, isLastBucketPartial);
              return (
                <g key={channelId}>
                  <path d={main} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                  {rest && (
                    <path
                      d={rest}
                      fill="none"
                      stroke={color}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="6 5"
                    />
                  )}
                </g>
              );
            })}

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
              y={height - 10}
              fontSize="11"
              fill={i === timestamps.length - 1 && isLastBucketPartial ? "#f5a623" : "#9aa1ab"}
              fontWeight={i === timestamps.length - 1 && isLastBucketPartial ? 700 : 400}
              textAnchor={i === 0 ? "start" : i === timestamps.length - 1 ? "end" : "middle"}
            >
              {i === timestamps.length - 1 && isLastBucketPartial ? "Agora*" : shortDate(timestamps[i])}
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
            <div className="chart-tooltip-date">
              {longDate(timestamps[hoverIndex])}
              {hoverIndex === timestamps.length - 1 && isLastBucketPartial && (
                <span className="chart-tooltip-tag" style={{ marginLeft: 6 }}>
                  parcial
                </span>
              )}
            </div>
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

      {isLastBucketPartial && (
        <p className="chart-partial-note">
          * hora atual ainda em captura — o trecho tracejado vai continuar subindo até fechar às{" "}
          {new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS + HOUR_MS).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: TZ,
          })}
          .
        </p>
      )}

      {/* Avatares de cada canal, borda na mesma cor da linha — passar o
          mouse destaca só aquela linha no gráfico acima. As logos em si
          NÃO esmaecem (só a linha do gráfico faz isso) — aqui é só um
          hover leve pra indicar qual está ativo. */}
      <div className="chart-channel-avatars">
        {sortedChannels.map(({ channel, colorIndex }) => {
          const color = colorForIndex(colorIndex);
          const isHighlighted = highlightedChannel === channel.channelId;
          const isSelected = selectedChannelId === channel.channelId;
          const isPinned = channel.channelId === PINNED_CHANNEL_ID;
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
                {isPinned && (
                  <span className="chart-channel-avatar-pin" title="Fixado">
                    <IconPin size={10} />
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
