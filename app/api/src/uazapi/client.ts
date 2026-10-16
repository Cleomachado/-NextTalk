import { UazHttp } from "./http.js";

// Corpo genérico. Os campos aceitos de cada endpoint estão no JSDoc / na doc oficial:
// https://SEU-SUBDOMINIO.uazapi.com  (spec: /openapi-bundled.json)
type Body = Record<string, unknown>;

/**
 * Cliente COMPLETO da UazAPI (139 endpoints, uazapiGO v2.1.1).
 * Organizado por categoria, espelhando a documentação oficial.
 * Uso: `const uaz = new UazapiClient(); await uaz.send.text({ number, text })`.
 */
export class UazapiClient {
  readonly http: UazHttp;
  constructor(baseUrl?: string, token?: string) {
    this.http = baseUrl || token ? new UazHttp(baseUrl, token) : new UazHttp();
  }
  private p<T = any>(m: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: Body): Promise<T> {
    return this.http.req<T>(m, path, body);
  }

  // ───────────────────────── Instância ─────────────────────────
  instance = {
    /** Conectar / gerar QR ou pairing code. body: { phone?, browser?, systemName?, proxy_managed_* } */
    connect: (b: Body = {}) => this.p("POST", "/instance/connect", b),
    disconnect: () => this.p("POST", "/instance/disconnect"),
    reset: () => this.p("POST", "/instance/reset"),
    delete: () => this.p("DELETE", "/instance"),
    status: () => this.p("GET", "/instance/status"),
    updateName: (name: string) => this.p("POST", "/instance/updateInstanceName", { name }),
    /** Presença global da instância. presence: online | offline */
    presence: (presence: string) => this.p("POST", "/instance/presence", { presence }),
    getPrivacy: () => this.p("GET", "/instance/privacy"),
    /** body: { groupadd, last, status, profile, readreceipts, online, calladd } */
    setPrivacy: (b: Body) => this.p("POST", "/instance/privacy", b),
    /** Limites atuais de novas conversas (tiers anti-ban). */
    waMessageLimits: () => this.p("GET", "/instance/wa_messages_limits"),
    /** Delay entre mensagens da fila async. body: { msg_delay_min, msg_delay_max } */
    updateDelaySettings: (b: Body) => this.p("POST", "/instance/updateDelaySettings", b),
    getProxy: () => this.p("GET", "/instance/proxy"),
    /** body: { mode, proxy_url, proxy_fallback, confirm_no_proxy, rotate_now } */
    setProxy: (b: Body) => this.p("POST", "/instance/proxy", b),
    proxyCities: () => this.p("GET", "/proxy-managed/cities"),
  };

  // ───────────────────────── Webhook / SSE ─────────────────────────
  webhook = {
    get: () => this.p("GET", "/webhook"),
    /** body: { enabled, url, events[], excludeMessages[], addUrlEvents?, addUrlTypesMessages?, id? } */
    set: (b: Body) => this.p("POST", "/webhook", b),
    errors: () => this.p("GET", "/webhook/errors"),
  };

  // ───────────────────────── Enviar mensagem ─────────────────────────
  send = {
    /** body: { number, text, mentions?, linkPreview?, delay?, replyid?, readchat? } */
    text: (b: Body) => this.p("POST", "/send/text", b),
    /** body: { number, type: image|video|videoplay|document|audio|myaudio|ptt|ptv|sticker, file, text?, docName?, mimetype?, mentions?, delay?, viewOnce? } */
    media: (b: Body) => this.p("POST", "/send/media", b),
    /** Atalho: nota de voz (PTT). */
    ptt: (number: string, file: string, delay = 0) =>
      this.p("POST", "/send/media", { number, type: "ptt", file, delay }),
    /** Atalho: vídeo de bolinha (PTV). */
    ptv: (number: string, file: string, delay = 0) =>
      this.p("POST", "/send/media", { number, type: "ptv", file, delay }),
    /** body: { number, fullName, phoneNumber, organization?, email?, url? } */
    contact: (b: Body) => this.p("POST", "/send/contact", b),
    /** body: { number, name, address, latitude, longitude } */
    location: (b: Body) => this.p("POST", "/send/location", b),
    /** Pede a localização do usuário. body: { number, text } */
    locationButton: (b: Body) => this.p("POST", "/send/location-button", b),
    /** Menu interativo (botões / lista). body: { number, type, text, choices, ... } */
    menu: (b: Body) => this.p("POST", "/send/menu", b),
    /** Carrossel de mídia com botões. body: { number, text, carousel[] } */
    carousel: (b: Body) => this.p("POST", "/send/carousel", b),
    /** body: { number, pixType, pixKey, pixName } */
    pixButton: (b: Body) => this.p("POST", "/send/pix-button", b),
    /** body: { number, title, text, itemName, amount, pixKey, pixType, ... } */
    requestPayment: (b: Body) => this.p("POST", "/send/request-payment", b),
    /** Status/stories. body: { type, text?, file?, background_color?, recipients? } */
    status: (b: Body) => this.p("POST", "/send/status", b),
    /** Presença ("digitando"/"gravando"). body: { number, presence, delay? } */
    presence: (b: Body) => this.p("POST", "/message/presence", b),
  };

