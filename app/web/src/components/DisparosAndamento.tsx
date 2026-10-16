"use client";
// DISPAROS (pedido do dono, 13/10): três fases no menu Disparador — Novo disparo · Em andamento ·
// Realizados. Esta tela serve as duas últimas:
//  · "andamento": só o que está rodando/pausado, cartão completo com progresso ao vivo e Pausar/Retomar/Parar;
//  · "realizados": linha compacta por disparo (vários cabem na tela) que EXPANDE com as métricas.
// Em ambas, clicar em Enviados/Entregues/Lidas/Falhas abre a LISTA de contatos daquele status, com
// Exportar CSV e Etiquetar (escolher uma etiqueta da conta ou criar uma nova na hora).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { fmtNumber } from "@/components/accounts";

type Linha = { template: string; total: number; entregues: number; lidas: number; falhas: number };
type Disparo = {
  id: string; origem: "disparador" | "fluxo"; titulo: string; nota?: string | null; fluxoId?: string;
  total: number; feitos: number; restantes?: number; aceitos?: number; recusados?: number;
  status: "rodando" | "pausado" | "concluido" | "parado"; inicio: number; intervaloSeg: number;
  porTemplate: Linha[]; motivos: Array<{ motivo: string; qtd: number }>;
};
type StatusLista = "enviados" | "entregues" | "lidas" | "falhas";
type Contato = { phone: string; name?: string | null; template?: string; ack?: string; erro?: string | null; ts?: number };

const ROT_STATUS: Record<Disparo["status"], { txt: string; cor: string }> = {
  rodando: { txt: "Rodando", cor: "var(--accent-deep)" },
  pausado: { txt: "Pausado", cor: "#C98A00" },
  concluido: { txt: "Concluído", cor: "var(--muted)" },
  parado: { txt: "Parado", cor: "var(--crit)" },
};
const ROT_LISTA: Record<StatusLista, string> = { enviados: "Enviados", entregues: "Entregues", lidas: "Lidas", falhas: "Falhas" };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataHora = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const soma = (d: Disparo, k: keyof Linha) => d.porTemplate.reduce((s, l) => s + Number(l[k] ?? 0), 0);

export function DisparosAndamento() { return <DisparosLista modo="andamento" />; }
export function DisparosRealizados() { return <DisparosLista modo="realizados" />; }

