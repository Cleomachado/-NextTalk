"use client";

import { useState } from "react";
import { jsend } from "@/lib/client";
import { useAccounts } from "@/components/accounts";
import { useGroupList } from "@/components/groups/useGroupList";
import { BackTo } from "@/components/ui";
import { Icon } from "@/components/icons";

export function MentionAll() {
  const { activeAcct } = useAccounts();
  const account = activeAcct?.id ?? "lite";
  const { groupList, groupsErr } = useGroupList();
  const [jid, setJid] = useState("");
  const [text, setText] = useState("Olá pessoal! 👋");
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function send() {
    if (!jid || !text.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await jsend("/api/groups/mention-all", "POST", { account, jid, text, hidden });
      setMsg(`✅ Enviado marcando ${r.count} membro(s).`);
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
      <BackTo href="/grupos" label="Automações de grupo" />
      <div className="card">
        <div className="card-head"><h3><Icon name="mention_all" className="ico-txt-i" size={18} />Marcar todos</h3><span className="page-hint">{activeAcct?.name}</span></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Grupo</label>
            <select className="inp" value={jid} onChange={(e) => setJid(e.target.value)}>
              <option value="">— escolher grupo —</option>
              {groupList.filter((g) => g.jid.endsWith("@g.us")).map((g) => (
                <option key={g.jid} value={g.jid}>{g.name || g.jid}</option>
              ))}
            </select>
            {groupsErr && <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Não consegui listar os grupos agora.</div>}
          </div>
          <div className="field">
            <label>Mensagem</label>
            <textarea className="inp" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Menção oculta (todos recebem a notificação, sem os @ aparecerem no texto)
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn primary" onClick={send} disabled={busy || !jid || !text.trim()}>{busy ? "Enviando…" : "Marcar todos"}</button>
            {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.startsWith("✅") ? "var(--accent-deep)" : "var(--crit)" }}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
