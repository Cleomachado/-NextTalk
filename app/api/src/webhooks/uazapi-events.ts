import { extrairLocal, textoDaLocalizacao } from "../uaz.js";
// Interpreta os eventos que a UazAPI manda pro nosso webhook.
// Foco na Fase 2a: mudanças de participante em grupo (entrou / saiu).

export interface UazapiGroupChange {
  groupJid: string;
  joins: string[]; // telefones de quem ENTROU (sem @...)
  leaves: string[]; // telefones de quem SAIU
}

const clean = (arr: unknown): string[] =>
  (Array.isArray(arr) ? arr : []).map((s) => String(s).replace(/@.*/, "")).filter(Boolean);

// Retorna null se não for um evento de grupo com entrada/saída.
export function parseUazapiGroupChange(body: any): UazapiGroupChange | null {
  if (body?.EventType !== "groups") return null;
  const ev = body?.event;
  if (!ev || typeof ev !== "object") return null;
  const joins = clean(ev.Join);
  const leaves = clean(ev.Leave);
  if (joins.length === 0 && leaves.length === 0) return null;
  return { groupJid: String(ev.JID ?? ""), joins, leaves };
}

export interface UazapiIncomingMessage {
  id: string; // id da mensagem (dedup de retries do webhook); vazio se não veio
  mediaId: string; // id COMPLETO p/ baixar mídia via /message/download (m.id, tipo owner:ID)
  type: string; // messageType (Conversation/AudioMessage/ImageMessage/…)
  isAudio: boolean; // áudio/nota de voz → dá pra transcrever
  from: string; // telefone (sem @)
  name: string; // nome de quem enviou (pushname), se veio
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  // De onde a mensagem foi enviada: "android"/"ios" = digitada no CELULAR; "web" = via API
  // (motor/painel) ou WhatsApp Web. É o que detecta "o dono assumiu a conversa no celular".
  source: string;
  // Preenchido quando várias mensagens do lead foram juntadas numa só (rajada): id da mensagem que
  // a resposta deve MARCAR/citar, pra ficar claro a qual delas a agente está respondendo.
  replyToId?: string;
  // As falas ORIGINAIS da rajada, separadas. A palavra-chave é comparada contra CADA uma — senão
  // quem manda "oi" + "tudo bem?" nunca dispararia o fluxo (o texto junto não casa com "oi").
  partes?: string[];
  // 💬 A mensagem que o lead MARCOU (citou) ao responder — vem do contextInfo da UazAPI (ou, na
  // Oficial, do context.id resolvido no nosso arquivo). É o que liga um "Sim" à pergunta certa.
  citacao?: { alvoId?: string; texto?: string; tipo?: string };
  // A fala como o AGENTE deve ler: cada fala da rajada com a mensagem marcada na frente. `text`
  // continua cru de propósito (palavra-chave e captura comparam o texto exato).
  textoAgente?: string;
  // 📍 Localização recebida (lat/lng + nome/endereço). Preenchido pelo parser da Meta (o LITE
  // extrai do content na hora de arquivar, via extrairLocal do uaz.ts).
  local?: { lat: number; lng: number; nome?: string; endereco?: string; url?: string; aoVivo?: boolean };
  // 👤 Contato(s) compartilhado(s). Preenchido pelo parser da Meta (no LITE o vCard viaja no texto).
  contatos?: Array<{ nome: string; telefone: string }>;
}

// 🔘 TEXTO DE UM CLIQUE EM BOTÃO. Responder um botão NÃO é uma mensagem de texto comum: o
// WhatsApp manda um tipo próprio, e o rótulo clicado vem em campos diferentes conforme a origem
// (botão simples, botão de template, lista, ou as interativas novas do NativeFlow). Nenhum deles
// tem `content.text` — então, sem isto, o clique chegava VAZIO no motor e o ramo do botão nunca
// disparava (caso do dono 24/08: clicou "Não" e o fluxo parou ali).
// Os nomes de campo seguem o Baileys, que é o que a UazAPI entrega por baixo.
function textoDeBotao(c: any): string {
  if (!c || typeof c !== "object") return "";
  const alvo =
    c.buttonsResponseMessage ?? c.ButtonsResponseMessage ??
    c.templateButtonReplyMessage ?? c.TemplateButtonReplyMessage ??
    c.listResponseMessage ?? c.ListResponseMessage ?? null;
  if (alvo) {
    const t = alvo.selectedDisplayText ?? alvo.SelectedDisplayText ?? alvo.title ?? alvo.Title
      ?? alvo.selectedRowId ?? alvo.singleSelectReply?.selectedRowId ?? "";
    if (String(t).trim()) return String(t).trim();
  }
  // Interativa nova (NativeFlow): o rótulo vem num JSON string dentro de paramsJson.
  const nf = c.interactiveResponseMessage?.nativeFlowResponseMessage
    ?? c.InteractiveResponseMessage?.NativeFlowResponseMessage ?? null;
  if (nf?.paramsJson) {
    try {
      const j = JSON.parse(String(nf.paramsJson));
      const t = j?.display_text ?? j?.displayText ?? j?.title ?? j?.id ?? "";
      if (String(t).trim()) return String(t).trim();
    } catch { /* JSON estranho — cai nos campos soltos abaixo */ }
  }
  // Alguns formatos chegam ACHATADOS (sem o objeto envolvente).
  const solto = c.selectedDisplayText ?? c.SelectedDisplayText ?? c.selectedButtonId ?? "";
  return String(solto ?? "").trim();
}

