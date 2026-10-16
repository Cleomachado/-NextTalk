// ═══ FICHA DO CONTATO — clicar no nome da conversa abre e edita os dados da pessoa ═══════════════
// Pedido do dono (09/10): no meio do chat, trocar o nome genérico e anotar e-mail, telefones,
// RG/CPF, gênero, endereço com CEP… e guardar a FOTO do RG/CPF junto do contato.
//
// Os campos moram em contact_fields com os MESMOS nomes do contrato/procuração (advocacia.ts
// CAMPOS_CONTRATO) e das variáveis dos fluxos ({{cpf}}, {{cidade}}…): preencher a ficha no chat já
// alimenta o contrato e as mensagens, sem cadastro duplicado.
//
// Documentos (RG/CPF/CNH) NÃO vão pra tabela `media`: lá o arquivo é servido SEM login e com cache
// público (a UazAPI precisa buscar). Documento pessoal fica em contact_docs e só sai por rota
// autenticada e escopada no workspace.
import { randomUUID } from "node:crypto";
import { dbEnabled, query } from "./db.js";
import { getCurrentWorkspace } from "./workspace-context.js";
import { variante9BR } from "./lib/phone.js";
import { getContactFields } from "./repo.js";

export const CAMPOS_FICHA: Array<{ key: string; max: number }> = [
  { key: "nome_completo", max: 160 },
  { key: "cpf", max: 20 },
  { key: "rg", max: 30 },
  { key: "data_nascimento", max: 10 },
  { key: "genero", max: 20 },
  { key: "estado_civil", max: 30 },
  { key: "profissao", max: 80 },
  { key: "nacionalidade", max: 40 },
  { key: "email", max: 160 },
  { key: "telefone1", max: 30 },
  { key: "telefone2", max: 30 },
  { key: "cep", max: 9 },
  { key: "endereco", max: 240 },
  { key: "cidade", max: 80 },
  { key: "uf", max: 2 },
];
const CHAVES = new Set(CAMPOS_FICHA.map((c) => c.key));

export const TIPOS_DOC = ["RG", "CPF", "CNH", "Comprovante de residência", "Carteira de trabalho", "Outro"];
export const MIME_DOC = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);
export const MAX_DOC_BYTES = 15 * 1024 * 1024;
const MAX_DOCS_POR_CONTATO = 30;

function formas(phone: string): string[] {
  const v = variante9BR(phone);
  return v ? [phone, v] : [phone];
}
const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// O telefone JÁ GRAVADO do contato (com ou sem o 9º dígito) — escrever na outra forma deixaria a
// ficha partida em duas chaves.
async function telefoneGravado(ws: string, tel: string): Promise<string | null> {
  const r = await query<{ phone: string }>(
    "SELECT phone FROM contacts WHERE workspace_id=$1 AND phone = ANY($2) ORDER BY last_seen DESC NULLS LAST LIMIT 1",
    [ws, formas(tel)]);
  return r[0]?.phone ?? null;
}

