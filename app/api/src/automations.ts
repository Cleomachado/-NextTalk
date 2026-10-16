import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Automation } from "./engine/runner.js";
import { getCached, getPrimaryWorkspace } from "./config-store.js";
import { getCurrentWorkspace } from "./workspace-context.js";

// Prefere as automações salvas no banco (editadas pelo builder); senão, cai no JSON versionado.
// ⚠️ MULTI-TENANT: o seed de arquivo é o BOOTSTRAP do dono (workspace primário). Um workspace de
// CLIENTE sem config NÃO herda esse seed — começa VAZIO (senão todo cliente novo veria os fluxos-modelo).
export function loadAutomations(): Automation[] {
  const fromStore = getCached<Automation[]>("automations");
  if (Array.isArray(fromStore)) return fromStore;
  if (getCurrentWorkspace() !== getPrimaryWorkspace()) return []; // cliente sem fluxos = lista vazia
  const path = fileURLToPath(new URL("../automations.json", import.meta.url));
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data)) throw new Error("automations.json deve ser uma lista");
  return data as Automation[];
}

// Lê SEMPRE o automations.json (fluxos-modelo versionados), ignorando o store. Usado no boot pra
// semear fluxos essenciais que precisam existir mesmo quando o store já tem os fluxos do dono
// (o loadAutomations, nesse caso, nem olha o arquivo). Ver o seed idempotente no boot do server.
export function loadSeedAutomations(): Automation[] {
  const path = fileURLToPath(new URL("../automations.json", import.meta.url));
  const data = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(data) ? (data as Automation[]) : [];
}
