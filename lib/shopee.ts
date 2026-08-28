// Cliente da API pública de Afiliados da Shopee (Shopee Affiliate Open API).
//
// Autentica via assinatura SHA256 (SHOPEE_APP_ID + SHOPEE_SECRET_KEY,
// configurados como env vars na Vercel) e busca o relatório de conversões
// (vendas) via GraphQL, filtrando por sub_id — é assim que a gente separa
// "venda do Lucas" de "venda do Matheus" etc., igual já é feito com
// utm_campaign na Cakto. Convenção: o link de afiliado de cada criador leva
// o sub_id igual ao nome dele (ex: ...?sub_id=lucas).
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

const CONVERSION_REPORT_QUERY = `
  query ConversionReport($subId: String, $purchaseTimeStart: Int, $purchaseTimeEnd: Int, $page: Int, $limit: Int) {
    conversionReport(
      subId: $subId
      purchaseTimeStart: $purchaseTimeStart
      purchaseTimeEnd: $purchaseTimeEnd
      page: $page
      limit: $limit
    ) {
      nodes {
        orderId
        subId1
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
  // sub_id usado pra identificar o criador (ex: "lucas"). Deixe vazio pra
  // trazer tudo.
  subId?: string;
  purchaseTimeStart: Date;
  purchaseTimeEnd: Date;
};

// Busca TODAS as páginas de conversões (vendas) que batem com o filtro.
export async function getAllConversions(
  params: GetConversionsParams,
  maxPages = 20
): Promise<ShopeeConversionNode[]> {
  const all: ShopeeConversionNode[] = [];
  let page = 1;

  while (page <= maxPages) {
    const data = await shopeeGraphQL<ConversionReportResponse>(CONVERSION_REPORT_QUERY, {
      subId: params.subId,
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

export function sumPaidCommission(orders: ShopeeConversionNode[]): number {
  return orders
    .filter((o) => PAID_STATUSES.has(o.orderStatus))
    .reduce((sum, o) => sum + (o.commission || 0), 0);
}

export function countPaidOrders(orders: ShopeeConversionNode[]): number {
  return orders.filter((o) => PAID_STATUSES.has(o.orderStatus)).length;
}
