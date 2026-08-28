"use client";

import { useEffect, useRef, useState } from "react";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";
import { IconTrendingUp } from "@/app/components/Icons";
import type { EarningsHistoryPoint } from "@/lib/data";

// Uma cor por criador — vivas e bem distintas entre si, de propósito, pra
// ficar fácil de diferenciar as linhas de longe.
const CREATOR_COLORS: Record<CreatorKey, string> = {
  lucas: "#e21e2c", // vermelho
  matheus: "#0057ff", // azul
  rafael: "#00b341", // verde
};

const HEIGHT = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 4;
const PAD_RIGHT = 4;
const FALLBACK_WIDTH = 700;

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function EarningsHistoryChart({ history }: { history: EarningsHistoryPoint[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Largura real do container em px — medida no cliente pra o SVG ir de
  // ponta a ponta sem esticar/distorcer linhas, pontos e texto (o que
  // acontecia usando preserveAspectRatio com um viewBox de largura fixa).
  const [width, setWidth] = useState(FALLBACK_WIDTH);

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
          Ainda não tem histórico suficiente pra desenhar o gráfico. Cada clique em
          &quot;Atualizar&quot; grava um ponto novo — depois de sincronizar em pelo menos 2 dias
          diferentes a linha aparece aqui.
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

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => PAD_TOP + chartHeight * (1 - f));

  return (
    <div className="chart-section">
      <h2 className="icon-label"><IconTrendingUp /> Receita ao longo do tempo</h2>

      <div className="chart-line-wrapper" ref={wrapperRef}>
        <svg
          className="chart-line"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          preserveAspectRatio="none"
        >
          {gridLines.map((y, i) => (
            <line key={i} x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke="#e9ecef" strokeWidth={1} />
          ))}

          {CREATORS.map(({ key }) => {
            const points = timestamps.map((t, i) => {
              const point = history.find((h) => h.capturedAt === t && h.creator === key);
              return { x: xFor(i), y: yFor(point?.totalEarnings ?? 0) };
            });
            const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(" ");

            return (
              <g key={key}>
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke={CREATOR_COLORS[key]}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill={CREATOR_COLORS[key]} stroke="#ffffff" strokeWidth={1.5}>
                    <title>
                      {CREATORS.find((c) => c.key === key)?.label} · {formatDateTime(timestamps[i])} ·{" "}
                      {formatCurrency(history.find((h) => h.capturedAt === timestamps[i] && h.creator === key)?.totalEarnings ?? 0)}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          <text x={PAD_LEFT} y={HEIGHT - 8} fontSize="11" fill="#909090">
            {formatDateShort(timestamps[0])}
          </text>
          <text x={width - PAD_RIGHT} y={HEIGHT - 8} fontSize="11" fill="#909090" textAnchor="end">
            {formatDateShort(timestamps[timestamps.length - 1])}
          </text>
        </svg>
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
