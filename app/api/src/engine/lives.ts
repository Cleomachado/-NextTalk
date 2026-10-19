// 🎥 MÉTRICAS DA LIVE (Dashboard de Lançamento → /lancamento/live-metricas, 18/10/2026)
// Quem entrou na aula, quando entrou e saiu (minuto a minuto), o pico, quem ficou até o pitch do
// White Label. A aula hoje é no GOOGLE MEET; o dono quer poder trocar pra ZOOM sem refazer nada,
// e ter um plano C (CSV de presença) pra quando nenhuma API servir. As três fontes caem no MESMO
// formato: 1 live (lives) + N sessões de entrada/saída (live_sessoes).
//
// Fatos das APIs (conferidos na documentação em 18/10/2026):
//   · Meet REST API v2: GET /v2/conferenceRecords (só as conferências que a conta ORGANIZOU, filtro
//     start_time>=…, pageSize ≤ 100) → /v2/{record}/participants (≤ 250) → /v2/{participant}/
//     participantSessions (startTime/endTime de cada entrada). Escopo meetings.space.readonly
//     (SENSÍVEL: com o app Google em modo de teste, só os "usuários de teste" conseguem autorizar).
//     ⚠️ O Meet NÃO devolve e-mail do participante — só o nome de exibição. O cruzamento com quem
//     comprou é por nome (o painel avisa).
//   · Zoom: app Server-to-Server OAuth (account_id + client_id + client_secret) → token em
//     zoom.us/oauth/token?grant_type=account_credentials; participantes com join_time/leave_time e
//     user_email em /report/meetings|webinars/{uuid}/participants (precisa report:read:admin), com
//     /past_meetings|past_webinars como reserva. UUID que começa com "/" ou tem "//" vai duplamente
//     codificado.
import { query } from "../db.js";
import { getCachedFor } from "../config-store.js";
import { decryptSecret } from "../crypto.js";

export interface SessaoLive { pessoa: string; nome: string; email: string | null; entrada: string; saida: string | null }
export interface Gravacao { tipo: "gravacao" | "transcricao"; url: string; inicio?: string | null }
export interface LiveBruta { id: string; fonte: "meet" | "zoom" | "csv"; titulo: string; codigo?: string | null; inicio: string; fim: string | null; sessoes: SessaoLive[]; gravacoes?: Gravacao[] }

export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
// O NOME da reunião não vem do Meet: vem do evento do Google Agenda que tem aquele link (18/10/2026).
export const AGENDA_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

