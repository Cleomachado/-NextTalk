// Cliente server-side do motor (app:3333, rede interna do Swarm).
// O token de admin NUNCA vai pro navegador — só o Next server fala com o motor.
const BASE = (process.env.API_BASE ?? "http://app:3333").replace(/\/+$/, "");
const TOKEN = process.env.ADMIN_TOKEN ?? "";

export interface MotorResult {
  ok: boolean;
  status: number;
  data: any;
}

// Portão central + ROTEAMENTO POR PAPEL (multi-tenant). Toda chamada exige sessão válida (cookie
// zc_session). O pulo do gato: uma sessão de CLIENTE (não-admin) tem TODA chamada a `/admin/*`
// REMAPEADA de forma transparente pra `/app/*` — a superfície escopada por workspace. Assim as MESMAS
// páginas/componentes do painel (WPP ao Vivo, Fluxos, etc.) rodam com os dados DO CLIENTE, sem editar
// componente. Regras de segurança:
//  • admin-token do motor NUNCA vai numa chamada que resolve pra `/app/*` (só em `/admin/*`, ou seja, só admin).
//  • cliente NUNCA fala com `/admin/*` (o remap cobre; qualquer resíduo = 403).
//  • `/app/*` no motor deriva o workspace DA SESSÃO e escopa tudo (fail-closed). Endpoint /app/* inexistente = 404 (sem vazamento).
async function call(path: string, init?: RequestInit, bruto = false): Promise<MotorResult> {
  try {
    // Anti path-traversal: "/auth/../admin/stats" não pode driblar o portão.
    //
    // 🔐 Procurar a SUBSTRING ".." não bastava: o parser de URL normaliza segmentos de ponto
    // percent-encoded, então "/auth/%2e%2e/admin/stats" passava por aqui intacto e o fetch
    // entregava "/admin/stats" ao motor (auditoria 07/09). Hoje isso ainda esbarrava no motor
    // (o token de admin é calculado sobre a string crua, e o /admin/* exige sessão de admin),
    // mas a guarda tem que valer sozinha — no dia em que alguém montar um caminho dinâmico, ela
    // é a única linha de defesa. Agora a decisão é tomada sobre o caminho JÁ NORMALIZADO.
    const semQuery = path.split("?")[0];
    let normalizado: string;
    try { normalizado = new URL(path, "http://motor.interno").pathname; } catch { normalizado = ""; }
    if (!normalizado || normalizado !== semQuery || normalizado.includes("//") || normalizado.includes("..")) {
      return { ok: false, status: 400, data: { error: "caminho inválido" } };
    }

    let token: string | undefined;
    try { const { cookies } = await import("next/headers"); token = (await cookies()).get("zc_session")?.value; } catch {}

    const isAuth = path.startsWith("/auth/");
    // O aceite dos termos também precisa do IP REAL — ali ele não é anti-flood, é PROVA: sem o IP
    // de quem clicou, o registro do aceite perde metade do valor numa discussão jurídica.
    const ehAceite = path.startsWith("/app/termos");
    // IP REAL do visitante pras travas anti-força-bruta do motor. Sem isto, todas as chamadas
    // chegam com o IP do contêiner do painel → o limite "por IP" viraria um bucket GLOBAL
    // (um flood derrubaria o login de todos os clientes). O motor só confia neste header quando a
    // requisição NÃO vem carimbada pela borda pública (ver clientIp no server.ts).
    let realIp = "";
    if (isAuth || ehAceite) {
      try {
        const { headers } = await import("next/headers");
        const h = await headers();
        realIp = (h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim();
      } catch { /* fora de request (build) — sem IP */ }
    }
    let role: string | undefined;
    if (!isAuth) {
      if (!token) return { ok: false, status: 401, data: { error: "não autenticado" } };
      try {
        const res = await fetch(`${BASE}/auth/session`, { headers: { "x-session-token": token }, cache: "no-store" });
        if (!res.ok) return { ok: false, status: 401, data: { error: "sessão expirada — entre de novo" } };
        const s: any = await res.json().catch(() => null);
        if (s?.paywall) return { ok: false, status: 402, data: { error: "seu período de teste acabou — assine um plano" } };
        role = s?.user?.role;
      } catch {
        return { ok: false, status: 401, data: { error: "não autenticado" } };
      }
    }
    const isAdmin = role === "admin";

    // REMAP: cliente (não-admin) → /admin/* vira a superfície escopada /app/*.
    let motorPath = path;
    if (!isAdmin && path.startsWith("/admin/")) motorPath = "/app/" + path.slice("/admin/".length);
    // Fail-closed: um não-admin NUNCA pode acabar num /admin/* (dados do dono).
    if (!isAdmin && motorPath.startsWith("/admin/")) return { ok: false, status: 403, data: { error: "acesso restrito" } };

    const sendAdminToken = motorPath.startsWith("/admin/"); // admin-token só em /admin/* (nunca em /app/* de cliente)
    const res = await fetch(`${BASE}${motorPath}`, {
      ...init,
      headers: {
        ...(sendAdminToken ? { "x-admin-token": TOKEN } : {}),
        ...(token ? { "x-session-token": token } : {}),
        ...(realIp ? { "x-zc-client-ip": realIp.slice(0, 64) } : {}),
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    // BINÁRIO na volta (documento do contato): sem passar por texto, que corromperia os bytes.
    if (bruto && res.ok) {
      return { ok: true, status: res.status, data: { buf: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "application/octet-stream", disposition: res.headers.get("content-disposition") ?? "" } };
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    // 502/503/504 COM explicação do motor (ex.: "a Meta recusou o token") viram 424. Motivo: o
    // Cloudflare na frente do painel troca qualquer 502/504 vindo da origem pela página dele, e o
    // navegador recebia só "Erro 502", sem o motivo (caso Testar do Meta Ads, 13/10/2026).
    const status = [502, 503, 504].includes(res.status) && data?.error ? 424 : res.status;
    return { ok: res.ok, status, data };
  } catch (e: any) {
    // Motor fora do ar / rede indisponível → 502 amigável pro painel.
    return { ok: false, status: 424, data: { error: "motor indisponível: " + (e?.message ?? e) } };
  }
}

export const motor = {
  get: (p: string, headers?: Record<string, string>) => call(p, headers ? { headers } : undefined),
  put: (p: string, body: unknown) => call(p, { method: "PUT", body: JSON.stringify(body) }),
  post: (p: string, body: unknown, headers?: Record<string, string>) =>
    call(p, { method: "POST", body: JSON.stringify(body), ...(headers ? { headers } : {}) }),
  del: (p: string) => call(p, { method: "DELETE" }),
  // GET que devolve BYTES ({ buf, mime, disposition }) quando dá certo; erro continua JSON.
  getBytes: (p: string) => call(p, undefined, true),
  // BINÁRIO CRU (arquivo de cabeçalho do template). Não passa por JSON: o arquivo vai como bytes,
  // sem base64 e sem virar um texto gigante que qualquer engasgo de rede transforma em erro mudo.
  postRaw: (p: string, body: Buffer | Uint8Array) =>
    call(p, { method: "POST", body: body as any, headers: { "content-type": "application/octet-stream" } }),
};
