import { config } from "../config.js";
import { inicioEnvio, fimEnvio, origemDoContexto } from "../engine/origem-envio.js";
import { noteBotEcho } from "../engine/bot-echo.js";
import type {
  CarouselCard,
  GroupInfo,
  GroupListItem,
  GroupParticipant,
  InstanceStatus,
  MediaType,
  ParticipantAction,
  Presence,
  SendResult,
  WhatsAppGateway,
} from "./types.js";

// Extrai o código de um link de convite do WhatsApp ("chat.whatsapp.com/SEU-GRUPO") ou aceita
// o código puro. Retorna "" se não reconhecer.
export function extractInviteCode(input: string): string {
  const t = (input ?? "").trim();
  const m = t.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{8,}$/.test(t)) return t; // já é um código puro
  return "";
}

// Implementação do WhatsAppGateway usando a UazAPI (uazapiGO).
// Endpoints e formatos validados ao vivo em 19/07/2026.
export class UazapiGateway implements WhatsAppGateway {
  constructor(
    private readonly baseUrl = config.uazapi.url,
    private readonly token = config.uazapi.token,
  ) {}

  // RAIZ do registro de "quem enviou": todo /send/* que passa por este gateway anota a conversa
  // como "envio nosso em curso", o TEXTO (bot-echo) e, na volta, o ID. É o que deixa o webhook
  // distinguir a fala do robô de alguém digitando no WhatsApp Web (ver engine/origem-envio.ts).
  // Fica aqui embaixo, e não num embrulho opcional, porque um caminho de envio que escapasse do
  // registro faria o robô se pausar sozinho.
  private async call<T = any>(path: string, body: unknown): Promise<T> {
    const alvo = path.startsWith("/send/") ? String((body as any)?.number ?? "") : "";
    if (!alvo) return this.callCru<T>(path, body);
    const texto = String((body as any)?.text ?? (body as any)?.caption ?? "");
    if (texto) noteBotEcho(alvo, texto);
    inicioEnvio(alvo);
    try {
      const r = await this.callCru<T>(path, body);
      fimEnvio(alvo, this.idOf(r), origemDoContexto()); // "ia" dentro de um turno do agente
      return r;
    } catch (e) {
      fimEnvio(alvo);
      throw e;
    }
  }

