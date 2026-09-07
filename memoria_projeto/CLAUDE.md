# CLAUDE.md — Regras permanentes deste projeto

> Este arquivo guarda decisões que **não mudam** de sessão pra sessão.
> Para o estado do trabalho em andamento (o que falta, próximo passo), veja `PROGRESSO_PROJECAO.md`.

## Regra de negócio: Receita/Projeção

- **Não existe mais "valor manual" influenciando nenhuma soma agregada.**
  `periodEarnings`, `CreatorStats.shortsEarnings/longEarnings/totalEarnings`,
  `GanhosVideoRow.revenue` e `GanhosVideoRow.projectedRevenue` são **sempre**
  calculados por `sumRealOrEstimatedEarnings` (receita OFICIAL da API do
  YouTube quando já liberada, caindo pra estimativa por RPM — real do CSV ou
  fixo do formato — quando não).
- `revenue` e `projectedRevenue` em `GanhosVideoRow` são **sempre o mesmo
  valor**. Não recriar um ramo separado que trate `revenue` como "valor
  exibido ao usuário, possivelmente rateado por manual" — isso foi removido
  de propósito.
- O formulário de "valor real digitado manualmente" (`RevenueStatCard`,
  rota `/api/ganhos/revenue`, tabela `manual_revenue`) **continua existindo
  e continua salvando**, mas os campos `isManualRevenue`/`manualRevenueAmount`
  retornados por `getCreatorEarnings()` são **só informativos** — não entram
  em nenhuma soma. Não plugar esse valor de volta em nenhum cálculo sem uma
  decisão explícita e documentada aqui.
- Exceção conhecida (cosmética, não afeta números): `CreatorAuditButton.tsx`
  ainda mostra um aviso que descreve o rateio proporcional antigo quando
  `isManualRevenue` é `true`. O texto está desatualizado — hoje o cálculo
  por vídeo nunca depende do valor manual. Corrigir o texto (ou removê-lo)
  é trabalho pendente, não um bug de cálculo.

## Convenções de processo

- **Sempre rodar `npx tsc --noEmit` antes de qualquer commit.** Zero erros
  de tipo é pré-requisito, não sugestão.
- Commitar ao final de cada sub-parte pequena (ex: "2a", "2b"), não só ao
  final de uma parte grande do plano.
- Antes de começar qualquer sessão nova neste projeto: ler
  `PROGRESSO_PROJECAO.md` inteiro e o diff do último commit antes de tocar
  em qualquer arquivo.
- Antes de fechar uma sessão (créditos acabando, parte incompleta, etc.):
  atualizar `PROGRESSO_PROJECAO.md` com o estado exato, mesmo que a parte
  não tenha terminado.

## Stack

- Next.js (App Router) + TypeScript + Supabase.
- `lib/data.ts` é o arquivo central de agregação de dados (Ganhos, vídeos,
  histórico). É o arquivo mais sensível a mudanças de regra de negócio.
