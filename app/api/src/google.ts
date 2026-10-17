// Conectores Google via CONTA DE SERVIÇO (sem OAuth por cliente — decisão de arquitetura do
// Admin, provada em produção no Sua Empresa): o usuário cria a conta de serviço no Google
// Cloud, cola o JSON aqui e COMPARTILHA a planilha com o e-mail dela. Sem tela de consentimento,
// sem verificação do Google. Zero dependência nova: o JWT RS256 é assinado com node:crypto.
import crypto from "node:crypto";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

// Valida e extrai só o que interessa do JSON baixado do Google Cloud.
export function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const o = JSON.parse(raw);
    if (typeof o.client_email !== "string" || typeof o.private_key !== "string") return null;
    return { client_email: o.client_email, private_key: o.private_key, token_uri: o.token_uri, project_id: o.project_id };
  } catch {
    return null;
  }
}

// Cache do access token por conta+escopo (~55min) — sem isto cada linha escrita na planilha
// pagaria uma ida ao oauth2.googleapis.com.
const tokenCache = new Map<string, { token: string; expira: number }>();

export async function getGoogleAccessToken(sa: ServiceAccount, scopes: string[]): Promise<string> {
  const chave = sa.client_email + "|" + scopes.join(" ");
  const cacheado = tokenCache.get(chave);
  if (cacheado && cacheado.expira > Date.now()) return cacheado.token;

  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || TOKEN_URI;
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: sa.client_email, scope: scopes.join(" "), aud, exp: now + 3600, iat: now })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(aud, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  if (!json.access_token) throw new Error("Google não devolveu access_token");
  tokenCache.set(chave, { token: json.access_token, expira: Date.now() + 55 * 60_000 });
  if (tokenCache.size > 200) tokenCache.delete(tokenCache.keys().next().value!); // teto de segurança
  return json.access_token;
}

// ── Google Sheets ─────────────────────────────────────────────────────────────
const SCOPE_SHEETS = "https://www.googleapis.com/auth/spreadsheets";

