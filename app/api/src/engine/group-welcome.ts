import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { jitterDelay } from "../config.js";
import type { WhatsAppGateway } from "../gateway/types.js";
import { isOptedOut } from "../repo.js";
import { getCached } from "../config-store.js";

export interface GroupWelcomeConfig {
  enabled: boolean;
  message: string;
  groups: string[]; // JIDs específicos (NUNCA "*" — ver groupMatches)
  delayMs?: number;
}

// Prefere a config salva no banco (editada pelo painel); se não houver, cai no JSON
// versionado (default/seed). O fallback de arquivo é o comportamento original.
export function loadGroupWelcome(): GroupWelcomeConfig {
  const fromStore = getCached<GroupWelcomeConfig>("group-welcome");
  if (fromStore) return fromStore;
  const path = fileURLToPath(new URL("../../group-welcome.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Evita mandar boas-vindas duas vezes (webhooks podem repetir). Fase 2b: mover pro banco.
const welcomed = new Set<string>();

// Segurança: SÓ dispara nos JIDs explicitamente listados. Sem wildcard "*" —
// o número está em vários grupos de terceiros, então "todos" seria spam/ban.
function groupMatches(cfg: GroupWelcomeConfig, groupJid: string): boolean {
  return cfg.groups.includes(groupJid);
}

// Para cada pessoa que ENTROU no grupo, manda uma mensagem de boas-vindas NO PRIVADO.
export async function handleGroupJoins(
  groupJid: string,
  phones: string[],
  gw: WhatsAppGateway,
  log: (m: string) => void = console.log,
): Promise<void> {
  const cfg = loadGroupWelcome();
  if (!cfg.enabled) return;
  if (!groupMatches(cfg, groupJid)) {
    log(`grupo ${groupJid} fora da config de boas-vindas — ignorado`);
    return;
  }
  for (const phone of phones) {
    const key = `${groupJid}:${phone}`;
    if (welcomed.has(key)) continue;
    if (await isOptedOut(phone)) {
      log(`🚫 ${phone} optou por sair — boas-vindas puladas`);
      continue;
    }
    welcomed.add(key);
    try {
      await gw.sendPresence(phone, "composing", 2000);
      log(`👋 boas-vindas no privado → ${phone} (grupo ${groupJid})`);
      await gw.sendText(phone, cfg.message, 500);
    } catch (e: any) {
      log(`❌ boas-vindas falhou p/ ${phone}: ${e.message}`);
      welcomed.delete(key); // permite tentar de novo num próximo evento
    }
    await sleep(cfg.delayMs ?? jitterDelay());
  }
}
