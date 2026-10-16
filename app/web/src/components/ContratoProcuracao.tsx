"use client";

// Botão "Contrato e procuração" do chat (WPP ao Vivo e WPP Api) — só pra conta com perfil
// ADVOCACIA (marcado em Clientes) e com a API de contratos salva em Configurações. Pedido do
// Admin, 04/10: o advogado clica, a IA puxa da conversa os dados do cliente (nome, CPF, endereço…),
// ele confere e gera; o sistema do escritório monta o contrato + procuração na ZapSign e devolve o
// link, que sai na mesma conversa com um clique. O motor confere o perfil de novo (advocacia.ts).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface Campo { variable: string; rotulo: string; obrigatorio: boolean }
interface EstadoAdv { perfil: string | null; configurado: boolean; campos: Campo[] }
interface RespostaContrato {
  ok?: boolean; status?: string; assinado?: boolean; link?: string; mensagem?: string;
  motivo?: string; faltando?: string; invalidos?: string; error?: string;
}

// Lido uma vez por carregamento do painel: o perfil quase nunca muda, e o chat troca de conversa toda hora.
let estadoCache: Promise<EstadoAdv | null> | null = null;
function lerEstado(): Promise<EstadoAdv | null> {
  if (!estadoCache) estadoCache = jget("/api/advocacia/status").catch(() => null);
  return estadoCache;
}

const STATUS_ROTULO: Record<string, string> = {
  aguardando_assinatura: "aguardando assinatura",
  visualizado: "o cliente abriu, ainda não assinou",
  assinado: "assinado",
  recusado: "recusado pelo cliente",
  cancelado: "cancelado",
  expirado: "expirado",
};

export function ContratoProcuracao({ phone, nome, falas, onEnviar, style }: {
  phone: string;                          // telefone do contato (só dígitos ou chatid)
  nome?: string;                          // nome do contato, pra mensagem do link
  falas: () => string[];                  // falas do LEAD que o painel tem carregadas
  onEnviar: (texto: string) => Promise<void>; // manda uma mensagem nesta conversa
  style?: React.CSSProperties;
}) {
  const [estado, setEstado] = useState<EstadoAdv | null>(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { lerEstado().then(setEstado); }, []);
  if (estado?.perfil !== "advocacia") return null;
  return (
    <>
      <button className="btn ic" style={{ flex: "none", fontWeight: 600, ...style }} onClick={() => setAberto(true)}
        title="Contrato e procuração: gerar com os dados desta conversa">
        <Icon name="file" size={14} /> <span className="rot rot-sec">Contrato e procuração</span>
      </button>
      {aberto && typeof document !== "undefined" && createPortal(
        <ModalContrato estado={estado} phone={phone} nome={nome} falas={falas} onEnviar={onEnviar} onClose={() => setAberto(false)} />,
        document.body,
      )}
    </>
  );
}

