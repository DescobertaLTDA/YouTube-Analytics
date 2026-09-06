import { NextResponse } from "next/server";
import { runCanaisTerceirosSnapshot } from "@/lib/canais-terceiros-snapshot";

export const dynamic = "force-dynamic";

// POST/GET /api/canais-terceiros/refresh
//
// Versão SEM CRON_SECRET de /api/canais-terceiros/snapshot, pro botão
// "Atualizar" do site (AtualizarButton.tsx) chamar direto do navegador —
// um fetch no browser nunca pode carregar o CRON_SECRET (ficaria visível
// pra qualquer um no DevTools), então esse clique manual usa essa rota
// separada em vez da protegida. Mesma lógica das duas, só que essa aqui
// segue o padrão "sem autenticação, de propósito" já usado no resto do
// projeto (/api/sync, /api/ganhos/sync).
export async function POST() {
  const result = await runCanaisTerceirosSnapshot();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET() {
  return POST();
}
