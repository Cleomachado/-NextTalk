"use client";

// WhatsApp Flows (formulários nativos): telas com campos que a pessoa preenche SEM SAIR do
// WhatsApp. As telas são criadas no Gerenciador da Meta (Ferramentas da conta → Flows); aqui a
// gente LISTA os formulários da conta, ENVIA um publicado pra qualquer conversa e — o principal —
// as RESPOSTAS preenchidas caem direto no chat do WPP Api.
import { useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface Flow { id: string; name: string; status: string; categories?: string[] }

const STATUS: Record<string, { rotulo: string; cls: string }> = {
  PUBLISHED: { rotulo: "Publicado", cls: "on" },
  DRAFT: { rotulo: "Rascunho", cls: "warn" },
  DEPRECATED: { rotulo: "Descontinuado", cls: "" },
  BLOCKED: { rotulo: "Bloqueado", cls: "crit" },
  THROTTLED: { rotulo: "Limitado", cls: "warn" },
};
const CATEGORIA: Record<string, string> = {
  SIGN_UP: "Cadastro", SIGN_IN: "Login", APPOINTMENT_BOOKING: "Agendamento", LEAD_GENERATION: "Captação de lead",
  CONTACT_US: "Fale conosco", CUSTOMER_SUPPORT: "Suporte", SURVEY: "Pesquisa", OTHER: "Outro",
};

export function OficialFlows() {
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [erro, setErro] = useState("");
  const [enviarDe, setEnviarDe] = useState<Flow | null>(null);

  useEffect(() => {
    jget("/api/oficial/flows")
      .then((d) => setFlows(d.flows ?? []))
      .catch((e) => { setErro(e.message); setFlows([]); });
  }, []);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Formulários que a pessoa preenche <b>sem sair do WhatsApp</b> (nome, e-mail, agendamento, pesquisa…).
        As telas são criadas no{" "}
        <a href="https://business.facebook.com/latest/whatsapp_manager/flows" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>
          Gerenciador do WhatsApp → Flows
        </a>{" "}
        — aqui você envia os publicados e as <b>respostas caem direto no WPP Api</b>.
      </div>

      {erro && <div className="card"><div className="card-pad" style={{ color: "var(--crit)" }}>{erro}</div></div>}
      {flows === null ? (
        <div className="card"><div className="card-pad muted">Consultando a Meta…</div></div>
      ) : flows.length === 0 && !erro ? (
        <div className="card"><div className="card-pad muted">
          Nenhum formulário ainda. Crie o primeiro no Gerenciador (link acima) — leva uns 5 minutos com os modelos prontos deles.
        </div></div>
      ) : (
        <div className="tpl-list">
          {flows.map((f) => {
            const st = STATUS[f.status] ?? { rotulo: f.status, cls: "" };
            return (
              <div key={f.id} className="card tpl-card">
                <div className="tpl-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="tpl-name">{f.name}</div>
                    <div className="tpl-meta">{(f.categories ?? []).map((c) => CATEGORIA[c] ?? c).join(" · ") || "Formulário"}</div>
                  </div>
                  <span className={"tpl-status " + st.cls}>{st.rotulo}</span>
                </div>
                <div className="tpl-actions">
                  <button className="btn ic" disabled={f.status !== "PUBLISHED"}
                    title={f.status === "PUBLISHED" ? "" : "só formulários publicados podem ser enviados"}
                    onClick={() => setEnviarDe(f)}>
                    <Icon name="send" size={14} /> Enviar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {enviarDe && <EnviarFlow flow={enviarDe} onClose={() => setEnviarDe(null)} />}
    </div>
  );
}

function EnviarFlow({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [to, setTo] = useState("");
  const [texto, setTexto] = useState("");
  const [cta, setCta] = useState("Preencher");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar() {
    if (!to.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      await jsend("/api/oficial/flows/enviar", "POST", { to, flowId: flow.id, cta: cta.trim(), texto: texto.trim() });
      setMsg({ ok: true, texto: "Enviado! Quando a pessoa preencher, a resposta aparece no WPP Api." });
    } catch (e: any) {
      setMsg({ ok: false, texto: e?.message || "falha ao enviar" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-head">
          <div><h3 style={{ margin: 0 }}>Enviar formulário</h3><div className="muted" style={{ fontSize: 12.5 }}>{flow.name}</div></div>
          <button className="btn ic" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </div>
        <div className="tpl-form">
          <div className="field">
            <label>Enviar para (DDI+DDD+número)</label>
            <input className="inp" value={to} onChange={(e) => setTo(e.target.value)} placeholder="5511989998888" />
          </div>
          <div className="field">
            <label>Mensagem que acompanha</label>
            <textarea className="inp" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Preencha o formulário abaixo:" />
          </div>
          <div className="field">
            <label>Texto do botão</label>
            <input className="inp" value={cta} onChange={(e) => setCta(e.target.value)} maxLength={30} />
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Só funciona <b>dentro da janela de 24h</b> (a pessoa te escreveu há menos de 24h). Fora dela,
            use um template aprovado com botão de Flow.
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={busy || !to.trim()} onClick={enviar}>
            {busy ? "Enviando…" : "Enviar formulário"}
          </button>
          {msg && <div style={{ fontSize: 13, color: msg.ok ? "var(--accent-deep)" : "var(--crit)" }}>{msg.texto}</div>}
        </div>
      </div>
    </div>
  );
}
