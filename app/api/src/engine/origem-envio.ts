// QUEM ENVIOU cada mensagem "nossa" (fromMe) — robô, painel, ou uma pessoa por fora?
//
// Pedido do dono (02/10): qualquer intervenção humana numa conversa da IA — pelo celular, pelo
// WhatsApp Web ou digitando no ZapConverte — tem que PAUSAR a IA e ficar visível no balão.
// O problema: tudo que sai pela API (robô e painel) E tudo que sai do WhatsApp Web/Desktop chega no
// webhook com a mesma marca (`source: "web"`). Só o celular se distingue (android/ios).
//
// A saída é registrar, na RAIZ do envio, o que ESTE servidor mandou (id e — no bot-echo — o texto).
// O que voltar como "web" sem estar registrado aqui foi alguém no WhatsApp Web.
//
// ⚠️ O erro perigoso é confundir mensagem do robô com humana: o robô se pausaria sozinho logo após
// a própria fala. Por isso a regra é "na dúvida, é nosso" (ver `classificaPropria`).
// Módulo sem dependências, de propósito: é importado pelo gateway e pelo uaz.ts, e é testável.

import { AsyncLocalStorage } from "node:async_hooks";

// "ia" = saiu de dentro de um turno do AGENTE IA (do fluxo ou do Atendente IA geral). "bot" = os
// demais passos automáticos (fluxo comum). Separados pro selo do balão (pedido do dono, 03/10).
export type OrigemEnvio = "bot" | "ia" | "painel" | "nosso";
// "auto" = resposta AUTOMÁTICA do próprio WhatsApp Business (saudação/ausência configuradas no app).
// Sai do celular (source android/ios), mas não é gente: não pode pausar a IA (HG, 04/10).
export type OrigemMsg = "android" | "ios" | "web" | "painel" | "bot" | "ia" | "auto";

// O WhatsApp Business põe um caractere invisível (U+200E, marca de direção) no INÍCIO das mensagens
// automáticas de saudação e ausência. Texto digitado por gente não começa com ele.
export const ehRespostaAutomaticaWa = (texto?: string | null): boolean => /^\u200e/.test(String(texto ?? ""));

// Contexto "estou falando como IA": quem roda um turno do agente embrulha em `comoIa` e todo envio
// lá de dentro é registrado como "ia" — sem ter que passar a informação por cada função de envio.
const ctxIa = new AsyncLocalStorage<boolean>();
export function comoIa<T>(fn: () => T): T { return ctxIa.run(true, fn); }
export function origemDoContexto(): "ia" | "bot" { return ctxIa.getStore() ? "ia" : "bot"; }

const TTL_MS = 20 * 60_000;
const porId = new Map<string, { o: OrigemEnvio; at: number }>();
const emCurso = new Map<string, number>();   // envios com a chamada HTTP ainda aberta, por conversa
const ultimo = new Map<string, number>();    // quando terminou o último envio nosso, por conversa

const chaveConversa = (to: string) => String(to ?? "").replace(/@.*/, "").replace(/\D/g, "").slice(-8);
// A UazAPI às vezes devolve "dono:ID" e às vezes só o ID — o webhook entrega o curto.
const idCurto = (id: string) => String(id ?? "").split(":").pop() ?? "";

function limpa(): void {
  const agora = Date.now();
  for (const [k, v] of porId) if (agora - v.at > TTL_MS) porId.delete(k);
  for (const [k, v] of ultimo) if (agora - v > TTL_MS) ultimo.delete(k);
}

/** Antes de abrir a chamada de envio: marca que há um envio NOSSO em curso pra essa conversa. */
export function inicioEnvio(to: string): void {
  const k = chaveConversa(to);
  if (k) emCurso.set(k, (emCurso.get(k) ?? 0) + 1);
}

