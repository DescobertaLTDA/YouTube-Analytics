import { NextRequest, NextResponse } from "next/server";
import { runCanaisTerceirosSnapshot } from "@/lib/canais-terceiros-snapshot";

export const dynamic = "force-dynamic";

// POST/GET /api/canais-terceiros/snapshot
//
// Chamado 1x/HORA por um GitHub Actions externo (Vercel Hobby só permite
// cron nativo 1x/dia, ver .github/workflows/hourly-sync.yml). Pra cada
// canal ativo em `tracked_channels`, busca os vídeos recentes e grava o
// view_count atual em `tracked_channel_video_history` (upsert por
// vídeo/HORA — ver migration tracked_channel_history_hourly). É esse
// histórico que alimenta o gráfico "Views por hora" da aba Canais: sem
// ele, a aba só mostra o VPH instantâneo (desde a publicação), sem
// tendência ao longo do tempo.
//
// Exige CRON_SECRET no header Authorization — quem chama é um scheduler
// externo batendo numa URL pública, então precisa de autenticação de
// verdade. O botão "Atualizar" do próprio site NÃO chama essa rota (o
// navegador não pode saber o secret) — ele usa /api/canais-terceiros/refresh,
// que roda a MESMA lógica (lib/canais-terceiros-snapshot.ts) sem exigir
// secret, do mesmo jeito que já funcionava antes.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 });
  }

  const result = await runCanaisTerceirosSnapshot();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

// Também aceita GET, pra facilitar testar na mão pelo navegador — mesmo
// padrão de /api/sync e /api/ganhos/sync.
export async function GET(request: NextRequest) {
  return POST(request);
}
