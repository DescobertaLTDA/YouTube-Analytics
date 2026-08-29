import Link from "next/link";
import type { VideoWithStats } from "@/lib/data";

const PAGE_SIZE = 10;

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

export function VideoDashboardGrid({
  rows,
  emptyTitle,
  emptyDescription,
  page,
  basePath,
}: {
  rows: VideoWithStats[];
  emptyTitle: string;
  emptyDescription: string;
  // Página atual (1-indexed) e rota base pra montar os links de paginação
  // (ex: "/videos", "/shorts") — cada aba pagina de forma independente.
  page: number;
  basePath: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty facet">
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="changes-section">
      <div className="video-list-header">
        <span className="text-muted-small">
          {formatNumber(rows.length)} vídeo(s) no total · página {currentPage} de {totalPages}
        </span>
      </div>

      {pageRows.map(({ video, latest, viewsPerDay, manual, revenue, source }) => (
        <Link href={`/video/${video.id}`} className="history-row-link" key={video.id}>
          <div className="history-row">
            {latest?.thumbnail_url && (
              <img
                className="history-thumb"
                src={latest.thumbnail_url}
                alt={latest.title ?? "thumbnail"}
              />
            )}

            <div className="history-main">
              <span className="history-title">{latest?.title ?? "sem título"}</span>
              <div className="history-meta">
                <span className="card-label">
                  {video.channel_label ?? "vídeo"}
                  {source === "auto" && " · auto"}
                </span>
                <span className="text-muted-small">{formatDate(video.published_at)}</span>
              </div>
            </div>

            <div className="history-stats">
              <div className="history-stat">
                <span className="history-stat-value malachite">
                  {formatNumber(latest?.view_count)}
                </span>
                <span className="history-stat-label">views totais</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value amber">
                  {viewsPerDay != null ? formatNumber(viewsPerDay) : "—"}
                </span>
                <span className="history-stat-label">views / dia</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">
                  {manual?.ctr != null ? `${manual.ctr}%` : "—"}
                </span>
                <span className="history-stat-label">CTR</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value malachite">{formatCurrency(revenue)}</span>
                <span className="history-stat-label">receita</span>
              </div>
            </div>
          </div>
        </Link>
      ))}

      {totalPages > 1 && (
        <div className="pagination">
          <Link
            href={`${basePath}?page=${currentPage - 1}`}
            className={`pagination-link ${currentPage <= 1 ? "pagination-disabled" : ""}`}
          >
            ← anterior
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`${basePath}?page=${n}`}
              className={`pagination-link ${n === currentPage ? "pagination-current" : ""}`}
            >
              {n}
            </Link>
          ))}
          <Link
            href={`${basePath}?page=${currentPage + 1}`}
            className={`pagination-link ${currentPage >= totalPages ? "pagination-disabled" : ""}`}
          >
            próxima →
          </Link>
        </div>
      )}
    </div>
  );
}
