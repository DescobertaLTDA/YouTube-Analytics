"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MonthlyEarningsPoint } from "@/lib/data";
import type { CreatorKey } from "@/lib/creator-earnings";

// Busca /api/ganhos/historico (mesma rota do botão "Histórico de Ganhos")
// UMA ÚNICA VEZ pra alimentar o bloco "Ganhos do mês anterior" de todos os
// cards ao mesmo tempo — em vez de cada CreatorCard chamar essa rota (que
// varre a tabela de histórico inteira + API do YouTube por vídeo, ver nota
// em lib/data.ts) por conta própria, o que dispararia 3 varreduras pesadas
// idênticas em paralelo pra mostrar o mesmo resultado.
//
// months[0] de cada criador já vem como o mês calendário fechado mais
// recente (ordenado do mais novo pro mais antigo, mês em andamento
// excluído — ver getCreatorMonthlyEarningsHistory), ou seja, exatamente
// "dia 01 ao último dia do mês passado".
type State = {
  loading: boolean;
  error: string | null;
  history: Record<CreatorKey, MonthlyEarningsPoint[]> | null;
};

const PreviousMonthEarningsContext = createContext<State>({
  loading: true,
  error: null,
  history: null,
});

export function PreviousMonthEarningsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ loading: true, error: null, history: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Mesmo motivo do timeout em CreatorEarningsHistoryButton: sem isso,
    // uma function travada na Vercel deixaria o card preso em "carregando"
    // pra sempre.
    const timeout = setTimeout(() => controller.abort(), 55_000);

    fetch("/api/ganhos/historico", { signal: controller.signal })
      .then(async (res) => {
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error || `Erro ${res.status}`);
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        if (result?.error) throw new Error(result.error);
        setState({ loading: false, error: null, history: result?.history ?? null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        setState({
          loading: false,
          error: isAbort ? "Demorou demais pra responder." : err instanceof Error ? err.message : "Erro ao carregar",
          history: null,
        });
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <PreviousMonthEarningsContext.Provider value={state}>{children}</PreviousMonthEarningsContext.Provider>
  );
}

// Retorna o mês calendário fechado mais recente (o "mês anterior") de um
// criador específico, junto com o estado de loading/erro do fetch
// compartilhado.
export function usePreviousMonthEarnings(creatorKey: CreatorKey): {
  loading: boolean;
  error: string | null;
  month: MonthlyEarningsPoint | null;
} {
  const { loading, error, history } = useContext(PreviousMonthEarningsContext);
  const month = history?.[creatorKey]?.[0] ?? null;
  return { loading, error, month };
}
