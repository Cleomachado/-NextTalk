// ══ ZAPSIGN — cliente da API de assinatura eletrônica ═══════════════════════════════════════
// O nó "ZapSign" dos fluxos (pedido do dono, 05/10, pro escritório do Dr. Exemplo): o "Check diário
// de assinatura ZapSign" consulta quantos documentos estão PENDENTES de assinatura e quem são, pra
// avisar a equipe. Ação escolhida na configuração do nó (hoje: pendentes; o resto entra por aqui).
//
// Fatos da API confirmados na documentação (docs.zapsign.com.br, lida em 05/10/2026):
//   · autenticação: header `Authorization: Bearer <token da API>`;
//   · produção https://api.zapsign.com.br/api/v1 · sandbox https://sandbox.api.zapsign.com.br/api/v1;
//   · GET /docs/?page=N&status=pending&deleted=false&include_signers=true&sort_order=asc →
//     { count, next, results: [{ token, name, status, created_at, signers: [{ name, status,
//       signing_url }] }] } — status do signatário: nao_abriu | abriu | assinou | recusou | …;
//   · GET /docs/<token>/ traz o telefone de cada signatário (phone_country + phone_number);
//   · a listagem tem cache de até 60 min e documento novo leva ~1 min pra aparecer;
//   · limite de 500 requisições por minuto.
//
// O TOKEN fica por workspace, cifrado, em Integrações → ZapSign — nunca dentro do fluxo.
// Contrato + procuração do escritório vão no MESMO envelope (procuração anexada), então 1
// documento pendente = 1 cliente que ainda não assinou.
import { getCachedFor } from "../config-store.js";
import { getCurrentWorkspace } from "../workspace-context.js";
import { decryptSecret } from "../crypto.js";

export interface CfgZapSign { token: string; ambiente: "producao" | "sandbox" }

export function configZapSignDoWorkspace(): CfgZapSign | null {
  const c = getCachedFor<{ enc?: string; ambiente?: string }>(getCurrentWorkspace(), "zapsign-config");
  const token = c?.enc ? decryptSecret(c.enc) : null;
  if (!token) return null;
  return { token, ambiente: c?.ambiente === "sandbox" ? "sandbox" : "producao" };
}

const base = (cfg: CfgZapSign) =>
  cfg.ambiente === "sandbox" ? "https://sandbox.api.zapsign.com.br/api/v1" : "https://api.zapsign.com.br/api/v1";

