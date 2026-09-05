// Utilitário para obter a data "atual" sempre no fuso de São Paulo,
// independente de onde o código roda (servidor em UTC ou navegador do
// usuário). Isso evita mismatches de hidratação: sem isso, o servidor
// (UTC) e o cliente (America/Sao_Paulo) podem calcular dia/mês
// diferentes para o mesmo instante, gerando os erros React #418/#423.
import { normalizeSpaces } from "@/lib/format-br";

const TZ = "America/Sao_Paulo";

export function nowInSaoPaulo(): Date {
  // Trick padrão: formata o instante atual no fuso desejado e recria um
  // Date a partir disso, "congelando" o wall-clock de São Paulo em um
  // objeto Date local (independente do TZ do processo).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  return new Date(year, month - 1, day, hour, minute, second);
}

export function monthRangeLabel(): string {
  const now = nowInSaoPaulo();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(now);
  const day = now.getDate();
  return normalizeSpaces(`01 a ${day} de ${month}`);
}

export function monthRangeFullLabel(): string {
  const now = nowInSaoPaulo();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now);
  return normalizeSpaces(`01 a ${lastDay} de ${month}`);
}

export function daysLeftInMonth(): number {
  const now = nowInSaoPaulo();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - now.getDate() + 1, 1);
}

// Dados pra contagem regressiva do dia de pagamento (todo dia 25). Calcula
// um instante UTC "de verdade" (não o truque de wall-clock do
// nowInSaoPaulo) porque isso aqui alimenta um contador ao vivo no cliente
// — o cliente compara com Date.now() dele, então o alvo precisa ser um
// timestamp absoluto correto, e não um Date "fake" que só faz sentido
// dentro do mesmo processo que o criou.
// Brasil aboliu o horário de verão em 2019, então America/Sao_Paulo hoje é
// um fuso fixo de UTC-3 o ano inteiro — dá pra usar esse offset fixo sem
// se preocupar com DST.
export function getPaymentCountdown(paymentDay = 25): {
  targetUtcIso: string;
  isPaymentDayToday: boolean;
} {
  const now = nowInSaoPaulo();
  const day = now.getDate();
  const isPaymentDayToday = day === paymentDay;

  // Se hoje já é (ou passou d)o dia 25, o próximo pagamento é no mês que
  // vem; o `Date.UTC` abaixo normaliza o ano sozinho se o mês passar de 11.
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed
  if (day >= paymentDay) month += 1;

  // 00:00 em São Paulo (UTC-3) = 03:00 UTC do mesmo dia.
  const targetUtcMs = Date.UTC(year, month, paymentDay, 3, 0, 0);

  return {
    targetUtcIso: new Date(targetUtcMs).toISOString(),
    isPaymentDayToday,
  };
}
