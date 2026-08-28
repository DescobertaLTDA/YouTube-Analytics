import Link from "next/link";
import type { VideoWithStats } from "@/lib/data";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function VideoDashboardGrid({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: VideoWithStats[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty facet">
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="grid-6">
      {rows.map(({ video, latest, viewsPerDay, manual, revenue }) => (
        <Link href={`/video/${video.id}`} className="card-link" key={video.id}>
          <div className="card facet card-clickable">
            {latest?.thumbnail_url && (
              <img className="thumb" src={latest.thumbnail_url} alt={latest.title ?? "thumbnail"} />
            )}

            <div className="card-top">
              <div>
                <span className="card-label">{video.channel_label ?? "vídeo"}</span>
                <h3 className="card-title">{latest?.title ?? "sem título"}</h3>
              </div>
            </div>

            <div className="stat-row-2">
              <div className="stat">
                <div className="stat-value malachite">{formatNumber(latest?.view_count)}</div>
                <div className="stat-label">views totais</div>
              </div>
              <div className="stat">
                <div className="stat-value amber">
                  {viewsPerDay != null ? formatNumber(viewsPerDay) : "—"}
                </div>
                <div className="stat-label">views / dia</div>
              </div>
              <div className="stat">
                <div className="stat-value">{manual?.ctr != null ? `${manual.ctr}%` : "—"}</div>
                <div className="stat-label">CTR</div>
              </div>
              <div className="stat">
                <div className="stat-value malachite">{formatCurrency(revenue)}</div>
                <div className="stat-label">receita</div>
              </div>
            </div>

            <div className="card-footer">
              <span className="card-click-hint">👆 Clique para detalhes</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
