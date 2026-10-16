"use client";

import { useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { useAccounts, fmtNumber } from "@/components/accounts";
import { BackTo, Pfp } from "@/components/ui";
import { Icon } from "@/components/icons";

interface Job {
  total: number;
  done: number;
  created: Array<{ jid: string; name: string }>;
  errors: string[];
  running: boolean;
}

export function BulkCreate() {
  const { activeAcct } = useAccounts();
  const account = activeAcct?.id ?? "lite";
  const [names, setNames] = useState("");
  const [admins, setAdmins] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [delaySec, setDelaySec] = useState(10);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [pending, setPending] = useState<{ names: string[]; admins: string[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const isFilePhoto = image.startsWith("data:");

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Foto do grupo por upload → vira data URL (o motor manda pro /group/updateImage).
  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("A foto do grupo precisa ser uma imagem."); return; }
    if (f.size > 10 * 1024 * 1024) { setErr("Foto muito grande (máx 10MB)."); return; }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(f);
  }

  // Valida e abre o popup de confirmação (mostra o canal, admins e nomes antes de criar).
  function openConfirm() {
    setErr("");
    const nameList = names.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!nameList.length) {
      setErr("Escreva pelo menos um nome de grupo (um por linha).");
      return;
    }
    const adminList = admins.split(/[\n,]/).map((s) => s.replace(/\D/g, "")).filter(Boolean);
    setPending({ names: nameList, admins: adminList });
    setConfirm(true);
  }
  // Confirmado no popup → dispara a criação de verdade.
  async function runCreate() {
    if (!pending) return;
    setConfirm(false);
    setShowDone(false);
    setJob(null);
    try {
      const r = await jsend("/api/groups/bulk-create", "POST", { account, names: pending.names, admins: pending.admins, description, image, delaySec });
      poll(r.jobId);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function poll(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const j = await jget("/api/groups/bulk-status?jobId=" + encodeURIComponent(jobId));
        setJob(j);
        if (!j.running && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setShowDone(true); // abre o popup de concluído
        }
      } catch {
        /* segue */
      }
    };
    tick();
    pollRef.current = setInterval(tick, 2000);
  }

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
      <BackTo href="/grupos" label="Automações de grupo" />
      <div className="card">
        <div className="card-head"><h3><Icon name="add_to_group" className="ico-txt-i" size={18} />Criar grupos em massa</h3><span className="page-hint">{activeAcct?.name}</span></div>
        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Nomes dos grupos (um por linha)</label>
            <textarea className="inp" style={{ minHeight: 100 }} value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Turma A\nTurma B\nTurma C"} />
          </div>
          <div className="field">
            <label>Admins (telefone com DDD, um por linha/vírgula) — vira admin de todos os grupos</label>
            <textarea className="inp" value={admins} onChange={(e) => setAdmins(e.target.value)} placeholder="5511999999999" />
          </div>
          <div className="field">
            <label>Descrição (opcional)</label>
            <textarea className="inp" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>Foto do grupo (opcional) — cole uma URL ou envie do computador</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)", flex: "none" }} />
              )}
              <input
                className="inp"
                style={{ flex: 1 }}
                value={isFilePhoto ? "" : image}
                onChange={(e) => setImage(e.target.value)}
                placeholder={isFilePhoto ? "foto enviada do computador ✓" : "https://…"}
                disabled={isFilePhoto}
              />
              <button type="button" className="btn ic" onClick={() => photoRef.current?.click()} style={{ flex: "none" }}><Icon name="send" size={15} />Enviar foto</button>
              {image && <button type="button" className="btn ic" onClick={() => { setImage(""); if (photoRef.current) photoRef.current.value = ""; }} title="Remover foto" style={{ flex: "none" }}><Icon name="close" size={15} /></button>}
            </div>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Delay entre grupos (s)</label>
            <input className="inp" type="number" min={0} value={delaySec} onChange={(e) => setDelaySec(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn primary" onClick={openConfirm} disabled={!!job?.running}>{job?.running ? "Criando…" : "Criar grupos"}</button>
            {err && <span style={{ color: "var(--crit)", fontSize: 12.5 }}>{err}</span>}
          </div>
          <div className="muted" style={{ fontSize: 11.5, display: "flex", alignItems: "flex-start", gap: 6 }}><Icon name="warn" size={14} style={{ flex: "none", marginTop: 1 }} /><span>Cria grupos DE VERDADE no WhatsApp. Comece com 1-2 pra testar. O delay ajuda a evitar bloqueio.</span></div>

          {job && (
            <div className="card" style={{ background: "var(--surface-2)" }}>
              <div className="card-pad">
                <b>{job.running ? "Criando…" : "Concluído"} — {job.done}/{job.total}</b>
                <div className="progress" style={{ marginTop: 8 }}><div style={{ width: pct + "%" }} /></div>
                {job.created.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, display: "flex", alignItems: "flex-start", gap: 6 }}><Icon name="check" size={14} style={{ flex: "none", marginTop: 1, color: "var(--accent-deep)" }} /><span>Criados: {job.created.map((c) => c.name).join(", ")}</span></div>}
                {job.errors.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "var(--crit)" }}>Erros: {job.errors.join(" · ")}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Popup de confirmação: resumo do que vai ser criado ─────────────── */}
      {confirm && pending && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Confirmar criação em massa</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Revise antes — os grupos são criados de verdade no WhatsApp.</p>

            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)", marginBottom: 14 }}>
              <Pfp size={40} ring={!!activeAcct?.connected} src={activeAcct?.avatar} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>Canal selecionado</div>
                <b style={{ fontSize: 14 }}>{activeAcct?.name ?? "—"}</b>
                <div className="muted" style={{ fontSize: 12, fontFamily: "var(--mono)" }}>
                  {activeAcct?.number ? fmtNumber(activeAcct.number) : "sem número"} · <span style={{ color: "var(--accent-deep)", fontWeight: 700 }}>{activeAcct?.type ?? "LITE"}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 22, marginBottom: 14 }}>
              <div><b style={{ fontSize: 21 }}>{pending.names.length}</b><div className="muted" style={{ fontSize: 11.5 }}>grupo(s)</div></div>
              <div><b style={{ fontSize: 21 }}>{pending.admins.length}</b><div className="muted" style={{ fontSize: 11.5 }}>admin(s)</div></div>
              <div><b style={{ fontSize: 21 }}>{delaySec}s</b><div className="muted" style={{ fontSize: 11.5 }}>de intervalo</div></div>
            </div>

            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, marginBottom: 7 }}>Grupos a criar</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, maxHeight: 122, overflowY: "auto" }}>
              {pending.names.map((n, i) => <span key={i} className="chip">{n}</span>)}
            </div>

            {pending.admins.length > 0 && (
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>
                <span className="muted">Admins de todos os grupos: </span>{pending.admins.map((a) => fmtNumber(a)).join(", ")}
              </div>
            )}
            {(description || image) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)" }} />
                )}
                <span className="muted">{description ? "✓ com descrição" : ""}{description && image ? " · " : ""}{image ? "✓ com foto" : ""}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn" onClick={() => setConfirm(false)}>Cancelar</button>
              <button className="btn primary" onClick={runCreate}>OK, gerar grupos agora</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup de concluído: resultado da criação ───────────────────────── */}
      {showDone && job && !job.running && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>{job.errors.length ? "Concluído com avisos" : "Grupos criados! 🎉"}</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>{job.created.length} de {job.total} grupo(s) criado(s) no WhatsApp.</p>

            {job.created.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, marginBottom: 7 }}>Criados</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, maxHeight: 122, overflowY: "auto" }}>
                  {job.created.map((c, i) => <span key={i} className="chip">{c.name}</span>)}
                </div>
              </>
            )}

            {job.errors.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--crit)", marginBottom: 6 }}>
                <b>Avisos:</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                  {job.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn primary" onClick={() => setShowDone(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
