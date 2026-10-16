// ══ RESEND — e-mail pelos FLUXOS, com a conta Resend DO CLIENTE ══════════════════════════════
// Pedido do dono (09/10/2026): integração Resend em Integrações (o cliente cola a chave dele e o
// remetente do domínio que ele verificou na Resend) + nó "Enviar e-mail" nos fluxos. A chave fica
// por workspace, cifrada, nunca volta pro navegador e nunca fica dentro do fluxo.
//
// Fatos da API (resend.com/docs/api-reference/emails/send-email):
//   · POST https://api.resend.com/emails · header Authorization: Bearer re_…;
//   · corpo { from: "Nome <email@dominio>", to: [..], subject, html, text?, reply_to? } → { id };
//   · o domínio do "from" precisa estar VERIFICADO na conta Resend (senão 403 "domain is not verified").
// Diferente de lib/mail.ts, que é o e-mail do PRÓPRIO ZapConverte (acesso, senha) pela chave do .env.
import { getCachedFor } from "../config-store.js";
import { getCurrentWorkspace } from "../workspace-context.js";
import { decryptSecret } from "../crypto.js";

export interface CfgResend { chave: string; remetente: string; nome: string; responderPara: string }

export function configResendDoWorkspace(ws?: string): CfgResend | null {
  const c = getCachedFor<{ enc?: string; remetente?: string; nome?: string; responderPara?: string }>(ws ?? getCurrentWorkspace(), "resend-config");
  const chave = c?.enc ? decryptSecret(c.enc) : null;
  if (!chave || !c?.remetente) return null;
  return { chave, remetente: c.remetente, nome: c.nome ?? "", responderPara: c.responderPara ?? "" };
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Texto do nó → HTML simples e legível no Gmail/Outlook: escapa, quebra de linha vira <br>,
 *  *negrito* do WhatsApp vira <b>, e link solto vira link clicável. */
export function textoParaHtml(texto: string): string {
  const corpo = escHtml(texto)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0a7d4f">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;max-width:600px">${corpo}</div>`;
}

export async function enviarEmailResend(cfg: CfgResend, msg: { para: string; assunto: string; html: string; texto?: string; nome?: string; responderPara?: string }): Promise<string> {
  const nome = (msg.nome ?? cfg.nome ?? "").replace(/[<>"]/g, "").trim();
  const from = nome ? `${nome} <${cfg.remetente}>` : cfg.remetente;
  const reply = (msg.responderPara || cfg.responderPara || "").trim();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.chave, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [msg.para], subject: msg.assunto, html: msg.html, ...(msg.texto ? { text: msg.texto } : {}), ...(reply ? { reply_to: reply } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const dito = String(j?.message ?? j?.error ?? "").slice(0, 200);
    if (r.status === 401) throw new Error("a Resend recusou a chave (401) — confira em Integrações → Resend");
    if (r.status === 403) throw new Error(`a Resend recusou o remetente (403): ${dito || "o domínio do e-mail remetente precisa estar verificado na sua conta Resend"}`);
    if (r.status === 422) throw new Error(`a Resend recusou o e-mail (422): ${dito}`);
    if (r.status === 429) throw new Error("a Resend limitou os envios (429) — tente de novo em instantes");
    throw new Error(`Resend respondeu ${r.status}: ${dito || "sem detalhe"}`);
  }
  return String(j?.id ?? "");
}
