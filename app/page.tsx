import { getCreatorEarnings } from "@/lib/data";
import { SiteNav } from "@/app/components/SiteNav";
import { AtualizarButton } from "@/app/components/AtualizarButton";
import { CreatorCard } from "@/app/components/CreatorCard";
import { RevenueOverrideForm } from "@/app/components/RevenueOverrideForm";
import { GanhosVideoHistory } from "@/app/components/GanhosVideoHistory";

export const revalidate = 0;

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
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function GanhosPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const data = await getCreatorEarnings();
  const page = Number(searchParams.page) || 1;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Ganhos</h1>
          <p className="subtitle">
            Views e receita estimada dos últimos 28 dias, por criador — coletados
            automaticamente via varredura de hashtag no YouTube Data API v3.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <SiteNav active="ganhos" />
          <div className="sync-pill">
            última sincronização: <strong>{formatDate(data.lastSyncedAt)}</strong>
          </div>
          <AtualizarButton />
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value-large amber">{formatNumber(data.periodViews)}</div>
          <div className="stat-label">Views · 28d</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large malachite">{formatCurrency(data.periodEarnings)}</div>
          <div className="stat-label">
            {data.isManualRevenue ? "Receita real · 28d" : "Receita estimada · 28d"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{formatNumber(data.totalVideosScanned)}</div>
          <div className="stat-label">Vídeos escaneados</div>
        </div>
      </div>

      <RevenueOverrideForm currentAmount={data.manualRevenueAmount} />

      <div className="creator-grid">
        {data.creators.map((stats) => (
          <CreatorCard key={stats.key} stats={stats} />
        ))}
      </div>

      <GanhosVideoHistory videos={data.periodVideos} page={page} />

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
