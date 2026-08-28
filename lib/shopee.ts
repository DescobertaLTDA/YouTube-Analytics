// Cliente da API pública de Afiliados da Shopee (Shopee Affiliate Open API).
//
// Autentica via assinatura SHA256 (SHOPEE_APP_ID + SHOPEE_SECRET_KEY,
// configurados como env vars na Vercel) e busca o relatório de conversões
// (vendas) via GraphQL.
//
// Identificação do criador: a Shopee usa 5 slots de sub_id no link
// personalizado (o slot exato varia dependendo de como o link foi montado —
// pode ser o sub_id 2, o 3, etc). Por isso a gente busca TODAS as vendas do
// período de uma vez e procura o nome do criador (lucas/matheus/rafael) em
// QUALQUER um dos 5 slots, em vez de depender de uma posição fixa.
//
// ⚠️ IMPORTANTE: os nomes exatos dos campos do schema GraphQL (ex: nomes de
// filtros e campos de retorno do conversionReport) podem variar pela versão
// da API — confira em Portal de Afiliados > Central de Ajuda > API na sua
// conta Shopee e ajuste a query abaixo se algum campo vier vazio/der erro.

import { createHash } from "crypto";

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

function buildAuthHeader(appId: string, secretKey: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  // Assinatura = SHA256(AppId + Timestamp + Payload + Secret), em hex.
  const base = `${appId}${timestamp}${payload}${secretKey}`;
  const signature = createHash("sha256").update(base).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export type ShopeeConversionNode = {
  orderId: string;
  subId1: string | null;
  subId2: string | null;
  subId3: string | null;
  subId4: string | null;
  subId5: string | null;
  purchaseTime: string; // ISO
  orderStatus: string; // ex: "COMPLETED" | "PENDING" | "UNPAID" ...
  actualAmount: number; // valor da venda
  commission: number; // comissão do afiliado
};

type ConversionReportResponse = {
  data?: {
    conversionReport?: {
      nodes: ShopeeConversionNode[];
      pageInfo?: { hasNextPage: boolean };
    };
  };
  errors?: { message: string }[];
};

async function shopeeGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const appId = process.env.SHOPEE_APP_ID;
  const secretKey = process.env.SHOPEE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error(
      "SHOPEE_APP_ID / SHOPEE_SECRET_KEY não configurados nas variáveis de ambiente."
    );
  }

  const body = JSON.stringify({ query, variables });
  const authHeader = buildAuthHeader(appId, secretKey, body);

  const res = await fetch(SHOPEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`❌ Erro na API da Shopee (${res.status}): ${text}`);
  }

  const json = (await res.json()) as T & { errors?: { message: string }[] };
  if ((json as any).errors?.length) {
    throw new Error(`❌ Erro na API da Shopee: ${(json as any).errors[0].message}`);
  }

  return json;
}

// Sem filtro de sub_id na query — traz tudo do período e a gente separa por
// subId2 no código (ver comentário no topo do arquivo).
const CONVERSION_REPORT_QUERY = `
  query ConversionReport($purchaseTimeStart: Int, $purchaseTimeEnd: Int, $page: Int, $limit: Int) {
    conversionReport(
      purchaseTimeStart: $purchaseTimeStart
      purchaseTimeEnd: $purchaseTimeEnd
      page: $page
      limit: $limit
    ) {
      nodes {
        orderId
        subId1
        subId2
        subId3
        subId4
        subId5
        purchaseTime
        orderStatus
        actualAmount
        commission
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export type GetConversionsParams = {
  purchaseTimeStart: Date;
  purchaseTimeEnd: Date;
};

// Busca TODAS as páginas de conversões (vendas) do período — sem separar
// por criador ainda.
export async function getAllConversions(
  params: GetConversionsParams,
  maxPages = 20
): Promise<ShopeeConversionNode[]> {
  const all: ShopeeConversionNode[] = [];
  let page = 1;

  while (page <= maxPages) {
    const data = await shopeeGraphQL<ConversionReportResponse>(CONVERSION_REPORT_QUERY, {
      purchaseTimeStart: Math.floor(params.purchaseTimeStart.getTime() / 1000),
      purchaseTimeEnd: Math.floor(params.purchaseTimeEnd.getTime() / 1000),
      page,
      limit: 100,
    });

    const report = data.data?.conversionReport;
    if (!report) break;

    all.push(...report.nodes);
    if (!report.pageInfo?.hasNextPage) break;
    page += 1;
  }

  return all;
}

// Considera venda confirmada quando o status não é "UNPAID"/cancelado —
// ajuste os valores aceitos aqui conforme o que a sua conta retorna.
const PAID_STATUSES = new Set(["COMPLETED", "PENDING"]);

// Filtra as vendas de um criador específico procurando o nome dele em
// QUALQUER um dos 5 slots de sub_id (case insensitive) — assim funciona
// não importa em qual slot a pessoa escreveu o nome (sub_id 2, 3, ou
// qualquer outro), sem depender de convenção fixa de posição.
export function filterByCreator(
  orders: ShopeeConversionNode[],
  creatorKey: string
): ShopeeConversionNode[] {
  const key = creatorKey.toLowerCase();
  return orders.filter((o) =>
    [o.subId1, o.subId2, o.subId3, o.subId4, o.subId5].some(
      (sub) => (sub || "").toLowerCase() === key
    )
  );
}

export function sumPaidCommission(orders: ShopeeConversionNode[]): number {
  return orders
    .filter((o) => PAID_STATUSES.has(o.orderStatus))
    .reduce((sum, o) => sum + (o.commission || 0), 0);
}

export function countPaidOrders(orders: ShopeeConversionNode[]): number {
  return orders.filter((o) => PAID_STATUSES.has(o.orderStatus)).length;
}
