import { NextResponse } from "next/server";
import { getCreatorMonthlyEarningsHistory } from "@/lib/data";

// Sem isso o Next tenta pré-renderizar essa rota como estática no build
// (ela não usa NextRequest nem cookies, únicos sinais que fariam o Next
// marcar como dinâmica sozinho) — cachearia pra sempre a primeira
// resposta, inclusive um erro de rede do build. Precisa rodar de novo a
// cada chamada, igual o resto do dashboard.
export const dynamic = "force-dynamic";

// GET /api/ganhos/historico
//
// Retorna o histórico de ganhos por mês calendário, por criador. Fica numa
// rota própria (em vez de entrar no getCreatorEarnings que já roda em
// toda carga da página de Ganhos) porque varre a tabela
// `creator_video_view_history` inteira, sem filtro de janela — mais
// pesado que o resto do dashboard, então só roda quando o criador
// realmente abre o botão "Histórico de Ganhos".
export async function GET() {
  try {
    const history = await getCreatorMonthlyEarningsHistory();
    return NextResponse.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
