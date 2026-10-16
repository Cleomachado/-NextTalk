"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jget, jsend, initials, brl, evLabel, ContactDetailData } from "@/lib/client";
import { BackTo } from "@/components/ui";
import { Icon } from "@/components/icons";

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
}

export function ContactDetail({ phone }: { phone: string }) {
  const router = useRouter();
  const [data, setData] = useState<ContactDetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // edição
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [tags, setTags] = useState("");
  const [optOut, setOptOut] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    jget(`/api/contacts/${encodeURIComponent(phone)}`).then(setData).catch((e) => setErr(e.message));
  }, [phone]);

  function abrirEdicao() {
    const c = data?.contact;
    setNome(c?.name ?? "");
    setEmail(c?.email ?? "");
    setNotas(c?.notes ?? "");
    setTags((c?.tags ?? []).join(", "));
    setOptOut(!!c?.opted_out);
    setMsg("");
    setEditando(true);
  }

  async function salvar() {
    if (salvando) return;
    setSalvando(true); setMsg("");
    try {
      const r = await jsend(`/api/contacts/${encodeURIComponent(phone)}`, "PUT", {
        nome, email, notas, optOut,
        tags: tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
      });
      if (r.contact) setData({ contact: r.contact, events: r.events ?? data?.events ?? [] });
      setEditando(false);
    } catch (e: any) { setMsg(e?.message || "não consegui salvar"); }
    setSalvando(false);
  }

  async function excluir() {
    const c = data?.contact;
    if (!confirm(`Excluir ${c?.name || c?.phone} dos seus contatos?\n\nO contato e as tags dele saem da lista. O histórico de eventos é mantido.`)) return;
    setExcluindo(true); setMsg("");
    try {
      await jsend(`/api/contacts/${encodeURIComponent(phone)}`, "DELETE", {});
      router.push("/contatos");
    } catch (e: any) { setMsg(e?.message || "não consegui excluir"); setExcluindo(false); }
  }

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!data) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  const c = data.contact;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <BackTo href="/contatos" label="Contatos" />

      <div className="card">
        <div className="card-pad" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div className="g-ava" style={{ width: 52, height: 52, fontSize: 16 }}>{initials(c.name || c.phone)}</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 18, fontWeight: 650 }}>{c.name || "(sem nome)"}</div>
            <div className="muted" style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{c.phone}{c.platform ? ` · ${c.platform}` : ""}</div>
            {c.email && <div className="muted" style={{ fontSize: 12.5 }}>{c.email}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn primary" href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
            <button className="btn" onClick={abrirEdicao} disabled={editando}>Editar</button>
            <button className="btn ic" title="Excluir contato" onClick={excluir} disabled={excluindo}>
              <Icon name="trash" size={14} style={{ color: "var(--crit)" }} />
            </button>
          </div>
        </div>

        {(c.tags ?? []).length > 0 && !editando && (
          <div className="card-pad" style={{ borderTop: "1px solid var(--line-2)" }}>
            <div className="crm-tags" style={{ marginTop: 0 }}>
              {(c.tags ?? []).map((t) => (
                <span key={t} className="crm-tag" title={t}><Icon name="tag" size={11} /><span className="crm-tag-txt">{t}</span></span>
              ))}
            </div>
          </div>
        )}

        {editando ? (
          <div className="card-pad" style={{ borderTop: "1px solid var(--line-2)", display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">Nome</span>
              <input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contato" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">E-mail</span>
              <input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">Tags (separe por vírgula)</span>
              <input className="inp" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex.: Lista Setembro, Cliente" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">Anotações</span>
              <textarea className="inp" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observações sobre esse contato" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />
              Opt-out — não enviar mais mensagens para este contato
            </label>
            {msg && <div style={{ fontSize: 13, color: "var(--crit)" }}>{msg}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</button>
              <button className="btn primary" onClick={salvar} disabled={salvando}>{salvando ? "salvando…" : "Salvar"}</button>
            </div>
          </div>
        ) : (
          <div className="card-pad" style={{ borderTop: "1px solid var(--line-2)", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>Status</div>
              <b style={{ color: c.opted_out ? "var(--crit)" : "var(--accent-deep)" }}>{c.opted_out ? "Opt-out (não recebe)" : "Recebe mensagens"}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>Primeiro contato</div>
              <b>{fmtDate(c.first_seen)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>Último contato</div>
              <b>{fmtDate(c.last_seen)}</b>
            </div>
          </div>
        )}
        {c.notes && !editando && (
          <div className="card-pad muted" style={{ borderTop: "1px solid var(--line-2)", fontSize: 13, whiteSpace: "pre-wrap" }}>{c.notes}</div>
        )}
        {msg && !editando && <div className="card-pad" style={{ fontSize: 13, color: "var(--crit)" }}>{msg}</div>}
      </div>

      <div className="card">
        <div className="card-head"><h3>Histórico</h3><span className="page-hint">{data.events.length} evento(s)</span></div>
        {data.events.length === 0 ? (
          <div className="card-pad muted">Sem eventos registrados.</div>
        ) : (
          <div className="feed">
            {data.events.map((e, i) => {
              const l = evLabel(e.event);
              return (
                <div key={i} className="feed-item">
                  <span className={"feed-ico " + l.c} />
                  <div className="feed-txt">
                    <b>{l.t}</b>{e.product ? ` · ${e.product}` : ""}{e.amount ? ` · ${brl(Number(e.amount))}` : ""}
                    <div className="feed-time">{fmtDate(String(e.created_at))}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
