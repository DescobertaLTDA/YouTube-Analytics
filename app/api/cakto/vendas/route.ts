import { NextRequest, NextResponse } from "next/server";
import { getAllOrders, sumPaidAmount, filterOrdersByCreator } from "@/lib/cakto";
import { CREATORS, CreatorKey } from "@/lib/creator-earnings";

export const dynamic = "force-dynamic";

// GET /api/cakto/vendas
//   → soma as vendas de TODOS os 3 criadores (lucas / matheus / rafael)
//
// GET /api/cakto/vendas?creator=lucas
//   → só as vendas do Lucas
//
// GET /api/cakto/vendas?utm_campaign=algumacoisa&from=2026-08-01&to=2026-08-27
//   → filtro livre por utm_campaign exato, pra investigar uma campanha
//     específica (não usa a lógica de "casar criador" abaixo)
//
// GET /api/cakto/vendas?debug=1
//   → modo debug: ignora o filtro de status="paid" e de data, busca os ~100
//     pedidos mais recentes de TODA a conta Cakto (sem filtro de utm) e
//     devolve os campos crus (status, todos os campos utm, sck, paidAt,
//     amount) — usa isso pra descobrir por que uma venda real não está
//     caindo no card.
//
// Convenção: o nome do criador (ex: "lucas") pode vir em QUALQUER um dos
// campos de rastreio do link de checkout — na prática já vimos aparecer em
// utm_medium (não em utm_campaign), e não tem garantia de que sempre vai
// ser o mesmo campo, já que os links são montados manualmente. Por isso
// `creator=<key>` não filtra a API por um campo fixo: busca todos os
// pedidos pagos do período e casa o nome do criador contra
// utm_source/utm_medium/utm_campaign/utm_content/utm_term/sck (ver
// filterOrdersByCreator em lib/cakto.ts).
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
          utm_medium: o.utm_medium,
          utm_content: o.utm_content,
          utm_term: o.utm_term,
          sck: o.sck,
          product: o.product,
        })),
      });
    }

    const baseDateFilter = { paidAt__gte: from, paidAt__lt: to };

    // Filtro livre por utm_campaign exato — escape hatch pra investigar uma
    // campanha específica, não relacionado à convenção de criador.
    if (customUtmCampaign) {
      const orders = await getAllOrders({
        utm_campaign: customUtmCampaign,
        status: "paid",
        ...baseDateFilter,
      });

      return NextResponse.json({
        utm_campaign: customUtmCampaign,
        totalOrders: orders.length,
        totalAmount: sumPaidAmount(orders),
        orders,
      });
    }

    // Um criador específico foi pedido — busca todos os pedidos pagos do
    // período e casa o nome dele contra qualquer campo utm/sck.
    if (creatorParam) {
      const allPaidOrders = await getAllOrders({ status: "paid", ...baseDateFilter });
      const orders = filterOrdersByCreator(allPaidOrders, creatorParam);

      return NextResponse.json({
        creator: creatorParam,
        totalOrders: orders.length,
        totalAmount: sumPaidAmount(orders),
        orders,
      });
    }

    // Nenhum filtro — retorna o total por criador de uma vez, igual o
    // formato usado no resto da aba Ganhos. Uma única busca de todos os
    // pedidos pagos do período, casada localmente pra cada criador.
    const allPaidOrders = await getAllOrders({ status: "paid", ...baseDateFilter });
    const results = CREATORS.map(({ key, label }) => {
      const orders = filterOrdersByCreator(allPaidOrders, key);
      return {
        key,
        label,
        totalOrders: orders.length,
        totalAmount: sumPaidAmount(orders),
      };
    });

    return NextResponse.json({ from: from || null, to: to || null, creators: results });
  } catch (error) {
    console.error("❌ Erro ao buscar vendas na Cakto:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
