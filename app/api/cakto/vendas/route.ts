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
// GET /api/cakto/vendas?debug=1
//   → modo debug: ignora o filtro de status="paid" e de data, busca os 20
//     pedidos mais recentes de TODA a conta Cakto (sem filtro de utm) e
//     devolve os campos crus (status, utm_campaign, paidAt, amount) —
//     usa isso pra descobrir por que uma venda real não está caindo no
//     card, ex: valor do utm_campaign diferente de lucas/matheus/rafael,
//     status diferente de "paid", ou o pedido ainda não foi marcado como
//     pago na Cakto.
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
    const debug = searchParams.get("debug");

    if (debug) {
      const orders = await getAllOrders({}, 1); // 1ª página = ~100 pedidos mais recentes, sem filtro nenhum
      return NextResponse.json({
        totalOrders: orders.length,
        orders: orders.map((o) => ({
          id: o.id,
          status: o.status,
          amount: o.amount,
          baseAmount: o.baseAmount,
          createdAt: o.createdAt,
          paidAt: o.paidAt,
          utm_campaign: o.utm_campaign,
          utm_source: o.utm_source,
          utm_content: o.utm_content,
          sck: o.sck,
          product: o.product,
        })),
      });
    }

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