/** Depois da chamada (com sucesso ou erro): fecha o "em curso" e, se veio id, registra a origem. */
export function fimEnvio(to: string, id?: string, origem: OrigemEnvio = "bot"): void {
  const k = chaveConversa(to);
  if (k) {
    const n = (emCurso.get(k) ?? 1) - 1;
    if (n > 0) emCurso.set(k, n); else emCurso.delete(k);
    ultimo.set(k, Date.now());
  }
  if (id) marcaOrigemEnvio(id, origem);
}

/** Registra/ajusta a origem de um id. "nosso" (genérico) nunca rebaixa "bot"/"painel" já marcado;
 *  "painel" e "bot" sobrescrevem — o endpoint do painel marca DEPOIS do registro genérico. */
export function marcaOrigemEnvio(id: string, origem: OrigemEnvio): void {
  const c = idCurto(id);
  if (!c) return;
  const atual = porId.get(c);
  if (atual && origem === "nosso") { atual.at = Date.now(); return; }
  porId.set(c, { o: origem, at: Date.now() });
  if (porId.size > 5000) limpa();
}

// QUEM DA EQUIPE enviou pelo painel (nome da sessão). O selo do balão mostra "David" em vez de
// "ZapConverte" — pedido do dono (05/10), pra saber qual atendente respondeu o cliente.
const autorPorId = new Map<string, { nome: string; at: number }>();
export function marcaAutorEnvio(id: string, nome: string): void {
  const c = idCurto(id);
  if (!c || !nome) return;
  autorPorId.set(c, { nome, at: Date.now() });
  if (autorPorId.size > 5000) { const agora = Date.now(); for (const [k, v] of autorPorId) if (agora - v.at > TTL_MS) autorPorId.delete(k); }
}
export function autorDoEnvio(id: string): string | undefined {
  const e = autorPorId.get(idCurto(id));
  return e && Date.now() - e.at < TTL_MS ? e.nome : undefined;
}

export function origemDoEnvio(id: string): OrigemEnvio | undefined {
  const e = porId.get(idCurto(id));
  return e && Date.now() - e.at < TTL_MS ? e.o : undefined;
}

/** Há um envio nosso em curso pra essa conversa, ou um terminou há menos de `janelaMs`? */
export function envioNossoRecente(to: string, janelaMs = 60_000): boolean {
  const k = chaveConversa(to);
  if ((emCurso.get(k) ?? 0) > 0) return true;
  return Date.now() - (ultimo.get(k) ?? 0) < janelaMs;
}
export function envioEmCurso(to: string): boolean {
  return (emCurso.get(chaveConversa(to)) ?? 0) > 0;
}

/** Decide de onde veio uma mensagem fromMe. PURA — recebe os sinais já apurados.
 *  - celular se distingue sozinho (android/ios);
 *  - id registrado como "painel" → digitada no ZapConverte;
 *  - id registrado de outro jeito, ou QUALQUER sinal de que foi este servidor → robô;
 *  - "web" sem nenhum sinal nosso → alguém no WhatsApp Web/Desktop.
 *  `suspeitaNossa` e `bootRecente` existem pra errar sempre pro lado seguro (não pausar). */
export function classificaPropria(a: {
  source: string; origemId?: OrigemEnvio; suspeitaNossa: boolean; bootRecente: boolean; automaticaWa?: boolean;
}): OrigemMsg {
  if (a.automaticaWa) return "auto";
  if (a.source === "android" || a.source === "ios") return a.source;
  if (a.origemId === "painel") return "painel";
  if (a.origemId === "ia") return "ia";
  if (a.origemId) return "bot";
  if (a.suspeitaNossa || a.bootRecente) return "bot";
  return "web";
}

export const ehIntervencaoHumana = (o: OrigemMsg): boolean => o !== "bot" && o !== "ia" && o !== "auto";

/** Só pra teste: zera o estado. */
export function _zeraRegistro(): void { porId.clear(); emCurso.clear(); ultimo.clear(); }
