// Fundo da conversa do WPP ao Vivo (estilo WhatsApp), escolhido pelo usuário nas Configurações.
//
// ULTRA LEVE de propósito: a escolha fica no localStorage DO NAVEGADOR (nada no banco) e os
// padrões embutidos são um SVG desenhado aqui (rabiscos próprios, no espírito do doodle do
// WhatsApp — não é o arquivo deles). Imagem própria: o upload já hospeda no /media do motor e
// aqui só guardamos a URL.
import type { CSSProperties } from "react";

const CHAVE = "zc-chat-bg";
export const EVENTO_FUNDO = "zc-chat-bg-mudou"; // Settings avisa; o Inbox aberto troca na hora

// Tile de rabiscos (180×180): carinha, estrela, coração, balão de conversa, nota musical, flor…
// Só contorno, opacidade baixa — textura, não protagonista.
function tile(traco: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <g fill="none" stroke="${traco}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="28" cy="26" r="11"/><path d="M23 24h.1M33 24h.1M23 30c1.6 1.8 8.4 1.8 10 0"/>
    <path d="M86 14l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
    <path d="M143 22c0-4 6-6 8-2 2-4 8-2 8 2 0 5-8 9-8 9s-8-4-8-9z"/>
    <path d="M22 84h26a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6H34l-8 7v-7h-4a6 6 0 0 1-6-6V90a6 6 0 0 1 6-6z"/>
    <path d="M100 92v-16l12-3v16"/><circle cx="97" cy="93" r="4"/><circle cx="109" cy="90" r="4"/>
    <circle cx="156" cy="88" r="5"/><path d="M156 76v5M156 95v5M144 88h5M163 88h5M148 80l3 3M161 93l3 3M164 80l-3 3M151 93l-3 3"/>
    <path d="M20 150c0-8 12-8 12 0 0 6-12 6-12 12M26 168h.1"/>
    <path d="M80 146l22-8-6 22-8-6z"/>
    <circle cx="150" cy="152" r="12"/><path d="M145 150c2-3 8-3 10 0M146 156h8"/>
  </g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface FundoEmbutido { id: string; label: string; css: CSSProperties }

export const FUNDOS: FundoEmbutido[] = [
  { id: "padrao", label: "Padrão", css: {} },
  { id: "claro", label: "Rabiscos claro", css: { backgroundColor: "#efeae2", backgroundImage: tile("#d8d0c2"), backgroundSize: "300px" } },
  { id: "verde", label: "Rabiscos verde", css: { backgroundColor: "#07211a", backgroundImage: tile("rgba(37,211,102,.16)"), backgroundSize: "300px" } },
  { id: "escuro", label: "Rabiscos escuro", css: { backgroundColor: "#0b0d0c", backgroundImage: tile("rgba(255,255,255,.07)"), backgroundSize: "300px" } },
];

export interface FundoSalvo { id: string; url?: string }

export function fundoAtual(): FundoSalvo {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return { id: "padrao" };
    const v = JSON.parse(raw);
    return { id: String(v.id || "padrao"), url: v.url ? String(v.url) : undefined };
  } catch {
    return { id: "padrao" };
  }
}

export function salvarFundo(sel: FundoSalvo): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(sel)); } catch { /* modo privado */ }
  try { window.dispatchEvent(new Event(EVENTO_FUNDO)); } catch { /* SSR */ }
}

// CSS pronto pra aplicar no container das mensagens.
export function cssDoFundo(sel: FundoSalvo): CSSProperties {
  if (sel.id === "custom" && sel.url) {
    return { backgroundImage: `url("${sel.url}")`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  return FUNDOS.find((f) => f.id === sel.id)?.css ?? {};
}
