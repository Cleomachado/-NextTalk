"use client";

// Faixa "WhatsApp desconectado" no topo do painel. Nasceu do caso do Dr. Exemplo (03/10): o celular
// desvinculou o aparelho às 07:42 e, ao entrar, ele caiu na tela de PRIMEIRO ACESSO ("Falta pouco,
// conecte seu WhatsApp") — sem acesso às conversas que já tinha. A regra agora: quem já espelhou
// um número entra no painel normal (o histórico continua na UazAPI mesmo offline) e vê ESTA faixa,
// com o botão de reconectar na mão. Vale pra todo mundo (cliente e admin), ver
// [[feedback-replicar-clientes]]. A API Oficial não entra aqui: ela não cai por QR.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccounts, fmtNumber } from "@/components/accounts";
import { AddAccountModal } from "@/components/AddAccountModal";
import { Icon } from "@/components/icons";

export function AvisoDesconectado() {
  const { accounts, loading } = useAccounts();
  const [reconectando, setReconectando] = useState<string | null>(null);
  // Dispensa só pra ESTA aba/sessão (preferência cosmética → sessionStorage, não é estado de
  // operação). Volta a aparecer ao abrir o painel de novo: número caído não pode ficar esquecido.
  const [dispensados, setDispensados] = useState<string[]>([]);
  useEffect(() => {
    try { setDispensados(JSON.parse(sessionStorage.getItem("zc-offline-ok") || "[]")); } catch { /* modo privado */ }
  }, []);

  if (loading) return null;
  const caidos = accounts.filter((a) => a.type === "LITE" && !a.connected && !a.alheia && !dispensados.includes(a.id));
  if (!caidos.length) return null;
  const c = caidos[0];
  const rotulo = c.number ? fmtNumber(c.number) : c.name;

  function dispensar() {
    const prox = [...dispensados, c.id];
    setDispensados(prox);
    try { sessionStorage.setItem("zc-offline-ok", JSON.stringify(prox)); } catch { /* modo privado */ }
  }

  return (
    <>
      <div className="offline-banner" role="alert">
        <span className="offline-txt">
          <b>Seu WhatsApp {rotulo} está desconectado.</b> As conversas anteriores continuam aqui, mas
          mensagens novas não chegam e as automações não respondem até reconectar.
        </span>
        <span className="offline-acoes">
          <button className="btn primary" style={{ padding: "5px 14px", fontSize: 12.5 }} onClick={() => setReconectando(c.name || "WhatsApp")}>Reconectar QR</button>
          <button className="btn ic" aria-label="Dispensar aviso por enquanto" title="Dispensar por enquanto" onClick={dispensar}><Icon name="close" size={14} /></button>
        </span>
      </div>
      {reconectando && createPortal(
        <AddAccountModal onClose={() => setReconectando(null)} reconectando={reconectando} />,
        document.body,
      )}
    </>
  );
}
