// 🎯 ORIGEM DO LEAD PELA PÁGINA (UTM/gclid) — 06/10/2026, planilha de leads do Dr. Exemplo.
// O número LITE não traz de onde o lead veio. A saída: no clique do botão de WhatsApp, a página
// avisa o motor (POST /webhooks/clique/<token do workspace>) com as UTMs e um código de 6 letras,
// e põe ESSE código no fim da mensagem pré-preenchida em caracteres de largura zero (U+200B = 0,
// U+200C = 1; 5 bits por letra, 30 caracteres). O lead vê a mensagem igual. Quando a 1ª mensagem
// chega, o motor lê o código, casa com o clique, grava utm_*/gclid na ficha e tira o código do
// texto. Admin não quer UTM nem [grupo | origem] visível na mensagem — por isso invisível.
import { query } from "../db.js";

const ALFA = "abcdefghijklmnopqrstuvwxyz234567"; // base32 minúscula: 6 letras = 30 bits
const ZW0 = "​", ZW1 = "‌";
// Qualquer utm_* entra (os ValueTrack do dono: utm_matchtype, utm_device, utm_network, utm_adgroup,
// utm_target…), mais os ids de clique e a praça (loc) / grupo (g).
export const CAMPO_CLIQUE_OK = /^(utm_[a-z0-9_]{1,30}|gclid|fbclid|wbraid|gbraid|loc|g|pagina|assunto|grupo)$/;
export function filtraCamposClique(b: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(b ?? {})) {
    const chave = String(k).toLowerCase();
    if (!CAMPO_CLIQUE_OK.test(chave) || Object.keys(out).length >= 30) continue;
    const val = String(v ?? "").trim().slice(0, 200);
    if (val && !/^\{.*\}$/.test(val)) out[chave] = val; // "{keyword}" literal (ferramenta de teste do Ads) não entra
  }
  return out;
}

export function codificaMarcador(codigo: string): string {
  let out = "";
  for (const ch of codigo.toLowerCase().slice(0, 6)) {
    const n = Math.max(0, ALFA.indexOf(ch));
    for (let b = 4; b >= 0; b--) out += (n >> b) & 1 ? ZW1 : ZW0;
  }
  return out;
}

// Acha o marcador no texto (a ÚLTIMA sequência de 30+ caracteres de largura zero), devolve o
// código e o texto limpo. Sequências curtas (ex.: o U+200E da saudação do WhatsApp Business não
// entra aqui — é outro caractere) ficam como estão.
export function extraiMarcador(texto: string): { codigo: string; texto: string } | null {
  const s = String(texto ?? "");
  const runs = s.match(/[​‌]{30,}/g);
  if (!runs) return null;
  const bits = runs[runs.length - 1].slice(-30);
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    let n = 0;
    for (let b = 0; b < 5; b++) n = n * 2 + (bits[i * 5 + b] === ZW1 ? 1 : 0);
    codigo += ALFA[n];
  }
  return { codigo, texto: s.replace(/[​‌]{30,}/g, "").trim() };
}

const rows = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);

export async function registraClique(wsId: string, codigo: string, dados: Record<string, string>): Promise<void> {
  await query(
    `INSERT INTO lead_clicks(workspace_id, codigo, dados) VALUES($1, $2, $3::jsonb)
     ON CONFLICT (workspace_id, codigo) DO UPDATE SET dados = EXCLUDED.dados WHERE lead_clicks.usado_em IS NULL`,
    [wsId, codigo, JSON.stringify(dados)],
  );
  // Clique que não virou conversa em 7 dias não serve mais (e a tabela não cresce pra sempre).
  if (Math.random() < 0.05) await query(`DELETE FROM lead_clicks WHERE created_at < now() - interval '7 days'`).catch(() => {});
}

// Casa o código com o clique. Um clique serve pra UM telefone (o mesmo pode reenviar à vontade).
export async function consomeClique(wsId: string, codigo: string, phone: string): Promise<Record<string, string> | null> {
  const r = rows(await query(`SELECT dados, phone FROM lead_clicks WHERE workspace_id=$1 AND codigo=$2 AND created_at > now() - interval '7 days'`, [wsId, codigo]));
  const c = r[0];
  if (!c) return null;
  if (c.phone && String(c.phone).replace(/\D/g, "").slice(-8) !== phone.replace(/\D/g, "").slice(-8)) return null;
  await query(`UPDATE lead_clicks SET usado_em = COALESCE(usado_em, now()), phone = $3 WHERE workspace_id=$1 AND codigo=$2`, [wsId, codigo, phone]).catch(() => {});
  const d = typeof c.dados === "string" ? JSON.parse(c.dados) : c.dados;
  return d && typeof d === "object" ? d : null;
}

// O que vai pra FICHA do contato (e vira {{utm_source}}, {{gclid}}… nos fluxos; o selo ADS do chat
// lê utm_*). `pagina`/`grupo` ganham nome mais claro na ficha.
export function camposDoClique(d: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if ((k.startsWith("utm_") || ["gclid", "fbclid", "wbraid", "gbraid", "loc"].includes(k)) && v) out[k] = String(v).slice(0, 200);
  if (d.pagina) out.pagina_origem = String(d.pagina).slice(0, 200);
  if (d.grupo || d.g) out.grupo_anuncio = String(d.grupo || d.g).slice(0, 100);
  if (d.clique_em) out.clique_em = String(d.clique_em);
  return out;
}
