import { NextRequest, NextResponse } from "next/server";
import { getAllConversions, filterByCreator, sumPaidCommission, countPaidOrders } from "@/lib/shopee";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";

export const dynamic = "force-dynamic";

// GET /api/shopee/vendas
//   → traz todas as vendas do período e soma por criador, comparando o
//     campo subId2 de cada venda com lucas / matheus / rafael (sub_id 1 é
//     fixo pra conta toda, então o filtro por criador é feito aqui, não na
//     API da Shopee)
//
// GET /api/shopee/vendas?creator=lucas
//   → só as vendas do Lucas
//
// GET /api/shopee/vendas?from=2026-08-01&to=2026-08-27
//   → filtro de data livre, todos os criadores
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creatorParam = searchParams.get("creator") as CreatorKey | null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const purchaseTimeEnd = to ? new Date(to) : new Date();
    const purchaseTimeStart = from
      ? new Date(from)
      : new Date(purchaseTimeEnd.getTime() - 28 * 24 * 60 * 60 * 1000);

    const allOrders = await getAllConversions({ purchaseTimeStart, purchaseTimeEnd });

    if (creatorParam) {
      const orders = filterByCreator(allOrders, creatorParam);
      return NextResponse.json({
        creator: creatorParam,
        totalOrders: countPaidOrders(orders),
        totalAmount: sumPaidCommission(orders),
        orders,
      });
    }

    const results = CREATORS.map(({ key, label }) => {
      const orders = filterByCreator(allOrders, key);
      return {
        key,
        label,
        totalOrders: countPaidOrders(orders),
        totalAmount: sumPaidCommission(orders),
      };
    });

    return NextResponse.json({
      from: purchaseTimeStart.toISOString(),
      to: purchaseTimeEnd.toISOString(),
      creators: results,
    });
  } catch (error) {
    console.error("❌ Erro ao buscar vendas na Shopee:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
