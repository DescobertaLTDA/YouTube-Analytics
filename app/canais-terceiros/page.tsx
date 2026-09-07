import { TrackedChannelsPanel } from "@/app/components/TrackedChannelsPanel";
import { getTrackedChannelsViewsHistory } from "@/lib/tracked-channels-history";

export const revalidate = 0;

export default async function CanaisTerceirosPage() {
  const channelsViewsHistory = await getTrackedChannelsViewsHistory(7 * 24);

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Canais</h1>
          <p className="subtitle">
            Rastreie canais de terceiros (concorrentes ou referências) pela API pública do
            YouTube — sem precisar de acesso à conta deles. Adicione por URL, @handle ou nome, e
            acompanhe o VPH (views por hora) dos vídeos recentes de cada um pra comparar quem
            está bombando agora.
          </p>
        </div>
      </div>

      <TrackedChannelsPanel channelsViewsHistory={channelsViewsHistory} />

      <footer className="page-footer">supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1</footer>
    </main>
  );
}
