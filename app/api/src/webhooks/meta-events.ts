// Normaliza o webhook da WhatsApp Cloud API (Meta) para o MESMO formato do inbound LITE
// (UazapiIncomingMessage), pra reaproveitar todo o processInbound (opt-out/agente/captura/keyword).
import type { UazapiIncomingMessage } from "./uazapi-events.js";

export interface MetaInbound {
  phoneNumberId: string; // metadata.phone_number_id — roteia para a workspace/credenciais certas
  msg: UazapiIncomingMessage;
  // Legenda de mídia (image/video/document.caption). Vai SEPARADA do msg.text de propósito:
  // legenda não dispara keyword/fluxo (mesmo comportamento de antes) — só entra no arquivo do chat.
  caption?: string;
  // Resposta de um WhatsApp Flow (formulário nativo preenchido): interactive.nfm_reply.response_json
  // parseado. Também vai SEPARADO do msg.text — preencher formulário não é "mandar palavra-chave".
  flowResposta?: Record<string, unknown>;
  // Lead veio de um ANÚNCIO Click-to-WhatsApp (CTWA): a Meta manda o objeto `referral` na 1ª
  // mensagem. Guardamos pra atribuição (qual anúncio trouxe o lead) e pra janela GRÁTIS de 72h
  // (Free Entry Point: respondeu em 24h → templates de graça por 72h a partir da resposta).
  anuncio?: { headline?: string; sourceUrl?: string; sourceId?: string; sourceType?: string; ctwaClid?: string; imageUrl?: string; videoUrl?: string; thumbUrl?: string; corpo?: string };
  // A QUE mensagem nossa esta resposta se refere (messages[].context.id). É o que permite dizer,
  // sem adivinhar por horário, "esta pessoa clicou em Entrar no Grupo DO template X" — a Meta
  // manda o id em todo clique de botão de template e em toda resposta citada. Vai pro arquivo
  // (extra.respondeA) pra atribuição exata de cliques por template e por pessoa.
  respondeA?: string;
}

// STATUS de mensagens ENVIADAS (sent → delivered → read → ou failed). A Meta manda em
// value.statuses; era ignorado — agora alimenta os contadores diários da página Métricas e o
// ack (✓/✓✓/✓✓azul) da mensagem arquivada.
export interface MetaStatus {
  phoneNumberId: string;
  msgId: string;
  status: string; // sent | delivered | read | failed
  ts: number;
  // Quando status = failed, a Meta diz POR QUÊ aqui — e a gente jogava fora. Sem isso, "a Meta
  // aceitou mas não chegou" ficava sem explicação possível: o envio deu 200, a mensagem sumiu, e
  // o motivo (limite de marketing por pessoa, número fora do WhatsApp, janela fechada) só existia
  // neste campo.
  paraQuem?: string;
  erros?: Array<{ code: number; title: string; detalhe: string }>;
}

// Os códigos de falha que mais aparecem, traduzidos pro que a pessoa precisa FAZER. A Meta manda
// o texto em inglês e genérico ("message undeliverable"); aqui vira instrução.
const EXPLICA_ERRO: Record<number, string> = {
  131049: "a Meta SEGUROU a entrega pra não saturar quem recebe (limite de marketing por pessoa). Acontece muito testando o mesmo número várias vezes no dia — espere algumas horas ou teste em outro número.",
  130472: "este número está num experimento da Meta de limite de marketing — a entrega é segurada de propósito. Teste em outro número.",
  131047: "faz mais de 24h desde a última mensagem da pessoa e o template não se encaixa na regra de reengajamento.",
  131026: "não dá pra entregar: o número não tem WhatsApp, está inativo, ou o aparelho não suporta a mensagem.",
  131051: "tipo de mensagem não suportado por esse destinatário.",
  131000: "erro genérico da Meta — costuma ser temporário; tente de novo em alguns minutos.",
  133010: "o número remetente não está registrado na Cloud API (falta o passo de registro com o PIN).",
  131031: "a conta está restrita ou bloqueada pela Meta — confira a qualidade do número no Gerenciador.",
  131042: "a Meta barrou por PAGAMENTO: a forma de pagamento da conta do WhatsApp está com problema (cartão vencido/recusado ou fatura em aberto). Resolva no Gerenciador de Negócios — nenhum envio pago sai enquanto isso não for corrigido.",
  132000: "faltou preencher alguma variável do template (ou sobrou): a quantidade tem que bater exatamente com o modelo aprovado.",
};
export function explicaErroMeta(code: number, titulo: string): string {
  return EXPLICA_ERRO[code] ?? titulo ?? "sem descrição";
}
export function parseMetaStatuses(body: any): MetaStatus[] {
  const out: MetaStatus[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = ch?.value;
      if (!value || ch?.field !== "messages") continue;
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
      for (const s of Array.isArray(value?.statuses) ? value.statuses : []) {
        const status = String(s?.status ?? "");
        const msgId = String(s?.id ?? "");
        if (!status || !msgId) continue;
        const erros = (Array.isArray(s?.errors) ? s.errors : []).map((e: any) => ({
          code: Number(e?.code ?? 0),
          title: String(e?.title ?? ""),
          detalhe: String(e?.error_data?.details ?? e?.message ?? ""),
        }));
        out.push({
          phoneNumberId, msgId, status,
          ts: Number(s?.timestamp ?? 0) || Math.floor(Date.now() / 1000),
          paraQuem: String(s?.recipient_id ?? "") || undefined,
          ...(erros.length ? { erros } : {}),
        });
      }
    }
  }
  return out;
}

