// Cliente da API pública de Afiliados da Shopee (Shopee Affiliate Open API).
//
// Autentica via assinatura SHA256 (SHOPEE_APP_ID + SHOPEE_SECRET_KEY,
// configurados como env vars na Vercel) e busca o relatório de conversões
// (vendas) via GraphQL — endpoint `conversionReport`.
//
// ⚠️ Schema real da API (confirmado na doc oficial/API playground):
// - Paginação é por CURSOR (`scrollId`), não por número de página. O
//   scrollId só vale por ~30s, então cada leva de páginas precisa ser
//   buscada rapidinho, uma logo depois da outra.
// - Não existem campos `subId1..subId5` nem `orderId`/`actualAmount`/
//   `commission` direto no node. Os sub_ids que você define ao criar o
//   link (ex: "clubeshopee", "lucas") voltam TODOS JUNTOS dentro de um
//   único campo `utmContent`. A comissão e os pedidos ficam dentro de um
//   array `orders`, cada um com seus `items`.
//
// Identificação do criador: como os sub_ids voltam concatenados dentro de
// `utmContent` (não sabemos ao certo o separador que a Shopee usa —
// vírgula, pipe, espaço...), a gente checa se o nome do criador aparece
// como um "token" isolado OU como substring do campo, cobrindo os formatos
// mais comuns.

import { createHash } from "crypto";

const SHOPEE_API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

