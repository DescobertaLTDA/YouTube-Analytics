import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, sumPaidAmount } from "@/lib/cakto";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";

export const dynamic = "force-dynamic";

// GET /api/cakto/vendas
//   → soma as vendas de TODOS os 3 criadores, usando utm_campaign=<key> como
//     convenção (lucas / matheus / rafael)
//
// GET /api/cakto/vendas?creator=lucas
//   → só as vendas do Lucas
//
// GET /api/cakto/vendas?utm_campaign=algumacoisa&from=2026-08-01&to=2026-08-27
//   → filtro livre, caso a UTM usada não seja um dos 3 criadores
//
// Convenção: o parâmetro UTM usado pra identificar o criador é utm_campaign
// (ex: link de venda do Lucas termina em ...?utm_campaign=lucas). Se você
// preferir usar outro campo (utm_content, utm_source, sck), é só trocar aqui
// embaixo — a Cakto aceita filtrar por qualquer um deles.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creatorParam = searchParams.get("creator") as CreatorKey | null;
    const customUtmCampaign = searchParams.get("utm_campaign");
    const from = searchParams.get("from") || undefined; // YYYY-MM-DD
    const to = searchParams.get("to") || undefined; // YYYY-MM-DD

    const baseDateFilter = { paidAt__gte: from, paidAt__lt: to };

    // Um criador específico (ou UTM livre) foi pedido.
    if (creatorParam || customUtmCampaign) {
      const utm_campaign = customUtmCampaign || creatorParam || undefined;
      const orders = await getAllOrders({ utm_campaign, status: "paid", ...baseDateFilter });

      return NextResponse.json({
        utm_campaign,
        totalOrders: orders.length,
        totalAmount: sumPaidAmount(orders),
        orders,
      });
    }

    // Nenhum filtro — retorna o total por criador de uma vez, igual o
    // formato usado no resto da aba Ganhos.
    const results = await Promise.all(
      CREATORS.map(async ({ key, label }) => {
        const orders = await getAllOrders({ utm_campaign: key, status: "paid", ...baseDateFilter });
        return {
          key,
          label,
          totalOrders: orders.length,
          totalAmount: sumPaidAmount(orders),
        };
      })
    );

    return NextResponse.json({ from: from || null, to: to || null, creators: results });
  } catch (error) {
    console.error("❌ Erro ao buscar vendas na Cakto:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
