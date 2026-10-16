// WhatsApp Cloud API (oficial da Meta) — helpers de baixo nível.
// Foco principal do produto (80%). Envio/recebimento oficial vive aqui.
import crypto from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

// Mensagem de erro ÚTIL da Graph API: prefere o texto pro usuário / o detalhe acionável.
function graphErr(data: any, status: number): string {
  const e = data?.error;
  return e?.error_user_msg || e?.error_data?.details || e?.message || `Graph API HTTP ${status}`;
}

export interface MetaPhoneInfo {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
}

// Valida credenciais buscando os dados do número (usado no "Testar conexão").
export async function metaPhoneInfo(phoneNumberId: string, accessToken: string): Promise<MetaPhoneInfo> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return data;
}

// Foto do perfil do WhatsApp Business (a que aparece pros clientes). Fica num endpoint SEPARADO
// do phone info — por isso a bolinha da API vinha sem foto. URL pode expirar, então o painel
// rebusca a cada carga. null se a conta não tem foto ou o token não tem permissão.
export async function metaProfilePhoto(phoneNumberId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile?fields=profile_picture_url`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data?.data?.[0]?.profile_picture_url ? String(data.data[0].profile_picture_url) : null;
  } catch {
    return null;
  }
}

// Núcleo do envio: monta a chamada POST /{phoneNumberId}/messages com o payload já pronto.
// Todos os "metaSend*" abaixo passam por aqui — um só lugar pra auth, erro e id de retorno.
async function graphSend(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    // recipient_type "individual" é o default da Cloud API e não vale para status=read — por isso
    // NÃO é injetado aqui; cada helper de envio abaixo já manda "to", que basta.
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  // A Meta devolve o wa_id — a conta do WhatsApp em que ELA resolveu o número que mandamos.
  // No Brasil ela mexe no nono dígito por conta própria ("standard behavior", doc de phone-numbers),
  // então o wa_id pode sair diferente do que enviamos. Quando sai diferente, é sinal: a mensagem
  // foi pra OUTRA conta que não a do número digitado. Sem este log, "aceitou e não chegou" não
  // tinha como ser investigado — o id da mensagem sozinho não diz para QUEM ela foi.
  const enviado = String((payload as any)?.to ?? "").replace(/\D/g, "");
  const waId = String(data?.contacts?.[0]?.wa_id ?? "");
  if (waId && enviado && waId !== enviado) {
    console.log(`📞 meta · número REESCRITO pela Meta: você mandou ${enviado} e ela entregou em ${waId} (a conta do WhatsApp é essa). Se a pessoa não recebeu, é porque o WhatsApp dela está no outro formato.`);
  } else if (waId) {
    console.log(`📞 meta · destino confirmado ${waId} · msg ${data?.messages?.[0]?.id ?? "?"}`);
  }
  // O waId volta pro chamador DE PROPÓSITO: é a conta canônica do WhatsApp — quem arquiva a
  // conversa precisa usar ELE como chave, senão o envio pro número digitado (com 9) e a resposta
  // do webhook (wa_id, sem 9) viram DOIS chats da mesma pessoa (caso Matheus, 27/08).
  return { id: data?.messages?.[0]?.id, waId: waId || undefined, raw: data };
}

// Envia um texto simples pela Cloud API (para dentro da janela de 24h). Templates virão depois.
// Localização (pino no mapa). A Cloud API aceita nativamente; nome/endereço são opcionais mas
// é o que faz o cartão mostrar texto em vez de só as coordenadas.
export async function metaSendLocation(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  lat: number,
  lng: number,
  nome?: string,
  endereco?: string,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  return graphSend(phoneNumberId, accessToken, {
    to,
    type: "location",
    location: { latitude: lat, longitude: lng, ...(nome ? { name: nome } : {}), ...(endereco ? { address: endereco } : {}) },
  });
}

export async function metaSendText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  respondeA?: string,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  return graphSend(phoneNumberId, accessToken, {
    to,
    type: "text",
    text: { preview_url: true, body: text },
    // Resposta CITANDO uma mensagem (o balão chega com a citação, igual responder no WhatsApp).
    ...(respondeA ? { context: { message_id: respondeA } } : {}),
  });
}

// 😀 REAÇÃO a uma mensagem (o emoji em cima do balão). emoji "" REMOVE a reação. Vale dentro da
// janela de 24h; só funciona com wamid de verdade.
export async function metaSendReaction(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  messageId: string,
  emoji: string,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  return graphSend(phoneNumberId, accessToken, { to, type: "reaction", reaction: { message_id: messageId, emoji } });
}

// Tipos de mídia da Cloud API. "ptt" (nota de voz) vira audio; "ptv" (vídeo de bolinha) NÃO existe
// na API Oficial — o gateway trata isso antes de chegar aqui.
export type MetaMediaKind = "image" | "video" | "audio" | "document" | "sticker";

// Envia mídia por LINK (a Meta baixa a URL). É o caminho mais simples — nossos nós guardam URL.
// Se um dia precisarmos de upload (mídia local/privada), dá pra trocar link→id via /media.
export async function metaSendMedia(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  kind: MetaMediaKind,
  link: string,
  caption?: string,
  voice?: boolean,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  const media: Record<string, unknown> = { link };
  // voice:true = a Meta mostra como NOTA DE VOZ (bolinha com onda), não como arquivo de música.
  // Só vale pra OGG/Opus. Se a Graph recusar o campo, o chamador reenvia sem ele.
  if (voice && kind === "audio") media.voice = true;
  // audio e sticker NÃO aceitam caption na Cloud API.
  if (caption && kind !== "audio" && kind !== "sticker") media.caption = caption;
  if (kind === "document") media.filename = fileNameFromUrl(link) || "arquivo";
  return graphSend(phoneNumberId, accessToken, { to, type: kind, [kind]: media });
}

// Baixa uma mídia RECEBIDA pelo webhook (o payload traz só o media id). Dois passos na Graph:
// GET /{media-id} → { url, mime_type } e depois GET nessa url COM o Bearer token (ela não é
// pública e expira em ~5min — por isso baixamos na hora e guardamos no nosso /media).
export async function metaDownloadMedia(
  accessToken: string,
  mediaId: string,
  maxBytes = 16 * 1024 * 1024,
): Promise<{ buf: Buffer; mime: string }> {
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const info: any = await meta.json().catch(() => ({}));
  if (!meta.ok || !info?.url) throw new Error(graphErr(info, meta.status));
  const res = await fetch(String(info.url), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`download da mídia HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`mídia acima do limite (${Math.round(buf.length / 1024 / 1024)}MB)`);
  return { buf, mime: String(info.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream") };
}

// Botões de resposta rápida (interactive reply buttons): até 3, título até 20 chars.
export async function metaSendButtons(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  buttons: string[],
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  // title obrigatório e 1–20 chars na Cloud API — filtra vazios pra não derrubar a mensagem toda.
  const reply = buttons
    .map((b) => String(b ?? "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((title, i) => ({ type: "reply", reply: { id: `btn_${i}`, title: title.slice(0, 20) } }));
  return graphSend(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: { type: "button", body: { text }, action: { buttons: reply } },
  });
}

// Marca a mensagem recebida como lida (✓✓ azul) e, opcionalmente, mostra "digitando…".
// A Cloud API só permite o indicador de digitação ATRELADO a uma mensagem recebida (message_id).
export async function metaMarkRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string,
  typing = false,
): Promise<void> {
  await graphSend(phoneNumberId, accessToken, {
    status: "read",
    message_id: messageId,
    ...(typing ? { typing_indicator: { type: "text" } } : {}),
  }).catch(() => {}); // best-effort — nunca derruba o fluxo por causa do "lido"
}

// ── Templates (modelos aprovados pela Meta) ──────────────────────────────────
// Fora da janela de 24h, SÓ dá pra mandar template aprovado. Aqui listamos/criamos/enviamos/excluímos.

export interface MetaTemplate {
  id?: string;
  name: string;
  status?: string; // APPROVED | PENDING | REJECTED | ...
  category?: string; // MARKETING | UTILITY | AUTHENTICATION
  language?: string;
  components?: any[];
  quality_score?: { score?: string };
}

// Lista os templates da WABA (com status de aprovação).
export async function metaListTemplates(wabaId: string, accessToken: string): Promise<MetaTemplate[]> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,category,language,components,quality_score&limit=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return Array.isArray(data?.data) ? data.data : [];
}

