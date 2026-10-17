// Afiliados self-service — Fase 1: gerador público de página + /promo/<slug>.
// Spec completa (com as armadilhas de produção do produto irmão): docs/afiliados-modulo-spec.md.
//
// A página /promo/<slug> NÃO é uma cópia da página de vendas: o motor baixa o index.html do
// site (cache 60s, guarda o último bom) e troca os 6 checkouts oficiais pelos do afiliado.
// Fonte única — mudou a página de vendas, mudou a promo de todo mundo junto.
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import { LOGO_GOOGLE, LOGO_META, LOGO_TIKTOK } from "./afiliados-logos.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
// Compara hashes em tempo constante (evita side-channel de timing na chave de edição).
function hashIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const SITE_URL = (process.env.SITE_PUBLIC_URL || "https://seudominio.com.br").replace(/\/+$/, "");
// Grupo de afiliados no WhatsApp (mesmo link do afiliados.html) — passo final do gerador.
const GRUPO_AFILIADOS = "https://chat.whatsapp.com/SEU-GRUPO";
// Pasta pública com artes/vídeos prontos pro afiliado divulgar (mantida pelo dono no Drive).
export const DRIVE_CRIATIVOS = "https://drive.google.com/drive/folders/1ElY2Zu6prQouuwwfg72kKtmyhxSgGqGM?usp=drive_link";

