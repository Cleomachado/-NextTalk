// Enriquecimento de foto de perfil dos contatos (modo LITE).
// Fonte: /chat/find (endpoint CONFIRMADO, campo `image`) — NÃO chutamos endpoint por-contato.
// A URL do WhatsApp expira, então BAIXAMOS os bytes e HOSPEDAMOS no /media (Postgres) — assim a
// foto "fica salva" e sobrevive ao redeploy. Tudo best-effort: se a UazAPI cair, contatos seguem.
//
// Nota honesta: enriquecemos só contatos SEM foto (avatar_url IS NULL). Se o lead trocar a foto
// depois, não re-buscamos (evita marteladas). Refresh periódico total fica pra depois, se precisar.
// A Cloud API (Meta) NÃO expõe foto de perfil (privacidade) — então isto é só pro canal LITE.
import crypto from "node:crypto";
import { liteChats } from "../uaz.js";
import { listContactsMissingAvatar, saveMedia, setContactAvatar, upsertContact } from "../repo.js";

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");

// SINCRONIZAR: puxa TODAS as conversas 1:1 do WhatsApp (/chat/find) e salva como contatos + foto.
// Diferente do enrichAvatars (que só preenche foto de quem já é contato), isto IMPORTA todo mundo
// com quem o número já conversou — resolve o "essa pessoa me chamou mas não está em Contatos" das
// conversas ANTIGAS (o webhook só captura mensagens NOVAS que chegam depois do deploy).
export async function syncLiteContacts(opts: {
  token: string;
  mediaBase: string;
  wsId?: string;
}): Promise<{ imported: number; avatars: number }> {
  if (!opts.token) return { imported: 0, avatars: 0 };
  let chats: Awaited<ReturnType<typeof liteChats>>;
  try {
    chats = await liteChats(opts.token, 1000);
  } catch {
    return { imported: 0, avatars: 0 };
  }
  let imported = 0;
  let avatars = 0;
  for (const c of chats) {
    if (c.isGroup) continue;
    const phone = onlyDigits(c.phone || c.id);
    if (!phone || phone.length < 8) continue; // ignora ids estranhos/sem número real
    const name = c.name && c.name !== "Sem nome" ? c.name : undefined;
    await upsertContact(phone, name, "lite", opts.wsId).catch(() => {});
    imported++;
    if (c.image) {
      try {
        const hosted = await hostImage(c.image, opts.mediaBase, opts.wsId);
        if (hosted) {
          await setContactAvatar(phone, hosted, opts.wsId);
          avatars++;
        }
      } catch {
        /* pula a foto deste */
      }
    }
  }
  return { imported, avatars };
}

export async function enrichAvatars(opts: {
  token: string;
  mediaBase: string;
  wsId?: string;
  limit?: number;
}): Promise<number> {
  if (!opts.token) return 0;
  const missing = await listContactsMissingAvatar(opts.limit ?? 200, opts.wsId);
  if (missing.length === 0) return 0;
  const missingSet = new Set(missing.map(onlyDigits));

  let chats: Awaited<ReturnType<typeof liteChats>>;
  try {
    chats = await liteChats(opts.token, 500);
  } catch {
    return 0; // UazAPI fora do ar → tenta na próxima
  }

  const imgByPhone = new Map<string, string>();
  for (const c of chats) {
    if (c.isGroup || !c.image) continue;
    const p = onlyDigits(c.phone || c.id);
    if (p && missingSet.has(p)) imgByPhone.set(p, c.image);
  }

  let saved = 0;
  for (const phone of missing) {
    const img = imgByPhone.get(onlyDigits(phone));
    if (!img) continue;
    try {
      const hosted = await hostImage(img, opts.mediaBase, opts.wsId);
      if (hosted) {
        await setContactAvatar(phone, hosted, opts.wsId);
        saved++;
      }
    } catch {
      /* pula este contato */
    }
  }
  return saved;
}

