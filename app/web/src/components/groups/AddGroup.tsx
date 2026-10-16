"use client";

import { useState } from "react";
import { jsend, GroupListItem } from "@/lib/client";

// Seletor de grupo: dropdown com os grupos do número (por NOME) + adicionar por link de convite.
export function AddGroup({
  groupList,
  groupsErr,
  exclude,
  onAdd,
}: {
  groupList: GroupListItem[];
  groupsErr: string | null;
  exclude: string[];
  onAdd: (jid: string, name: string) => void;
}) {
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const avail = groupList.filter((g) => !exclude.includes(g.jid));

  async function resolveInvite() {
    if (!invite.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await jsend("/api/groups/resolve", "POST", { invite });
      onAdd(r.jid, r.name);
      setInvite("");
      setMsg(`Adicionado: ${r.name || r.jid}`);
    } catch (ex: any) {
      setMsg("Falhou: " + ex.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  return (
    <div className="field">
      <label>Adicionar grupo</label>
      {groupList.length > 0 ? (
        <select
          className="inp"
          value=""
          onChange={(e) => {
            const g = groupList.find((x) => x.jid === e.target.value);
            if (g) onAdd(g.jid, g.name);
          }}
        >
          <option value="">— escolher da lista dos seus grupos —</option>
          {avail.map((g) => (
            <option key={g.jid} value={g.jid}>
              {g.name || g.jid}
              {g.participantCount ? ` · ${g.participantCount} membros` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          {groupsErr
            ? "Não consegui listar seus grupos agora — use o link de convite abaixo."
            : "Carregando seus grupos…"}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          className="inp"
          placeholder="ou cole o link: chat.whatsapp.com/…"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
        />
        <button className="btn" disabled={busy} onClick={resolveInvite}>
          {busy ? "…" : "Adicionar"}
        </button>
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
