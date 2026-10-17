"use client";

// Página "Novidades": o changelog do produto em linha do tempo. O conteúdo vive em lib/novidades.ts
// (é lá que se escreve o que saiu). Quem marca como lida é o Shell — ele já sabe a rota atual.
import { useEffect, useState } from "react";
import { NOVIDADES, VERSAO_ATUAL } from "@/lib/novidades";
import { jsend } from "@/lib/client";

const fmtData = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

// Caixa "Envie sua sugestão" (17/10/2026): abre um pop-up já com nome e e-mail de quem está logado;
// a pessoa põe o WhatsApp e o texto, e o motor guarda + avisa o dono no WhatsApp (fluxo de
// sugestões do workspace principal). O WhatsApp digitado fica lembrado neste navegador (conveniência).
function SugestaoBox() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    fetch("/api/auth/session").then((r) => r.json()).then((s) => {
      if (s?.user?.name) setNome((v) => v || s.user.name);
      if (s?.user?.email) setEmail((v) => v || s.user.email);
    }).catch(() => {});
    try { const t = localStorage.getItem("zc-sugestao-tel"); if (t) setTelefone((v) => v || t); } catch {}
  }, [aberto]);

  async function enviar() {
    setErro("");
    if (texto.trim().length < 3) return setErro("Escreva a sua sugestão.");
    if (telefone.replace(/\D/g, "").length < 10) return setErro("Informe o seu WhatsApp com DDD.");
    setEnviando(true);
    try {
      await jsend("/api/sugestao", "POST", { nome, email, telefone, texto });
      try { localStorage.setItem("zc-sugestao-tel", telefone); } catch {}
      setOk(true);
      setTexto("");
    } catch (e: any) {
      setErro(e?.message || "Não consegui enviar agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="card sug-card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <b style={{ fontSize: 15 }}>Tem uma ideia pro ZapConverte?</b>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: "4px 0 0" }}>
              Mande a sua sugestão. Ela chega direto no WhatsApp do dono, e boa parte do que está aqui embaixo nasceu de pedido de cliente.
            </p>
          </div>
          <button className="btn primary" onClick={() => { setOk(false); setErro(""); setAberto(true); }}>Enviar sugestão</button>
        </div>
      </div>

      {aberto && (
        <div className="modal-overlay" onClick={() => !enviando && setAberto(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-x" aria-label="Fechar" onClick={() => setAberto(false)}>×</button>
            <div className="modal-head">
              <h2>Envie sua sugestão</h2>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>Conta o que você gostaria de ver no ZapConverte.</p>
            </div>
            {ok ? (
              <div style={{ display: "grid", gap: 14 }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>Sugestão enviada. Obrigado! O dono recebe agora mesmo no WhatsApp e pode te chamar por lá.</p>
                <div><button className="btn primary" onClick={() => setAberto(false)}>Fechar</button></div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field"><label>Nome</label><input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
                <div className="field"><label>E-mail</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="field"><label>WhatsApp (com DDD)</label><input className="inp" inputMode="tel" placeholder="Ex.: 11 91234-5678" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
                <div className="field"><label>Sua sugestão</label><textarea className="inp" rows={5} maxLength={2000} placeholder="O que você gostaria que o ZapConverte fizesse?" value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
                {erro && <p style={{ color: "var(--crit)", fontSize: 13, margin: 0 }}>{erro}</p>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</button>
                  <button className="btn primary" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function NovidadesView() {
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>Novidades</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            O que melhoramos pra você. A ferramenta evolui toda semana — você está na versão <b>v{VERSAO_ATUAL}</b>.
          </p>
        </div>
      </div>

      <SugestaoBox />

      {NOVIDADES.map((v) => (
        <div key={v.versao} style={{ marginBottom: 22 }}>
          <div className="nov-ver">
            <span className="nov-ver-num">v{v.versao}</span>
            <span className="muted" style={{ fontSize: 12 }}>{fmtData(v.data)}</span>
          </div>
          <div className="nov-lista">
            {v.itens.map((it) => (
              <div key={it.titulo} className="nov-item">
                <div className="card">
                  <div className="card-pad">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <b style={{ fontSize: 14.5 }}>{it.titulo}</b>
                      <span className={"nov-tag" + (it.tipo === "novo" ? " novo" : "")}>{it.tipo === "novo" ? "NOVO" : "MELHORIA"}</span>
                    </div>
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{it.texto}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}
