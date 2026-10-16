import { origemDoContexto } from "../engine/origem-envio.js";
// Gateway da WhatsApp Cloud API (oficial da Meta). Implementa a MESMA interface WhatsAppGateway
// que o motor já usa — então os fluxos (texto, mídia, botões, IA, captura) rodam idênticos,
// só trocando o "canhão" de saída de LITE (UazAPI) para Oficial (Graph API).
//
// O que a API Oficial NÃO faz (é 1:1, não mexe em grupo): marcar-todos, participantes, info/lista
// de grupo, vídeo de bolinha (PTV). Esses métodos lançam erro claro — o passo do fluxo que os usa
// falha sozinho, sem derrubar o resto (o runner isola erro por passo).
import type {
  GroupInfo,
  GroupListItem,
  InstanceStatus,
  MediaType,
  ParticipantAction,
  Presence,
  SendResult,
  WhatsAppGateway,
} from "./types.js";
import {
  metaMarkRead,
  metaPhoneInfo,
  metaSendButtons,
  metaSendMedia,
  metaSendLocation, metaSendText,
  metaSendTemplate,
  type MetaMediaKind,
  metaHeaderDoTemplate,
  metaRetratoDoTemplate,
  preencheCorpoTemplate,
} from "../meta.js";
import { arquivarMensagens } from "../repo.js";

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// 💬 "DIGITANDO..." NA API OFICIAL. A Cloud API TEM o indicador — mas só atrelado ao message_id de
// uma mensagem que a pessoa acabou de mandar (e ele some em 25s). Como o webhook já marca cada
// inbound como lido, guardamos aqui o id da ÚLTIMA fala de cada telefone: é exatamente o contexto
// que faltava. Num fluxo de template, o clique no botão É uma mensagem do lead — então o passo
// "Digitando..." depois do clique passa a funcionar de verdade (antes era no-op silencioso).
// Memória curta de propósito: id velho a Meta recusa, e o Map não pode crescer sem fim.
const VALIDADE_TYPING_MS = 25_000;
const ultimaFalaDoLead = new Map<string, { id: string; at: number }>();
const soDigitos = (v: string) => String(v ?? "").replace(/\D/g, "");
export function lembraFalaDoLead(phone: string, messageId: string): void {
  const k = soDigitos(phone);
  if (!k || !messageId) return;
  ultimaFalaDoLead.set(k, { id: messageId, at: Date.now() });
  if (ultimaFalaDoLead.size > 500) {
    // poda o que já venceu (e, no pior caso, o mais antigo) — teto de memória
    const agora = Date.now();
    for (const [kk, v] of ultimaFalaDoLead) if (agora - v.at > VALIDADE_TYPING_MS) ultimaFalaDoLead.delete(kk);
    if (ultimaFalaDoLead.size > 500) ultimaFalaDoLead.delete(ultimaFalaDoLead.keys().next().value as string);
  }
}

function unsupported(feature: string): never {
  throw new Error(`${feature} não é suportado na API Oficial da Meta (recurso exclusivo do modo LITE/QR).`);
}

export interface MetaGatewayCreds {
  phoneNumberId: string;
  accessToken: string;
  // Necessário SÓ pra template com mídia no cabeçalho: é pela WABA que se descobre o formato
  // (imagem/vídeo/documento) e o arquivo de exemplo aprovado. Sem isto, a Meta recusa o envio
  // com 132012 ("o formato não bate com o do template") — foi o que segurou o teste de 17/08.
  wabaId?: string;
  // 🔒 DONO deste número. O arquivo era gravado sem workspace, caindo no `getCurrentWorkspace()`
  // — que, FORA de um contexto de workspace, devolve o PRIMÁRIO (o do dono). Resultado: toda
  // mensagem que um cliente enviava pelo painel era arquivada DUAS vezes, uma na conta dele e
  // outra na do dono (30/09: 16 mensagens de um cliente, em 7 conversas, dentro da Agência).
  // Com o dono explícito aqui, o arquivo nunca mais depende do contexto.
  wsId?: string;
}