// Cria (submete pra aprovação) um template. components já no formato da Meta.
export async function metaCreateTemplate(
  wabaId: string,
  accessToken: string,
  body: { name: string; language: string; category: string; components: any[] },
): Promise<{ id?: string; status?: string; category?: string; raw: unknown }> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return { id: data?.id, status: data?.status, category: data?.category, raw: data };
}

// Sobe um arquivo pela RESUMABLE UPLOAD API e devolve o "header handle" — é o que a Meta exige no
// example.header_handle pra CRIAR template com imagem/vídeo/documento no topo (URL não serve aqui).
// 3 passos: descobre o App do token (GET /app), abre a sessão de upload no App, manda os bytes.
export async function metaUploadHeaderHandle(accessToken: string, buf: Buffer, mime: string): Promise<string> {
  const appRes = await fetch(`${GRAPH}/app`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const appData: any = await appRes.json().catch(() => ({}));
  if (!appRes.ok || !appData?.id) throw new Error("não consegui identificar o App do token: " + graphErr(appData, appRes.status));
  const sess = await fetch(
    `${GRAPH}/${appData.id}/uploads?file_length=${buf.length}&file_type=${encodeURIComponent(mime)}`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const sessData: any = await sess.json().catch(() => ({}));
  if (!sess.ok || !sessData?.id) throw new Error("não consegui abrir a sessão de upload: " + graphErr(sessData, sess.status));
  // ⚠️ este passo usa "OAuth", não "Bearer" — exigência documentada da Upload API.
  const up = await fetch(`${GRAPH}/${sessData.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0", "Content-Type": "application/octet-stream" },
    body: new Uint8Array(buf),
  });
  const upData: any = await up.json().catch(() => ({}));
  if (!up.ok || !upData?.h) throw new Error("upload do arquivo falhou: " + graphErr(upData, up.status));
  return String(upData.h);
}

// Exclui um template pelo nome (some de todas as línguas com esse nome).
export async function metaDeleteTemplate(wabaId: string, accessToken: string, name: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
}

// Envia um template aprovado (funciona FORA da janela de 24h). bodyParams = valores das {{1}},{{2}}…
// header: template criado com IMAGEM/VÍDEO/DOCUMENTO no topo EXIGE o arquivo DE NOVO na hora do
// envio — a Meta não reaproveita o exemplo da criação sozinha. Sem isso a Graph recusa o envio
// inteiro (erro 132012 "format mismatch"): era o que travava o "Teste flow" (15/08).
export async function metaSendTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  name: string,
  langCode: string,
  bodyParams: string[] = [],
  header?: { format: "image" | "video" | "document"; url: string } | null,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  const components: any[] = [];
  if (header?.url) {
    components.push({ type: "header", parameters: [{ type: header.format, [header.format]: { link: header.url } }] });
  }
  if (bodyParams.length > 0) {
    components.push({ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: String(t) })) });
  }
  return graphSend(phoneNumberId, accessToken, {
    to,
    type: "template",
    template: { name, language: { code: langCode }, ...(components.length ? { components } : {}) },
  });
}

// ── Insights POR TEMPLATE (Template Analytics API) ───────────────────────────
// Enviadas/entregues/lidas/cliques por dia de UM template — é o "Insights sobre o modelo" do
// Gerenciador. CLICKED vem como lista por botão; somamos e devolvemos também o detalhe.
export interface TplAnalyticsPonto {
  start: number; sent: number; delivered: number; read: number; clicked: number;
  botoes?: Array<{ texto: string; cliques: number }>;
}
// 📄 A Graph PAGINA o template_analytics (`paging.next`) — provado cru em 30/09: com 10 templates ×
// 7 dias, a 1ª página trazia ~12 templates e o disparo do próprio dia (764 envios) ficava na 2ª,
// invisível. Este helper segue `next` até acabar, mantendo o token no CABEÇALHO (o `next` da Graph
// não carrega o token quando a chamada original usou Authorization). Teto de páginas por segurança.
async function graphTemplateAnalyticsTodasPaginas(urlInicial: string, accessToken: string): Promise<any[]> {
  const pontos: any[] = [];
  let url: string | null = urlInicial;
  for (let pagina = 0; url && pagina < 40; pagina++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(graphErr(data, res.status));
    for (const serie of data?.data ?? []) {
      const idSerie = serie?.template_id;
      for (const p of serie?.data_points ?? []) pontos.push(idSerie != null && p?.template_id == null ? { ...p, template_id: idSerie } : p);
    }
    const prox = data?.paging?.next;
    url = typeof prox === "string" && prox && prox !== url ? prox : null;
  }
  return pontos;
}

export async function metaTemplateAnalytics(
  wabaId: string,
  accessToken: string,
  templateId: string,
  startSec: number,
  endSec: number,
): Promise<TplAnalyticsPonto[]> {
  const url = `${GRAPH}/${encodeURIComponent(wabaId)}/template_analytics` +
    `?start=${startSec}&end=${endSec}&granularity=DAILY` +
    `&metric_types=${encodeURIComponent('["SENT","DELIVERED","READ","CLICKED"]')}` +
    `&template_ids=${encodeURIComponent("[" + templateId + "]")}`;
  // Todas as páginas, e só os pontos DESTE template (com 1 id a Graph às vezes omite template_id).
  const pontos: any[] = (await graphTemplateAnalyticsTodasPaginas(url, accessToken))
    .filter((p) => p?.template_id == null || String(p.template_id) === String(templateId));
  return pontos.map((p) => {
    const cliques: any[] = Array.isArray(p?.clicked) ? p.clicked : [];
    return {
      start: Number(p?.start ?? 0),
      sent: Number(p?.sent ?? 0),
      delivered: Number(p?.delivered ?? 0),
      read: Number(p?.read ?? 0),
      clicked: cliques.reduce((s, c) => s + Number(c?.count ?? 0), 0),
      botoes: cliques.map((c) => ({ texto: String(c?.button_content ?? c?.type ?? "botão"), cliques: Number(c?.count ?? 0) })),
    };
  });
}

// ── MÉTRICAS DE TEMPLATE: precisa ATIVAR antes ───────────────────────────────────────────────
// Pegadinha da Meta (confirmado na documentação de Analytics, 20/08): o template_analytics só
// começa a CAPTURAR depois de um POST /{waba}?is_enabled_for_insights=true. Sem isso a Graph
// responde 200 com data_points VAZIO — nada de erro, só zero. Foi por isso que os insights do
// painel apareciam zerados mesmo com template enviado. E NÃO É RETROATIVO: o que passou, passou.
export async function metaInsightsAtivo(wabaId: string, accessToken: string): Promise<boolean | null> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}?fields=is_enabled_for_insights`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return null; // não deu pra saber (permissão/rede) — a tela não afirma nada
  return !!data?.is_enabled_for_insights;
}
export async function metaAtivaInsights(wabaId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}?is_enabled_for_insights=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
}

// Analytics de VÁRIOS templates numa chamada só (a Graph aceita a lista em template_ids).
// Pra faixa de métricas dos cards: 1 request por lote de 10, não 1 por template.
export async function metaTemplateAnalyticsLote(
  wabaId: string,
  accessToken: string,
  templateIds: string[],
  startSec: number,
  endSec: number,
): Promise<Map<string, { sent: number; delivered: number; read: number; clicked: number; botoes: Array<{ texto: string; cliques: number }> }>> {
  // `botoes` = cliques ABERTOS por botão. O lote somava tudo num número só e jogava fora exatamente
  // a pergunta que importa num disparo ("quantos clicaram em Entrar no Grupo × em Parar?").
  const out = new Map<string, { sent: number; delivered: number; read: number; clicked: number; botoes: Array<{ texto: string; cliques: number }> }>();
  for (let i = 0; i < templateIds.length; i += 10) {
    const lote = templateIds.slice(i, i + 10);
    const url = `${GRAPH}/${encodeURIComponent(wabaId)}/template_analytics` +
      `?start=${startSec}&end=${endSec}&granularity=DAILY` +
      // DELIVERED entra junto: é o que separa "a Meta aceitou" de "chegou no aparelho" — a
      // diferença entre SENT e DELIVERED é exatamente o que denuncia número com problema.
      `&metric_types=${encodeURIComponent('["SENT","DELIVERED","READ","CLICKED"]')}` +
      `&template_ids=${encodeURIComponent("[" + lote.join(",") + "]")}`;
    // 🔎 FORMATO REAL DA GRAPH (visto cru em 30/09 pelo /metricas-debug): com vários ids ela devolve
    // UMA série só, cada data_point com o SEU `template_id` — e PAGINADA. O código antigo procurava
    // o id no nível da série (vinha vazio → descartava o lote inteiro → cards em "—" desde agosto)
    // e lia só a 1ª página (o disparo do dia sumia). Agora: id do ponto + todas as páginas.
    const todos = await graphTemplateAnalyticsTodasPaginas(url, accessToken);
    const porId = new Map<string, Array<{ texto: string; cliques: number }>>();
    {
      const idSerie = lote.length === 1 ? lote[0] : "";
      for (const ponto of todos) {
        const id = String(ponto?.template_id ?? idSerie);
        if (!id) continue;
        const acc = out.get(id) ?? { sent: 0, delivered: 0, read: 0, clicked: 0, botoes: [] };
        const botoes = porId.get(id) ?? [];
        acc.sent += Number(ponto?.sent ?? 0);
        acc.delivered += Number(ponto?.delivered ?? 0);
        acc.read += Number(ponto?.read ?? 0);
        const cliques: any[] = Array.isArray(ponto?.clicked) ? ponto.clicked : [];
        for (const c of cliques) {
          const n = Number(c?.count ?? 0);
          acc.clicked += n;
          const texto = String(c?.button_content ?? c?.type ?? "botão");
          const b = botoes.find((x) => x.texto === texto);
          if (b) b.cliques += n; else botoes.push({ texto, cliques: n });
        }
        porId.set(id, botoes);
        acc.botoes = [...botoes].sort((a, b) => b.cliques - a.cliques);
        out.set(id, acc);
      }
    }
  }
  return out;
}

// ── Perfil comercial do número (foto, descrição, site…) ──────────────────────
// É o "Perfil" do Gerenciador (Números de telefone → Perfil) dentro do painel.
export interface MetaBusinessProfile {
  about?: string; address?: string; description?: string; email?: string;
  vertical?: string; websites?: string[]; profile_picture_url?: string;
}
export async function metaBusinessProfileGet(phoneNumberId: string, accessToken: string): Promise<MetaBusinessProfile> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile?fields=about,address,description,email,vertical,websites,profile_picture_url`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return (data?.data?.[0] ?? {}) as MetaBusinessProfile;
}
// Atualiza campos do perfil. Foto vai como HANDLE da Upload API (mesma do header de template).
export async function metaBusinessProfileSet(
  phoneNumberId: string,
  accessToken: string,
  campos: Partial<MetaBusinessProfile> & { profile_picture_handle?: string },
): Promise<void> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...campos }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
}

// ── WhatsApp Flows (formulários nativos) ─────────────────────────────────────
// Um Flow é um formulário que abre DENTRO do WhatsApp (telas + campos, criado no Gerenciador →
// Flows). Aqui: listar os Flows da WABA e enviar um Flow PUBLICADO numa conversa (janela de 24h).
// A resposta preenchida chega no webhook como interactive.nfm_reply (tratada no server).

export interface MetaFlow {
  id: string;
  name: string;
  status: string; // DRAFT | PUBLISHED | DEPRECATED | BLOCKED | THROTTLED
  categories?: string[];
}
export async function metaListFlows(wabaId: string, accessToken: string): Promise<MetaFlow[]> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/flows?fields=id,name,status,categories&limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return (Array.isArray(data?.data) ? data.data : []).map((f: any) => ({
    id: String(f?.id ?? ""), name: String(f?.name ?? ""), status: String(f?.status ?? ""),
    categories: Array.isArray(f?.categories) ? f.categories.map(String) : [],
  }));
}

// Envia um Flow publicado como mensagem interativa. `tela` = id da primeira tela (o Gerenciador
// mostra no editor); quando vem vazia, deixamos a Meta usar a entrada padrão do Flow.
export async function metaSendFlow(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  flowId: string,
  cta: string,
  texto: string,
  tela?: string,
): Promise<{ id?: string; waId?: string; raw: unknown }> {
  const parameters: Record<string, unknown> = {
    flow_message_version: "3",
    flow_id: flowId,
    flow_cta: cta,
    // token opaco: volta na resposta (nfm_reply) e permite correlacionar envio ↔ preenchimento
    flow_token: `zc-${flowId}-${Date.now()}`,
  };
  if (tela) {
    parameters.flow_action = "navigate";
    parameters.flow_action_payload = { screen: tela };
  }
  return graphSend(phoneNumberId, accessToken, {
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: texto },
      action: { name: "flow", parameters },
    },
  });
}

// ── Métricas da conta (página /oficial/metricas) ─────────────────────────────
// Tudo vem da Graph em 3 consultas: saúde do número (qualidade + tier de envio),
// volume (enviadas/entregues por dia) e custo (mensagens pagas por categoria).

export interface MetaNumeroSaude {
  telefone?: string;
  nome?: string;
  qualidade: string; // GREEN | YELLOW | RED | NA
  tier: string; // ex.: TIER_2K → o painel formata
  // A Meta vem migrando do TIER (conversas/24h) pro THROUGHPUT (mensagens/segundo): números em
  // contas verificadas e sem restrição passaram a NÃO devolver messaging_limit_tier, e o painel
  // mostrava um "—" sem explicação. Guardamos os dois + o status pra tela poder dizer a verdade.
  throughput?: string;   // STANDARD | HIGH | NOT_APPLICABLE
  status?: string;       // CONNECTED | PENDING | FLAGGED | RESTRICTED…
  plataforma?: string;   // CLOUD_API | ON_PREMISE | NOT_APPLICABLE
}
// `fields` explícito: pedir campo que a versão da Graph não conhece derruba a chamada inteira com
// erro, então esta lista só cresce com campo confirmado na doc da v21.
const CAMPOS_NUMERO = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,status,platform_type";
export async function metaNumeroSaude(wabaId: string, accessToken: string): Promise<MetaNumeroSaude[]> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${CAMPOS_NUMERO}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return (Array.isArray(data?.data) ? data.data : []).map((p: any) => ({
    telefone: p?.display_phone_number ? String(p.display_phone_number) : undefined,
    nome: p?.verified_name ? String(p.verified_name) : undefined,
    qualidade: String(p?.quality_rating ?? "NA").toUpperCase(),
    tier: String(p?.messaging_limit_tier ?? ""),
    throughput: p?.throughput?.level ? String(p.throughput.level) : undefined,
    status: p?.status ? String(p.status) : undefined,
    plataforma: p?.platform_type ? String(p.platform_type) : undefined,
  }));
}

// DIAGNÓSTICO: devolve o JSON CRU dos números da WABA. Existe porque "o limite não aparece" só se
// resolve vendo o que a Meta realmente respondeu — sem isso a gente fica adivinhando nome de campo.
export async function metaNumerosCru(wabaId: string, accessToken: string): Promise<any> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${CAMPOS_NUMERO}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data: any = await res.json().catch(() => ({}));
  return { httpStatus: res.status, resposta: data };
}

// Enviadas/entregues por dia (campo analytics da WABA). start/end em segundos unix.
export async function metaAnalyticsDiario(
  wabaId: string,
  accessToken: string,
  startSec: number,
  endSec: number,
): Promise<Array<{ start: number; sent: number; delivered: number }>> {
  const campo = `analytics.start(${startSec}).end(${endSec}).granularity(DAY)`;
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}?fields=${encodeURIComponent(campo)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  const pontos: any[] = data?.analytics?.data_points ?? [];
  return pontos.map((p) => ({ start: Number(p?.start ?? 0), sent: Number(p?.sent ?? 0), delivered: Number(p?.delivered ?? 0) }));
}

// Custo por dia e por categoria. A Meta está migrando de cobrança POR CONVERSA para POR MENSAGEM
// (pricing_analytics é o campo novo) — tenta o novo e cai pro antigo, normalizando os dois pra
// {start, categoria, qtd, custo} (moeda da conta, no caso do dono BRL).
export interface MetaCustoPonto { start: number; categoria: string; qtd: number; custo: number }
export async function metaCustoDiario(
  wabaId: string,
  accessToken: string,
  startSec: number,
  endSec: number,
): Promise<MetaCustoPonto[]> {
  const tenta = async (campo: string, raiz: string, qtdKey: string, catKey: string): Promise<MetaCustoPonto[] | null> => {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}?fields=${encodeURIComponent(campo)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const grupos: any[] = data?.[raiz]?.data ?? [];
    const pontos: any[] = grupos.flatMap((g) => g?.data_points ?? []);
    return pontos.map((p) => ({
      start: Number(p?.start ?? 0),
      categoria: String(p?.[catKey] ?? "OUTRA").toUpperCase(),
      qtd: Number(p?.[qtdKey] ?? 0),
      custo: Number(p?.cost ?? 0),
    }));
  };
  const novo = await tenta(
    `pricing_analytics.start(${startSec}).end(${endSec}).granularity(DAILY).dimensions(["PRICING_CATEGORY"])`,
    "pricing_analytics", "volume", "pricing_category",
  );
  if (novo && novo.length) return novo;
  const antigo = await tenta(
    `conversation_analytics.start(${startSec}).end(${endSec}).granularity(DAILY).dimensions(["CONVERSATION_CATEGORY"]).metric_types(["COST","CONVERSATION"])`,
    "conversation_analytics", "conversation", "conversation_category",
  );
  return antigo ?? novo ?? [];
}

// Verifica a assinatura X-Hub-Signature-256 que a Meta manda no webhook (HMAC-SHA256 do corpo cru
// com o App Secret). FAIL-CLOSED: sem appSecret configurado, rejeita — o endpoint é público.
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!appSecret) {
    console.warn("⚠️  meta appSecret não configurado — webhook Meta REJEITADO (configure em Conexão › API Oficial).");
    return false;
  }
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const last = p.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}

// ── EMBEDDED SIGNUP (Tech Provider) ──────────────────────────────────────────
// O "conectar com 1 clique": em vez do cliente criar app, gerar token e colar 6 campos na mão
// (o caminho que travou o dono 3× na própria conexão), ele clica, escolhe a conta no popup da
// Meta e pronto. Aqui ficam as 3 chamadas do lado do servidor que fecham o ciclo.
// Doc: developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup

// 1) O popup devolve um `code` de uso único → vira o token de sistema da INTEGRAÇÃO com aquele
// cliente. Esse token não expira (só se o cliente revogar o acesso do app) — é ele que o painel
// guarda pra falar pela conta dele daí em diante.
export async function metaTrocaCodePorToken(code: string, appId: string, appSecret: string): Promise<string> {
  const url = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) throw new Error(graphErr(data, res.status));
  return String(data.access_token);
}

// 2) Assina NOSSO app nos webhooks da WABA do cliente. Sem isto o número conecta mas as mensagens
// nunca chegam no motor — o sintoma é "conectou e não recebe nada", que dá muito nó pra debugar.
export async function metaAssinaAppNaWaba(wabaId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
}

// 2b) LEITURA do mesmo: quais apps estão assinados na WABA. É a resposta objetiva pra
// "conectou e não chega mensagem" — sem o nosso app nesta lista, a Meta NUNCA vai bater no webhook,
// por mais certo que esteja o resto da configuração.
export async function metaAppsAssinados(wabaId: string, accessToken: string): Promise<Array<{ id: string; nome: string }>> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return (Array.isArray(data?.data) ? data.data : []).map((x: any) => ({
    id: String(x?.whatsapp_business_api_data?.id ?? ""),
    nome: String(x?.whatsapp_business_api_data?.name ?? ""),
  }));
}

// 3) Registra o número na Cloud API com um PIN de 6 dígitos (verificação em duas etapas). Sem
// registrar, o número RECEBE mas NÃO ENVIA — foi exatamente a pegadinha da conexão manual.
// "already registered" não é erro pra nós: o objetivo (poder enviar) já está cumprido.
export async function metaRegistraNumero(phoneNumberId: string, accessToken: string, pin: string): Promise<{ ok: boolean; jaRegistrado?: boolean }> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true };
  const msg = graphErr(data, res.status);
  if (/already.*registered|já.*registrad/i.test(msg)) return { ok: true, jaRegistrado: true };
  throw new Error(msg);
}

// Descobre a WABA do token quando o popup não devolveu o id (versões antigas do fluxo).
// Lê os escopos granulares do próprio token — é o que a Meta expõe pra isso.
export async function metaWabaDoToken(accessToken: string, appId: string, appSecret: string): Promise<string> {
  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
    `&access_token=${encodeURIComponent(appId + "|" + appSecret)}`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  const escopos: any[] = data?.data?.granular_scopes ?? [];
  const alvo = escopos.find((s) => String(s?.scope) === "whatsapp_business_management")
    ?? escopos.find((s) => String(s?.scope) === "whatsapp_business_messaging");
  return String(alvo?.target_ids?.[0] ?? "");
}

// Números de uma WABA (pro fluxo pegar o phone_number_id quando o popup não mandou).
export async function metaNumerosDaWaba(wabaId: string, accessToken: string): Promise<Array<{ id: string; display_phone_number?: string; verified_name?: string }>> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(graphErr(data, res.status));
  return Array.isArray(data?.data) ? data.data : [];
}

// ── Cabeçalho de MÍDIA de um template aprovado ───────────────────────────────
// Template com IMAGEM/VÍDEO/DOCUMENTO no topo só é aceito se o arquivo for JUNTO no envio; sem
// isso a Meta responde 132012 e a mensagem não sai. Aqui descobrimos o formato e a URL do arquivo
// de EXEMPLO aprovado (o mesmo que o revisor viu). Cache de 10 min por (waba, nome, idioma) — um
// disparo de mil mensagens não pode listar os templates mil vezes.
const cacheHeaderTpl = new Map<string, { at: number; header: { format: "image" | "video" | "document"; url: string } | null }>();
export async function metaHeaderDoTemplate(
  wabaId: string, accessToken: string, name: string, language: string,
): Promise<{ format: "image" | "video" | "document"; url: string } | null> {
  const chave = `${wabaId}|${name}|${language}`;
  const hit = cacheHeaderTpl.get(chave);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.header;
  let header: { format: "image" | "video" | "document"; url: string } | null = null;
  const tpls = await metaListTemplates(wabaId, accessToken);
  const t = tpls.find((x) => x.name === name && x.language === language) ?? tpls.find((x) => x.name === name);
  const comps: any[] = Array.isArray(t?.components) ? (t!.components as any[]) : [];
  const h = comps.find((x) => String(x?.type).toUpperCase() === "HEADER");
  const fmt = String(h?.format ?? "").toLowerCase();
  if (fmt === "image" || fmt === "video" || fmt === "document") {
    const url = String(h?.example?.header_handle?.[0] ?? "");
    if (url) header = { format: fmt as "image" | "video" | "document", url };
  }
  cacheHeaderTpl.set(chave, { at: Date.now(), header });
  return header;
}

// 📄 RETRATO DO TEMPLATE (corpo, rodapé, botões e cabeçalho) — o que é preciso pra ARQUIVAR uma
// mensagem de template do jeito que o cliente a recebeu.
//
// Por que existe: o envio pelo INBOX e pelo DISPARADOR já resolviam isso e arquivavam o texto
// real. O envio por FLUXO (gateway) não — ele arquivava só "[template nome] param1 · param2".
// Resultado: a conversa no painel mostrava um "textinho" e o dono não tinha como saber se a
// mensagem inteira tinha saído (caso de um lead, 07/09). O cliente recebia tudo certo; quem
// ficava sem ver era o dono da conta. Aqui os três caminhos passam a usar a mesma fonte.
export async function metaRetratoDoTemplate(
  wabaId: string, accessToken: string, name: string, language: string,
): Promise<{ corpo: string; rodape: string; botoes: Array<{ texto: string; tipo: string }>;
             header: { format: "image" | "video" | "document"; url: string } | null }> {
  const vazio = { corpo: "", rodape: "", botoes: [], header: null };
  try {
    const tpls = await metaListTemplates(wabaId, accessToken);
    const t = tpls.find((x) => x.name === name && x.language === language) ?? tpls.find((x) => x.name === name);
    if (!t) return vazio;
    const comps: any[] = Array.isArray(t.components) ? (t.components as any[]) : [];
    const corpo = String(comps.find((x) => String(x?.type).toUpperCase() === "BODY")?.text ?? "");
    const rodape = String(comps.find((x) => String(x?.type).toUpperCase() === "FOOTER")?.text ?? "");
    const botoes = (comps.find((x) => String(x?.type).toUpperCase() === "BUTTONS")?.buttons ?? [])
      .map((b: any) => ({ texto: String(b?.text ?? ""), tipo: String(b?.type ?? "") }))
      .filter((b: any) => b.texto);
    const h = comps.find((x) => String(x?.type).toUpperCase() === "HEADER");
    const fmt = String(h?.format ?? "").toLowerCase();
    const url = String(h?.example?.header_handle?.[0] ?? "");
    const header = (fmt === "image" || fmt === "video" || fmt === "document") && url
      ? { format: fmt as "image" | "video" | "document", url } : null;
    return { corpo, rodape, botoes, header };
  } catch { return vazio; }
}

// Troca {{1}}, {{2}}… pelos valores enviados — o texto como a pessoa leu no WhatsApp.
export function preencheCorpoTemplate(corpo: string, params: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? `{{${i}}}`);
}