  // ───────────────────────── Fila async de envio ─────────────────────────
  async = {
    list: () => this.p("GET", "/message/async"),
    clear: () => this.p("DELETE", "/message/async"),
  };

  // ───────────────────────── Ações na mensagem / buscar ─────────────────────────
  message = {
    /** Apagar para todos. body: { id } */
    delete: (id: string) => this.p("POST", "/message/delete", { id }),
    /** Baixar arquivo. body: { id, return_base64?, generate_mp3?, return_link?, transcribe? } */
    download: (b: Body) => this.p("POST", "/message/download", b),
    /** Editar mensagem enviada. body: { id, text } */
    edit: (id: string, text: string) => this.p("POST", "/message/edit", { id, text }),
    /** Buscar mensagens. body: { chatid?, id?, limit?, offset?, track_source?, track_id? } */
    find: (b: Body) => this.p("POST", "/message/find", b),
    /** Histórico sob demanda. body: { mode, number?, messageid?, count? } */
    historySync: (b: Body) => this.p("POST", "/message/history-sync", b),
    /** Marcar como lida. body: { id } */
    markRead: (id: string) => this.p("POST", "/message/markread", { id }),
    /** Fixar/desafixar. body: { id, pin, duration? } */
    pin: (b: Body) => this.p("POST", "/message/pin", b),
    /** Reagir. body: { number, id, text (emoji) } */
    react: (b: Body) => this.p("POST", "/message/react", b),
  };

  // ───────────────────────── Chats ─────────────────────────
  chat = {
    archive: (number: string, archive: boolean) => this.p("POST", "/chat/archive", { number, archive }),
    /** body: { number, deleteChatDB?, deleteMessagesDB?, deleteChatWhatsApp?, clearChatWhatsApp? } */
    delete: (b: Body) => this.p("POST", "/chat/delete", b),
    ephemeral: (number: string, duration: number) => this.p("POST", "/chat/ephemeral", { number, duration }),
    /** Busca com filtros. body: { operator?, sort?, limit?, offset?, wa_* } */
    find: (b: Body = {}) => this.p("POST", "/chat/find", b),
    mute: (number: string, muteEndTime: number) => this.p("POST", "/chat/mute", { number, muteEndTime }),
    pin: (number: string, pin: boolean) => this.p("POST", "/chat/pin", { number, pin }),
    read: (number: string, read: boolean) => this.p("POST", "/chat/read", { number, read }),
    notes: (number: string) => this.p("POST", "/chat/notes", { number }),
    notesEdit: (number: string, notes: string) => this.p("POST", "/chat/notes/edit", { number, notes }),
    notesRefresh: (number: string, force = false) => this.p("POST", "/chat/notes/refresh", { number, force }),
    /** Bloquear/desbloquear. */
    block: (number: string, block: boolean) => this.p("POST", "/chat/block", { number, block }),
    blocklist: () => this.p("GET", "/chat/blocklist"),
  };

