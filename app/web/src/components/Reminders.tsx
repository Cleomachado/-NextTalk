"use client";

import { useEffect, useState } from "react";
import { jget, jsend, Reminder, Automation, WEEKDAYS } from "@/lib/client";
import { useGroupList } from "@/components/groups/useGroupList";
import { GroupSelect } from "@/components/GroupSelect";
import { SaveBar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAccounts } from "@/components/accounts";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Novo lembrete já vem com HOJE e AGORA (Admin troca depois se quiser), atrelado à conta ativa.
function newReminder(account?: string): Reminder {
  const d = new Date();
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return { id: "rem-" + Date.now(), name: "", enabled: true, schedule: { type: "once", time, date }, target: "", message: "", account };
}

// Normaliza o número BR: aceita com/sem +55, DDI 55, DDD com/sem ( ) e com/sem traços/espaços.
// Grupo (@g.us) e vazio passam intactos.
function normalizeTarget(raw: string): string {
  const t = (raw || "").trim();
  if (!t || t.includes("@g.us")) return t;
  let d = t.replace(/\D/g, "").replace(/^0+/, ""); // só dígitos, tira 0 de operadora/DDD
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d; // já tem DDI 55
  if (d.length === 10 || d.length === 11) return "55" + d; // DDD + número → adiciona 55
  return d; // internacional/incompleto — deixa como está
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Quais lembretes ATIVOS caem neste dia (once = data exata; daily = todo dia; weekly = dia da semana).
function remindersOnDay(list: Reminder[], d: Date): Reminder[] {
  const key = ymd(d);
  const dow = d.getDay();
  return list.filter((r) =>
    r.enabled &&
    (r.schedule.type === "daily" ||
      (r.schedule.type === "weekly" && (r.schedule.days ?? []).includes(dow)) ||
      (r.schedule.type === "once" && r.schedule.date === key)),
  );
}

// Calendário mensal (estilo Google Calendar): começa no mês de hoje, navega pra frente/trás.
function RemindersCalendar({ list }: { list: Reminder[] }) {
  const today = new Date();
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const todayKey = ymd(today);

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="card">
      <div className="card-pad">
        <div className="cal-head">
          <button className="btn" onClick={() => shift(-1)}>‹</button>
          <div className="cal-title">{MONTHS[view.m]} {view.y}</div>
          <button className="btn" onClick={() => shift(1)}>›</button>
          <button className="btn" style={{ marginLeft: "auto", fontSize: 12.5 }} onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}>Hoje</button>
        </div>
        <div className="cal-grid cal-dows">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell empty" />;
            const items = remindersOnDay(list, d);
            const isToday = ymd(d) === todayKey;
            return (
              <div key={i} className={"cal-cell" + (isToday ? " today" : "")}>
                <div className="cal-day">{d.getDate()}</div>
                {items.slice(0, 3).map((r) => (
                  <div key={r.id} className="cal-item" title={`${r.schedule.time} · ${r.name || "(sem nome)"}`}>
                    <span className="cal-dot" />{r.schedule.time} {r.name || "lembrete"}
                  </div>
                ))}
                {items.length > 3 && <div className="cal-more">+{items.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RemindersView() {
  const [list, setList] = useState<Reminder[] | null>(null);
  const [autos, setAutos] = useState<Automation[]>([]);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const { groupList, refresh: refreshGroups, refreshing: refreshingGroups, groupsErr } = useGroupList();
  const { activeAcct } = useAccounts();
  const acctId = activeAcct?.id ?? "lite"; // "lite" = conta primária (lembretes antigos sem conta caem aqui)

  useEffect(() => {
    jget("/api/reminders").then((d) => setList(d.reminders ?? [])).catch((e) => setErr(e.message));
    jget("/api/automations").then((d) => setAutos(d.automations ?? [])).catch(() => {});
  }, []);

  async function save() {
    if (!list) return;
    setStatus("salvando…");
    // normaliza os números (aceita formatação). Lembretes SEM conta são antigos → primária "lite"
    // (NÃO usa acctId aqui pra não migrar os antigos pra conta ativa no momento do save).
    const normalized = list.map((r) => ({ ...r, target: normalizeTarget(r.target), account: r.account ?? "lite" }));
    try {
      const r = await jsend("/api/reminders", "PUT", { reminders: normalized });
      setList(r.reminders ?? normalized);
      setStatus("salvo!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!list) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  const update = (id: string, patch: Partial<Reminder>) => setList((l) => (l ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateSched = (id: string, patch: Partial<Reminder["schedule"]>) =>
    setList((l) => (l ?? []).map((r) => (r.id === id ? { ...r, schedule: { ...r.schedule, ...patch } } : r)));
  const remove = (id: string) => setList((l) => (l ?? []).filter((r) => r.id !== id));
  const add = () => setList((l) => [...(l ?? []), newReminder(acctId)]);
  // só os lembretes DESTA conta (os antigos sem conta contam como da primária "lite")
  const visible = list.filter((r) => (r.account ?? "lite") === acctId);
  const toggleDay = (r: Reminder, n: number) => {
    const days = new Set(r.schedule.days ?? []);
    if (days.has(n)) days.delete(n); else days.add(n);
    updateSched(r.id, { days: [...days].sort() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Lembretes</h2>
            <div className="muted" style={{ fontSize: 13 }}>Mensagens agendadas — pontuais ou recorrentes (horário de Araguaína).</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <SaveBar status={status} onSave={save} />
            <button className="btn ic" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={add}><Icon name="plus" size={15} />Novo lembrete</button>
          </div>
        </div>
      </div>

      <RemindersCalendar list={visible} />

      {visible.length === 0 && (
        <div className="card"><div className="card-pad muted">
          Nenhum lembrete para <b>{activeAcct?.name || "esta conta"}</b> ainda. Clique em &quot;+ Novo lembrete&quot;. Os lembretes ficam salvos no servidor e atrelados à conta selecionada aqui em cima.
        </div></div>
      )}

      {visible.map((r) => {
        const isGroup = r.target.endsWith("@g.us");
        return (
          <div key={r.id} className="card">
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input className="inp" style={{ flex: "1 1 200px" }} placeholder="Nome do lembrete" value={r.name ?? ""} onChange={(e) => update(r.id, { name: e.target.value })} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} /> Ativo
                </label>
                <button className="btn" style={{ color: "var(--crit)" }} onClick={() => remove(r.id)}>Excluir</button>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select className="inp" style={{ width: "auto" }} value={r.schedule.type} onChange={(e) => updateSched(r.id, { type: e.target.value as Reminder["schedule"]["type"] })}>
                  <option value="daily">Todo dia</option>
                  <option value="weekly">Dias da semana</option>
                  <option value="once">Uma vez</option>
                </select>
                <input className="inp" type="time" style={{ width: "auto" }} value={r.schedule.time} onChange={(e) => updateSched(r.id, { time: e.target.value })} />
                {r.schedule.type === "once" && (
                  <input className="inp" type="date" style={{ width: "auto" }} value={r.schedule.date ?? ""} onChange={(e) => updateSched(r.id, { date: e.target.value })} />
                )}
              </div>
              {r.schedule.type === "weekly" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAYS.map((d) => (
                    <button key={d.n} type="button" className={"day-chip" + ((r.schedule.days ?? []).includes(d.n) ? " on" : "")} onClick={() => toggleDay(r, d.n)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                  <GroupSelect value={isGroup ? r.target : ""} onChange={(jid) => update(r.id, { target: jid })} groupList={groupList} onRefresh={refreshGroups} refreshing={refreshingGroups} error={groupsErr} />
                </div>
                <span className="muted" style={{ fontSize: 12 }}>ou número:</span>
                <input
                  className="inp"
                  style={{ flex: "1 1 180px" }}
                  placeholder="DDD + número (ex: 11 98983-3335)"
                  title="Pode colar com ou sem +55, com ( ) e traços — a gente ajeita ao salvar"
                  value={isGroup ? "" : r.target}
                  onChange={(e) => update(r.id, { target: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" checked={!r.flowId} onChange={() => update(r.id, { flowId: "" })} /> Mandar mensagem
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="radio" checked={!!r.flowId} onChange={() => update(r.id, { flowId: autos[0]?.id ?? "" })} /> Iniciar um fluxo
                </label>
              </div>
              {r.flowId ? (
                <select className="inp" value={r.flowId} onChange={(e) => update(r.id, { flowId: e.target.value })}>
                  {autos.length === 0 && <option value="">(nenhum fluxo criado)</option>}
                  {autos.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                </select>
              ) : (
                <>
                  <textarea className="inp" rows={2} placeholder="Mensagem do lembrete…" value={r.message} onChange={(e) => update(r.id, { message: e.target.value })} />
                  <input className="inp" placeholder="(opcional) URL de mídia — imagem/áudio/vídeo" value={r.mediaFile ?? ""} onChange={(e) => update(r.id, { mediaFile: e.target.value })} />
                  {r.mediaFile?.trim() && (
                    <select className="inp" style={{ width: "auto" }} value={r.mediaType || "image"} onChange={(e) => update(r.id, { mediaType: e.target.value })}>
                      <option value="image">Imagem</option>
                      <option value="video">Vídeo</option>
                      <option value="audio">Áudio</option>
                      <option value="ptt">Áudio de voz (ptt)</option>
                    </select>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
