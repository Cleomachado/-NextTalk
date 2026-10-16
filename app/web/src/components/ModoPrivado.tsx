"use client";
// 👁 MODO PRIVADO (16/10/2026, pedido do dono): pra gravar anúncio ou stories do painel sem expor
// cliente. Ligado, nome, número e foto dos contatos ficam embaçados (vidro jateado) nos chats; passar
// o mouse revela só aquele item. SÓ super admin. É preferência visual deste navegador (localStorage),
// não estado de operação — não muda nada no servidor.
import { useEffect, useState } from "react";

const CHAVE = "zc-modo-privado";

function aplica(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("zc-privado", on);
}

export function ModoPrivado({ ativo }: { ativo: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ativo) { aplica(false); return; }
    let salvo = false;
    try { salvo = localStorage.getItem(CHAVE) === "1"; } catch { /* sem storage: começa desligado */ }
    setOn(salvo); aplica(salvo);
  }, [ativo]);
  if (!ativo) return null;
  const muda = () => {
    const novo = !on;
    setOn(novo); aplica(novo);
    try { localStorage.setItem(CHAVE, novo ? "1" : "0"); } catch { /* ignora */ }
  };
  return (
    <button type="button" className={"btn ic modo-privado-btn" + (on ? " on" : "")} onClick={muda}
      title={on ? "Modo privado ligado: nomes, números e fotos dos clientes embaçados. Clique pra mostrar." : "Ocultar nomes, números e fotos dos clientes (pra gravar tela)"}
      aria-pressed={on} aria-label="Modo privado">
      {on ? (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" />
          <path d="M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5.1-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
        </svg>
      )}
      <span className="rot">{on ? "Dados ocultos" : "Ocultar dados"}</span>
    </button>
  );
}