// Extrai o ID da planilha do LINK (…/spreadsheets/d/<ID>/edit) ou aceita o ID puro.
export function sheetIdFromUrl(input: string): string | null {
  const s = String(input ?? "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

// Acrescenta UMA linha ao fim da aba (padrão: primeira aba, "A1").
export async function appendSheetRow(
  sa: ServiceAccount,
  spreadsheetId: string,
  row: (string | number)[],
  range = "A1",
): Promise<void> {
  const token = await getGoogleAccessToken(sa, [SCOPE_SHEETS]);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ── Google Agenda (Calendar) ──────────────────────────────────────────────────
const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar";

// Cria um evento na agenda. `calendarId` = o e-mail da agenda (pra agenda pessoal é o próprio
// e-mail do Google) — ela precisa estar COMPARTILHADA com a conta de serviço com permissão de
// "Fazer alterações nos eventos". ⚠️ Sem convidados (attendees): conta de serviço só convida
// gente com Domain-Wide Delegation (Workspace) — fora do escopo do MVP.
export async function createCalendarEvent(
  sa: ServiceAccount,
  calendarId: string,
  ev: { titulo: string; descricao?: string; inicioISO: string; fimISO: string; timeZone?: string },
): Promise<{ id: string; link: string }> {
  const token = await getGoogleAccessToken(sa, [SCOPE_CALENDAR]);
  const tz = ev.timeZone || "America/Araguaina";
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: ev.titulo,
      description: ev.descricao || undefined,
      start: { dateTime: ev.inicioISO, timeZone: tz },
      end: { dateTime: ev.fimISO, timeZone: tz },
    }),
  });
  if (!res.ok) throw new Error(`Calendar ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  return { id: String(json.id ?? ""), link: String(json.htmlLink ?? "") };
}

// Traduz os erros comuns pra mensagem que um leigo resolve sozinho.
// `recurso` muda o texto: "planilha" (Sheets) ou "agenda" (Calendar).
export function explicaErroGoogle(e: any, clientEmail?: string, recurso: "planilha" | "agenda" = "planilha"): string {
  const m = String(e?.message ?? e ?? "");
  const quem = clientEmail || "o e-mail da conta de serviço";
  if (m.includes("403")) {
    return recurso === "agenda"
      ? `Sem permissão na agenda — compartilhe ela com ${quem} com "Fazer alterações nos eventos" e tente de novo.`
      : `Sem permissão na planilha — compartilhe ela com ${quem} como EDITOR e tente de novo.`;
  }
  if (m.includes("404")) {
    return recurso === "agenda"
      ? "Agenda não encontrada — o ID é o e-mail da agenda (na pessoal, o teu próprio e-mail do Google). Confere também o compartilhamento."
      : "Planilha não encontrada — confere se o link é o da planilha (docs.google.com/spreadsheets/d/…).";
  }
  if (m.includes("invalid_grant") || m.includes("Invalid JWT")) return "Credencial inválida ou relógio errado — reconecte colando o JSON de novo.";
  if (m.toLowerCase().includes("disabled") || m.includes("has not been used")) {
    return recurso === "agenda"
      ? "A Google Calendar API não está ATIVADA nesse projeto do Google Cloud — ativa lá (Biblioteca → Google Calendar API) e tenta de novo."
      : "A API do Google Sheets não está ATIVADA nesse projeto do Google Cloud — ativa lá e tenta de novo (leva 1 min pra propagar).";
  }
  return m.slice(0, 220);
}

// ─── OAuth POR USUÁRIO + Google Contatos (People API) ─────────────────────────────────────────
// Diferente da conta de serviço acima (Planilha/Agenda): o Google Contatos PESSOAL só é gravável
// com consentimento OAuth do dono da conta. Fluxo: monta a URL de consentimento → a pessoa aprova
// → o Google chama nosso callback com um `code` → trocamos por refresh_token → guardamos cifrado.
// Depois, a cada gravação, o refresh_token vira um access_token curto e chamamos o People API.

// openid+email = pra saber QUAL conta conectou (mostra na UI). contacts = escrever no Google Contatos.
// Escopos do login único do ZapConverte. Um consentimento cobre Contatos, Docs, Planilha e Agenda —
// e uma verificação só no Google (adicionar escopo depois = verificação NOVA, vídeo novo, 3-5 dias).
//   contacts / documents / spreadsheets / calendar.events → SENSÍVEIS (verificação normal)
//   drive.file                                     → NÃO-sensível; é o que deixa criar o Doc e
//                                                    depois editá-lo sem tocar no resto do Drive
//   drive (amplo) e drive.readonly                 → RESTRITOS: exigem auditoria paga. NUNCA pedir.
//
// calendar.events em vez de calendar (o amplo) DE PROPÓSITO: o motor só CRIA eventos, e o Google
// reprova verificação por "escopo mais largo que o uso". O amplo ainda mostrava pro usuário
// "ver, editar, compartilhar e EXCLUIR PERMANENTEMENTE todas as agendas" — assustava à toa.
export const SCOPE_CONTACTS = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");
const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";

export function googleOAuthUrl(opts: { clientId: string; redirectUri: string; scope: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope,
    access_type: "offline",  // pede refresh_token (uso sem a pessoa presente, dentro do fluxo)
    prompt: "consent",       // força devolver refresh_token mesmo em reconexão
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

export interface GoogleTokens { accessToken: string; refreshToken: string | null; expiresIn: number; }

// Troca o `code` do callback por tokens. refreshToken vem só na 1ª autorização (por isso prompt=consent).
export async function exchangeGoogleCode(opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code: opts.code, client_id: opts.clientId, client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri, grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error_description || j?.error || `token ${res.status}`);
  return { accessToken: String(j.access_token ?? ""), refreshToken: j.refresh_token ? String(j.refresh_token) : null, expiresIn: Number(j.expires_in ?? 3600) };
}

// refresh_token → access_token novo (curto). É o que roda dentro do fluxo, sem a pessoa presente.
export async function refreshGoogleAccessToken(opts: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const body = new URLSearchParams({
    client_id: opts.clientId, client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken, grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error_description || j?.error || `refresh ${res.status}`);
  return String(j.access_token ?? "");
}

// Qual conta Google conectou (pra mostrar na UI). Precisa do escopo email (já pedido acima).
export async function googleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: "Bearer " + accessToken } });
    const j: any = await res.json().catch(() => ({}));
    return j?.email ? String(j.email) : null;
  } catch { return null; }
}

// Cria UM contato no Google Contatos da conta autenticada (People API).
export async function createGoogleContact(accessToken: string, c: { name?: string; phone?: string; email?: string; notes?: string }): Promise<{ resourceName: string }> {
  const body: any = {};
  if (c.name) body.names = [{ givenName: c.name }];
  if (c.phone) body.phoneNumbers = [{ value: c.phone }];
  if (c.email) body.emailAddresses = [{ value: c.email }];
  if (c.notes) body.biographies = [{ value: c.notes, contentType: "TEXT_PLAIN" }]; // "Observações" do contato
  const res = await fetch("https://people.googleapis.com/v1/people:createContact", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Contatos", res.status, j);
  return { resourceName: String(j.resourceName ?? "") };
}

// Procura no Google Contatos da conta um contato com este telefone (dígitos, ignorando 55 e o 9º
// dígito). É o que evita o nó "Google Contatos" criar um contato novo a cada passagem do lead
// (06/10). Varre a lista de conexões em páginas de 1000 (até 5000 contatos).
export interface ContatoGoogle { resourceName: string; etag: string; nome: string; emails: string[]; telefones: string[]; notas: string }
export async function findGoogleContactByPhone(accessToken: string, phone: string): Promise<ContatoGoogle | null> {
  const alvo = chaveNorm(phone);
  if (!alvo.startsWith("tel:") || alvo === "tel:") return null;
  let pageToken = "";
  for (let pagina = 0; pagina < 5; pagina++) {
    const url = "https://people.googleapis.com/v1/people/me/connections?pageSize=1000&personFields=names,phoneNumbers,emailAddresses,biographies,metadata" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) throw erroGoogle("Google Contatos", res.status, j);
    for (const p of (j?.connections ?? []) as any[]) {
      const tels: string[] = (p?.phoneNumbers ?? []).map((t: any) => String(t?.canonicalForm ?? t?.value ?? ""));
      if (tels.some((t) => chaveNorm(t) === alvo)) {
        return {
          resourceName: String(p.resourceName ?? ""), etag: String(p.etag ?? ""),
          nome: String(p?.names?.[0]?.displayName ?? p?.names?.[0]?.givenName ?? ""),
          emails: (p?.emailAddresses ?? []).map((e: any) => String(e?.value ?? "")).filter(Boolean),
          telefones: tels,
          notas: String(p?.biographies?.[0]?.value ?? ""),
        };
      }
    }
    pageToken = String(j?.nextPageToken ?? "");
    if (!pageToken) break;
  }
  return null;
}
// Completa nome e/ou e-mail de um contato que já existe (precisa do etag da leitura).
export async function updateGoogleContact(accessToken: string, c: ContatoGoogle, novo: { name?: string; email?: string; notes?: string }): Promise<void> {
  const campos: string[] = [];
  const body: any = { etag: c.etag };
  if (novo.name) { body.names = [{ givenName: novo.name }]; campos.push("names"); }
  if (novo.email) { body.emailAddresses = [...c.emails.map((value) => ({ value })), { value: novo.email }]; campos.push("emailAddresses"); }
  if (novo.notes) { body.biographies = [{ value: novo.notes, contentType: "TEXT_PLAIN" }]; campos.push("biographies"); }
  if (!campos.length) return;
  const res = await fetch(`https://people.googleapis.com/v1/${c.resourceName}:updateContact?updatePersonFields=${campos.join(",")}`, {
    method: "PATCH", headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Contatos", res.status, j);
}

