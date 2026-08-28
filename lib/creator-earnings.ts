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

// views = receita * 1000 * 2 / rpm (inverso de estimateEarnings)
export const SHORTS_VIEWS_GOAL = Math.round((SHORTS_REVENUE_GOAL * 2000) / SHORTS_RPM);
export const LONG_VIEWS_GOAL = Math.round((LONG_REVENUE_GOAL * 2000) / LONG_RPM);

/**
 * Ganhos estimados = views * RPM / 1000 / 2
 * (o /2 é a divisão fixa entre os 2 lados combinada com você — ex: parceria
 * de canal, split entre editor/criador, etc.)
 *
 * `isShort` decide qual RPM usar — Shorts (R$0,32) ou vídeo longo (R$5,50).
 */
export function estimateEarnings(views: number, isShort: boolean = true): number {
  if (!views) return 0;
  const rpm = isShort ? SHORTS_RPM : LONG_RPM;
  const raw = (views * rpm) / 1000 / 2;
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
