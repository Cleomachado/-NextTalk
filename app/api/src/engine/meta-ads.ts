// ══ META ADS — métricas de campanha pro nó "Métricas Meta Ads" ══════════════════════════════
// Pedido do dono (13/10/2026): o relatório diário de vendas precisa do GASTO e dos resultados
// das campanhas — e ele roda DOIS tipos: Click-to-WhatsApp (lead cai na API Oficial) e compra
// (checkout Kiwify). O nó consulta a Marketing API (insights da conta de anúncio) e vira tudo
// variável de fluxo ({{ads_gasto}}, {{ads_conversas_iniciadas}}…).
//
// Fatos da API (Marketing API v21.0):
//   · GET /act_{id}/insights?date_preset=today|yesterday&fields=spend,impressions,clicks,actions,
//     action_values,purchase_roas — números chegam como STRING;
//   · conversas iniciadas por anúncio = action_type "onsite_conversion.messaging_conversation_started_7d";
//   · compras = "omni_purchase"/"purchase" (actions = contagem; action_values = valor);
//   · ⚠️ o date_preset usa o FUSO DA CONTA DE ANÚNCIO, não o do servidor — o /testar devolve o
//     timezone_name de propósito, pra divergência não virar mistério;
//   · level=campaign separa o gasto por campanha; "objective" pode vir no formato novo (ODAX:
//     OUTCOME_ENGAGEMENT/OUTCOME_SALES…) ou no legado (MESSAGES/CONVERSIONS).
//
// O TOKEN (permissão ads_read) fica por workspace, cifrado, em Integrações → Meta Ads — ou, se o
// dono preferir, direto no nó (aí fica visível no desenho; o editor avisa).
import { getCachedFor } from "../config-store.js";
import { getCurrentWorkspace } from "../workspace-context.js";
import { decryptSecret } from "../crypto.js";
import { getPrimaryWorkspace } from "../tenancy.js";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface CfgMetaAds { actId: string; token: string }

export function configMetaAdsDoWorkspace(): CfgMetaAds | null {
  const ws = getCurrentWorkspace();
  const c = getCachedFor<{ enc?: string; actId?: string }>(ws, "meta-ads-config");
  const token = c?.enc ? decryptSecret(c.enc) : null;
  const actId = normalizaActId(String(c?.actId ?? ""));
  if (token && actId) return { actId, token };
  // RESERVA DO .env (pedido do dono, 13/10): META_ADS_TOKEN + META_ADS_ACT_ID no deploy/.env.
  // Vale SÓ pro workspace principal — cliente nunca herda a conta de anúncio do dono do sistema.
  // O que estiver salvo em Integrações sempre vence (inclusive o ID da conta, se só ele estiver lá).
  if (ws === getPrimaryWorkspace()) {
    const envTok = String(process.env.META_ADS_TOKEN ?? "").trim();
    const envAct = actId || normalizaActId(String(process.env.META_ADS_ACT_ID ?? ""));
    if (!token && envTok && envAct) return { actId: envAct, token: envTok };
  }
  return null;
}

// Diz de onde veio a credencial (pra tela de Integrações mostrar "usando o token do servidor").
export function origemMetaAds(ws: string): "integracoes" | "env" | null {
  const c = getCachedFor<{ enc?: string; actId?: string }>(ws, "meta-ads-config");
  if (c?.enc && c?.actId) return "integracoes";
  if (ws === getPrimaryWorkspace() && String(process.env.META_ADS_TOKEN ?? "").trim()
    && (c?.actId || String(process.env.META_ADS_ACT_ID ?? "").trim())) return "env";
  return null;
}

// Aceita "act_123", "123" e até a URL do Gerenciador colada inteira.
export function normalizaActId(v: string): string {
  const m = String(v ?? "").match(/act[_=]?(\d{5,20})/) ?? String(v ?? "").match(/(\d{5,20})/);
  return m ? "act_" + m[1] : "";
}

async function graphGet(path: string, token: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    const e = j?.error ?? {};
    throw new Error(traduzErroMeta(e, r.status));
  }
  return j;
}