// 📞 LIGAÇÕES (Business Calling API, Fase 0): o campo `calls` do webhook. A doc não publica o
// payload completo, então o parse é DEFENSIVO — tenta os nomes de campo prováveis e carrega o
// `raw` junto pro server logar e a gente calibrar com a primeira ligação real. Só funciona com o
// campo `calls` assinado no app (Painel da Meta → Webhooks → WhatsApp Business Account → calls).
export interface MetaCall {
  phoneNumberId: string;
  displayNumber: string; // número do NEGÓCIO (metadata) — pra descobrir qual lado é o lead
  callId: string;
  from: string;
  to: string;
  evento: string;   // connect | terminate | … (minúsculo)
  direcao: string;  // USER_INITIATED | BUSINESS_INITIATED | ""
  ts: number;
  duracaoSeg: number | null; // costuma vir no terminate
  statusFim: string; // completed | missed | rejected | … se a Meta mandar
  raw: unknown;
}
export function parseMetaCalls(body: any): MetaCall[] {
  const out: MetaCall[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = ch?.value;
      if (!value || ch?.field !== "calls") continue;
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
      const displayNumber = String(value?.metadata?.display_phone_number ?? "");
      for (const c of Array.isArray(value?.calls) ? value.calls : []) {
        const callId = String(c?.id ?? "");
        const from = String(c?.from ?? c?.wa_id ?? "");
        if (!callId && !from) continue;
        const durBruta = c?.duration ?? c?.call_duration ?? c?.session?.duration;
        const dur = Number(durBruta);
        out.push({
          phoneNumberId, displayNumber, callId, from,
          to: String(c?.to ?? ""),
          evento: String(c?.event ?? "").toLowerCase(),
          direcao: String(c?.direction ?? "").toUpperCase(),
          ts: Number(c?.timestamp ?? 0) || Math.floor(Date.now() / 1000),
          duracaoSeg: Number.isFinite(dur) ? dur : null,
          statusFim: String(c?.status ?? "").toLowerCase(),
          raw: c,
        });
      }
    }
  }
  return out;
}

// Extrai a(s) mensagem(ns) recebida(s) de um POST /webhooks/meta. Ignora status (entregue/lido) e
// eventos que não sejam mensagem. Pega texto de: text, botão interativo, lista e quick-reply.
export function parseMetaInbound(body: any): MetaInbound[] {
  const out: MetaInbound[] = [];
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const value = ch?.value;
      if (!value || ch?.field !== "messages") continue;
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
      const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
      const nameByWaId = new Map<string, string>();
      for (const c of contacts) {
        if (c?.wa_id) nameByWaId.set(String(c.wa_id), String(c?.profile?.name ?? ""));
      }
      const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
      for (const m of messages) {
        const from = String(m?.from ?? "");
        if (!from) continue;
        const type = String(m?.type ?? "");
        // Áudio da Oficial (14/10/2026): isAudio=true liga a transcrição. O server baixa pela Graph
        // (token da conta, guardado por msg.id em tokenAudioOficial) — nunca pelo download da UazAPI.
        const text = extractText(m, type);
        const caption = m?.[type] && typeof m[type] === "object" ? String(m[type]?.caption ?? "") : "";
        out.push({
          phoneNumberId,
          caption: caption || undefined,
          flowResposta: flowRespostaDe(m, type),
          anuncio: anuncioDe(m),
          // Reação: o alvo vem em reaction.message_id (não em context) — mesmo campo pro server.
          respondeA: String(m?.context?.id ?? (type === "reaction" ? m?.reaction?.message_id : "") ?? "").trim() || undefined,
          msg: {
            id: String(m?.id ?? ""),
            mediaId: mediaIdOf(m, type),
            type,
            isAudio: type === "audio",
            from,
            name: nameByWaId.get(from) || "",
            text,
            fromMe: false, // a Cloud API não entrega as próprias mensagens neste webhook
            isGroup: false, // API Oficial é 1:1 — grupos são exclusivos do modo LITE
            source: "", // a Cloud API não expõe o aparelho — o corte da IA pelo celular é do LITE
            local: localDe(m, type),
            contatos: contatosDe(m, type),
          },
        });
      }
    }
  }
  return out;
}

