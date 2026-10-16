// Configs editáveis pelo painel (boas-vindas de grupo, resumo, fluxos, credenciais, instâncias)
// vivem no Postgres (app_config) — não se perdem no redeploy.
//
// ★ MULTI-TENANT (Fase 2): a config é POR WORKSPACE. O cache em memória é
// Map<workspaceId, Map<key,value>>. As funções SEM workspace (getCached/saveConfig) usam o
// workspace PRIMÁRIO (o do dono), resolvido no boot — assim o single-tenant atual NÃO muda.
// As variantes *For(workspaceId, …) são o que o roteamento por instância (Fase 4) vai usar.
import { getConfig, setConfig, getAllConfig } from "./repo.js";
import { getPrimaryWorkspace, setPrimaryWorkspace } from "./tenancy.js";
import { getCurrentWorkspace } from "./workspace-context.js";
export { setPrimaryWorkspace, getPrimaryWorkspace } from "./tenancy.js";

export const CONFIG_KEYS = ["group-welcome", "group-summary", "automations", "meta-official", "lite-instances", "reminders", "quick-replies", "ranking-prizes", "number-limit", "openai-key", "groups-list", "bot-allowlist"] as const;

const cache = new Map<string, Map<string, unknown>>(); // workspaceId → (key → value)
function wsCache(wsId: string): Map<string, unknown> {
  let m = cache.get(wsId);
  if (!m) { m = new Map(); cache.set(wsId, m); }
  return m;
}

// Leitura síncrona pro hot path. null = sem valor → o loader usa o default de arquivo.
export function getCachedFor<T>(wsId: string, key: string): T | null {
  return (cache.get(wsId)?.get(key) as T) ?? null;
}
// Segue o workspace CORRENTE (contexto do request/inbound). Sem contexto → primário (idêntico a antes).
export function getCached<T>(key: string): T | null { return getCachedFor<T>(getCurrentWorkspace(), key); }

// Recarrega o cache do banco (todos os workspaces). Roda no boot e a cada 15s.
export async function refreshConfigCache(): Promise<void> {
  try {
    const rows = await getAllConfig();
    const next = new Map<string, Map<string, unknown>>();
    for (const r of rows) {
      const ws = (r.workspace_id || getPrimaryWorkspace()); // linhas antigas (workspace_id null) caem no primário
      let m = next.get(ws);
      if (!m) { m = new Map(); next.set(ws, m); }
      m.set(r.key, r.value);
    }
    cache.clear();
    for (const [ws, m] of next) cache.set(ws, m);
  } catch {
    /* mantém o cache anterior */
  }
}

// Varre TODOS os workspaces atrás de uma config — é o que roteia o webhook da Meta pro workspace
// dono do número (Fase 4b): verifyToken no handshake e phoneNumberId nos eventos.
export function scanConfig<T>(key: string): Array<{ wsId: string; value: T }> {
  const out: Array<{ wsId: string; value: T }> = [];
  for (const [ws, m] of cache) {
    const v = m.get(key);
    if (v != null) out.push({ wsId: ws, value: v as T });
  }
  return out;
}

// Salva no banco E aplica no cache na hora (efeito imediato, sem esperar o tick).
export async function saveConfigFor(wsId: string, key: string, value: unknown): Promise<void> {
  await setConfig(key, value, wsId); // persiste primeiro; se falhar, propaga o erro pro endpoint
  wsCache(wsId).set(key, value);
}
export async function saveConfig(key: string, value: unknown): Promise<void> { return saveConfigFor(getCurrentWorkspace(), key, value); }

// Liga o refresher periódico (mantém o cache em dia se a config mudar por outra via).
export function startConfigRefresher(log: (m: string) => void = console.log): void {
  setInterval(() => {
    refreshConfigCache().catch(() => {});
  }, 15_000);
  log("🔧 config-store: cache de configs (por workspace) ligado (refresh a cada 15s)");
}
