import type { GanhosVideoRow } from "@/lib/data";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function monthRangeLabel() {
  const now = new Date();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(now);
  const day = now.getDate();
  return `01 a ${day} de ${month}`;
}

export function TopVideosMonth({ videos }: { videos: GanhosVideoRow[] }) {
  return (
    <div className="changes-section top-videos-section">
      <h2>🏆 Top 10 do Mês · {monthRangeLabel()}</h2>

      {videos.length === 0 && (
        <div className="no-changes">Nenhum vídeo publicado no mês ainda.</div>
      )}

      {videos.map((v, i) => (
        <div className={`top-video-row rank-${i + 1}`} key={v.youtubeVideoId}>
          <div className="top-video-rank">{i + 1}º</div>

          {v.thumbnailUrl && (
            <img className="history-thumb" src={v.thumbnailUrl} alt={v.title ?? ""} />
          )}

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
              <span className="text-muted-small">{formatNumber(v.viewCount)} views</span>
            </div>
          </div>

          <div className="top-video-revenue">{formatCurrency(v.revenue)}</div>
        </div>
      ))}
    </div>
  );
}