// Normaliza o que dá pra normalizar sem brigar com quem digita: CPF/CEP formatados, UF maiúscula.
function normaliza(key: string, v: string): string {
  const d = soDig(v);
  if (key === "cpf" && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (key === "cep" && d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (key === "uf") return v.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
  if (key === "email") return v.toLowerCase();
  return v;
}

export interface DocResumo { id: string; tipo: string; nome: string; mime: string; tamanho: number; criado: string }

async function listaDocs(ws: string, tel: string): Promise<DocResumo[]> {
  const r = await query<{ id: string; tipo: string | null; nome: string | null; mime: string; tamanho: number | null; created_at: string }>(
    "SELECT id, tipo, nome, mime, tamanho, created_at FROM contact_docs WHERE workspace_id=$1 AND phone = ANY($2) ORDER BY created_at DESC",
    [ws, formas(tel)]);
  return r.map((d) => ({ id: d.id, tipo: d.tipo ?? "Outro", nome: d.nome ?? "", mime: d.mime, tamanho: Number(d.tamanho ?? 0), criado: new Date(d.created_at).toISOString() }));
}

export async function getFicha(phone: string, wsId?: string) {
  const tel = soDig(phone);
  if (!tel) return null;
  const ws = wsId ?? getCurrentWorkspace();
  const gravado = dbEnabled ? await telefoneGravado(ws, tel) : null;
  const base = gravado ?? tel;
  const c = dbEnabled && gravado
    ? (await query<{ name: string | null; name_manual: boolean | null; email: string | null; notes: string | null }>(
        "SELECT name, name_manual, email, notes FROM contacts WHERE workspace_id=$1 AND phone=$2", [ws, gravado]))[0]
    : undefined;
  const todos = await getContactFields(base, ws).catch(() => ({} as Record<string, string>));
  const campos: Record<string, string> = {};
  for (const k of CHAVES) if (todos[k]) campos[k] = todos[k];
  if (!campos.email && c?.email) campos.email = c.email;
  // ORIGEM (14/10/2026): as UTMs do checkout (Kiwify) e o clique do anúncio já moravam na ficha,
  // mas a tela não mostrava — o dono olhava o chat e não sabia de onde o lead veio. Só leitura.
  const origem: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ad_id", "anuncio_clique", "anuncio_em"]) {
    if (todos[k]) origem[k] = String(todos[k]).slice(0, 300);
  }
  return {
    origem,
    phone: base,
    nome: c?.name ?? "",
    nomeManual: !!c?.name_manual,
    notas: c?.notes ?? "",
    campos,
    docs: dbEnabled ? await listaDocs(ws, base) : [],
  };
}

export async function salvaFicha(phone: string, body: any, wsId?: string): Promise<{ erro?: string }> {
  const tel = soDig(phone);
  if (!tel) return { erro: "telefone inválido" };
  if (!dbEnabled) return { erro: "banco indisponível" };
  const ws = wsId ?? getCurrentWorkspace();
  let alvo = await telefoneGravado(ws, tel);
  if (!alvo) {
    // Conversa que nunca virou contato (ex.: chegou antes do webhook): a ficha cria o contato.
    await query("INSERT INTO contacts(workspace_id, phone) VALUES($1,$2) ON CONFLICT (workspace_id, phone) DO NOTHING", [ws, tel]);
    alvo = tel;
  }

  const campos: Record<string, string> = {};
  const entrada = body?.campos && typeof body.campos === "object" ? body.campos : {};
  for (const { key, max } of CAMPOS_FICHA) {
    if (entrada[key] === undefined) continue;
    campos[key] = normaliza(key, String(entrada[key] ?? "").trim()).slice(0, max);
  }
  if (campos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) return { erro: "e-mail inválido" };
  if (campos.cpf && soDig(campos.cpf).length !== 11) return { erro: "CPF precisa ter 11 dígitos" };

  const sets: string[] = [];
  const vals: unknown[] = [ws, alvo];
  const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (body?.nome !== undefined) {
    const nome = String(body.nome ?? "").trim().slice(0, 120);
    push("name", nome || null);
    // Nome digitado à mão vence o nome do WhatsApp na lista de conversas (nomesManuais).
    push("name_manual", !!nome);
  }
  if (body?.notas !== undefined) push("notes", String(body.notas ?? "").trim().slice(0, 2000) || null);
  if (campos.email !== undefined) push("email", campos.email || null);
  if (["endereco", "cidade", "uf", "cep"].some((k) => campos[k] !== undefined)) {
    // `address` é o que o card do funil mostra — linha única montada da ficha.
    const atual = await getContactFields(alvo, ws).catch(() => ({} as Record<string, string>));
    const v = (k: string) => (campos[k] !== undefined ? campos[k] : atual[k] ?? "");
    const cidadeUf = [v("cidade"), v("uf")].filter(Boolean).join("/");
    push("address", [v("endereco"), cidadeUf, v("cep") && "CEP " + v("cep")].filter(Boolean).join(" - ") || null);
  }
  if (sets.length) await query(`UPDATE contacts SET ${sets.join(", ")} WHERE workspace_id=$1 AND phone=$2`, vals);

  for (const [key, valor] of Object.entries(campos)) {
    // Limpa nas DUAS formas do número: um valor velho na outra forma voltaria a aparecer quando o
    // número fosse lido pelo outro lado (o getContactFields dá prioridade à forma exata).
    await query("DELETE FROM contact_fields WHERE workspace_id=$1 AND phone = ANY($2) AND field=$3", [ws, formas(alvo), key]);
    if (valor) {
      await query("INSERT INTO contact_fields(workspace_id, phone, field, value, updated_at) VALUES($1,$2,$3,$4, now())", [ws, alvo, key, valor]);
    }
  }
  return {};
}

// Nomes digitados à mão na ficha → sobrepõem o nome do WhatsApp na lista de conversas.
export async function nomesManuais(wsId?: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!dbEnabled) return out;
  const r = await query<{ phone: string; name: string }>(
    "SELECT phone, name FROM contacts WHERE workspace_id=$1 AND name_manual AND name IS NOT NULL", [wsId ?? getCurrentWorkspace()]).catch(() => []);
  for (const c of r) for (const f of formas(c.phone)) if (!out.has(f) || f === c.phone) out.set(f, c.name);
  return out;
}
export function aplicaNomesManuais<T extends { id?: string; name?: string; isGroup?: boolean }>(chats: T[], nomes: Map<string, string>): T[] {
  if (!nomes.size) return chats;
  return chats.map((c) => {
    if (c.isGroup || !c.id || c.id.includes("@g.us")) return c;
    const n = nomes.get(soDig(String(c.id).split("@")[0]));
    return n ? { ...c, name: n } : c;
  });
}

