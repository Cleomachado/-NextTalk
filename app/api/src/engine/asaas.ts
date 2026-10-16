// ══ ASAAS — cliente da API de cobranças ══════════════════════════════════════════════════════
// O nó "Asaas" dos fluxos (pedido do dono e de um cliente, 27/08): checar pagamento, enviar comprovante,
// criar cobrança, PIX copia-e-cola, listar cobranças e buscar cliente — tudo num nó só, com a
// ação escolhida na configuração.
//
// Fatos da API confirmados na documentação (docs.asaas.com, lida em 27/08/2026):
//   · autenticação: header `access_token` com a chave da conta;
//   · produção https://api.asaas.com/v3 · sandbox https://api-sandbox.asaas.com/v3;
//   · GET /payments — filtros: customer, status, dueDate[ge]/dueDate[le], externalReference…;
//   · GET /payments/{id}/pixQrCode — `payload` é o copia-e-cola, `expirationDate` a validade;
//   · GET /payments/{id}/identificationField — linha digitável do boleto;
//   · o COMPROVANTE é o campo `transactionReceiptUrl` da cobrança (existe depois de paga);
//   · /customers busca por cpfCnpj, email, name, externalReference — NÃO por telefone;
//   · GET com corpo dá 403 (pegadinha da doc) — nunca mandar body em GET.
//
// A CHAVE fica por workspace, cifrada, em Integrações → Asaas — nunca dentro do fluxo (o arquivo
// do n8n de um cliente trazia a chave em texto claro; aqui esse erro não se repete).
import { getCachedFor } from "../config-store.js";
import { getCurrentWorkspace } from "../workspace-context.js";
import { decryptSecret } from "../crypto.js";

export interface CfgAsaas { chave: string; ambiente: "producao" | "sandbox" }

export function configAsaasDoWorkspace(): CfgAsaas | null {
  const c = getCachedFor<{ enc?: string; ambiente?: string }>(getCurrentWorkspace(), "asaas-config");
  const chave = c?.enc ? decryptSecret(c.enc) : null;
  if (!chave) return null;
  return { chave, ambiente: c?.ambiente === "sandbox" ? "sandbox" : "producao" };
}

const base = (cfg: CfgAsaas) =>
  cfg.ambiente === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";

