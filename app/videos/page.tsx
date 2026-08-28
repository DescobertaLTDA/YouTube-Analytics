import { getAllVideoRows } from "@/lib/data";
import { SiteNav } from "@/app/components/SiteNav";
import { VideoDashboardGrid } from "@/app/components/VideoDashboardGrid";

export const revalidate = 0;

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function VideosPage() {
  const allRows = await getAllVideoRows();
  const rows = allRows.filter((r) => !r.isShort);

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Vídeos</h1>
          <p className="subtitle">
            Views por dia e histórico de trocas de título, thumbnail e descrição dos vídeos
            longos — coletados automaticamente via YouTube Data API v3. Inclui tanto os
            cadastrados manualmente quanto os achados pela varredura de hashtag da aba Ganhos.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <SiteNav active="videos" />
          <div className="sync-pill">
            última sincronização:{" "}
            <strong>{allRows.length > 0 ? formatDate(allRows[0].latest?.captured_at) : "—"}</strong>
          </div>
        </div>
      </div>

      <VideoDashboardGrid
        rows={rows}
        emptyTitle="Nenhum vídeo longo encontrado ainda"
        emptyDescription="Vídeos com mais de 3 minutos aparecem aqui depois de cadastrados manualmente, ou automaticamente ao clicar em Atualizar na aba Ganhos."
      />

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
