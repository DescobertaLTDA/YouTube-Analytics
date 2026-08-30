import type { GanhosVideoRow } from "@/lib/data";
import { IconTrophy } from "@/app/components/Icons";
import { monthRangeLabel } from "@/lib/date-br";
import { formatNumber, formatCurrency } from "@/lib/format-br";

export function TopVideosMonth({ videos }: { videos: GanhosVideoRow[] }) {
  return (
    <div className="changes-section top-videos-section">
      <h2 className="icon-label">
        <IconTrophy /> Top 10 do Mês · {monthRangeLabel()}
      </h2>

      {videos.length === 0 && (
        <div className="no-changes">Nenhum vídeo publicado no mês ainda.</div>
      )}

      {videos.length > 0 && (
        <div className="top-video-scroll">
          <div className="top-video-table">
            <div className="top-video-row top-video-header">
              <span className="top-video-rank" />
              <span className="top-video-thumb-col" />
              <span className="top-video-title-col">Vídeo</span>
              <span className="top-video-views-col">Views</span>
              <span className="top-video-revenue-col">Receita</span>
            </div>

            {videos.map((v, i) => {
              return (
                <div className={`top-video-row rank-${i + 1}`} key={v.youtubeVideoId}>
                  <div className="top-video-rank">{i + 1}º</div>

                  <div className="top-video-thumb-col">
                    {v.thumbnailUrl && (
                      <img className="history-thumb" src={v.thumbnailUrl} alt={v.title ?? ""} />
                    )}
                  </div>

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
                    </div>
                  </div>

                  <div className="top-video-views-col">{formatNumber(v.viewCount)}</div>

                  <div className="top-video-revenue-col">{formatCurrency(v.revenue)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