// Baixa (URL ou data:base64) e hospeda no /media, devolvendo a URL pública persistente.
export async function hostImage(src: string, mediaBase: string, wsId?: string): Promise<string | null> {
  let buf: Buffer;
  let mime = "image/jpeg";
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) return null;
    mime = m[1];
    buf = Buffer.from(m[2], "base64");
  } else {
    // timeout: um CDN do WhatsApp travado não pode pendurar o laço de enriquecimento.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(src, { signal: ctrl.signal });
      if (!res.ok) return null;
      mime = res.headers.get("content-type") || "image/jpeg";
      buf = Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(t);
    }
  }
  if (!mime.startsWith("image/")) return null;
  if (!buf.length || buf.length > 3_000_000) return null; // foto de perfil é pequena; corta lixo
  // id determinístico pela URL de origem: troca de foto → nova URL → novo id (não sobrescreve a antiga).
  const id = "av-" + crypto.createHash("sha1").update(src).digest("hex").slice(0, 20);
  await saveMedia(id, mime, buf, wsId);
  return `${mediaBase}/media/${id}`;
}

// Debounce: coalesce rajadas de inbound num único /chat/find (não dispara a cada mensagem).
let pending = false;
export function scheduleEnrich(run: () => unknown, delayMs = 8000): void {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    Promise.resolve(run()).catch(() => {});
  }, delayMs);
}

// 📷 FOTO DOS LEADS DA API OFICIAL (16/10/2026). A Cloud API não entrega foto de perfil, mas o
// /chat/details da UazAPI devolve a foto de QUALQUER número (confirmado ao vivo com um lead que nunca
// falou com o Lite). Usa o número Lite DO PRÓPRIO workspace — nunca o de outro (dado de cliente não
// passa pela instância da plataforma). Grava em chat_avatars (por conversa). Só quem já ESCREVEU na
// API, os mais recentes primeiro, `limite` por rodada, 1,5 s entre consultas; sem foto (ou privacidade
// fechada) → nova tentativa em 2 dias.
export async function enrichAvatarsOficial(opts: { uazUrl: string; token: string; mediaBase: string; wsId: string; limite?: number }): Promise<number> {
  const { query } = await import("../db.js");
  const lista = await query<{ chat_id: string }>(
    `SELECT m.chat_id FROM inbox_messages m
      LEFT JOIN chat_avatars av ON av.workspace_id=m.workspace_id AND av.chat_id=m.chat_id
      LEFT JOIN contacts c ON c.workspace_id=m.workspace_id AND c.phone=m.chat_id
      WHERE m.workspace_id=$1 AND m.account LIKE 'meta-%' AND NOT m.from_me
        AND c.avatar_url IS NULL AND av.url IS NULL
        AND (av.tentado_em IS NULL OR av.tentado_em < now() - interval '2 days')
      GROUP BY m.chat_id ORDER BY max(m.ts) DESC NULLS LAST LIMIT $2`, [opts.wsId, opts.limite ?? 25]).catch(() => [] as Array<{ chat_id: string }>);
  let salvas = 0;
  for (const { chat_id } of lista) {
    let url: string | null = null;
    try {
      const r = await fetch(opts.uazUrl + "/chat/details", {
        method: "POST", headers: { "content-type": "application/json", token: opts.token },
        body: JSON.stringify({ number: chat_id.replace(/@.*/, ""), preview: false }), signal: AbortSignal.timeout(10_000),
      });
      const j: any = await r.json().catch(() => ({}));
      const img = String(j?.image || j?.imagePreview || "");
      if (r.ok && img) url = await hostImage(img, opts.mediaBase, opts.wsId);
    } catch { /* tenta de novo daqui a 2 dias */ }
    await query(
      `INSERT INTO chat_avatars(workspace_id, chat_id, url, tentado_em) VALUES($1,$2,$3,now())
       ON CONFLICT (workspace_id, chat_id) DO UPDATE SET url=COALESCE(EXCLUDED.url, chat_avatars.url), tentado_em=now()`,
      [opts.wsId, chat_id, url]).catch(() => {});
    if (url) salvas++;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return salvas;
}
