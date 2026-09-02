"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";
import { IconTrendingUp } from "@/app/components/Icons";
import type { EarningsHistoryPoint } from "@/lib/data";
import { formatCurrency, formatDateShort, formatDateLong } from "@/lib/format-br";

// Uma cor por criador — vivas e bem distintas entre si, de propósito, pra
// ficar fácil de diferenciar as linhas de longe.
const CREATOR_COLORS: Record<CreatorKey, string> = {
  lucas: "#e21e2c", // vermelho
  matheus: "#0057ff", // azul
  rafael: "#00b341", // verde
};

const HEIGHT = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 42;
const PAD_LEFT = 56;
const PAD_RIGHT = 4;
const FALLBACK_WIDTH = 700;

const TZ = "America/Sao_Paulo";

// formatCurrency/formatDateShort/formatDateLong vêm de "@/lib/format-br",
// que já normaliza os espaços Unicode que causavam mismatch de hidratação
// (React #418/#425) — ver comentário lá para o motivo. Aqui só embrulhamos
// as versões "curta"/"longa" de data com o fuso de São Paulo.
const shortDate = (iso: string) => formatDateShort(iso, { timeZone: TZ });
const longDate = (iso: string) => formatDateLong(iso, { timeZone: TZ });

// Transforma uma lista de pontos num path suave (spline Catmull-Rom
// convertida pra curvas de Bézier cúbicas), no lugar da polyline reta.
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

export function EarningsHistoryChart({ history }: { history: EarningsHistoryPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Largura real do container em px — medida no cliente pra o SVG ir de
  // ponta a ponta sem esticar/distorcer linhas, pontos e texto (o que
  // acontecia usando preserveAspectRatio com um viewBox de largura fixa).
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  // Índice do ponto mais próximo do mouse — controla a linha-guia, os
  // pontos destacados e o tooltip, igual ao hover do YouTube Studio.
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

  const timestamps = Array.from(new Set(history.map((h) => h.capturedAt))).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  if (timestamps.length < 2) {
    return (
      <div className="chart-section">
        <h2 className="icon-label"><IconTrendingUp /> Receita ao longo do tempo</h2>
        <div className="chart-empty">
          Ainda não tem histórico suficiente pra desenhar o gráfico. O sync grava as views de
          cada vídeo por dia — depois de ter pelo menos 2 dias diferentes registrados, a linha
          aparece aqui.
        </div>
      </div>
    );
  }

  const maxEarnings = Math.max(1, ...history.map((h) => h.totalEarnings));
  const chartWidth = width - PAD_LEFT - PAD_RIGHT;
  const chartHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) =>
    PAD_LEFT + (timestamps.length > 1 ? (i / (timestamps.length - 1)) * chartWidth : 0);
  const yFor = (value: number) => PAD_TOP + chartHeight - (value / maxEarnings) * chartHeight;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD_TOP + chartHeight * (1 - f),
    value: maxEarnings * f,
  }));

  // Pontos de cada criador pré-calculados uma vez só, reaproveitados pela
  // linha, pelos círculos e pelo tooltip.
  const seriesPoints = CREATORS.map(({ key }) => ({
    key,
    points: timestamps.map((t, i) => {
      const point = history.find((h) => h.capturedAt === t && h.creator === key);
      return { x: xFor(i), y: yFor(point?.totalEarnings ?? 0), value: point?.totalEarnings ?? 0 };
    }),
  }));

  const handlePointerMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      // rect.width é o tamanho real na tela; width (state) é a unidade do
      // viewBox — como o SVG não distorce (width/height fixos = viewBox),
      // essa razão converte a posição do mouse pra "unidades do gráfico".
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
    [timestamps, width]
  );

  const hoverX = hoverIndex !== null ? xFor(hoverIndex) : null;

  // Mantém o tooltip dentro da área do gráfico, mesmo perto das bordas.
  const TOOLTIP_WIDTH = 200;
  const clampedTooltipX =
    hoverX !== null ? Math.max(TOOLTIP_WIDTH / 2, Math.min(width - TOOLTIP_WIDTH / 2, hoverX)) : 0;

  return (
    <div className="chart-section">
      <h2 className="icon-label"><IconTrendingUp /> Receita ao longo do tempo</h2>
      <p className="chart-subtitle">Ganho estimado por dia (RPM) — não o acumulado do período de 28 dias.</p>

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
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={PAD_LEFT}
            y2={PAD_TOP + chartHeight}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
          />

          {gridLines.map(({ y, value }, i) => (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={y + 3} fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="end">
                {formatCurrency(value)}
              </text>
            </g>
          ))}

          {hoverX !== null && (
            <line
              x1={hoverX}
              y1={PAD_TOP}
              x2={hoverX}
              y2={PAD_TOP + chartHeight}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {seriesPoints.map(({ key, points }) => (
            <g key={key}>
              <path
                d={smoothPath(points)}
                fill="none"
                stroke={CREATOR_COLORS[key]}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={hoverIndex === i ? 5 : 3}
                  fill={CREATOR_COLORS[key]}
                  stroke="#ffffff"
                  strokeWidth={hoverIndex === i ? 2 : 1.5}
                >
                  <title>
                    {`${CREATORS.find((c) => c.key === key)?.label} · ${longDate(timestamps[i])} · ${formatCurrency(p.value)}`}
                  </title>
                </circle>
              ))}
            </g>
          ))}

          <text x={PAD_LEFT} y={PAD_TOP + chartHeight + 18} fontSize="11" fill="rgba(255,255,255,0.55)">
            {shortDate(timestamps[0])}
          </text>
          <text
            x={width - PAD_RIGHT}
            y={PAD_TOP + chartHeight + 18}
            fontSize="11"
            fill="rgba(255,255,255,0.55)"
            textAnchor="end"
          >
            {shortDate(timestamps[timestamps.length - 1])}
          </text>

          <text
            x={PAD_LEFT + chartWidth / 2}
            y={HEIGHT - 6}
            fontSize="11"
            fill="rgba(255,255,255,0.8)"
            textAnchor="middle"
          >
            Dia
          </text>

          <text
            x={12}
            y={PAD_TOP + chartHeight / 2}
            fontSize="11"
            fill="rgba(255,255,255,0.8)"
            textAnchor="middle"
            transform={`rotate(-90, 12, ${PAD_TOP + chartHeight / 2})`}
          >
            Receita
          </text>
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
                  {formatCurrency(points[hoverIndex].value)}
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
      </div>
    </div>
  );
}
