"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";
import { IconEye } from "@/app/components/Icons";
import type { EarningsHistoryPoint } from "@/lib/data";
import { formatNumber, formatNumberCompact, formatDateShort, formatDateLong } from "@/lib/format-br";

// Mesmas cores por criador do gráfico de receita, de propósito — é o
// mesmo criador na mesma paleta em todo o dashboard.
const CREATOR_COLORS: Record<CreatorKey, string> = {
  lucas: "#e21e2c",
  matheus: "#0057ff",
  rafael: "#00b341",
};

const HEIGHT = 260;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const FALLBACK_WIDTH = 700;

const TZ = "America/Sao_Paulo";

const shortDate = (iso: string) => formatDateShort(iso, { timeZone: TZ });
const longDate = (iso: string) => formatDateLong(iso, { timeZone: TZ });

// Idêntico ao smoothPath do EarningsHistoryChart — spline Catmull-Rom
// convertida pra curvas de Bézier cúbicas.
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

type PlottedPoint = { x: number; y: number; value: number; isEstimated: boolean };

// Mesmo corte solid/dashed do gráfico de receita: o VPH de um dia herda o
// "isEstimated" desse dia (ainda sem receita oficial confirmada pelo
// YouTube) só pra manter a pista visual consistente entre os dois
// gráficos — aqui o traço tracejado significa "views desse dia ainda
// sujeitas a ajuste", não que o VPH em si seja uma estimativa à parte.
function splitAtEstimated(points: PlottedPoint[]): { solid: PlottedPoint[]; dashed: PlottedPoint[] } {
  const firstEstimatedIdx = points.findIndex((p) => p.isEstimated);
  if (firstEstimatedIdx === -1) return { solid: points, dashed: [] };
  if (firstEstimatedIdx === 0) return { solid: [], dashed: points };
  return {
    solid: points.slice(0, firstEstimatedIdx + 1),
    dashed: points.slice(firstEstimatedIdx),
  };
}

// VPH médio do dia = views ganhas naquele dia (já calculado em
// getCreatorDailyEarnings, ver lib/data.ts) dividido pelas 24h do dia.
// É uma MÉDIA diária, não o VPH instantâneo de um vídeo específico — um
// pico de poucas horas (ex: vídeo que viraliza de manhã) fica "diluído"
// nesse número. Serve pra comparar ritmo de crescimento entre os
// criadores ao longo dos dias, não pra ver picos horários dentro de um
// mesmo dia.
const HOURS_PER_DAY = 24;

export function VphHistoryChart({ history }: { history: EarningsHistoryPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => setWidth(el.clientWidth || FALLBACK_WIDTH);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const timestamps = useMemo(
    () =>
      Array.from(new Set(history.map((h) => h.capturedAt))).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [history]
  );

  if (timestamps.length < 2) {
    return (
      <div className="chart-section">
        <h2 className="icon-label"><IconEye /> VPH médio por dia</h2>
        <div className="chart-empty">
          Ainda não tem histórico suficiente pra desenhar o gráfico. O sync grava as views de
          cada vídeo por dia — depois de ter pelo menos 2 dias diferentes registrados, a linha
          aparece aqui.
        </div>
      </div>
    );
  }

  const chartWidth = width - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) =>
    PAD_LEFT + (timestamps.length > 1 ? (i / (timestamps.length - 1)) * chartWidth : 0);

  const maxVph = Math.max(1, ...history.map((h) => h.totalViews / HOURS_PER_DAY));
  const { max: yMax, ticks: yTicks } = niceYScale(maxVph, 5);
  const yFor = (value: number) => PAD_TOP + chartHeight - (value / yMax) * chartHeight;

  const seriesPoints = CREATORS.map(({ key }) => ({
    key,
    points: timestamps.map((t, i): PlottedPoint => {
      const point = history.find((h) => h.capturedAt === t && h.creator === key);
      const vph = (point?.totalViews ?? 0) / HOURS_PER_DAY;
      return {
        x: xFor(i),
        y: yFor(vph),
        value: vph,
        isEstimated: point?.isEstimated ?? false,
      };
    }),
  }));

  const hasEstimatedPoints = seriesPoints.some((s) => s.points.some((p) => p.isEstimated));

  const handlePointerMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * width;
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
    },
    [timestamps, width] // eslint-disable-line react-hooks/exhaustive-deps
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
      <h2 className="icon-label"><IconEye /> VPH médio por dia</h2>
      <p className="chart-subtitle">
        Views ganhas no dia ÷ 24h, por canal — uma média do ritmo do dia, não o VPH instantâneo de
        um vídeo específico (que pode picar bem mais alto por algumas horas).
      </p>

      <div className="chart-line-wrapper" ref={wrapperRef}>
        <svg
          className="chart-line"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          preserveAspectRatio="none"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverIndex(null)}
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

          {seriesPoints.map(({ key, points }) => {
            const { solid, dashed } = splitAtEstimated(points);
            return (
              <g key={key}>
                {solid.length > 0 && (
                  <path
                    d={smoothPath(solid)}
                    fill="none"
                    stroke={CREATOR_COLORS[key]}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {dashed.length > 0 && (
                  <path
                    d={smoothPath(dashed)}
                    fill="none"
                    stroke={CREATOR_COLORS[key]}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="6 5"
                    opacity={0.85}
                  />
                )}
                {hoverIndex !== null && points[hoverIndex] && (
                  <circle
                    cx={points[hoverIndex].x}
                    cy={points[hoverIndex].y}
                    r={4.5}
                    fill={points[hoverIndex].isEstimated ? "#ffffff" : CREATOR_COLORS[key]}
                    stroke={CREATOR_COLORS[key]}
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}

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
            {seriesPoints.map(({ key, points }) => (
              <div className="chart-tooltip-row" key={key}>
                <span className="chart-tooltip-dot" style={{ background: CREATOR_COLORS[key] }} />
                <span className="chart-tooltip-name">{CREATORS.find((c) => c.key === key)?.label}</span>
                <span className="chart-tooltip-value" style={{ color: CREATOR_COLORS[key] }}>
                  {formatNumber(points[hoverIndex].value)} views/h
                  {points[hoverIndex].isEstimated && <span className="chart-tooltip-tag">provisório</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chart-legend">
        {CREATORS.map(({ key, label }) => (
          <div className="chart-legend-item" key={key}>
            <span className="chart-legend-dot" style={{ background: CREATOR_COLORS[key] }} />
            {label}
          </div>
        ))}
        {hasEstimatedPoints && (
          <div className="chart-legend-item chart-legend-item--muted">
            <span className="chart-legend-dash" />
            dia ainda provisório
          </div>
        )}
      </div>
    </div>
  );
}