// 📍 Mensagem de localização do LITE → texto. Atualização de localização EM TEMPO REAL
// (sequenceNumber > 0) não vira texto: cada movimento do lead dispararia um turno do agente.
function textoDeLocal(c: any, type: string): string {
  if (!/location/i.test(type) || !c || typeof c !== "object") return "";
  const alvo = c.locationMessage ?? c.liveLocationMessage ?? c;
  if (/live/i.test(type) && Number(alvo?.sequenceNumber ?? 0) > 0) return "";
  const l = extrairLocal(alvo, type);
  return l ? textoDaLocalizacao(l) : "";
}

// Extrai uma mensagem recebida (para opt-out, agente, keyword etc.).
export function parseUazapiMessage(body: any): UazapiIncomingMessage | null {
  if (body?.EventType !== "messages") return null;
  const m = body?.message;
  if (!m || typeof m !== "object") return null;
  const c = m.content;
  // O clique em botão vem ANTES do texto comum: quem clicou não digitou nada, e é o rótulo
  // clicado que o fluxo precisa pra escolher o ramo.
  const type0 = String(m.messageType ?? m.type ?? "");
  const text = typeof c === "string" ? c : (textoDeBotao(c) || c?.text || m.text || textoDeLocal(c, type0) || "");
  const from = String(m.chatid ?? m.sender ?? "").replace(/@.*/, "");
  const name = String(m.senderName ?? m.pushName ?? m.wa_name ?? "");
  const id = String(m.messageid ?? m.id ?? "");
  const mediaId = String(m.id ?? m.messageid ?? "");
  const type = String(m.messageType ?? m.type ?? "");
  const isAudio = /audio|ptt|voice/i.test(type) || /audio|ptt|voice/i.test(String(m.mediaType ?? c?.mediaType ?? ""));
  return { id, mediaId, type, isAudio, from, name, text: String(text ?? ""), fromMe: Boolean(m.fromMe), isGroup: Boolean(m.isGroup), source: String(m.source ?? "").toLowerCase() };
}

export interface UazapiGroupMessage {
  groupJid: string; // ...@g.us (completo — usado para casar com a config e postar de volta)
  senderName: string; // melhor esforço (nunca telefone)
  text: string;
  fromMe: boolean;
}

// Extrai uma mensagem de TEXTO enviada DENTRO de um grupo (para o resumo do dia).
// Retorna null se não for mensagem de grupo, não tiver texto, ou não for do tipo esperado.
export function parseUazapiGroupMessage(body: any): UazapiGroupMessage | null {
  if (body?.EventType !== "messages") return null;
  const m = body?.message;
  if (!m || typeof m !== "object") return null;
  const chatid = String(m.chatid ?? "");
  const isGroup = Boolean(m.isGroup) || chatid.includes("@g.us");
  if (!isGroup || !chatid.includes("@g.us")) return null;
  const c = m.content;
  const text = typeof c === "string" ? c : (c?.text ?? m.text ?? "");
  if (!text) return null; // mídia sem legenda não entra no resumo
  const senderName = String(
    m.senderName ?? m.pushName ?? m.SenderName ?? m.notifyName ?? m.participantName ?? "",
  );
  return { groupJid: chatid, senderName, text: String(text), fromMe: Boolean(m.fromMe) };
}

// Palavras que cancelam / reativam o recebimento (comparação exata, sem falso positivo).
const OPT_OUT = ["sair", "parar", "pare", "cancelar", "stop", "descadastrar", "quero sair", "parar de receber",
  // Botões de saída dos templates (13/10): o clique chega como TEXTO do botão. Valem SEMPRE, mesmo
  // que a pessoa tenha escrito antes de clicar (o gatilho de resposta de template só pega o 1º).
  "não receber mensagens", "nao receber mensagens", "não receber", "nao receber", "não quero mais", "nao quero mais",
  "pausar essas mensagens", "parar essas automações", "parar essas automacoes", "não quero receber", "nao quero receber"];
const OPT_IN = ["voltar", "quero voltar", "reativar"];

export function isOptOut(text: string): boolean {
  const t = text.trim().toLowerCase();
  return OPT_OUT.includes(t);
}
export function isOptIn(text: string): boolean {
  const t = text.trim().toLowerCase();
  return OPT_IN.includes(t);
}
