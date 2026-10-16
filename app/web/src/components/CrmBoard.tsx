"use client";

// CRM KANBAN (board estilo Trello) — colunas arrastáveis, cards arrastáveis entre colunas e ficha
// rica (nome, e-mail, telefone, endereço, descrição em bullets, valor, etiquetas).
//
// DRAG & DROP com POINTER EVENTS (não HTML5 DnD): pointer events funcionam igual no MOUSE e no TOUCH
// do celular — o `draggable` nativo não funciona em touch. Sem dependência nova: o arraste é um clone
// "fantasma" em position:fixed seguindo o dedo/cursor, e o alvo sai do getBoundingClientRect das
// colunas/cards visíveis.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { jget, jsend, initials } from "@/lib/client";
import { fmtNumber } from "@/components/accounts";
import { useT } from "@/lib/i18n";

interface Stage { id: string; name: string; color: string | null; position: number }
interface Card {
  phone: string; name: string | null; email: string | null; address: string | null; notes: string | null;
  value: number | null; avatar_url: string | null; stage_id: string | null; pos: number | null;
  platform: string | null; last_seen: string; opted_out: boolean; tags: string[];
}
type Drag =
  | { kind: "card"; phone: string; from: string; w: number; h: number; dx: number; dy: number }
  | { kind: "stage"; id: string; w: number; h: number; dx: number; dy: number };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PRESETS = ["#25D366", "#2AA9E0", "#7C6CF0", "#E8A33D", "#E5544B", "#12C46E", "#869A90"];
const PAGINA = 50; // cards renderizados por coluna de cada vez (o resto vem no "mostrar mais")