// O Asaas RECUSA requisição sem User-Agent (403) — não é opcional.
async function asaasFetch(cfg: CfgAsaas, path: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const method = init?.method ?? "GET";
  const r = await fetch(base(cfg) + path, {
    method,
    headers: {
      access_token: cfg.chave,
      accept: "application/json",
      "user-agent": "ZapConverte/1.0",
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    // GET com corpo = 403 no Asaas; só manda body quando existe (POST).
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  const texto = await r.text().catch(() => "");
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* resposta não-JSON vira erro abaixo */ }
  if (!r.ok) {
    const detalhe = String(json?.errors?.[0]?.description ?? texto).slice(0, 160);
    if (r.status === 401) throw new Error("a chave do Asaas foi recusada (401) — confira em Integrações → Asaas se a chave e o ambiente (produção/sandbox) estão certos");
    throw new Error(`Asaas respondeu ${r.status}: ${detalhe || "sem detalhe"}`);
  }
  return json;
}

// ── Rótulos em português ─────────────────────────────────────────────────────────────────────
export const STATUS_ROTULO: Record<string, string> = {
  PENDING: "aguardando pagamento", RECEIVED: "pago (na conta)", CONFIRMED: "pago (confirmado)",
  OVERDUE: "vencida", REFUNDED: "estornada", RECEIVED_IN_CASH: "pago (em dinheiro)",
  REFUND_REQUESTED: "estorno pedido", REFUND_IN_PROGRESS: "estorno em andamento",
  CHARGEBACK_REQUESTED: "chargeback", CHARGEBACK_DISPUTE: "chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "aguardando reversão", DUNNING_REQUESTED: "em negativação",
  DUNNING_RECEIVED: "recuperada na negativação", AWAITING_RISK_ANALYSIS: "em análise",
};
const PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const TIPO_ROTULO: Record<string, string> = { PIX: "PIX", BOLETO: "boleto", CREDIT_CARD: "cartão", UNDEFINED: "escolha do cliente" };

const brl = (v: unknown) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
};
const dataBr = (v: unknown) => {
  const s = String(v ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

// A cobrança vira VARIÁVEIS do fluxo, todas com o prefixo asaas_ — são estas que aparecem nos
// chips do builder e que o cliente usa nos textos. asaas_pago ("sim"/"não") é a que alimenta o
// nó de Condição.
export function camposDaCobranca(c: any): Record<string, string> {
  const põe = (o: Record<string, string>, k: string, v: unknown) => {
    const s = String(v ?? "").trim();
    if (s) o[k] = s.slice(0, 500);
  };
  const o: Record<string, string> = {};
  põe(o, "asaas_cobranca_id", c?.id);
  põe(o, "asaas_cliente_id", c?.customer);
  põe(o, "asaas_status", c?.status);
  põe(o, "asaas_status_rotulo", STATUS_ROTULO[String(c?.status)] ?? c?.status);
  o.asaas_pago = PAGO.has(String(c?.status)) ? "sim" : "não";
  põe(o, "asaas_valor", brl(c?.value));
  põe(o, "asaas_valor_numero", c?.value);
  põe(o, "asaas_vencimento", dataBr(c?.dueDate));
  põe(o, "asaas_data_pagamento", dataBr(c?.paymentDate ?? c?.clientPaymentDate));
  põe(o, "asaas_descricao", c?.description);
  põe(o, "asaas_tipo", TIPO_ROTULO[String(c?.billingType)] ?? c?.billingType);
  põe(o, "asaas_link", c?.invoiceUrl);
  põe(o, "asaas_boleto", c?.bankSlipUrl);
  põe(o, "asaas_comprovante", c?.transactionReceiptUrl);
  return o;
}
export const cobrancaPaga = (c: any) => PAGO.has(String(c?.status));

// ── Consultas ────────────────────────────────────────────────────────────────────────────────
export async function buscarClienteAsaas(
  cfg: CfgAsaas, por: { id?: string; cpfCnpj?: string; email?: string },
): Promise<any | null> {
  if (por.id) {
    try { return await asaasFetch(cfg, `/customers/${encodeURIComponent(por.id)}`); }
    catch (e: any) { if (/404/.test(String(e?.message))) return null; throw e; }
  }
  const q = new URLSearchParams({ limit: "1" });
  if (por.cpfCnpj) q.set("cpfCnpj", por.cpfCnpj.replace(/\D/g, ""));
  else if (por.email) q.set("email", por.email.trim());
  else return null;
  const r = await asaasFetch(cfg, `/customers?${q}`);
  return r?.data?.[0] ?? null;
}

export async function pegarCobranca(cfg: CfgAsaas, id: string): Promise<any | null> {
  try { return await asaasFetch(cfg, `/payments/${encodeURIComponent(id)}`); }
  catch (e: any) { if (/404/.test(String(e?.message))) return null; throw e; }
}

// A mais RECENTE do cliente (opcionalmente só de um status) — é o que "checar pagamento por
// cliente" precisa: a última cobrança é quase sempre a da conversa.
export async function cobrancaMaisRecente(cfg: CfgAsaas, customerId: string, status?: string): Promise<any | null> {
  const q = new URLSearchParams({ customer: customerId, limit: "20" });
  if (status) q.set("status", status);
  const r = await asaasFetch(cfg, `/payments?${q}`);
  const lista: any[] = Array.isArray(r?.data) ? r.data.filter((c: any) => !c?.deleted) : [];
  lista.sort((a, b) => String(b?.dateCreated ?? "").localeCompare(String(a?.dateCreated ?? "")));
  return lista[0] ?? null;
}

export async function listarCobrancas(
  cfg: CfgAsaas, f: { status?: string; vencidoDias?: number; limite?: number },
): Promise<any[]> {
  const q = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, f.limite ?? 100))) });
  if (f.status) q.set("status", f.status);
  if (f.vencidoDias !== undefined && isFinite(f.vencidoDias)) {
    // Vencimento EXATAMENTE N dias atrás (0 = vence hoje) — o recorte dos fluxos de cobrança do
    // um cliente (hoje / 3 dias / 5 dias), sem mandar a mesma cobrança duas vezes. NEGATIVO = futuro
    // ("vence daqui a 3 dias"), que é o lembrete ANTES de vencer — pedido do dono, 27/08.
    const d = new Date(Date.now() - Math.round(f.vencidoDias) * 86_400_000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    q.set("dueDate[ge]", iso);
    q.set("dueDate[le]", iso);
  }
  const r = await asaasFetch(cfg, `/payments?${q}`);
  const lista: any[] = Array.isArray(r?.data) ? r.data.filter((c: any) => !c?.deleted) : [];
  return enriqueceComCliente(cfg, lista);
}