  // ───────────────────────── Contatos ─────────────────────────
  contact = {
    /** Verificar se números têm WhatsApp. body: { numbers: string[] } */
    check: (numbers: string[]) => this.p("POST", "/chat/check", { numbers }),
    /** Detalhes completos. body: { number, preview? } */
    details: (number: string, preview = false) => this.p("POST", "/chat/details", { number, preview }),
    add: (number: string, name: string) => this.p("POST", "/contact/add", { number, name }),
    remove: (number: string) => this.p("POST", "/contact/remove", { number }),
    list: () => this.p("GET", "/contacts"),
    /** Paginado. body: { limit?, offset?, contactScope? } */
    listPaginated: (b: Body = {}) => this.p("POST", "/contacts/list", b),
  };

  // ───────────────────────── Etiquetas ─────────────────────────
  label = {
    list: () => this.p("GET", "/labels"),
    refresh: (force = false) => this.p("POST", "/labels/refresh", { force }),
    /** Criar/editar/deletar etiqueta. body: { labelid?, name?, color?, delete? } */
    edit: (b: Body) => this.p("POST", "/label/edit", b),
    /** Aplicar/remover etiqueta de um chat. body: { number, labelids?, add_labelid?, remove_labelid? } */
    chatLabels: (b: Body) => this.p("POST", "/chat/labels", b),
  };

  // ───────────────────────── Grupos e Comunidades ─────────────────────────
  group = {
    /** body: { name, participants: string[] } */
    create: (b: Body) => this.p("POST", "/group/create", b),
    /** body: { groupjid, getInviteLink?, getRequestsParticipants?, force? } */
    info: (b: Body) => this.p("POST", "/group/info", b),
    inviteInfo: (invitecode: string) => this.p("POST", "/group/inviteInfo", { invitecode }),
    join: (invitecode: string) => this.p("POST", "/group/join", { invitecode }),
    leave: (groupjid: string) => this.p("POST", "/group/leave", { groupjid }),
    list: () => this.p("GET", "/group/list"),
    /** body: { limit?, offset?, search?, force?, noParticipants? } */
    listPaginated: (b: Body = {}) => this.p("POST", "/group/list", b),
    resetInviteCode: (groupjid: string) => this.p("POST", "/group/resetInviteCode", { groupjid }),
    /** action: add | remove | promote | demote | approve | reject */
    updateParticipants: (groupjid: string, action: string, participants: string[]) =>
      this.p("POST", "/group/updateParticipants", { groupjid, action, participants }),
    updateName: (groupjid: string, name: string) => this.p("POST", "/group/updateName", { groupjid, name }),
    updateDescription: (groupjid: string, description: string) =>
      this.p("POST", "/group/updateDescription", { groupjid, description }),
    updateImage: (groupjid: string, image: string) => this.p("POST", "/group/updateImage", { groupjid, image }),
    /** announce=true → só admins enviam mensagem. */
    updateAnnounce: (groupjid: string, announce: boolean) =>
      this.p("POST", "/group/updateAnnounce", { groupjid, announce }),
    /** locked=true → só admins editam dados do grupo. */
    updateLocked: (groupjid: string, locked: boolean) => this.p("POST", "/group/updateLocked", { groupjid, locked }),
    updateJoinApproval: (groupjid: string, IsJoinApprovalRequired: boolean) =>
      this.p("POST", "/group/updateJoinApproval", { groupjid, IsJoinApprovalRequired }),
    /** MemberAddMode: all_member_add | admin_add */
    updateMemberAddMode: (groupjid: string, MemberAddMode: string) =>
      this.p("POST", "/group/updateMemberAddMode", { groupjid, MemberAddMode }),
    ephemeral: (groupjid: string, duration: number) => this.p("POST", "/group/ephemeral", { groupjid, duration }),
    // Comunidades
    communityCreate: (name: string) => this.p("POST", "/community/create", { name }),
    /** body: { community, action, groupjids } */
    communityEditGroups: (b: Body) => this.p("POST", "/community/editgroups", b),
  };

  // ───────────────────────── Chamadas ─────────────────────────
  call = {
    make: (number: string, call_duration?: number) => this.p("POST", "/call/make", { number, call_duration }),
    reject: (number: string, id: string) => this.p("POST", "/call/reject", { number, id }),
  };

  // ───────────────────────── Perfil ─────────────────────────
  profile = {
    setName: (name: string) => this.p("POST", "/profile/name", { name }),
    setImage: (image: string) => this.p("POST", "/profile/image", { image }),
  };