export class MetaGateway implements WhatsAppGateway {
  constructor(private readonly creds: MetaGatewayCreds) {}

  private ok(r: { id?: string; waId?: string; raw: unknown }): SendResult {
    return { id: r.id ?? "", waId: r.waId, raw: r.raw };
  }

  // 📚 Guarda no NOSSO banco o que o motor mandou. Na API Oficial a Meta não devolve histórico —
  // se não arquivarmos aqui, a tela "WPP Api" mostraria só o que o cliente escreveu, como se a
  // gente nunca tivesse respondido. Best-effort: falha no arquivo nunca quebra o envio.
  // `to` aqui deve ser o waId devolvido pela Meta quando houver (r.waId || to): é a chave que o
  // webhook de recebidas também usa — arquivar pelo número DIGITADO dividia a conversa em duas.
  private arquiva(to: string, texto: string, id?: string, tipo = "text", extra?: Record<string, unknown>): void {
    if (!id || !texto) return;
    void arquivarMensagens(
      String(to).replace(/\D/g, ""),
      // Selo "Agente IA": só grava origem quando o envio saiu de dentro do agente — o envio manual
      // do painel grava "painel" por conta própria e não pode ser sobrescrito aqui.
      [{ msg_id: id, from_me: true, body: texto, msg_type: tipo, ts: Math.floor(Date.now() / 1000),
         ...((extra || origemDoContexto() === "ia") ? { extra: { ...(extra ?? {}), ...(origemDoContexto() === "ia" ? { origem: "ia" } : {}) } } : {}) }],
      "meta-" + this.creds.phoneNumberId,
      this.creds.wsId, // undefined mantém o comportamento antigo (contexto atual)
    ).catch(() => {});
  }

  async sendText(to: string, text: string, delayMs = 0, respondeA?: string): Promise<SendResult> {
    await sleep(delayMs);
    const r = this.ok(await metaSendText(this.creds.phoneNumberId, this.creds.accessToken, to, text, respondeA));
    this.arquiva(r.waId || to, text, r.id);
    return r;
  }

  // Menções só existem em grupo → na API Oficial cai pra texto puro (sem @).
  async sendTextWithMentions(to: string, text: string, _mentions: string[], delayMs = 0): Promise<SendResult> {
    return this.sendText(to, text, delayMs);
  }

  async sendLocation(to: string, lat: number, lng: number, nome?: string, endereco?: string, delayMs = 0): Promise<SendResult> {
    await sleep(delayMs);
    const r = this.ok(await metaSendLocation(this.creds.phoneNumberId, this.creds.accessToken, to, lat, lng, nome, endereco));
    // Arquiva como "location" com as coordenadas no extra: o inbox oficial desenha o mesmo cartão
    // que o cliente vê (antes era um texto "[localização] …" solto).
    this.arquiva(r.waId || to, [nome, endereco].filter(Boolean).join("\n") || "Localização", r.id, "location", { local: { lat, lng, nome, endereco } });
    return r;
  }

  async mentionAll(): Promise<SendResult> {
    return unsupported("Marcar todos");
  }

  async sendMedia(input: {
    to: string;
    type: MediaType;
    file: string;
    caption?: string;
    delayMs?: number;
    voice?: boolean;
  }): Promise<SendResult> {
    await sleep(input.delayMs ?? 0);
    const kind = mapMediaType(input.type);
    let res;
    try {
      res = await metaSendMedia(this.creds.phoneNumberId, this.creds.accessToken, input.to, kind, input.file, input.caption, input.voice);
    } catch (e: any) {
      // Nota de voz recusada pelo campo "voice" (conta/versão sem suporte)? Vai como áudio comum.
      // Erro de janela de 24h (131047) não muda reenviando — sobe direto.
      if (!input.voice || /131047|24 hours|re-?engagement/i.test(String(e?.message ?? e))) throw e;
      res = await metaSendMedia(this.creds.phoneNumberId, this.creds.accessToken, input.to, kind, input.file, input.caption);
    }
    const r = this.ok(res);
    // Arquiva no formato que a tela WPP Api renderiza: 1ª linha = URL do arquivo, resto = legenda.
    this.arquiva(r.waId || input.to, input.file + (input.caption ? "\n" + input.caption : ""), r.id, kind);
    return r;
  }

