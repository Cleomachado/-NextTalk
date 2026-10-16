// Captura de LEMBRETE por mensagem (nó "reminder" do builder).
// Fluxo: gatilho (ex.: #lembrete) → nó reminder responde "estou na escuta" e PAUSA (flow_pending
// com a variável especial __lembrete__) → a PRÓXIMA mensagem (texto ou áudio transcrito, inclusive
// fromMe — é o dono ditando pra si mesmo) é interpretada pela IA (dia/hora/destino/mensagem) e vira
// um Lembrete salvo na config "reminders" (aparece em /lembretes e o agendador dispara na hora).
import type { WhatsAppGateway } from "../gateway/types.js";
import { parseReminderText, type ParsedReminder } from "./ai.js";
import { nowAraguaina, type Reminder } from "./reminders.js";
import { getCached, saveConfig, refreshConfigCache } from "../config-store.js";
import { clearPending, searchContactsByName } from "../repo.js";
import { noteBotEcho } from "./bot-echo.js";

// Variável-sentinela da pendência: identifica que a espera é de LEMBRETE (aceita fromMe).
export const REMINDER_VAR = "__lembrete__";

// Loop-breaker: se o parse falhar MUITAS vezes seguidas num chat, é sinal de eco/loop que a
// supressão exata não pegou (ex.: UazAPI reformatou o texto) → desiste da escuta em vez de repetir
// HELP + IA pra sempre. Zera ao entender (sucesso/cancelar) e ao (re)iniciar a escuta.
const failCount = new Map<string, { n: number; at: number }>();
const MAX_FAILS = 4;
const FAIL_TTL = 60 * 60_000; // falhas velhas (>1h) contam como sessão nova

// Zera o contador ao (re)iniciar uma escuta — chamado pelo nó reminder do runner.
export function resetReminderFails(phone: string): void {
  failCount.delete(phone);
}
function bumpFail(phone: string): number {
  if (failCount.size > 500) for (const [k, v] of failCount) if (Date.now() - v.at > FAIL_TTL) failCount.delete(k);
  const cur = failCount.get(phone);
  const n = (cur && Date.now() - cur.at < FAIL_TTL ? cur.n : 0) + 1;
  failCount.set(phone, { n, at: Date.now() });
  return n;
}

// Append ATÔMICO na lista global "reminders": serializa TODAS as escritas da captura numa fila
// (motor = 1 réplica), fechando a corrida read-modify-write entre telefones diferentes.
let remChain: Promise<void> = Promise.resolve();
function appendReminderAtomic(rem: Reminder): Promise<void> {
  remChain = remChain.catch(() => {}).then(async () => {
    await refreshConfigCache().catch(() => {});
    const list = getCached<Reminder[]>("reminders") ?? [];
    await saveConfig("reminders", [...list, rem]);
  });
  return remChain;
}

const WEEKDAY_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const CANCEL_WORDS = ["cancelar", "cancela", "deixa", "esquece"];

const HELP =
  "Não consegui entender tudo. Me manda de novo com: *dia*, *hora*, *pra quem* (número, nome do grupo ou da pessoa — ou \"me lembra\" pra você mesmo) e a *mensagem*.\n" +
  "Ex.: \"amanhã às 9h manda 'reunião às 10' pro grupo Equipe\" · (responda *cancelar* pra desistir)";

