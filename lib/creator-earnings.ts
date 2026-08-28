// Regras de negócio da aba "Ganhos": os 3 criadores, o RPM fixo usado pra
// estimar receita e a fórmula de cálculo.

export type CreatorKey = "lucas" | "matheus" | "rafael";

export const CREATORS: { key: CreatorKey; label: string; hashtag: string }[] = [
  { key: "lucas", label: "Lucas", hashtag: "#lucas" },
  { key: "matheus", label: "Matheus", hashtag: "#matheus" },
  { key: "rafael", label: "Rafael", hashtag: "#rafael" },
];

// RPM fixo (R$ por mil views) usado pra estimar ganhos, tanto pra Shorts
// quanto pra vídeos longos.
export const FIXED_RPM = 0.22;

/**
 * Ganhos estimados = views * RPM / 1000 / 2
 * (o /2 é a divisão fixa entre os 2 lados combinada com você — ex: parceria
 * de canal, split entre editor/criador, etc.)
 */
export function estimateEarnings(views: number, rpm: number = FIXED_RPM): number {
  if (!views) return 0;
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
