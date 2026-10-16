"use client";
// 📍 Cartão de LOCALIZAÇÃO recebida/enviada — igual WhatsApp: prévia do mapa, nome do lugar,
// endereço e o link pra abrir no Google Maps. Usado pelos dois inboxes (LITE e API Oficial).
// A prévia usa os tiles públicos do OpenStreetMap (sem chave, sem custo); o pino é desenhado
// no ponto exato. Se o tile não carregar, fica só o cartão com texto e o link — nunca quebra.
import { useState } from "react";

export interface Local { lat: number; lng: number; nome?: string; endereco?: string; url?: string; aoVivo?: boolean }

const ZOOM = 16;
const TILE = 256;
const LARG = 300;
const ALT = 150;

// lat/lng → coordenada de tile "fracionária" (padrão Web Mercator dos mapas de tiles).
function tileXY(lat: number, lng: number) {
  const n = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function linkDoMapa(l: Local): string {
  return `https://www.google.com/maps?q=${l.lat},${l.lng}`;
}

export function LocalCard({ local, abrirLabel = "Abrir no Google Maps" }: { local: Local; abrirLabel?: string }) {
  const [semMapa, setSemMapa] = useState(false);
  const { x, y } = tileXY(local.lat, local.lng);
  // 2x2 tiles centrados no ponto → o pino cai no meio da janela, nunca na borda.
  const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5);
  const offX = LARG / 2 - (x - x0) * TILE;
  const offY = ALT / 2 - (y - y0) * TILE;
  const href = linkDoMapa(local);
  return (
    <div className="msg-local">
      {!semMapa && (
        <a className="msg-local-mapa" href={href} target="_blank" rel="noopener noreferrer" title={abrirLabel}
           style={{ width: LARG, height: ALT }}>
          <div style={{ position: "absolute", left: offX, top: offY, width: TILE * 2, height: TILE * 2 }}>
            {[0, 1].map((dy) => [0, 1].map((dx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={dx + "-" + dy} alt="" draggable={false} onError={() => setSemMapa(true)}
                   src={`https://tile.openstreetmap.org/${ZOOM}/${x0 + dx}/${y0 + dy}.png`}
                   style={{ position: "absolute", left: dx * TILE, top: dy * TILE, width: TILE, height: TILE }} />
            )))}
          </div>
          <svg className="msg-local-pino" width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
            <path d="M14 1C7 1 1.5 6.5 1.5 13.5c0 9 12.5 21 12.5 21s12.5-12 12.5-21C26.5 6.5 21 1 14 1z" fill="#e53935" stroke="#fff" strokeWidth="2" />
            <circle cx="14" cy="13.5" r="4.5" fill="#fff" />
          </svg>
        </a>
      )}
      <div className="msg-local-info">
        {local.aoVivo && <span className="msg-local-vivo">Localização em tempo real</span>}
        {local.nome && <span className="msg-local-nome">{local.nome}</span>}
        {local.endereco && <span className="msg-local-end">{local.endereco}</span>}
        <span className="msg-local-coord">{local.lat.toFixed(5)}, {local.lng.toFixed(5)}</span>
        <a className="msg-local-abrir" href={href} target="_blank" rel="noopener noreferrer">{abrirLabel} ↗</a>
      </div>
    </div>
  );
}