// normaliza número BR ditado (com/sem 55/0/formatação) → formato WhatsApp
function normPhone(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

function fmtWhen(p: ParsedReminder): string {
  const t = p.time ?? "?";
  if (p.tipo === "daily") return `todo dia às ${t}`;
  if (p.tipo === "weekly") {
    const dias = (p.days ?? []).map((n) => WEEKDAY_PT[n] ?? String(n)).join(", ");
    return `toda ${dias} às ${t}`;
  }
  const [y, m, d] = String(p.date ?? "").split("-");
  return y ? `${d}/${m}/${y} às ${t}` : `às ${t}`;
}

export async function resumeReminderCapture(
  phone: string,
  text: string,
  gw: WhatsAppGateway,
  log: (m: string) => void = console.log,
): Promise<void> {
  const say = (msg: string) => {
    noteBotEcho(phone, msg); // registra ANTES de enviar (o eco pode voltar rápido)
    return gw.sendText(phone, msg).catch((e) => log(`lembrete-captura say: ${e?.message}`));
  };
  // "não entendi" com loop-breaker: N falhas seguidas → encerra a escuta (protege contra eco/loop).
  const fail = async (msg: string) => {
    if (bumpFail(phone) >= MAX_FAILS) {
      failCount.delete(phone);
      await clearPending(phone);
      await say("Vou encerrar a escuta do lembrete por agora — não consegui entender. Quando quiser, é só me chamar de novo. 👍");
      return;
    }
    await say(msg);
  };

  if (CANCEL_WORDS.includes(text.trim().toLowerCase())) {
    failCount.delete(phone);
    await clearPending(phone);
    await say("Ok, lembrete cancelado. 👍");
    return;
  }

  // grupos: nomes pro parser + resolução nome→jid (LITE; na API oficial não há grupos → lista vazia)
  let groups: Array<{ jid: string; name: string }> = [];
  try {
    groups = (await gw.listGroups()).map((g) => ({ jid: g.jid, name: g.name || g.jid }));
  } catch {
    /* sem grupos (ex.: gateway Meta) — segue só com número/contato */
  }

  const now = nowAraguaina();
  const parsed = await parseReminderText(text, {
    ymd: now.ymd,
    hhmm: now.hhmm,
    weekdayPt: WEEKDAY_PT[now.dow] ?? "",
    groupNames: groups.map((g) => g.name),
  });

  if (!parsed) {
    // IA indisponível (sem chave/timeout) — honesto: não dá pra entender linguagem natural sem ela.
    await fail("⚠️ Não consegui processar agora (IA indisponível). Tenta de novo em instantes, ou crie o lembrete direto no painel, em *Lembretes*.");
    return;
  }

  // ── valida o JSON da IA (o agendador compara strings exatas — dado torto nunca dispara) ──
  const tipo: ParsedReminder["tipo"] = parsed.tipo === "daily" || parsed.tipo === "weekly" ? parsed.tipo : "once";
  const timeM = /^(\d{1,2}):(\d{2})$/.exec(String(parsed.time ?? "").trim());
  const hh = timeM ? Number(timeM[1]) : NaN;
  const mm = timeM ? Number(timeM[2]) : NaN;
  const timeOk = Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  const time = timeOk ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : "";
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date ?? ""));
  const days = (parsed.days ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  if (!parsed.ok || !time || !parsed.mensagem?.trim()) {
    await fail(parsed.motivo ? `Faltou: ${parsed.motivo}.\n\n${HELP}` : HELP);
    return;
  }
  if (tipo === "weekly" && days.length === 0) {
    await fail("Pra lembrete semanal, me diz o(s) dia(s) da semana (ex.: 'toda segunda às 9h').");
    return;
  }
  const parsedV: ParsedReminder = { ...parsed, tipo, time, days, date: dateOk ? parsed.date : now.ymd };

  // ── resolve o destino ──
  let target = "";
  let targetLabel = "";
  const kind = parsedV.destinoTipo ?? "mim";
  if (kind === "mim") {
    target = phone;
    targetLabel = "você mesmo";
  } else if (kind === "numero") {
    target = normPhone(parsedV.destino ?? "");
    if (target.length < 12) {
      await fail(`O número "${parsedV.destino ?? ""}" ficou incompleto. Manda com DDD (ex.: 11 98983-3335).`);
      return;
    }
    targetLabel = target;
  } else if (kind === "grupo") {
    const q = (parsedV.destino ?? "").trim().toLowerCase();
    if (!q) {
      await fail("Qual grupo? Me manda o nome como aparece na sua lista de grupos.");
      return;
    }
    const g = groups.find((x) => x.name.toLowerCase() === q) ?? groups.find((x) => x.name.toLowerCase().includes(q));
    if (!g) {
      await fail(`Não achei o grupo "${parsedV.destino ?? ""}" nos seus grupos. Confere o nome e manda de novo.`);
      return;
    }
    target = g.jid;
    targetLabel = `grupo "${g.name}"`;
  } else {
    // contato pelo nome → busca no CRM
    const q = (parsedV.destino ?? "").trim();
    if (!q) {
      await fail("Pra quem é o lembrete? Me manda o número (com DDD) ou o nome de um contato/grupo.");
      return;
    }
    const found = await searchContactsByName(q);
    if (!found.length) {
      await fail(`Não achei "${q}" nos seus contatos. Manda o número com DDD, ou o nome como está em *Contatos*.`);
      return;
    }
    target = found[0].phone;
    targetLabel = `${found[0].name ?? q} (${found[0].phone})`;
  }

  // ── "uma vez" no passado → pede outro horário (o agendador nunca dispararia) ──
  if (parsedV.tipo === "once") {
    const when = `${parsedV.date ?? now.ymd} ${parsedV.time}`;
    const nowKey = `${now.ymd} ${now.hhmm}`;
    if (when <= nowKey) {
      await fail(`Esse horário (${fmtWhen(parsedV)}) já passou. ⏰ Me manda um dia/hora futuros.`);
      return;
    }
  }

  // ── salva na config "reminders" (mesma lista da tela Lembretes; conta primária por ora) ──
  const rem: Reminder = {
    id: "rem-cap-" + Date.now(),
    name: (parsedV.mensagem ?? "").slice(0, 40) || "Lembrete por mensagem",
    enabled: true,
    schedule: {
      type: parsedV.tipo as Reminder["schedule"]["type"],
      time: parsedV.time!,
      ...(parsedV.tipo === "weekly" ? { days } : {}),
      ...(parsedV.tipo !== "daily" && parsedV.tipo !== "weekly" ? { date: parsedV.date ?? now.ymd } : {}),
    },
    target,
    message: parsedV.mensagem!.trim(),
    account: "lite",
  };
  // append ATÔMICO (fila global) — fecha a corrida entre capturas simultâneas de telefones diferentes
  await appendReminderAtomic(rem);
  failCount.delete(phone);
  await clearPending(phone);
  log(`⏰ lembrete capturado por mensagem: ${fmtWhen(parsedV)} → ${targetLabel}`);
  await say(`✅ Lembrete salvo!\n📅 ${fmtWhen(parsedV)}\n📨 Para: ${targetLabel}\n💬 "${rem.message}"\n\nEle aparece no painel em *Lembretes* (dá pra editar ou excluir lá).`);
}