  // ───────────────────────── Respostas rápidas ─────────────────────────
  quickReply = {
    list: () => this.p("GET", "/quickreply/showall"),
    /** body: { id?, delete?, onWhatsApp?, shortCut, type, text?, file?, docName? } */
    edit: (b: Body) => this.p("POST", "/quickreply/edit", b),
  };

  // ───────────────────────── Disparo em massa ─────────────────────────
  sender = {
    /** body: { numbers[], type, folder?, delayMin?, delayMax?, scheduled_for?, info?, mentions? } */
    simple: (b: Body) => this.p("POST", "/sender/simple", b),
    /** body: { delayMin, delayMax, info?, scheduled_for?, messages[] } */
    advanced: (b: Body) => this.p("POST", "/sender/advanced", b),
    /** Controlar campanha. body: { folder_id, action: pause|continue|... } */
    edit: (b: Body) => this.p("POST", "/sender/edit", b),
    listFolders: () => this.p("GET", "/sender/listfolders"),
    /** body: { folder_id, messageStatus?, limit?, offset? } */
    listMessages: (b: Body) => this.p("POST", "/sender/listmessages", b),
    clearAll: () => this.p("DELETE", "/sender/clearall"),
    clearDone: (hours?: number) => this.p("POST", "/sender/cleardone", { hours }),
  };

  // ───────────────────────── CRM (leads) ─────────────────────────
  crm = {
    /** body: { id, lead_field01..., lead_assignedAttendant_id?, lead_isTicketOpen?, chatbot_disableUntil? } */
    editLead: (b: Body) => this.p("POST", "/chat/editLead", b),
    /** Renomeia os campos personalizados de lead. body: { lead_field01...lead_fieldNN } */
    updateFieldsMap: (b: Body) => this.p("POST", "/instance/updateFieldsMap", b),
  };

  // ───────────────────────── Business / Catálogo ─────────────────────────
  business = {
    getCategories: () => this.p("GET", "/business/get/categories"),
    getProfile: (jid: string) => this.p("POST", "/business/get/profile", { jid }),
    /** body: { description?, address?, email? } */
    updateProfile: (b: Body) => this.p("POST", "/business/update/profile", b),
    catalogList: (jid: string, after?: string) => this.p("POST", "/business/catalog/list", { jid, after }),
    catalogInfo: (jid: string, id: string) => this.p("POST", "/business/catalog/info", { jid, id }),
    catalogShow: (id: string) => this.p("POST", "/business/catalog/show", { id }),
    catalogHide: (id: string) => this.p("POST", "/business/catalog/hide", { id }),
    catalogDelete: (id: string) => this.p("POST", "/business/catalog/delete", { id }),
  };

  // ───────────────────────── Canais / Newsletters ─────────────────────────
  newsletter = {
    list: () => this.p("GET", "/newsletter/list"),
    /** body: { name, description?, picture? } */
    create: (b: Body) => this.p("POST", "/newsletter/create", b),
    info: (b: Body) => this.p("POST", "/newsletter/info", b),
    follow: (b: Body) => this.p("POST", "/newsletter/follow", b),
    unfollow: (b: Body) => this.p("POST", "/newsletter/unfollow", b),
    mute: (b: Body) => this.p("POST", "/newsletter/mute", b),
    unmute: (b: Body) => this.p("POST", "/newsletter/unmute", b),
    messages: (b: Body) => this.p("POST", "/newsletter/messages", b),
    react: (b: Body) => this.p("POST", "/newsletter/reaction", b),
    search: (b: Body) => this.p("POST", "/newsletter/search", b),
    /** Endpoints avançados de canal (admin, descrição, foto, dono, etc.) via caller genérico. */
    raw: (path: string, b: Body) => this.p("POST", `/newsletter/${path}`, b),
  };

  // ───────────────────────── Integração Chatwoot ─────────────────────────
  chatwoot = {
    getConfig: () => this.p("GET", "/chatwoot/config"),
    /** body: { enabled, url, access_token, account_id, inbox_id, ... } */
    setConfig: (b: Body) => this.p("PUT", "/chatwoot/config", b),
  };
}

// Instância padrão (usa UAZAPI_URL / UAZAPI_TOKEN do .env).
export const uazapi = new UazapiClient();
