"use client";
// Foto de perfil AMPLIADA — o que o WhatsApp mostra ao clicar na foto do contato/grupo.
// Compartilhado pelo modal de contato (WPP ao Vivo) e pelo cabeçalho da API Oficial.
// Fecha no clique fora, no ✕ e no Esc; o ⬇ abre o original em outra aba.
import { useEffect } from "react";

export function FotoZoom({ url, nome, onClose }: { url: string; nome?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="zoom-overlay wi-zoom" onClick={onClose} role="dialog" aria-modal="true">
      <button className="zoom-x" onClick={onClose} aria-label="Fechar">✕</button>
      <a className="zoom-baixar" href={url} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()} title="Abrir/baixar original">⬇</a>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nome ?? ""} onClick={(e) => e.stopPropagation()} />
      {nome && <span className="wi-zoom-nome">{nome}</span>}
    </div>
  );
}
