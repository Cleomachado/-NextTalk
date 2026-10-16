"use client";
// POPUP DE CONTATOS (pedido do dono, 13/10): uma lista de pessoas (nome + telefone clicável, que
// abre a conversa no WPP Api), com Exportar CSV e Etiquetar todos (etiqueta da conta ou nova).
// Reusado onde houver um número que vira lista: botões de template nas Métricas, disparos etc.
import Link from "next/link";
import { useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { fmtNumber } from "@/components/accounts";

export type ContatoLista = { phone: string; name?: string | null; ts?: number; info?: string | null };

export function ContatosPopup({ titulo, subtitulo, carregar, exportNome, colunaInfo, onClose }: {
  titulo: string; subtitulo?: string;
  carregar: () => Promise<{ contatos: ContatoLista[]; aviso?: string }>;
  exportNome: string; colunaInfo?: string; onClose: () => void;
}) {
  const [itens, setItens] = useState<ContatoLista[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const [novaTag, setNovaTag] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [feito, setFeito] = useState("");

  useEffect(() => {
    carregar().then((r) => { setItens(r.contatos ?? []); setAviso(r.aviso ?? ""); }).catch((e) => { setErro(e.message); setItens([]); });
    jget("/api/app/tags").then((r) => setTags((r.tags ?? []).map((x: any) => String(x.tag ?? x)))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportar() {
    if (!itens?.length) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["nome", "telefone", colunaInfo || "info", "quando"].join(";")];
    for (const c of itens) linhas.push([c.name ?? "", c.phone, c.info ?? "", c.ts ? new Date(c.ts * 1000).toLocaleString("pt-BR") : ""].map(esc).join(";"));
    const blob = new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = exportNome + ".csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function etiquetar() {
    const t = (novaTag.trim() || tag).trim();
    if (!t || !itens?.length) return;
    setAplicando(true); setErro(""); setFeito("");
    try {
      if (novaTag.trim() && !tags.includes(t)) { await jsend("/api/app/tags/create", "POST", { tag: t }); setTags((x) => [...x, t]); }
      const r = await jsend("/api/contacts/tag-lote", "POST", { phones: itens.map((c) => c.phone), tag: t });
      setFeito(`Etiqueta "${t}" aplicada em ${r.aplicados ?? itens.length} contato(s).`);
      setNovaTag(""); setTag(t);
    } catch (e: any) { setErro(e.message); }
    setAplicando(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ width: "min(760px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--line)" }}>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{titulo}{itens ? ` · ${itens.length}` : ""}</b>
            {subtitulo && <div className="muted" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitulo}</div>}
          </div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={exportar} disabled={!itens?.length}>Exportar CSV</button>
          <button className="btn ic" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="card-pad" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Etiquetar todos:</span>
          <select className="inp" style={{ width: 200 }} value={tag} onChange={(e) => { setTag(e.target.value); setNovaTag(""); }}>
            <option value="">— escolher etiqueta —</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12.5 }}>ou</span>
          <input className="inp" style={{ width: 200 }} placeholder="criar nova etiqueta…" value={novaTag} onChange={(e) => { setNovaTag(e.target.value); if (e.target.value) setTag(""); }} />
          <button className="btn primary" onClick={etiquetar} disabled={aplicando || !(novaTag.trim() || tag) || !itens?.length}>
            {aplicando ? "Aplicando…" : novaTag.trim() && !tags.includes(novaTag.trim()) ? "Criar e aplicar" : "Aplicar"}
          </button>
          {feito && <span style={{ fontSize: 12.5, color: "var(--accent-deep)", fontWeight: 600 }}>{feito}</span>}
        </div>
        {erro && <div className="teste-erro" style={{ margin: "8px 16px 0" }}>{erro}</div>}
        {aviso && <div className="muted" style={{ margin: "10px 16px 0", fontSize: 13, lineHeight: 1.5 }}>{aviso}</div>}
        <div style={{ overflow: "auto", padding: "0 16px 16px" }}>
          {itens === null ? <div className="muted" style={{ padding: 14 }}>Carregando…</div> : !itens.length ? (aviso ? null : <div className="muted" style={{ padding: 14 }}>Nenhum contato nesta lista.</div>) : (
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr className="muted" style={{ textAlign: "left", position: "sticky", top: 0, background: "var(--surface)" }}>
                <th style={{ padding: "6px" }}>Nome</th><th style={{ padding: "6px" }}>Telefone</th>{colunaInfo && <th style={{ padding: "6px" }}>{colunaInfo}</th>}<th style={{ padding: "6px" }}>Quando</th><th />
              </tr></thead>
              <tbody>
                {itens.map((c) => (
                  <tr key={c.phone + (c.ts ?? "")} style={{ borderTop: "1px solid var(--line-2)" }}>
                    <td style={{ padding: "6px" }}>{c.name || <span className="muted">—</span>}</td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}><Link className="disp-tel" href={`/oficial/inbox?abrir=${encodeURIComponent(c.phone)}`} title="Abrir a conversa no WPP Api">{fmtNumber(c.phone)}</Link></td>
                    {colunaInfo && <td style={{ padding: "6px" }}>{c.info}</td>}
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
