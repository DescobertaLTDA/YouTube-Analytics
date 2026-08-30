// Funções de formatação (número, moeda, data) usadas tanto no server quanto
// no client (Server Components + Client Components). Centralizadas aqui
// porque o Node (SSR) e o navegador (hidratação) podem embutir versões
// diferentes dos dados ICU/CLDR: o MESMO Intl.NumberFormat/DateTimeFormat
// pode produzir, pro mesmo valor, um espaço "normal" de um lado e um
// espaço especial invisível (NBSP U+00A0, narrow no-break U+202F, thin
// space U+2009 etc.) do outro — visualmente idênticos, mas bytes
// diferentes, o que quebra a hidratação do React (erros #418/#423/#425).
// Por isso toda formatação passa por normalizeSpaces antes de virar texto
// na tela. Qualquer formatação nova de número/data no projeto deve vir
// daqui, em vez de chamar Intl.* direto num componente.
export function normalizeSpaces(s: string): string {
  return s.replace(/[\u00A0\u202F\u2009\u2007\u2008]/g, " ");
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return normalizeSpaces(new Intl.NumberFormat("pt-BR").format(Math.round(n)));
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return normalizeSpaces(
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
  );
}

// `new Date("2026-08-28")` sozinho é interpretado como UTC e pode "voltar"
// um dia em fusos negativos (ex: Brasil) — completar com T00:00:00 força a
// leitura como horário local, igual server e client, evitando mismatch de
// hidratação do React.
export function toLocalDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
}

// "28 de ago" — data curta, sem ano.
export function formatDateShort(
  iso: string | null | undefined,
  opts?: { timeZone?: string }
): string {
  if (!iso) return "—";
  return normalizeSpaces(
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      timeZone: opts?.timeZone,
    }).format(toLocalDate(iso))
  );
}

// "28 de ago de 2026" — data curta com ano.
export function formatDateFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  return normalizeSpaces(
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(
      toLocalDate(iso)
    )
  );
}

// "28 de ago de 2026, 14:05" — data com hora e minuto.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return normalizeSpaces(
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(toLocalDate(iso))
  );
}

// "Dom., 23 de ago. de 2026" — mesmo formato do tooltip do YouTube Studio.
export function formatDateLong(iso: string, opts?: { timeZone?: string }): string {
  const d = toLocalDate(iso);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: opts?.timeZone,
  }).format(d);
  const rest = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: opts?.timeZone,
  }).format(d);
  return normalizeSpaces(`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`);
}