// ─── GOOGLE DOCS (via OAuth do usuário) ───────────────────────────────────────────────────────
// Dois modos, os dois pedidos pelo dono (24/08):
//   CRIAR  — um documento por lead a partir de um modelo (proposta, contrato, briefing);
//   ANEXAR — acrescenta um parágrafo no fim de um documento que já existe (diário de leads).
// O doc criado cai na RAIZ do Drive de quem autorizou (regra da Meta… digo, do Google: documents.create
// não aceita pasta — pra mover precisaria do Drive amplo, que é escopo RESTRITO e a gente não pede).
const DOCS = "https://docs.googleapis.com/v1/documents";

/** Aceita a URL do documento OU o id cru. `null` quando não dá pra extrair. */
export function docIdFromUrl(input: string): string | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const m = s.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null; // já é o id
}

export const docLink = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

// Mensagem de erro do Google LEGÍVEL: qual serviço, o texto e o motivo (errors[0].reason). Antes
// chegava no painel só "Bad Request", que é o texto genérico do 400 do Google — impossível saber
// se era Agenda, Planilha ou Docs, e por quê (print do dono, 14/09).
export function erroGoogle(servico: string, status: number, j: any): Error {
  const msg = String(j?.error?.message ?? j?.error_description ?? j?.error ?? "").trim();
  const motivo = String(j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? "").trim();
  const partes = [`${servico}: ${msg || "erro " + status}`];
  if (motivo && !msg.toLowerCase().includes(motivo.toLowerCase())) partes.push(`(${motivo})`);
  console.error(`⚠️ Google ${servico} HTTP ${status}:`, JSON.stringify(j).slice(0, 600));
  return new Error(partes.join(" "));
}

