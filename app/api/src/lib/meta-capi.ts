// API DE CONVERSÕES DA META (server-side) — o único jeito de o Meta saber que a venda aconteceu.
//
// Por que existe: o checkout é na KIWIFY, fora do nosso domínio. O pixel do navegador vê o clique
// ("InitiateCheckout") e perde a compra — então a campanha otimizaria por clique, não por venda.
// Aqui o MOTOR avisa a Meta quando o webhook de compra chega: dado de servidor, sem depender de
// cookie, bloqueador de anúncio ou o cliente voltar ao site.
//
// ADVANCED MATCHING: mandamos e-mail, telefone e nome **hasheados em SHA-256** (exigência da Meta —
// nunca em texto puro). É o que faz a Meta reconhecer a pessoa e casar a venda com o anúncio certo.
//
// Config no deploy/.env (sem elas, tudo vira no-op silencioso — nada quebra):
//   META_PIXEL_ID   = mesmo ID do pixel do site
//   META_CAPI_TOKEN = Gerenciador de Eventos → seu pixel → Configurações → token de acesso
//   META_TEST_EVENT = (opcional) código "TESTxxxx" pra ver os eventos chegando em Testar Eventos
import { createHash } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

// SHA-256 do valor normalizado (minúsculo, sem espaços) — o formato que a Meta espera.
const hash = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
// Telefone: só dígitos, com DDI. "(11) 99999-8888" → "5511999998888".
function telefoneE164(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}

export interface EventoMeta {
  evento: string;                 // "Purchase", "Lead", "StartTrial", "PageView", "InitiateCheckout"…
  email?: string | null;
  telefone?: string | null;
  nome?: string | null;
  valor?: number | null;          // em reais
  moeda?: string;
  idPedido?: string | null;       // deduplicação: mesmo pedido não conta 2×
  origemUrl?: string | null;
  // ── Evento de NAVEGAÇÃO (visita/clique numa landing) ──────────────────────────────────────
  // Aqui não existe e-mail nem telefone: quem identifica a pessoa é o navegador. `fbp`/`fbc` são
  // os cookies do próprio Meta (_fbp e o fbclid do anúncio) e IP+user-agent completam o casamento.
  // Sem isto, um PageView era descartado antes de sair — a exigência de e-mail/telefone só faz
  // sentido pra evento de VENDA, que é o que a função fazia até agora.
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  conteudo?: string | null;       // custom_data.content_name (ex.: "Seu Evento")
}

export async function enviaEventoMeta(d: EventoMeta): Promise<boolean> {
  const pixel = (process.env.META_PIXEL_ID || "").trim();
  const token = (process.env.META_CAPI_TOKEN || "").trim();
  if (!pixel || !token) return false; // rastreio desligado — silencioso de propósito

  const user: Record<string, string[] | string> = {};
  const email = String(d.email ?? "").trim().toLowerCase();
  if (email.includes("@")) user.em = [hash(email)];
  const fone = telefoneE164(String(d.telefone ?? ""));
  if (fone.length >= 10) user.ph = [hash(fone)];
  const nome = String(d.nome ?? "").trim();
  if (nome) {
    const partes = nome.split(/\s+/);
    user.fn = [hash(partes[0])];
    if (partes.length > 1) user.ln = [hash(partes[partes.length - 1])];
  }
  user.country = [hash("br")];
  // Identificadores do navegador NÃO são hasheados (regra da Meta: fbp/fbc/IP/UA vão em texto).
  if (d.fbp) user.fbp = String(d.fbp);
  if (d.fbc) user.fbc = String(d.fbc);
  if (d.ip) user.client_ip_address = String(d.ip);
  if (d.userAgent) user.client_user_agent = String(d.userAgent).slice(0, 500);
  // Sem NENHUM identificador não há match — não vale o request.
  if (!user.em && !user.ph && !user.fbp && !user.fbc && !user.client_ip_address) return false;

  const corpo: any = {
    data: [{
      event_name: d.evento,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      // Deduplicação: se um dia o pixel do navegador mandar o mesmo evento, a Meta junta os dois.
      ...(d.idPedido ? { event_id: String(d.idPedido) } : {}),
      ...(d.origemUrl ? { event_source_url: d.origemUrl } : {}),
      user_data: user,
      custom_data: {
        currency: d.moeda || "BRL",
        ...(d.valor != null ? { value: Number(d.valor) } : {}),
        ...(d.conteudo ? { content_name: String(d.conteudo).slice(0, 120) } : {}),
      },
    }],
  };
  const teste = (process.env.META_TEST_EVENT || "").trim();
  if (teste) corpo.test_event_code = teste;

  try {
    const r = await fetch(`${GRAPH}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      console.error("meta-capi:", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return false;
    }
    const eco: any = await r.json().catch(() => ({}));
    console.log(`📈 Meta CAPI: ${d.evento}${d.valor != null ? ` R$ ${d.valor}` : ""} enviado`
      + ` (match por ${Object.keys(user).filter((k) => k !== "country").join("+") || "nenhum"})`
      + `${teste ? ` · TESTE ${teste}` : ""}`
      + `${eco?.events_received != null ? ` · a Meta recebeu ${eco.events_received}` : ""}`);
    return true;
  } catch (e: any) {
    console.error("meta-capi:", e?.message ?? e);
    return false;
  }
}

// ── CAPI de MENSAGENS (conversa de WhatsApp vinda de anúncio) ───────────────────────────────
// OUTRO animal, não o pixel do site: `action_source:"business_messaging"` + `ctwa_clid` — o clique
// que o webhook da Meta entrega na PRIMEIRA mensagem do lead de Click-to-WhatsApp. Vai em claro
// (sem hash), junto com o id da WABA; o destino é o DATASET da WABA, não o pixel. É o que ensina a
// campanha de engajamento QUAL conversa virou venda — ela passa a otimizar por compra, não por
// clique. Eventos aceitos (doc + teste real de 14/09/2026): Purchase, LeadSubmitted, QualifiedLead,
// InitiateCheckout, AddToCart, ViewContent, CartAbandoned… Custom é rejeitado; event_time ≤ 7 dias.
export async function eventoWhatsAppMeta(o: {
  datasetId: string; token: string; evento: string; ctwaClid: string; wabaId?: string; valor?: number | null;
  testCode?: string; // código da aba "Testar eventos": o evento aparece lá e NÃO conta como conversão
}): Promise<{ ok: boolean; detalhe: string }> {
  const user_data: Record<string, string> = { ctwa_clid: o.ctwaClid };
  if (o.wabaId) user_data.whatsapp_business_account_id = o.wabaId;
  const ev: Record<string, unknown> = {
    event_name: o.evento,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data,
  };
  // Valor só no Purchase (e só se veio): é ele que liga o ROAS da campanha à venda real.
  if (o.valor != null && o.valor > 0) ev.custom_data = { currency: "BRL", value: Math.round(o.valor * 100) / 100 };
  try {
    const r = await fetch(`${GRAPH}/${o.datasetId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [ev], access_token: o.token, ...(o.testCode ? { test_event_code: o.testCode } : {}) }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error)
      return { ok: false, detalhe: String(j?.error?.error_user_msg ?? j?.error?.message ?? `HTTP ${r.status}`).slice(0, 280) };
    return { ok: true, detalhe: `a Meta aceitou (events_received=${j?.events_received ?? 1})` };
  } catch (e: any) {
    return { ok: false, detalhe: String(e?.message ?? e).slice(0, 280) };
  }
}
