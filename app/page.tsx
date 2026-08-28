import { getCreatorEarnings } from "@/lib/data";
import { SiteNav } from "@/app/components/SiteNav";
import { CreatorCard } from "@/app/components/CreatorCard";
import { AtualizarButton } from "@/app/components/AtualizarButton";
import { RevenueOverrideForm } from "@/app/components/RevenueOverrideForm";

export const revalidate = 0;

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(iso)
  );
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export default async function GanhosPage() {
  const {
    creators,
    lastSyncedAt,
    totalVideosScanned,
    periodStart,
    periodEnd,
    periodViews,
    periodEarnings,
    isManualRevenue,
    manualRevenueAmount,
  } = await getCreatorEarnings();

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Ganhos por Criador</h1>
          <p className="subtitle">
            Views e receita dos últimos 28 dias ({formatDate(periodStart)} –{" "}
            {formatDate(periodEnd)}, por data de publicação) de cada criador, somando os vídeos
            marcados com a hashtag dele (#lucas, #matheus, #rafael) — separado entre Shorts e
            vídeos longos.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <SiteNav active="ganhos" />
          <div className="sync-pill">
            última atualização: <strong>{formatDateTime(lastSyncedAt)}</strong>
          </div>
          <AtualizarButton />
        </div>
      </div>

      {totalVideosScanned === 0 && (
        <div className="empty facet">
          <h2>Nenhum vídeo encontrado ainda</h2>
          <p>
            Clique em <strong>Atualizar</strong> pra varrer o canal e achar os vídeos com
            #lucas, #matheus e #rafael no título ou descrição.
          </p>
        </div>
      )}

      {totalVideosScanned > 0 && (
        <>
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-value-large malachite">{formatNumber(periodViews)}</div>
              <div className="stat-label">Views · últimos 28 dias</div>
            </div>
            <div className="stat-card">
              <div className="stat-value-large malachite">{formatCurrency(periodEarnings)}</div>
              <div className="stat-label">
                Receita total · {isManualRevenue ? "valor real informado" : "estimativa por RPM"}
              </div>
            </div>
            <div className="stat-card">
              <RevenueOverrideForm currentAmount={manualRevenueAmount} />
            </div>
          </div>

          <div className="creator-grid">
            {creators.map((stats) => (
              <CreatorCard key={stats.key} stats={stats} />
            ))}
          </div>
        </>
      )}

      <footer className="page-footer">
        RPM fixo de R$ 0,32 (usado só quando não há valor real informado) · receita dividida
        proporcionalmente à % de views de cada criador nos últimos 28 dias · supabase · projeto
        ildxajnvgoduikxkcxqv
      </footer>
    </main>
  );
}
