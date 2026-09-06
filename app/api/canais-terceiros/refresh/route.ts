import { NextResponse } from "next/server";
import { runCanaisTerceirosSnapshot } from "@/lib/canais-terceiros-snapshot";

export const dynamic = "force-dynamic";

// POST/GET /api/canais-terceiros/refresh
//
// Versão SEM CRON_SECRET de /api/canais-terceiros/snapshot, pro botão
// "Atualizar" do site (AtualizarButton.tsx) chamar direto do navegador —
// um fetch no browser nunca pode carregar o CRON_SECRET (ficaria visível
// pra qualquer um no DevTools), então esse clique manual usa essa rota
// separada em vez da protegida. Mesma lógica das duas (runCanaisTerceirosSnapshot),
// só que chama com truncateToHour=false — cada clique manual grava um
// ponto NOVO no histórico (timestamp exato do clique, não arredondado
// pra hora cheia), então o gráfico "Views por hora" pode ganhar uma
// linha sem depender só do cron automático.
export async function POST() {
  const result = await runCanaisTerceirosSnapshot({ truncateToHour: false });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET() {
  return POST();
}
