import Link from "next/link";
import type { GanhosVideoRow } from "@/lib/data";
import { averageVphByFormat, computeVph, formatMultiplier, formatVph, vphTier } from "@/lib/vph";

const PAGE_SIZE = 10;

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GanhosVideoHistory({
  videos,
  page,
}: {
  videos: GanhosVideoRow[];
  page: number;
}) {
  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageVideos = videos.slice(start, start + PAGE_SIZE);

  // Média de VPH calculada sobre TODOS os vídeos do período (não só a
  // página atual), pra a referência de "acima da média" não mudar de
  // página em página.
  const avgVph = averageVphByFormat(videos);

  return (
    <div className="changes-section">
      <h2>📼 Histórico de Vídeos · últimos 28 dias</h2>

      {videos.length === 0 && <div className="no-changes">Nenhum vídeo no período ainda.</div>}

      {pageVideos.map((v) => {
        const vph = computeVph(v.viewCount, v.publishedAt);
        const avg = v.isShort ? avgVph.short : avgVph.long;
        const multiplier = vph != null && avg ? vph / avg : null;
        const tier = vphTier(multiplier);

        return (
          <div className="history-row" key={v.youtubeVideoId}>
            {v.thumbnailUrl && <img className="history-thumb" src={v.thumbnailUrl} alt={v.title ?? ""} />}
            <div className="history-main">
              <a
                href={`https://youtube.com/watch?v=${v.youtubeVideoId}`}
                target="_blank"
                rel="noreferrer"
                className="history-title"
              >
                {v.title ?? "sem título"}
              </a>
              <div className="history-meta">
                <span className="card-label">{v.creatorLabel}</span>
                <span className="text-muted-small">{v.isShort ? "Short" : "Vídeo longo"}</span>
                <span className="text-muted-small">{formatDate(v.publishedAt)}</span>
                {vph != null && (
                  <span className="vph-tag">
                    <span className="vph-tag-value">{formatVph(vph)} VPH</span>
                    <span className={`vph-badge ${tier.className}`}>
                      {tier.emoji} {formatMultiplier(multiplier)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="history-stats">
              <div className="history-stat">
                <span className="history-stat-value malachite">{formatNumber(v.viewCount)}</span>
                <span className="history-stat-label">views</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{formatNumber(v.likeCount)}</span>
                <span className="history-stat-label">likes</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{formatNumber(v.commentCount)}</span>
                <span className="history-stat-label">comentários</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value">{formatDuration(v.durationSeconds)}</span>
                <span className="history-stat-label">duração</span>
              </div>
              <div className="history-stat">
                <span className="history-stat-value malachite">{formatCurrency(v.revenue)}</span>
                <span className="history-stat-label">receita</span>
              </div>
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="pagination">
          <Link
            href={`/?page=${currentPage - 1}`}
            className={`pagination-link ${currentPage <= 1 ? "pagination-disabled" : ""}`}
          >
            ← anterior
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/?page=${n}`}
              className={`pagination-link ${n === currentPage ? "pagination-current" : ""}`}
            >
              {n}
            </Link>
          ))}
          <Link
            href={`/?page=${currentPage + 1}`}
            className={`pagination-link ${currentPage >= totalPages ? "pagination-disabled" : ""}`}
          >
            próxima →
          </Link>
        </div>
      )}
    </div>
  );
}
