// Gestão de instâncias LITE na UazAPI (criar número novo por QR).
// admintoken cria instâncias; cada instância tem seu próprio token pra operar.
import { config } from "./config.js";
import { inicioEnvio, fimEnvio, origemDoContexto } from "./engine/origem-envio.js";

const BASE = config.uazapi.url;

export interface LiteInstance {
  token: string;
  status: string;
  qrcode?: string;
  paircode?: string;
  number?: string;
  name?: string;
  avatar?: string;
}

function mapInst(inst: any): LiteInstance {
  return {
    token: String(inst?.token ?? ""),
    status: String(inst?.status ?? "unknown"),
    qrcode: inst?.qrcode || undefined,
    paircode: inst?.paircode || undefined,
    number: inst?.owner ? String(inst.owner) : undefined,
    name: inst?.profileName || inst?.name || undefined,
    avatar: inst?.profilePicUrl || undefined,
  };
}

// Todo /send/* daqui também entra no registro de "quem enviou" (ver engine/origem-envio.ts): o id
// fica como "nosso" e o endpoint do painel promove pra "painel" quando é mensagem digitada à mão.
async function post(path: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const alvo = path.startsWith("/send/") ? String((body as any)?.number ?? "") : "";
  if (!alvo) return postCru(path, body, headers);
  inicioEnvio(alvo);
  try {
    const r = await postCru(path, body, headers);
    fimEnvio(alvo, String(r?.messageid || r?.id || ""), origemDoContexto() === "ia" ? "ia" : "nosso");
    return r;
  } catch (e) {
    fimEnvio(alvo);
    throw e;
  }
}
async function postCru(path: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: any = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const cru = String(json?.error || json?.message || "");
    // LIMITE DO PLANO no servidor UazAPI. Sem isto o cliente via a frase crua em inglês
    // ("Maximum number of instances connected reached") e achava que o problema era ele —
    // caso de um cliente, 25/08. O problema é NOSSO (plano cheio): a mensagem assume isso, e o
    // log grita pro admin ver no Logs ao vivo e liberar vaga/fazer upgrade.
    if (/maximum number of instances/i.test(cru)) {
      console.error(`🚨 SERVIDOR UAZAPI CHEIO — conexão de cliente RECUSADA (${path}). Libere uma vaga ou faça upgrade do plano no painel da UazAPI.`);
      throw new Error("nosso servidor de conexões lotou agora há pouco — a falha é nossa, não sua. Chama o suporte que liberamos sua vaga em minutos.");
    }
    throw new Error(cru || `UazAPI ${path} HTTP ${res.status}`);
  }
  return json;
}

// Cria uma instância nova (precisa do admin token do servidor).
export async function createLiteInstance(name: string): Promise<LiteInstance> {
  if (!config.uazapi.adminToken) throw new Error("UAZAPI_ADMIN_TOKEN não configurado no servidor");
  const r = await post("/instance/init", { name }, { admintoken: config.uazapi.adminToken });
  return mapInst(r?.instance ?? r);
}

// Inicia a conexão de uma instância e retorna o QR (usa o token DELA).
export async function connectLiteInstance(token: string): Promise<LiteInstance> {
  const r = await post("/instance/connect", {}, { token });
  return mapInst(r?.instance ?? r);
}

// Apaga a instância na UazAPI (libera o slot da assinatura). 404 = já não existe → ok.
export async function deleteLiteInstance(token: string): Promise<void> {
  const res = await fetch(BASE + "/instance", { method: "DELETE", headers: { token } });
  if (!res.ok && res.status !== 404) {
    const t = await res.text().catch(() => "");
    throw new Error(`UazAPI DELETE /instance HTTP ${res.status}${t ? ": " + t.slice(0, 120) : ""}`);
  }
}

// ── Inbox (conversas ao vivo) ─────────────────────────────────────────────────
export interface Chat {
  id: string;
  name: string;
  phone?: string;
  image?: string;
  lastMessage?: string;
  timestamp?: number;
  unread: number;
  isGroup: boolean;
}
export interface Msg {
  id: string;
  mid?: string; // id completo (owner:ID) — usado pra baixar a mídia
  text: string;
  fromMe: boolean;
  timestamp?: number;
  type?: string;
  fileURL?: string;
  reaction?: string; // só em ReactionMessage: id curto da mensagem-alvo
  // RESPOSTA CITADA. A UazAPI entrega em content.contextInfo e a gente ignorava — por isso o
  // "respondendo a fulano" do WhatsApp sumia e a conversa em grupo ficava sem pé nem cabeça.
  citacao?: { alvoId?: string; texto?: string; tipo?: string };
  // De onde a pessoa mandou (android/ios/web). Aparece junto do aviso de mensagem apagada.
  source?: string;
  origem?: string; // android | ios | web | painel | bot — quem enviou a mensagem nossa (classificado pelo motor)
  // Duração do áudio em segundos (vem pronta da API em content.seconds) — o painel mostra "0:14"
  // sem precisar baixar o arquivo.
  durationSec?: number;
  // ONDA REAL do áudio: base64 com ~100 bytes de amplitude (0-255) que o WhatsApp já calculou.
  // Confirmado ao vivo 06/08. O painel desenha as barrinhas com isso — sem baixar/decodificar o
  // arquivo (o que custaria caro por balão).
  waveform?: string;
  senderName?: string;
  status?: string;
  // Documento (DocumentMessage): pra renderizar o card estilo WhatsApp
  fileName?: string;
  fileSize?: number; // bytes
  mime?: string;
  pageCount?: number;
  // Botões da mensagem (template/botões/lista), COM a ação de cada um: url (abre link),
  // phone (ligação), copy (copiar código); sem ação = resposta rápida (clicar responde com o
  // rótulo). Antes vinha só o rótulo e o clique no painel não fazia nada (print de 08/08).
  buttons?: MsgButton[];
  // Contato (ContactMessage): o vCard cru + nome, pra renderizar o card
  vcard?: string;
  contactName?: string;
  // Mensagem fixada no chat (📌) — vem pronto do /message/find; alimenta o Fixar/Desafixar do menu.
  pinned?: boolean;
  // 📍 LOCALIZAÇÃO (LocationMessage/LiveLocationMessage). O painel mostrava só o rótulo
  // "Localização" porque as coordenadas ficavam no content e eram descartadas aqui (print do
  // Admin, 10/09). `url` = link que o WhatsApp já manda quando é um lugar do Maps.
  local?: MsgLocal;
  // ENQUETE. O painel mostrava só "📎 Mídia" porque o tipo que chega não é exatamente
  // "PollCreationMessage" (a UazAPI usa variações …V2/…V3) — e cada VOTO chega como uma mensagem
  // separada, então um grupo com 6 votos virava 6 balões vazios (print do dono, 17/08).
  poll?: { pergunta: string; opcoes: Array<{ texto: string; votos?: number }>; multipla?: boolean };
  pollVoto?: boolean; // é um VOTO numa enquete (não a enquete em si)
  // 📞 LIGAÇÃO de WhatsApp (messageType "call"). Sem isto o painel mostrava "Mídia" (HG, 03/10).
  chamada?: { video: boolean; motivo?: string; estado?: string };
}

