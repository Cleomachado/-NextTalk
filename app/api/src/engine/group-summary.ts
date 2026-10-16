import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WhatsAppGateway } from "../gateway/types.js";
import { getGroupMessagesSince, pruneGroupMessages, recordGroupMessage } from "../repo.js";
import { summarizeGroupDay } from "../ai/claude.js";
import { getCached } from "../config-store.js";

interface SummaryGroup {
  jid: string; // ...@g.us
  name?: string; // rótulo amigável (só pra log/título)
  time: string; // "HH:MM" — horário do "fim do dia" na timezone configurada
  deliverTo?: string; // pra onde ENVIAR o resumo: vazio = o próprio grupo; senão um @g.us ou número
}

interface GroupSummaryConfig {
  enabled: boolean;
  timezone: string; // ex.: "America/Sao_Paulo"
  model?: string; // sobrescreve o modelo padrão
  maxMessages?: number; // teto de mensagens no resumo (default 500)
  minMessages?: number; // mínimo pra valer o resumo (default 1)
  groups: SummaryGroup[];
}

// Prefere a config salva no banco (editada pelo painel); senão, cai no JSON versionado.
export function loadGroupSummary(): GroupSummaryConfig {
  const fromStore = getCached<GroupSummaryConfig>("group-summary");
  if (fromStore) return fromStore;
  const path = fileURLToPath(new URL("../../group-summary.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

// Chamado pelo webhook a cada mensagem de grupo. Só guarda se o grupo estiver na config.
// loadGroupSummary lê do cache em memória do config-store (rápido), então não relê arquivo
// a cada msg — e enxerga um grupo recém-salvo na hora (sem os ~15s do antigo cache local).
// Fire-and-forget: nunca deixa o webhook travar nem estourar.
export function captureGroupMessage(msg: {
  groupJid: string;
  senderName: string;
  text: string;
}): void {
  let cfg: GroupSummaryConfig;
  try {
    cfg = loadGroupSummary();
  } catch {
    return;
  }
  if (!cfg.enabled) return;
  if (!cfg.groups.some((g) => g.jid === msg.groupJid)) return;
  recordGroupMessage(msg.groupJid, msg.senderName, msg.text).catch(() => {});
}

// Guardas em memória (reiniciam com o app — aceitável nesta fase).
const firedToday = new Map<string, string>(); // jid -> "AAAA-MM-DD" (na tz) já disparado
const lastSummaryAt = new Map<string, number>(); // jid -> epoch ms do último resumo
const summarizing = new Set<string>(); // trava anti-duplicação (clique duplo / manual + agendador)

// Hora e data locais (na timezone da config), sem depender do fuso do servidor.
function nowInTz(tz: string): { hhmm: string; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${get("hour")}:${get("minute")}` };
}

// Gera e posta o resumo do dia de UM grupo.
export async function runGroupSummary(
  group: SummaryGroup,
  gw: WhatsAppGateway,
  log: (m: string) => void = console.log,
): Promise<void> {
  const name = group.name ?? group.jid;
  // Trava anti-duplicação: se já tem um resumo desse grupo rodando (clique duplo em
  // "Resumir agora", ou manual coincidindo com o agendador), não posta duas vezes.
  if (summarizing.has(group.jid)) {
    log(`📋 resumo · ${name}: já em andamento — ignorado`);
    return;
  }
  summarizing.add(group.jid);
  try {
    const cfg = loadGroupSummary();
    // Janela: desde o último resumo (≈24h atrás no mesmo horário); na 1ª vez, últimas 24h.
    const since = lastSummaryAt.get(group.jid) ?? Date.now() - 24 * 60 * 60 * 1000;
    const rows = await getGroupMessagesSince(group.jid, since, cfg.maxMessages ?? 500);

    if (rows.length < (cfg.minMessages ?? 1)) {
      log(`📋 resumo · ${name}: só ${rows.length} mensagem(ns) — pulado`);
      lastSummaryAt.set(group.jid, Date.now());
      return;
    }

    try {
      const summary = await summarizeGroupDay(
        name,
        rows.map((r) => ({ name: r.sender_name, text: r.text })),
        { model: cfg.model },
      );
      // Destino: por padrão o próprio grupo; ou um número/outro grupo se configurado.
      const dest = group.deliverTo && group.deliverTo.trim() ? group.deliverTo.trim() : group.jid;
      await gw.sendText(dest, summary);
      log(`📋 resumo de ${name} enviado a ${dest} (${rows.length} msgs)`);
      lastSummaryAt.set(group.jid, Date.now());
      await pruneGroupMessages(2); // limpa mensagens com +2 dias
    } catch (e: any) {
      // Não marca lastSummaryAt: a janela continua aberta pra tentar de novo amanhã.
      log(`❌ resumo falhou p/ ${name}: ${e.message}`);
    }
  } finally {
    summarizing.delete(group.jid);
  }
}

// Agendador: checa a cada 60s se algum grupo bateu o horário; dispara 1x por dia.
export function startGroupSummaryScheduler(
  gw: WhatsAppGateway,
  log: (m: string) => void = console.log,
): void {
  const tick = () => {
    let cfg: GroupSummaryConfig;
    try {
      cfg = loadGroupSummary();
    } catch {
      return;
    }
    if (!cfg.enabled) return;
    let hhmm: string, ymd: string;
    try {
      ({ hhmm, ymd } = nowInTz(cfg.timezone || "America/Sao_Paulo"));
    } catch {
      // timezone inválida não pode derrubar o agendador (defesa além do validateSummary).
      log(`⏰ resumo: timezone inválida "${cfg.timezone}" — tick ignorado`);
      return;
    }
    for (const g of cfg.groups) {
      if (g.time !== hhmm) continue;
      if (firedToday.get(g.jid) === ymd) continue; // já rodou hoje
      firedToday.set(g.jid, ymd);
      runGroupSummary(g, gw, log).catch((e) => log(`resumo erro: ${e?.message ?? e}`));
    }
  };
  setInterval(tick, 60_000);
  log("⏰ agendador de resumo de grupo ligado (checa a cada 60s)");
}
