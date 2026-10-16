"use client";

import { useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { ModalTermos } from "@/components/TermosAceite";
import { Icon } from "@/components/icons";
import { fmtNumber } from "@/components/accounts";
import { ClientFlows } from "@/components/ClientFlows";
import { ClientInbox } from "@/components/ClientInbox";
import { MetaConnect } from "@/components/MetaConnect";

function normalizeQr(qr?: string): string {
  if (!qr) return "";
  return qr.startsWith("data:") ? qr : "data:image/png;base64," + qr;
}

// SUPORTE: o cliente que trava aqui não tem pra quem perguntar — a Ana Dux parou nesta tela e
// escreveu "faço o que?" pro dono no privado (18/08). O botão põe o WhatsApp dele na tela, com a
// mensagem já escrita, no exato momento da dúvida. Ícone em SVG (regra do projeto: emoji não é ícone).
const SUPORTE_WA = "5511999999999";
function BotaoSuporte({ contexto }: { contexto: string }) {
  const texto = encodeURIComponent(`Oi! Estou no painel do ZapConverte, em "${contexto}", e preciso de ajuda.`);
  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 13 }}>Travou ou ficou em dúvida?</span>
      <a
        className="btn"
        href={`https://wa.me/${SUPORTE_WA}?text=${texto}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.25-1.38A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.2c-1.62 0-3.13-.44-4.43-1.2l-.32-.19-3.11.82.83-3.03-.21-.32A8.15 8.15 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z" />
          <path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.26-.1-.45-.15-.64.15-.19.28-.73.94-.9 1.13-.16.19-.33.21-.62.07-.29-.15-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.6-2-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.08-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.38s1.02 2.76 1.16 2.95c.15.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34z" />
        </svg>
        Falar com o suporte
      </a>
    </div>
  );
}

// Logomarcas (SVG inline, estilo app-icon) — WhatsApp (verde) e Meta (azul infinito).
function WhatsAppMark() {
  return (
    <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 11, background: "#25D366", alignItems: "center", justifyContent: "center", flex: "none", boxShadow: "0 4px 12px rgba(37,211,102,.35)" }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-label="WhatsApp">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.25-1.38A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.2c-1.62 0-3.13-.44-4.43-1.2l-.32-.19-3.11.82.83-3.03-.21-.32A8.15 8.15 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z" />
        <path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.26-.1-.45-.15-.64.15-.19.28-.73.94-.9 1.13-.16.19-.33.21-.62.07-.29-.15-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.6-2-.17-.29-.02-.44.13-.59.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.08-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.38s1.02 2.76 1.16 2.95c.15.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34z" />
      </svg>
    </span>
  );
}
// Marca da Meta em SVG INLINE (o lemniscate oficial, 2 paths). De propósito NÃO é a PNG do
// PRINTS (4,9 MB no original; ~9 KB mesmo reduzida): o vetor pesa ~1 KB, não custa request e
// fica nítido em qualquer tela/zoom. Azul da marca (#0668E1) no quadrado, símbolo branco.
function MetaMark() {
  return (
    <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 11, background: "#0668E1", alignItems: "center", justifyContent: "center", flex: "none", boxShadow: "0 4px 12px rgba(6,104,225,.35)" }}>
      <svg width="25" height="17" viewBox="0 0 287.56 191" role="img" aria-label="Meta">
        <path fill="#fff" d="M31.06,126c0,11,2.41,19.41,5.56,24.51A19,19,0,0,0,53.19,160c8.1,0,15.51-2,29.79-21.76,11.44-15.83,24.92-38,34-51.93l15.36-23.6c10.67-16.39,23-34.61,37.18-46.96C181.07,5.6,193.54,0,206.09,0c21.07,0,41.14,12.21,56.5,35.11,16.81,25.08,25,56.67,25,89.27,0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191V160c17.63,0,22-16.2,22-34.74,0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85,0-26.8,11.2-40.23,31.17-7.14,10.61-14.47,23.54-22.7,38.13l-9.06,16c-18.2,32.27-22.81,39.62-31.91,51.75C84.74,183,71.12,191,53.19,191c-21.27,0-34.72-9.21-43-23.09C3.34,156.6,0,141.76,0,124.85Z" />
        <path fill="#fff" d="M24.49,37.3C38.73,15.35,59.28,0,82.85,0c13.65,0,27.22,4,41.39,15.61,15.5,12.65,32,33.48,52.63,67.81l7.39,12.32c17.84,29.72,28,45,33.93,52.22,7.64,9.26,13,12,19.94,12,17.63,0,22-16.2,22-34.74l27.4-.86c0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191c-12.8,0-24.14-4.16-36.68-16-9.64-9.08-20.91-25.21-29.58-39.71L146.09,92.5c-12.94-21.62-24.81-37.74-31.68-45C107,38.69,97.51,28.06,82.35,28.06c-12.27,0-22.69,8.61-31.41,21.78Z" />
      </svg>
    </span>
  );
}

interface Acct { id: string; name: string; number?: string; avatar?: string; connected: boolean }

// Tela do CLIENTE (não-admin, com acesso ativo). Escopada por sessão via /api/app/* — nunca toca dados
// do admin. MVP: conectar o próprio WhatsApp por QR. Fluxos/inbox do cliente entram no próximo incremento.
export function ClientHome({ name }: { name: string }) {
  const [accounts, setAccounts] = useState<Acct[] | null>(null);
  const [tab, setTab] = useState<"whats" | "inbox" | "flows">("whats");
  const [qr, setQr] = useState("");
  const [phase, setPhase] = useState<"home" | "qr" | "oficial">("home");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => jget("/api/app/accounts").then((d) => setAccounts(d.accounts ?? [])).catch(() => setAccounts([]));
  useEffect(() => { load(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const first = (name || "").split(" ")[0] || "";
  const connected = (accounts ?? []).find((a) => a.connected);

  // ⚖️ Primeiro número do cliente: o aceite do canal vem ANTES de gerar o QR.
  const [pedirTermos, setPedirTermos] = useState(false);

  async function conectar() {
    setBusy(true); setErr("");
    try {
      const r = await jsend("/api/app/lite/init", "POST", { name: "Meu WhatsApp" });
      setQr(normalizeQr(r.qrcode));
      setPhase("qr");
      startPoll(r.account); // id OPACO — o token da instância nunca chega ao navegador
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  function startPoll(conta: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await jget("/api/app/lite/status?account=" + encodeURIComponent(conta));
        if (s.qrcode) setQr(normalizeQr(s.qrcode));
        if (s.status === "connected") {
          if (pollRef.current) clearInterval(pollRef.current);
          setTimeout(() => window.location.reload(), 1400);
        }
      } catch { /* segue tentando */ }
    }, 3000);
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/entrar";
  }

  return (
    <div className="client-wrap">
      <header className="client-top">
        <div className="brand-name" style={{ fontSize: 18 }}>Zap<span>Converte</span></div>
        {connected ? (
          <nav className="client-tabs">
            <button className={tab === "whats" ? "on" : ""} onClick={() => setTab("whats")}>📱 Meu WhatsApp</button>
            <button className={tab === "inbox" ? "on" : ""} onClick={() => setTab("inbox")}>💬 Conversas</button>
            <button className={tab === "flows" ? "on" : ""} onClick={() => setTab("flows")}>⚡ Respostas</button>
          </nav>
        ) : <span aria-hidden />}
        <button className="btn" onClick={sair}>Sair</button>
      </header>

      <main className="client-main">
        {!connected ? (
          // AINDA NÃO CONECTOU: painel focado SÓ em espelhar (sem abas — evita "nenhuma conversa/
          // resposta" confuso antes de ter número). As abas Conversas/Respostas surgem DEPOIS de conectar.
          accounts === null ? (
            <div className="muted">Carregando…</div>
          ) : phase === "qr" ? (
            <div className="client-card" style={{ textAlign: "center" }}>
              <h1 style={{ fontSize: 20 }}>Escaneie o QR code</h1>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                No celular: <b>WhatsApp → Aparelhos conectados → Conectar um aparelho</b>.
              </p>
              {qr ? (
                <>
                  <div style={{ display: "inline-block", background: "#fff", padding: 12, borderRadius: 14, marginTop: 16 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR code" width={248} height={248} style={{ display: "block", width: 248, height: 248 }} />
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>O código se renova sozinho — é só escanear.</div>
                </>
              ) : (
                <div className="muted" style={{ marginTop: 16 }}>Gerando QR…</div>
              )}
              <BotaoSuporte contexto="conectar pelo QR Code" />
            </div>
          ) : phase === "oficial" ? (
            // O WIZARD de verdade, aqui dentro. Antes esta tela era um beco sem saída ("fala com o
            // nosso time" + voltar) — quem queria a API Oficial não tinha NENHUM caminho sozinho
            // (caso real 10/08: um cliente). O MetaConnect fala com /api/meta, que o proxy
            // remapeia pro /app/meta escopado, então roda igual pro cliente.
            <div style={{ width: "100%", maxWidth: 860 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setPhase("home")}>← Voltar e escolher</button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Prefere começar em 1 minuto? Volte e conecte pelo QR — dá pra migrar pra oficial depois sem perder nada.
                </span>
              </div>
              <MetaConnect />
              <BotaoSuporte contexto="conectar a API Oficial da Meta" />
            </div>
          ) : (
            // ESCOLHA da conexão — NÃO forçamos QR: o cliente decide LITE (não-oficial) ou API Oficial.
            <div className="client-card" style={{ textAlign: "center", maxWidth: 680 }}>
              <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="ZapConverte">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <h1 style={{ fontSize: 21, marginTop: 10 }}>Bem-vindo{first ? ", " + first : ""}!</h1>
              <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Pra começar, <b>conecte seu WhatsApp</b> — escolha como:</p>
              <div className="cmp-grid" style={{ marginTop: 16, textAlign: "left" }}>
                <div className="cmp-card lite">
                  <div className="cmp-top" style={{ display: "flex", alignItems: "center", gap: 10 }}><WhatsAppMark /><h3 style={{ margin: 0 }}>WhatsApp normal</h3></div>
                  <div className="cmp-sub">Espelha seu número por QR (tipo WhatsApp Web)</div>
                  <ul className="cmp-list">
                    <li>Conecta em 1 minuto, sem burocracia</li>
                    <li>Sem custo por mensagem</li>
                    <li>Áudio, figurinha, grupos</li>
                  </ul>
                  <button className="btn primary cmp-btn" onClick={() => setPedirTermos(true)} disabled={busy}>{busy ? "Gerando QR…" : "Conectar por QR"}</button>
                </div>
                <div className="cmp-card api">
                  <div className="cmp-top" style={{ display: "flex", alignItems: "center", gap: 10 }}><MetaMark /><h3 style={{ margin: 0 }}>API Oficial (Meta)</h3></div>
                  <div className="cmp-sub">Cloud API da Meta — oficial e feita pra escalar</div>
                  <ul className="cmp-list">
                    <li>Selo verde de conta verificada</li>
                    <li>Estável, sem risco de bloqueio</li>
                    <li>Disparo em massa com métricas</li>
                  </ul>
                  <button className="btn cmp-btn" onClick={() => { setErr(""); setPhase("oficial"); }}>Quero a API Oficial</button>
                </div>
              </div>
              {err && <div style={{ color: "var(--crit)", fontSize: 13, marginTop: 12 }}>{err}</div>}
              <BotaoSuporte contexto="escolher como conectar o WhatsApp" />
            </div>
          )
        ) : tab === "inbox" ? (
          <ClientInbox />
        ) : tab === "flows" ? (
          <ClientFlows />
        ) : (
          <div className="client-card" style={{ textAlign: "center" }}>
            <Icon name="check" size={52} style={{ color: "var(--accent)" }} />
            <h1 style={{ fontSize: 21, marginTop: 8 }}>Tudo certo{first ? ", " + first : ""}! 🎉</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
              Seu WhatsApp <b>{connected.number ? fmtNumber(connected.number) : "está conectado"}</b> está no ar.
            </p>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
              Agora explore <b>Conversas</b> (ver e responder) e <b>Respostas</b> (respostas automáticas) aqui em cima.
            </p>
          </div>
        )}
      </main>
      {pedirTermos && (
        <ModalTermos
          momento="canal"
          referencia="primeiro número (tela inicial do cliente)"
          onAceito={() => { setPedirTermos(false); conectar(); }}
          onCancelar={() => setPedirTermos(false)}
        />
      )}
    </div>
  );
}