// ENQUETE — contagem de votos só aparece se a API mandar: o WhatsApp criptografa os votos, então
// prometer número que não temos seria mentira na tela.
// Acha a LISTA DE OPÇÕES em qualquer lugar do objeto. Adivinhar o nome do campo não funcionou
// (17/08: a enquete continuou caindo como "voto"), então em vez de listar nomes a função procura
// pelo FORMATO: um array cujos itens são todos texto — ou objetos com um campo de texto. Desce até
// 3 níveis porque a UazAPI às vezes embrulha em pollCreationMessage/message.
function achaOpcoes(obj: any, prof = 0): Array<{ texto: string; votos?: number }> | undefined {
  if (!obj || typeof obj !== "object" || prof > 3) return undefined;
  const textoDe = (o: any) => (typeof o === "string" ? o : String(o?.optionName ?? o?.name ?? o?.title ?? o?.text ?? o?.option ?? "")).trim();
  for (const [chave, v] of Object.entries(obj)) {
    if (!Array.isArray(v) || v.length < 2) continue;              // enquete tem 2+ opções
    if (/voter|participant|mention|context/i.test(chave)) continue; // arrays que NÃO são opção
    const textos = v.map(textoDe);
    if (!textos.every((t) => t && t.length <= 120)) continue;      // todo item virou texto curto → é a lista
    return v.map((o: any, i: number) => {
      const cru = typeof o === "object" && o ? (o.votes ?? o.count ?? o.voteCount ?? (Array.isArray(o.voters) ? o.voters.length : undefined)) : undefined;
      return { texto: textos[i], votos: Number.isFinite(Number(cru)) ? Number(cru) : undefined };
    });
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = achaOpcoes(v, prof + 1);
      if (r) return r;
    }
  }
  return undefined;
}
function achaPergunta(obj: any, prof = 0): string {
  if (!obj || typeof obj !== "object" || prof > 3) return "";
  for (const k of ["name", "pollName", "question", "title", "text"]) {
    const v = (obj as any)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = achaPergunta(v, prof + 1);
      if (r) return r;
    }
  }
  return "";
}
// A mensagem citada vem CHAVEADA PELO TIPO dentro de quotedMessage — texto puro é
// `conversation`, texto com formatação é `extendedTextMessage.text`, mídia traz caption ou nada.
// Sem texto (figurinha, áudio), devolvemos o RÓTULO do tipo, que é o que o WhatsApp mostra.
function extrairCitacao(c: any): { alvoId?: string; texto?: string; tipo?: string } | undefined {
  const ci = c?.contextInfo;
  const qm = ci?.quotedMessage;
  if (!ci || !qm || typeof qm !== "object") return undefined;
  const texto = String(
    qm.conversation ??
    qm.extendedTextMessage?.text ??
    qm.imageMessage?.caption ??
    qm.videoMessage?.caption ??
    qm.documentMessage?.fileName ??
    "",
  ).trim();
  const tipo = qm.imageMessage ? "imagem"
    : qm.videoMessage ? "vídeo"
    : (qm.audioMessage || qm.pttMessage) ? "áudio"
    : qm.stickerMessage ? "figurinha"
    : qm.documentMessage ? "documento"
    : qm.locationMessage ? "localização"
    : qm.contactMessage ? "contato"
    : undefined;
  const alvoId = String(ci.stanzaID ?? ci.stanzaId ?? "") || undefined;
  if (!texto && !tipo && !alvoId) return undefined;
  return { alvoId, texto: texto || undefined, tipo };
}

function extrairPoll(c: any): { pergunta: string; opcoes: Array<{ texto: string; votos?: number }>; multipla?: boolean } | undefined {
  if (!c || typeof c !== "object") return undefined;
  const opcoes = (achaOpcoes(c) ?? []).filter((o) => o.texto);
  if (!opcoes.length) return undefined;
  const selec = Number(c.selectableOptionsCount ?? c.selectableCount ?? c.selectableOptionCount ?? 1);
  return { pergunta: achaPergunta(c), opcoes, multipla: Number.isFinite(selec) ? selec !== 1 : undefined };
}

