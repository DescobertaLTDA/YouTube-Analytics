import Link from "next/link";
import type { GanhosVideoRow } from "@/lib/data";
import { computeVph, formatMultiplier, formatVph, vphTier, VphFormat } from "@/lib/vph";
import { IconFilm } from "@/app/components/Icons";
import { formatNumber, formatCurrency, formatDateShort as formatDate } from "@/lib/format-br";

const PAGE_SIZE = 10;

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
  avgVph,
}: {
  videos: GanhosVideoRow[];
  page: number;
  // Média global de VPH por formato (todo o histórico do canal), calculada
  // uma vez em lib/data.ts e compartilhada com o Top 10 do Mês, pra os
  // dois cards usarem a mesma referência de "acima da média" e o mesmo
  // vídeo não mudar de selo dependendo de qual lista o mostra.
  avgVph: Record<VphFormat, number | null>;
}) {
  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageVideos = videos.slice(start, start + PAGE_SIZE);

  return (
    <div className="changes-section">
      <h2 className="icon-label">
        <IconFilm /> Histórico de Vídeos · últimos 28 dias
      </h2>

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
              {v.intentionalViews != null && (
                <div className="history-stat">
                  <span className="history-stat-value malachite">
                    {formatNumber(v.intentionalViews)}
                  </span>
                  <span className="history-stat-label">views intencionais</span>
                </div>
              )}
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