  // Nota de voz → audio (a Cloud API não distingue PTT com waveform; envia como audio).
  async sendPtt(to: string, file: string, delayMs = 0): Promise<SendResult> {
    return this.sendMedia({ to, type: "audio", file, delayMs });
  }

  async sendPtv(_to: string, _file: string, _delayMs = 0): Promise<SendResult> {
    return unsupported("Vídeo de bolinha (PTV)");
  }

  // Template aprovado — funciona FORA da janela de 24h (o diferencial da API Oficial).
  // ⚠️ Template com IMAGEM/VÍDEO/DOCUMENTO no cabeçalho SÓ é aceito se o arquivo for junto no
  // envio. O disparador já resolvia isso; o FLUXO não — e o template morria em 132012, calado.
  // Aqui o cabeçalho é resolvido sozinho (com cache), então qualquer caminho que use o gateway
  // manda certo.
  async sendTemplate(to: string, name: string, language: string, params: string[], delayMs = 0, headerUrl?: string): Promise<SendResult> {
    await sleep(delayMs);
    // Retrato completo do modelo (corpo, rodapé, botões e cabeçalho) — a MESMA fonte que o inbox
    // e o disparador já usavam. Sem isto o envio por fluxo arquivava só "[template nome]".
    const retrato = this.creds.wabaId
      ? await metaRetratoDoTemplate(this.creds.wabaId, this.creds.accessToken, name, language || "pt_BR").catch(() => null)
      : null;
    const auto = retrato?.header ?? null;
    // O formato (imagem/vídeo/documento) vem SEMPRE do template aprovado — quem manda no arquivo é
    // o passo (headerUrl). Sem arquivo próprio, cai na mídia de exemplo da aprovação.
    const url = String(headerUrl ?? "").trim();
    const header = auto ? { format: auto.format, url: url || auto.url } : null;
    const r = this.ok(
      await metaSendTemplate(this.creds.phoneNumberId, this.creds.accessToken, to, name, language || "pt_BR", params || [], header ?? undefined),
    );
    // ARQUIVA — era o ÚNICO envio do gateway que não arquivava: template mandado por FLUXO
    // (recuperação de venda, cobrança) saía de verdade e a conversa no WPP Api ficava sem ele,
    // como se a gente nunca tivesse falado. Mesmo formato dos outros caminhos de template
    // ("URL\ntexto" quando tem mídia no topo), e pela chave real (waId).
    // O gateway não resolve o CORPO do template (só o cabeçalho), então o arquivo guarda o nome e
    // os valores que foram — melhor do que a conversa mostrar um buraco. O inbox oficial já sabe
    // desenhar msg_type "template".
    // O texto que a pessoa LEU: corpo do modelo com {{1}}, {{2}}… já preenchidos. Só cai no
    // "[template nome]" se a Graph não devolveu o modelo (conta sem waba, rede fora).
    const corpo = retrato?.corpo
      ? preencheCorpoTemplate(retrato.corpo, params || [])
      : `[template ${name}]` + ((params || []).length ? " " + (params || []).join(" · ") : "");
    const comMidia = !!header?.url;
    this.arquiva(
      r.waId || to,
      comMidia ? header!.url + "\n" + corpo : corpo,
      r.id,
      comMidia ? header!.format : "template",
      // extra.tpl: o inbox desenha rodapé/botões e mostra DE QUAL modelo a mensagem veio.
      { tpl: { nome: name, idioma: language || "pt_BR", rodape: retrato?.rodape ?? "", botoes: retrato?.botoes ?? [] } },
    );
    return r;
  }

  // Carrossel de cards só existe no LITE — na Cloud API o equivalente é um template de carrossel
  // aprovado pela Meta (outro caminho, com aprovação prévia).
  async sendCarousel(): Promise<SendResult> {
    throw new Error("Carrossel só funciona no WhatsApp Lite (na API Oficial exige template aprovado).");
  }

