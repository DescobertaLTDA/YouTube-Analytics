import type { GanhosVideoRow } from "@/lib/data";
import { computeVph, formatMultiplier, formatVph, vphTier, VphFormat } from "@/lib/vph";

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

export function TopVideosMonth({
  videos,
  avgVph,
}: {
  videos: GanhosVideoRow[];
  // Média global de VPH por formato (todo o histórico do canal), calculada
  // uma vez em lib/data.ts e compartilhada com o Histórico de Vídeos, pra
  // os dois cards usarem a mesma referência de "quantas vezes acima do
  // normal" um vídeo está.
  avgVph: Record<VphFormat, number | null>;
}) {
  return (
    <div className="changes-section top-videos-section">
      <h2>🏆 Top 10 do Mês · {monthRangeLabel()}</h2>

      {videos.length === 0 && (
        <div className="no-changes">Nenhum vídeo publicado no mês ainda.</div>
      )}

      {videos.length > 0 && (
        <div className="top-video-table">
          <div className="top-video-row top-video-header">
            <span className="top-video-rank" />
            <span className="top-video-thumb-col" />
            <span className="top-video-title-col">Vídeo</span>
            <span className="history-stats top-video-stats top-video-stats-header">
              <span className="history-stat">Views</span>
              <span className="history-stat">VPH</span>
              <span className="history-stat">Receita</span>
            </span>
          </div>

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
                  </div>
                </div>

                <div className="history-stats top-video-stats">
                  <div className="history-stat">
                    <span className="history-stat-value malachite">{formatNumber(v.viewCount)}</span>
                    <span className="history-stat-label">views</span>
                  </div>
                  <div className="history-stat">
                    {vph != null ? (
                      <>
                        <span className="history-stat-value">{formatVph(vph)}</span>
                        <span className={`vph-badge ${tier.className}`}>
                          {tier.emoji} {formatMultiplier(multiplier)}
                        </span>
                      </>
                    ) : (
                      <span className="history-stat-value">—</span>
                    )}
                    <span className="history-stat-label">vph</span>
                  </div>
                  <div className="history-stat top-video-revenue-stat">
                    <span className="top-video-revenue">{formatCurrency(v.revenue)}</span>
                    <span className="history-stat-label">receita</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
