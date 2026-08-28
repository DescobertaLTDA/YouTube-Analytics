import { NextRequest, NextResponse } from "next/server";
import { getAllConversions, sumPaidCommission, countPaidOrders } from "@/lib/shopee";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";

export const dynamic = "force-dynamic";

// GET /api/shopee/vendas
//   → soma as vendas dos 3 criadores, usando sub_id=<key> como convenção
//     (lucas / matheus / rafael) — igual à Cakto com utm_campaign
//
// GET /api/shopee/vendas?creator=lucas
//   → só as vendas do Lucas
//
// GET /api/shopee/vendas?sub_id=algumacoisa&from=2026-08-01&to=2026-08-27
//   → filtro livre, caso o sub_id usado não seja um dos 3 criadores
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const creatorParam = searchParams.get("creator") as CreatorKey | null;
    const customSubId = searchParams.get("sub_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const purchaseTimeEnd = to ? new Date(to) : new Date();
    const purchaseTimeStart = from
      ? new Date(from)
      : new Date(purchaseTimeEnd.getTime() - 28 * 24 * 60 * 60 * 1000);

    if (creatorParam || customSubId) {
      const subId = customSubId || creatorParam || undefined;
      const orders = await getAllConversions({ subId, purchaseTimeStart, purchaseTimeEnd });

      return NextResponse.json({
        subId,
        totalOrders: countPaidOrders(orders),
        totalAmount: sumPaidCommission(orders),
        orders,
      });
    }

    const results = await Promise.all(
      CREATORS.map(async ({ key, label }) => {
        const orders = await getAllConversions({ subId: key, purchaseTimeStart, purchaseTimeEnd });
        return {
          key,
          label,
          totalOrders: countPaidOrders(orders),
          totalAmount: sumPaidCommission(orders),
        };
      })
    );

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