// Os erros que aparecem de verdade ao montar o token (13/10/2026), em português e com o conserto.
function traduzErroMeta(e: any, http: number): string {
  const cru = String(e?.error_user_msg ?? e?.message ?? `HTTP ${http}`).slice(0, 160);
  const code = Number(e?.code), sub = Number(e?.error_subcode);
  if (code === 190) return `a Meta recusou o token (expirado, revogado ou colado errado). Gere outro no usuário do sistema e cole de novo. [${cru}]`;
  if (code === 100 && sub === 33) return `o token não enxerga essa conta de anúncio. Confira o ID e, no Gerenciador de Negócios, atribua a conta ao usuário do sistema (Usuários do sistema → Atribuir ativos → Contas de anúncios → Ver desempenho). [${cru}]`;
  if ([10, 200, 294].includes(code) || (code >= 200 && code < 300)) return `o token não tem a permissão ads_read. Gere de novo marcando ads_read e read_insights. [${cru}]`;
  if (code === 4 || code === 17 || code === 80004) return `a Meta limitou as consultas por alguns minutos. Tente de novo daqui a pouco. [${cru}]`;
  return cru;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const somaAction = (actions: any[], tipos: string[]) =>
  (Array.isArray(actions) ? actions : []).reduce((s, a) => (tipos.includes(String(a?.action_type)) ? s + num(a?.value) : s), 0);

const ACT_CONVERSA = ["onsite_conversion.messaging_conversation_started_7d"];
const ACT_COMPRA = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

export interface InsightsMetaAds {
  gasto: number; impressoes: number; cliques: number;
  conversasIniciadas: number; compras: number; valorCompras: number;
  roasMeta: number;               // o purchase_roas que a PRÓPRIA Meta atribui
  gastoWhatsApp: number;          // campanhas de conversa (CTWA)
  gastoCompra: number;            // campanhas de venda
  campanhas: number;              // quantas campanhas gastaram no período
}

export async function buscaInsightsMetaAds(cfg: CfgMetaAds, periodo: "hoje" | "ontem"): Promise<InsightsMetaAds> {
  const preset = periodo === "ontem" ? "yesterday" : "today";
  const conta = await graphGet(
    `/${cfg.actId}/insights?date_preset=${preset}&fields=spend,impressions,clicks,actions,action_values,purchase_roas`,
    cfg.token,
  );
  const linha = conta?.data?.[0] ?? {};
  const out: InsightsMetaAds = {
    gasto: num(linha.spend),
    impressoes: num(linha.impressions),
    cliques: num(linha.clicks),
    conversasIniciadas: somaAction(linha.actions, ACT_CONVERSA),
    compras: somaAction(linha.actions, ACT_COMPRA.slice(0, 2)), // omni_purchase já agrega; evitar dupla contagem
    valorCompras: somaAction(linha.action_values, ["omni_purchase"]) || somaAction(linha.action_values, ["purchase"]),
    roasMeta: num((Array.isArray(linha.purchase_roas) ? linha.purchase_roas[0]?.value : linha.purchase_roas)),
    gastoWhatsApp: 0, gastoCompra: 0, campanhas: 0,
  };
  // omni_purchase e purchase costumam ser a MESMA compra vista duas vezes — fica o maior, nunca a soma.
  const omni = somaAction(linha.actions, ["omni_purchase"]);
  const puro = somaAction(linha.actions, ["purchase"]);
  out.compras = Math.max(omni, puro);

  // ── Gasto por TIPO de campanha ────────────────────────────────────────────────────────────
  // Classifica pelo RESULTADO (teve conversa iniciada → WhatsApp; teve compra → venda); o
  // objective só desempata campanha que ainda não converteu nada no período.
  let url: string | null =
    `/${cfg.actId}/insights?level=campaign&date_preset=${preset}&fields=campaign_name,objective,spend,actions&limit=100`;
  for (let pagina = 0; url && pagina < 3; pagina++) {
    const r: any = await graphGet(url, cfg.token);
    for (const c of r?.data ?? []) {
      const gasto = num(c.spend);
      if (!gasto) continue;
      out.campanhas++;
      const obj = String(c.objective ?? "").toUpperCase();
      const ehZap = somaAction(c.actions, ACT_CONVERSA) > 0
        || /OUTCOME_ENGAGEMENT|MESSAGES/.test(obj);
      const ehCompra = somaAction(c.actions, ["omni_purchase", "purchase"]) > 0
        || /OUTCOME_SALES|CONVERSIONS|PRODUCT_CATALOG_SALES/.test(obj);
      if (ehZap && !ehCompra) out.gastoWhatsApp += gasto;
      else if (ehCompra) out.gastoCompra += gasto;
    }
    const prox = String(r?.paging?.next ?? "");
    url = prox ? prox.replace(GRAPH, "").replace(/([?&])access_token=[^&]*/,"$1").replace(/[?&]$/, "") : null;
    if (url && !url.startsWith("/")) url = null; // página fora do Graph = para
  }
  return out;
}

// Prova o token/conta pro botão Testar das Integrações: gasto de hoje + o FUSO da conta.
export async function testarMetaAds(cfg: CfgMetaAds): Promise<{ gastoHoje: number; fuso: string; nome: string }> {
  const conta = await graphGet(`/${cfg.actId}?fields=timezone_name,name`, cfg.token);
  const i = await graphGet(`/${cfg.actId}/insights?date_preset=today&fields=spend`, cfg.token);
  return { gastoHoje: num(i?.data?.[0]?.spend), fuso: String(conta?.timezone_name ?? ""), nome: String(conta?.name ?? "") };
}

// 📊 Insights DIÁRIOS por campanha (Dashboard de Lançamento): time_increment=1 devolve 1 linha por
// campanha por dia. LPV/IC/compras vêm do pixel (offsite_conversion.fb_pixel_*), conversas do CTWA.
export interface LinhaAdsDia {
  data: string; campanha: string; campanhaId: string; objetivo: string;
  gasto: number; impressoes: number; alcance: number; ctrLink: number | null;
  lpv: number; ic: number; compras: number; valor: number; conversas: number;
  cliques: number; video3s: number; thruplay: number;   // hook rate = 3 s ÷ impressões; hold = ThruPlay ÷ 3 s
}
export async function insightsDiariosPorCampanha(cfg: CfgMetaAds, desde: string, ate: string): Promise<LinhaAdsDia[]> {
  const out: LinhaAdsDia[] = [];
  const range = encodeURIComponent(JSON.stringify({ since: desde, until: ate }));
  let url: string | null =
    `/${cfg.actId}/insights?level=campaign&time_increment=1&time_range=${range}` +
    `&fields=campaign_name,campaign_id,objective,spend,impressions,reach,inline_link_click_ctr,inline_link_clicks,video_thruplay_watched_actions,actions,action_values&limit=200`;
  for (let pagina = 0; url && pagina < 10; pagina++) {
    const r: any = await graphGet(url, cfg.token);
    for (const c of r?.data ?? []) {
      out.push({
        data: String(c.date_start), campanha: String(c.campaign_name ?? ""), campanhaId: String(c.campaign_id ?? ""),
        objetivo: String(c.objective ?? ""),
        gasto: num(c.spend), impressoes: num(c.impressions), alcance: num(c.reach),
        ctrLink: c.inline_link_click_ctr != null ? num(c.inline_link_click_ctr) : null,
        lpv: somaAction(c.actions, ["landing_page_view"]),
        ic: somaAction(c.actions, ["offsite_conversion.fb_pixel_initiate_checkout"]) || somaAction(c.actions, ["initiate_checkout"]),
        compras: somaAction(c.actions, ["offsite_conversion.fb_pixel_purchase"]) || somaAction(c.actions, ["purchase"]),
        valor: somaAction(c.action_values, ["offsite_conversion.fb_pixel_purchase"]) || somaAction(c.action_values, ["purchase"]),
        conversas: somaAction(c.actions, ACT_CONVERSA),
        cliques: num(c.inline_link_clicks),
        video3s: somaAction(c.actions, ["video_view"]),
        thruplay: somaAction(c.video_thruplay_watched_actions, ["video_view"]),
      });
    }
    const prox = String(r?.paging?.next ?? "");
    url = prox ? prox.replace(GRAPH, "").replace(/([?&])access_token=[^&]*/, "$1").replace(/[?&]$/, "") : null;
    if (url && !url.startsWith("/")) url = null;
  }
  return out;
}

// 🏆 RANKING DE CRIATIVOS (18/10): as mesmas métricas, mas por ANÚNCIO (level=ad) — o criativo é o
// anúncio. A venda real casa com o anúncio pelo ad_id da sessão da página (checkout_sessions) ou,
// sem ele, pelo utm_content = nome do anúncio.
export interface LinhaAnuncioDia {
  data: string; adId: string; adNome: string; conjunto: string; campanha: string;
  gasto: number; impressoes: number; alcance: number; cliques: number; lpv: number; ic: number;
  compras: number; valor: number; video3s: number; thruplay: number;
}
export async function insightsDiariosPorAnuncio(cfg: CfgMetaAds, desde: string, ate: string): Promise<LinhaAnuncioDia[]> {
  const out: LinhaAnuncioDia[] = [];
  const range = encodeURIComponent(JSON.stringify({ since: desde, until: ate }));
  let url: string | null =
    `/${cfg.actId}/insights?level=ad&time_increment=1&time_range=${range}` +
    `&fields=ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,inline_link_clicks,video_thruplay_watched_actions,actions,action_values&limit=300`;
  for (let pagina = 0; url && pagina < 20; pagina++) {
    const r: any = await graphGet(url, cfg.token);
    for (const c of r?.data ?? []) {
      out.push({
        data: String(c.date_start), adId: String(c.ad_id ?? ""), adNome: String(c.ad_name ?? ""),
        conjunto: String(c.adset_name ?? ""), campanha: String(c.campaign_name ?? ""),
        gasto: num(c.spend), impressoes: num(c.impressions), alcance: num(c.reach), cliques: num(c.inline_link_clicks),
        lpv: somaAction(c.actions, ["landing_page_view"]),
        ic: somaAction(c.actions, ["offsite_conversion.fb_pixel_initiate_checkout"]) || somaAction(c.actions, ["initiate_checkout"]),
        compras: somaAction(c.actions, ["offsite_conversion.fb_pixel_purchase"]) || somaAction(c.actions, ["purchase"]),
        valor: somaAction(c.action_values, ["offsite_conversion.fb_pixel_purchase"]) || somaAction(c.action_values, ["purchase"]),
        video3s: somaAction(c.actions, ["video_view"]),
        thruplay: somaAction(c.video_thruplay_watched_actions, ["video_view"]),
      });
    }
    const prox = String(r?.paging?.next ?? "");
    url = prox ? prox.replace(GRAPH, "").replace(/([?&])access_token=[^&]*/, "$1").replace(/[?&]$/, "") : null;
    if (url && !url.startsWith("/")) url = null;
  }
  return out;
}

// Miniatura + link do criativo de cada anúncio (até 50 ids por chamada). A thumbnail_url da Meta é
// assinada e EXPIRA — por isso é renovada a cada poucas horas, nunca guardada pra sempre.
export interface CriativoAnuncio { adId: string; nome: string; status: string; thumb: string | null; imagem: string | null; videoId: string | null; link: string | null }
export async function criativosDosAnuncios(cfg: CfgMetaAds, ids: string[]): Promise<CriativoAnuncio[]> {
  const out: CriativoAnuncio[] = [];
  // O "?ids=a,b,c" foi desativado pela Meta (v26+, visto em 18/10/2026): agora a busca é na lista de
  // anúncios da PRÓPRIA conta, filtrada pelos ids do lote.
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const campos = "id,name,effective_status,preview_shareable_link,creative.thumbnail_width(480).thumbnail_height(480){thumbnail_url,image_url,video_id,effective_object_story_id,instagram_permalink_url}";
    const filtro = JSON.stringify([{ field: "id", operator: "IN", value: lote }]);
    const r: any = await graphGet(`/${cfg.actId}/ads?fields=${encodeURIComponent(campos)}&filtering=${encodeURIComponent(filtro)}&limit=50`, cfg.token);
    const porId = new Map<string, any>((r?.data ?? []).map((x: any) => [String(x.id), x]));
    for (const id of lote) {
      const a = porId.get(id); if (!a) continue;
      const cr = a.creative ?? {};
      const story = String(cr.effective_object_story_id ?? "");
      const [pg, post] = story.split("_");
      out.push({
        adId: id, nome: String(a.name ?? ""), status: String(a.effective_status ?? ""),
        thumb: cr.thumbnail_url ?? null, imagem: cr.image_url ?? null, videoId: cr.video_id ?? null,
        // ordem: post publicado (Instagram/Facebook, toca o vídeo) → prévia compartilhável do anúncio (fb.me, abre sem login)
        link: cr.instagram_permalink_url ?? (pg && post ? `https://www.facebook.com/${pg}/posts/${post}` : null) ?? (a.preview_shareable_link ? String(a.preview_shareable_link) : null),
      });
    }
  }
  return out;
}
