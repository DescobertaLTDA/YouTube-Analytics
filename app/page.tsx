import { getDashboardData } from "@/lib/data";
import { RpmForm } from "@/app/components/RpmForm";

export const revalidate = 0; // sempre buscar dado fresco

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

function fieldLabel(field: string) {
  if (field === "title") return "título";
  if (field === "thumbnail_url") return "thumbnail";
  if (field === "description") return "descrição";
  return field;
}

export default async function Home() {
  const rows = await getDashboardData();
  const hasData = rows.length > 0;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Painel de Acompanhamento</h1>
          <p className="subtitle">
            Views por dia, e histórico de trocas de título, thumbnail e descrição — coletados
            automaticamente via YouTube Data API v3. RPM é inserido manualmente e a receita é
            calculada automaticamente.
          </p>
        </div>
        <div className="sync-pill">
          última sincronização: <strong>{hasData ? formatDate(rows[0].latest?.captured_at) : "—"}</strong>
        </div>
      </div>

      {!hasData && (
        <div className="empty facet">
          <h2>Nenhum vídeo cadastrado ainda</h2>
          <p>
            O banco (projeto <code>YouTube Analytics</code> no Supabase) está pronto, mas a tabela{" "}
            <code>videos</code> está vazia. Assim que os vídeos forem cadastrados e a Edge Function de
            coleta rodar pela primeira vez, este painel passa a mostrar:
          </p>
          <ol>
            <li>Views acumuladas e views/dia de cada vídeo</li>
            <li>Título, descrição e thumbnail atuais</li>
            <li>Histórico de quando cada um desses campos foi alterado</li>
            <li>Receita estimada, a partir do RPM informado manualmente</li>
          </ol>
        </div>
      )}

      {hasData && (
        <div className="grid">
          {rows.map(({ video, latest, viewsPerDay, daysLive, manual, revenue, changes }) => (
            <div className="card facet" key={video.id}>
              {latest?.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="thumb" src={latest.thumbnail_url} alt={latest.title ?? "thumbnail"} />
              )}

              <div className="card-top">
                <div>
                  <span className="card-label">{video.channel_label ?? "vídeo"}</span>
                  <h3 className="card-title">{latest?.title ?? "sem título coletado ainda"}</h3>
                </div>
              </div>

              <div className="stat-row">
                <div className="stat">
                  <div className="stat-value malachite">{formatNumber(latest?.view_count)}</div>
                  <div className="stat-label">views totais</div>
                </div>
                <div className="stat">
                  <div className="stat-value amber">{viewsPerDay != null ? formatNumber(viewsPerDay) : "—"}</div>
                  <div className="stat-label">views / dia{daysLive ? ` · ${daysLive}d` : ""}</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{manual?.ctr != null ? `${manual.ctr}%` : "—"}</div>
                  <div className="stat-label">CTR (studio)</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{manual?.retention_pct != null ? `${manual.retention_pct}%` : "—"}</div>
                  <div className="stat-label">retenção (studio)</div>
                </div>
              </div>

              <div className="stat-row">
                <div className="stat">
                  <div className="stat-value malachite">{formatCurrency(revenue)}</div>
                  <div className="stat-label">receita estimada</div>
                </div>
                <div className="stat">
                  <RpmForm videoId={video.id} currentRpm={manual?.rpm ?? null} />
                </div>
              </div>

              <div className="changes">
                <div className="changes-title">Últimas alterações detectadas</div>
                {changes.length === 0 && <div className="no-changes">nenhuma alteração registrada ainda</div>}
                {changes.slice(0, 4).map((c) => (
                  <div className="change-item" key={c.id}>
                    <span className="change-field">{fieldLabel(c.changed_field)}</span>
                    {formatDate(c.detected_at)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