async function zsFetch(cfg: CfgZapSign, path: string): Promise<any> {
  const r = await fetch(base(cfg) + path, {
    headers: { authorization: "Bearer " + cfg.token, accept: "application/json", "user-agent": "ZapConverte/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text().catch(() => "");
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* não-JSON vira erro abaixo */ }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error("a ZapSign recusou o token (" + r.status + ") — confira em Integrações → ZapSign o token e o ambiente (produção ou sandbox têm tokens diferentes)");
    if (r.status === 402) throw new Error("a conta da ZapSign não tem Plano de API ativo (402)");
    if (r.status === 429) throw new Error("a ZapSign limitou as requisições (429) — tente de novo em um minuto");
    const dito = String(json?.detail ?? json?.message ?? texto).slice(0, 160);
    throw new Error(`ZapSign respondeu ${r.status}: ${dito || "sem detalhe"}`);
  }
  return json;
}

// Chamada mais barata que prova o token (Integrações → Testar).
export async function testarZapSign(cfg: CfgZapSign): Promise<{ pendentes: number }> {
  const j = await zsFetch(cfg, "/docs/?page=1&status=pending&deleted=false");
  return { pendentes: Number(j?.count) || 0 };
}

export interface Pendente {
  documento: string;   // nome do documento na ZapSign
  token: string;
  criado_em: string;   // dd/mm/aaaa
  dias: number;        // há quantos dias está pendente
  nome: string;        // signatário(s) que AINDA não assinaram
  situacao: string;    // "não abriu" | "abriu, não assinou"
  telefone: string;    // só dígitos, com 55 (vazio quando a ZapSign não tem)
  link: string;        // link de assinatura do 1º pendente
}

const SITUACAO: Record<string, string> = { nao_abriu: "não abriu", abriu: "abriu, não assinou", new: "não abriu", link_opened: "abriu, não assinou" };

// Lista os PENDENTES. `diasMin` = só os pendentes há pelo menos N dias (0 = todos). `telefones` =
// busca o detalhe de cada documento pra trazer o telefone (1 chamada a mais por documento, até 30).
export async function listarPendentes(cfg: CfgZapSign, opts: { diasMin?: number; telefones?: boolean; maxPaginas?: number } = {}): Promise<{ total: number; lista: Pendente[] }> {
  const agora = Date.now();
  const diasMin = Math.max(0, Math.floor(Number(opts.diasMin) || 0));
  const docs: any[] = [];
  let total = 0;
  for (let p = 1; p <= Math.min(10, opts.maxPaginas ?? 5); p++) {
    const j = await zsFetch(cfg, `/docs/?page=${p}&status=pending&deleted=false&include_signers=true&sort_order=asc`);
    if (p === 1) total = Number(j?.count) || 0;
    docs.push(...(Array.isArray(j?.results) ? j.results : []));
    if (!j?.next) break;
  }
  const lista: Pendente[] = [];
  for (const d of docs) {
    if (String(d?.status ?? "") !== "pending") continue;
    const criado = new Date(String(d?.created_at ?? ""));
    const dias = Number.isNaN(criado.getTime()) ? 0 : Math.floor((agora - criado.getTime()) / 86_400_000);
    if (dias < diasMin) continue;
    const faltam = (Array.isArray(d?.signers) ? d.signers : []).filter((s: any) => !["assinou", "signed", "cancelado", "recusou"].includes(String(s?.status ?? "")));
    const primeiro = faltam[0] ?? {};
    lista.push({
      documento: String(d?.name ?? "").slice(0, 120),
      token: String(d?.token ?? ""),
      criado_em: Number.isNaN(criado.getTime()) ? "" : criado.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      dias,
      nome: faltam.map((s: any) => String(s?.name ?? "").trim()).filter(Boolean).join(", ").slice(0, 160) || "(sem nome)",
      situacao: SITUACAO[String(primeiro?.status ?? "")] ?? String(primeiro?.status ?? ""),
      telefone: "",
      link: String(primeiro?.signing_url ?? primeiro?.sign_url ?? ""),
    });
  }
  if (opts.telefones) {
    for (const item of lista.slice(0, 30)) {
      try {
        const det = await zsFetch(cfg, "/docs/" + encodeURIComponent(item.token) + "/");
        const s = (Array.isArray(det?.signers) ? det.signers : []).find((x: any) => !["signed", "assinou"].includes(String(x?.status ?? "")) && x?.phone_number);
        if (s) {
          const dig = (String(s.phone_country ?? "55") + String(s.phone_number ?? "")).replace(/\D/g, "");
          item.telefone = dig.length >= 10 ? dig : "";
        }
      } catch { /* telefone é bônus: sem ele a lista continua valendo */ }
    }
  }
  return { total: diasMin ? lista.length : Math.max(total, lista.length), lista };
}

// Texto pronto pra mandar no WhatsApp da equipe (o Avisar usa {{zapsign_resumo}}).
export function resumoPendentes(lista: Pendente[], total: number): string {
  if (!total) return "Nenhuma assinatura pendente na ZapSign.";
  const linhas = lista.slice(0, 25).map((p, i) =>
    `${i + 1}. ${p.nome} · ${p.dias === 0 ? "hoje" : p.dias === 1 ? "há 1 dia" : `há ${p.dias} dias`} · ${p.situacao}` +
    (p.telefone ? `\n   https://wa.me/${p.telefone}` : ""));
  const resto = total > linhas.length ? `\n…e mais ${total - linhas.length}.` : "";
  return `${total} assinatura${total > 1 ? "s" : ""} pendente${total > 1 ? "s" : ""} na ZapSign:\n` + linhas.join("\n") + resto;
}