  async sendButtons(to: string, text: string, buttons: string[], delayMs = 0): Promise<SendResult> {
    await sleep(delayMs);
    // A Cloud API rejeita a mensagem INTEIRA (400) se algum título for vazio — então filtramos
    // vazios/whitespace (ex.: um {{campo}} que resolveu pra ""), igual o gateway LITE faz.
    const valid = buttons.map((b) => String(b ?? "").trim()).filter(Boolean);
    if (valid.length === 0) {
      // sem botão válido → manda só o texto (melhor que falhar e sumir o balão)
      return this.ok(await metaSendText(this.creds.phoneNumberId, this.creds.accessToken, to, text));
    }
    return this.ok(await metaSendButtons(this.creds.phoneNumberId, this.creds.accessToken, to, text, valid));
  }

  // "Digitando..." de verdade: usa o id da última fala do lead (guardado no markRead do webhook).
  // Sem fala recente — ex.: 1º disparo, ninguém escreveu ainda — a Meta não tem a quem atrelar o
  // indicador: aí só espera, como antes. A pausa acontece nos dois casos (é ela que dá o ritmo).
  async sendPresence(to: string, presence: Presence, delayMs = 0): Promise<void> {
    const ctx = ultimaFalaDoLead.get(soDigitos(to));
    if (ctx && Date.now() - ctx.at < VALIDADE_TYPING_MS && presence !== "paused") {
      // best-effort: o indicador é enfeite, não pode derrubar o passo seguinte da conversa
      await metaMarkRead(this.creds.phoneNumberId, this.creds.accessToken, ctx.id, true).catch(() => {});
    }
    await sleep(delayMs);
  }

  // Marca uma mensagem específica como lida (✓✓) — chamado direto no webhook, não faz parte da interface.
  // `de` = telefone do lead: é aqui que o contexto do "digitando..." é aprendido (ver lembraFalaDoLead).
  async markRead(messageId: string, de?: string): Promise<void> {
    if (!messageId) return;
    if (de) lembraFalaDoLead(de, messageId);
    await metaMarkRead(this.creds.phoneNumberId, this.creds.accessToken, messageId, false);
  }

  // A Cloud API não tem checagem de "número existe" como a UazAPI. Assume existente (best-effort).
  async checkNumbers(numbers: string[]): Promise<Array<{ number: string; exists: boolean }>> {
    return numbers.map((number) => ({ number, exists: true }));
  }

  async groupInfo(): Promise<GroupInfo> {
    return unsupported("Informações de grupo");
  }
  async listGroups(): Promise<GroupListItem[]> {
    return unsupported("Listar grupos");
  }
  async inviteInfo(): Promise<{ jid: string; name: string } | null> {
    return unsupported("Convite de grupo");
  }

  async instanceStatus(): Promise<InstanceStatus> {
    try {
      const info = await metaPhoneInfo(this.creds.phoneNumberId, this.creds.accessToken);
      return {
        status: "connected",
        number: info.display_phone_number?.replace(/\D/g, "") || undefined,
        name: info.verified_name || undefined,
        profileName: info.verified_name || undefined,
      };
    } catch (e: any) {
      return { status: "disconnected", name: e?.message };
    }
  }

  async updateParticipants(
    _groupJid: string,
    _action: ParticipantAction,
    _participants: string[],
  ): Promise<unknown> {
    return unsupported("Gerenciar participantes de grupo");
  }

  // O webhook da Cloud API é configurado no painel da Meta (não via API neste ponto). No-op.
  async setWebhook(): Promise<unknown> {
    return { ok: true, note: "webhook da Meta é configurado no painel do app, não via API" };
  }
}

function mapMediaType(t: MediaType): MetaMediaKind {
  switch (t) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
    case "ptt":
      return "audio";
    case "document":
      return "document";
    case "sticker":
      return "sticker";
    case "ptv":
      return unsupported("Vídeo de bolinha (PTV)");
    default:
      return "document";
  }
}