  private async callCru<T = any>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: this.token },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { _raw: raw };
    }
    if (!res.ok) {
      const msg = json?.error || json?.message || raw || res.statusText;
      throw new Error(`UazAPI ${path} falhou (HTTP ${res.status}): ${msg}`);
    }
    return json as T;
  }

  private idOf(r: any): string {
    return r?.messageid || r?.id || r?.messageId || "";
  }

  // `replyId` = MARCA a mensagem do lead (aquela citação em cima do balão, como a gente faz no
  // WhatsApp). Param confirmado ao vivo 31/07: `replyid` (a resposta passa a trazer quotedMessage).
  async sendText(to: string, text: string, delayMs = 0, replyId?: string): Promise<SendResult> {
    const r = await this.call("/send/text", { number: to, text, delay: delayMs, ...(replyId ? { replyid: replyId } : {}) });
    return { id: this.idOf(r), raw: r };
  }
  // Botões de resposta rápida (quick reply) — UazAPI: /send/menu type button, choices "rótulo|id".
  // Carrossel de cards (imagem + botões, o lead desliza pro lado). Formato confirmado ao vivo
  // 30/07: { number, text, carousel:[{ image, text, buttons:[{type:"replybutton", text}] }] }.
  // O WhatsApp aceita no máximo ~10 cards e 3 botões por card.
  async sendCarousel(to: string, text: string, cards: CarouselCard[], delayMs = 0): Promise<SendResult> {
    const carousel = cards.slice(0, 10).map((c) => ({
      image: c.image,
      text: c.text,
      buttons: (c.buttons ?? []).filter(Boolean).slice(0, 3).map((b) => ({ type: "replybutton", text: b })),
    }));
    if (!carousel.length) throw new Error("carrossel sem cards");
    const r = await this.call("/send/carousel", { number: to, text, carousel, delay: delayMs });
    return { id: this.idOf(r), raw: r };
  }

  // Localização: /send/location com nome e endereço opcionais (o cartão do WhatsApp mostra os dois).
  async sendLocation(to: string, lat: number, lng: number, nome?: string, endereco?: string, delayMs = 0): Promise<SendResult> {
    const r = await this.call("/send/location", {
      number: to, latitude: lat, longitude: lng,
      ...(nome ? { name: nome } : {}), ...(endereco ? { address: endereco } : {}), delay: delayMs,
    });
    return { id: this.idOf(r), raw: r };
  }

  async sendButtons(to: string, text: string, buttons: string[], delayMs = 0): Promise<SendResult> {
    const choices = buttons.filter(Boolean).slice(0, 3).map((b, i) => `${b}|${i + 1}`);
    const r = await this.call("/send/menu", { number: to, type: "button", text, choices, delay: delayMs });
    return { id: this.idOf(r), raw: r };
  }

  async sendTextWithMentions(
    to: string,
    text: string,
    mentions: string[],
    delayMs = 0,
  ): Promise<SendResult> {
    const r = await this.call("/send/text", {
      number: to,
      text,
      mentions: mentions.join(","),
      delay: delayMs,
    });
    return { id: this.idOf(r), raw: r };
  }

  async mentionAll(
    groupJid: string,
    text: string,
    opts?: { hidden?: boolean; excludeSelf?: string; delayMs?: number },
  ): Promise<SendResult> {
    const info = await this.groupInfo(groupJid);
    // telefone quando existe; senão o @lid (participantes com privacidade)
    const numbers = info.participants
      .map((p) => p.phone ?? p.lid)
      .filter((n): n is string => Boolean(n))
      .filter((n) => n !== opts?.excludeSelf);
    // Menção oculta: mantém o texto como veio. Menção visível: prefixa os @número.
    const finalText = opts?.hidden
      ? text
      : `${text}\n\n${numbers.map((n) => `@${n}`).join(" ")}`;
    return this.sendTextWithMentions(groupJid, finalText, numbers, opts?.delayMs ?? 0);
  }

  async sendMedia(input: {
    to: string;
    type: MediaType;
    file: string;
    caption?: string;
    delayMs?: number;
  }): Promise<SendResult> {
    const r = await this.call("/send/media", {
      number: input.to,
      type: input.type,
      file: input.file,
      text: input.caption,
      delay: input.delayMs ?? 0,
    });
    return { id: this.idOf(r), raw: r };
  }

  sendPtt(to: string, file: string, delayMs = 0): Promise<SendResult> {
    return this.sendMedia({ to, type: "ptt", file, delayMs });
  }

  // Templates são exclusivos da API Oficial da Meta — no LITE não existe.
  async sendTemplate(): Promise<SendResult> {
    throw new Error("Template só funciona na API Oficial da Meta (não no modo LITE/QR).");
  }

  sendPtv(to: string, file: string, delayMs = 0): Promise<SendResult> {
    return this.sendMedia({ to, type: "ptv", file, delayMs });
  }

  // ✓✓ AZUL: marca a conversa como lida. Sem isto o lead vê "entregue" (cinza) enquanto o bot já
  // está respondendo — parece robô/número morto. A API Oficial já fazia; o LITE não fazia nada.
  async markRead(to: string): Promise<void> {
    await this.call("/chat/read", { number: to, read: true });
  }

  // "Digitando…" de verdade: a UazAPI mantém a presença pelo `delay` (reenvia a cada 10s e
  // cancela ao enviar mensagem), mas a chamada volta NA HORA. Quem chama conta com a espera
  // (presença → texto): sem segurar aqui, o texto saía em seguida e cancelava o indicador antes
  // de o lead ver. Segura só o que faltar do `delayMs` (se a API demorou, não dobra a espera).
  async sendPresence(to: string, presence: Presence, delayMs = 0): Promise<void> {
    const t0 = Date.now();
    await this.call("/message/presence", { number: to, presence, delay: delayMs });
    const resto = delayMs - (Date.now() - t0);
    if (resto > 0) await new Promise((r) => setTimeout(r, resto));
  }

  // 📞 LIGA pro contato pelo WhatsApp. FAZ O TELEFONE TOCAR. Sem áudio: a chamada fica muda
  // (testado 22/08 — a UazAPI não injeta stream). `callDuration` é a duração em segundos, no
  // padrão do Z-API (default 5, teto 15); a UazAPI é Baileys como o Z-API, então mandamos igual.
  async makeCall(to: string, callDuration?: number): Promise<void> {
    const body: Record<string, unknown> = { number: to };
    if (callDuration && callDuration > 0) body.callDuration = Math.min(15, Math.max(1, Math.round(callDuration)));
    await this.call("/call/make", body);
  }

  async checkNumbers(numbers: string[]): Promise<Array<{ number: string; exists: boolean }>> {
    const r = await this.call<any>("/chat/check", { numbers });
    const arr: any[] = Array.isArray(r) ? r : (r?.result ?? r?.data ?? []);
    return arr.map((item) => ({
      number: String(item?.query ?? item?.number ?? item?.phone ?? ""),
      exists: Boolean(item?.exists ?? item?.isInWhatsapp ?? item?.verifiedName ?? false),
    }));
  }

  async groupInfo(groupJid: string, opts?: { inviteLink?: boolean }): Promise<GroupInfo> {
    const r = await this.call<any>("/group/info", {
      groupjid: groupJid,
      getInviteLink: Boolean(opts?.inviteLink),
    });
    const parts: any[] = r?.Participants ?? r?.participants ?? [];
    const participants: GroupParticipant[] = parts.map((p) => {
      const phoneRaw = String(p?.PhoneNumber ?? p?.phoneNumber ?? "");
      const lidRaw = String(p?.LID || p?.lid || p?.JID || "");
      return {
        // trata string vazia como null (alguns participantes só expõem @lid)
        phone: phoneRaw ? phoneRaw.replace(/@.*/, "") : null,
        lid: lidRaw ? lidRaw.replace(/@.*/, "") : null,
        isAdmin: Boolean(p?.IsAdmin ?? p?.isAdmin),
        isSuperAdmin: Boolean(p?.IsSuperAdmin ?? p?.isSuperAdmin),
        displayName: p?.DisplayName ?? p?.displayName ?? undefined,
      };
    });
    return {
      jid: r?.JID ?? groupJid,
      name: r?.Name ?? r?.name ?? "",
      participants,
      inviteLink: r?.invite_link ?? r?.InviteLink ?? undefined,
    };
  }

  async instanceStatus(): Promise<InstanceStatus> {
    const res = await fetch(this.baseUrl + "/instance/status", { headers: { token: this.token } });
    const raw = await res.text();
    let json: any = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw new Error(`UazAPI /instance/status falhou (HTTP ${res.status})`);
    const inst = json?.instance ?? json ?? {};
    return {
      status: String(inst.status ?? "unknown"),
      number: inst.owner ? String(inst.owner) : undefined,
      name: inst.name ?? undefined,
      profileName: inst.profileName ?? undefined,
      profilePicUrl: inst.profilePicUrl ?? undefined,
      qrcode: inst.qrcode || undefined,
      paircode: inst.paircode || undefined,
    };
  }

  async listGroups(force = false): Promise<GroupListItem[]> {
    // ⚠️ Sem `limit`, a UazAPI devolve só os primeiros 50 (default) — no painel parecia "grupo
    // sumido" na busca. `force: true` busca direto do WhatsApp (lento, ~7s) em vez do cache do
    // servidor UazAPI, que atrasa pra grupos novos — usado pelo "↻ Atualizar" do seletor.
    const r = await this.call<any>("/group/list", force ? { limit: 5000, force: true } : { limit: 5000 });
    const arr: any[] = r?.groups ?? r?.Groups ?? [];
    return arr
      .map((g) => ({
        jid: String(g?.JID ?? g?.jid ?? ""),
        name: String(g?.Name ?? g?.name ?? "").trim(),
        participantCount:
          Number(
            g?.ParticipantCount ??
              g?.participantCount ??
              (Array.isArray(g?.Participants) ? g.Participants.length : 0),
          ) || undefined,
        isAnnounce: Boolean(g?.IsAnnounce ?? g?.isAnnounce),
      }))
      .filter((g) => g.jid.endsWith("@g.us"));
  }

  async inviteInfo(codeOrLink: string): Promise<{ jid: string; name: string } | null> {
    const code = extractInviteCode(codeOrLink);
    if (!code) return null;
    try {
      const r = await this.call<any>("/group/inviteInfo", { invitecode: code });
      const g = r?.group ?? r?.Group ?? r;
      const jid = String(g?.JID ?? g?.jid ?? "");
      if (!jid.endsWith("@g.us")) return null;
      return { jid, name: String(g?.Name ?? g?.name ?? "") };
    } catch {
      return null;
    }
  }

  updateParticipants(
    groupJid: string,
    action: ParticipantAction,
    participants: string[],
  ): Promise<unknown> {
    return this.call("/group/updateParticipants", {
      groupjid: groupJid,
      action,
      participants,
    });
  }

  setWebhook(input: {
    url: string;
    events: string[];
    excludeMessages?: string[];
    enabled?: boolean;
  }): Promise<unknown> {
    return this.call("/webhook", {
      enabled: input.enabled ?? true,
      url: input.url,
      events: input.events,
      excludeMessages: input.excludeMessages ?? ["wasSentByApi"],
    });
  }
}

export const gateway: WhatsAppGateway = new UazapiGateway();
