// Ícones de linha premium (estilo SaaS, stroke) — substituem os emojis dos nós/gatilhos.
// Um só componente <Icon name/> que desenha o SVG pelo nome. 24x24, currentColor.
import type { CSSProperties } from "react";

// Paths (stroke). Estilo Feather/Lucide.
const PATHS: Record<string, string> = {
  // passos do fluxo
  text: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  presence: "M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  wait: "M12 7v5l3 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  ptt: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8",
  ptv: "M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
  media: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  buttons: "M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 0-2 2h-4M8 12h8",
  ask: "M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  ai_agent: "M12 2v3M9 9h6v6H9zM9 1M4.5 8.5h-2M21.5 8.5h-2M4.5 15.5h-2M21.5 15.5h-2M8 4.5V2M16 4.5V2M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  notify: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  add_to_group: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  mention_all: "M3 11l18-5v13L3 14zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  note: "M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l5-5V5a2 2 0 0 0-2-2zM15 21v-4a1 1 0 0 1 1-1h4",
  // gatilhos
  keyword: "M15.5 7.5l3 3L22 7l-3-3M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0l4.1-4.1",
  // o "infinito" da Meta (etiquetas de conversão do WhatsApp)
  meta: "M12 12c-1.5-2.3-3.2-3.9-5.1-3.9C4.1 8.1 2.2 9.8 2.2 12s1.9 3.9 4.7 3.9c1.9 0 3.6-1.6 5.1-3.9zm0 0c1.5 2.3 3.2 3.9 5.1 3.9 2.8 0 4.7-1.7 4.7-3.9s-1.9-3.9-4.7-3.9c-1.9 0-3.6 1.6-5.1 3.9z",
  purchase: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  pix: "M13 2L3 14h8l-1 8 11-13h-8z",
  cart: "M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1 2h3l2.4 12.2a2 2 0 0 0 2 1.6h9.5a2 2 0 0 0 2-1.6L22 6H5",
  card: "M2 5h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM1 10h22",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
  undo: "M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10",
  redo: "M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10",
  history: "M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10M12 7v5l3 2",
  clockx: "M12 7v5l2 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8",
  spark: "M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z",
  dot: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  carousel: "M2 5v14M22 5v14M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  sheet: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 9h18M3 15h18M12 9v12",
  // utilitários (botões)
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4-4",
  play: "M5 3l14 9-14 9z",
  // conceitos de UI (cabeçalhos/botões/chips)
  money: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  ticket: "M4 7h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V8a1 1 0 0 1 1-1zM9 7v12",
  handshake: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  chart: "M3 3v18h18M7 16v-5M12 16V8M17 16v-9",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  check: "M20 6L9 17l-5-5",
  close: "M18 6L6 18M6 6l12 12",
  warn: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  mute: "M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6",
  unmute: "M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14",
  copy: "M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  tag: "M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7 7h.01",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 1 3 3",
  group: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  rocket: "M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2a2.1 2.1 0 1 0-3-3zM12 15l-3-3a22 22 0 0 1 8-11c1.5 3 1.5 7-1 11a22 22 0 0 1-4 3zM9 12H4s.5-3 2-4h3M12 15v5s3-.5 4-2v-3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  lock: "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 1 1 8 0v4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  bot: "M12 8V4M8 4h8M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM9 13v2M15 13v2",
  "chevron-left": "M15 18l-6-6 6-6",
  // "?" dentro de um círculo — botão de ajuda/tour. Traçado, pra combinar com o resto do conjunto.
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  pin: "M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.3V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.7a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z",
  "user-check": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4",
  "user-minus": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11h-6",
  "circle-minus": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8",
  "chevron-right": "M9 18l6-6-6-6",
  menu: "M3 6h18M3 12h18M3 18h18",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "eye-off": "M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22",
  // ── NÓS QUE VIERAM DO n8n ─────────────────────────────────────────────────────────────────
  // Mesmo desenho (e mesma cor, em CORES_N8N lá embaixo) do nó equivalente no n8n. Quem migrou
  // seis fluxos de lá reconhece o próprio fluxo pelo formato do ícone antes de ler o rótulo —
  // com o ícone genérico daqui, o canvas importado virava uma fileira de nós iguais.
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6.5V12l3.4 2",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2.5 9h19M2.5 15h19M12 2c-2.5 3-3.8 6.3-3.8 10S9.5 19 12 22M12 2c2.5 3 3.8 6.3 3.8 10S14.5 19 12 22",
  split: "M3 12h4M7 12l4-6h10M7 12l4 6h10M21 6l-2.6-2.6M21 6l-2.6 2.6M21 18l-2.6-2.6M21 18l-2.6 2.6",
  funnel: "M3 4.5h18l-7 8.2V19l-4 2.5v-8.8z",
  loop_arrows: "M4 11a8 8 0 0 1 8-8 8 8 0 0 1 7 4M20 13a8 8 0 0 1-8 8 8 8 0 0 1-7-4M4 11l-1.8 2.6M4 11l2.6 1.8M20 13l1.8-2.6M20 13l-2.6-1.8",
  braces: "M9 3C7 3 6.5 4.2 6.5 6v2.4c0 1.5-.7 2.5-2 3 1.3.5 2 1.5 2 3V17c0 1.8.5 3 2.5 3M15 3c2 0 2.5 1.2 2.5 3v2.4c0 1.5.7 2.5 2 3-1.3.5-2 1.5-2 3V17c0 1.8-.5 3-2.5 3",
  pencil: "M4 20h4L19.4 8.6a2.1 2.1 0 0 0-3-3L5 17.1V20zM14.6 6.6l3 3",
  pause: "M9 4v16M15 4v16",
  // pino de dados fixados (pinData do n8n) — o nó devolve um exemplo travado em vez de rodar.
  // Nome próprio porque "pin" já é o pino de FIXAR CONVERSA (outro desenho, outro significado).
  "pin-dados": "M14.6 2.4l7 7-2.9 1.1-3.3 3.3-.6 4.6-8.2-8.2 4.6-.6 3.3-3.3zM7.5 16.5L2.5 21.5",
};

