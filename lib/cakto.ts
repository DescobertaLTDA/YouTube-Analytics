// Cliente da API pública da Cakto (https://docs.cakto.com.br).
//
// Autentica via OAuth2 client_credentials (CAKTO_CLIENT_ID + CAKTO_CLIENT_SECRET,
// configurados como env vars na Vercel) e busca pedidos (/public_api/orders/)
// filtrando por parâmetro UTM — é assim que a gente separa "venda do Lucas" de
// "venda do Matheus" etc., usando o mesmo esquema de UTM que a aba Ganhos já
// usa pra hashtag no YouTube.

const CAKTO_BASE_URL = "https://api.cakto.com.br";

type TokenResponse = {
  access_token: string;
  expires_in: number; // segundos
  token_type?: string;
};

export type CaktoOrder = {
  id: string;
  refId: string;
  status: string;
  type: string;
  offer_type: string;
  baseAmount: string;
  discount: string | null;
  amount: string | null;
  product: { id: string; name: string } | null;
  paymentMethod: string;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  sck: string | null;
};

type CaktoOrdersResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: CaktoOrder[];
};

// Cache do access token em memória do processo — evita autenticar de novo a
// cada request (o token dura minutos/horas, dá pra reusar entre chamadas).
// Em serverless (Vercel) isso persiste enquanto a função ficar "quente";
// quando expira ou a função é reciclada, autentica de novo automaticamente.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.CAKTO_CLIENT_ID;
  const clientSecret = process.env.CAKTO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "CAKTO_CLIENT_ID / CAKTO_CLIENT_SECRET não configurados nas variáveis de ambiente."
    );
  }

  const res = await fetch(`${CAKTO_BASE_URL}/public_api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    // Nunca cachear a chamada de autenticação em si.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`❌ Falha ao autenticar na Cakto (${res.status}): ${body}`);
  }

  const data = (await res.json()) as TokenResponse;

  // Renova 60s antes de expirar de verdade, pra nunca usar um token na hora
  // exata que ele vence.
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(data.expires_in - 60, 30) * 1000,
  };

  return cachedToken.value;
}

async function caktoFetch<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const token = await getAccessToken();

  const url = new URL(`${CAKTO_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 401) {
    // Token pode ter sido invalidado no meio do caminho — limpa o cache e
    // deixa o chamador decidir se tenta de novo.
    cachedToken = null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`❌ Erro na API da Cakto (${res.status}) em ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export type GetOrdersParams = {
  // Qualquer um dos campos UTM que você usa pra marcar o link de venda de
  // cada criador (ex: utm_campaign=lucas).
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  sck?: string;
  // "paid" é o status mais comum pra contar como venda confirmada — a Cakto
  // também aceita múltiplos separados por vírgula, ex: "paid,refunded".
  status?: string;
  // Filtros de data no formato YYYY-MM-DD ou ISO 8601.
  paidAt__gte?: string;
  paidAt__lt?: string;
  page?: string;
};

// Busca uma única página de pedidos. Pra maioria dos usos (poucas dezenas de
// vendas por criador/mês) uma página de até 100 já cobre; se precisar de
// tudo, dá pra paginar seguindo `next`.
export async function getOrders(params: GetOrdersParams): Promise<CaktoOrdersResponse> {
  return caktoFetch<CaktoOrdersResponse>("/public_api/orders/", { limit: "100", ...params });
}

// Busca TODAS as páginas de pedidos que batem com o filtro — usa com cuidado
// em contas com muito volume, pois isso pode disparar várias chamadas.
export async function getAllOrders(params: GetOrdersParams, maxPages = 20): Promise<CaktoOrder[]> {
  const all: CaktoOrder[] = [];
  let page = 1;

  while (page <= maxPages) {
    const data = await getOrders({ ...params, page: String(page) });
    all.push(...data.results);
    if (!data.next) break;
    page += 1;
  }

  return all;
}

// Soma o valor (amount) dos pedidos pagos retornados — conveniência pro caso
// de uso mais comum: "quanto o Lucas vendeu nesse período".
export function sumPaidAmount(orders: CaktoOrder[]): number {
  return orders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + (o.amount != null ? Number(o.amount) : 0), 0);
}