// ── Aquecedor de FOTOS ────────────────────────────────────────────────────────
// A UazAPI só preenche `imagePreview` no /chat/find DEPOIS que alguém pede /chat/details daquele
// chat (confirmado ao vivo 06/08 na instância nova do cliente: 0 fotos → details → fotos no find).
// Então: a cada listagem, pede os detalhes de até 8 chats sem foto em segundo plano — no próximo
// poll do painel elas aparecem. Dedup por instância+chat pra não martelar a API.
// ⚠️ ANTES daqui marcava o chat como "já pedi" ANTES de saber se a foto veio, e o erro do
// post ia pro .catch vazio. Duas maneiras de perder a foto PRA SEMPRE:
//   · a chamada falhou (rede, limite da UazAPI) → marcado, nunca mais tentado;
//   · a chamada deu certo mas o WhatsApp ainda não tinha mandado a foto — que é EXATAMENTE o que
//     acontece durante a sincronização de um número recém-conectado.
// Foi o caso real de 22/08: o dono reconectou o 11 93224-5742, o aquecedor rodou no meio da
// sincronização e carimbou "Portaria Rio Energy" e "CAMP – Avisos #1". Conferido na fonte: as
// duas TÊM foto no WhatsApp; só a nossa listagem é que tinha desistido delas. Só voltariam num
// restart do motor, porque o Set vive na memória do processo.
// Agora: tenta de novo, com espera crescente, e só desiste depois de 5 tentativas — aí sim é
// perfil sem foto ou privacidade fechada.
type FotoPendente = { tentativas: number; proxima: number };
const fotosAquecidas = new Map<string, FotoPendente>();
const ESPERA_FOTO = [60_000, 5 * 60_000, 20 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const MAX_TENTATIVAS_FOTO = ESPERA_FOTO.length;

function aqueceFotos(token: string, chats: Chat[]): void {
  const marca = token.slice(-8);
  const agora = Date.now();
  // Chat que JÁ tem foto sai do controle: libera memória e, se a foto cair de novo, recomeça do zero.
  for (const c of chats) if (c.id && c.image) fotosAquecidas.delete(marca + ":" + c.id);

  const alvos = chats.filter((c) => {
    if (!c.id || c.image) return false;
    const p = fotosAquecidas.get(marca + ":" + c.id);
    if (!p) return true;                                  // nunca pedimos
    return p.tentativas < MAX_TENTATIVAS_FOTO && agora >= p.proxima;
  }).slice(0, 8);

  for (const c of alvos) {
    const chave = marca + ":" + c.id;
    const p = fotosAquecidas.get(chave) ?? { tentativas: 0, proxima: 0 };
    p.tentativas++;
    p.proxima = agora + ESPERA_FOTO[Math.min(p.tentativas, ESPERA_FOTO.length) - 1];
    fotosAquecidas.set(chave, p);
    post("/chat/details", { number: c.id, preview: true }, { token }).catch(() => {});
  }
  if (fotosAquecidas.size > 5000) fotosAquecidas.clear(); // teto de memória (recomeça a dedup)
}

export async function liteChats(token: string, limit = 50): Promise<Chat[]> {
  const r = await post("/chat/find", { limit }, { token });
  const arr: any[] = r?.chats ?? [];
  const lista = arr
    .map((c) => ({
      // wa_chatid é o JID real (…@g.us / …@s.whatsapp.net) — é ele que filtra mensagens e endereça envio.
      id: String(c.wa_chatid ?? c.id ?? ""),
      name: c.name || c.wa_name || c.wa_contactName || c.lead_name || c.phone || "Sem nome",
      phone: c.phone || undefined,
      image: c.image || c.imagePreview || undefined,
      lastMessage: c.wa_lastMessageTextVote || undefined,
      timestamp: Number(c.wa_lastMsgTimestamp) || undefined,
      unread: Number(c.wa_unreadCount) || 0,
      isGroup: Boolean(c.wa_isGroup),
    }))
    .filter((c) => c.id)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  aqueceFotos(token, lista); // dispara e esquece — o próximo poll traz as fotos
  return lista;
}

// Um botão de mensagem com a AÇÃO dele (não só o rótulo — é a ação que faz o clique funcionar
// no painel). Sem url/phone/copy = resposta rápida: clicar responde a conversa com o rótulo.
export interface MsgButton { label: string; url?: string; phone?: string; copy?: string }
export interface MsgLocal { lat: number; lng: number; nome?: string; endereco?: string; url?: string; aoVivo?: boolean }

// Extrai lat/lng (+ nome/endereço) de uma mensagem de localização. Os nomes seguem o Baileys
// (degreesLatitude/degreesLongitude); aceita também latitude/longitude e lat/lng por garantia.
// Serve ao /message/find e ao webhook (que monta a mensagem à mão).
export function extrairLocal(c: any, type?: string): MsgLocal | undefined {
  if (!c || typeof c !== "object") return undefined;
  const num = (...v: any[]) => { for (const x of v) { const n = Number(x); if (x !== undefined && x !== null && x !== "" && Number.isFinite(n)) return n; } return NaN; };
  const lat = num(c.degreesLatitude, c.DegreesLatitude, c.latitude, c.lat);
  const lng = num(c.degreesLongitude, c.DegreesLongitude, c.longitude, c.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
  const nome = String(c.name ?? c.Name ?? "").trim() || undefined;
  const endereco = String(c.address ?? c.Address ?? c.comment ?? c.caption ?? "").trim() || undefined;
  const url = String(c.url ?? c.URL ?? "").trim() || undefined;
  const aoVivo = /live/i.test(type ?? "") || Number(c.sequenceNumber) > 0 ? true : undefined;
  return { lat, lng, nome, endereco, url: /^https?:\/\//i.test(url ?? "") ? url : undefined, aoVivo };
}

// 📍 Localização como TEXTO pro agente de IA e pros fluxos. Sem isto a localização chegava sem
// texto e o agente simplesmente não a via — num atendimento de reboque (HG, 03/10) é o dado mais
// importante da conversa. O link do Maps vai junto pra equipe abrir direto.
export function textoDaLocalizacao(l: MsgLocal): string {
  const onde = [l.nome, l.endereco].filter(Boolean).join(" — ");
  const mapa = `https://www.google.com/maps?q=${l.lat},${l.lng}`;
  return `📍 Localização enviada pelo WhatsApp${l.aoVivo ? " (em tempo real)" : ""}: ${onde ? onde + " — " : ""}${mapa}`;
}

// Extrai os botões (rótulo + ação). A UazAPI entrega em formatos bem diferentes conforme a
// origem: TemplateMessage (hydratedButtons), ButtonsMessage (buttons[].buttonText), listas
// (sections[].rows) e as interativas novas (NativeFlowMessage, com o buttonParamsJson — um JSON
// string com display_text/url/phone_number/copy_code). Confirmado ao vivo 31/07 com um template
// da API Oficial.
function extrairBotoes(c: any): MsgButton[] | undefined {
  if (!c || typeof c !== "object") return undefined;
  const out: MsgButton[] = [];
  const push = (label: any, acao?: { url?: any; phone?: any; copy?: any }) => {
    const t = String(label ?? "").trim();
    if (!t || out.some((x) => x.label === t)) return;
    out.push({
      label: t,
      url: acao?.url ? String(acao.url) : undefined,
      phone: acao?.phone ? String(acao.phone) : undefined,
      copy: acao?.copy ? String(acao.copy) : undefined,
    });
  };

  for (const b of c.hydratedTemplate?.hydratedButtons ?? []) {
    const h = b?.HydratedButton ?? b ?? {};
    const qr = h.QuickReplyButton ?? h.quickReplyButton;
    const ub = h.UrlButton ?? h.urlButton;
    const cb = h.CallButton ?? h.callButton;
    if (qr) push(qr.displayText);
    if (ub) push(ub.displayText, { url: ub.url });
    if (cb) push(cb.displayText, { phone: cb.phoneNumber });
  }
  for (const b of c.buttons ?? []) push(b?.buttonText?.displayText ?? b?.displayText ?? b?.text);
  for (const b of c.InteractiveMessage?.NativeFlowMessage?.buttons ?? c.nativeFlowMessage?.buttons ?? []) {
    let p: any = null;
    try { p = JSON.parse(b?.buttonParamsJson || ""); } catch { /* sem params → segue só com o rótulo */ }
    push(p?.display_text ?? b?.displayText, { url: p?.url, phone: p?.phone_number, copy: p?.copy_code });
  }
  for (const sec of c.sections ?? []) for (const row of sec?.rows ?? []) push(row?.title);
  return out.length ? out.slice(0, 10) : undefined;
}

export async function liteMessages(token: string, chatid: string, limit = 50): Promise<Msg[]> {
  const r = await post("/message/find", { chatid, limit }, { token });
  const arr: any[] = r?.messages ?? [];
  return arr
    .map((m) => {
      const c = m.content && typeof m.content === "object" ? m.content : {};
      const type = m.messageType || undefined;
      const isDoc = type === "DocumentMessage";
      const isContact = type === "ContactMessage" || type === "ContactsArrayMessage";
      // Casa por "poll" no nome do tipo, não pelo nome exato: PollCreationMessage,
      // PollCreationMessageV2/V3, PollUpdateMessage… tudo cai aqui.
      const ehPoll = /poll/i.test(type ?? "");
      const poll = ehPoll ? extrairPoll(c) : undefined;
      return {
        id: String(m.messageid || m.id || ""),
        mid: String(m.id || m.messageid || ""),
        text: m.text || (typeof m.content === "string" ? m.content : "") || "",
        fromMe: Boolean(m.fromMe),
        timestamp: Number(m.messageTimestamp) || undefined,
        type,
        fileURL: m.fileURL || undefined,
        reaction: m.reaction ? String(m.reaction) : undefined,
        citacao: extrairCitacao(c),
        senderName: m.senderName || undefined,
        status: m.status || undefined,
        source: m.source || undefined,
        pinned: Boolean(m.pinned) || undefined,
        durationSec: (type === "AudioMessage" || type === "PttMessage") ? Number(c.seconds) || undefined : undefined,
        waveform: (type === "AudioMessage" || type === "PttMessage") && typeof c.waveform === "string" ? c.waveform : undefined,
        // documento (extração defensiva — nomes variam na UazAPI)
        fileName: isDoc ? String(c.fileName || c.title || m.fileName || m.caption || "") || undefined : undefined,
        fileSize: isDoc ? Number(c.fileLength ?? c.fileSize ?? m.fileLength ?? m.size) || undefined : undefined,
        mime: isDoc ? String(c.mimetype || m.mimetype || "") || undefined : undefined,
        pageCount: isDoc ? Number(c.pageCount ?? c.pages) || undefined : undefined,
        buttons: extrairBotoes(c),
        // contato: o vCard cru (no content.vcard ou no texto) + nome
        vcard: isContact ? String(c.vcard || (typeof m.content === "string" ? m.content : "") || m.text || "") || undefined : undefined,
        contactName: isContact ? String(c.displayName || c.name || "") || undefined : undefined,
        local: /location/i.test(type ?? "") ? extrairLocal(c, type) : undefined,
        // Rede de segurança: se não achou as opções mas a mensagem TEM texto, é a enquete (a
        // pergunta vem no texto) — voto nunca traz texto. Melhor mostrar a pergunta sozinha do
        // que rotular a enquete como "votou na enquete", que foi o que aconteceu no 1º deploy.
        poll: poll
          ? { ...poll, pergunta: poll.pergunta || m.text || "Enquete" }
          : ehPoll && (m.text || "").trim()
            ? { pergunta: String(m.text).trim(), opcoes: [] }
            : undefined,
        pollVoto: ehPoll && !poll && !(m.text || "").trim() ? true : undefined,
        chamada: /^call$/i.test(type ?? "") || (c && c.type === "call" && c.event)
          ? { video: !!c?.isVideo, motivo: String(c?.reason ?? "") || undefined, estado: String(c?.state ?? "") || undefined }
          : undefined,
      };
    })
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// Baixa a mídia de uma mensagem → devolve uma URL usável (uazapi hospeda o arquivo).
export async function liteMessageDownload(token: string, id: string): Promise<{ fileURL: string; mimetype: string }> {
  const r = await post("/message/download", { id }, { token });
  return { fileURL: r?.fileURL || r?.url || "", mimetype: r?.mimetype || r?.mimeType || "" };
}

// 📞 LIGAÇÃO pelo WhatsApp (só LITE — a Cloud API oficial não origina chamada).
// Endpoint confirmado sondando a API em 22/08: POST /call/make pede `number` e recusa JID
// inválido com "invalid number JID". O /call/reject existe também, pra recusar chamada ativa.
// ⚠️ Isto FAZ O TELEFONE TOCAR de verdade. Todo caminho que chama aqui tem que confirmar antes.
export async function liteCall(token: string, number: string): Promise<any> {
  return post("/call/make", { number }, { token });
}

// Reage a uma mensagem com um emoji (emoji vazio = remove a reação).
export async function liteReact(token: string, id: string, emoji: string): Promise<void> {
  await post("/message/react", { id, text: emoji }, { token });
}

// Liga o webhook da instância apontando pro motor.
// excludeFromMe=false → recebe TAMBÉM as próprias mensagens (permite testar mandando pra si mesmo).
export async function liteSetWebhook(token: string, url: string, excludeFromMe = false): Promise<void> {
  // ⚠️ addUrlTypesMessages TEM que ser false: com true a UazAPI posta em <url>/text, <url>/image…
  // e a rota exata do motor devolvia 404 — TODO inbound era descartado em silêncio (keyword nunca
  // disparava). Descoberto em 30/07 injetando o evento na mão. O motor também aceita /uazapi/* agora.
  await post(
    "/webhook",
    { enabled: true, url, events: ["messages"], addUrlTypesMessages: false, excludeMessages: excludeFromMe ? ["fromMe"] : [] },
    { token },
  );
}
// Lê a config atual de webhook da instância (diagnóstico).
export async function liteGetWebhook(token: string): Promise<any> {
  const res = await fetch(BASE + "/webhook", { headers: { token } });
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { return { raw }; }
}

// Apaga uma mensagem (pra todos) — funciona nas que EU enviei.
export async function liteDeleteMessage(token: string, id: string): Promise<void> {
  await post("/message/delete", { id }, { token });
}

// Fixa/desafixa uma mensagem no chat (confirmado ao vivo 05/08: gera o "Mensagem fixada" no
// WhatsApp e o /message/find passa a devolver pinned:true). duration: 1, 7 ou 30 dias.
export async function liteMessagePin(token: string, id: string, pin: boolean, duration = 7): Promise<void> {
  await post("/message/pin", { id, pin, duration }, { token });
}

// Marca a CONVERSA como lida na UazAPI — zera o contador de não-lidas NO SERVIDOR (persiste
// entre sessões/refresh do painel) e envia os ✓✓ azuis pro outro lado, igual abrir no WhatsApp.
export async function liteChatRead(token: string, chatid: string): Promise<void> {
  await post("/chat/read", { number: chatid, read: true }, { token });
}

// `replyId` = responde CITANDO a mensagem (o balão com a citação em cima, como no WhatsApp).
export async function liteSend(token: string, to: string, text: string, mentions?: string, replyId?: string): Promise<{ id?: string }> {
  const body: Record<string, unknown> = { number: to, text };
  if (mentions && mentions.trim()) body.mentions = mentions.trim();
  if (replyId) body.replyid = replyId;
  const r = await post("/send/text", body, { token });
  return { id: r?.messageid || r?.id };
}

// Chave canônica de número BR (tira o 9º dígito) pra casar participante × contato.
function brKey(n: string): string {
  const d = String(n).replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") return d.slice(0, 4) + d.slice(5);
  return d;
}

// Mapa número(canônico)→nome da AGENDA (GET /contacts). É grande (~10k contatos),
// então fica em cache 5min por token (a agenda muda pouco; evita rebaixar toda hora).
const contactsCache = new Map<string, { at: number; map: Record<string, string> }>();
async function contactsNameMap(token: string): Promise<Record<string, string>> {
  const hit = contactsCache.get(token);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.map;
  const map: Record<string, string> = {};
  try {
    const res = await fetch(BASE + "/contacts", { headers: { token } });
    if (res.ok) {
      const j: any = await res.json().catch(() => []);
      const list: any[] = Array.isArray(j) ? j : j?.contacts ?? [];
      for (const c of list) {
        const jid = String(c?.jid ?? c?.wa_chatid ?? "");
        if (!jid.endsWith("@s.whatsapp.net")) continue;
        const nm = String(c?.contact_name ?? c?.contact_FirstName ?? "").trim();
        const num = jid.replace(/@.*/, "");
        if (num && nm) map[brKey(num)] = nm;
      }
    }
  } catch {
    /* sem agenda → segue sem nomes */
  }
  contactsCache.set(token, { at: Date.now(), map });
  return map;
}

// AGENDA inteira do telefone (GET /contacts) — pro botão "Importar agenda" do CRM.
// Devolve a lista crua {phone, name}; sem cache (é ação manual, o dono quer o estado de agora).
export async function liteAgendaContacts(token: string): Promise<Array<{ phone: string; name?: string }>> {
  const res = await fetch(BASE + "/contacts", { headers: { token } });
  if (!res.ok) throw new Error(`agenda: HTTP ${res.status}`);
  const j: any = await res.json().catch(() => []);
  const list: any[] = Array.isArray(j) ? j : j?.contacts ?? [];
  const out: Array<{ phone: string; name?: string }> = [];
  for (const c of list) {
    const jid = String(c?.jid ?? c?.wa_chatid ?? "");
    if (!jid.endsWith("@s.whatsapp.net")) continue; // fora grupos/broadcast/lid
    const phone = jid.replace(/@.*/, "").replace(/\D/g, "");
    if (!phone || phone.length < 8) continue;
    const name = String(c?.contact_name ?? c?.contact_FirstName ?? "").trim();
    out.push({ phone, name: name || undefined });
  }
  return out;
}

// Participantes de um grupo (pro seletor de menção "@"). LID é o id da menção; o
// número mostra legível; o NOME vem da agenda (/group/info devolve DisplayName vazio).
// O WhatsApp resolve o nome de novo ao enviar a menção.
export async function liteGroupParticipants(
  token: string,
  groupJid: string,
): Promise<Array<{ lid: string; phone: string; name: string; isAdmin: boolean }>> {
  const [info, nameMap] = await Promise.all([
    post("/group/info", { groupjid: groupJid }, { token }),
    contactsNameMap(token),
  ]);
  const parts: any[] = info?.Participants ?? info?.participants ?? [];
  return parts
    .map((p) => {
      const phone = String(p?.PhoneNumber ?? "").replace(/@.*/, "");
      const lid = String(p?.LID ?? p?.JID ?? "").replace(/@.*/, "");
      return { lid, phone, name: (phone && nameMap[brKey(phone)]) || "", isAdmin: !!(p?.IsAdmin || p?.IsSuperAdmin) };
    })
    .filter((p) => p.lid || p.phone)
    .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || a.name.localeCompare(b.name)); // com nome primeiro
}

// Participantes de um grupo COM NOME resolvido — pro import de contatos do grupo.
// ⚠️ O /group/info devolve DisplayName SEMPRE VAZIO (confirmado 06/08 num grupo de 760 pessoas:
// 0 com nome). Então o nome vem de DUAS fontes, nessa ordem de qualidade:
//   1. AGENDA do telefone (/contacts) — o nome que o dono salvou. Melhor, mas só cobre quem ele salvou.
//   2. pushName do HISTÓRICO do grupo (senderName das mensagens) — o nome PÚBLICO que a própria
//      pessoa escolheu (é o "~Fernando" que o WhatsApp mostra). Cobre quem já falou no grupo.
// Sem nenhum dos dois, entra só o telefone (melhor que perder o contato).
export async function liteGroupMembersComNome(
  token: string,
  groupJid: string,
): Promise<Array<{ phone: string; name: string | null; fonte: "agenda" | "perfil" | null }>> {
  const [info, agenda, msgs] = await Promise.all([
    post("/group/info", { groupjid: groupJid }, { token }),
    contactsNameMap(token),
    // 500 mensagens = boa cobertura de quem participa; barato (1 chamada).
    post("/message/find", { chatid: groupJid, limit: 500 }, { token }).catch(() => ({ messages: [] })),
  ]);
  // pushName por LID (o remetente vem como LID, às vezes com sufixo de aparelho ":12")
  const porLid: Record<string, string> = {};
  for (const m of (msgs as any)?.messages ?? []) {
    const nm = String(m?.senderName ?? "").trim();
    if (!nm) continue;
    const lid = String(m?.sender ?? "").replace(/@.*/, "").split(":")[0];
    if (lid && !porLid[lid]) porLid[lid] = nm;
  }
  const parts: any[] = (info as any)?.Participants ?? (info as any)?.participants ?? [];
  return parts
    .map((p) => {
      const phone = String(p?.PhoneNumber ?? "").replace(/@.*/, "");
      const lid = String(p?.LID ?? p?.JID ?? "").replace(/@.*/, "").split(":")[0];
      const daAgenda = phone ? agenda[brKey(phone)] : "";
      const doPerfil = porLid[lid];
      if (daAgenda) return { phone, name: daAgenda, fonte: "agenda" as const };
      if (doPerfil) return { phone, name: doPerfil, fonte: "perfil" as const };
      return { phone, name: null, fonte: null };
    })
    .filter((p) => p.phone);
}

// Ficha completa do grupo (modal "Dados do grupo" do painel): descrição, dono, data de criação e
// participantes com nome resolvido nas mesmas fontes do liteGroupMembersComNome (agenda →
// pushName do histórico → só o telefone). Campos que a UazAPI não devolver ficam undefined e a
// UI esconde a linha (extração defensiva: nomes de campo variam entre versões).
export interface GroupFicha {
  name?: string;
  description?: string;
  createdAt?: string; // ISO
  ownerPhone?: string;
  ownerName?: string;
  mePhone?: string;   // o número DESTA instância no grupo…
  meAdmin?: boolean;  // …e se ele é admin (o painel esconde promover/remover quando não é)
  participants: Array<{ lid: string; phone: string; name: string; isAdmin: boolean; isSuperAdmin: boolean }>;
}
export async function liteGroupFicha(token: string, groupJid: string): Promise<GroupFicha> {
  const [info, agenda, msgs, meuNumero] = await Promise.all([
    post("/group/info", { groupjid: groupJid }, { token }),
    contactsNameMap(token),
    post("/message/find", { chatid: groupJid, limit: 500 }, { token }).catch(() => ({ messages: [] })),
    liteInstanceOwner(token).catch(() => ""),
  ]);
  const porLid: Record<string, string> = {};
  for (const m of (msgs as any)?.messages ?? []) {
    const nm = String(m?.senderName ?? "").trim();
    if (!nm) continue;
    const lid = String(m?.sender ?? "").replace(/@.*/, "").split(":")[0];
    if (lid && !porLid[lid]) porLid[lid] = nm;
  }
  const g: any = (info as any)?.group ?? info ?? {};
  const participants = ((g?.Participants ?? g?.participants ?? []) as any[])
    .map((p) => {
      const phone = String(p?.PhoneNumber ?? "").replace(/@.*/, "");
      const lid = String(p?.LID ?? p?.JID ?? "").replace(/@.*/, "").split(":")[0];
      return {
        lid, phone,
        name: (phone && agenda[brKey(phone)]) || porLid[lid] || "",
        isAdmin: !!(p?.IsAdmin || p?.IsSuperAdmin),
        isSuperAdmin: !!p?.IsSuperAdmin,
      };
    })
    .filter((p) => p.lid || p.phone)
    // dono/admins primeiro (como o WhatsApp), depois alfabético; sem nome vai pro fim
    .sort((a, b) => Number(b.isSuperAdmin) - Number(a.isSuperAdmin) || Number(b.isAdmin) - Number(a.isAdmin) || (a.name || "￿").localeCompare(b.name || "￿", "pt-BR"));
  const ownerRaw = String(g?.OwnerJID ?? g?.ownerJID ?? g?.Owner ?? g?.owner ?? "").replace(/@.*/, "").split(":")[0];
  const dono = ownerRaw ? participants.find((p) => p.lid === ownerRaw || p.phone === ownerRaw) : undefined;
  // GroupCreated pode vir ISO ou epoch em segundos — new Date(inválido).toISOString() LANÇA, então valida antes.
  const criadoRaw = g?.GroupCreated ?? g?.groupCreated ?? g?.CreationTime ?? g?.created;
  const criadoData = typeof criadoRaw === "number" ? new Date(criadoRaw < 1e12 ? criadoRaw * 1000 : criadoRaw) : criadoRaw ? new Date(String(criadoRaw)) : null;
  // Topic pode vir string (GroupInfo do whatsmeow, achatado) OU objeto {Topic, TopicID…} (eventos).
  const topicRaw = g?.Topic?.Topic ?? g?.Topic ?? g?.topic ?? g?.Description;
  // Compara pelos últimos 8 dígitos: o JID BR pode vir sem o 9º dígito (mesmo truque do bulk-create).
  const meuL8 = meuNumero.slice(-8);
  const eu = meuL8 ? participants.find((p) => p.phone && p.phone.slice(-8) === meuL8) : undefined;
  return {
    name: String(g?.Name ?? g?.name ?? g?.Subject ?? "").trim() || undefined,
    description: typeof topicRaw === "string" ? topicRaw.trim() || undefined : undefined,
    createdAt: criadoData && !isNaN(criadoData.getTime()) ? criadoData.toISOString() : undefined,
    ownerPhone: dono?.phone || (/^\d{8,15}$/.test(ownerRaw) ? ownerRaw : undefined),
    ownerName: dono?.name || undefined,
    mePhone: meuNumero || undefined,
    meAdmin: eu ? eu.isAdmin : undefined,
    participants,
  };
}

// Ação sobre UM membro do grupo (menu do modal): promover a admin, tirar de admin ou remover.
// A UazAPI pode responder 200 com um Error por participante — vira erro legível aqui.
export async function liteGroupMember(token: string, groupJid: string, action: "promote" | "demote" | "remove", participant: string): Promise<void> {
  const r = await post("/group/updateParticipants", { groupjid: groupJid, action, participants: [participant] }, { token });
  const arr: any[] = r?.participants ?? r?.Participants ?? (Array.isArray(r) ? r : []);
  const errCode = Number(arr?.[0]?.Error ?? arr?.[0]?.error ?? 0);
  if (errCode === 403 || errCode === 401) throw new Error("sem permissão — seu número precisa ser admin do grupo");
  if (errCode) throw new Error("o WhatsApp recusou (erro " + errCode + ")");
}

// Sai do grupo (a instância deixa o grupo — o "Sair do grupo" do app).
export async function liteGroupLeave(token: string, groupJid: string): Promise<void> {
  await post("/group/leave", { groupjid: groupJid }, { token });
}

// Adiciona participantes ao grupo. Devolve quem entrou e quem falhou com o motivo — a privacidade
// do contato pode barrar a adição direta (403 = só por convite), e o painel precisa dizer isso.
export async function liteGroupAdd(token: string, groupJid: string, numbers: string[]): Promise<{ ok: string[]; fail: Array<{ number: string; reason: string }> }> {
  const r = await post("/group/updateParticipants", { groupjid: groupJid, action: "add", participants: numbers }, { token });
  const arr: any[] = r?.participants ?? r?.Participants ?? (Array.isArray(r) ? r : []);
  if (!arr.length) return { ok: numbers, fail: [] }; // sem detalhe por participante → o HTTP 200 é o que temos
  const ok: string[] = [];
  const fail: Array<{ number: string; reason: string }> = [];
  for (const p of arr) {
    const num = String(p?.PhoneNumber ?? p?.phoneNumber ?? p?.JID ?? p?.jid ?? "").replace(/@.*/, "");
    const errCode = Number(p?.Error ?? p?.error ?? 0);
    if (!errCode) { ok.push(num); continue; }
    fail.push({
      number: num,
      reason: errCode === 403 ? "a privacidade dele só permite entrar por convite" : errCode === 409 ? "já está no grupo" : "erro " + errCode,
    });
  }
  return { ok, fail };
}

// Marcar todos (menção). hidden=true → todos recebem a notificação sem os @ aparecerem no texto.
export async function liteMentionAll(
  token: string,
  groupJid: string,
  text: string,
  hidden = true,
): Promise<{ id?: string; count: number }> {
  const info = await post("/group/info", { groupjid: groupJid }, { token });
  const parts: any[] = info?.Participants ?? info?.participants ?? [];
  const numbers = parts
    .map((p) => String(p?.PhoneNumber ?? p?.phoneNumber ?? p?.LID ?? p?.lid ?? "").replace(/@.*/, ""))
    .filter(Boolean);
  const finalText = hidden ? text : `${text}\n\n${numbers.map((n) => `@${n}`).join(" ")}`;
  const r = await post("/send/text", { number: groupJid, text: finalText, mentions: numbers.join(",") }, { token });
  return { id: r?.messageid || r?.id, count: numbers.length };
}

// Envia mídia (foto/documento/vídeo/áudio). file = URL ou data URI base64.
export async function liteSendMedia(
  token: string,
  to: string,
  type: string,
  file: string,
  caption?: string,
): Promise<{ id?: string }> {
  const r = await post("/send/media", { number: to, type, file, text: caption, delay: 0 }, { token });
  return { id: r?.messageid || r?.id };
}

// ── Grupos: criar + configurar (foto/descrição/admins) ────────────────────────
export async function liteCreateGroup(token: string, name: string, participants: string[]): Promise<string> {
  const r = await post("/group/create", { name, participants }, { token });
  const g = r?.group ?? r;
  return String(g?.JID ?? g?.jid ?? "");
}
export async function liteGroupSetDescription(token: string, groupJid: string, description: string): Promise<void> {
  await post("/group/updateDescription", { groupjid: groupJid, description }, { token });
}
export async function liteGroupSetImage(token: string, groupJid: string, image: string): Promise<void> {
  try {
    await post("/group/updateImage", { groupjid: groupJid, image }, { token });
  } catch (e) {
    // Se veio como data URI e falhou, tenta base64 cru (como no /send/media de imagem).
    const m = /^data:[^;]+;base64,(.+)$/.exec(image);
    if (m) await post("/group/updateImage", { groupjid: groupJid, image: m[1] }, { token });
    else throw e;
  }
}
// Número BR tem um "9" após o DDD que o JID do WhatsApp às vezes não tem.
// Devolve as variações (com e sem o 9) pra tentar promover/casar o participante.
function brNumberVariants(n: string): string[] {
  const d = String(n).replace(/\D/g, "");
  if (!d) return [];
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") return [d, d.slice(0, 4) + d.slice(5)];
  if (d.length === 12 && d.startsWith("55")) return [d, d.slice(0, 4) + "9" + d.slice(4)];
  return [d];
}

// Promove admins UM A UM: um número inválido (ex.: a própria conta, ou o 9º dígito
// que não casa) não derruba a promoção dos outros. Tenta as variações do número BR.
// Devolve quem promoveu e os erros, pra mostrar no painel em vez de engolir.
export async function liteGroupPromote(
  token: string,
  groupJid: string,
  participants: string[],
): Promise<{ promoted: string[]; failed: Array<{ number: string; error: string }> }> {
  const promoted: string[] = [];
  const failed: Array<{ number: string; error: string }> = [];
  for (const n of participants) {
    const variants = brNumberVariants(n);
    let ok = false;
    let lastErr = "sem variação válida";
    for (const v of variants) {
      try {
        await post("/group/updateParticipants", { groupjid: groupJid, action: "promote", participants: [v] }, { token });
        ok = true;
        break;
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }
    }
    if (ok) promoted.push(n);
    else failed.push({ number: n, error: lastErr });
  }
  return { promoted, failed };
}

// Número dono da instância (pra excluir a própria conta das listas de admin/add).
export async function liteInstanceOwner(token: string): Promise<string> {
  try {
    const res = await fetch(BASE + "/instance/status", { headers: { token } });
    const j: any = await res.json().catch(() => ({}));
    const inst = j?.instance ?? j;
    return String(inst?.owner ?? "").replace(/\D/g, "");
  } catch {
    return "";
  }
}

// Status de uma instância pelo token dela.
export async function liteInstanceStatus(token: string): Promise<LiteInstance> {
  const res = await fetch(BASE + "/instance/status", { headers: { token } });
  const raw = await res.text();
  let json: any = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (!res.ok) throw new Error(`UazAPI /instance/status HTTP ${res.status}`);
  const inst = mapInst(json?.instance ?? json);
  inst.token = token; // /instance/status pode não devolver o token
  return inst;
}

// Mensagens CRUAS de uma conversa (sem o mapeamento do liteMessages) — só pro diagnóstico do
// painel, quando precisamos ver exatamente o que a UazAPI manda num tipo novo (ex.: enquete).
export async function liteRawMessages(token: string, chatid: string, limit = 60): Promise<any> {
  return post("/message/find", { chatid, limit }, { token });
}