export function CrmBoard({ canEditStages = true }: { canEditStages?: boolean }) {
  const t = useT();
  const [stages, setStages] = useState<Stage[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);            // telefone do card aberto
  const [novaCol, setNovaCol] = useState("");
  const [addingCard, setAddingCard] = useState<string | null>(null); // stageId onde criar
  // Quantos cards cada coluna MOSTRA. Com milhares de contatos, renderizar a coluna inteira
  // travava a tela (e o arraste lia o retângulo de TODOS os cards a cada movimento do dedo).
  const [mostrar, setMostrar] = useState<Record<string, number>>({});
  const verMais = (id: string) => setMostrar((m) => ({ ...m, [id]: (m[id] ?? PAGINA) + PAGINA }));

  // ── arraste ────────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ stage: string; index: number } | null>(null);
  const [stageDropAt, setStageDropAt] = useState<number | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const d = await jget("/api/app/crm/board");
      setStages(d.stages ?? []); setCards(d.cards ?? []);
    } catch (e: any) { setErr(e.message || t("contatos.funilErroCarregar")); }
    setLoading(false);
  }

  const busca = q.trim().toLowerCase();
  const byStage = useMemo(() => {
    const m: Record<string, Card[]> = {};
    for (const s of stages) m[s.id] = [];
    for (const c of cards) {
      if (busca && !`${c.name ?? ""} ${c.phone} ${c.email ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(busca)) continue;
      const sid = c.stage_id && m[c.stage_id] ? c.stage_id : stages[0]?.id;
      if (sid) m[sid].push(c);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9) || (a.name ?? "").localeCompare(b.name ?? ""));
    return m;
  }, [cards, stages, busca]);

  // ── início do arraste (mouse ou dedo) ──────────────────────────────────────
  function startDragCard(e: React.PointerEvent, c: Card) {
    if (busca) return; // com filtro ativo os índices não batem com a coluna real
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "card", phone: c.phone, from: c.stage_id ?? stages[0]?.id ?? "", w: el.width, h: el.height, dx: e.clientX - el.left, dy: e.clientY - el.top });
    setGhost({ x: e.clientX, y: e.clientY });
  }
  function startDragStage(e: React.PointerEvent, s: Stage) {
    if (!canEditStages) return;
    const el = ((e.currentTarget as HTMLElement).parentElement as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "stage", id: s.id, w: el.width, h: 44, dx: e.clientX - el.left, dy: e.clientY - el.top });
    setGhost({ x: e.clientX, y: e.clientY });
  }

  // Onde soltar: coluna sob o cursor + índice pela posição vertical vs. o meio de cada card.
  const computeDrop = useCallback((x: number, y: number) => {
    if (!drag) return;
    if (drag.kind === "stage") {
      let idx = stages.length;
      for (let i = 0; i < stages.length; i++) {
        const r = colRefs.current[stages[i].id]?.getBoundingClientRect();
        if (r && x < r.left + r.width / 2) { idx = i; break; }
      }
      setStageDropAt(idx);
      return;
    }
    for (const s of stages) {
      const r = colRefs.current[s.id]?.getBoundingClientRect();
      if (!r || x < r.left || x > r.right) continue;
      // Só os cards VISÍVEIS (os demais nem existem na tela pra medir). Soltar no fim da parte
      // visível = entrar logo depois do último card mostrado — que é o que o dedo indicou.
      const list = (byStage[s.id] ?? []).slice(0, mostrar[s.id] ?? PAGINA).filter((c) => c.phone !== drag.phone);
      let idx = list.length;
      for (let i = 0; i < list.length; i++) {
        const cr = cardRefs.current[list[i].phone]?.getBoundingClientRect();
        if (cr && y < cr.top + cr.height / 2) { idx = i; break; }
      }
      setDropAt({ stage: s.id, index: idx });
      return;
    }
    setDropAt(null);
  }, [drag, stages, byStage, mostrar]);

  useEffect(() => {
    if (!drag) return;
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      setGhost({ x: ev.clientX, y: ev.clientY });
      computeDrop(ev.clientX, ev.clientY);
      // auto-scroll horizontal ao chegar perto da borda (board largo)
      const b = boardRef.current;
      if (b) {
        const r = b.getBoundingClientRect();
        if (ev.clientX > r.right - 70) b.scrollLeft += 14;
        else if (ev.clientX < r.left + 70) b.scrollLeft -= 14;
      }
    };
    const up = () => { finish(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, computeDrop, dropAt, stageDropAt]);

  async function finish() {
    const d = drag, dropCard = dropAt, dropStage = stageDropAt;
    setDrag(null); setGhost(null); setDropAt(null); setStageDropAt(null);
    if (!d) return;

    if (d.kind === "stage" && dropStage != null) {
      const cur = stages.findIndex((s) => s.id === d.id);
      if (cur < 0) return;
      const next = [...stages];
      const [moved] = next.splice(cur, 1);
      next.splice(dropStage > cur ? dropStage - 1 : dropStage, 0, moved);
      if (next.every((s, i) => s.id === stages[i]?.id)) return; // não mudou
      setStages(next); // otimista
      try { await jsend("/api/app/crm/stage/reorder", "POST", { ids: next.map((s) => s.id) }); }
      catch (e: any) { setErr(e.message); load(); }
      return;
    }

    if (d.kind === "card" && dropCard) {
      const atual = cards.find((c) => c.phone === d.phone);
      const mesmaColuna = (atual?.stage_id ?? stages[0]?.id) === dropCard.stage;
      const posAtual = (byStage[dropCard.stage] ?? []).findIndex((c) => c.phone === d.phone);
      if (mesmaColuna && (posAtual === dropCard.index || posAtual === dropCard.index - 1)) return; // não mudou
      const listaAtual = (byStage[dropCard.stage] ?? []).filter((c) => c.phone !== d.phone);
      const antes = listaAtual[dropCard.index - 1]?.pos ?? null;
      const depois = listaAtual[dropCard.index]?.pos ?? null;
      const novaPos = antes == null && depois == null ? 0
        : antes == null ? Number(depois) - 10
        : depois == null ? Number(antes) + 10
        : (Number(antes) + Number(depois)) / 2;
      setCards((prev) => prev.map((c) => (c.phone === d.phone ? { ...c, stage_id: dropCard.stage, pos: novaPos } : c))); // otimista
      try {
        const r = await jsend("/api/app/crm/card/move", "POST", { phone: d.phone, stageId: dropCard.stage, index: dropCard.index });
        if (typeof r?.pos === "number") setCards((prev) => prev.map((c) => (c.phone === d.phone ? { ...c, pos: r.pos } : c)));
      } catch (e: any) { setErr(e.message); load(); }
    }
  }

  // ── colunas ────────────────────────────────────────────────────────────────
  async function criarColuna() {
    const nm = novaCol.trim();
    if (!nm || busy) return;
    setBusy(true); setErr("");
    try { const s = await jsend("/api/app/crm/stage", "POST", { name: nm }); setStages((p) => [...p, s]); setNovaCol(""); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function renomearColuna(s: Stage) {
    const nm = prompt(t("contatos.renomearColunaPrompt"), s.name);
    if (!nm || nm.trim() === s.name) return;
    setStages((p) => p.map((x) => (x.id === s.id ? { ...x, name: nm.trim() } : x)));
    try { await jsend("/api/app/crm/stage", "PUT", { id: s.id, name: nm.trim() }); } catch (e: any) { setErr(e.message); load(); }
  }
  async function corColuna(s: Stage, color: string) {
    setStages((p) => p.map((x) => (x.id === s.id ? { ...x, color } : x)));
    try { await jsend("/api/app/crm/stage", "PUT", { id: s.id, color }); } catch (e: any) { setErr(e.message); load(); }
  }
  async function apagarColuna(s: Stage) {
    const n = (byStage[s.id] ?? []).length;
    if (!confirm(t("contatos.apagarColunaConfirmacao", { nome: s.name }) + (n ? t("contatos.apagarColunaCards", { n }) : ""))) return;
    setBusy(true);
    try { await jsend("/api/app/crm/stage/delete", "POST", { id: s.id }); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function criarCard(stageId: string, telefone: string, nome: string) {
    setBusy(true); setErr("");
    try { await jsend("/api/app/crm/card", "POST", { phone: telefone, name: nome, stageId }); setAddingCard(null); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const aberto = open ? cards.find((c) => c.phone === open) ?? null : null;
  if (loading) return <div className="card"><div className="card-pad muted">{t("contatos.carregandoBoard")}</div></div>;

  return (
    <div className="kb-wrap">
      <div className="kb-toolbar">
        <input className="inp" style={{ maxWidth: 250 }} placeholder={t("contatos.funilBuscaPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted" style={{ fontSize: 12.5 }}>{t("contatos.funilResumo", { cards: cards.length, stages: stages.length })}</span>
        {busca && <span className="tpl-status warn" style={{ fontSize: 10.5 }}>{t("contatos.arrastePausado")}</span>}
        <div style={{ flex: 1 }} />
        {canEditStages && (
          <div style={{ display: "flex", gap: 6 }}>
            <input className="inp" style={{ maxWidth: 160 }} placeholder={t("contatos.novaColunaPlaceholder")} value={novaCol}
              onChange={(e) => setNovaCol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criarColuna()} />
            <button className="btn primary ic" disabled={busy || !novaCol.trim()} onClick={criarColuna}><Icon name="plus" size={14} /> {t("contatos.botaoNovaColuna")}</button>
          </div>
        )}
      </div>
      {err && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-pad" style={{ color: "var(--crit)", fontSize: 13 }}>
            {err} <button className="btn" style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11.5 }} onClick={() => { setErr(""); load(); }}>{t("contatos.recarregar")}</button>
          </div>
        </div>
      )}

      <div className="kb-board" ref={boardRef}>
        {stages.map((s, si) => {
          const list = byStage[s.id] ?? [];
          const total = list.reduce((acc, c) => acc + (c.value ?? 0), 0);
          const vis = list.slice(0, mostrar[s.id] ?? PAGINA); // só o lote visível vai pro DOM
          const semArrastado = drag?.kind === "card" ? vis.filter((c) => c.phone !== drag.phone) : vis;
          return (
            <div key={s.id} className={"kb-col" + (drag?.kind === "stage" && drag.id === s.id ? " dragging" : "")} ref={(el) => { colRefs.current[s.id] = el; }}>
              {drag?.kind === "stage" && stageDropAt === si && <div className="kb-col-marker" />}
              <div className="kb-col-head" style={{ borderTopColor: s.color || "var(--accent)" }}>
                {canEditStages && <span className="kb-grip" onPointerDown={(e) => startDragStage(e, s)} title={t("contatos.gripDica")}>⠿</span>}
                <b onDoubleClick={() => canEditStages && renomearColuna(s)} title={canEditStages ? t("contatos.renomearDica") : undefined}>{s.name}</b>
                <span className="kb-count">{list.length}</span>
                {canEditStages && (
                  <div className="kb-col-actions">
                    <span className="kb-colors">
                      {PRESETS.map((c) => <button key={c} className="kb-dot" style={{ background: c }} onClick={() => corColuna(s, c)} title={t("contatos.corColunaDica")} />)}
                    </span>
                    <button className="btn ic" style={{ padding: "1px 6px" }} onClick={() => renomearColuna(s)} title={t("contatos.renomear")}><Icon name="edit" size={12} /></button>
                    <button className="btn danger ic" style={{ padding: "1px 6px" }} onClick={() => apagarColuna(s)} title={t("contatos.apagarColuna")}><Icon name="trash" size={12} /></button>
                  </div>
                )}
              </div>
              {total > 0 && <div className="kb-col-total">{brl(total)}</div>}

              <div className="kb-col-body">
                {vis.map((c, ci) => (
                  <div key={c.phone}>
                    {drag?.kind === "card" && dropAt?.stage === s.id && dropAt.index === ci && <div className="kb-drop" />}
                    <div
                      ref={(el) => { cardRefs.current[c.phone] = el; }}
                      className={"kb-card" + (drag?.kind === "card" && drag.phone === c.phone ? " dragging" : "")}
                      onPointerDown={(e) => startDragCard(e, c)}
                      onClick={() => { if (!drag) setOpen(c.phone); }}
                    >
                      <div className="kb-card-top">
                        <span className="kb-ava">
                          {c.avatar_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={c.avatar_url} alt="" loading="lazy" decoding="async" />
                            : initials(c.name || c.phone)}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b>{c.name || fmtNumber(c.phone)}</b>
                          <div className="kb-sub">{fmtNumber(c.phone)}</div>
                        </div>
                        {c.value != null && <span className="kb-value">{brl(c.value)}</span>}
                      </div>
                      {c.notes && (
                        <div className="kb-notes">
                          {c.notes.split("\n").filter((l) => l.trim()).slice(0, 3).map((l, i) => (
                            <div key={i}>{/^[•\-*]/.test(l.trim()) ? l : "• " + l}</div>
                          ))}
                        </div>
                      )}
                      {((c.tags?.length ?? 0) > 0 || c.opted_out) && (
                        <div className="kb-tags">
                          {c.opted_out && <span className="tpl-status crit" style={{ fontSize: 10 }}>{t("contatos.seloOptOut")}</span>}
                          {(c.tags ?? []).slice(0, 3).map((t) => <span key={t} className="tpl-status" style={{ fontSize: 10 }}>🏷️ {t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {drag?.kind === "card" && dropAt?.stage === s.id && dropAt.index >= semArrastado.length && <div className="kb-drop" />}

                {list.length > vis.length && (
                  <button className="kb-add" onClick={() => verMais(s.id)}>
                    {t("contatos.mostrarMais", { n: Math.min(PAGINA, list.length - vis.length), restantes: list.length - vis.length })}
                  </button>
                )}

                {addingCard === s.id ? (
                  <NovoCard onCancel={() => setAddingCard(null)} onSave={(tel, nome) => criarCard(s.id, tel, nome)} busy={busy} />
                ) : (
                  <button className="kb-add" onClick={() => setAddingCard(s.id)}>{t("contatos.adicionarCard")}</button>
                )}
              </div>
            </div>
          );
        })}
        {drag?.kind === "stage" && stageDropAt === stages.length && <div className="kb-col-marker" />}
      </div>

      {/* fantasma do arraste — segue o dedo/cursor */}
      {drag && ghost && (
        <div className="kb-ghost" style={{ left: ghost.x - drag.dx, top: ghost.y - drag.dy, width: drag.w }}>
          {drag.kind === "card" ? (() => {
            const c = cards.find((x) => x.phone === drag.phone);
            return (
              <div className="kb-card">
                <div className="kb-card-top">
                  <span className="kb-ava">{initials(c?.name || c?.phone || "?")}</span>
                  <div style={{ minWidth: 0 }}><b>{c?.name || fmtNumber(c?.phone ?? "")}</b></div>
                </div>
              </div>
            );
          })() : (
            <div className="kb-col-head" style={{ borderTopColor: stages.find((s) => s.id === drag.id)?.color || "var(--accent)" }}>
              <b>{stages.find((s) => s.id === drag.id)?.name}</b>
            </div>
          )}
        </div>
      )}

      {aberto && <CardModal card={aberto} stages={stages} onClose={() => setOpen(null)} onSaved={(patch) => setCards((p) => p.map((c) => (c.phone === aberto.phone ? { ...c, ...patch } : c)))} />}
    </div>
  );
}

// Criação rápida de card dentro da coluna.
function NovoCard({ onSave, onCancel, busy }: { onSave: (tel: string, nome: string) => void; onCancel: () => void; busy: boolean }) {
  const t = useT();
  const [tel, setTel] = useState("");
  const [nome, setNome] = useState("");
  return (
    <div className="kb-card" style={{ cursor: "default" }} onPointerDown={(e) => e.stopPropagation()}>
      <input className="inp" style={{ marginBottom: 6, fontSize: 12.5 }} placeholder={t("contatos.telefoneComDddPlaceholder")} value={tel} onChange={(e) => setTel(e.target.value)} autoFocus />
      <input className="inp" style={{ marginBottom: 8, fontSize: 12.5 }} placeholder={t("contatos.nomeOpcionalPlaceholder")} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSave(tel, nome)} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} onClick={onCancel}>{t("comum.cancelar")}</button>
        <button className="btn primary" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy || tel.replace(/\D/g, "").length < 10} onClick={() => onSave(tel, nome)}>{t("contatos.criar")}</button>
      </div>
    </div>
  );
}

// Ficha do card: nome, e-mail, telefone, endereço, valor e descrição em bullets.
function CardModal({ card, stages, onClose, onSaved }: { card: Card; stages: Stage[]; onClose: () => void; onSaved: (p: Partial<Card>) => void }) {
  const t = useT();
  const [name, setName] = useState(card.name ?? "");
  const [email, setEmail] = useState(card.email ?? "");
  const [address, setAddress] = useState(card.address ?? "");
  const [notes, setNotes] = useState(card.notes ?? "");
  const [value, setValue] = useState(card.value != null ? String(card.value) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);

  async function salvar() {
    setBusy(true); setMsg("");
    const v = value.trim() === "" ? null : Number(value.replace(/\./g, "").replace(",", "."));
    if (v != null && Number.isNaN(v)) { setMsg(t("contatos.valorInvalido")); setBusy(false); return; }
    try {
      await jsend("/api/app/crm/card", "PUT", { phone: card.phone, name, email, address, notes, value: v });
      onSaved({ name, email, address, notes, value: v });
      setMsg("Salvo!");
      setTimeout(() => setMsg(""), 1500);
    } catch (e: any) { setMsg(e.message || t("contatos.falhaAoSalvar")); }
    setBusy(false);
  }
  // Bullet automático: Enter numa linha que começa com "•" continua a lista.
  function onNotesKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    const ta = e.currentTarget;
    const linhaAtual = ta.value.slice(0, ta.selectionStart).split("\n").pop() ?? "";
    if (linhaAtual.trim().startsWith("•")) {
      e.preventDefault();
      const p = ta.selectionStart;
      setNotes(ta.value.slice(0, p) + "\n• " + ta.value.slice(p));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = p + 3; });
    }
  }
  const stage = stages.find((s) => s.id === card.stage_id);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label={t("comum.fechar")}>✕</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span className="kb-ava" style={{ width: 46, height: 46, fontSize: 15 }}>
            {card.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={card.avatar_url} alt="" />
              : initials(card.name || card.phone)}
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16.5 }}>{card.name || fmtNumber(card.phone)}</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {fmtNumber(card.phone)}{stage && <> · <span style={{ color: stage.color || "var(--accent-deep)", fontWeight: 700 }}>{stage.name}</span></>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label>{t("contatos.campoNome")}</label><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>{t("contatos.campoValor")}</label><input className="inp" inputMode="decimal" placeholder={t("contatos.valorPlaceholder")} value={value} onChange={(e) => setValue(e.target.value)} /></div>
          <div className="field"><label>{t("contatos.campoEmail")}</label><input className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("contatos.emailPlaceholder")} /></div>
          <div className="field"><label>{t("contatos.campoTelefone")}</label><input className="inp" value={fmtNumber(card.phone)} readOnly title={t("contatos.telefoneChaveDica")} /></div>
        </div>
        <div className="field"><label>{t("contatos.campoEndereco")}</label><input className="inp" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("contatos.enderecoPlaceholder")} /></div>
        <div className="field">
          <label>{t("contatos.campoAnotacoes")}</label>
          <textarea className="inp" style={{ minHeight: 120 }} value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={onNotesKey}
            placeholder={t("contatos.anotacoesPlaceholder")} />
          {/* a dica traz <b> no dicionário (o • em negrito) — texto nosso, não entrada de usuário */}
          <div className="muted" style={{ fontSize: 11.5 }} dangerouslySetInnerHTML={{ __html: t("contatos.dicaBullet") }} />
        </div>
        {(card.tags?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {card.tags.map((t) => <span key={t} className="tpl-status on" style={{ fontSize: 11 }}>🏷️ {t}</span>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {msg && <span style={{ fontSize: 12.5, color: msg === "Salvo!" ? "var(--accent-deep)" : "var(--crit)", fontWeight: 600, marginRight: "auto" }}>{msg === "Salvo!" ? t("contatos.salvo") : msg}</span>}
          <a className="btn" href="/ao-vivo">{t("contatos.irProChat")}</a>
          <button className="btn primary" disabled={busy} onClick={salvar}>{busy ? t("comum.salvando") : t("comum.salvar")}</button>
        </div>
      </div>
    </div>
  );
}
