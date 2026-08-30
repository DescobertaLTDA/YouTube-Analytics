"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(iso)
  );
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* Ícones minimalistas que aparecem sobre a miniatura ao passar o mouse,
   imitando a barra de ações rápidas do Studio (editar, analytics,
   comentários, monetização, mais opções). */
function HoverIcons({ videoId }: { videoId: string }) {
  const router = useRouter();
  return (
    <div className="yt-hover-icons">
      <span
        className="yt-hover-icon"
        title="Detalhes"
        role="link"
        tabIndex={0}
        onClick={(e) => {
          // Não pode ser um <Link>/<a> aqui: esse ícone já fica dentro do
          // <Link> que envolve a linha inteira, e <a> dentro de <a> é HTML
          // inválido — o navegador desaninha isso ao parsear o HTML do
          // servidor, e a árvore que sobra diverge da que o React espera
          // hidratar (era exatamente a causa dos erros #418/#423).
          e.preventDefault();
          e.stopPropagation();
          router.push(`/video/${videoId}`);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/video/${videoId}`);
          }
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="yt-hover-icon" title="Analytics">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="yt-hover-icon" title="Comentários">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="yt-hover-icon" title="Monetização">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 7v10M9.5 9.5c0-1.4 1.2-2 2.5-2s2.5.7 2.5 2-1 1.6-2.5 2-2.5.7-2.5 2 1.1 2 2.5 2 2.5-.6 2.5-2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="yt-hover-icon" title="Mais opções">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </span>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
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
    <div className="yt-section">
      <div className="video-list-header">
        <span className="text-muted-small">
          {formatNumber(rows.length)} vídeo(s) no total · página {currentPage} de {totalPages}
        </span>
      </div>

      <div className="yt-table-wrap">
        <table className="yt-table">
          <thead>
            <tr>
              <th className="yt-checkbox-cell"></th>
              <th className="yt-col-video">Vídeo</th>
              <th className="yt-col-optional">Avisos</th>
              <th className="yt-col-optional">Visibilidade</th>
              <th>
                <span className="yt-th-sort">Data ↓</span>
              </th>
              <th className="yt-col-num">Visualizações</th>
              <th className="yt-col-num">Receita est.</th>
              <th className="yt-col-num yt-col-optional">Comentários</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ video, latest, revenue }) => {
              const duration = formatDuration(latest?.duration_seconds);
              return (
                <tr className="yt-row" key={video.id}>
                  <td className="yt-checkbox-cell">
                    <span className="yt-checkbox" />
                  </td>
                  <td>
                    <Link href={`/video/${video.id}`} className="yt-video-cell">
                      <div className="yt-thumb-wrap">
                        {latest?.thumbnail_url && (
                          <img src={latest.thumbnail_url} alt={latest.title ?? "thumbnail"} />
                        )}
                        {duration && <span className="yt-duration">{duration}</span>}
                        <HoverIcons videoId={video.id} />
                      </div>
                      <div className="yt-video-main">
                        <span className="yt-video-title">{latest?.title ?? "sem título"}</span>
                        <span className="yt-ab-badge">{video.channel_label ?? "vídeo"}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="yt-col-optional yt-muted-dash">—</td>
                  <td className="yt-col-optional">
                    <span className="yt-visibility">
                      <GlobeIcon /> Público
                    </span>
                  </td>
                  <td>
                    <span className="yt-date-main">{formatDate(video.published_at)}</span>
                    <span className="yt-date-sub">Publicado</span>
                  </td>
                  <td className="yt-td-num">{formatNumber(latest?.view_count)}</td>
                  <td className="yt-td-num">{formatCurrency(revenue)}</td>
                  <td className="yt-td-num yt-col-optional">{formatNumber(latest?.comment_count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
