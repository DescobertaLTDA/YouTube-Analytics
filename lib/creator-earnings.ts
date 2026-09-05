// Regras de negócio da aba "Ganhos": os 3 criadores, o RPM fixo usado pra
// estimar receita e a fórmula de cálculo.

export type CreatorKey = "lucas" | "matheus" | "rafael";

export const CREATORS: { key: CreatorKey; label: string; hashtag: string }[] = [
  { key: "lucas", label: "Lucas", hashtag: "#lucas" },
  { key: "matheus", label: "Matheus", hashtag: "#matheus" },
  { key: "rafael", label: "Rafael", hashtag: "#rafael" },
];

// RPM fixo (R$ por mil views) usado pra estimar ganhos quando não há valor
// real informado manualmente. Shorts e vídeos longos monetizam bem
// diferente no YouTube, então cada um tem o seu.
export const SHORTS_RPM = 0.32;
export const LONG_RPM = 5.5;

// Mantido por compatibilidade com quem só precisa de "um" RPM de referência
// (ex: mostrar no rodapé). Aponta pro RPM de Shorts.
export const FIXED_RPM = SHORTS_RPM;

// Metas mensais por criador (dia 01 até o fim do mês), usadas no card e no
// drawer "Ver metas". Cada formato (Shorts / vídeo longo) tem sua própria
// meta de quantidade e de receita — a meta de views é derivada da meta de
// receita, invertendo a fórmula de estimateEarnings pro RPM daquele formato.
export const SHORTS_COUNT_GOAL = 30;
export const LONG_COUNT_GOAL = 15;
export const SHORTS_REVENUE_GOAL = 1700;
export const LONG_REVENUE_GOAL = 1700;

// views = receita * 1000 / rpm, pros dois formatos (sem /2 — ver nota no
// estimateEarnings abaixo sobre a remoção do split fixo).
// Inverso de estimateEarnings pro RPM de cada formato.
export const SHORTS_VIEWS_GOAL = Math.round((SHORTS_REVENUE_GOAL * 1000) / SHORTS_RPM);
export const LONG_VIEWS_GOAL = Math.round((LONG_REVENUE_GOAL * 1000) / LONG_RPM);

/**
 * Ganhos estimados: views * RPM / 1000, pros dois formatos.
 *
 * `isShort` decide qual RPM usar — Shorts (R$0,32) ou vídeo longo (R$5,50).
 *
 * `realRpm` é o RPM real daquele vídeo específico, importado via CSV do
 * YouTube Studio (tabela `video_rpm_real` — ver `lib/rpm-real.ts`). Quando
 * informado (não nulo/undefined), substitui o RPM fixo no cálculo.
 *
 * NOTA (2026): até aqui, Shorts tinha um `/2` extra fixo embutido nessa
 * função — não era correção de RPM do YouTube, era uma regra de split
 * interna (fatia que ficava com vocês vs a outra parte). Isso fazia o
 * "Receita estimada" do dashboard ficar bem abaixo do valor real reportado
 * pelo YouTube Studio (diferença de centenas de reais/mês). Removido daqui
 * porque essa função hoje é usada tanto pro card de comparação com o
 * Studio quanto pro valor mostrado por criador — se o split ainda for
 * necessário em algum lugar (pagamento entre editor/criador, por
 * exemplo), aplique-o separadamente na hora de decidir quanto cada pessoa
 * recebe, fora dessa função.
 */
export function estimateEarnings(
  views: number,
  isShort: boolean = true,
  realRpm?: number | null
): number {
  if (!views) return 0;
  const rpm = realRpm != null ? realRpm : isShort ? SHORTS_RPM : LONG_RPM;
  const raw = (views * rpm) / 1000;
  return Math.round(raw * 100) / 100;
}

/**
 * A partir do texto (título + descrição) de um vídeo, retorna a lista de
 * criadores cuja hashtag aparece nele. Um vídeo pode contar pra mais de um
 * criador se tiver mais de uma hashtag (ex: vídeo colab com #lucas e
 * #matheus).
 */
export function matchCreators(text: string): CreatorKey[] {
  const lower = text.toLowerCase();
  return CREATORS.filter((c) => lower.includes(c.hashtag)).map((c) => c.key);
}

/**
 * Projeção de fechamento do mês: total já feito + (ritmo médio diário
 * observado até agora × dias restantes).
 *
 * ATENÇÃO ao `daysLeft`: `daysLeftInMonth()` (lib/date-br.ts) já inclui o
 * dia de hoje na contagem de "dias restantes" (é feito assim de propósito,
 * pro contador de "faltam N dias" nunca zerar antes do fim do dia). Só que
 * hoje TAMBÉM já está embutido em `total`/`daysElapsed` — o que já rendeu
 * hoje já entrou na conta. Por isso aqui usamos `daysLeft - 1`: senão hoje
 * seria contado duas vezes (uma como "já ganho", outra como "dia futuro"),
 * inflando a projeção em uma média diária inteira.
 *
 * Função única usada tanto no card de "Projeção do mês" (CreatorCard) quanto
 * no drawer de Insights (CreatorInsightsModal) — se precisar mexer na
 * fórmula, mexe só aqui pros dois lugares não voltarem a divergir.
 */
export function projectMonthEnd(
  total: number,
  daysElapsed: number,
  daysLeft: number
): { projected: number; dailyAvg: number } {
  const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0;
  const remainingDays = Math.max(daysLeft - 1, 0);
  return { projected: total + dailyAvg * remainingDays, dailyAvg };
}
