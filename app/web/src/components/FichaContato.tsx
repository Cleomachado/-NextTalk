"use client";

// Ficha do contato — aberta clicando no nome da conversa (WPP ao Vivo e WPP Api). Pedido do
// Admin, 09/10: trocar o nome genérico e anotar e-mail, telefones, RG/CPF, gênero, endereço com
// CEP… e guardar a foto do RG/CPF. Os campos têm os MESMOS nomes do contrato/procuração e das
// variáveis dos fluxos ({{cpf}}, {{cidade}}…): o que se preenche aqui já vale lá.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROTULOS_ORIGEM } from "@/components/OrigemLead";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface Doc { id: string; tipo: string; nome: string; mime: string; tamanho: number; criado: string }
interface Ficha { phone: string; nome: string; nomeManual: boolean; notas: string; campos: Record<string, string>; docs: Doc[]; origem?: Record<string, string> }

const TIPOS_DOC = ["RG", "CPF", "CNH", "Comprovante de residência", "Carteira de trabalho", "Outro"];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const ACEITA = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

const soDig = (s: string) => s.replace(/\D/g, "");
function mascaraCpf(v: string) {
  const d = soDig(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}
function mascaraCep(v: string) {
  const d = soDig(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
function mascaraData(v: string) {
  const d = soDig(v).slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}
function tamanho(b: number) {
  return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
}

export function FichaContato({ phone, onNome }: {
  phone: string; // só dígitos
  onNome?: (nome: string) => void; // nome salvo → o chat troca o título e a lista na hora
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [notas, setNotas] = useState("");
  const [c, setC] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [sujo, setSujo] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepMsg, setCepMsg] = useState("");
  const [tipoDoc, setTipoDoc] = useState("RG");
  const [enviando, setEnviando] = useState(false);
  const [docMsg, setDocMsg] = useState("");
  const [apagar, setApagar] = useState<string | null>(null);
  const inputArq = useRef<HTMLInputElement>(null);
  const base = "/api/contacts/" + encodeURIComponent(phone);

  function aplica(f: Ficha) {
    setFicha(f);
    setNome(f.nome || "");
    setNotas(f.notas || "");
    setC(f.campos || {});
    setSujo(false);
  }
  useEffect(() => {
    let vivo = true;
    jget(base + "/ficha").then((f) => { if (vivo) aplica(f); }).catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [base]);

  const set = (k: string, v: string) => { setC((o) => ({ ...o, [k]: v })); setSujo(true); setMsg(""); };

  async function buscaCep(cep: string) {
    if (soDig(cep).length !== 8) return;
    setCepBusy(true); setCepMsg("");
    try {
      const r = await jget("/api/cep/" + soDig(cep));
      setC((o) => ({
        ...o,
        // Rua e bairro do CEP; número e complemento a pessoa completa depois da vírgula.
        endereco: o.endereco?.trim() ? o.endereco : [r.endereco, r.bairro].filter(Boolean).join(", "),
        cidade: r.cidade || o.cidade || "",
        uf: r.uf || o.uf || "",
      }));
      setSujo(true);
      if (!r.endereco) setCepMsg("CEP geral da cidade — preencha a rua à mão.");
    } catch (e: any) {
      setCepMsg(e.message);
    } finally {
      setCepBusy(false);
    }
  }

  async function salvar() {
    setSalvando(true); setMsg("");
    try {
      const f = await jsend(base + "/ficha", "PUT", { nome, notas, campos: c });
      aplica(f);
      setMsg("Ficha salva.");
      onNome?.(f.nome || "");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function enviaDocs(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true); setDocMsg("");
    try {
      for (const f of Array.from(files)) {
        if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name}: acima de 15MB`);
        const qs = new URLSearchParams({ tipo: tipoDoc, nome: f.name, mime: f.type || "application/octet-stream" });
        const r = await fetch(base + "/docs?" + qs.toString(), {
          method: "POST", headers: { "content-type": "application/octet-stream" }, body: f,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
        setFicha((o) => (o ? { ...o, docs: [d.doc, ...o.docs] } : o));
      }
    } catch (e: any) {
      setDocMsg(e.message);
    } finally {
      setEnviando(false);
      if (inputArq.current) inputArq.current.value = "";
    }
  }

  async function apagaDoc(id: string) {
    try {
      await jsend(base + "/docs/" + id, "DELETE", {});
      setFicha((o) => (o ? { ...o, docs: o.docs.filter((d) => d.id !== id) } : o));
    } catch (e: any) {
      setDocMsg(e.message);
    } finally {
      setApagar(null);
    }
  }

  if (erro) return <div className="wi-erro">{erro}</div>;
  if (!ficha) return <div className="muted fc-carregando">Carregando a ficha…</div>;

  const campo = (k: string, rotulo: string, extra?: { ph?: string; mask?: (v: string) => string; tipo?: string; largo?: boolean; onBlur?: () => void }) => (
    <label className={"fc-campo" + (extra?.largo ? " largo" : "")}>
      <span className="lbl">{rotulo}</span>
      <input className="inp" type={extra?.tipo ?? "text"} value={c[k] ?? ""} placeholder={extra?.ph}
             onChange={(e) => set(k, extra?.mask ? extra.mask(e.target.value) : e.target.value)}
             onBlur={extra?.onBlur} />
    </label>
  );
  const escolha = (k: string, rotulo: string, opcoes: string[]) => (
    <label className="fc-campo">
      <span className="lbl">{rotulo}</span>
      <select className="inp" value={c[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">—</option>
        {/* valor antigo fora da lista (veio da IA ou de planilha) continua visível */}
        {c[k] && !opcoes.includes(c[k]) && <option value={c[k]}>{c[k]}</option>}
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  const origem = ficha?.origem ?? {};
  const linhasOrigem = ROTULOS_ORIGEM.filter(([k]) => origem[k]);
  return (
    <div className="fc">
      {linhasOrigem.length > 0 && (
        <div className="fc-sec">
          <h4>De onde veio</h4>
          <div className="fc-origem">
            {linhasOrigem.map(([k, r]) => (
              <div key={k}><span className="muted">{r}</span><b>{origem[k]}</b></div>
            ))}
          </div>
        </div>
      )}
      <div className="fc-sec">
        <h4>Identificação</h4>
        <div className="fc-grade">
          <label className="fc-campo largo">
            <span className="lbl">Nome na conversa</span>
            <input className="inp" value={nome} placeholder="Como o contato aparece na lista"
                   onChange={(e) => { setNome(e.target.value); setSujo(true); setMsg(""); }} />
          </label>
          {campo("nome_completo", "Nome completo", { largo: true, ph: "Como está no documento" })}
          {campo("cpf", "CPF", { mask: mascaraCpf, ph: "000.000.000-00" })}
          {campo("rg", "RG")}
          {campo("data_nascimento", "Data de nascimento", { mask: mascaraData, ph: "dd/mm/aaaa" })}
          {escolha("genero", "Gênero", ["Masculino", "Feminino", "Outro"])}
          {escolha("estado_civil", "Estado civil", ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Separado(a)", "Viúvo(a)"])}
          {campo("profissao", "Profissão")}
          {campo("nacionalidade", "Nacionalidade", { ph: "Brasileira" })}
        </div>
      </div>

      <div className="fc-sec">
        <h4>Contato</h4>
        <div className="fc-grade">
          {campo("email", "E-mail", { tipo: "email", largo: true })}
          {campo("telefone1", "Telefone 1", { ph: "(00) 00000-0000" })}
          {campo("telefone2", "Telefone 2", { ph: "(00) 00000-0000" })}
        </div>
      </div>

      <div className="fc-sec">
        <h4>Endereço</h4>
        <div className="fc-grade">
          {campo("cep", cepBusy ? "CEP (buscando…)" : "CEP", { mask: mascaraCep, ph: "00000-000", onBlur: () => buscaCep(c.cep ?? "") })}
          <label className="fc-campo">
            <span className="lbl">Estado</span>
            <select className="inp" value={c.uf ?? ""} onChange={(e) => set("uf", e.target.value)}>
              <option value="">—</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          {campo("cidade", "Cidade", { largo: true })}
          {campo("endereco", "Endereço", { largo: true, ph: "Rua, número, complemento e bairro" })}
        </div>
        {cepMsg && <div className="fc-aviso">{cepMsg}</div>}
      </div>

      <div className="fc-sec">
        <h4>Observações</h4>
        <textarea className="inp" rows={3} value={notas} onChange={(e) => { setNotas(e.target.value); setSujo(true); setMsg(""); }} />
      </div>

      <div className="fc-salvar">
        <button className="btn primary" onClick={salvar} disabled={salvando || !sujo}>
          <Icon name="save" size={15} /> {salvando ? "Salvando…" : "Salvar ficha"}
        </button>
        {msg && <span className={msg === "Ficha salva." ? "fc-ok" : "fc-erro"}>{msg}</span>}
      </div>

      <div className="fc-sec">
        <h4>Documentos</h4>
        <div className="fc-up">
          <select className="inp" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} aria-label="Tipo do documento">
            {TIPOS_DOC.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="btn arquivo" onClick={() => inputArq.current?.click()} disabled={enviando}>
            <Icon name="plus" size={15} /> {enviando ? "Enviando…" : "Anexar foto ou PDF"}
          </button>
          <input ref={inputArq} type="file" accept={ACEITA} multiple hidden onChange={(e) => enviaDocs(e.target.files)} />
        </div>
        {docMsg && <div className="fc-erro">{docMsg}</div>}
        {ficha.docs.length === 0 ? (
          <div className="muted fc-vazio">Nenhum documento anexado.</div>
        ) : (
          <div className="fc-docs">
            {ficha.docs.map((d) => (
              <div className="fc-doc" key={d.id}>
                <a href={`${base}/docs/${d.id}`} target="_blank" rel="noreferrer" className="fc-thumb" title="Abrir em nova aba">
                  {d.mime.startsWith("image/") && !d.mime.includes("hei")
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`${base}/docs/${d.id}`} alt={d.tipo} loading="lazy" />
                    : <span className="fc-pdf">{d.mime === "application/pdf" ? "PDF" : "IMG"}</span>}
                </a>
                <div className="fc-doc-info">
                  <b>{d.tipo}</b>
                  <span className="muted" title={d.nome}>{d.nome}</span>
                  <span className="muted">{tamanho(d.tamanho)} · {new Date(d.criado).toLocaleDateString("pt-BR")}</span>
                </div>
                {apagar === d.id ? (
                  <div className="fc-doc-acoes">
                    <button className="btn danger" onClick={() => apagaDoc(d.id)}>Excluir</button>
                    <button className="btn" onClick={() => setApagar(null)}>Manter</button>
                  </div>
                ) : (
                  <div className="fc-doc-acoes">
                    <a className="btn" href={`${base}/docs/${d.id}`} target="_blank" rel="noreferrer">Abrir</a>
                    <button className="btn" onClick={() => setApagar(d.id)} aria-label="Excluir documento"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Versão em modal, pra quem não tem o "Dados da conversa" (WPP Api).
export function FichaContatoModal({ phone, nome, onClose, onNome }: { phone: string; nome: string; onClose: () => void; onNome?: (n: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wi-modal fc-modal" onClick={(e) => e.stopPropagation()}>
        <section className="wi-main">
          <div className="wi-head">
            <b>Ficha do contato</b><span className="wi-head-sub">{nome}</span>
            <button className="btn fc-fechar" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
          </div>
          <div className="wi-body"><FichaContato phone={phone} onNome={onNome} /></div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
