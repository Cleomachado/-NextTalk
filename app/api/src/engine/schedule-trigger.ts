// Gatilho de AGENDAMENTO (cron): a automação dispara sozinha, num horário/recorrência, pra um
// destino FIXO (telefone ou grupo) configurado no próprio gatilho — sem webhook, sem lead.
// É o equivalente do "Schedule Trigger" do n8n (pedido do dono, 25/08): quando o painel importa
// um workflow do n8n que usa esse nó, o fluxo já nasce com o mesmo agendamento aqui.
//
// Espelha o agendador de lembretes (mesmo TZ, mesmo tick 60s, mesmo dedup por minuto, mesma regra
// de "sem conta → não envia") — só troca "horário fixo/dias da semana" por CRON de verdade, que é
// o que o n8n exporta de fato.
import type { WhatsAppGateway } from "../gateway/types.js";
import { runWithWorkspace } from "../workspace-context.js";
import { scanConfig } from "../config-store.js";
import { loadAutomations } from "../automations.js";
import { runAutomationsFor } from "./runner.js";
import type { Automation } from "./runner.js";
import type { NormalizedEvent } from "../webhooks/canonical.js";

const TZ = "America/Araguaina"; // mesmo fuso do resto do produto (ver reminders.ts)

function agoraEm(tz: string): { minuto: number; hora: number; dia: number; mes: number; dow: number; chaveMinuto: string } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minuto: Number(get("minute")), hora: Number(get("hour")), dia: Number(get("day")),
    mes: Number(get("month")), dow: DOW.indexOf(get("weekday")),
    chaveMinuto: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`,
  };
}

// Um campo do cron ("*", "5", "*/15", "1,3,5", "1-5", ou combinação com vírgula) casa com o valor?
function campoCronBate(campo: string, valor: number, max: number): boolean {
  if (campo === "*") return true;
  return campo.split(",").some((parte) => {
    const [faixa, passoStr] = parte.split("/");
    const passo = passoStr ? Number(passoStr) : 1;
    if (!Number.isFinite(passo) || passo <= 0) return false;
    let de = 0, ate = max;
    if (faixa !== "*") {
      if (faixa.includes("-")) {
        const [a, b] = faixa.split("-").map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        de = a; ate = b;
      } else {
        const n = Number(faixa);
        if (!Number.isFinite(n)) return false;
        de = ate = n;
      }
    }
    return valor >= de && valor <= ate && (valor - de) % passo === 0;
  });
}

// Cron de 5 campos: minuto hora dia-do-mês mês dia-da-semana (aceita 6 campos soltando o de
// segundos na frente, que é o que o "Custom (Cron)" do n8n às vezes inclui).
export function cronValido(expr: string): boolean {
  const partes = String(expr ?? "").trim().split(/\s+/);
  return partes.length === 5 || partes.length === 6;
}

export function cronEstaNaHora(expr: string, now: { minuto: number; hora: number; dia: number; mes: number; dow: number }): boolean {
  const partes = String(expr ?? "").trim().split(/\s+/);
  const campos = partes.length === 6 ? partes.slice(1) : partes;
  if (campos.length !== 5) return false;
  const [min, hr, dia, mes, dow] = campos;
  if (!campoCronBate(min, now.minuto, 59) || !campoCronBate(hr, now.hora, 23) || !campoCronBate(mes, now.mes, 12)) return false;
  // Regra clássica do cron: se AMBOS dia-do-mês e dia-da-semana estão restritos (≠ "*"), o
  // disparo vale pra qualquer um dos dois bater (OR), não pros dois juntos (AND).
  if (dia === "*" || dow === "*") return campoCronBate(dia, now.dia, 31) && campoCronBate(dow, now.dow, 6);
  return campoCronBate(dia, now.dia, 31) || campoCronBate(dow, now.dow, 6);
}

const fired = new Map<string, string>(); // "wsId:automationId" → "AAAA-MM-DD HH:MM" da última chegada
const ultimoDisparo = new Map<string, string>(); // idem, mas NUNCA é podado — é o que o diagnóstico mostra

// 🔎 RAIO-X dos agendamentos de TODOS os workspaces — o que o /admin/agendamentos devolve.
// Nasceu do teste de um cliente (02/09): "foi não" e ninguém conseguia dizer se o fluxo estava em
// rascunho, se o cron não batia, se o número estava fora ou se o cron nem chegou a rodar.
export function raioXAgendamentos(
  resolveGw: (account: string | undefined, wsId: string) => WhatsAppGateway | null,
): { agora: string; fuso: string; itens: any[] } {
  const now = agoraEm(TZ);
  const itens: any[] = [];
  let entradas: Array<{ wsId: string; value: any[] }> = [];
  try { entradas = scanConfig<any[]>("automations"); } catch {}
  for (const { wsId, value } of entradas) {
    if (!Array.isArray(value)) continue;
    for (const a of value as Automation[]) {
      if (a.trigger !== "schedule") continue;
      const cron = String((a as any).scheduleCron ?? "").trim();
      itens.push({
        ws: wsId, id: a.id, nome: a.name ?? a.id,
        publicado: a.enabled !== false,
        cron, cronValido: cronValido(cron), bateAgora: cronValido(cron) && cronEstaNaHora(cron, now),
        destino: String((a as any).scheduleTarget ?? "") || "(vem dos passos)",
        conta: (a as any).scheduleAccount ?? "(padrão)",
        numeroConectado: !!resolveGw((a as any).scheduleAccount || (a as any).conta, wsId),
        ultimoDisparo: ultimoDisparo.get(wsId + ":" + a.id) ?? null,
      });
    }
  }
  return { agora: now.chaveMinuto, fuso: TZ, itens };
}

export function startScheduleTriggerScheduler(
  log: (m: string) => void = console.log,
  resolveGw: (account: string | undefined, wsId: string) => WhatsAppGateway | null,
): void {
  const tick = () => {
    let entradas: Array<{ wsId: string; value: any[] }>;
    try { entradas = scanConfig<any[]>("automations"); } catch { return; }
    let now: ReturnType<typeof agoraEm>;
    try { now = agoraEm(TZ); } catch { return; }
    if (fired.size > 5000) fired.clear(); // poda: só interessa o minuto corrente

    for (const { wsId, value } of entradas) {
      if (!Array.isArray(value) || !value.length) continue;
      let disparadosNoTick = 0;
      for (const a of value.slice(0, 200) as Automation[]) {
        if (a.trigger !== "schedule") continue;
        const cron = String((a as any).scheduleCron ?? "").trim();
        // Destino VAZIO é normal: o gatilho só marca a hora (igual ao Schedule Trigger do n8n) e
        // quem recebe vem dos passos — buscar cobranças vencidas, separar a lista, o Loop falar
        // com cada cliente. Nesse caso o fluxo roda sem "dono": os passos que MANDAM mensagem
        // direto são pulados com aviso no log (runStep), os de máquina rodam normalmente.
        const alvo = String((a as any).scheduleTarget ?? "").trim();
        if (!cron || !cronValido(cron) || !cronEstaNaHora(cron, now)) continue;

        const chave = wsId + ":" + a.id;
        if (fired.get(chave) === now.chaveMinuto) continue; // não dispara 2x no mesmo minuto
        fired.set(chave, now.chaveMinuto);

        // Bateu a hora mas está em RASCUNHO: dizer isso no log é o que separa "o cron não rodou"
        // de "rodou e pulou de propósito" — a pessoa salvou e achou que tinha publicado.
        if (a.enabled === false) { log(`⏸️  agendamento "${a.name || a.id}" (ws ${wsId.slice(0, 8)}) bateu a hora (${cron}) mas está em RASCUNHO — só dispara publicado`); continue; }

        const gw = resolveGw((a as any).scheduleAccount || (a as any).conta, wsId);
        if (!gw) { log(`🚫 agendamento "${a.name || a.id}": workspace ${wsId.slice(0, 8)} sem número conectado — NÃO enviei`); continue; }
        ultimoDisparo.set(chave, now.chaveMinuto);
        if (++disparadosNoTick > 20) { log(`⏰ ws ${wsId.slice(0, 8)}: teto de 20 agendamentos por minuto atingido`); break; }

        log(`⏰ disparando agendamento "${a.name || a.id}" (ws ${wsId.slice(0, 8)}) → ${alvo || "sem destino fixo (quem recebe vem dos passos)"}`);
        void runWithWorkspace(wsId, async () => {
          const auto = loadAutomations().find((x) => x.id === a.id); // versão mais recente salva
          if (!auto) return;
          const ev: NormalizedEvent = {
            platform: "schedule", event: "schedule", eventId: "sch-" + Date.now() + "-" + (alvo || "sem-destino"),
            contact: { phone: alvo, name: alvo, firstName: "" }, raw: {},
          };
          try { await runAutomationsFor(ev, gw, [auto]); }
          catch (e: any) { log(`❌ agendamento "${a.name || a.id}" falhou: ${e.message}`); }
        });
      }
    }
  };
  // Primeiro tick JÁ, não daqui a 60s. Com o intervalo puro, um deploy que sobe às HH:MM:10 só
  // olha o relógio em HH:MM+1 — e o minuto do deploy passa em branco. Foi exatamente o teste das
  // 20:22 de um cliente (02/09): imagem pronta 20:20, contêiner de pé ~20:22, primeiro tick 20:23.
  setTimeout(tick, 2_000);
  setInterval(tick, 60_000);
  let ativos = 0;
  try { for (const { value } of scanConfig<any[]>("automations")) ativos += (Array.isArray(value) ? value : []).filter((a: any) => a.trigger === "schedule" && a.enabled !== false).length; } catch {}
  log(`⏰ agendador de gatilho por horário ligado (todos os workspaces) · ${ativos} agendamento(s) publicado(s) · fuso ${TZ}`);
}