async function docsFetch(accessToken: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Docs", res.status, j);
  return j;
}

/** Cria um documento e escreve o corpo. Devolve id + link pra usar em {{doc_link}}. */
export async function createGoogleDoc(
  accessToken: string, d: { titulo: string; corpo?: string },
): Promise<{ id: string; link: string }> {
  const criado = await docsFetch(accessToken, DOCS, { title: d.titulo.slice(0, 200) });
  const id = String(criado?.documentId ?? "");
  if (!id) throw new Error("o Google não devolveu o id do documento");
  const corpo = String(d.corpo ?? "");
  if (corpo.trim()) {
    // index 1 = logo depois do início do corpo (o índice 0 é a própria seção, não aceita texto).
    await docsFetch(accessToken, `${DOCS}/${id}:batchUpdate`, {
      requests: [{ insertText: { location: { index: 1 }, text: corpo } }],
    });
  }
  return { id, link: docLink(id) };
}

/** Preenche um documento existente: troca <<campo>> e {{campo}} pelos valores do lead.
 *  ⚠️ Edita o PRÓPRIO documento do link. Pro caso "um doc por lead", o certo é o modo criar —
 *  este modo é pro contrato/proposta que o dono duplica e manda preencher. */
export async function replaceInGoogleDoc(
  accessToken: string, docId: string, valores: Record<string, string>,
): Promise<number> {
  const requests: any[] = [];
  for (const [campo, valor] of Object.entries(valores)) {
    if (!campo || requests.length >= 120) break; // teto: 60 campos × 2 marcadores
    for (const marcador of [`<<${campo}>>`, `{{${campo}}}`]) {
      requests.push({ replaceAllText: { containsText: { text: marcador, matchCase: false }, replaceText: String(valor ?? "") } });
    }
  }
  if (!requests.length) return 0;
  const r = await docsFetch(accessToken, `${DOCS}/${docId}:batchUpdate`, { requests });
  // a Graph devolve, por request, quantas ocorrências trocou — soma pra logar algo útil
  return (r?.replies ?? []).reduce((n: number, rep: any) => n + Number(rep?.replaceAllText?.occurrencesChanged ?? 0), 0);
}

/** Acrescenta texto no FIM de um documento existente. */
export async function appendGoogleDoc(accessToken: string, docId: string, texto: string): Promise<void> {
  const t = String(texto ?? "");
  if (!t.trim()) return;
  // endOfSegmentLocation evita ler o documento inteiro só pra descobrir o último índice.
  await docsFetch(accessToken, `${DOCS}/${docId}:batchUpdate`, {
    requests: [{ insertText: { endOfSegmentLocation: {}, text: t.startsWith("\n") ? t : "\n" + t } }],
  });
}

