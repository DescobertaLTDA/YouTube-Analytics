import { getCreatorEarnings } from "@/lib/data";
import { SiteNav } from "@/app/components/SiteNav";
import { CreatorCard } from "@/app/components/CreatorCard";
import { AtualizarButton } from "@/app/components/AtualizarButton";

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

export default async function GanhosPage() {
  const { creators, lastSyncedAt, totalVideosScanned } = await getCreatorEarnings();

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Ganhos por Criador</h1>
          <p className="subtitle">
            Views e receita estimada de cada criador, somando todos os vídeos do canal marcados
            com a hashtag dele (#lucas, #matheus, #rafael) — separado entre Shorts e vídeos
            longos.
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
        <div className="creator-grid">
          {creators.map((stats) => (
            <CreatorCard key={stats.key} stats={stats} />
          ))}
        </div>
      )}

      <footer className="page-footer">
        RPM fixo de R$ 0,22 · ganhos = views × RPM ÷ 1000 ÷ 2 · supabase · projeto ildxajnvgoduikxkcxqv
      </footer>
    </main>
  );
}