function ModalContrato({ estado, phone, nome, falas, onEnviar, onClose }: {
  estado: EstadoAdv; phone: string; nome?: string; falas: () => string[];
  onEnviar: (texto: string) => Promise<void>; onClose: () => void;
}) {
  const [fase, setFase] = useState<"lendo" | "form" | "gerando" | "pronto">("lendo");
  const [dados, setDados] = useState<Record<string, string>>({});
  const [origem, setOrigem] = useState<Record<string, string>>({});
  const [existente, setExistente] = useState<RespostaContrato | null>(null);
  const [resultado, setResultado] = useState<RespostaContrato | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    if (!estado.configurado) return;
    let vivo = true;
    // Status e extração em paralelo: o status responde rápido e já avisa se tem contrato aberto.
    jget("/api/advocacia/contrato/status?phone=" + encodeURIComponent(phone))
      .then((s: RespostaContrato) => { if (vivo && s?.status && s.status !== "sem_contrato") setExistente(s); })
      .catch(() => {});
    jsend("/api/advocacia/contrato/extrair", "POST", { phone, falas: falas() })
      .then((r: { dados: Record<string, string>; origem: Record<string, string> }) => {
        if (!vivo) return;
        setDados(r.dados ?? {}); setOrigem(r.origem ?? {}); setFase("form");
      })
      .catch((e: any) => { if (vivo) { setErro("Não consegui ler a conversa: " + e.message + ". Preencha à mão."); setFase("form"); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const faltam = estado.campos.filter((c) => c.obrigatorio && !String(dados[c.variable] ?? "").trim());

  const [modelo, setModelo] = useState<"trabalhista" | "previdenciario" | null>(null);
  // Dois modelos (pedido do dono, 09/10): o escritório gera o par trabalhista ou o previdenciário
  // com os mesmos dados; o modelo vai junto e decide os documentos.
  async function gerar(qual: "trabalhista" | "previdenciario") {
    setErro(""); setFase("gerando");
    try {
      const r: RespostaContrato = await jsend("/api/advocacia/contrato/gerar", "POST", { phone, dados, modelo: qual });
      if (r.ok && r.link) {
        setResultado(r);
        const primeiro = (dados.nome_completo || nome || "").trim().split(/\s+/)[0] || "";
        const p = primeiro ? primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR") : "";
        setTexto(`${p ? p + ", aqui" : "Aqui"} estão o contrato e a procuração para você assinar pelo celular:\n${r.link}\n\nÉ só abrir o link, conferir os seus dados e assinar. Qualquer dúvida, me chame aqui.`);
        setFase("pronto");
      } else {
        setErro(r.mensagem || r.error || "O sistema de contratos recusou os dados.");
        setFase("form");
      }
    } catch (e: any) {
      setErro(e.message || "Falhou ao gerar.");
      setFase("form");
    }
  }

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true); setErro("");
    try { await onEnviar(texto.trim()); setEnviado(true); }
    catch (e: any) { setErro("Não consegui enviar: " + e.message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar">×</button>
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>Contrato e procuração{modelo ? (modelo === "previdenciario" ? " · Previdenciário" : " · Trabalhista") : ""}</h3>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
          Os dados foram lidos da conversa e da ficha do contato. Confira antes de gerar: o documento sai com o que estiver aqui.
        </p>

        {!estado.configurado ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            Falta ligar a API de contratos do escritório. Vá em <a href="/configuracoes" style={{ fontWeight: 600 }}>Configurações → Contrato e procuração</a> e
            salve o endereço e o token.
          </div>
        ) : !modelo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Qual contrato e procuração?</div>
            {([["trabalhista", "Trabalhista", "Trabalhador contra a empresa: demissão, sem carteira, horas extras, FGTS…"],
               ["previdenciario", "Previdenciário", "INSS: aposentadoria, auxílio, BPC/LOAS, pensão, benefício negado…"]] as const).map(([k, rot, desc]) => (
              <button key={k} className="btn" style={{ textAlign: "left", padding: "14px 16px", display: "block", width: "100%" }} onClick={() => setModelo(k)}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{rot}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 400 }}>{desc}</div>
              </button>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn" onClick={onClose}>Cancelar</button></div>
          </div>
        ) : fase === "lendo" ? (
          <div className="muted" style={{ fontSize: 13.5, padding: "18px 0" }}>Lendo a conversa…</div>
        ) : fase === "pronto" && resultado ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13.5 }}><b style={{ color: "var(--accent-deep)" }}>{resultado.mensagem || "Contrato e procuração gerados."}</b></div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="inp" readOnly value={resultado.link} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn" style={{ flex: "none" }} onClick={() => navigator.clipboard?.writeText(resultado.link!)}>Copiar</button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Mensagem pro cliente</label>
            <textarea className="inp" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviado} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={onClose}>{enviado ? "Fechar" : "Agora não"}</button>
              {!enviado && <button className="btn primary" disabled={enviando || !texto.trim()} onClick={enviar}>{enviando ? "Enviando…" : "Enviar na conversa"}</button>}
            </div>
            {enviado && <div style={{ color: "var(--accent-deep)", fontSize: 12.5 }}>Enviado nesta conversa.</div>}
          </div>
        ) : (
          <>
            {existente && (
              <div className="reset-banner" style={{ marginBottom: 12, fontSize: 12.5, lineHeight: 1.5 }}>
                Este cliente já tem contrato: <b>{STATUS_ROTULO[existente.status ?? ""] ?? existente.status}</b>.
                {existente.link && <> <a href={existente.link} target="_blank" rel="noreferrer">abrir</a></>}
                {existente.status !== "assinado" && " Gerar com os mesmos dados devolve o mesmo link; dados corrigidos cancelam o anterior."}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
              {estado.campos.map((c) => {
                const largo = c.variable === "nome_completo" || c.variable === "endereco" || c.variable === "email";
                const vazio = !String(dados[c.variable] ?? "").trim();
                return (
                  <div key={c.variable} style={{ gridColumn: largo ? "1 / -1" : undefined }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", display: "flex", gap: 6 }}>
                      {c.rotulo}{c.obrigatorio && <span style={{ color: "var(--crit)" }}>*</span>}
                      {origem[c.variable] && <span style={{ fontWeight: 400 }}>· {origem[c.variable] === "conversa" ? "da conversa" : "da ficha"}</span>}
                    </label>
                    <input className="inp" value={dados[c.variable] ?? ""} disabled={fase === "gerando"}
                      style={c.obrigatorio && vazio ? { borderColor: "var(--crit)" } : undefined}
                      onChange={(e) => setDados((d) => ({ ...d, [c.variable]: e.target.value }))} />
                  </div>
                );
              })}
            </div>
            {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>{erro}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 14 }}>
              {faltam.length > 0 && <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Falta: {faltam.map((c) => c.rotulo).join(", ")}</span>}
              <button className="btn" onClick={onClose} disabled={fase === "gerando"}>Cancelar</button>
              <button className="btn" onClick={() => setModelo(null)} disabled={fase === "gerando"}>Trocar tipo</button>
              <button className="btn primary" disabled={fase === "gerando" || faltam.length > 0} onClick={() => gerar(modelo)}>
                {fase === "gerando" ? "Gerando…" : modelo === "previdenciario" ? "Gerar previdenciário" : "Gerar trabalhista"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
