import { getCreatorEarnings } from "./data";
import {
  SHORTS_RPM,
  LONG_RPM,
  SHORTS_COUNT_GOAL,
  LONG_COUNT_GOAL,
  SHORTS_REVENUE_GOAL,
  LONG_REVENUE_GOAL,
} from "./creator-earnings";

function brl(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function num(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

/**
 * Monta um bloco de texto em português com os números reais do dashboard
 * (Ganhos) — usado como contexto de sistema pro chat de IA. A ideia é dar
 * pra IA os dados crus (views, receita, RPM, metas, dias corridos do mês)
 * e deixar ELA fazer as contas e projeções na conversa, em vez de a gente
 * pré-calcular uma resposta fixa aqui.
 */
// Cache em memória do processo: montar esse contexto envolve várias
// consultas pesadas no Supabase + chamadas às APIs da Cakto e Shopee, e
// antes disso era refeito do zero a CADA mensagem do chat (mesmo perguntas
// simples), causando um delay grande antes da IA sequer começar a
// responder. Os dados de negócio não mudam segundo a segundo — só quando
// os syncs rodam — então cachear por alguns minutos é seguro e deixa a
// segunda+ mensagem da conversa praticamente instantânea nessa etapa. Em
// serverless (Vercel) isso persiste enquanto a função ficar "quente".
let cachedContext: { value: string; expiresAt: number } | null = null;
const CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

export async function buildBusinessContext(): Promise<string> {
  if (cachedContext && cachedContext.expiresAt > Date.now()) {
    return cachedContext.value;
  }

  const value = await buildBusinessContextUncached();
  cachedContext = { value, expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS };
  return value;
}

async function buildBusinessContextUncached(): Promise<string> {
  const data = await getCreatorEarnings();

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now);

  const lines: string[] = [];

  lines.push(`Hoje é dia ${dayOfMonth} de ${monthName} (${daysInMonth} dias no mês, faltam ${daysRemaining} dias pra acabar).`);
  lines.push("");
  lines.push(`RPM fixo usado nas estimativas: Shorts = ${brl(SHORTS_RPM)} por mil views (dividido por 2 no cálculo final); vídeo longo = ${brl(LONG_RPM)} por mil views (sem divisão).`);
  lines.push("");
  lines.push(`=== ÚLTIMOS 28 DIAS (canal todo) ===`);
  lines.push(`Views no período: ${num(data.periodViews)}`);
  lines.push(
    `Receita do período: ${brl(data.periodEarnings)} ${
      data.isManualRevenue
        ? "(valor REAL digitado a partir do YouTube Studio)"
        : "(estimativa por RPM, ainda sem valor real digitado)"
    }`
  );
  lines.push(`Vídeos escaneados no total: ${num(data.totalVideosScanned)}`);
  lines.push(`Vídeos sem hashtag de criador no período: ${num(data.noHashtagCount)}`);
  lines.push("");
  lines.push(`=== MÊS ATUAL (dia 01 até hoje) — por criador ===`);

  for (const c of data.creators) {
    lines.push(`\n--- ${c.label} (meta mensal: ${LONG_COUNT_GOAL} vídeos longos / ${brl(LONG_REVENUE_GOAL)} + ${SHORTS_COUNT_GOAL} shorts / ${brl(SHORTS_REVENUE_GOAL)}) ---`);
    lines.push(`Views no mês: ${num(c.monthViews)} (${num(c.monthShortsViews)} em shorts, ${num(c.monthLongViews)} em vídeo longo)`);
    lines.push(`Receita estimada no mês: ${brl(c.monthEarnings)} (${brl(c.monthShortsEarnings)} shorts + ${brl(c.monthLongEarnings)} longo)`);
    lines.push(`Vídeos publicados no mês: ${num(c.monthCount)} (${num(c.monthShortsCount)} shorts, ${num(c.monthLongCount)} longos)`);
    lines.push(`Views/receita nos últimos 28 dias: ${num(c.totalViews)} views, ${brl(c.totalEarnings)} (${(c.viewsSharePct ?? 0).toFixed(1)}% das views do canal no período)`);
    if (c.caktoAmount != null) {
      lines.push(`Vendas Cakto (produtos digitais) nos últimos 28 dias: ${c.caktoOrders} pedidos, ${brl(c.caktoAmount)}`);
    }
    if (c.shopeeAmount != null) {
      lines.push(`Comissão Shopee nos últimos 28 dias: ${c.shopeeOrders} pedidos, ${brl(c.shopeeAmount)}`);
    }
  }

  if (data.topVideosMonth.length > 0) {
    lines.push(`\n=== TOP VÍDEOS DO MÊS (por receita estimada) ===`);
    data.topVideosMonth.slice(0, 10).forEach((v, i) => {
      lines.push(
        `${i + 1}. "${v.title ?? "(sem título)"}" — ${v.creatorLabel} — ${num(v.viewCount)} views — ${brl(v.revenue)}${v.isShort ? " (short)" : ""}`
      );
    });
  }

  return lines.join("\n");
}
