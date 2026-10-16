// Estado de tenancy compartilhado — SEM dependências (evita ciclo entre repo e config-store).
// primaryWs = o workspace do dono (Admin), resolvido no boot. Chamadas de repo/config sem
// workspace explícito caem nele → o single-tenant atual continua idêntico.
let primaryWs = "__primary__";
export function setPrimaryWorkspace(id: string | null | undefined): void { if (id) primaryWs = id; }
export function getPrimaryWorkspace(): string { return primaryWs; }