export async function salvaDoc(phone: string, o: { tipo: string; nome: string; mime: string; buf: Buffer }, wsId?: string): Promise<{ erro?: string; doc?: DocResumo }> {
  const tel = soDig(phone);
  if (!tel) return { erro: "telefone inválido" };
  if (!dbEnabled) return { erro: "banco indisponível" };
  if (!o.buf.length) return { erro: "arquivo vazio" };
  if (o.buf.length > MAX_DOC_BYTES) return { erro: "arquivo acima de 15MB" };
  if (!MIME_DOC.has(o.mime)) return { erro: "envie foto (JPG, PNG, WEBP, HEIC) ou PDF" };
  const ws = wsId ?? getCurrentWorkspace();
  let alvo = await telefoneGravado(ws, tel);
  if (!alvo) {
    await query("INSERT INTO contacts(workspace_id, phone) VALUES($1,$2) ON CONFLICT (workspace_id, phone) DO NOTHING", [ws, tel]);
    alvo = tel;
  }
  const [{ n }] = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM contact_docs WHERE workspace_id=$1 AND phone = ANY($2)", [ws, formas(alvo)]);
  if (n >= MAX_DOCS_POR_CONTATO) return { erro: `limite de ${MAX_DOCS_POR_CONTATO} documentos por contato — exclua algum antes` };
  const tipo = TIPOS_DOC.includes(o.tipo) ? o.tipo : "Outro";
  const nome = o.nome.replace(/[\r\n"\\/]/g, " ").trim().slice(0, 120) || tipo;
  const id = randomUUID();
  await query("INSERT INTO contact_docs(id, workspace_id, phone, tipo, nome, mime, tamanho, data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, ws, alvo, tipo, nome, o.mime, o.buf.length, o.buf]);
  return { doc: { id, tipo, nome, mime: o.mime, tamanho: o.buf.length, criado: new Date().toISOString() } };
}

export async function lerDoc(phone: string, id: string, wsId?: string): Promise<{ nome: string; mime: string; data: Buffer } | null> {
  const tel = soDig(phone);
  if (!dbEnabled || !tel || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = await query<{ nome: string | null; mime: string; data: Buffer }>(
    "SELECT nome, mime, data FROM contact_docs WHERE workspace_id=$1 AND id=$2 AND phone = ANY($3)", [wsId ?? getCurrentWorkspace(), id, formas(tel)]);
  return r[0] ? { nome: r[0].nome ?? "documento", mime: r[0].mime, data: r[0].data } : null;
}

export async function apagaDoc(phone: string, id: string, wsId?: string): Promise<boolean> {
  const tel = soDig(phone);
  if (!dbEnabled || !tel || !/^[0-9a-f-]{36}$/.test(id)) return false;
  const r = await query<{ id: string }>(
    "DELETE FROM contact_docs WHERE workspace_id=$1 AND id=$2 AND phone = ANY($3) RETURNING id", [wsId ?? getCurrentWorkspace(), id, formas(tel)]);
  return r.length > 0;
}

// CEP → endereço (ViaCEP). Pelo servidor pra não depender do CSP do painel.
export async function buscaCep(cep: string): Promise<{ endereco: string; bairro: string; cidade: string; uf: string } | null> {
  const d = soDig(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (j?.erro) return null;
    return { endereco: String(j.logradouro ?? ""), bairro: String(j.bairro ?? ""), cidade: String(j.localidade ?? ""), uf: String(j.uf ?? "") };
  } catch {
    return null;
  }
}
