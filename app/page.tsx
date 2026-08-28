import { getCreatorEarnings } from "@/lib/data";
import { SiteNav } from "@/app/components/SiteNav";
import { AtualizarButton } from "@/app/components/AtualizarButton";
import { CreatorCard } from "@/app/components/CreatorCard";
import { RevenueStatCard } from "@/app/components/RevenueStatCard";
import { GanhosVideoHistory } from "@/app/components/GanhosVideoHistory";
import { TopVideosMonth } from "@/app/components/TopVideosMonth";

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
  const creatorsEarnings = data.creators.reduce((sum, c) => sum + c.totalEarnings, 0);
  const noCreatorEarnings = Math.round((data.periodEarnings - creatorsEarnings) * 100) / 100;

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
        <div className="header-row-actions">
          <div className="header-row-actions-top">
            <AtualizarButton />
            <SiteNav active="ganhos" />
          </div>
          <div className="sync-pill">
            última sincronização: <strong>{formatDate(data.lastSyncedAt)}</strong>
          </div>
        </div>
      </div>

      <div className="stats-grid stats-grid-ganhos">
        <div className="stat-card">
          <div className="stat-value-large amber">{formatNumber(data.periodViews)}</div>
          <div className="stat-label">Views · 28d</div>
        </div>
        <RevenueStatCard
          periodEarnings={data.periodEarnings}
          isManualRevenue={data.isManualRevenue}
          manualRevenueAmount={data.manualRevenueAmount}
        />
        <div className="stat-card">
          <div className="stat-value-large">{formatNumber(data.totalVideosScanned)}</div>
          <div className="stat-label">Vídeos escaneados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{formatNumber(data.noHashtagCount)}</div>
          <div className="stat-label">Vídeos sem criador</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large amber">{formatCurrency(noCreatorEarnings)}</div>
          <div className="stat-label">Saldo sem criador</div>
        </div>
      </div>

      <div className="creator-grid">
        {data.creators.map((stats) => (
          <CreatorCard key={stats.key} stats={stats} />
        ))}
      </div>

      <TopVideosMonth videos={data.topVideosMonth} />

      <GanhosVideoHistory videos={data.periodVideos} page={page} />

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