// ── persistência ────────────────────────────────────────────────────────────────────────────
// Ressincronizar troca as sessões mas PRESERVA o que o dono marcou na mão (pitch, marcos, turma).
export async function gravaLive(wsId: string, l: LiveBruta): Promise<void> {
  await query(
    `INSERT INTO lives(workspace_id, id, fonte, titulo, codigo, inicio, fim, gravacoes, sincronizado)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (workspace_id, id) DO UPDATE SET fonte=EXCLUDED.fonte,
       titulo=CASE WHEN lives.titulo_manual THEN lives.titulo ELSE EXCLUDED.titulo END,
       codigo=EXCLUDED.codigo, inicio=EXCLUDED.inicio, fim=EXCLUDED.fim,
       gravacoes=coalesce(EXCLUDED.gravacoes, lives.gravacoes), sincronizado=now()`,
    [wsId, l.id, l.fonte, l.titulo.slice(0, 160), l.codigo ?? null, l.inicio, l.fim, l.gravacoes?.length ? JSON.stringify(l.gravacoes) : null],
  );
  await query(`DELETE FROM live_sessoes WHERE workspace_id=$1 AND live_id=$2`, [wsId, l.id]);
  for (let i = 0; i < l.sessoes.length; i += 200) {
    const lote = l.sessoes.slice(i, i + 200);
    const vals: any[] = [];
    const linhas = lote.map((s, k) => {
      vals.push(wsId, l.id, s.pessoa.slice(0, 200), s.nome.slice(0, 160), s.email?.slice(0, 160) || null, s.entrada, s.saida);
      const b = k * 7;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await query(`INSERT INTO live_sessoes(workspace_id, live_id, pessoa, nome, email, entrada, saida) VALUES ${linhas.join(",")}`, vals);
  }
}

export async function listaLives(wsId: string) {
  const lives = await query<any>(
    `SELECT id, fonte, titulo, codigo, inicio, fim, pitch, marcos, gravacoes, to_char(turma,'YYYY-MM-DD') AS turma, sincronizado
       FROM lives WHERE workspace_id=$1 ORDER BY inicio DESC LIMIT 400`, [wsId]).catch(() => []);
  const sess = await query<any>(
    `SELECT live_id, pessoa, nome, email, entrada, saida FROM live_sessoes WHERE workspace_id=$1 ORDER BY entrada`, [wsId]).catch(() => []);
  const por = new Map<string, any[]>();
  for (const s of sess) { const a = por.get(s.live_id) ?? []; a.push(s); por.set(s.live_id, a); }
  return lives.map((l) => ({ ...l, sessoes: por.get(l.id) ?? [] }));
}

// ── Google Meet ─────────────────────────────────────────────────────────────────────────────
async function meetGet(path: string, token: string): Promise<any> {
  const r = await fetch("https://meet.googleapis.com/v2/" + path, { headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(20_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = String(j?.error?.message ?? `HTTP ${r.status}`);
    if (r.status === 403 && /has not been used|disabled/i.test(m)) throw new Error("a Google Meet REST API não está ativada no projeto do Google Cloud (APIs e serviços → Biblioteca → Google Meet REST API → Ativar)");
    if (r.status === 403 || r.status === 401) throw new Error(`o Google recusou o acesso ao Meet (${m.slice(0, 140)}). Reconecte a conta que ORGANIZA a aula`);
    throw new Error("Meet: " + m.slice(0, 200));
  }
  return j;
}
async function meetTodas(path: string, chave: string, token: string, max = 20): Promise<any[]> {
  const out: any[] = [];
  let pt = "";
  for (let i = 0; i < max; i++) {
    const j = await meetGet(path + (path.includes("?") ? "&" : "?") + (pt ? "pageToken=" + encodeURIComponent(pt) : ""), token);
    out.push(...(j?.[chave] ?? []));
    pt = String(j?.nextPageToken ?? "");
    if (!pt) break;
  }
  return out;
}
// Nome do evento do Google Agenda que usa este link do Meet (busca no dia da reunião). Sem a permissão
// da Agenda (conexão antiga), volta null e a live fica com "Google Meet <código>".
async function tituloNaAgenda(token: string, codigo: string, inicioISO: string): Promise<string | null> {
  try {
    const t0 = new Date(Date.parse(inicioISO) - 12 * 3600_000).toISOString(), t1 = new Date(Date.parse(inicioISO) + 12 * 3600_000).toISOString();
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=100&timeMin=${encodeURIComponent(t0)}&timeMax=${encodeURIComponent(t1)}`,
      { headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const ev = (j?.items ?? []).find((e: any) => String(e?.conferenceData?.conferenceId ?? "") === codigo || String(e?.hangoutLink ?? "").includes(codigo));
    return ev?.summary ? String(ev.summary).slice(0, 160) : null;
  } catch { return null; }
}
export async function sincronizaMeet(token: string, desdeISO: string): Promise<LiveBruta[]> {
  const filtro = encodeURIComponent(`start_time>="${desdeISO}"`);
  const recs = await meetTodas(`conferenceRecords?pageSize=100&filter=${filtro}`, "conferenceRecords", token, 5);
  const out: LiveBruta[] = [];
  const titulos = new Map<string, string | null>();   // mesma reunião semanal: 1 consulta por código+dia
  for (const rec of recs) {
    let codigo: string | null = null;
    try { codigo = String((await meetGet(String(rec.space), token))?.meetingCode ?? "") || null; } catch { /* espaço apagado */ }
    const parts = await meetTodas(`${rec.name}/participants?pageSize=250`, "participants", token);
    const sessoes: SessaoLive[] = [];
    for (const p of parts) {
      const nome = String(p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? "Participante").trim();
      const pessoa = String(p.signedinUser?.user ?? "") || "nome:" + normalizaNome(nome);
      const ss = await meetTodas(`${p.name}/participantSessions?pageSize=250`, "participantSessions", token).catch(() => []);
      if (!ss.length && p.earliestStartTime) sessoes.push({ pessoa, nome, email: null, entrada: p.earliestStartTime, saida: p.latestEndTime ?? null });
      for (const s of ss) if (s.startTime) sessoes.push({ pessoa, nome, email: null, entrada: s.startTime, saida: s.endTime ?? null });
    }
    if (!sessoes.length) continue; // sala aberta e ninguém entrou
    // Gravação e transcrição (ficam no Drive de quem organizou): o link abre o vídeo pra assistir.
    const gravacoes: Gravacao[] = [];
    for (const [rota, chave, tipo] of [["recordings", "recordings", "gravacao"], ["transcripts", "transcripts", "transcricao"]] as const) {
      const itens = await meetTodas(`${rec.name}/${rota}?pageSize=50`, chave, token, 2).catch(() => []);
      for (const g of itens) {
        const url = String(g?.driveDestination?.exportUri ?? g?.docsDestination?.exportUri ?? "");
        if (url) gravacoes.push({ tipo, url, inicio: g?.startTime ?? null });
      }
    }
    let titulo: string | null = null;
    if (codigo) {
      const k = codigo + "|" + String(rec.startTime).slice(0, 10);
      if (!titulos.has(k)) titulos.set(k, await tituloNaAgenda(token, codigo, rec.startTime));
      titulo = titulos.get(k) ?? null;
    }
    out.push({ id: "meet:" + String(rec.name).split("/").pop(), fonte: "meet", titulo: titulo ?? (codigo ? `Google Meet ${codigo}` : "Google Meet"), codigo, inicio: rec.startTime, fim: rec.endTime ?? null, sessoes, gravacoes });
  }
  return out;
}

// ── Zoom ────────────────────────────────────────────────────────────────────────────────────
export interface CfgZoom { accountId: string; clientId: string; clientSecret: string }
export function configZoom(wsId: string): CfgZoom | null {
  const c = getCachedFor<{ accountId?: string; clientId?: string; enc?: string }>(wsId, "live-zoom-config");
  const sec = c?.enc ? decryptSecret(c.enc) : null;
  return c?.accountId && c?.clientId && sec ? { accountId: c.accountId, clientId: c.clientId, clientSecret: sec } : null;
}
export async function tokenZoom(cfg: CfgZoom): Promise<string> {
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`, {
    method: "POST", headers: { authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64") },
    signal: AbortSignal.timeout(15_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`o Zoom recusou as credenciais (${String(j?.reason ?? j?.error ?? r.status)}). Confira Account ID, Client ID e Client Secret do app Server-to-Server OAuth`);
  return String(j.access_token);
}
async function zoomGet(path: string, token: string): Promise<{ ok: boolean; j: any }> {
  const r = await fetch("https://api.zoom.us/v2/" + path, { headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(20_000) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}
const uuidZoom = (u: string) => (u.startsWith("/") || u.includes("//") ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u));
export async function sincronizaZoom(token: string, desdeISO: string): Promise<LiveBruta[]> {
  const out: LiveBruta[] = [];
  const eventos: Array<{ uuid: string; tipo: "meetings" | "webinars"; topic: string; start: string }> = [];
  for (const [tipo, q] of [["meetings", "type=previous_meetings"], ["webinars", "type=past"]] as const) {
    const r = await zoomGet(`users/me/${tipo}?${q}&page_size=100`, token);
    for (const m of r.j?.[tipo] ?? []) if (String(m.start_time ?? "") >= desdeISO) eventos.push({ uuid: String(m.uuid ?? m.id), tipo, topic: String(m.topic ?? "Zoom"), start: String(m.start_time) });
  }
  for (const ev of eventos) {
    const enc = uuidZoom(ev.uuid);
    let parts: any[] = [];
    for (const base of [`report/${ev.tipo}/${enc}/participants`, `past_${ev.tipo}/${enc}/participants`]) {
      let next = "", ok = false;
      const acc: any[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await zoomGet(`${base}?page_size=300${next ? "&next_page_token=" + encodeURIComponent(next) : ""}`, token);
        if (!r.ok) break;
        ok = true; acc.push(...(r.j?.participants ?? []));
        next = String(r.j?.next_page_token ?? ""); if (!next) break;
      }
      if (ok) { parts = acc; break; }
    }
    const sessoes: SessaoLive[] = parts.filter((p) => p.join_time).map((p) => {
      const nome = String(p.name ?? p.user_name ?? "Participante").trim();
      const email = String(p.user_email ?? p.email ?? "").trim().toLowerCase() || null;
      return { pessoa: email ? "email:" + email : "nome:" + normalizaNome(nome), nome, email, entrada: String(p.join_time), saida: p.leave_time ? String(p.leave_time) : null };
    });
    if (!sessoes.length) continue;
    const fim = sessoes.map((s) => s.saida ?? "").sort().pop() || null;
    out.push({ id: "zoom:" + ev.uuid, fonte: "zoom", titulo: ev.topic, inicio: ev.start, fim, sessoes });
  }
  return out;
}

// ── CSV de presença (plano C: relatório de presença do Meet/Workspace, extensão, planilha) ───
// Aceita as colunas mais comuns em PT e EN. Horário sem data usa o dia informado; sem saída mas
// com duração, a saída = entrada + duração.
export function liveDoCsv(texto: string, dia: string, titulo: string, horaInicio = "09:00"): LiveBruta {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error("o arquivo não tem linhas de participante");
  const sep = [",", ";", "\t"].sort((a, b) => linhas[0].split(b).length - linhas[0].split(a).length)[0];
  const corta = (l: string) => {
    const out: string[] = []; let cur = "", aspas = false;
    for (const ch of l) { if (ch === '"') aspas = !aspas; else if (ch === sep && !aspas) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out.map((x) => x.trim());
  };
  const cab = corta(linhas[0]).map((h) => normalizaNome(h));
  const col = (...nomes: RegExp[]) => cab.findIndex((h) => nomes.some((n) => n.test(h)));
  const iNome = col(/^(nome|name|participante|participant|nome completo|full name|display name|nome de exibicao)$/);
  const iPrim = col(/^(primeiro nome|first name)$/), iSob = col(/^(sobrenome|last name)$/);
  const iEmail = col(/e-?mail/);
  const iEnt = col(/entrada|join|entrou|first seen|time joined|inicio/);
  const iSai = col(/saida|leave|left|saiu|last seen|time exited|fim/);
  const iDur = col(/dura|duration|tempo|minutos|minutes/);
  if (iNome < 0 && iPrim < 0 && iEmail < 0) throw new Error("não achei a coluna de nome ou e-mail no cabeçalho");
  const quando = (v: string): string | null => {
    const s = String(v ?? "").trim(); if (!s) return null;
    const hm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
    const dm = s.match(/(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!hm) return null;
    let h = Number(hm[1]); const ap = (hm[4] ?? "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    let data = dia;
    if (dm) data = dm[1] ? `${dm[1]}-${dm[2]}-${dm[3]}` : `${(dm[6].length === 2 ? "20" + dm[6] : dm[6])}-${dm[5].padStart(2, "0")}-${dm[4].padStart(2, "0")}`;
    return new Date(`${data}T${String(h).padStart(2, "0")}:${hm[2]}:${hm[3] ?? "00"}-03:00`).toISOString();
  };
  const minutos = (v: string): number => {
    const s = String(v ?? "").toLowerCase().trim(); if (!s) return 0;
    const hms = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/); if (hms) return Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3] ?? 0) / 60;
    const h = Number(s.match(/(\d+)\s*h/)?.[1] ?? 0), m = Number(s.match(/(\d+)\s*m/)?.[1] ?? (/^\d+(\.\d+)?$/.test(s) ? s : 0));
    return h * 60 + m;
  };
  const inicioPadrao = new Date(`${dia}T${horaInicio}:00-03:00`).toISOString();
  const sessoes: SessaoLive[] = [];
  for (const l of linhas.slice(1)) {
    const c = corta(l);
    const nome = (iNome >= 0 ? c[iNome] : [c[iPrim], c[iSob]].filter(Boolean).join(" ")) || (iEmail >= 0 ? c[iEmail] : "") || "Participante";
    const email = iEmail >= 0 ? (c[iEmail] || "").toLowerCase() || null : null;
    const ent = (iEnt >= 0 ? quando(c[iEnt]) : null) ?? inicioPadrao;
    let sai = iSai >= 0 ? quando(c[iSai]) : null;
    if (!sai && iDur >= 0) { const m = minutos(c[iDur]); if (m > 0) sai = new Date(Date.parse(ent) + m * 60_000).toISOString(); }
    sessoes.push({ pessoa: email ? "email:" + email : "nome:" + normalizaNome(nome), nome, email, entrada: ent, saida: sai });
  }
  const ini = sessoes.map((s) => s.entrada).sort()[0] ?? inicioPadrao;
  const fim = sessoes.map((s) => s.saida ?? "").sort().pop() || null;
  return { id: `csv:${dia}:${Date.now().toString(36)}`, fonte: "csv", titulo: titulo || `Live ${dia.split("-").reverse().join("/")}`, inicio: ini, fim, sessoes };
}

export function normalizaNome(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@.\s-]/g, " ").replace(/\s+/g, " ").trim();
}
