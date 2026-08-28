import type { GanhosVideoRow } from "@/lib/data";
import { averageVphByFormat, computeVph, formatMultiplier, formatVph, vphTier } from "@/lib/vph";

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
  // Média de VPH de Shorts e de vídeo longo dentro desse Top 10, pra servir
  // de referência de "quantas vezes acima do normal" cada vídeo está.
  const avgVph = averageVphByFormat(videos);

  return (
    <div className="changes-section top-videos-section">
      <h2>🏆 Top 10 do Mês · {monthRangeLabel()}</h2>

      {videos.length === 0 && (
        <div className="no-changes">Nenhum vídeo publicado no mês ainda.</div>
      )}

      {videos.map((v, i) => {
        const vph = computeVph(v.viewCount, v.publishedAt);
        const avg = v.isShort ? avgVph.short : avgVph.long;
        const multiplier = vph != null && avg ? vph / avg : null;
        const tier = vphTier(multiplier);

        return (
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

            <div className="top-video-revenue">{formatCurrency(v.revenue)}</div>
          </div>
        );
      })}
    </div>
  );
}
