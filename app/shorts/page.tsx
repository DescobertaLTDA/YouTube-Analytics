import { getAllVideoRows } from "@/lib/data";
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

export default async function ShortsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const allRows = await getAllVideoRows();
  const rows = allRows.filter((r) => r.isShort);
  const page = Number(searchParams.page) || 1;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Shorts</h1>
          <p className="subtitle">
            Views por dia e histórico de trocas de título, thumbnail e descrição dos Shorts
            (vídeos de até 3 minutos) — coletados automaticamente via YouTube Data API v3.
            Inclui tanto os cadastrados manualmente quanto os achados pela varredura de
            hashtag da aba Ganhos.
          </p>
        </div>
        <div className="sync-pill">
          última sincronização:{" "}
          <strong>{allRows.length > 0 ? formatDate(allRows[0].latest?.captured_at) : "—"}</strong>
        </div>
      </div>

      <VideoDashboardGrid
        rows={rows}
        emptyTitle="Nenhum Short encontrado ainda"
        emptyDescription="Vídeos com até 3 minutos aparecem aqui depois de cadastrados manualmente, ou automaticamente ao clicar em Atualizar na aba Ganhos."
        page={page}
        basePath="/shorts"
      />

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
