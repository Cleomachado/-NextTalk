// Lembretes agendados: dispara mensagem/mídia (ou INICIA um fluxo) num horário/recorrência.
// Espelha o agendador do resumo de grupo (tick 60s + hora local via Intl). TZ do dono: Araguaína.
import type { MediaType, WhatsAppGateway } from "../gateway/types.js";
import { runWithWorkspace } from "../workspace-context.js";
import { getCached, scanConfig } from "../config-store.js";
import { loadAutomations } from "../automations.js";
import { runAutomationsFor } from "./runner.js";
import type { NormalizedEvent } from "../webhooks/canonical.js";

export interface Reminder {
  id: string;
  name?: string;
  enabled: boolean;
  schedule: { type: "once" | "daily" | "weekly"; time: string; days?: number[]; date?: string };
  target: string; // número (com DDD) ou grupo @g.us
  message: string;
  mediaType?: string; // image | video | audio | ptt (vazio = só texto)
  mediaFile?: string; // URL ou data URI
  flowId?: string; // se setado, INICIA esse fluxo em vez de mandar a mensagem
  account?: string; // conta (id lite-xxxx ou "lite") que envia o lembrete
  lastFired?: string; // informativo (dedup real é em memória)
  // AVISO À EQUIPE criado pelo "Agendar → Avisar alguém" do chat: o lembrete vai pro número da
  // equipe, mas é SOBRE esta conversa (telefone/grupo) — é assim que ele aparece na faixa dela.
  sobre?: string;
}

const TZ = "America/Araguaina";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function loadReminders(): Reminder[] {
  const r = getCached<Reminder[]>("reminders");
  return Array.isArray(r) ? r : [];
}

// Agora no fuso do produto (Araguaína) — usado pelo agendador e pela captura de lembrete por mensagem.
export function nowAraguaina(): { hhmm: string; ymd: string; dow: number } {
  return nowInTz(TZ);
}

function nowInTz(tz: string): { hhmm: string; ymd: string; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${get("hour")}:${get("minute")}`, dow: DOW.indexOf(get("weekday")) };
}

function isDue(r: Reminder, now: { hhmm: string; ymd: string; dow: number }): boolean {
  if (r.schedule.time !== now.hhmm) return false;
  switch (r.schedule.type) {
    case "once": return r.schedule.date === now.ymd;
    case "daily": return true;
    case "weekly": return Array.isArray(r.schedule.days) && r.schedule.days.includes(now.dow);
    default: return false;
  }
}

export async function runReminder(r: Reminder, gw: WhatsAppGateway, log: (m: string) => void = console.log): Promise<void> {
  const to = (r.target || "").trim();
  if (!to) return;
  try {
    if (r.flowId) {
      const auto = loadAutomations().find((a) => a.id === r.flowId);
      if (!auto) { log(`⏰ lembrete "${r.name}": fluxo ${r.flowId} não existe`); return; }
      const ev: NormalizedEvent = {
        platform: "lite", event: auto.trigger, eventId: "rem-" + Date.now() + "-" + to,
        contact: { phone: to, name: to, firstName: "" }, raw: {},
      };
      await runAutomationsFor(ev, gw, [auto]);
      log(`⏰ lembrete "${r.name}" → iniciou fluxo "${auto.id}" p/ ${to}`);
      return;
    }
    if (r.mediaFile && r.mediaFile.trim()) {
      await gw.sendMedia({ to, type: (r.mediaType || "image") as MediaType, file: r.mediaFile.trim(), caption: r.message || undefined });
    } else {
      await gw.sendText(to, r.message);
    }
    log(`⏰ lembrete "${r.name}" enviado a ${to}`);
  } catch (e: any) {
    log(`❌ lembrete "${r.name}" falhou: ${e.message}`);
  }
}

const fired = new Map<string, string>(); // id -> "AAAA-MM-DD HH:MM" da última ocorrência disparada

// resolveGw(account) devolve o gateway da CONTA do lembrete (envia pelo número certo). Se não vier
// ou devolver null, cai no gateway padrão (conta primária). Assim o lembrete fica ATRELADO à conta.
export function startReminderScheduler(
  gw: WhatsAppGateway,
  log: (m: string) => void = console.log,
  resolveGw?: (account: string | undefined, wsId: string) => WhatsAppGateway | null,
): void {
  // ★ MULTI-TENANT (06/08): o tick varre os lembretes de TODOS os workspaces — antes só o
  // primário rodava, e o "Agendar mensagem" do cliente salvaria um lembrete que nunca dispara.
  const tick = () => {
    let entradas: Array<{ wsId: string; value: Reminder[] }>;
    try { entradas = scanConfig<Reminder[]>("reminders"); } catch { return; }
    let now: { hhmm: string; ymd: string; dow: number };
    try { now = nowInTz(TZ); } catch { return; }
    // Poda do dedup: só interessa o dia corrente (o mapa crescia pra sempre).
    if (fired.size > 5000) fired.clear();
    for (const { wsId, value } of entradas) {
      if (!Array.isArray(value) || !value.length) continue;
      let disparadosNoTick = 0;
      for (const r of value.slice(0, 200)) { // teto por workspace: um tenant não degrada os outros
        if (!r.enabled || !isDue(r, now)) continue;
        const chave = wsId + ":" + r.id;
        const key = `${now.ymd} ${now.hhmm}`;
        if (fired.get(chave) === key) continue; // não dispara 2x no mesmo minuto
        // Resolve o gateway da CONTA do lembrete NO workspace dele. "resolver devolveu null" =
        // conta que não existe mais → PULA (nunca envia pela conta errada / de outro workspace).
        let rgw: WhatsAppGateway;
        if (resolveGw) {
          const g = resolveGw(r.account, wsId);
          if (!g) {
            fired.set(chave, key);
            log(`⏰ lembrete "${r.name || r.id}" pulado: conta ${r.account ?? "(padrão)"} indisponível no workspace ${wsId.slice(0, 8)}`);
            continue;
          }
          rgw = g;
        } else {
          rgw = gw;
        }
        fired.set(chave, key);
        if (++disparadosNoTick > 20) { log(`⏰ ws ${wsId.slice(0, 8)}: teto de 20 lembretes por minuto atingido`); break; }
        log(`⏰ disparando lembrete "${r.name || r.id}" (ws ${wsId.slice(0, 8)}${r.account ? ` · conta ${r.account}` : ""})`);
        void runWithWorkspace(wsId, () => runReminder(r, rgw, log));
      }
    }
  };
  setInterval(tick, 60_000);
  log("⏰ agendador de lembretes ligado (todos os workspaces)");
}