// passo → ícone
export const STEP_ICON: Record<string, string> = {
  text: "text", presence: "presence", wait: "pause", ptt: "ptt", ptv: "ptv", media: "media",
  buttons: "buttons", ask: "ask", ai_agent: "ai_agent", notify: "notify",
  add_to_group: "add_to_group", mention_all: "mention_all", note: "note", reminder: "bell", template: "file",
  carousel: "carousel", gsheet_append: "sheet", gsheet_read: "sheet", email: "mail", tag: "tag", webhook_out: "globe", google_calendar: "calendar", google_doc: "file",
  payment_check: "card", asaas: "money", zapsign: "pencil", meta_ads: "meta", metricas_dia: "history", bloquear: "mute", code: "braces", edit_fields: "pencil", wait_n8n: "wait", loop: "loop_arrows", filter: "funnel", split_out: "split",
};

// ── CORES DOS NÓS QUE EXISTEM NO n8n ─────────────────────────────────────────────────────────
// Os nós de "encanamento" (HTTP, código, laço, filtro, espera…) são os que vêm em maior número
// numa importação — e todos com a MESMA cor viravam uma parede verde onde nada se distingue.
// Aqui cada um recebe a cor do nó equivalente no n8n, que é a referência visual de quem migrou.
// Os nós de conversa (texto, áudio, mídia, botões…) ficam de fora de propósito: continuam na cor
// do produto, que é o que separa "o que fala com o lead" de "o que é máquina".
export const CORES_N8N: Record<string, string> = {
  webhook_out: "#3B5BF5",   // HTTP Request — globo azul
  code: "#E2A33C",          // Code — chaves amarelas
  loop: "#22B07D",          // Loop Over Items — setas verdes
  filter: "#3E8FD9",        // Filter — funil azul
  split_out: "#9B6BFF",     // Split Out — lilás
  edit_fields: "#7C8BA8",   // Edit Fields (Set) — lápis
  wait: "#A0703C",          // Wait — pause marrom
};
export const CORES_N8N_GATILHO: Record<string, string> = {
  schedule: "#7D4CDB",      // Schedule Trigger — relógio roxo
  webhook: "#3B5BF5",       // Webhook — mesmo azul do HTTP
};
export const corDoPasso = (type: string): string | undefined => CORES_N8N[type];
export const corDoGatilho = (trigger: string): string | undefined => CORES_N8N_GATILHO[trigger];
// gatilho → ícone
export const TRIGGER_ICON: Record<string, string> = {
  keyword: "keyword",
  purchase_approved: "purchase", subscription_renewed: "refresh", subscription_canceled: "undo",
  pix_generated: "pix", boleto_generated: "file", cart_abandoned: "cart",
  checkout_started: "card", purchase_refused: "undo", refund: "undo", chargeback: "undo",
  payment_delayed: "clockx", primeiro_contato: "spark",
  webhook: "globe", schedule: "clock", novo_afiliado: "rocket", lead_trial: "ticket", template_reply: "send",
  group_mention: "mention_all", group_keyword: "group",
};

export function Icon({ name, size = 18, className, style }: { name?: string; size?: number; className?: string; style?: CSSProperties }) {
  const d = PATHS[name ?? ""] ?? PATHS.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d={d} />
    </svg>
  );
}
export const stepIcon = (type: string) => STEP_ICON[type] ?? "dot";
export const triggerIcon = (trigger: string) => TRIGGER_ICON[trigger] ?? "spark";
