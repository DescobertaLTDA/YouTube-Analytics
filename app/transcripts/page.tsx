import { getTranscripts, getVideoOptions } from "@/lib/data";
import { TranscriptForm } from "@/app/components/TranscriptForm";
import { formatDateTime } from "@/lib/format-br";

export const revalidate = 0;

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default async function TranscriptsPage() {
  const [transcripts, videos] = await Promise.all([getTranscripts(), getVideoOptions()]);

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Roteiros</span>
          <h1 className="title">Importar Transcript</h1>
          <p className="subtitle">
            Cole o transcript do vídeo (formato tactiq.io) abaixo. O site arquiva o texto original e
            extrai a minutagem — cada linha de timestamp vira um registro pesquisável, e linhas do
            tipo &quot;Número N.&quot; são marcadas como capítulo.
          </p>
        </div>
      </div>

      <TranscriptForm videos={videos} />

      <div className="transcript-list">
        {transcripts.length === 0 && (
          <div className="empty facet">
            <h2>Nenhum transcript arquivado ainda</h2>
            <p>Cole um roteiro no formulário acima para começar.</p>
          </div>
        )}

        {transcripts.map(({ transcript, segments }) => {
          const chapters = segments.filter((s) => s.is_chapter);
          return (
            <div className="transcript-card facet-sm" key={transcript.id}>
              <div className="transcript-card-top">
                <h3 className="transcript-card-title">
                  {transcript.source_title ?? transcript.youtube_video_id ?? "transcript sem título"}
                </h3>
                <span className="transcript-card-meta">
                  {formatDateTime(transcript.uploaded_at)} · {transcript.segment_count} linhas ·{" "}
                  {formatDuration(transcript.duration_seconds)}
                  {transcript.youtube_video_id ? ` · ${transcript.youtube_video_id}` : ""}
                </span>
              </div>

              <div className="transcript-segments">
                {(chapters.length > 0 ? chapters : segments.slice(0, 20)).map((seg) => (
                  <div className={`transcript-segment ${seg.is_chapter ? "chapter" : ""}`} key={seg.id}>
                    <span className="transcript-segment-time">{seg.timestamp_label.slice(0, 8)}</span>
                    <span className="transcript-segment-text">{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
