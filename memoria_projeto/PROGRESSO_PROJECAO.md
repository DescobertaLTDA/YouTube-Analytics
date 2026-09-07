# PROGRESSO_PROJECAO.md

> Substitui a "memória" da conversa entre sessões. Toda sessão nova neste
> projeto deve começar lendo este arquivo + o diff do último commit, antes
> de qualquer outra coisa. Ver também `CLAUDE.md` (regras permanentes).

Última verificação: análise direta do código-fonte de
`YouTube-Analytics-main.zip` (branch `main`), rodando `npm install` +
`npx tsc --noEmit` no projeto real — **0 erros de tipo**.

## Plano original (5 partes)

1. Eliminar o valor manual das somas em `lib/data.ts`
2. Agregados de Projeção em `CreatorStats`/`periodEarnings`
3. Trocar as somas do site (cards, `page.tsx`) pra usar a base sem valor manual
4. Trocar o histórico (gráfico/histórico de vídeos) pra mesma base
5. *(não confirmado ainda — a conversa original não especificou o que é a Parte 5.
   Se você souber o que é, anote aqui antes da próxima sessão.)*

## Estado verificado por parte

### ✅ Parte 1 — Eliminar valor manual dos cálculos
**Feito e presente no código.** Em `lib/data.ts`:
- `periodEarnings` = `realOrEstimatedPeriodEarnings` (nunca mais o valor manual).
- `periodShortsEarnings`/`periodLongEarnings` sem ramo `if (isManualRevenue)`.
- `creators[].shortsEarnings`/`longEarnings` vêm direto de
  `sumRealOrEstimatedEarnings`, sem rateio por peso RPM do valor manual.
- `noHashtagVideos[].revenue` e `periodVideos[].revenue` são sempre iguais a
  `projectedRevenue` (real da API com fallback RPM), sem ramo separado pro
  valor manual.
- `isManualRevenue`/`manualRevenueAmount` continuam lidos de `manual_revenue`
  e retornados no fim de `getCreatorEarnings()`, mas **só como informação**.

### ✅ Parte 2 — Agregados em `CreatorStats`/`periodEarnings`
**Já coberta pela própria Parte 1.** `CreatorStats.totalEarnings`,
`shortsEarnings`, `longEarnings` e o `GanhosData.periodEarnings` já refletem
100% a base real+RPM. Não há trabalho adicional pendente aqui, a não ser
confirmar com o dono do produto se algum agregado novo é esperado (ex: algo
específico de "Projeção" que não existia no plano original — não achei
menção a um campo `projectedRevenue` agregado por criador, só por vídeo).

### ✅ Parte 3 — Somas do site (`page.tsx`, cards)
`app/page.tsx`: `creatorsEarnings = soma de data.creators[].totalEarnings`;
`noCreatorEarnings = data.periodEarnings - creatorsEarnings`. Ambos os lados
dessa conta já vêm da mesma base (real+RPM), então os dois números batem
entre si. Componentes de card (`CreatorCard`, `RevenueStatCard`) só exibem
os valores, não recalculam nada.

### ✅ Parte 4 — Histórico
`GanhosVideoHistory`, `TopVideosMonth`, `NoCreatorDrawer`, `CreatorAuditButton`
leem `v.revenue`, que é sempre igual a `v.projectedRevenue`. As funções de
histórico agregado (`getCreatorEarningsHistory`, `getCreatorDailyEarnings`,
`getCreatorMonthlyEarningsHistory`) **nunca dependeram** do valor manual —
elas já usavam delta diário de views × RPM (real ou fixo) desde antes desse
plano, então não há regressão possível vindo daí.

### ❓ Parte 5 — desconhecida
Não foi especificada na conversa que gerou este arquivo. **Ação pra próxima
sessão:** confirmar com quem está pedindo o trabalho o que é a Parte 5 antes
de assumir que o projeto está 100% concluído.

## Pendência cosmética encontrada (não é bug de cálculo)

`app/components/CreatorAuditButton.tsx` (linha ~76): quando
`isManualRevenue` é `true`, mostra um aviso dizendo que a receita de cada
vídeo é "uma estimativa proporcional à participação dele nas views" — isso
descreve o **rateio antigo**, que não existe mais. Hoje todo vídeo usa
sempre real+RPM, com ou sem valor manual digitado. O texto está desatualizado
e pode confundir quem usa o formulário de valor manual.

**Não corrigido ainda.** Próximo passo sugerido: atualizar (ou remover) esse
texto, ou decidir junto ao usuário se ele quer aposentar de vez o campo de
valor manual (form + rota `/api/ganhos/revenue` + coluna `manual_revenue`),
já que ele não influencia mais nada.

## Próximo passo exato

1. Confirmar o que é a "Parte 5" do plano original.
2. Decidir o que fazer com o aviso desatualizado em `CreatorAuditButton.tsx`.
3. Se não houver mais nada pendente: commitar este `PROGRESSO_PROJECAO.md` +
   `CLAUDE.md` como fechamento formal das Partes 1–4, com mensagem tipo:
   `docs: registra estado real do projeto (partes 1-4 já concluídas)`.

## Decisões tomadas (histórico, não mexer sem motivo)

- Valor manual digitado (`manual_revenue`) nunca mais influencia nenhuma
  soma — vira só metadado de exibição (`isManualRevenue`/`manualRevenueAmount`).
- `revenue` e `projectedRevenue` em `GanhosVideoRow` são o mesmo valor por
  definição — não recriar uma divergência entre os dois.
- Rodar `npx tsc --noEmit` é obrigatório antes de qualquer commit (ver
  `CLAUDE.md`).
