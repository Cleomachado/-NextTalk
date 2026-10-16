"use client";

// Botão "Pausar IA" do chat (WPP ao Vivo e WPP Api). Pedido do dono, 02/10: "entrou um lead e
// assumimos pelo celular" — a IA seguia respondendo no meio da conversa do humano. O motor já
// pausava SOZINHO quando o dono responde pelo app do celular (android/ios), mas não quando a
// resposta sai do WhatsApp Web/Desktop (vem como "web", igual ao que o próprio motor envia) — e não
// havia como pausar na mão nem ver se a conversa estava pausada. Este botão faz os dois: mostra o
// estado (inclusive da pausa automática) e deixa pausar/retomar, com prazo.
import { useCallback, useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";

interface EstadoPausa { temIa?: boolean; pausado: boolean; ate: string | null; semPrazo?: boolean; horasPadrao?: number }

export function PausaIa({ chatId, style, account }: { chatId: string; style?: React.CSSProperties; account?: string }) {
  const [st, setSt] = useState<EstadoPausa | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  const ler = useCallback(() => {
    jget("/api/inbox/pausa?chatid=" + encodeURIComponent(chatId)).then((d) => setSt(d)).catch(() => setSt(null));
  }, [chatId]);
  // Relê a cada 30s: a pausa AUTOMÁTICA (dono respondeu pelo celular) acontece fora desta tela.
  useEffect(() => { setSt(null); setAberto(false); ler(); const t = setInterval(ler, 15_000); return () => clearInterval(t); }, [ler]);
  // Enviar uma mensagem à mão pausa a IA no servidor; o chat avisa por este evento e o botão relê
  // em seguida (com um respiro, pro servidor terminar de gravar a pausa).
  useEffect(() => {
    const rever = () => { setTimeout(ler, 900); };
    window.addEventListener("zc-pausa-rever", rever);
    return () => window.removeEventListener("zc-pausa-rever", rever);
  }, [ler]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function muda(pausar: boolean, horas?: number) {
    setOcupado(true);
    try {
      const r = await jsend("/api/inbox/pausa", "POST", { chatid: chatId, pausar, ...(horas != null ? { horas } : {}) });
      setSt((a) => ({ ...(a ?? { pausado: false, ate: null }), ...r }));
    } catch (e: any) {
      alert("Não consegui " + (pausar ? "pausar" : "retomar") + " a IA: " + (e?.message || "erro desconhecido"));
    }
    setOcupado(false); setAberto(false);
  }

  // A IA ASSUME a conversa (14/10): o lead escreveu antes de a IA estar ligada e ficou sem resposta.
  // Responder pelo painel pausaria a IA (conta como humano); isto faz o Atendente IA responder a
  // última mensagem recebida, como se ela tivesse acabado de chegar.
  async function assumir() {
    setOcupado(true);
    try {
      const r = await jsend("/api/atendente/assumir", "POST", { phone: chatId, account: account ?? "lite" });
      alert("A IA respondeu a: \"" + String(r.fala ?? "").slice(0, 80) + "\"");
    } catch (e: any) {
      alert("A IA não conseguiu assumir: " + (e?.message || "erro desconhecido"));
    }
    setOcupado(false); setAberto(false);
  }

  const padrao = st?.horasPadrao ?? 6;
  const ateTxt = !st?.ate ? "" : st.semPrazo ? "até você retomar"
    : "até " + new Date(st.ate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="pausa-ia" ref={caixa} style={style}>
      {/* Conta sem IA ligada: nada a pausar, então nada aparece (evita "IA pausada" fantasma). */}
      {st && st.temIa !== false && (
        <button
          type="button"
          className={"btn ic pausa-ia-btn" + (st.pausado ? " pausada" : "")}
          disabled={ocupado}
          onClick={() => setAberto((v) => !v)}
          title={st.pausado ? `Nenhuma IA responde nesta conversa ${ateTxt}` : "Pausar toda IA só nesta conversa: Atendente IA e agentes dos fluxos"}
        >
          <Icon name={st.pausado ? "pause" : "bot"} size={14} />
          {st.pausado ? <span className="rot">IA pausada <small>{ateTxt}</small></span> : <span className="rot">Pausar IA</span>}
        </button>
      )}
      {st && aberto && (
        <div className="pausa-ia-menu" role="menu">
          {st.pausado ? (
            <>
              <button type="button" role="menuitem" onClick={() => muda(false)}><Icon name="play" size={13} /> Retomar a IA agora</button>
              <button type="button" role="menuitem" onClick={() => muda(true, 24)}>Manter pausada por 24 horas</button>
              <button type="button" role="menuitem" onClick={() => muda(true, 0)}>Manter pausada até eu retomar</button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={assumir}><Icon name="bot" size={13} /> IA responde a última mensagem agora</button>
              <button type="button" role="menuitem" onClick={() => muda(true)}>Pausar por {padrao} horas</button>
              <button type="button" role="menuitem" onClick={() => muda(true, 24)}>Pausar por 24 horas</button>
              <button type="button" role="menuitem" onClick={() => muda(true, 0)}>Pausar até eu retomar</button>
            </>
          )}
          <div className="pausa-ia-nota">Vale só para esta conversa. Com a IA pausada, nada automático responde aqui: nem o Atendente IA, nem os agentes dos fluxos, nem fluxos e follow-ups.</div>
        </div>
      )}
    </div>
  );
}