function DisparosLista({ modo }: { modo: "andamento" | "realizados" }) {
  const [lista, setLista] = useState<Disparo[] | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [confirmaParar, setConfirmaParar] = useState("");
  const [aberto, setAberto] = useState<string>("");
  const [popup, setPopup] = useState<{ d: Disparo; status: StatusLista } | null>(null);

  const carrega = useCallback(() => {
    jget("/api/oficial/disparos").then((d) => { setLista(d.disparos ?? []); setErro(""); }).catch((e) => setErro(e.message));
  }, []);
  // Em andamento atualiza sozinho (os números sobem); Realizados é estático — carrega uma vez.
  useEffect(() => { carrega(); if (modo !== "andamento") return; const t = setInterval(carrega, 5000); return () => clearInterval(t); }, [carrega, modo]);

  async function acao(id: string, a: "pausar" | "retomar" | "parar") {
    setOcupado(id + a); setErro("");
    try { await jsend("/api/oficial/disparos/acao", "POST", { id, acao: a }); carrega(); }
    catch (e: any) { setErro(e.message); }
    setOcupado(""); setConfirmaParar("");
  }

  if (!lista) return <div className="card"><div className="card-pad muted">{erro || "Carregando…"}</div></div>;
  const ativos = lista.filter((d) => d.status === "rodando" || d.status === "pausado");
  const feitos = lista.filter((d) => d.status === "concluido" || d.status === "parado");
  const mostra = modo === "andamento" ? ativos : feitos;

  const Tiles = ({ d }: { d: Disparo }) => {
    const enviados = soma(d, "total"), entregues = soma(d, "entregues"), lidas = soma(d, "lidas"), falhas = soma(d, "falhas");
    const itens: Array<[StatusLista, number, string]> = [["enviados", enviados, ""], ["entregues", entregues, pct(entregues, enviados) + "%"], ["lidas", lidas, pct(lidas, enviados) + "%"], ["falhas", falhas, pct(falhas, enviados) + "%"]];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {itens.map(([k, n, p]) => (
          <button key={k} type="button" className="disp-tile" title={`Ver a lista: ${ROT_LISTA[k]}`} onClick={() => setPopup({ d, status: k })} disabled={!n}>
            <span className="muted" style={{ fontSize: 11.5 }}>{ROT_LISTA[k]}</span>
            <b style={{ fontSize: 18, color: k === "falhas" && n > 0 ? "var(--crit)" : undefined }}>{n}</b>
            {p && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{p}</span>}
            {n > 0 && <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>ver lista ›</span>}
          </button>
        ))}
      </div>
    );
  };

  const Detalhe = ({ d }: { d: Disparo }) => (
    <>
      <Tiles d={d} />
      {d.porTemplate.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead><tr className="muted" style={{ textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>{d.porTemplate.length > 1 ? "Variante (template)" : "Template"}</th>
              <th style={{ padding: "4px 6px" }}>Enviados</th><th style={{ padding: "4px 6px" }}>Entregues</th>
              <th style={{ padding: "4px 6px" }}>Lidas</th><th style={{ padding: "4px 6px" }}>Falhas</th>
            </tr></thead>
            <tbody>
              {d.porTemplate.map((l) => (
                <tr key={l.template} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px" }}><b>{l.template}</b></td>
                  <td style={{ padding: "6px" }}>{l.total}</td>
                  <td style={{ padding: "6px" }}>{l.entregues} <span className="muted">({pct(l.entregues, l.total)}%)</span></td>
                  <td style={{ padding: "6px" }}>{l.lidas} <span className="muted">({pct(l.lidas, l.total)}%)</span></td>
                  <td style={{ padding: "6px" }}>{l.falhas} <span className="muted">({pct(l.falhas, l.total)}%)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.motivos.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          <div className="muted" style={{ marginBottom: 4 }}>Por que falhou</div>
          {d.motivos.map((m) => <div key={m.motivo}>• <b>{m.qtd}</b> — {m.motivo}</div>)}
        </div>
      )}
    </>
  );

  const Origem = ({ d }: { d: Disparo }) => (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--ink-2)" }}>
      {d.origem === "fluxo" ? "Fluxo" : "Disparador"}{d.porTemplate.length > 1 ? " · A/B" : ""}
    </span>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {modo === "andamento" ? "Disparos rodando agora · atualiza sozinho a cada 5 s" : "Disparos concluídos ou parados nos últimos 7 dias · clique numa linha pra ver as métricas"}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {modo === "andamento"
            ? <Link className="btn" href="/oficial/disparos/realizados">Realizados ({feitos.length})</Link>
            : <Link className="btn" href="/oficial/disparos">Em andamento ({ativos.length})</Link>}
          <Link className="btn primary" href="/oficial/disparador">+ Novo disparo</Link>
        </span>
      </div>
      {erro && <div className="teste-erro">{erro}</div>}
      {!mostra.length && (
        <div className="card"><div className="card-pad muted">
          {modo === "andamento"
            ? <>Nenhum disparo rodando agora. {feitos.length > 0 && <>Os que já terminaram estão em <Link href="/oficial/disparos/realizados">Realizados</Link>.</>}</>
            : <>Nenhum disparo concluído nos últimos 7 dias.</>}
        </div></div>
      )}

      {modo === "andamento" && mostra.map((d) => {
        const st = ROT_STATUS[d.status];
        const fim = d.status === "rodando" && d.total > d.feitos ? Date.now() + (d.total - d.feitos) * d.intervaloSeg * 1000 : 0;
        return (
          <div key={d.id} className="card"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 15 }}>{d.titulo}</b>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${st.cor}`, color: st.cor }}>{st.txt}</span>
                  <Origem d={d} />
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {d.nota ? `${d.nota} · ` : ""}começou {dataHora(d.inicio)} · 1 a cada {d.intervaloSeg}s{fim > 0 && <> · termina ~{hora(fim)}</>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {d.origem === "fluxo" && d.fluxoId && <Link className="btn" href={`/fluxos/${encodeURIComponent(d.fluxoId)}`}>Abrir fluxo</Link>}
                {d.status === "rodando"
                  ? <button className="btn" disabled={!!ocupado} onClick={() => acao(d.id, "pausar")}>Pausar</button>
                  : <button className="btn primary" disabled={!!ocupado} onClick={() => acao(d.id, "retomar")}>Retomar</button>}
                {confirmaParar === d.id
                  ? <button className="btn danger" disabled={!!ocupado} onClick={() => acao(d.id, "parar")}>Confirmar parar</button>
                  : <button className="btn" disabled={!!ocupado} onClick={() => setConfirmaParar(d.id)} title="Cancela os envios que faltam">Parar</button>}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span><b>{d.feitos}</b> de {d.total} enviados</span>
                <span className="muted">{pct(d.feitos, d.total)}%{d.total > d.feitos ? ` · faltam ${d.total - d.feitos}` : ""}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                <div style={{ width: pct(d.feitos, d.total) + "%", height: "100%", background: d.status === "pausado" ? "#C98A00" : "var(--accent)", transition: "width .6s" }} />
              </div>
            </div>
            <Detalhe d={d} />
          </div></div>
        );
      })}

      {modo === "realizados" && mostra.length > 0 && (
        <div className="card">
          {mostra.map((d) => {
            const st = ROT_STATUS[d.status];
            const on = aberto === d.id;
            return (
              <div key={d.id} style={{ borderBottom: "1px solid var(--line-2)" }}>
                <button type="button" className="disp-linha" onClick={() => setAberto(on ? "" : d.id)} aria-expanded={on}>
                  <span className="disp-seta" aria-hidden="true">{on ? "▾" : "▸"}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.titulo}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{dataHora(d.inicio)} · <span style={{ color: st.cor, fontWeight: 700 }}>{st.txt}</span></span>
                  </span>
                  <Origem d={d} />
                  <span className="disp-nums">
                    <span title="Enviados"><b>{soma(d, "total") || d.feitos}</b> env.</span>
                    <span title="Entregues"><b>{soma(d, "entregues")}</b> entr.</span>
                    <span title="Lidas"><b>{soma(d, "lidas")}</b> lidas</span>
                    <span title="Falhas" style={{ color: soma(d, "falhas") ? "var(--crit)" : undefined }}><b>{soma(d, "falhas")}</b> falhas</span>
                  </span>
                </button>
                {on && (
                  <div className="card-pad" style={{ display: "grid", gap: 12, paddingTop: 4 }}>
                    {d.origem === "fluxo" && d.fluxoId && <div><Link className="btn" href={`/fluxos/${encodeURIComponent(d.fluxoId)}`}>Abrir fluxo</Link></div>}
                    <Detalhe d={d} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {popup && <ListaContatos d={popup.d} status={popup.status} onClose={() => setPopup(null)} />}
    </div>
  );
}

// POPUP: a lista de contatos de um status do disparo. Exportar (CSV) e Etiquetar (todos da lista).
function ListaContatos({ d, status, onClose }: { d: Disparo; status: StatusLista; onClose: () => void }) {
  const [itens, setItens] = useState<Contato[] | null>(null);
  const [erro, setErro] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [novaTag, setNovaTag] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState("");

  useEffect(() => {
    jget(`/api/oficial/disparos/contatos?id=${encodeURIComponent(d.id)}&status=${status}`)
      .then((r) => setItens(r.contatos ?? [])).catch((e) => { setErro(e.message); setItens([]); });
    jget("/api/app/tags").then((r) => setTags((r.tags ?? []).map((x: any) => String(x.tag ?? x)))).catch(() => {});
  }, [d.id, status]);

  function exportar() {
    if (!itens?.length) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["nome", "telefone", "template", "status", "erro", "enviado_em"].join(";")];
    for (const c of itens) linhas.push([c.name ?? "", c.phone, c.template ?? "", c.ack ?? "", c.erro ?? "", c.ts ? new Date(c.ts * 1000).toLocaleString("pt-BR") : ""].map(esc).join(";"));
    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `disparo-${status}-${new Date(d.inicio).toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function etiquetar() {
    const t = (novaTag.trim() || tag).trim();
    if (!t || !itens?.length) return;
    setAplicando(true); setErro(""); setFeito("");
    try {
      if (novaTag.trim() && !tags.includes(t)) { await jsend("/api/app/tags/create", "POST", { tag: t }); setTags((x) => [...x, t]); }
      const r = await jsend("/api/oficial/disparos/tag", "POST", { id: d.id, status, tag: t });
      setFeito(`Etiqueta "${t}" aplicada em ${r.aplicados ?? itens.length} contato(s).`);
      setNovaTag(""); setTag(t);
    } catch (e: any) { setErro(e.message); }
    setAplicando(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: "min(860px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{ROT_LISTA[status]} · {itens ? itens.length : "…"}</b>
            <div className="muted" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.titulo}</div>
          </div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={exportar} disabled={!itens?.length}>Exportar CSV</button>
          <button className="btn ic" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="card-pad" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Etiquetar todos:</span>
          <select className="inp" style={{ width: 220 }} value={tag} onChange={(e) => { setTag(e.target.value); setNovaTag(""); }}>
            <option value="">— escolher etiqueta —</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12.5 }}>ou</span>
          <input className="inp" style={{ width: 220 }} placeholder="criar nova etiqueta…" value={novaTag} onChange={(e) => { setNovaTag(e.target.value); if (e.target.value) setTag(""); }} />
          <button className="btn primary" onClick={etiquetar} disabled={aplicando || !(novaTag.trim() || tag) || !itens?.length}>
            {aplicando ? "Aplicando…" : novaTag.trim() && !tags.includes(novaTag.trim()) ? "Criar e aplicar" : "Aplicar"}
          </button>
          {feito && <span style={{ fontSize: 12.5, color: "var(--accent-deep)", fontWeight: 600 }}>{feito}</span>}
        </div>
        {erro && <div className="teste-erro" style={{ margin: "8px 16px 0" }}>{erro}</div>}
        <div style={{ overflow: "auto", padding: "0 16px 16px" }}>
          {itens === null ? <div className="muted" style={{ padding: 14 }}>Carregando…</div> : !itens.length ? <div className="muted" style={{ padding: 14 }}>Nenhum contato nesta lista.</div> : (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr className="muted" style={{ textAlign: "left", position: "sticky", top: 0, background: "var(--surface)" }}>
                <th style={{ padding: "6px" }}>Nome</th><th style={{ padding: "6px" }}>Telefone</th><th style={{ padding: "6px" }}>Template</th><th style={{ padding: "6px" }}>Status</th>{status === "falhas" && <th style={{ padding: "6px" }}>Motivo</th>}<th style={{ padding: "6px" }}>Quando</th><th />
              </tr></thead>
              <tbody>
                {itens.map((c) => (
                  <tr key={c.phone + (c.ts ?? "")} style={{ borderTop: "1px solid var(--line-2)" }}>
                    <td style={{ padding: "6px" }}>{c.name || <span className="muted">—</span>}</td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}><Link className="disp-tel" href={`/oficial/inbox?abrir=${encodeURIComponent(c.phone)}`} title="Abrir a conversa no WPP Api">{fmtNumber(c.phone)}</Link></td>
                    <td style={{ padding: "6px" }}>{c.template}</td>
                    <td style={{ padding: "6px" }}>{c.ack === "read" ? "lida" : c.ack === "delivered" ? "entregue" : c.ack === "failed" ? "falhou" : c.ack === "sent" ? "enviada" : c.ack || "—"}</td>
                    {status === "falhas" && <td style={{ padding: "6px", color: "var(--crit)" }}>{c.erro}</td>}
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{c.ts ? new Date(c.ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</td>
                    <td style={{ padding: "6px" }}><Link className="btn" style={{ padding: "3px 10px", fontSize: 12 }} href={`/oficial/inbox?abrir=${encodeURIComponent(c.phone)}`}>Conversar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