// 📞 A cobrança do Asaas NÃO traz telefone — só o id do cliente (customer: "cus_…"). O Loop
// precisa do telefone em cada item pra agendar o disparo daquela pessoa; sem ele, pula todos
// ("item sem telefone válido") e o fluxo de cobrança termina sem mandar nada. No n8n de um cliente
// isso era um nó "Buscar Cliente" dentro do laço; aqui o laço agenda ANTES de rodar o ramo, então
// o dado tem que já estar no item. Busca cada cliente UMA vez (dedup), 5 por vez, e falha de um
// cliente não derruba a lista — aquele item só fica sem telefone (e o log conta quantos ficaram).
async function enriqueceComCliente(cfg: CfgAsaas, lista: any[]): Promise<any[]> {
  const ids = [...new Set(lista.map((c) => String(c?.customer ?? "")).filter(Boolean))];
  const clientes = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      try { const cli = await buscarClienteAsaas(cfg, { id }); if (cli) clientes.set(id, cli); } catch { /* fica sem */ }
    }));
  }
  return lista.map((c) => {
    const cli = clientes.get(String(c?.customer ?? ""));
    const telefone = foneBr(cli?.mobilePhone) || foneBr(cli?.phone);
    return {
      ...c,
      // Nomes CURTOS no topo do item: é o que o Loop achata e vira {{telefone}}, {{nome}},
      // {{valor}} no ramo de cada pessoa — a mensagem de cobrança escrita por gente.
      telefone, nome: String(cli?.name ?? "").trim(), cpf: String(cli?.cpfCnpj ?? "").trim(), email: String(cli?.email ?? "").trim(),
      valor: brl(c?.value), vencimento: dataBr(c?.dueDate), link: String(c?.invoiceUrl ?? ""), boleto: String(c?.bankSlipUrl ?? ""),
      status_rotulo: STATUS_ROTULO[String(c?.status)] ?? String(c?.status ?? ""),
    };
  });
}

// Telefone do jeito que o WhatsApp quer: só dígitos, com o 55 na frente. "(11) 98888-7777" → 5511988887777.
function foneBr(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d.length >= 12 ? d : "";
}

export async function pixCopiaCola(cfg: CfgAsaas, paymentId: string): Promise<{ payload: string; validade: string } | null> {
  const r = await asaasFetch(cfg, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
  const payload = String(r?.payload ?? "").trim();
  return payload ? { payload, validade: dataBr(r?.expirationDate) } : null;
}

export async function linhaDigitavel(cfg: CfgAsaas, paymentId: string): Promise<string> {
  const r = await asaasFetch(cfg, `/payments/${encodeURIComponent(paymentId)}/identificationField`);
  return String(r?.identificationField ?? "").trim();
}

export async function criarCobranca(
  cfg: CfgAsaas,
  dados: { customer: string; billingType: string; value: number; dueDate: string; description?: string; externalReference?: string },
): Promise<any> {
  return asaasFetch(cfg, "/payments", { method: "POST", body: dados });
}

// Teste da conexão (o botão de Integrações): a chamada mais leve que prova chave + ambiente.
export async function testarAsaas(cfg: CfgAsaas): Promise<{ ok: true; clientes: number }> {
  const r = await asaasFetch(cfg, "/customers?limit=1");
  return { ok: true, clientes: Number(r?.totalCount ?? 0) };
}
