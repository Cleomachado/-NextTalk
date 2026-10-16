// Interface neutra de WhatsApp. O resto do sistema fala com ISTO, nunca com a UazAPI direto.
// Assim, trocar de motor (UazAPI ↔ Evolution ↔ WAHA) é só criar outra implementação.

export type MediaType =
  | "image"
  | "video"
  | "document"
  | "audio" // arquivo de áudio comum
  | "ptt" // nota de voz (waveform)
  | "ptv" // vídeo de bolinha
  | "sticker";

export interface SendResult {
  id: string;
  // Só na API Oficial: a conta do WhatsApp em que a Meta REALMENTE entregou (ela mexe no 9º
  // dígito BR por conta própria). Quem arquivar a conversa deve usar este valor como chave.
  waId?: string;
  raw: unknown;
}

export interface GroupParticipant {
  phone: string | null; // telefone real (campo PhoneNumber da UazAPI) — use ESTE para endereçar
  lid: string | null; // id de privacidade do WhatsApp (@lid)
  isAdmin: boolean;
  isSuperAdmin: boolean;
  displayName?: string;
}

export interface GroupInfo {
  jid: string;
  name: string;
  participants: GroupParticipant[];
  inviteLink?: string;
}

// Item enxuto pro seletor de grupos do painel (nome + tamanho, sem participantes).
// Um card do carrossel: imagem + texto + até 3 botões de resposta rápida.
export interface CarouselCard {
  image: string;
  text: string;
  buttons?: string[];
}

export interface GroupListItem {
  jid: string;
  name: string;
  participantCount?: number;
  isAnnounce?: boolean; // grupo onde só admin posta
}

// Estado da instância (número conectado) — pro cabeçalho/bolinha do painel.
export interface InstanceStatus {
  status: string; // "connected" | "disconnected" | "connecting" | ...
  number?: string; // número conectado, E.164 sem "+" (campo owner da UazAPI)
  name?: string; // rótulo da instância (ex.: "Wpp Admin")
  profileName?: string; // nome do perfil no WhatsApp (ex.: "a equipe")
  profilePicUrl?: string; // foto do perfil (URL do CDN do WhatsApp, expira)
  qrcode?: string; // QR pra reconectar (quando desconectado)
  paircode?: string;
}

export type Presence = "composing" | "recording" | "paused";
export type ParticipantAction = "add" | "remove" | "promote" | "demote";

export interface WhatsAppGateway {
  // replyId (opcional) = marca/cita a mensagem do lead ao responder. Só o LITE implementa hoje.
  sendText(to: string, text: string, delayMs?: number, replyId?: string): Promise<SendResult>;
  // Envia texto mencionando números específicos (campo mentions da UazAPI).
  sendTextWithMentions(
    to: string,
    text: string,
    mentions: string[],
    delayMs?: number,
  ): Promise<SendResult>;
  // "Marcar todos": busca os participantes do grupo e menciona todos.
  // hidden=true → menção oculta (todos notificados, texto limpo, sem @ visível).
  mentionAll(
    groupJid: string,
    text: string,
    opts?: { hidden?: boolean; excludeSelf?: string; delayMs?: number },
  ): Promise<SendResult>;
  sendMedia(input: {
    to: string;
    type: MediaType;
    file: string;
    caption?: string;
    delayMs?: number;
  }): Promise<SendResult>;
  sendPtt(to: string, file: string, delayMs?: number): Promise<SendResult>;
  sendPtv(to: string, file: string, delayMs?: number): Promise<SendResult>;
  sendButtons(to: string, text: string, buttons: string[], delayMs?: number): Promise<SendResult>;
  // Carrossel: cards com imagem + botões que o lead desliza pro lado. Só no LITE (a Cloud API não tem).
  sendCarousel(to: string, text: string, cards: CarouselCard[], delayMs?: number): Promise<SendResult>;
  // Envia um template aprovado (API Oficial). Único jeito de falar FORA da janela de 24h.
  // No modo LITE (UazAPI) não existe — a implementação lança erro claro.
  // headerUrl: arquivo do CABEÇALHO deste envio (template com imagem/vídeo/documento). Sem ele,
  // vai a mídia de EXEMPLO aprovada — que serve pra teste, mas expira e não dá pra personalizar.
  sendTemplate(to: string, name: string, language: string, params: string[], delayMs?: number, headerUrl?: string): Promise<SendResult>;
  sendPresence(to: string, presence: Presence, delayMs?: number): Promise<void>;
  // Pino no mapa. Usado por alerta de rastreador/entrega ("onde o veículo está agora").
  sendLocation(to: string, lat: number, lng: number, nome?: string, endereco?: string, delayMs?: number): Promise<SendResult>;
  // Liga pro contato (só LITE). callDuration = segundos até encerrar (padrão do Z-API: máx 15).
  makeCall?(to: string, callDuration?: number): Promise<void>;
  checkNumbers(numbers: string[]): Promise<Array<{ number: string; exists: boolean }>>;
  groupInfo(groupJid: string, opts?: { inviteLink?: boolean }): Promise<GroupInfo>;
  // Lista os grupos que o número conectado participa (pro seletor do painel).
  // `force` = buscar direto do WhatsApp (mais lento; pega grupos recém-criados que o cache atrasa).
  listGroups(force?: boolean): Promise<GroupListItem[]>;
  // Resolve um código/link de convite → {jid, name} SEM entrar no grupo. null se inválido.
  inviteInfo(codeOrLink: string): Promise<{ jid: string; name: string } | null>;
  // Estado do número conectado (status, nome, foto, QR).
  instanceStatus(): Promise<InstanceStatus>;
  updateParticipants(
    groupJid: string,
    action: ParticipantAction,
    participants: string[],
  ): Promise<unknown>;
  setWebhook(input: {
    url: string;
    events: string[];
    excludeMessages?: string[];
    enabled?: boolean;
  }): Promise<unknown>;
}
