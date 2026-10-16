"use client";
import { useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";
import { lerArquivoContatosDetalhado, fraseResumo, type ContatoImportado, type ResumoImportacao } from "@/lib/importar-contatos";

// Modal "Importar lista": arquivo (.csv/.txt/.xlsx) → prévia → tag(s) → grava em Contatos.
// Usado em Contatos e no Disparador (lá com a lista já lida, só pra etiquetar e guardar).
export function ImportarContatosModal({ onClose, onDone, listaInicial, nomeInicial, resumoInicial }: {
  onClose: () => void;
  onDone?: (r: { importados: number; tags: string[]; contatos: ContatoImportado[] }) => void;
  listaInicial?: ContatoImportado[];
  nomeInicial?: string;
  resumoInicial?: ResumoImportacao;
}) {
  const [contatos, setContatos] = useState<ContatoImportado[]>(listaInicial ?? []);
  const [arquivo, setArquivo] = useState(nomeInicial ?? "");
  const [resumo, setResumo] = useState<ResumoImportacao | null>(resumoInicial ?? null);
  const [lendo, setLendo] = useState(false);
  const [tagTexto, setTagTexto] = useState("");
  const [tagsExistentes, setTagsExistentes] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    jget("/api/contacts/segments").then((d) => setTagsExistentes(((d?.tags ?? []) as Array<{ tag: string }>).map((t) => t.tag))).catch(() => {});
  }, []);

  async function ler(f: File) {
    setLendo(true); setErro("");
    try {
      const { contatos: lista, resumo: r } = await lerArquivoContatosDetalhado(f);
      if (!lista.length) setErro("Não achei nenhum número válido no arquivo. Use uma coluna com DDD + número (com ou sem 55).");
      setContatos(lista); setArquivo(f.name); setResumo(r);
    } catch (e: any) { setErro(e?.message || "não consegui ler o arquivo"); }
    setLendo(false);
  }

  const tags = tagTexto.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const comNome = contatos.filter((c) => c.nome).length;

  async function importar() {
    if (!contatos.length || salvando) return;
    setSalvando(true); setErro("");
    try {
      const r = await jsend("/api/contacts/import", "POST", { contatos: contatos.map((c) => ({ numero: c.numero, nome: c.nome })), tags });
      onDone?.({ importados: r.importados ?? 0, tags, contatos });
      onClose();
    } catch (e: any) { setErro(e?.message || "falha ao importar"); }
    setSalvando(false);
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-head">
          <h2>Importar lista de contatos</h2>
          <div className="muted" style={{ fontSize: 13 }}>Excel (.xlsx), .csv ou .txt. Uma linha por contato: número e, se tiver, nome.</div>
        </div>

        {contatos.length ? (
          <div className="disp2-arquivo">
            <span className="disp2-ico"><Icon name="sheet" size={15} /></span>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arquivo || "lista"}</b>
              <span className="muted" style={{ fontSize: 12 }}>{contatos.length} números válidos · {comNome} com nome</span>
            </div>
            {!listaInicial && (
              <label className="btn" style={{ marginLeft: "auto", cursor: "pointer", fontSize: 12.5 }}>
                Trocar
                <input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = ""; }} />
              </label>
            )}
          </div>
        ) : (
          <label className="disp2-drop" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) ler(f); }}>
            <Icon name="download" size={17} />
            <span>{lendo ? "lendo…" : "Arraste e solte ou"}</span>
            <span className="disp2-drop-btn">Escolher arquivo</span>
            <input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = ""; }} />
          </label>
        )}

        {resumo && fraseResumo(resumo).alerta && (
          <div style={{ marginTop: 8, fontSize: 12.5, padding: "8px 10px", borderRadius: 10, background: "color-mix(in srgb, var(--warn, #d99a00) 14%, var(--surface))", border: "1px solid color-mix(in srgb, var(--warn, #d99a00) 45%, transparent)" }}>
            <b>Ajustes feitos:</b> {fraseResumo(resumo).texto}. Hífen, parênteses, espaços e o "+" foram limpos.
          </div>
        )}
        {contatos.length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8, display: "grid", gap: 2 }}>
            {contatos.slice(0, 4).map((c) => <span key={c.numero}>+{c.numero}{c.nome ? ` · ${c.nome}` : ""}</span>)}
            {contatos.length > 4 && <span>… e mais {contatos.length - 4}</span>}
          </div>
        )}

        <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Tag para esses contatos <span className="muted" style={{ fontWeight: 400 }}>(opcional · separe com vírgula)</span></label>
          <input className="inp" list="tags-existentes" placeholder="ex.: Lista Setembro" value={tagTexto} onChange={(e) => setTagTexto(e.target.value)} />
          <datalist id="tags-existentes">{tagsExistentes.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="muted" style={{ fontSize: 12 }}>Com a tag, dá pra puxar essa lista no Disparador e nos fluxos por segmento.</div>
        </div>

        {erro && <div style={{ marginTop: 12, fontSize: 13, color: "var(--crit)" }}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={importar} disabled={!contatos.length || salvando}>
            {salvando ? "importando…" : `Importar ${contatos.length || ""} contato${contatos.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
