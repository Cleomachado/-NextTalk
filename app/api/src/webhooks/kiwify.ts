import crypto from "node:crypto";
import { toWhatsAppNumber } from "../lib/phone.js";
import type { CanonicalEvent, NormalizedEvent } from "./canonical.js";

// Kiwify: assinatura vem como query param ?signature=, HMAC-SHA1 do corpo BRUTO com o token.
// Importante validar sobre o corpo exatamente como recebido (re-serializar quebra a assinatura).
export function verifyKiwifySignature(
  rawBody: string,
  signature: string | undefined,
  token: string,
): boolean {
  // FAIL-CLOSED: sem token configurado, REJEITA. O endpoint é público na internet e ativa contas —
  // aceitar sem assinatura deixava qualquer um forjar uma "compra" e liberar o app de graça.
  // Configure KIWIFY_WEBHOOK_TOKEN no deploy/.env com o MESMO segredo cadastrado na Kiwify.
  if (!token) {
    console.warn("⚠️  KIWIFY_WEBHOOK_TOKEN não configurado — webhook Kiwify REJEITADO (billing inativo até configurar).");
    return false;
  }
  if (!signature) return false;
  // NORMALIZA antes de comparar: digest("hex") sai minúsculo, e uma assinatura que chegue em
  // MAIÚSCULA (ou com espaço colado pela query string) seria recusada por diferença de caixa —
  // uma venda perdida por causa de letra maiúscula, não por segurança.
  const recebida = signature.trim().toLowerCase();
  const expected = crypto.createHmac("sha1", token).update(rawBody).digest("hex");
  // comparação de tempo constante
  const a = Buffer.from(recebida);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// webhook_event_type (payload) → evento canônico. Carrinho abandonado vem SEM esse campo.
// O checkout_link da Kiwify vem como CÓDIGO curto (ex.: "OfSTPmR"), não URL completa.
// Monta a URL de pagamento. (Confirmar o domínio ao testar recuperação de carrinho real.)
function kiwifyCheckoutUrl(code: unknown): string | undefined {
  if (!code) return undefined;
  const s = String(code);
  return s.startsWith("http") ? s : `https://pay.kiwify.com.br/${s}`;
}

// Extrai o AFILIADO da venda. A Kiwify manda em formatos que variam entre contas/eventos, então
// tentamos os caminhos conhecidos: objeto `affiliate` no topo e/ou `Commissions.commissioned_stores`
// (array com uma linha de type 'affiliate'). Valores em centavos → reais. Se nada casar, retorna null
// (a captura crua em /admin/webhook-debug deixa a gente confirmar os campos no 1º afiliado REAL).
function parseAffiliate(body: any): NormalizedEvent["affiliate"] {
  const a = body?.affiliate ?? body?.Affiliate ?? null;
  const stores = body?.Commissions?.commissioned_stores ?? body?.commissions?.commissioned_stores ?? [];
  const affStore = Array.isArray(stores)
    ? stores.find((s: any) => /afili|affiliate/i.test(String(s?.type ?? s?.kind ?? "")))
    : null;
  const name = a?.full_name ?? a?.name ?? a?.legal_name ?? affStore?.custom_name ?? affStore?.name ?? null;
  const email = a?.email ?? affStore?.email ?? null;
  const id = a?.affiliate_id ?? a?.id ?? affStore?.affiliate_id ?? affStore?.id ?? null;
  // ⚠️ commissioned_stores[].value vem como STRING em CENTAVOS (ex.: "8385" = R$ 83,85) — confirmado
  // no payload real 25/07. Number() cobre string e número; NaN → sem valor (a Kiwify paga de qualquer forma).
  const centsRaw = affStore?.value ?? affStore?.amount ?? a?.value ?? a?.commission ?? a?.commission_amount ?? null;
  const cents = centsRaw != null ? Number(centsRaw) : NaN;
  const commission = Number.isFinite(cents) ? cents / 100 : null;
  if (!name && !email && !id) return null; // venda sem afiliado
  return { id: id ?? null, name: name ?? null, email: email ?? null, commission };
}

// UTM/origem da venda. A Kiwify manda em TrackingParameters (utm_source/medium/campaign/content).
function parseTracking(body: any): NormalizedEvent["tracking"] {
  const t = body?.TrackingParameters ?? body?.tracking_parameters ?? body?.trackingParameters ?? null;
  if (!t || typeof t !== "object") return null;
  const v = (x: any) => { const s = x == null ? "" : String(x).trim(); return s ? s.slice(0, 120) : null; };
  const source = v(t.utm_source), medium = v(t.utm_medium), campaign = v(t.utm_campaign), content = v(t.utm_content);
  // A Kiwify devolve utm_term, src, sck e s1..s3 — a gente lia só 4 e descartava o resto. O sck é
  // onde a página empacota o ad_id da Meta (id do anúncio não cabe em utm_*, porque a Kiwify não
  // devolve parâmetro fora dessa lista fixa). Sem ler isso, a venda diz a campanha mas não o anúncio.
  const term = v(t.utm_term);
  // src PRIMEIRO: na Kiwify a origem viaja por utm_*, então o src sobra — é onde a página põe o
  // ad_id. O sck fica por último porque lá é campo de HOTMART (que espreme tudo num só).
  const sck = v(t.src) ?? v(t.sck) ?? v(t.s1);
  if (!source && !medium && !campaign && !content && !term && !sck) return null;
  return { source, medium, campaign, content, term, sck };
}

const MAP: Record<string, CanonicalEvent> = {
  order_approved: "purchase_approved",
  order_rejected: "purchase_refused",
  order_refunded: "refund",
  billet_created: "boleto_generated",
  pix_created: "pix_generated",
  chargeback: "chargeback",
  subscription_canceled: "subscription_canceled",
  subscription_renewed: "subscription_renewed",
  subscription_late: "payment_delayed",
};

export function parseKiwify(bruto: any): NormalizedEvent {
  // ENVELOPE: dependendo da versão do webhook, a Kiwify manda o pedido na RAIZ ou embrulhado em
  // `{ order: {...} }` (é também o formato que aparece no log de webhooks do painel dela). Sem
  // desembrulhar, `body.Customer` vem vazio: o evento sai sem telefone e sem produto, o fluxo
  // rejeita por "sem telefone" e o comprador não recebe nada.
  const body = bruto?.order && typeof bruto.order === "object" ? bruto.order : bruto;
  const type = body?.webhook_event_type as string | undefined;

  // Carrinho abandonado: payload PLANO, SEM webhook_event_type — campos no TOPO
  // (name, phone, email, product_name, checkout_link), não dentro de Customer/Product.
  if (!type) {
    const name = String(body?.name ?? "");
    return {
      platform: "kiwify",
      event: "cart_abandoned",
      eventId: String(body?.id ?? crypto.randomUUID()),
      contact: {
        name,
        firstName: name.split(" ")[0] ?? "",
        phone: toWhatsAppNumber(body?.phone),
        email: body?.email,
      },
      product: { id: body?.product_id, name: body?.product_name ?? body?.offer_name },
      links: { checkout: kiwifyCheckoutUrl(body?.checkout_link) },
      raw: body,
    };
  }

  const event: CanonicalEvent = MAP[type] ?? "unknown";
  const customer = body?.Customer ?? body?.customer ?? {};
  const fullName = customer.full_name ?? customer.name ?? "";
  const firstName = customer.first_name ?? fullName.split(" ")[0] ?? "";

  // charge_amount vem em centavos (Commissions ou raiz, conforme o evento)
  const cents =
    body?.Commissions?.charge_amount ??
    body?.commissions?.charge_amount ??
    body?.charge_amount ??
    undefined;
  const amount = typeof cents === "number" ? cents / 100 : undefined;

  return {
    platform: "kiwify",
    event,
    eventId: String(body?.order_id ?? body?.order_ref ?? crypto.randomUUID()),
    contact: {
      name: fullName,
      firstName,
      phone: toWhatsAppNumber(customer.mobile ?? customer.phone),
      email: customer.email,
    },
    product: {
      id: body?.product_id ?? body?.Product?.product_id,
      name: body?.product_name ?? body?.Product?.product_name,
    },
    amount,
    plan: {
      id: body?.Subscription?.plan?.id ?? null,
      name: body?.Subscription?.plan?.name ?? null,
      offerCode: body?.checkout_link ?? null, // a Kiwify não manda offer_id; o checkout_link identifica a oferta
    },
    fees: {
      // my_commission e kiwify_fee vêm em CENTAVOS como NÚMERO. producerNet = SEU líquido (já sem afiliado/taxa).
      kiwify: typeof body?.Commissions?.kiwify_fee === "number" ? body.Commissions.kiwify_fee / 100 : null,
      producerNet: typeof body?.Commissions?.my_commission === "number" ? body.Commissions.my_commission / 100 : null,
    },
    affiliate: parseAffiliate(body),
    tracking: parseTracking(body),
    currency: body?.Commissions?.currency ?? "BRL",
    links: {
      checkout: kiwifyCheckoutUrl(body?.checkout_link ?? body?.cart_url),
      boleto: body?.boleto_URL ?? body?.boleto_url,
      pix: body?.pix_code,
    },
    pixCode: body?.pix_code,
    raw: body,
  };
}
