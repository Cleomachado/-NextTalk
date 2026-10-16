"use client";

import { useEffect, useState } from "react";
import { jget, jsend, initials, SummaryCfg, SummaryGroup, GroupListItem } from "@/lib/client";
import { Toggle, SaveBar, BackTo } from "@/components/ui";
import { AddGroup } from "@/components/groups/AddGroup";
import { useGroupList } from "@/components/groups/useGroupList";

export function SummaryAutomation() {
  const [cfg, setCfg] = useState<SummaryCfg | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const { groupList, names, addName, groupsErr } = useGroupList();

  useEffect(() => {
    jget("/api/config/summary").then(setCfg).catch((e) => setErr(e.message));
  }, []);

  if (err) return <ErrBox msg={err} />;
  if (!cfg) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  function setGroup(i: number, patch: Partial<SummaryGroup>) {
    if (cfg) setCfg({ ...cfg, groups: cfg.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  }
  function addGroup(jid: string, name: string) {
    addName(jid, name);
    if (cfg && !cfg.groups.some((g) => g.jid === jid)) setCfg({ ...cfg, groups: [...cfg.groups, { jid, name, time: "20:00" }] });
  }
  function removeGroup(i: number) {
    if (cfg) setCfg({ ...cfg, groups: cfg.groups.filter((_, j) => j !== i) });
  }
  async function save() {
    if (!cfg) return;
    setStatus("salvando…");
    try {
      const r = await jsend("/api/config/summary", "PUT", cfg);
      setCfg(r.config ?? cfg);
      setStatus("salvo!");
      setTimeout(() => setStatus(""), 2500);
    } catch (ex: any) {
      setStatus(ex.message);
    }
  }
  async function summarizeNow(g: SummaryGroup) {
    if (!g.jid) return;
    setBusy(g.jid);
    setToast("");
    try {
      await jsend("/api/summarize", "POST", { jid: g.jid, name: g.name, deliverTo: g.deliverTo });
      setToast(`Resumo de “${g.name || g.jid}” disparado — chega no destino em instantes.`);
    } catch (ex: any) {
      setToast("Falhou: " + ex.message);
    } finally {
      setBusy(null);
      setTimeout(() => setToast(""), 5000);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <BackTo href="/grupos" label="Automações de grupo" />
      <div className="card">
        <div className="card-head">
          <h3>Resumo do dia (IA)</h3>
          <span className="page-hint">{cfg.model || "Claude"}</span>
        </div>
        <div className="g-row">
          <div className="g-ava" style={{ background: "rgba(124,108,240,.14)", color: "var(--violet)" }}>IA</div>
          <div className="g-meta"><b>Resumo automático</b><div>escuta o dia · resume no horário de cada grupo</div></div>
          <div className="g-ctl"><Toggle on={cfg.enabled} onToggle={(v) => setCfg({ ...cfg, enabled: v })} /></div>
        </div>

        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--line-2)" }}>
          <div style={{ display: "flex", gap: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Timezone</label>
              <input className="inp" value={cfg.timezone} onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Modelo de IA</label>
              <input className="inp" value={cfg.model ?? ""} placeholder="claude-haiku-4-5" onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label>Grupos que recebem resumo</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cfg.groups.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Nenhum grupo ainda — adicione abaixo.</div>}
              {cfg.groups.map((g, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: "1px solid var(--line-2)", borderRadius: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div className="g-ava" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(g.name || names[g.jid] || "")}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ fontSize: 14 }}>{g.name || names[g.jid] || "Grupo"}</b>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.jid}</div>
                    </div>
                    <div className="field" style={{ width: 92 }}>
                      <label style={{ marginBottom: 3 }}>Horário</label>
                      <input className="inp" style={{ fontFamily: "var(--mono)", textAlign: "center" }} value={g.time} onChange={(e) => setGroup(i, { time: e.target.value })} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Enviar o resumo para</label>
                    <DeliverToField value={g.deliverTo} groupList={groupList} onChange={(v) => setGroup(i, { deliverTo: v })} />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy === g.jid} onClick={() => summarizeNow(g)}>
                      {busy === g.jid ? "Enviando…" : "Resumir agora"}
                    </button>
                    <button className="btn" style={{ padding: "6px 12px", fontSize: 12.5, color: "var(--crit)" }} onClick={() => removeGroup(i)}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AddGroup groupList={groupList} groupsErr={groupsErr} exclude={cfg.groups.map((g) => g.jid)} onAdd={addGroup} />

          {toast && <div className="bubble" style={{ borderRadius: 12 }}>{toast}</div>}
          <SaveBar status={status} onSave={save} />
        </div>
      </div>
    </div>
  );
}

// Destino do resumo: o próprio grupo (padrão), outro grupo, ou um número.
function DeliverToField({
  value,
  groupList,
  onChange,
}: {
  value?: string;
  groupList: GroupListItem[];
  onChange: (v: string) => void;
}) {
  const init: "self" | "group" | "phone" = !value ? "self" : value.endsWith("@g.us") ? "group" : "phone";
  const [mode, setMode] = useState(init);
  const groupVal = value && value.endsWith("@g.us") ? value : "";
  const phoneVal = value && /^\d+$/.test(value) ? value : "";

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <select
        className="inp"
        style={{ flex: 1, minWidth: 190 }}
        value={mode}
        onChange={(e) => {
          const m = e.target.value as "self" | "group" | "phone";
          setMode(m);
          onChange(m === "self" ? "" : m === "group" ? groupVal : phoneVal);
        }}
      >
        <option value="self">📍 No próprio grupo</option>
        <option value="group">📤 Enviar pra outro grupo</option>
        <option value="phone">☎️ Enviar pra um número</option>
      </select>
      {mode === "group" && (
        <select className="inp" style={{ flex: 1, minWidth: 190 }} value={groupVal} onChange={(e) => onChange(e.target.value)}>
          <option value="">— escolher grupo —</option>
          {groupList.map((x) => (
            <option key={x.jid} value={x.jid}>{x.name || x.jid}</option>
          ))}
        </select>
      )}
      {mode === "phone" && (
        <input
          className="inp"
          style={{ width: 190 }}
          placeholder="55 + DDD + número"
          value={phoneVal}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        />
      )}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="card"><div className="card-pad">
      <b style={{ color: "var(--crit)" }}>Não consegui carregar.</b>
      <div className="muted" style={{ marginTop: 4 }}>{msg}</div>
    </div></div>
  );
}
