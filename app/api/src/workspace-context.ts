// Contexto de workspace amarrado ao fluxo assíncrono (AsyncLocalStorage) — o coração do multi-tenant.
//
// Ideia: TODA leitura/escrita de dados operacionais que não recebe um wsId explícito passa a resolver
// o workspace CORRENTE (o do request/inbound que estamos atendendo) em vez do primário fixo. Assim não
// preciso enfiar `wsId` em dezenas de assinaturas — basta EMBRULHAR o ponto de entrada:
//
//   runWithWorkspace(wsDoCliente, () => processInbound(msg, body))
//
// e todos os getPending/upsertContact/loadAutomations/etc. lá dentro caem no workspace certo.
//
// ⛑️ SEGURANÇA / ZERO REGRESSÃO: quando NÃO há contexto setado (painel do admin, schedulers, boot),
// getCurrentWorkspace() cai no PRIMÁRIO — exatamente como antes. Então o single-tenant do dono roda
// idêntico; o escopo por-cliente só liga onde a entrada é explicitamente embrulhada. O risco a vigiar é
// o inverso (fail-to-primary): um caminho de CLIENTE que esqueça de embrulhar leria o primário. Por isso
// os pontos de entrada de cliente SEMPRE setam o contexto, e os testes de isolamento cobrem isso.
import { AsyncLocalStorage } from "node:async_hooks";
import { getPrimaryWorkspace } from "./tenancy.js";

interface WorkspaceStore { wsId: string; instanceToken?: string }
const als = new AsyncLocalStorage<WorkspaceStore>();

// Roda `fn` com um workspace corrente amarrado ao contexto assíncrono. Retorna o que `fn` retornar
// (inclusive Promises — o ALS propaga pelos awaits).
// `instanceToken` (opcional) = a instância UazAPI que recebeu o inbound. Serve pro FOLLOW-UP AGENDADO
// voltar a falar pelo MESMO número por onde a conversa aconteceu (cliente com 2 números).
export function runWithWorkspace<T>(wsId: string, fn: () => T, instanceToken?: string): T {
  return als.run({ wsId, instanceToken }, fn);
}

// Token da instância corrente (só existe dentro de um inbound). null = não sabemos por qual número.
export function getCurrentInstanceToken(): string | null {
  return als.getStore()?.instanceToken ?? null;
}

// Workspace corrente: o do contexto, se houver; senão o PRIMÁRIO (admin/schedulers/boot).
export function getCurrentWorkspace(): string {
  return als.getStore()?.wsId ?? getPrimaryWorkspace();
}

// true se estamos DENTRO de um contexto de workspace (request/inbound embrulhado). Útil pra asserts
// fail-closed em caminhos que NUNCA deveriam rodar sem contexto.
export function hasWorkspaceContext(): boolean {
  return als.getStore() !== undefined;
}
