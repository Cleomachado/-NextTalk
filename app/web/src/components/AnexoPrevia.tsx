"use client";
// Prévia do anexo ANTES de enviar (igual WhatsApp): mostra a foto/vídeo/arquivo, deixa escrever a
// legenda e só manda no clique em Enviar (ou Enter). Pedido do dono em 13/10: escolher o arquivo
// já disparava o envio, sem chance de legenda nem de desistir.
import { useEffect, useMemo, useRef, useState } from "react";

export function AnexoPrevia({ arquivo, legendaInicial = "", semLegenda = false, enviando = false, onEnviar, onCancelar }: {
  arquivo: File;
  legendaInicial?: string;
  semLegenda?: boolean; // áudio não aceita legenda na API Oficial
  enviando?: boolean;
  onEnviar: (legenda: string) => void;
  onCancelar: () => void;
}) {
  const [legenda, setLegenda] = useState(legendaInicial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const url = useMemo(() => URL.createObjectURL(arquivo), [arquivo]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => { ref.current?.focus(); }, []);
  const tipo = arquivo.type.startsWith("image/") ? "imagem" : arquivo.type.startsWith("video/") ? "video" : arquivo.type.startsWith("audio/") ? "audio" : "doc";
  const kb = Math.max(1, Math.round(arquivo.size / 1024));
  return (
    <div className="modal-overlay" onClick={() => { if (!enviando) onCancelar(); }}>
      <div className="card" style={{ width: "min(520px, 94vw)", padding: 16, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <b style={{ fontSize: 15 }}>Enviar anexo</b>
          <button className="btn ic" onClick={onCancelar} disabled={enviando} aria-label="Cancelar">✕</button>
        </div>
        <div style={{ display: "grid", placeItems: "center", background: "var(--surface-2)", borderRadius: 10, padding: 8, minHeight: 120 }}>
          {tipo === "imagem" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "50vh", borderRadius: 8 }} />
          )}
          {tipo === "video" && <video src={url} controls style={{ maxWidth: "100%", maxHeight: "50vh", borderRadius: 8 }} />}
          {tipo === "audio" && <audio src={url} controls style={{ width: "100%" }} />}
          {tipo === "doc" && <div style={{ textAlign: "center", fontSize: 13 }}><b style={{ display: "block", wordBreak: "break-all" }}>{arquivo.name}</b><span className="muted">{kb} KB</span></div>}
        </div>
        {!semLegenda && tipo !== "audio" && (
          <textarea ref={ref} className="inp" rows={2} placeholder="Adicione uma legenda…" value={legenda}
            onChange={(e) => setLegenda(e.target.value)} disabled={enviando} style={{ resize: "none" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onCancelar(); }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!enviando) onEnviar(legenda.trim()); }
            }} />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancelar} disabled={enviando}>Cancelar</button>
          <button className="btn primary" onClick={() => onEnviar(legenda.trim())} disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}</button>
        </div>
      </div>
    </div>
  );
}