function buildAuthHeader(appId: string, secretKey: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  // Assinatura = SHA256(AppId + Timestamp + Payload + Secret), em hex.
  const base = `${appId}${timestamp}${payload}${secretKey}`;
  const signature = createHash("sha256").update(base).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

export type ShopeeConversionOrderItem = {
  itemId: string;
  itemName: string;
  shopName: string;
  itemPrice: number;
  qty: number;
  itemTotalCommission: number;
  attributionType: string;
};

export type ShopeeConversionOrder = {
  orderId: string;
  orderStatus: string; // "UNPAID" | "PENDING" | "COMPLETED" | "CANCELLED"
  items: ShopeeConversionOrderItem[];
};

export type ShopeeConversionNode = {
  purchaseTime: string; // Unix timestamp (segundos), como string ou number
  clickTime: string;
  conversionId: string;
  totalCommission: number; // comissão total estimada da conversão
  sellerCommission: number;
  shopeeCommissionCapped: number;
  buyerType: string; // "NEW" | "EXISTING"
  device: string; // "APP" | "WEB"
  utmContent: string | null; // sub_ids concatenados (ex: "clubeshopee,lucas")
  orders: ShopeeConversionOrder[];
};

type ConversionReportResponse = {
  data?: {
    conversionReport?: {
      nodes: ShopeeConversionNode[];
      pageInfo?: { limit: number; hasNextPage: boolean; scrollId?: string | null };
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

// Monta a query GraphQL com os valores embutidos diretamente no texto (em
// vez de usar $variables). A API da Shopee é sensível ao tipo Int64 de
// purchaseTimeStart/purchaseTimeEnd quando enviado como variável (dá erro
// de tipo ou "got null for non-null") — o jeito confiável, igual ao
// exemplo oficial da documentação, é inserir os números direto na query.
// (Mesmo padrão já validado e funcionando no projeto contadorshopee.)
function buildConversionReportQuery(
  purchaseTimeStart: number,
  purchaseTimeEnd: number,
  limit: number,
  scrollId?: string
): string {
  const scrollIdArg = scrollId ? `, scrollId: "${scrollId}"` : "";
  return `
    {
      conversionReport(
        purchaseTimeStart: ${purchaseTimeStart},
        purchaseTimeEnd: ${purchaseTimeEnd},
        limit: ${limit}${scrollIdArg}
      ) {
        nodes {
          purchaseTime
          clickTime
          conversionId
          totalCommission
          sellerCommission
          shopeeCommissionCapped
          buyerType
          device
          utmContent
          orders {
            orderId
            orderStatus
            items {
              itemId
              itemName
              shopName
              itemPrice
              qty
              itemTotalCommission
              attributionType
            }
          }
        }
        pageInfo {
          limit
          hasNextPage
          scrollId
        }
      }
    }
  `;
}

export type GetConversionsParams = {
  purchaseTimeStart: Date;
  purchaseTimeEnd: Date;
};

// Busca TODAS as páginas de conversões (vendas) do período — sem separar
// por criador ainda. Usa scrollId pra paginar (cursor válido por ~30s, por
// isso as páginas são buscadas em sequência sem pausas).
export async function getAllConversions(
  params: GetConversionsParams,
  maxPages = 20
): Promise<ShopeeConversionNode[]> {
  const all: ShopeeConversionNode[] = [];
  let scrollId: string | undefined;
  let page = 1;
  const purchaseTimeStart = Math.floor(params.purchaseTimeStart.getTime() / 1000);
  const purchaseTimeEnd = Math.floor(params.purchaseTimeEnd.getTime() / 1000);

  while (page <= maxPages) {
    const query = buildConversionReportQuery(purchaseTimeStart, purchaseTimeEnd, 500, scrollId);
    const data = await shopeeGraphQL<ConversionReportResponse>(query, {});

    const report = data.data?.conversionReport;
    if (!report) break;

    all.push(...report.nodes);

    if (!report.pageInfo?.hasNextPage || !report.pageInfo?.scrollId) break;
    scrollId = report.pageInfo.scrollId;
    page += 1;
  }

  return all;
}

// Considera venda confirmada quando o status não é "UNPAID"/cancelado —
// ajuste os valores aceitos aqui conforme o que a sua conta retorna.
const PAID_STATUSES = new Set(["COMPLETED", "PENDING"]);

// Quebra o campo utmContent (sub_ids concatenados) em "tokens" candidatos,
// cobrindo os separadores mais comuns (vírgula, pipe, ponto-e-vírgula,
// espaço). Também mantém a string inteira como candidato, pra pegar o caso
// de "match por conter" (ex: utmContent = "clubeshopee-lucas").
function utmTokens(utmContent: string | null): string[] {
  if (!utmContent) return [];
  const parts = utmContent
    .split(/[,|;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...parts, utmContent.toLowerCase()];
}

// Filtra as vendas de um criador específico procurando o nome dele dentro
// do campo utmContent (case insensitive) — como token isolado ou como
// substring, pra funcionar não importa o separador usado.
export function filterByCreator(
  orders: ShopeeConversionNode[],
  creatorKey: string
): ShopeeConversionNode[] {
  const key = creatorKey.toLowerCase();
  return orders.filter((o) => {
    const tokens = utmTokens(o.utmContent);
    return tokens.some((t) => t === key || t.includes(key));
  });
}

// Uma conversão é "paga" se pelo menos um dos pedidos dentro dela está
// COMPLETED ou PENDING.
function isNodePaid(node: ShopeeConversionNode): boolean {
  return node.orders.some((o) => PAID_STATUSES.has(o.orderStatus));
}

export type ShopeeSaleDetail = {
  conversionId: string;
  purchaseTime: string; // ISO
  clickTime: string; // ISO
  daysSinceClick: number;
  commission: number;
  status: string;
  products: { itemName: string; shopName: string; qty: number }[];
};

function unixSecondsToIso(value: string | number): string | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

// Monta o detalhe de cada venda paga (produto, loja, comissão e as duas
// datas — clique e compra) pra dar pra mostrar no dashboard quais compras
// compõem o total, mesmo quando o produto comprado é diferente do que foi
// divulgado no link (compra dentro da janela do cookie de atribuição).
export function paidSaleDetails(orders: ShopeeConversionNode[]): ShopeeSaleDetail[] {
  return orders
    .filter(isNodePaid)
    .map((node): ShopeeSaleDetail => {
      const paidOrders = node.orders.filter((o) => PAID_STATUSES.has(o.orderStatus));
      const products = paidOrders.flatMap((o) =>
        o.items.map((i) => ({ itemName: i.itemName, shopName: i.shopName, qty: i.qty }))
      );

      const purchaseIso = unixSecondsToIso(node.purchaseTime);
      const clickIso = unixSecondsToIso(node.clickTime);
      const daysSinceClick =
        purchaseIso && clickIso
          ? Math.max(
              0,
              Math.round(
                (new Date(purchaseIso).getTime() - new Date(clickIso).getTime()) / (1000 * 60 * 60 * 24)
              )
            )
          : 0;

      const commissionValue = Number(node.totalCommission);

      return {
        conversionId: node.conversionId,
        purchaseTime: purchaseIso ?? "",
        clickTime: clickIso ?? "",
        daysSinceClick,
        commission: Number.isFinite(commissionValue) ? commissionValue : 0,
        status: paidOrders[0]?.orderStatus ?? "",
        products,
      };
    })
    .sort((a, b) => (a.purchaseTime < b.purchaseTime ? 1 : -1));
}

export function sumPaidCommission(orders: ShopeeConversionNode[]): number {
  return orders
    .filter(isNodePaid)
    .reduce((sum, o) => {
      const value = Number(o.totalCommission);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

export function countPaidOrders(orders: ShopeeConversionNode[]): number {
  // Conta pedidos (não conversões) — uma conversão pode ter mais de um
  // pedido dentro do array `orders`.
  return orders.reduce(
    (count, node) => count + node.orders.filter((o) => PAID_STATUSES.has(o.orderStatus)).length,
    0
  );
}
