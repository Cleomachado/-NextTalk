"use client";

import { useEffect, useState } from "react";
import { jget, jsend, initials, WelcomeCfg } from "@/lib/client";
import { Toggle, SaveBar, BackTo } from "@/components/ui";
import { AddGroup } from "@/components/groups/AddGroup";
import { useGroupList } from "@/components/groups/useGroupList";
import { Icon } from "@/components/icons";

export function WelcomeAutomation() {
  const [cfg, setCfg] = useState<WelcomeCfg | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const { groupList, names, addName, groupsErr } = useGroupList();

  useEffect(() => {
    jget("/api/config/welcome").then(setCfg).catch((e) => setErr(e.message));
  }, []);

  if (err) return <ErrBox msg={err} />;
  if (!cfg) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  function addGroup(jid: string, name: string) {
    addName(jid, name);
    if (cfg && !cfg.groups.includes(jid)) setCfg({ ...cfg, groups: [...cfg.groups, jid] });
  }
  function removeGroup(jid: string) {
    if (cfg) setCfg({ ...cfg, groups: cfg.groups.filter((g) => g !== jid) });
  }
  async function save() {
    if (!cfg) return;
    setStatus("salvando…");
    try {
      const r = await jsend("/api/config/welcome", "PUT", cfg);
      setCfg(r.config ?? cfg);
      setStatus("salvo!");
      setTimeout(() => setStatus(""), 2500);
    } catch (ex: any) {
      setStatus(ex.message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <BackTo href="/grupos" label="Automações de grupo" />
      <div className="card">
        <div className="card-head">
          <h3>Boas-vindas no grupo</h3>
          <span className="page-hint">privado de quem entra</span>
        </div>
        <div className="g-row">
          <div className="g-ava"><Icon name="handshake" size={20} /></div>
          <div className="g-meta"><b>Enviar boas-vindas</b><div>ao detectar quem entrou nos grupos abaixo</div></div>
          <div className="g-ctl"><Toggle on={cfg.enabled} onToggle={(v) => setCfg({ ...cfg, enabled: v })} /></div>
        </div>

        {cfg.groups.map((jid) => (
          <div key={jid} className="g-row">
            <div className="g-ava">{initials(names[jid] || "")}</div>
            <div className="g-meta">
              <b>{names[jid] || "Grupo"}</b>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{jid}</div>
            </div>
            <div className="g-ctl">
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12.5, color: "var(--crit)" }} onClick={() => removeGroup(jid)}>Remover</button>
            </div>
          </div>
        ))}
        {cfg.groups.length === 0 && <div className="card-pad muted" style={{ fontSize: 13 }}>Nenhum grupo selecionado — adicione abaixo.</div>}

        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 16, borderTop: "1px solid var(--line-2)" }}>
          <AddGroup groupList={groupList} groupsErr={groupsErr} exclude={cfg.groups} onAdd={addGroup} />
          <div className="field">
            <label>Mensagem de boas-vindas</label>
            <textarea className="inp" value={cfg.message} onChange={(e) => setCfg({ ...cfg, message: e.target.value })} />
          </div>
          <SaveBar status={status} onSave={save} />
        </div>
      </div>
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