// Checkouts OFICIAIS (conferidos na Kiwify em 09/08/2026). MANTER EM SINCRONIA com o objeto
// CHECKOUT do app/site/index.html — o /promo troca ESTAS URLs pelas do afiliado e loga erro
// quando alguma some da página (sinal de que a página mudou e este mapa ficou pra trás).
// ganhoCents = comissão de 50% sobre o líquido após a taxa Kiwify (prints de 09/08/2026).
export const OFERTAS = [
  { key: "link_start", rotulo: "Start mensal", numeros: 1, precoCents: 9_700, ganhoCents: 4_192, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { key: "link_pro", rotulo: "Pro mensal", numeros: 5, precoCents: 14_700, ganhoCents: 6_418, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { key: "link_escala", rotulo: "Escala mensal", numeros: 10, precoCents: 29_700, ganhoCents: 13_093, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { key: "link_start_anual", rotulo: "Start anual", numeros: 1, precoCents: 116_400, ganhoCents: 51_642, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { key: "link_pro_anual", rotulo: "Pro anual", numeros: 5, precoCents: 176_400, ganhoCents: 78_318, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { key: "link_escala_anual", rotulo: "Escala anual", numeros: 10, precoCents: 356_400, ganhoCents: 158_428, oficial: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
] as const;
export type OfertaKey = (typeof OFERTAS)[number]["key"];

export const fmtReais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Slug do nome: minúsculo, sem acento, só a-z0-9-. "João da Silva" → "joao-da-silva".
export function slugDoNome(nome: string): string {
  return nome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Só aceita checkout da Kiwify — sem isso a página vira vitrine de link arbitrário (phishing,
// produto de outro). Host EXATO, https, com caminho.
export function ehCheckoutKiwify(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname === "pay.kiwify.com.br" && u.pathname.length > 1;
  } catch {
    return false;
  }
}

// Telefone BR: 10-11 dígitos ganham DDI 55 na frente; quem já tem DDI fica como está
// (armadilha nº 7 da spec — sem isso o link de WhatsApp nasce quebrado).
export function normalizaTelefoneBR(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export interface PromoRow {
  id: string;
  slug: string;
  nome: string;
  email: string;
  telefone: string;
  whatsapp: string | null;
  link_start: string;
  link_pro: string;
  link_escala: string;
  link_start_anual: string;
  link_pro_anual: string;
  link_escala_anual: string;
  trial_3_dias: boolean;
  whats_flutuante: boolean;
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  google_ads_id: string | null;
  google_ads_label: string | null;
  tiktok_pixel_id: string | null;
  tiktok_access_token: string | null;
}

// A página do afiliado pelo E-MAIL — é a MESMA chave do gerador ("gerar de novo com o mesmo e-mail
// atualiza") e da conta do painel: é este cruzamento que liga a página à aba "Meus sites".
export async function promoPorEmail(email: string): Promise<PromoRow | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const r = await query<PromoRow>("SELECT * FROM affiliate_promo WHERE lower(email)=$1 LIMIT 1", [e]);
  return r[0] ?? null;
}

// Rotaciona a chave de edição e devolve a NOVA (guardamos só o hash). Pro painel LOGADO: sessão
// autenticada com o e-mail dono da página é prova de posse mais forte que a própria chave — vira a
// recuperação de quem perdeu o link de edição. A chave anterior deixa de valer na hora.
export async function novaChaveEdicao(email: string): Promise<string | null> {
  const p = await promoPorEmail(email);
  if (!p) return null;
  const chave = randomBytes(24).toString("base64url");
  await query("UPDATE affiliate_promo SET edit_secret_hash=$2, updated_at=now() WHERE id=$1", [p.id, sha256(chave)]);
  return chave;
}

export async function promoPorSlug(slug: string): Promise<PromoRow | null> {
  const r = await query<PromoRow>("SELECT * FROM affiliate_promo WHERE slug=$1", [slug]);
  return r[0] ?? null;
}

// Os 4 links prontos de divulgação (§4 da spec): o afiliado nunca monta UTM na mão.
// utm_medium=afiliado filtra TODAS as vendas de afiliado; utm_campaign=<slug> diz QUEM trouxe.
export function linksDivulgacao(slug: string): Array<{ rotulo: string; url: string }> {
  const base = `${SITE_URL}/promo/${slug}`;
  return [
    { rotulo: "Link limpo", url: base },
    { rotulo: "Meta (Facebook/Instagram)", url: `${base}?utm_source=FB&utm_medium=afiliado&utm_campaign=${slug}` },
    { rotulo: "Google", url: `${base}?utm_source=google&utm_medium=afiliado&utm_campaign=${slug}` },
    { rotulo: "TikTok", url: `${base}?utm_source=tik-tok&utm_medium=afiliado&utm_campaign=${slug}` },
  ];
}

export interface GerarInput {
  nome: string;
  slug?: string; // "endereço da página" escolhido pelo afiliado; vazio → derivado do nome
  email: string;
  telefone: string; // já normalizado (com DDI)
  links: Record<OfertaKey, string>;
  trial3Dias: boolean;
  whatsFlutuante?: boolean; // bolinha de WhatsApp flutuante na /promo com o número do afiliado
  editKey?: string; // prova de posse pra EDITAR uma página que já existe
  metaPixelId?: string;
  metaCapiToken?: string;
  googleAdsId?: string;
  googleAdsLabel?: string;
  tiktokPixelId?: string;
  tiktokAccessToken?: string;
}

// editKey só é devolvido na CRIAÇÃO (é gerado uma vez; guardamos só o hash). Numa edição, quem
// chama já tem a chave — não reemitimos.
export type UpsertResult =
  | { ok: true; slug: string; atualizada: boolean; editKey: string | null }
  | { ok: false; reason: "need_edit_key" }; // página existe e a chave não confere → 403 na rota

// Upsert POR E-MAIL (regra de ouro §3): mesmo e-mail atualiza a página; o slug só muda se o nome
// mudar. Mas o gerador é PÚBLICO — sem prova de posse, qualquer um reescreveria a página de um
// afiliado conhecido e roubaria a comissão (auditoria 09/08, CRÍTICO). Por isso: criar é livre e
// gera uma CHAVE DE EDIÇÃO secreta (devolvida ao dono); EDITAR uma página existente EXIGE essa
// chave. Sem/errada → recusa (need_edit_key). Colisão de slug com OUTRO e-mail → sufixo -2, -3…
export async function upsertPromo(inp: GerarInput): Promise<UpsertResult> {
  const email = inp.email.trim().toLowerCase();
  const escolhido = slugDoNome(String(inp.slug ?? ""));

  const atual = (await query<PromoRow & { edit_secret_hash: string | null }>("SELECT * FROM affiliate_promo WHERE email=$1", [email]))[0];
  // Endereço: o que o afiliado ESCOLHEU manda. Sem escolha, uma EDIÇÃO mantém o endereço atual
  // (trocar o endereço mata o link já divulgado — só troca quem pede); criação deriva do nome.
  const base = escolhido.length >= 2 ? escolhido : atual ? atual.slug : slugDoNome(inp.nome);
  if (base.length < 2) throw new Error("me diz um nome com pelo menos 2 letras — ele vira o endereço da sua página");
  // EDIÇÃO de página existente: exige a chave certa. (Página antiga sem hash — legado — não pode
  // ser sequestrada às cegas: também exige que o dono peça uma chave via suporte/recuperação.)
  if (atual) {
    const forneceu = String(inp.editKey ?? "").trim();
    if (!forneceu || !atual.edit_secret_hash || !hashIgual(sha256(forneceu), atual.edit_secret_hash)) {
      return { ok: false, reason: "need_edit_key" };
    }
  }

  let slug = base;
  for (let n = 2; n < 100; n++) {
    const dono = (await query<{ email: string }>("SELECT email FROM affiliate_promo WHERE slug=$1", [slug]))[0];
    if (!dono || dono.email === email) break;
    slug = `${base}-${n}`;
  }

  const campos = [
    slug, inp.nome.trim(), email, inp.telefone, inp.telefone,
    inp.links.link_start, inp.links.link_pro, inp.links.link_escala,
    inp.links.link_start_anual, inp.links.link_pro_anual, inp.links.link_escala_anual,
    inp.trial3Dias,
    inp.metaPixelId || null, inp.metaCapiToken || null,
    inp.googleAdsId || null, inp.googleAdsLabel || null,
    inp.tiktokPixelId || null, inp.tiktokAccessToken || null,
    !!inp.whatsFlutuante,
  ];
  if (atual) {
    await query(
      `UPDATE affiliate_promo SET slug=$1, nome=$2, telefone=$4, whatsapp=$5,
         link_start=$6, link_pro=$7, link_escala=$8,
         link_start_anual=$9, link_pro_anual=$10, link_escala_anual=$11,
         trial_3_dias=$12, meta_pixel_id=$13, meta_capi_token=$14,
         google_ads_id=$15, google_ads_label=$16, tiktok_pixel_id=$17, tiktok_access_token=$18,
         whats_flutuante=$19,
         updated_at=now()
       WHERE email=$3`,
      campos,
    );
    return { ok: true, slug, atualizada: true, editKey: null };
  }
  // Criação: gera a chave de edição (o dono guarda; nós só o hash).
  const editKey = randomBytes(24).toString("base64url");
  await query(
    `INSERT INTO affiliate_promo(id, slug, nome, email, telefone, whatsapp,
       link_start, link_pro, link_escala, link_start_anual, link_pro_anual, link_escala_anual,
       trial_3_dias, meta_pixel_id, meta_capi_token, google_ads_id, google_ads_label,
       tiktok_pixel_id, tiktok_access_token, whats_flutuante, edit_secret_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    ["ap_" + randomUUID(), ...campos, sha256(editKey)],
  );
  return { ok: true, slug, atualizada: false, editKey };
}

// ── Render do /promo/<slug> ───────────────────────────────────────────────────
// Baixa a página de vendas oficial (fonte única), com cache de 60s e "último bom" — se o site
// piscar, a promo continua servindo a última versão que funcionou.
let tplCache: { at: number; html: string } | null = null;
async function templateVendas(): Promise<string> {
  if (tplCache && Date.now() - tplCache.at < 60_000) return tplCache.html;
  try {
    const res = await fetch(SITE_URL + "/", { headers: { "user-agent": "zapconverte-promo" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    if (!html.includes("</body>")) throw new Error("template sem </body>");
    tplCache = { at: Date.now(), html };
    return html;
  } catch (e: any) {
    if (tplCache) { tplCache.at = Date.now(); return tplCache.html; } // segura no último bom
    throw new Error("não consegui carregar a página de vendas (" + e.message + ")");
  }
}

// As UTMs (e click IDs) da URL da promo precisam VIAJAR até o checkout (§4): este script roda
// na página e injeta os parâmetros em todo link/objeto de checkout da Kiwify, sem sobrescrever
// parâmetro que o link do afiliado já tenha (o ?afid= fica intacto).
const UTM_SCRIPT = `(function(){try{
var p=new URLSearchParams(location.search);
var ks=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","ttclid","gclid","src","sck"];
var vals={},tem=false;ks.forEach(function(k){var v=p.get(k);if(v){vals[k]=v;tem=true;}});
if(!tem)return;
function ap(url){try{var u=new URL(url);if(u.hostname!=="pay.kiwify.com.br")return url;
Object.keys(vals).forEach(function(k){if(!u.searchParams.has(k))u.searchParams.set(k,vals[k]);});
return u.toString();}catch(e){return url;}}
document.querySelectorAll('a[href*="pay.kiwify.com.br"]').forEach(function(a){a.href=ap(a.href);});
if(window.CHECKOUT)Object.keys(CHECKOUT).forEach(function(m){Object.keys(CHECKOUT[m]||{}).forEach(function(pl){if(CHECKOUT[m][pl])CHECKOUT[m][pl]=ap(CHECKOUT[m][pl]);});});
}catch(e){}})();`;

// Widget do TESTE GRÁTIS (só entra quando o afiliado marcou trial_3_dias): botão flutuante +
// modal com o formulário. Autossuficiente (CSS/JS embutidos, ids prefixados zc-) pra não brigar
// com nada da página de vendas. Sucesso = conta criada → redireciona já LOGADO pro painel.
const TRIAL_WIDGET = `
<style>
#zc-trial-btn{position:fixed;right:18px;bottom:18px;z-index:9990;display:flex;align-items:center;gap:9px;background:linear-gradient(145deg,#25D366,#1EA956);color:#06331B;font-weight:800;font-size:15px;padding:14px 20px;border-radius:999px;border:0;cursor:pointer;box-shadow:0 12px 30px rgba(37,211,102,.45);font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
#zc-trial-btn:hover{transform:translateY(-2px)}
#zc-trial-ov{position:fixed;inset:0;z-index:9991;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:18px;font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
#zc-trial-ov.on{display:flex}
#zc-trial-md{background:#0D1F17;color:#E4F5EC;border:1px solid #16382B;border-radius:18px;max-width:420px;width:100%;padding:24px;position:relative}
#zc-trial-md h3{font-size:20px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
#zc-trial-md .zc-sub{font-size:13.5px;color:#8FB3A4;margin:0 0 16px;line-height:1.5}
#zc-trial-md label{display:block;font-size:13px;font-weight:700;margin:12px 0 5px}
#zc-trial-md input{width:100%;box-sizing:border-box;background:#0A1811;border:1.5px solid #16382B;border-radius:10px;color:#E4F5EC;font-size:14px;padding:11px 12px;outline:none}
#zc-trial-md input:focus{border-color:#25D366}
#zc-trial-go{display:block;width:100%;margin-top:18px;background:linear-gradient(145deg,#25D366,#1EA956);color:#06331B;font-weight:800;font-size:16px;padding:14px;border-radius:12px;border:0;cursor:pointer}
#zc-trial-go:disabled{opacity:.6;cursor:default}
#zc-trial-x{position:absolute;top:10px;right:14px;background:none;border:0;color:#8FB3A4;font-size:24px;cursor:pointer;line-height:1}
#zc-trial-msg{font-size:13px;margin:10px 0 0;display:none;line-height:1.5}
#zc-trial-msg.erro{color:#FF7A6E}
#zc-trial-msg.ok{color:#25D366;font-weight:700}
#zc-trial-hp{position:absolute;left:-9999px;top:-9999px;height:0;overflow:hidden}
</style>
<button id="zc-trial-btn" type="button">🎁 Testar grátis por 3 dias</button>
<div id="zc-trial-ov" role="dialog" aria-modal="true">
  <div id="zc-trial-md">
    <button id="zc-trial-x" type="button" aria-label="Fechar">×</button>
    <h3>Teste o ZapConverte grátis por 3 dias</h3>
    <p class="zc-sub">Sem cartão. Cria sua conta agora e já entra no painel com tudo liberado.</p>
    <form id="zc-trial-f">
      <label for="zc-t-nome">Seu nome</label>
      <input id="zc-t-nome" type="text" maxlength="80" required>
      <label for="zc-t-email">Seu e-mail</label>
      <input id="zc-t-email" type="email" maxlength="120" required>
      <label for="zc-t-tel">Seu WhatsApp (com DDD)</label>
      <input id="zc-t-tel" type="tel" maxlength="20" placeholder="11 91234-5678" required>
      <div id="zc-trial-hp" aria-hidden="true"><input id="zc-t-site" tabindex="-1" autocomplete="off"></div>
      <button id="zc-trial-go" type="submit">Criar minha conta grátis →</button>
      <p id="zc-trial-msg"></p>
    </form>
  </div>
</div>
<script>
(function(){
  var ov=document.getElementById('zc-trial-ov'),btn=document.getElementById('zc-trial-btn');
  var f=document.getElementById('zc-trial-f'),go=document.getElementById('zc-trial-go'),msg=document.getElementById('zc-trial-msg');
  btn.addEventListener('click',function(){ov.classList.add('on');document.getElementById('zc-t-nome').focus();});
  document.getElementById('zc-trial-x').addEventListener('click',function(){ov.classList.remove('on');});
  ov.addEventListener('click',function(e){if(e.target===ov)ov.classList.remove('on');});
  function mostra(t,cls){msg.textContent='';msg.innerHTML=t;msg.className=cls;msg.style.display='block';}
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var p=new URLSearchParams(location.search);
    var body={
      slug:(window.__ZC_PROMO||{}).slug||'',
      nome:document.getElementById('zc-t-nome').value.trim(),
      email:document.getElementById('zc-t-email').value.trim(),
      telefone:document.getElementById('zc-t-tel').value.trim(),
      site:document.getElementById('zc-t-site').value,
      utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',
      utm_campaign:p.get('utm_campaign')||'',utm_content:p.get('utm_content')||'',utm_term:p.get('utm_term')||'',
      pagina:location.href
    };
    go.disabled=true;go.textContent='Criando sua conta…';
    fetch('/public/afiliados/trial',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(r){
        if(!r.ok){mostra(r.d&&r.d.error?r.d.error:'Não deu agora — tenta de novo em instantes.','erro');return;}
        if(r.d.jaTem){mostra('Você já tem conta com esse e-mail — <a href="'+r.d.entrar+'" style="color:#25D366;font-weight:700">entre aqui</a>.','ok');return;}
        mostra('Conta criada! 🎉 Entrando no seu painel…','ok');
        setTimeout(function(){window.location.href=r.d.entrar;},900);
      })
      .catch(function(){mostra('Sem conexão — confere a internet e tenta de novo.','erro');})
      .finally(function(){go.disabled=false;go.textContent='Criar minha conta grátis →';});
  });
})();
</script>`;

// ⚠️ SEGURANÇA (XSS armazenado): o link do afiliado é injetado no HTML da página de vendas —
// dentro de uma string JS de aspas simples no objeto CHECKOUT e, no futuro, em href. `new URL()`
// VALIDA o host mas deixa passar aspas simples literais no caminho: um link
// `https://pay.kiwify.com.br/SEU-CHECKOUT'-alert(1)-'b` fecha a string e executa código. Como o gerador é
// PÚBLICO, qualquer um poderia publicar JS arbitrário em seudominio.com.br. Defesa = escapar na
// SAÍDA: percent-encoda os caracteres que quebram string JS / atributo HTML. Um checkout real da
// Kiwify nunca tem esses caracteres literais, então para links legítimos isto é no-op.
function linkSeguroParaHtml(url: string): string {
  return url.replace(/['"<>`\\\r\n]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

// Bolinha flutuante de WhatsApp do AFILIADO (opt-in dele no gerador). Aparece depois de 30s —
// primeiro a página vende; o botão entra quando o visitante já está engajado. Com o teste grátis
// ligado, o botão fixo do trial já ocupa o canto (bottom:18px) — a bolinha sobe pra cima dele.
function whatsWidget(telefone: string, temTrial: boolean): string {
  const bottom = temTrial ? 84 : 18;
  const msg = encodeURIComponent("Olá! Estou na sua página do ZapConverte e quero tirar uma dúvida.");
  return `
<style>
#zc-whats{position:fixed;right:18px;bottom:${bottom}px;z-index:9989;width:56px;height:56px;border-radius:50%;background:linear-gradient(145deg,#25D366,#1EA956);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px rgba(37,211,102,.45);opacity:0;transform:translateY(16px) scale(.85);pointer-events:none;transition:opacity .45s ease,transform .45s ease}
#zc-whats.on{opacity:1;transform:none;pointer-events:auto}
#zc-whats.on:hover{transform:translateY(-2px)}
#zc-whats svg{width:30px;height:30px;fill:#fff}
</style>
<a id="zc-whats" href="https://wa.me/${telefone}?text=${msg}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 .5C7.4.5.5 7.4.5 16c0 2.7.7 5.4 2 7.7L.5 31.5l8-2.1c2.3 1.2 4.8 1.9 7.5 1.9 8.6 0 15.5-6.9 15.5-15.5S24.6.5 16 .5zm0 28.2c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.2 1.3-4.6-.3-.5c-1.3-2.1-2-4.5-2-7 0-7.2 5.8-13 13-13s13 5.8 13 13-5.9 13-13.1 13zm7.1-9.7c-.4-.2-2.3-1.1-2.7-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.3 1.5-.2.3-.5.3-.9.1-.4-.2-1.6-.6-3.1-1.9-1.1-1-1.9-2.3-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.7.1-.3.1-.5 0-.7-.1-.2-.9-2.1-1.2-2.9-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.7.1-1.1.5-.4.4-1.4 1.4-1.4 3.4s1.5 3.9 1.7 4.2c.2.3 2.9 4.5 7.1 6.3 1 .4 1.8.7 2.4.9 1 .3 1.9.3 2.6.2.8-.1 2.3-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5z"/></svg>
</a>
<script>setTimeout(function(){var b=document.getElementById('zc-whats');if(b)b.classList.add('on');},30000);</script>`;
}

// RASTREIO DO AFILIADO na página dele. O gerador sempre pediu Pixel/Google/TikTok e guardou no
// banco — mas nada era injetado: o afiliado configurava, achava que estava rastreando e **não
// estava** (achado 12/08). Aqui os IDs viram tag de verdade.
// Convivência de pixels: a página herda o pixel do ZapConverte (está no index.html) e SOMA o do
// afiliado — `fbq("init", X)` duas vezes é o jeito suportado; um `track` alimenta os dois.
// Só ID (nada de token da CAPI aqui): token é segredo de servidor e NUNCA vai pro HTML.
function rastreioDoAfiliado(p: PromoRow): string {
  const soId = (v: unknown, max = 40) => String(v ?? "").replace(/[^\w.-]/g, "").slice(0, max); // anti-injeção
  const meta = soId(p.meta_pixel_id);
  const gads = soId(p.google_ads_id);
  const glabel = String(p.google_ads_label ?? "").replace(/[^\w\-/]/g, "").slice(0, 60);
  const tiktok = soId(p.tiktok_pixel_id);
  if (!meta && !gads && !tiktok) return "";
  let s = "\n<script>\n";
  if (meta) {
    s += `try{ if(window.fbq){ fbq("init","${meta}"); fbq("track","PageView"); } else {
      !function(f,b,e,v,n,t,s){n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
      fbq("init","${meta}"); fbq("track","PageView");
      window.zcTrack=window.zcTrack||function(ev,d){try{fbq("track",ev,d||{})}catch(e){}};
    } }catch(e){}\n`;
  }
  if (tiktok) {
    s += `try{ !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=n;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]={};
      var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load("${tiktok}");ttq.page()}(window,document,"ttq") }catch(e){}\n`;
  }
  if (gads) {
    s += `try{ var g=document.createElement("script");g.async=!0;g.src="https://www.googletagmanager.com/gtag/js?id=${gads}";document.head.appendChild(g);
      window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};gtag("js",new Date());gtag("config","${gads}");\n`;
    if (glabel) s += `      window.zcGoogleConv=function(){try{gtag("event","conversion",{send_to:"${gads}/${glabel}"})}catch(e){}};\n`;
    s += `  }catch(e){}\n`;
  }
  // O clique de compra da página chama zcTrack; aqui a gente pendura o Google/TikTok no mesmo gancho.
  s += `try{ var base=window.zcTrack; window.zcTrack=function(ev,d){ try{ base&&base(ev,d); }catch(e){}
    try{ if(ev==="InitiateCheckout"){ window.zcGoogleConv&&window.zcGoogleConv(); if(window.ttq)ttq.track("InitiateCheckout",{value:(d||{}).value,currency:"BRL"}); } }catch(e){} }; }catch(e){}\n`;
  return s + "</script>\n";
}

export async function renderPromo(p: PromoRow): Promise<string> {
  let html = await templateVendas();
  for (const o of OFERTAS) {
    const dele = linkSeguroParaHtml(String(p[o.key] ?? "").trim());
    if (!dele) continue;
    if (!html.includes(o.oficial)) {
      console.error(`promo: checkout oficial "${o.rotulo}" (${o.oficial}) não está na página de vendas — OFERTAS desatualizado?`);
      continue;
    }
    html = html.split(o.oficial).join(dele);
  }
  // A página vive em /promo/<slug> — asset relativo ("foto.jpg", 'sounds/…') resolveria
  // pra /promo/… e daria 404. Vira absoluto, que o nginx do site serve normal.
  html = html.replace(/src="(?!https?:|\/|data:)/g, 'src="/');
  html = html.replace(/new Audio\('(?!https?:|\/)/g, "new Audio('/");
  const marca = JSON.stringify({ slug: p.slug, trial: !!p.trial_3_dias }).replace(/</g, "\\u003c");
  let inj = `\n<script>window.__ZC_PROMO=${marca};</script>\n<script>${UTM_SCRIPT}</script>\n`;
  inj += rastreioDoAfiliado(p);
  if (p.trial_3_dias) inj += TRIAL_WIDGET;
  if (p.whats_flutuante) {
    const telAfiliado = String(p.whatsapp || p.telefone || "").replace(/\D/g, "");
    if (telAfiliado) inj += whatsWidget(telAfiliado, !!p.trial_3_dias);
  }
  // replacement como FUNÇÃO: "$" no replacement de string tem significado especial ($&, $') e
  // um link de afiliado com "$" corromperia a página em silêncio.
  return html.replace("</body>", () => inj + "</body>");
}

// ── Página pública do gerador (/pagina-cadastro-afiliado) ─────────────────────
// Visual da família do site (mesmas cores do afiliados.html). Formulário → POST
// /public/afiliados/gerar → tela de sucesso com a URL + os 4 links de divulgação.
export function paginaGerador(): string {
  // Divisória entre MENSAL e ANUAL: o afiliado desatento colava link de anual em campo de mensal.
  const linhasLinks = OFERTAS.map((o) => `
      ${o.key === "link_start" ? `<div class="grupo-links">Planos mensais <small>· os 3 links do plano MENSAL de cada oferta</small></div>` : ""}
      ${o.key === "link_start_anual" ? `<div class="grupo-links anual">Planos anuais <small>· atenção: daqui pra baixo são os links do plano ANUAL</small></div>` : ""}
      <div class="campo">
        <label for="${o.key}">${o.rotulo} — ${fmtReais(o.precoCents)} · ${o.numeros} número${o.numeros > 1 ? "s" : ""} <span class="ganho">você ganha ${fmtReais(o.ganhoCents)}/venda</span></label>
        <input id="${o.key}" name="${o.key}" type="url" inputmode="url" placeholder="https://pay.kiwify.com.br/… (o SEU link de afiliado)" required>
      </div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gere sua página de afiliado — ZapConverte</title>
<meta name="description" content="Crie em 1 minuto a sua página de vendas do ZapConverte com os seus links de afiliado da Kiwify. 50% de comissão.">
<meta name="robots" content="noindex">
<style>
  :root{--brand:#128C7E;--accent:#25D366;--accent-deep:#1EA956;--bg:#07120D;--surface:#0D1F17;--line:#16382B;--ink:#E4F5EC;--muted:#8FB3A4;--crit:#FF7A6E;
    --sans:-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;padding:34px 18px 70px}
  .wrap{max-width:640px;margin:0 auto}
  .kicker{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);background:rgba(37,211,102,.14);padding:6px 14px;border-radius:30px;margin-bottom:14px}
  h1{font-size:clamp(26px,5vw,36px);letter-spacing:-.02em;line-height:1.15;margin-bottom:10px}
  .sub{color:var(--muted);font-size:15.5px;margin-bottom:28px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px;margin-bottom:16px}
  .card h2{font-size:16px;margin-bottom:14px}
  .campo{margin-bottom:14px}
  .grupo-links{display:flex;align-items:center;gap:10px;margin:18px 0 12px;padding:9px 12px;border-radius:10px;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.45);color:#9FF0C0}
  .grupo-links small{font-weight:600;text-transform:none;letter-spacing:0;font-size:11.5px;color:rgba(228,245,236,.65)}
  .grupo-links.anual{background:rgba(240,194,74,.12);border-color:rgba(240,194,74,.5);color:#F3D9AD}
  label{display:block;font-size:13.5px;font-weight:700;margin-bottom:5px}
  .ganho{font-weight:700;color:var(--accent);font-size:12px}
  input[type=text],input[type=email],input[type=tel],input[type=url]{width:100%;background:#0A1811;border:1.5px solid var(--line);border-radius:10px;color:var(--ink);font-size:14px;padding:11px 12px;outline:none}
  /* Campo do endereço com o domínio embutido (mesma peça do modal do site — as duas telas de
     cadastro têm que ser iguais; esta aqui é a que abre no modo EDIÇÃO). */
  .slugbox{display:flex;align-items:stretch;background:#0A1811;border:1.5px solid var(--line);border-radius:10px;overflow:hidden}
  .slugbox:focus-within{border-color:var(--accent)}
  .slugpre{display:flex;align-items:center;padding:0 1px 0 12px;font-size:12.5px;color:var(--muted);white-space:nowrap;flex:none;user-select:none}
  .slugbox input[type=text]{border:0;border-radius:0;padding-left:1px;flex:1;min-width:0;background:transparent}
  input:focus{border-color:var(--accent)}
  .dica{font-size:12px;color:var(--muted);margin-top:4px}
  .aviso-afiliado{background:rgba(240,194,74,.14);border:1px solid rgba(240,194,74,.4);color:#F3D9AD;font-size:13px;line-height:1.5;border-radius:10px;padding:10px 12px;margin-bottom:12px}
  .aviso-afiliado a{color:var(--accent);font-weight:700}
  .check{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;cursor:pointer}
  .check input{width:17px;height:17px;margin-top:2px;accent-color:var(--accent)}
  details{border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:16px;background:var(--surface)}
  summary{cursor:pointer;font-weight:700;font-size:14px}
  details .campo{margin-top:12px}
  /* Logos das plataformas: cada data URI declarado UMA vez (repetir nos <img> triplicava a página) */
  .plat-ic{display:inline-block;height:20px;width:21px;border-radius:5px;vertical-align:-5px;margin-right:7px;background-size:contain;background-repeat:no-repeat;background-position:center}
  .ic-meta{background-image:url("${LOGO_META}")}
  .ic-google{background-image:url("${LOGO_GOOGLE}")}
  .ic-tiktok{background-image:url("${LOGO_TIKTOK}")}
  .plats{display:inline-flex;gap:6px;margin-left:8px;vertical-align:-4px}
  .plats i{height:19px;width:20px;border-radius:5px}
  .btn{display:block;width:100%;background:linear-gradient(145deg,var(--accent),var(--accent-deep));color:#06331B;font-weight:800;font-size:17px;padding:16px;border-radius:14px;border:0;cursor:pointer;box-shadow:0 10px 26px rgba(37,211,102,.35)}
  .btn:disabled{opacity:.6;cursor:default}
  .erro{color:var(--crit);font-size:13.5px;margin:12px 0 0;display:none}
  .hp{position:absolute;left:-9999px;top:-9999px;height:0;overflow:hidden}
  /* sucesso */
  #ok{display:none}
  .url-box{display:flex;gap:8px;margin:10px 0 4px}
  .url-box input{flex:1;font-size:13px}
  .copiar{background:rgba(37,211,102,.14);border:1px solid rgba(37,211,102,.4);color:var(--accent);font-weight:700;font-size:13px;border-radius:10px;padding:0 14px;cursor:pointer;white-space:nowrap}
  .copiar:hover{background:rgba(37,211,102,.22)}
  .link-linha{display:flex;gap:8px;align-items:center;margin-top:10px}
  .link-linha b{font-size:13px;min-width:180px}
  .link-linha input{flex:1;font-size:12px}
  .aviso{font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.5}
  .abrir{display:inline-block;margin-top:14px;color:var(--accent);font-weight:800;font-size:14.5px;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <span class="kicker">Afiliados ZapConverte · 50% de comissão</span>
  <h1>Gere a sua página de vendas de afiliado</h1>
  <p class="sub">Cole os seus links de afiliado da Kiwify e receba na hora uma página de vendas completa do ZapConverte — com <b>os seus checkouts</b> e links de divulgação prontos com rastreio.</p>

  <form id="f" autocomplete="on">
    <div class="card">
      <h2>Seus dados</h2>
      <div class="campo">
        <label for="nome">Seu nome</label>
        <input id="nome" name="nome" type="text" maxlength="80" placeholder="Ex.: João da Silva" required>
      </div>
      <div class="campo">
        <label for="endereco">Endereço da sua página (o final do link)</label>
        <div class="slugbox">
          <span class="slugpre">seudominio.com.br/promo/</span>
          <input id="endereco" name="slug" type="text" maxlength="60" placeholder="seu-nome" autocomplete="off" spellcheck="false">
        </div>
        <div class="dica">Vem sugerido pelo seu nome — pode aceitar ou trocar. Só letras, números e traço.<b id="slugPrev" style="display:none"></b></div>
      </div>
      <div class="campo">
        <label for="email">Seu e-mail</label>
        <input id="email" name="email" type="email" maxlength="120" placeholder="voce@email.com" required>
      </div>
      <div class="campo">
        <label for="telefone">Seu WhatsApp (com DDD)</label>
        <input id="telefone" name="telefone" type="tel" maxlength="20" placeholder="11 91234-5678" required>
      </div>
      <!-- honeypot: humano não vê nem preenche -->
      <div class="hp" aria-hidden="true"><label>Deixe em branco<input tabindex="-1" id="site" name="site" type="text" autocomplete="off"></label></div>
    </div>

    <div class="card">
      <h2>Seus 6 links de afiliado (Kiwify)</h2>
      <div class="aviso-afiliado">Ainda não é afiliado do ZapConverte? <a href="https://dashboard.kiwify.com/join/affiliate/51lFnv0D" target="_blank" rel="noopener">Cadastre-se como afiliado aqui</a>, pegue seus links na Kiwify e volte pra colar abaixo. 👇</div>
      <div class="dica" style="margin-bottom:12px">Já é afiliado? Na Kiwify: <b>Área de afiliado → ZapConverte → Divulgar</b> — copie o link de checkout de cada plano e cole no campo do preço correspondente.</div>
      ${linhasLinks}
    </div>

    <div class="card">
      <label class="check"><input type="checkbox" id="trial" name="trial">
        <span><b>Minha oferta tem teste grátis de 3 dias</b><br><span class="dica">A sua página mostra o formulário de teste grátis e cada lead que entrar te chega no WhatsApp.</span></span>
      </label>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="whats_flutuante" name="whats_flutuante">
        <span><b>Botão de WhatsApp flutuante com o meu número</b><br><span class="dica">A página mostra uma bolinha do WhatsApp no canto (aparece após 30 segundos) que abre conversa direto no seu número de cima.</span></span>
      </label>
    </div>

    <details>
      <summary>Rastreamento de anúncios (opcional)<span class="plats"><i class="plat-ic ic-meta" title="Meta"></i><i class="plat-ic ic-google" title="Google Ads"></i><i class="plat-ic ic-tiktok" title="TikTok"></i></span></summary>
      <div class="campo"><label for="meta_pixel_id"><i class="plat-ic ic-meta"></i>Meta — Pixel ID</label><input id="meta_pixel_id" name="meta_pixel_id" type="text" maxlength="40"></div>
      <div class="campo"><label for="meta_capi_token"><i class="plat-ic ic-meta"></i>Meta — Token da API de Conversões</label><input id="meta_capi_token" name="meta_capi_token" type="text" maxlength="300"></div>
      <div class="campo"><label for="google_ads_id"><i class="plat-ic ic-google"></i>Google Ads — ID de conversão</label><input id="google_ads_id" name="google_ads_id" type="text" maxlength="40"></div>
      <div class="campo"><label for="google_ads_label"><i class="plat-ic ic-google"></i>Google Ads — Rótulo de conversão</label><input id="google_ads_label" name="google_ads_label" type="text" maxlength="60"></div>
      <div class="campo"><label for="tiktok_pixel_id"><i class="plat-ic ic-tiktok"></i>TikTok — Pixel ID</label><input id="tiktok_pixel_id" name="tiktok_pixel_id" type="text" maxlength="40"></div>
      <div class="campo"><label for="tiktok_access_token"><i class="plat-ic ic-tiktok"></i>TikTok — Access token (Events API)</label><input id="tiktok_access_token" name="tiktok_access_token" type="text" maxlength="300"></div>
    </details>

    <button class="btn" id="enviar" type="submit">Gerar minha página →</button>
    <p class="erro" id="erro"></p>
  </form>

  <div id="ok">
    <div class="card">
      <h2>🎉 Sua página está no ar!</h2>
      <div class="url-box"><input id="okUrl" readonly><button type="button" class="copiar" data-copy="okUrl">Copiar</button></div>
      <a class="abrir" id="okAbrir" target="_blank" rel="noopener">Abrir minha página ↗</a>
      <div class="aviso" id="okAviso"></div>
    </div>
    <div class="card" id="okEditCard" style="display:none;border-color:rgba(240,194,74,.5)">
      <h2>🔑 Seu link para editar depois</h2>
      <div class="dica">Guarde este link com segurança — é a <b>chave</b> pra alterar seus checkouts depois. Sem ele, ninguém (nem você) muda esta página. Também mandamos por e-mail.</div>
      <div class="url-box"><input id="okEdit" readonly><button type="button" class="copiar" data-copy="okEdit">Copiar</button></div>
    </div>
    <div class="card">
      <h2>Links de divulgação com rastreio</h2>
      <div class="dica">Use o link certo pra cada lugar — o relatório mostra de onde veio cada venda. Nunca monte UTM na mão.</div>
      <div id="okLinks"></div>
    </div>
    <div class="card">
      <h2>Criativos prontos pra divulgar</h2>
      <div class="dica" style="margin-bottom:14px">Artes e vídeos já no formato certo — é só baixar, postar e usar o SEU link de divulgação junto.</div>
      <a class="btn" href="${DRIVE_CRIATIVOS}" target="_blank" rel="noopener" style="display:block">Abrir a pasta de criativos (Drive) →</a>
    </div>
    <div class="card" style="text-align:center;background:rgba(37,211,102,.08);border-color:rgba(37,211,102,.4)">
      <h2>Último passo 🎉</h2>
      <div class="dica" style="margin-bottom:14px">Entre no grupo de afiliados pra receber materiais de divulgação, novidades das ofertas e suporte direto.</div>
      <a class="btn" href="${GRUPO_AFILIADOS}" target="_blank" rel="noopener" style="display:block">Entrar no grupo de afiliados →</a>
    </div>
  </div>
</div>

<script>
(function(){
  var f=document.getElementById('f'),erro=document.getElementById('erro'),btn=document.getElementById('enviar');
  var slugPrev=document.getElementById('slugPrev');
  // Modo EDIÇÃO: link "?email=..&k=CHAVE" pré-preenche o e-mail e carrega a chave (nunca vai na
  // tela, só viaja no POST). Sem a chave, o backend recusa alterar uma página existente.
  var qp=new URLSearchParams(location.search), editKey=qp.get('k')||'';
  if(qp.get('email')) document.getElementById('email').value=qp.get('email');
  if(editKey){ btn.textContent='Salvar alterações →'; }
  // Endereço da página: vem SUGERIDO pelo nome enquanto o afiliado não mexer no campo; mexeu, a
  // escolha dele manda (apagar tudo volta a seguir o nome). No modo EDIÇÃO o campo fica quieto:
  // vazio = mantém o endereço já publicado (o backend preserva), preenchido = troca de propósito.
  function limpaEnd(s){ return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60); }
  var endereco=document.getElementById('endereco'), endEditado=!!editKey;
  function prevEnd(){
    var s=limpaEnd(endereco.value)||(editKey?'':limpaEnd(document.getElementById('nome').value));
    slugPrev.textContent=s||(editKey?'(o endereço atual)':'seu-nome');
  }
  if(editKey){ endereco.placeholder='deixe em branco pra manter o endereço atual'; }
  document.getElementById('nome').addEventListener('input',function(){
    if(!endEditado) endereco.value=limpaEnd(this.value);
    prevEnd();
  });
  endereco.addEventListener('input',function(){ endEditado=!!editKey||this.value.trim()!==''; prevEnd(); });
  endereco.addEventListener('blur',function(){ this.value=limpaEnd(this.value); prevEnd(); });
  function mostraErro(m){erro.textContent=m;erro.style.display='block';window.scrollTo({top:erro.offsetTop-200,behavior:'smooth'});}
  f.addEventListener('submit',function(e){
    e.preventDefault();erro.style.display='none';
    var fd=new FormData(f),body={};fd.forEach(function(v,k){body[k]=String(v).trim();});
    body.trial=document.getElementById('trial').checked;
    body.whats_flutuante=document.getElementById('whats_flutuante').checked;
    if(editKey) body.editKey=editKey;
    btn.disabled=true;btn.textContent='Gerando…';
    fetch('/public/afiliados/gerar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(r){
        if(!r.ok){mostraErro(r.d&&r.d.error?r.d.error:'Não deu pra gerar agora — tenta de novo em instantes.');return;}
        f.style.display='none';
        var ok=document.getElementById('ok');ok.style.display='block';
        document.getElementById('okUrl').value=r.d.url;
        document.getElementById('okAbrir').href=r.d.url;
        document.getElementById('okAviso').innerHTML=(r.d.atualizada?'Sua página foi <b>atualizada</b>. ':'')+
          'O endereço da sua página só muda se você preencher o campo "Endereço" com outro valor. '+
          'Ela também fica salva na aba <b>Meus sites</b> do seu painel (<a href="https://painel.seudominio.com.br/meus-sites" target="_blank" rel="noopener">painel.seudominio.com.br</a> — entre com este mesmo e-mail).';
        if(r.d.editUrl){
          document.getElementById('okEditCard').style.display='block';
          document.getElementById('okEdit').value=r.d.editUrl;
        }
        var cont=document.getElementById('okLinks');
        (r.d.links||[]).forEach(function(l,i){
          var linha=document.createElement('div');linha.className='link-linha';
          var b=document.createElement('b');b.textContent=l.rotulo;
          var inp=document.createElement('input');inp.readOnly=true;inp.value=l.url;inp.id='lk'+i;
          var bt=document.createElement('button');bt.type='button';bt.className='copiar';bt.textContent='Copiar';bt.setAttribute('data-copy','lk'+i);
          linha.appendChild(b);linha.appendChild(inp);linha.appendChild(bt);cont.appendChild(linha);
        });
        window.scrollTo({top:0,behavior:'smooth'});
      })
      .catch(function(){mostraErro('Sem conexão com o servidor — confere a internet e tenta de novo.');})
      .finally(function(){btn.disabled=false;btn.textContent='Gerar minha página →';});
  });
  document.addEventListener('click',function(e){
    var alvo=e.target&&e.target.getAttribute&&e.target.getAttribute('data-copy');
    if(!alvo)return;
    var inp=document.getElementById(alvo);inp.select();
    (navigator.clipboard?navigator.clipboard.writeText(inp.value):Promise.reject()).catch(function(){document.execCommand('copy');});
    e.target.textContent='Copiado ✓';setTimeout(function(){e.target.textContent='Copiar';},1500);
  });
})();
</script>
</body>
</html>`;
}
