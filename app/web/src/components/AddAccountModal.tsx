"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

function normalizeQr(qr?: string): string {
  if (!qr) return "";
  return qr.startsWith("data:") ? qr : "data:image/png;base64," + qr;
}

// reconectando: veio do aviso de "número caiu" no seletor de contas — pula a escolha de tipo
// (já sabemos que é LITE) e vai direto pro QR, com o nome do número pra deixar claro que é
// RECONEXÃO (mesma instância, histórico intacto) e não um número novo.
export function AddAccountModal({ onClose, reconectando }: { onClose: () => void; reconectando?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"choose" | "qr">(reconectando ? "qr" : "choose");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (reconectando) connectLite(); }, []);

  // 🎟️ Quantos números o plano dá e quantos já estão em uso. O teto vale pros DOIS tipos somados
  // (1 na assinatura = 1 número, QR ou oficial), então o aviso aparece nos dois cartões — antes
  // de escanear QR ou de atravessar o wizard da Meta pra tomar um 403 no fim.
  const [uso, setUso] = useState<{ limit: number | null; total: number; lite: number; oficial: number } | null>(null);
  useEffect(() => { jget("/api/numeros").then(setUso).catch(() => {}); }, []);
  const noTeto = !!uso && uso.limit !== null && uso.total >= uso.limit;

  function connectApi() {
    if (noTeto) return;
    onClose();
    // ?novo=1 abre JÁ o formulário de número novo. Sem isso, quem já tem um número conectado caía
    // na tela de "conta conectada", onde o único botão é Reconfigurar — que sobrescreve o número
    // que está funcionando em vez de adicionar outro.
    router.push("/oficial?novo=1");
  }

  async function connectLite() {
    setBusy(true);
    setMsg("");
    try {
      const r = await jsend("/api/lite/init", "POST", { name: "WhatsApp Lite" });
      setQr(normalizeQr(r.qrcode));
      setPhase("qr");
      startPoll(r.account); // id OPACO — o token da instância nunca chega ao navegador
    } catch (e: any) {
      setMsg(e.message); // o motor já responde em linguagem de gente (ex.: limite de números do plano)
    } finally {
      setBusy(false);
    }
  }

  function startPoll(conta: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await jget("/api/lite/status?account=" + encodeURIComponent(conta));
        if (s.qrcode) setQr(normalizeQr(s.qrcode));
        if (s.status === "connected") {
          if (pollRef.current) clearInterval(pollRef.current);
          setConnected(true);
          // NÃO fecha/recarrega sozinho: o cliente precisa LER o aviso de sincronização (deixe o
          // WhatsApp aberto). Ele fecha no botão — aí sim recarrega o seletor de contas.
        }
      } catch {
        /* segue tentando */
      }
    }, 3000);
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar">×</button>

        {phase === "choose" ? (
          <>
            <div className="modal-head">
              <h2>Adicionar um número</h2>
              <p className="muted" style={{ fontSize: 13 }}>Escolha qual tipo de conexão você quer.</p>
            </div>

            {noTeto && uso && (
              <div className="teto-plano">
                <Icon name="warn" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <b>Seu plano inclui {uso.limit} número{(uso.limit ?? 1) > 1 ? "s" : ""} do WhatsApp</b> e você já está usando{" "}
                  {[uso.lite ? `${uso.lite} pelo QR` : "", uso.oficial ? "1 pela API Oficial" : ""].filter(Boolean).join(" e ")}.
                  O limite vale pros dois tipos somados. Pra conectar mais um, fale com a gente que liberamos.
                </div>
              </div>
            )}

            <div className="cmp-grid">
              <div className="cmp-card lite">
                <div className="cmp-top">
                  <span className="cmp-badge lite">LITE</span>
                  <h3>WhatsApp normal</h3>
                </div>
                <div className="cmp-sub">Seu número espelhado por QR (tipo WhatsApp Web)</div>
                <ul className="cmp-list">
                  <li>Conecta em 1 minuto — só escanear o QR</li>
                  <li><b>Automação de grupo</b> (boas-vindas, resumo com IA, marcar todos) — a oficial não faz</li>
                  <li>Envia áudio (PTT), vídeo bolinha (PTV) e figurinha</li>
                  <li>Sem aprovação de template — manda a mensagem que quiser</li>
                  <li>Sem custo por mensagem</li>
                </ul>
                <div className="cmp-warn" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}><Icon name="warn" size={15} style={{ flexShrink: 0, marginTop: 1 }} />É não-oficial — use com moderação pra evitar bloqueio.</div>
                <button className="btn primary cmp-btn" onClick={connectLite} disabled={busy || noTeto}
                  title={noTeto ? "Você já usou os números do seu plano" : undefined}>
                  {busy ? "Gerando QR…" : noTeto ? "Limite do plano atingido" : "Conectar por QR"}
                </button>
                {msg && <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: "center", color: "var(--crit)" }}>{msg}</div>}
              </div>

              <div className="cmp-card api">
                <div className="cmp-top">
                  <span className="cmp-badge api">API</span>
                  <h3>WhatsApp API Oficial</h3>
                </div>
                <div className="cmp-sub">Cloud API da Meta — oficial e feita pra escalar</div>
                <ul className="cmp-list">
                  <li>Oficial e estável — sem risco de bloqueio por ser não-oficial</li>
                  <li><b>Selo verde</b> de conta verificada</li>
                  <li><b>Disparo em massa</b> (broadcast) com métricas de entrega e leitura</li>
                  <li>Templates aprovados com botões, catálogo e carrossel</li>
                  <li>Vários atendentes — pronto pra crescer</li>
                </ul>
                <div className="cmp-warn">Requer BM verificada + número dedicado + custo por conversa (tabela Meta).</div>
                <button className="btn primary cmp-btn" onClick={connectApi} disabled={noTeto}
                  title={noTeto ? "Você já usou os números do seu plano" : undefined}>
                  {noTeto ? "Limite do plano atingido" : "Conectar API Oficial"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <div className="modal-head" style={{ marginBottom: 12 }}>
              <h2>{connected ? "Conectado! 🎉" : reconectando ? `Reconectando ${reconectando}` : "Escaneie o QR code"}</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                {connected
                  ? "Número conectado com sucesso."
                  : reconectando
                  ? "É a MESMA instância — seu histórico de conversas continua todo aqui. No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho."
                  : "No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho."}
              </p>
            </div>

            {connected ? (
              <>
                <div style={{ fontSize: 56 }}><Icon name="check" size={56} style={{ color: "var(--accent)" }} /></div>
                {/* Depois do QR, o WhatsApp sincroniza o histórico progressivamente (grupos costumam
                    vir primeiro) — e SÓ com o celular online. Sem este aviso, o cliente acha que
                    "só aparece grupo" e que está quebrado (caso de uma cliente, 16/08). */}
                <div className="sync-aviso">
                  <span className="sync-spin" aria-hidden="true" />
                  <div>
                    <b>Sincronizando suas conversas…</b>
                    <div>Deixe o <b>WhatsApp aberto no celular</b> por alguns minutos, com internet. As conversas
                    e as fotos vão aparecendo aos poucos — os grupos costumam vir primeiro.</div>
                  </div>
                </div>
                <button className="btn primary" style={{ marginTop: 16 }} onClick={() => { onClose(); window.location.reload(); }}>
                  Entendi, continuar
                </button>
              </>
            ) : qr ? (
              <>
                <div style={{ display: "inline-block", background: "#fff", padding: 12, borderRadius: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR code" width={240} height={240} style={{ display: "block", width: 240, height: 240 }} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>Aguardando você escanear…</div>
              </>
            ) : msg ? (
              <div style={{ fontSize: 13, color: "var(--crit)" }}>{msg}</div>
            ) : (
              <div className="muted">Gerando QR…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
