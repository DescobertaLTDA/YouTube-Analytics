"use client";

import { useEffect, useState } from "react";
import { IconClock } from "@/app/components/Icons";

// Contagem regressiva ao vivo até o próximo dia de pagamento (todo dia 25).
// `targetUtcIso` já vem pronto do server component pai (lib/date-br.ts —
// getPaymentCountdown), como um instante UTC absoluto: o cliente só
// precisa comparar com o próprio relógio (Date.now()), sem reimplementar
// a lógica de "qual é o próximo dia 25" aqui — evita qualquer divergência
// de fuso horário entre server e client.
//
// O valor só é calculado dentro do useEffect (depois de montar no
// navegador), começando em `null` no primeiro render — isso garante que o
// HTML do servidor e o primeiro paint do cliente sejam idênticos (sem
// "faltam X" ainda), e só depois o contador liga e passa a atualizar a
// cada segundo. Contador ao vivo é inerentemente client-only, não dá pra
// puro SSR sem re-hidratar toda hora.
function diffParts(targetMs: number) {
  const totalSeconds = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function PaymentCountdownCard({
  targetUtcIso,
  isPaymentDayToday,
}: {
  targetUtcIso: string;
  isPaymentDayToday: boolean;
}) {
  const targetMs = new Date(targetUtcIso).getTime();
  const [parts, setParts] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(
    null
  );

  useEffect(() => {
    setParts(diffParts(targetMs));
    const id = setInterval(() => setParts(diffParts(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (isPaymentDayToday) {
    return (
      <div className="stat-card stat-card-payment stat-card-payment-today" title="Pagamento cai hoje, dia 25">
        <div className="stat-value-large emerald">Hoje 🎉</div>
        <div className="stat-label">
          <IconClock /> Dia de pagamento
        </div>
      </div>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="stat-card stat-card-payment" title="Contagem regressiva até o próximo pagamento (dia 25)">
      <div className="stat-value-large stat-value-countdown">
        {parts ? `${parts.days}d ${pad(parts.hours)}h ${pad(parts.minutes)}m ${pad(parts.seconds)}s` : "—"}
      </div>
      <div className="stat-label">
        <IconClock /> Pagamento (dia 25)
      </div>
    </div>
  );
}