// ─── PLANILHA e AGENDA pelo MESMO login (sem conta de serviço) ────────────────────────────────
// Mesmo efeito das funções lá de cima, trocando o JWT da conta de serviço por um access token do
// OAuth. Assim o cliente não precisa mais criar conta de serviço no Google Cloud nem compartilhar
// a planilha — ele só clica e autoriza. As versões antigas continuam existindo: quem já conectou
// pela conta de serviço não pode quebrar.
export async function appendSheetRowOAuth(accessToken: string, sheetId: string, row: string[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/A1:append`
    + `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({ values: [row] }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Planilhas", res.status, j);
}

const FUSO_BR = "America/Sao_Paulo";
const semMs = (iso: string) => String(iso).replace(/\.\d{3}(?=Z|[+-]\d\d:?\d\d$)/, "");

export async function createCalendarEventOAuth(
  accessToken: string, calendarId: string,
  ev: { titulo: string; descricao?: string; inicioISO: string; fimISO: string },
): Promise<{ link: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events`,
    {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({
        summary: ev.titulo, description: ev.descricao ?? "",
        // Sem milissegundos e com o fuso nomeado: é o formato que a Agenda aceita sem discutir.
        start: { dateTime: semMs(ev.inicioISO), timeZone: FUSO_BR },
        end: { dateTime: semMs(ev.fimISO), timeZone: FUSO_BR },
      }),
    },
  );
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Agenda", res.status, j);
  return { link: String(j?.htmlLink ?? "") };
}

/** CONVIDAR PRO EVENTO (16/10/2026): acha a PRÓXIMA ocorrência de um evento (recorrente ou não)
 *  pelo link do Meet (ou por um trecho do título) e põe o e-mail na lista de convidados dessa
 *  ocorrência, com sendUpdates=all — o Google manda o convite e o lembrete pro convidado. Só a
 *  ocorrência da data (não a série inteira): quem compra pra este sábado não vira convidado de
 *  todos os sábados. Já convidado = não duplica, não reenvia. */
export async function convidarParaEventoOAuth(
  accessToken: string, calendarId: string, busca: string, email: string, diasAFrente = 14,
): Promise<{ status: "convidado" | "ja_estava"; titulo: string; inicio: string; link: string }> {
  const cal = encodeURIComponent(calendarId || "primary");
  const agora = new Date();
  const q = new URLSearchParams({
    timeMin: new Date(agora.getTime() - 3 * 3600_000).toISOString(), // evento em andamento ainda vale
    timeMax: new Date(agora.getTime() + diasAFrente * 86400_000).toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "250",
    fields: "items(id,status,summary,start,end,hangoutLink,htmlLink,attendees,conferenceData/entryPoints)",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events?${q}`, { headers: { authorization: "Bearer " + accessToken } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Agenda", res.status, j);
  const alvo = busca.trim().toLowerCase();
  const codigo = (alvo.match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/) ?? [""])[0]; // sua-sala
  const casa = (it: any) => {
    const links = [String(it?.hangoutLink ?? ""), ...((it?.conferenceData?.entryPoints ?? []).map((e: any) => String(e?.uri ?? "")))].join(" ").toLowerCase();
    if (codigo) return links.includes(codigo);
    return String(it?.summary ?? "").toLowerCase().includes(alvo);
  };
  const ev = (j?.items ?? []).find((it: any) => it?.status !== "cancelled" && casa(it) && new Date(it?.end?.dateTime ?? it?.end?.date ?? 0) > agora);
  if (!ev) throw new Error(`não achei evento com "${busca.slice(0, 60)}" nos próximos ${diasAFrente} dias nesta agenda`);
  const lista: any[] = Array.isArray(ev.attendees) ? ev.attendees : [];
  const base = { titulo: String(ev.summary ?? ""), inicio: String(ev.start?.dateTime ?? ev.start?.date ?? ""), link: String(ev.htmlLink ?? "") };
  if (lista.some((a) => String(a?.email ?? "").toLowerCase() === email.toLowerCase())) return { status: "ja_estava", ...base };
  const pr = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(ev.id)}?sendUpdates=all`, {
    method: "PATCH",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    // guestsCanSeeOtherGuests=false: com dezenas de compradores convidados, ninguém vê o e-mail dos outros (LGPD).
    body: JSON.stringify({ attendees: [...lista, { email }], guestsCanSeeOtherGuests: false }),
  });
  const pj: any = await pr.json().catch(() => ({}));
  if (!pr.ok) throw erroGoogle("Google Agenda", pr.status, pj);
  return { status: "convidado", ...base };
}

/** Eventos entre duas datas, já expandindo os recorrentes. É a base do "horários livres": o
 *  escopo `calendar.events` que já pedimos LÊ eventos — mas NÃO permite o endpoint freeBusy
 *  (esse exige calendar.readonly/calendar.freebusy), então a conta é feita aqui em cima da lista.
 *  `livre` = evento marcado como "disponível" (transparency transparent) — não bloqueia. */
export async function listCalendarEventsOAuth(
  accessToken: string, calendarId: string, timeMinISO: string, timeMaxISO: string,
): Promise<Array<{ inicio: string; fim: string; diaInteiro: boolean; livre: boolean; titulo: string; descricao: string; link: string }>> {
  const q = new URLSearchParams({
    timeMin: timeMinISO, timeMax: timeMaxISO, singleEvents: "true", orderBy: "startTime", maxResults: "250",
    timeZone: FUSO_BR, fields: "items(status,transparency,summary,description,htmlLink,start,end)",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events?${q}`,
    { headers: { authorization: "Bearer " + accessToken } },
  );
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Agenda", res.status, j);
  const out: Array<{ inicio: string; fim: string; diaInteiro: boolean; livre: boolean; titulo: string; descricao: string; link: string }> = [];
  for (const it of j?.items ?? []) {
    if (it?.status === "cancelled") continue;
    const diaInteiro = !!it?.start?.date;
    const inicio = String(it?.start?.dateTime ?? it?.start?.date ?? "");
    const fim = String(it?.end?.dateTime ?? it?.end?.date ?? "");
    if (!inicio || !fim) continue;
    out.push({ inicio, fim, diaInteiro, livre: it?.transparency === "transparent", titulo: String(it?.summary ?? ""), descricao: String(it?.description ?? ""), link: String(it?.htmlLink ?? "") });
  }
  return out;
}