// 👤 CONTATO(S) compartilhado(s) (type "contacts"): a Cloud API manda
// [{ name: { formatted_name }, phones: [{ phone, wa_id }] }]. Sem isto a mensagem não tem texto e
// caía no "sem texto — ignorado" — o contato sumia da conversa (mesmo caso da localização).
function contatosDe(m: any, type: string): Array<{ nome: string; telefone: string }> | undefined {
  if (type !== "contacts" || !Array.isArray(m?.contacts)) return undefined;
  const out: Array<{ nome: string; telefone: string }> = [];
  for (const c of m.contacts.slice(0, 10)) {
    const n = c?.name ?? {};
    const nome = String(n.formatted_name ?? [n.first_name, n.last_name].filter(Boolean).join(" ") ?? "").trim();
    const tel0 = Array.isArray(c?.phones) ? c.phones[0] : undefined;
    // `wa_id` é o número no WhatsApp (só dígitos); `phone` é como a pessoa digitou na agenda.
    const telefone = String(tel0?.wa_id ?? tel0?.phone ?? "").trim();
    if (nome || telefone) out.push({ nome: nome || telefone, telefone });
  }
  return out.length ? out : undefined;
}

// 📍 Localização (type "location"): { latitude, longitude, name?, address?, url? }.
function localDe(m: any, type: string): { lat: number; lng: number; nome?: string; endereco?: string; url?: string } | undefined {
  if (type !== "location" || !m?.location || typeof m.location !== "object") return undefined;
  const lat = Number(m.location.latitude), lng = Number(m.location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const url = String(m.location.url ?? "").trim();
  return {
    lat, lng,
    nome: String(m.location.name ?? "").trim() || undefined,
    endereco: String(m.location.address ?? "").trim() || undefined,
    url: /^https?:\/\//i.test(url) ? url : undefined,
  };
}

function extractText(m: any, type: string): string {
  switch (type) {
    case "text":
      return String(m?.text?.body ?? "");
    case "interactive": {
      const it = m?.interactive;
      if (it?.type === "button_reply") return String(it?.button_reply?.title ?? "");
      if (it?.type === "list_reply") return String(it?.list_reply?.title ?? "");
      return "";
    }
    case "button": // quick-reply de template
      return String(m?.button?.text ?? m?.button?.payload ?? "");
    case "reaction": // 😀 o lead reagiu a uma mensagem: o "texto" é o emoji ("" = tirou a reação)
      return String(m?.reaction?.emoji ?? "");
    default:
      return "";
  }
}

// id da mídia (pra baixar depois via Graph, quando formos transcrever/salvar). Fase 1 não usa.
function mediaIdOf(m: any, type: string): string {
  const media = m?.[type];
  return media && typeof media === "object" ? String(media?.id ?? "") : "";
}

// Objeto `referral` = a mensagem veio de um Click-to-WhatsApp Ad (ou botão de página do FB).
// ctwa_clid é o id do clique — serve pra Conversions API atribuir a venda ao anúncio certo.
function anuncioDe(m: any): MetaInbound["anuncio"] {
  const r = m?.referral;
  if (!r || typeof r !== "object") return undefined;
  return {
    headline: r.headline ? String(r.headline) : undefined,
    sourceUrl: r.source_url ? String(r.source_url) : undefined,
    sourceId: r.source_id ? String(r.source_id) : undefined,
    sourceType: r.source_type ? String(r.source_type) : undefined,
    ctwaClid: r.ctwa_clid ? String(r.ctwa_clid) : undefined,
    // 🖼️ a MINIATURA do anúncio (pedido do dono, 13/10): a Meta manda a arte junto no referral —
    // era jogada fora e o atendente não via QUAL criativo trouxe o lead.
    imageUrl: r.image_url ? String(r.image_url) : undefined,
    videoUrl: r.video_url ? String(r.video_url) : undefined,
    thumbUrl: r.thumbnail_url ? String(r.thumbnail_url) : undefined,
    corpo: r.body ? String(r.body) : undefined,
  };
}

// Resposta de WhatsApp Flow: interactive.nfm_reply carrega o formulário preenchido em
// response_json (STRING JSON). Devolve o objeto parseado ou undefined (não é resposta de Flow).
function flowRespostaDe(m: any, type: string): Record<string, unknown> | undefined {
  if (type !== "interactive" || m?.interactive?.type !== "nfm_reply") return undefined;
  try {
    const j = JSON.parse(String(m.interactive?.nfm_reply?.response_json ?? "{}"));
    return j && typeof j === "object" ? j : undefined;
  } catch {
    return undefined;
  }
}
