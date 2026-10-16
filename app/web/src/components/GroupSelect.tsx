"use client";

import { useRef, useState } from "react";
import { GroupListItem } from "@/lib/client";

// Seletor de grupo com BUSCA em tempo real + lista rolável. Usado no builder e nos lembretes.
// `onRefresh` (opcional) mostra o "↻ Atualizar" — busca à força no WhatsApp (grupo novo/cache atrasado).
export function GroupSelect({ value, onChange, groupList, placeholder = "— escolher grupo —", onRefresh, refreshing, error }: {
  value: string;
  onChange: (jid: string) => void;
  groupList: GroupListItem[];
  placeholder?: string;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false); // abre pra cima quando o botão está na metade de baixo da tela
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const labelOf = (g: GroupListItem) => (g.name || "").trim() || g.jid;
  const sel = groupList.find((g) => g.jid === value);
  const term = q.trim().toLowerCase();
  const matches = groupList.filter((g) => labelOf(g).toLowerCase().includes(term));
  const filtered = matches.slice(0, 200); // renderiza no máx. 200 — o rodapé avisa quando cortou

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setUp(r.bottom > window.innerHeight * 0.55); // sem espaço embaixo → abre pra cima
    }
    setOpen((o) => !o);
  }

  return (
    <div className="grp-picker">
      <button ref={btnRef} type="button" className="inp grp-picker-btn" onClick={toggle}>
        <span className={sel ? "" : "muted"} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? labelOf(sel) : placeholder}</span>
        <span className="grp-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="grp-scrim" onClick={() => { setOpen(false); setQ(""); }} />
          <div className={"grp-menu" + (up ? " up" : "")}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input className="inp grp-search" autoFocus placeholder="Buscar grupo…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="grp-list">
              {filtered.length === 0 && (
                <div className="muted grp-empty">
                  {groupList.length === 0 ? "Carregando os grupos… (ou nenhum número conectado)" : "Nenhum grupo encontrado"}
                  {onRefresh && groupList.length > 0 && <div className="grp-empty-dica">Grupo novo? Clique em ↻ Atualizar aqui embaixo.</div>}
                </div>
              )}
              {filtered.map((g) => (
                <button type="button" key={g.jid} title={labelOf(g)} className={"grp-item" + (g.jid === value ? " on" : "")} onClick={() => { onChange(g.jid); setOpen(false); setQ(""); }}>
                  {labelOf(g)}
                </button>
              ))}
            </div>
            {error && <div className="grp-err">⚠️ {error}</div>}
            <div className="grp-foot">
              <span className="muted">
                {term ? `${matches.length} de ${groupList.length}` : `${groupList.length} grupos`}
                {(term ? matches.length : groupList.length) > 200 ? " · mostrando 200" : ""}
              </span>
              {onRefresh && (
                <button type="button" className="grp-refresh" disabled={refreshing} onClick={() => onRefresh()}>
                  {refreshing ? "atualizando… (10s)" : "↻ Atualizar"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
