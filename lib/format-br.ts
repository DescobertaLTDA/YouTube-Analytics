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

// Versão sem centavos — usada em eixos de gráfico e outros lugares onde
// espaço é curto e precisão de centavo não importa (ex: "R$ 150").
export function formatCurrencyCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  return normalizeSpaces(
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(n)
  );
}

// Versão compacta pra eixos de gráfico com números grandes de views/VPH
// (ex: "1,2 mil" em vez de "1.234") — mesma ideia de formatCurrencyCompact,
// mas pra contagem simples, sem símbolo de moeda.
export function formatNumberCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  return normalizeSpaces(
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n)
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

// "28/08 14h" — dia curto + hora, pro eixo X de gráficos por hora (sem
// isso, "28 de ago" repetido 24x no mesmo dia não dá pra distinguir).
export function formatDateHourShort(
  iso: string | null | undefined,
  opts?: { timeZone?: string }
): string {
  if (!iso) return "—";
  const d = toLocalDate(iso);
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: opts?.timeZone,
  }).format(d);
  const hourPart = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    timeZone: opts?.timeZone,
  }).format(d);
  return normalizeSpaces(`${datePart} ${hourPart}h`);
}

// "Ontem, 14:00 – 15:00" — dia relativo (Hoje/Ontem/data curta) + faixa de
// hora cheia, pro tooltip das barrinhas do card "Últimas 48 horas"
// (ChannelRealtimeCard). `iso` é o INÍCIO da hora; a barra representa a
// janela [iso, iso + 1h).
export function formatDateHourRangeLabel(iso: string, opts?: { timeZone?: string }): string {
  const tz = opts?.timeZone;
  const start = new Date(iso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const dayFmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: tz,
  });
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let dayLabel: string;
  if (dayFmt.format(start) === dayFmt.format(now)) {
    dayLabel = "Hoje";
  } else if (dayFmt.format(start) === dayFmt.format(yesterday)) {
    dayLabel = "Ontem";
  } else {
    dayLabel = formatDateShort(iso, { timeZone: tz });
  }

  const hourFmt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });

  return normalizeSpaces(`${dayLabel}, ${hourFmt.format(start)} – ${hourFmt.format(end)}`);
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