// ── Planilha: ATUALIZAR a linha de uma chave (ou acrescentar) ────────────────────────────────
// Pedido do dono (06/10, planilha de leads do Dr. Exemplo): o lead entra numa linha e a MESMA linha
// vai sendo atualizada conforme ele avança (status, carteira assinada, resumo…). Só acrescentar
// dava 4-5 linhas por lead. Regra: acha a linha cuja coluna-chave bate (telefone compara pelos
// dígitos, ignorando o 55 e o 9º dígito); célula nova VAZIA mantém o que já estava na planilha
// (o "Data" de entrada não é apagado pela atualização). Sem linha igual → acrescenta no fim.
const colLetra = (i: number): string => (i >= 26 ? colLetra(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
function chaveNorm(v: unknown): string {
  const s = String(v ?? "").trim();
  const dig = s.replace(/\D/g, "");
  if (dig.length >= 10 && dig.length === s.replace(/[\s()+\-.]/g, "").length) {
    let d = dig;
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
    return "tel:" + d;
  }
  return s.toLowerCase();
}
export async function upsertSheetRowOAuth(
  accessToken: string, sheetId: string, row: string[], chaveCol: number,
): Promise<"atualizada" | "acrescentada"> {
  const chave = chaveNorm(row[chaveCol]);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/`;
  const h = { authorization: "Bearer " + accessToken, "content-type": "application/json" };
  if (chave && chave !== "tel:") {
    const letra = colLetra(chaveCol);
    const r1 = await fetch(base + encodeURIComponent(`${letra}:${letra}`) + "?majorDimension=COLUMNS", { headers: h });
    const j1: any = await r1.json().catch(() => ({}));
    if (!r1.ok) throw erroGoogle("Google Planilhas", r1.status, j1);
    const coluna: unknown[] = j1?.values?.[0] ?? [];
    const idx = coluna.findIndex((v, i) => i > 0 && chaveNorm(v) === chave); // linha 1 = cabeçalho
    if (idx >= 0) {
      const linha = idx + 1;
      const r2 = await fetch(base + encodeURIComponent(`${linha}:${linha}`) + "?majorDimension=ROWS", { headers: h });
      const j2: any = await r2.json().catch(() => ({}));
      const atual: unknown[] = r2.ok ? (j2?.values?.[0] ?? []) : [];
      const largura = Math.max(row.length, atual.length);
      const mesclada: string[] = [];
      for (let i = 0; i < largura; i++) {
        const nova = String(row[i] ?? "").trim();
        mesclada.push(nova || String(atual[i] ?? ""));
      }
      const r3 = await fetch(base + encodeURIComponent(`A${linha}`) + "?valueInputOption=RAW", {
        method: "PUT", headers: h, body: JSON.stringify({ values: [mesclada] }),
      });
      const j3: any = await r3.json().catch(() => ({}));
      if (!r3.ok) throw erroGoogle("Google Planilhas", r3.status, j3);
      return "atualizada";
    }
  }
  await appendSheetRowOAuth(accessToken, sheetId, row);
  return "acrescentada";
}
export async function upsertSheetRow(sa: ServiceAccount, sheetId: string, row: string[], chaveCol: number): Promise<"atualizada" | "acrescentada"> {
  const token = await getGoogleAccessToken(sa, [SCOPE_SHEETS]);
  return upsertSheetRowOAuth(token, sheetId, row, chaveCol);
}

/** Planilha INTEIRA como lista de objetos (linha 1 = nomes das colunas). É o que o passo "Ler
 *  planilha" entrega pro Loop: cada linha vira um item ({nome, telefone, email…}). Pedido do dono
 *  (09/10/2026): aviso do workshop disparado pros compradores que estão numa planilha. */
export async function readSheetRowsOAuth(accessToken: string, sheetId: string, aba?: string): Promise<Array<Record<string, string>>> {
  const range = aba ? `'${aba.replace(/'/g, "''")}'!A:Z` : "A:Z";
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, {
    headers: { authorization: "Bearer " + accessToken },
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Planilhas", res.status, j);
  const linhas: unknown[][] = j?.values ?? [];
  if (linhas.length < 2) return [];
  const chave = (t: unknown) => String(t ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const cab = linhas[0].map(chave);
  return linhas.slice(1)
    .map((l) => { const o: Record<string, string> = {}; cab.forEach((c, i) => { if (c) o[c] = String(l[i] ?? "").trim(); }); return o; })
    .filter((o) => Object.values(o).some((v) => v));
}

/** Linha 1 da planilha (os NOMES das colunas) — é o que o passo Planilha mostra pra pessoa mapear
 *  "Telefone → {{telefone}}" sem digitar chave nenhuma (pedido do dono, 15/09). */
export async function readSheetHeaderOAuth(accessToken: string, sheetId: string, aba?: string): Promise<string[]> {
  const range = aba ? `'${aba.replace(/'/g, "''")}'!1:1` : "1:1";
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, {
    headers: { authorization: "Bearer " + accessToken },
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Planilhas", res.status, j);
  return ((j?.values?.[0] ?? []) as unknown[]).map((v) => String(v ?? "").trim());
}
export async function readSheetHeader(sa: ServiceAccount, sheetId: string): Promise<string[]> {
  const token = await getGoogleAccessToken(sa, [SCOPE_SHEETS]);
  return readSheetHeaderOAuth(token, sheetId);
}

/** Erro de escopo faltando: quem conectou ANTES de a gente pedir Docs/Planilha/Agenda precisa reconectar. */
export function faltaEscopo(e: unknown): boolean {
  const m = String((e as any)?.message ?? e ?? "");
  return /insufficient|scope|PERMISSION_DENIED|403/i.test(m);
}

/** Cria uma planilha nova e escreve a 1ª linha. Usado no teste de aceitação do escopo. */
export async function createSheetOAuth(accessToken: string, titulo: string, row: string[]): Promise<{ id: string; link: string }> {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({ properties: { title: titulo.slice(0, 200) } }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw erroGoogle("Google Planilhas", res.status, j);
  const id = String(j?.spreadsheetId ?? "");
  if (!id) throw new Error("o Google não devolveu o id da planilha");
  if (row.length) await appendSheetRowOAuth(accessToken, id, row);
  return { id, link: String(j?.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit`) };
}
