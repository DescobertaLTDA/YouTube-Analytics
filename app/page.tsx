import { getCreatorEarnings, getCreatorDailyEarnings } from "@/lib/data";
import { AtualizarButton } from "@/app/components/AtualizarButton";
import { CarregarCsvButton } from "@/app/components/CarregarCsvButton";
import { CreatorCard } from "@/app/components/CreatorCard";
import { RevenueStatCard } from "@/app/components/RevenueStatCard";
import { GanhosVideoHistory } from "@/app/components/GanhosVideoHistory";
import { TopVideosMonth } from "@/app/components/TopVideosMonth";
import { NoCreatorDrawer } from "@/app/components/NoCreatorDrawer";
import { EarningsHistoryChart } from "@/app/components/EarningsHistoryChart";
import { PaymentCountdownCard } from "@/app/components/PaymentCountdownCard";
import { PreviousMonthEarningsProvider } from "@/app/components/PreviousMonthEarningsContext";
import {
  monthRangeLabel,
  monthRangeFullLabel,
  daysLeftInMonth,
  nowInSaoPaulo,
  getPaymentCountdown,
} from "@/lib/date-br";
import { formatNumber, formatCurrency, formatDateFull as formatDate } from "@/lib/format-br";

export const revalidate = 0;

export default async function GanhosPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  // As duas buscas não dependem uma da outra (getCreatorEarnings lê
  // creator_videos/manual_revenue/APIs externas; getCreatorDailyEarnings lê
  // o histórico diário pro gráfico), mas antes eram aguardadas em
  // sequência — cada uma já pesada sozinha (varredura paginada de tabela +
  // chamadas a APIs externas), então rodavam uma depois da outra e SOMAVAM
  // os tempos. Com Promise.all elas rodam em paralelo, cortando o tempo
  // total de carregamento da página pela metade.
  const [data, earningsHistory] = await Promise.all([
    getCreatorEarnings(),
    getCreatorDailyEarnings(28),
  ]);

  // Calculado uma única vez aqui (server component) e passado como prop
  // adiante — evita que os client components recalculem "agora" de novo
  // na hidratação, o que já causou mismatches de #418/#423 no passado.
  const monthLabel = monthRangeLabel();
  const monthFullLabel = monthRangeFullLabel();
  const daysLeft = daysLeftInMonth();
  const daysElapsed = nowInSaoPaulo().getDate();
  const paymentCountdown = getPaymentCountdown();
  const page = Number(searchParams.page) || 1;
  // Maior "Ganhos do mês" entre os criadores — usado pra destacar o card
  // vencedor do dia com o selo dourado. Só entra em jogo se houver ganho
  // de fato (> 0), pra não destacar todo mundo quando ainda está zerado.
  const topMonthEarnings = Math.max(0, ...data.creators.map((c) => c.monthEarnings));
  const creatorsEarnings = data.creators.reduce((sum, c) => sum + c.totalEarnings, 0);
  const noCreatorEarnings = Math.round((data.periodEarnings - creatorsEarnings) * 100) / 100;
  // Total de vendas da Cakto (28d) — soma TODOS os pedidos pagos da conta,
  // sem depender de UTM por criador (na prática os links de checkout não
  // usam utm_campaign=lucas/matheus/rafael, então o filtro por criador
  // sempre voltava 0 mesmo com vendas reais). "—" só quando a chamada à
  // API da Cakto falha de verdade.
  const caktoAllNull = data.caktoTotalAmount == null;
  const caktoTotalAmount = data.caktoTotalAmount || 0;

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <p className="greeting">Olá 👋</p>
          <span className="eyebrow">Canal de Pedras e Minerais</span>
          <h1 className="title">Seus ganhos</h1>
          <p className="subtitle">
            Views e receita estimada dos últimos 28 dias, por criador — coletados
            automaticamente via varredura de hashtag no YouTube Data API v3.
          </p>
        </div>
        <div className="header-row-actions header-row-actions-inline">
          <div className="ganhos-actions-group">
            <AtualizarButton />
            <CarregarCsvButton />
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
          <div className="stat-label">Escaneados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{formatCurrency(data.avgShortsRpm)}</div>
          <div className="stat-label">RPM Shorts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value-large">{formatCurrency(data.avgLongRpm)}</div>
          <div className="stat-label">RPM Vídeos</div>
        </div>
        <div className="stat-card stat-card-cakto">
          <div className="stat-value-large emerald">
            {caktoAllNull ? "—" : formatCurrency(caktoTotalAmount)}
          </div>
          <div className="stat-label">Vendas Cakto</div>
        </div>
        <NoCreatorDrawer
          count={data.noHashtagCount}
          amount={noCreatorEarnings}
          videos={data.noHashtagVideos}
        />
      </div>

      <EarningsHistoryChart history={earningsHistory} />

      <PaymentCountdownCard
        variant="banner"
        targetUtcIso={paymentCountdown.targetUtcIso}
        isPaymentDayToday={paymentCountdown.isPaymentDayToday}
      />

      <PreviousMonthEarningsProvider>
        <div className="creator-grid">
          {data.creators.map((stats) => (
            <CreatorCard
              key={stats.key}
              stats={stats}
              monthLabel={monthLabel}
              monthFullLabel={monthFullLabel}
              daysLeft={daysLeft}
              daysElapsed={daysElapsed}
              videos={data.periodVideos.filter((v) => v.creatorLabel.split(" + ").includes(stats.label))}
              isManualRevenue={data.isManualRevenue}
              isMonthLeader={topMonthEarnings > 0 && stats.monthEarnings === topMonthEarnings}
            />
          ))}
        </div>
      </PreviousMonthEarningsProvider>

      <TopVideosMonth videos={data.topVideosMonth} />

      <GanhosVideoHistory videos={data.periodVideos} page={page} avgVph={data.avgVphByFormat} />

      <footer className="page-footer">
        supabase · projeto ildxajnvgoduikxkcxqv · região sa-east-1
      </footer>
    </main>
  );
}
