"use client";

// 📊 DASHBOARD DE LANÇAMENTO DO WORKSHOP — layout de painel de lançamento (fases, progresso diário,
// ROAS do dia × acumulado, esteira, lote, página, hora, faixas de conversão, metas), pedido do dono
// em 18/10 com o PDF de referência. Cada SÁBADO de aula é uma turma: ingressos e bumps vendidos na
// semana + o White Label do pitch daquele sábado.
// Fontes: ads_diario/ads_hora (Meta, a cada 30 min) × kiwify_pedidos (venda REAL, líquido) ×
// checkout_sessions (visitas das páginas) × ws_turmas (metas e comparecimento, digitados aqui).
// Regra da casa: a venda real (Kiwify) vence a atribuição da Meta — ROAS e CPA são os reais.
// Esteira, faixas e regra de turma: lib/workshop-esteira.ts.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { jget, jsend } from "@/lib/client";
import { Linhas } from "@/components/GraficoLinhas";
import LancamentoAbas from "@/components/LancamentoAbas";
import { brl, brlOu, int, pct, xR, diaBR, div, soma, DOW, hojeSP, horaSP, horaDe, useMetaAuto } from "@/lib/lancamento-util";
import {
  ESTEIRA, NOME_ETAPA, etapaDoProduto, ehCampanhaWorkshop, turmaDaVenda, inicioDaTurma, proximoSabado, somaDias,
  ehTrafegoPago, faixaDe, faixaCpm, FAIXAS, type EtapaEsteira, type Faixa,
} from "@/lib/workshop-esteira";

// ── tipos do /admin/lancamento ────────────────────────────────────────────────────────────────
interface LinhaAds {
  data: string; campanha: string; gasto: number; impressoes: number; alcance: number; ctr_link: number | null;
  lpv: number; ic: number; compras: number; valor: number; conversas: number; cliques?: number; video_3s?: number; thruplay?: number;
  fonte: string; atualizado: string;
}
interface Venda {
  fone: string; produto: string; bruto: number; liquido: number | null; utm_source?: string; utm_medium?: string;
  utm_campaign?: string; utm_content?: string; oferta?: string | null; pagamento?: string | null; pagamento_deduzido?: boolean; pagina?: string | null; pagina_inferida?: boolean;
  data: string; quando: string; hora: number; dow: number;
}
interface TurmaCfg {
  turma: string; meta_ingressos: number | null; meta_wl: number | null; meta_investimento: number | null;
  membros_grupo: number | null; pico_live: number | null; ficaram_pitch: number | null; obs: string | null;
}
interface Live { id: string; codigo: string | null; titulo: string | null; inicio: string; fim: string | null; turma: string | null; dia: string; participantes: Array<{ pessoa: string; nome: string | null }> }
interface Dados {
  ads: LinhaAds[]; vendas: Venda[]; turmas?: TurmaCfg[];
  conversas: Array<{ data: string; total: number; anuncio: number }>;
  sessoes?: Array<{ data: string; pagina: string; n: number }>;
  adsHora?: Array<{ ws: boolean; data: string; hora: number; minuto: number; gasto: number }>;
  workshop?: { inicio: string; fim: string; lotes: Array<{ nome: string; precoLabel: string; codigo: string }> };
  disparos: Array<{ id: string; nome: string; total: number; quando: string; data?: string }>; metaAdsConfigurado: boolean;
  // Custo da API do WhatsApp por dia/categoria (pricing_analytics da Meta) e lives do workshop já sincronizadas.
  apiCusto?: Array<{ data: string; categoria: string; qtd: number; custo: number }>;
  lives?: Live[]; meetCode?: string;
  metaAdsErro?: { msg: string; at: string } | null;
}
type VendaT = Venda & { etapa: EtapaEsteira; turma: string; liq: number };
type Filtro = { tipo: "turma" } | { tipo: "hoje" } | { tipo: "ontem" } | { tipo: "dias"; n: number } | { tipo: "todas" } | { tipo: "custom"; de: string; ate: string };

const INICIO_HISTORICO = "2026-08-01";
const ehPix = (p?: string | null) => /pix/i.test(String(p ?? ""));
const ehCartao = (p?: string | null) => /card|cart|credit|visa|master|elo|amex|hiper/i.test(String(p ?? ""));

// ── números de um recorte (vendas + anúncios) ─────────────────────────────────────────────────
// `custoApi` = templates/conversas pagas da API do WhatsApp no mesmo período (disparos, lembretes,
// recuperação): entra no investimento total e no ROAS total, separado do gasto em anúncio.
function numeros(vs: VendaT[], ads: LinhaAds[], visitas: number, custoApi = 0) {
  const por = (e: EtapaEsteira) => vs.filter((v) => v.etapa === e);
  const ing = por("ingresso"), grav = por("gravacao"), vit = por("vitalicio"), wl = por("whitelabel");
  const recWs = soma([...ing, ...grav, ...vit], (v) => v.liq);
  const recWl = soma(wl, (v) => v.liq);
  const gasto = soma(ads, (a) => a.gasto);
  const impr = soma(ads, (a) => a.impressoes), alcance = soma(ads, (a) => a.alcance);
  const cliques = soma(ads, (a) => a.cliques || (a.ctr_link != null ? (a.impressoes * a.ctr_link) / 100 : 0));
  const v3 = soma(ads, (a) => a.video_3s ?? 0), thru = soma(ads, (a) => a.thruplay ?? 0);
  const lpv = soma(ads, (a) => a.lpv), ic = soma(ads, (a) => a.ic);
  return {
    vs, ing, grav, vit, wl, recWs, recWl, recTotal: recWs + recWl, gasto, impr, alcance, cliques, v3, thru, lpv, ic,
    comprasMeta: soma(ads, (a) => a.compras), valorMeta: soma(ads, (a) => a.valor), visitas,
    roasWs: div(recWs, gasto), roasGeral: div(recWs + recWl, gasto),
    cpa: div(gasto, ing.length), ticket: div(recWs, ing.length), custoVisita: div(gasto, visitas),
    custoApi, investTotal: gasto + custoApi, roasTotal: div(recWs + recWl, gasto + custoApi),
    lucro: recWs + recWl - gasto - custoApi,
    exposicao: Math.max(0, gasto + custoApi - recWs - recWl),
    ingPagos: ing.filter((v) => ehTrafegoPago(v.utm_source, v.utm_medium)).length,
  };
}
type Num = ReturnType<typeof numeros>;

export function LancamentoDashboard() {
  const hoje = hojeSP();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [sinc, setSinc] = useState("");
  const [turmaSel, setTurmaSel] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({ tipo: "turma" });
  const [soWorkshop, setSoWorkshop] = useState(true);
  const [copiado, setCopiado] = useState("");
  const [qtdVendas, setQtdVendas] = useState(10);

  async function carregar() {
    try { setD(await jget(`/api/lancamento?de=${INICIO_HISTORICO}&ate=${hojeSP()}`)); setErro(""); }
    catch (e: any) { setErro(e.message); }
  }
  useEffect(() => { void carregar(); const t = setInterval(carregar, 5 * 60_000); return () => clearInterval(t); }, []);
  useMetaAuto(() => void carregar());   // abriu/trocou de aba → Meta dos últimos 3 dias

  async function sincronizar() {
    setSinc("Puxando da Meta…");
    try { const r = await jsend("/api/lancamento/sincronizar", "POST", {}); setSinc(`${r.linhas} linha(s) atualizadas da Meta.`); void carregar(); }
    catch (e: any) { setSinc(e.message); }
  }

  // Vendas classificadas e com a turma de cada uma.
  const base = useMemo(() => {
    if (!d) return null;
    const hIni = Number(String(d.workshop?.inicio ?? "09:00").slice(0, 2)) || 9;
    const hFim = Number(String(d.workshop?.fim ?? "14:00").slice(0, 2)) || 14;
    const vendas: VendaT[] = d.vendas
      .map((v) => {
        const etapa = etapaDoProduto(v.produto);
        return { ...v, etapa, turma: turmaDaVenda(etapa, v.data, v.dow ?? 0, v.hora ?? 12, hIni, hFim, v.utm_campaign), liq: v.liquido ?? v.bruto ?? 0 };
      })
      .filter((v) => v.etapa !== "outro"); // plano do ZapConverte e afins não são do lançamento
    // Sábado depois do fim da aula: a captura que está aberta já é a do sábado seguinte.
    const atual = new Date(hoje + "T12:00:00Z").getUTCDay() === 6 && horaSP() >= hFim ? somaDias(hoje, 7) : proximoSabado(hoje);
    const lista = new Set<string>([atual, ...(d.turmas ?? []).map((t) => t.turma), ...vendas.map((v) => v.turma)]);
    const turmas = [...lista].filter((t) => t <= atual).sort();
    return { vendas, turmas, atual, hIni, hFim, cfgs: new Map((d.turmas ?? []).map((t) => [t.turma, t])) };
  }, [d, hoje]);

  const turma = base ? turmaSel || base.atual : "";
  const turmaAnt = base ? base.turmas[base.turmas.indexOf(turma) - 1] : undefined;
  const cfg = base?.cfgs.get(turma);
  const adsFiltro = (a: LinhaAds) => !soWorkshop || ehCampanhaWorkshop(a.campanha);

  // Intervalo de datas do filtro de cima (a turma usa a regra de turma; os outros, a data da venda).
  const recorte = useMemo(() => {
    if (!base || !d) return null;
    let de = INICIO_HISTORICO, ate = hoje, rot = "";
    const f = filtro;
    if (f.tipo === "turma") { de = inicioDaTurma(turma); ate = turma; rot = `Turma ${diaBR(turma)}`; }
    else if (f.tipo === "hoje") { de = ate = hoje; rot = "Hoje"; }
    else if (f.tipo === "ontem") { de = ate = somaDias(hoje, -1); rot = "Ontem"; }
    else if (f.tipo === "dias") { de = somaDias(hoje, -(f.n - 1)); rot = `${f.n} dias`; }
    else if (f.tipo === "custom") { de = f.de; ate = f.ate; rot = "Personalizado"; }
    else rot = "Todas as turmas";
    const vs = f.tipo === "turma" ? base.vendas.filter((v) => v.turma === turma) : base.vendas.filter((v) => v.data >= de && v.data <= ate);
    const ads = d.ads.filter((a) => adsFiltro(a) && a.data >= de && a.data <= ate);
    const ses = (d.sessoes ?? []).filter((s) => s.data >= de && s.data <= ate);
    const api = (d.apiCusto ?? []).filter((a) => a.data >= de && a.data <= ate);
    return { de, ate, rot, n: numeros(vs, ads, soma(ses, (s) => s.n), soma(api, (a) => a.custo)), ses, api };
  }, [base, d, filtro, turma, soWorkshop, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const nHoje = useMemo(() => {
    if (!base || !d) return null;
    return numeros(base.vendas.filter((v) => v.data === hoje), d.ads.filter((a) => adsFiltro(a) && a.data === hoje),
      soma((d.sessoes ?? []).filter((s) => s.data === hoje), (s) => s.n), soma((d.apiCusto ?? []).filter((a) => a.data === hoje), (a) => a.custo));
  }, [base, d, hoje, soWorkshop]); // eslint-disable-line react-hooks/exhaustive-deps

  const historico = useMemo(() => {
    if (!base || !d) return [];
    return base.turmas.map((t) => {
      const ini = inicioDaTurma(t);
      const api = soma((d.apiCusto ?? []).filter((a) => a.data >= ini && a.data <= t), (a) => a.custo);
      return { t, cfg: base.cfgs.get(t), x: numeros(base.vendas.filter((v) => v.turma === t), d.ads.filter((a) => adsFiltro(a) && a.data >= ini && a.data <= t), 0, api), pres: presencaDaTurma(d.lives ?? [], t) };
    });
  }, [base, d, soWorkshop]); // eslint-disable-line react-hooks/exhaustive-deps

  function copiarResumo() {
    if (!recorte) return;
    const x = recorte.n;
    const linhas = [
      `*Seu Evento · ${recorte.rot}*`,
      ``,
      `Investido em anúncio (Meta): ${brl(x.gasto)} · API do WhatsApp (disparos): ${brl(x.custoApi)} · total ${brl(x.investTotal)}`,
      `Ingressos: ${int(x.ing.length)}${cfg?.meta_ingressos && filtro.tipo === "turma" ? ` de ${int(cfg.meta_ingressos)} (meta)` : ""} · CPA ${brlOu(x.cpa)}`,
      `Gravação: ${int(x.grav.length)} (${pct(div(x.grav.length, x.ing.length))}) · Vitalício: ${int(x.vit.length)}`,
      `White Label: ${int(x.wl.length)}`,
      ``,
      `Receita do workshop: ${brl(x.recWs)} · White Label: ${brl(x.recWl)}`,
      `ROAS do workshop: ${xR(x.roasWs)} · ROAS geral: ${xR(x.roasGeral)} · ROAS total (anúncio + API): ${xR(x.roasTotal)}`,
      `Lucro: ${brl(x.lucro)}`,
    ];
    void navigator.clipboard.writeText(linhas.join("\n")).then(() => { setCopiado("Copiado"); setTimeout(() => setCopiado(""), 2500); });
  }

  const ultimaApi = d?.ads.filter((a) => a.fonte === "api").map((a) => a.atualizado).sort().pop();

  if (!base || !recorte || !nHoje) {
    return <div className="lx"><div className="lx-card">{erro ? <span className="lx-ruim">{erro}</span> : "Carregando…"}</div></div>;
  }
  const n = recorte.n;
  const filtroOn = (f: Filtro) => JSON.stringify(f) === JSON.stringify(filtro);
  const ehTurmaAtual = turma === base.atual;

  return (
    <div className="lx">
      <LancamentoAbas />
      <div className="lx-fixo">
      <Ticker turma={base.atual} hoje={hoje} hFim={base.hFim}
        ingressos={base.vendas.filter((v) => v.turma === base.atual && v.etapa === "ingresso").length}
        hojeIng={base.vendas.filter((v) => v.data === hoje && v.etapa === "ingresso").length}
        meta={base.cfgs.get(base.atual)?.meta_ingressos ?? 0} />
      {/* ── CABEÇALHO + FILTROS ───────────────────────────────────────────── */}
      <div className="lx-topo">
        <div>
          <h1 className="lx-titulo">Turma {diaBR(turma)}</h1>
          <span className={"lx-status " + statusDaTurma(turma, hoje, base.hIni, base.hFim).tom}>{statusDaTurma(turma, hoje, base.hIni, base.hFim).rot}</span>
        </div>
        <div className="lx-filtros">
          <button className={"lx-chip" + (filtro.tipo === "turma" && ehTurmaAtual ? " on" : "")} onClick={() => { setTurmaSel(""); setFiltro({ tipo: "turma" }); }}>Turma atual</button>
          {turmaAnt && <button className={"lx-chip" + (filtro.tipo === "turma" && turma === base.turmas[base.turmas.indexOf(base.atual) - 1] ? " on" : "")}
            onClick={() => { setTurmaSel(base.turmas[base.turmas.indexOf(base.atual) - 1] ?? ""); setFiltro({ tipo: "turma" }); }}>Turma anterior</button>}
          <button className={"lx-chip" + (filtroOn({ tipo: "hoje" }) ? " on" : "")} onClick={() => setFiltro({ tipo: "hoje" })}>Hoje</button>
          <button className={"lx-chip" + (filtroOn({ tipo: "ontem" }) ? " on" : "")} onClick={() => setFiltro({ tipo: "ontem" })}>Ontem</button>
          <button className={"lx-chip" + (filtroOn({ tipo: "dias", n: 7 }) ? " on" : "")} onClick={() => setFiltro({ tipo: "dias", n: 7 })}>7 dias</button>
          <button className={"lx-chip" + (filtroOn({ tipo: "dias", n: 30 }) ? " on" : "")} onClick={() => setFiltro({ tipo: "dias", n: 30 })}>30 dias</button>
          <button className={"lx-chip" + (filtroOn({ tipo: "todas" }) ? " on" : "")} onClick={() => setFiltro({ tipo: "todas" })}>Todas</button>
          <Periodo hoje={hoje} de={filtro.tipo === "custom" ? filtro.de : null} ate={filtro.tipo === "custom" ? filtro.ate : null}
            onChange={(de, ate) => setFiltro({ tipo: "custom", de, ate })} />
          <select className="lx-inp" value={turma} onChange={(e) => { setTurmaSel(e.target.value); setFiltro({ tipo: "turma" }); }} aria-label="Escolher turma">
            {[...base.turmas].reverse().map((t, i) => <option key={t} value={t}>Turma {diaBR(t)} (#{base.turmas.length - i})</option>)}
          </select>
        </div>
      </div>

      </div>
      <div className="lx-barra-info">
        <label className="lx-check"><input type="checkbox" checked={soWorkshop} onChange={(e) => setSoWorkshop(e.target.checked)} /> Só campanhas do workshop</label>
        {d && !d.metaAdsConfigurado
          ? <span className="lx-ruim">Meta Ads sem token. <Link href="/integracoes">Conectar em Integrações</Link></span>
          : <span className="lx-mut">{ultimaApi ? `Meta atualizada ${new Date(ultimaApi).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Meta nunca sincronizada"}</span>}
        <button className="lx-btn" onClick={sincronizar}>Atualizar Meta</button>
        <button className="lx-btn" onClick={copiarResumo}>Copiar resumo pro WhatsApp</button>
        {(sinc || copiado) && <span className="lx-mut">{copiado || sinc}</span>}
      </div>
      {d?.metaAdsErro && (
        <div className="lx-aviso erro">
          <b>A Meta recusou a última sincronização ({new Date(d.metaAdsErro.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}):</b> {d.metaAdsErro.msg}
          {" "}Sem isso, investimento, ROAS, CPA e o ranking de criativos ficam zerados. <Link href="/integracoes">Trocar o token em Integrações → Meta Ads</Link>
        </div>
      )}

      {/* ── FASES DA TURMA ────────────────────────────────────────────────── */}
      <Fases turma={turma} hoje={hoje} hIni={base.hIni} hFim={base.hFim} />

      {/* ── PROGRESSO DIÁRIO ──────────────────────────────────────────────── */}
      <Progresso turma={turma} hoje={hoje} vendas={base.vendas.filter((v) => v.turma === turma && v.etapa === "ingresso")} meta={cfg?.meta_ingressos ?? 0} />

      {/* ── ROAS GERAL (toda a esteira ÷ tudo que foi investido) ──────────── */}
      <RoasGeral x={n} rot={recorte.rot} pres={filtro.tipo === "turma" ? historico.find((h) => h.t === turma)?.pres : undefined} picoManual={filtro.tipo === "turma" ? cfg?.pico_live ?? 0 : 0} />

      {/* ── ROAS HOJE × ACUMULADO ─────────────────────────────────────────── */}
      <CaixaRoas titulo="ROAS do workshop (hoje)" sub={diaBR(hoje)} x={nHoje} cfg={cfg} />
      <CaixaRoas titulo={`ROAS acumulado · ${recorte.rot}`} sub={`${diaBR(recorte.de)} a ${diaBR(recorte.ate)} · investimento e vendas do período`} x={n} cfg={filtro.tipo === "turma" ? cfg : undefined} />

      {/* ── ESTEIRA + PAGAMENTO ───────────────────────────────────────────── */}
      <div className="lx-esteira">
        <div className="lx-prod total"><span className="lx-rot">Total de vendas</span><b>{int(n.vs.length)}</b><small>{brl(n.recTotal)}</small></div>
        <Produto cls="front" tag="Front" nome={ESTEIRA[0].nome} vs={n.ing} base={n.ing.length} />
        <Produto cls="ob1" tag="Order bump 01" nome={ESTEIRA[1].nome} vs={n.grav} base={n.ing.length} />
        <Produto cls="ob2" tag="Order bump 02" nome={ESTEIRA[2].nome} vs={n.vit} base={n.ing.length} />
        <Produto cls="pitch" tag="Pitch" nome={ESTEIRA[3].nome} vs={n.wl} base={n.ing.length} />
      </div>
      <Pagamentos vs={n.vs} />

      {/* ── POR LOTE / POR PÁGINA ─────────────────────────────────────────── */}
      <PorLote vs={n.vs} lotes={d?.workshop?.lotes ?? []} gasto={n.gasto} />
      <PorPagina vs={n.vs} ses={recorte.ses} />

      {/* ── POR HORA (HOJE) ───────────────────────────────────────────────── */}
      <div className="lx-grid2">
        <HoraCpa vendas={base.vendas.filter((v) => v.data === hoje)} snaps={(d?.adsHora ?? []).filter((s) => s.data === hoje && s.ws === soWorkshop)} />
        <HoraFat vendas={base.vendas.filter((v) => v.data === hoje)} snaps={(d?.adsHora ?? []).filter((s) => s.data === hoje && s.ws === soWorkshop)} />
      </div>

      {/* ── VENDAS POR HORA × DIA ─────────────────────────────────────────── */}
      <div className="lx-grid2 lx-g21">
        <Mapa vendas={n.vs.filter((v) => v.etapa !== "whitelabel")} />
        <PorDiaSemana vendas={n.vs.filter((v) => v.etapa === "ingresso")} />
      </div>

      {/* ── MÉTRICAS DA META ──────────────────────────────────────────────── */}
      <Secao titulo="Alcance e engajamento (campanhas do workshop)">
        <Met rot="Impressões" val={int(n.impr)} v={n.impr} />
        <Met rot="Alcance" val={int(n.alcance)} v={n.alcance} dica="Soma do alcance diário (a mesma pessoa em dias diferentes conta de novo)." />
        <Met rot="Hook rate" val={pct(div(n.v3, n.impr), 2)} v={div(n.v3, n.impr)} dica="Viram 3 s do vídeo ÷ impressões." />
        <Met rot="Hold rate" val={pct(div(n.thru, n.v3), 2)} v={div(n.thru, n.v3)} dica="ThruPlay ÷ quem viu 3 s." />
        <Met rot="Frequência" v={div(n.impr, n.alcance)} val={Number.isFinite(div(n.impr, n.alcance)) ? div(n.impr, n.alcance).toFixed(2).replace(".", ",") : "0"} />
      </Secao>
      <Secao titulo="Tráfego (campanhas do workshop)">
        <Met rot="CTR no link" val={pct(div(n.cliques, n.impr), 2)} v={div(n.cliques, n.impr)} faixa={faixaDe("ctr", div(n.cliques, n.impr) * 100)} />
        <Met rot="Cliques no link" val={int(n.cliques)} v={n.cliques} />
        <Met rot="Visualização de página" val={int(n.lpv)} v={n.lpv} />
        <Met rot="Connect rate" val={pct(div(n.lpv, n.cliques), 2)} v={div(n.lpv, n.cliques)} faixa={faixaDe("connect", div(n.lpv, n.cliques) * 100)} dica="Visualizações da página ÷ cliques no link." />
      </Secao>
      <Secao titulo="Conversão (campanhas do workshop)">
        <Met rot="Início de checkout" val={int(n.ic)} v={n.ic} />
        <Met rot="Custo por IC" val={brlOu(div(n.gasto, n.ic))} v={div(n.gasto, n.ic)} />
        <Met rot="CPM" val={brlOu(div(n.gasto * 1000, n.impr))} v={div(n.gasto * 1000, n.impr)} faixa={faixaCpm(div(n.gasto * 1000, n.impr))} dica="Régua da mentoria: CPM que a conta aguenta por ticket. O pitch é o White Label (R$ 697): até R$ 20 está saudável." />
        <Met rot="Investimento" val={brl(n.gasto)} v={n.gasto} />
        <Met rot="CPA (ingresso)" val={brlOu(n.cpa)} v={n.cpa} dica={`Ingressos reais da Kiwify. A Meta atribui ${int(n.comprasMeta)} compra(s).`} />
      </Secao>
      <Secao titulo="Métricas página → conversão" largo>
        <Benchmark rot="Connect rate" v={div(n.lpv, n.cliques) * 100} tipo="connect" />
        <Benchmark rot="% Página → checkout" v={div(n.ic, n.lpv) * 100} tipo="paginaCheckout" />
        <Benchmark rot="% Checkout → compra" v={div(n.ing.length, n.ic) * 100} tipo="checkoutCompra" />
        <Benchmark rot="% Página → compra" v={div(n.ing.length, n.lpv) * 100} tipo="paginaCompra" />
        <div className="lx-met destaque"><span className="lx-rot">CPA (ingresso)</span><b>{brlOu(n.cpa)}</b><small className="lx-mut">compra = ingresso real na Kiwify</small></div>
      </Secao>

      {/* ── EVOLUÇÃO ──────────────────────────────────────────────────────── */}
      <Evolucao vs={n.vs} ads={(d?.ads ?? []).filter((a) => adsFiltro(a) && a.data >= recorte.de && a.data <= recorte.ate)} de={recorte.de} ate={recorte.ate}
        hoje={hoje} snaps={(d?.adsHora ?? []).filter((s) => s.data === recorte.de && s.ws === soWorkshop)} />

      {/* ── METAS + COMPARECIMENTO DA TURMA ───────────────────────────────── */}
      <Metas key={turma + JSON.stringify(cfg ?? {})} turma={turma} cfg={cfg} x={historico.find((h) => h.t === turma)?.x} pres={historico.find((h) => h.t === turma)?.pres} onSalvo={carregar} />

      {/* ── DISPAROS E CUSTO DA API DO WHATSAPP ───────────────────────────── */}
      <DisparosApi disparos={(d?.disparos ?? []).filter((x) => !x.data || (x.data >= recorte.de && x.data <= recorte.ate))} api={recorte.api} rot={recorte.rot} />

      {/* ── CONFIGURAÇÃO DO LANÇAMENTO ────────────────────────────────────── */}
      <Configuracao turma={turma} hIni={d?.workshop?.inicio ?? "09:00"} hFim={d?.workshop?.fim ?? "14:00"} lotes={d?.workshop?.lotes ?? []} />

      {/* ── CAMPANHAS, CRIATIVOS, HISTÓRICO, ÚLTIMAS VENDAS ───────────────── */}
      <Campanhas ads={(d?.ads ?? []).filter((a) => adsFiltro(a) && a.data >= recorte.de && a.data <= recorte.ate)} vs={n.vs} />
      <Criativos vs={n.vs} />
      <Historico linhas={historico} turma={turma} onEscolhe={(t) => { setTurmaSel(t); setFiltro({ tipo: "turma" }); }} />

      <div className="lx-card">
        <div className="lx-card-topo">
          <h3>Últimas vendas ({int(n.vs.length)})</h3>
          <div className="lx-filtros">{[10, 100, 500].map((q) => <button key={q} className={"lx-chip" + (qtdVendas === q ? " on" : "")} onClick={() => setQtdVendas(q)}>{q}</button>)}</div>
        </div>
        {n.vs.length === 0 ? <p className="lx-vazio">Nenhuma venda no período</p> : (
          <div className="lx-tab-wrap">
            <table className="lx-tab">
              <thead><tr><th>Quando</th><th>Produto</th><th>Valor</th><th>Líquido</th><th>Pagamento</th><th>Origem</th><th>Página</th></tr></thead>
              <tbody>
                {[...n.vs].sort((a, b) => b.data.localeCompare(a.data) || b.quando.localeCompare(a.quando)).slice(0, qtdVendas).map((v, i) => (
                  <tr key={i}>
                    <td>{v.quando}</td><td><span className={"lx-tag " + v.etapa}>{NOME_ETAPA[v.etapa]}</span></td><td>{brl(v.bruto || 0)}</td>
                    <td>{v.liquido != null ? brl(v.liquido) : "—"}</td><td>{v.pagamento ? (ehPix(v.pagamento) ? "Pix" : ehCartao(v.pagamento) ? "Cartão" : v.pagamento) : "—"}</td>
                    <td>{[v.utm_source, v.utm_medium, v.utm_content].filter(Boolean).join(" · ") || "—"}</td><td>{v.pagina || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══ peças ════════════════════════════════════════════════════════════════════════════════════

function statusDaTurma(turma: string, hoje: string, hIni: number, hFim: number) {
  const h = horaSP();
  if (hoje < turma) return { rot: "Captura aberta", tom: "azul" };
  if (hoje === turma && h < hIni) return { rot: "Aula hoje", tom: "amarelo" };
  if (hoje === turma && h < hFim) return { rot: "Aula ao vivo agora", tom: "amarelo" };
  if (hoje <= somaDias(turma, 6)) return { rot: "White Label aberto", tom: "verde" };
  return { rot: "Turma encerrada", tom: "cinza" };
}

// Barra das 3 fases: captura (dom → sáb), aula (sáb), White Label (sáb → sex) + marcador de hoje.
function Fases({ turma, hoje, hIni, hFim }: { turma: string; hoje: string; hIni: number; hFim: number }) {
  const ini = inicioDaTurma(turma), fimWl = somaDias(turma, 6);
  const dias = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
  const total = dias(ini, fimWl) + 1;
  const pos = Math.min(100, Math.max(0, ((dias(ini, hoje) + horaSP() / 24) / total) * 100));
  const fases = [
    { rot: "Captura", det: `${diaBR(ini)} → ${diaBR(turma)} ${hIni}h`, tam: 6 + hIni / 24, cor: "azul" },
    { rot: "Aula ao vivo", det: `${diaBR(turma)} · ${hIni}h às ${hFim}h`, tam: (hFim - hIni) / 24 + 0.5, cor: "amarelo" },
    { rot: "White Label", det: `${diaBR(turma)} → ${diaBR(fimWl)}`, tam: 6.5, cor: "verde" },
  ];
  const soma = fases.reduce((s, f) => s + f.tam, 0);
  return (
    <div className="lx-fases">
      <div className="lx-fases-legenda">{fases.map((f) => <span key={f.rot}><i className={f.cor} /> {f.rot}</span>)}</div>
      <div className="lx-fases-barra">
        {fases.map((f) => (
          <div key={f.rot} className={"lx-fase " + f.cor} style={{ flexGrow: f.tam / soma }}>
            <b>{f.rot}</b><small>{f.det}</small>
          </div>
        ))}
        {hoje >= ini && hoje <= fimWl && <span className="lx-hoje" style={{ left: `${pos}%` }} title="agora" />}
      </div>
    </div>
  );
}

// Faixa de ALERTA no topo (turma atual, qualquer filtro): quantos ingressos faltam pra meta e quantos
// dias faltam pro workshop, correndo na horizontal. Parada pra quem pediu menos movimento no sistema.
function Ticker({ turma, hoje, hFim, ingressos, hojeIng, meta }: { turma: string; hoje: string; hFim: number; ingressos: number; hojeIng: number; meta: number }) {
  const dias = Math.round((Date.parse(turma + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86_400_000);
  const itens = [
    dias > 1 ? `Faltam ${dias} dias para o workshop (sábado ${diaBR(turma)})` : dias === 1 ? "O workshop é AMANHÃ, 9h" : horaSP() < hFim ? "O workshop é HOJE, 9h" : `Próximo workshop: sábado ${diaBR(turma)}`,
    meta > 0 ? (ingressos >= meta ? `Meta batida: ${ingressos} de ${meta} ingressos` : `Faltam ${meta - ingressos} ingressos para a meta de ${meta}`) : "Defina a meta de ingressos em Metas da turma",
    `${ingressos} ingresso(s) vendido(s) nesta turma`,
    `${hojeIng} ingresso(s) hoje`,
  ];
  const trilho = itens.map((x, k) => <span key={k}>{x}</span>);
  return (
    <div className="lx-ticker" role="status" aria-label={itens.join(". ")}>
      <div className="lx-ticker-trilho" aria-hidden="true">{trilho}{trilho}</div>
    </div>
  );
}

// Seletor de período no estilo do Meta Ads: 2 meses lado a lado; 1º clique = início, 2º = fim.
// Clicar 2x no MESMO dia = início e fim iguais (pedido do dono, 18/10). Dia futuro não clica.
function Periodo({ hoje, de, ate, onChange }: { hoje: string; de: string | null; ate: string | null; onChange: (de: string, ate: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [ini, setIni] = useState<string | null>(null);
  const [passa, setPassa] = useState<string | null>(null);
  const [mes, setMes] = useState(() => (ate ?? hoje).slice(0, 7));
  const somaMes = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [a, b] = ini ? [ini < (passa ?? ini) ? ini : (passa ?? ini), ini < (passa ?? ini) ? (passa ?? ini) : ini] : [de, ate];
  function clica(dia: string) {
    if (!ini) { setIni(dia); return; }
    const [x, y] = dia < ini ? [dia, ini] : [ini, dia];
    onChange(x, y); setIni(null); setPassa(null); setAberto(false);
  }
  const grade = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const primeiro = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cel: Array<string | null> = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
    return (
      <div className="lx-cal">
        <b className="lx-cal-mes">{NOMES[m - 1]} {y}</b>
        <div className="lx-cal-grade">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => <small key={d}>{d}</small>)}
          {cel.map((dia, k) => dia === null ? <span key={k} /> : (
            <button key={dia} type="button" disabled={dia > hoje}
              className={"lx-cal-dia" + (a && b && dia >= a && dia <= b ? " no" : "") + (dia === a || dia === b ? " ponta" : "") + (dia === hoje ? " hoje" : "")}
              onClick={() => clica(dia)} onMouseEnter={() => ini && setPassa(dia)}>{Number(dia.slice(8))}</button>
          ))}
        </div>
      </div>
    );
  };
  const rot = de && ate ? (de === ate ? diaBR(de) : `${diaBR(de)} – ${diaBR(ate)}`) : "Personalizado";
  return (
    <div className="lx-periodo">
      <button type="button" className={"lx-chip" + (de ? " on" : "")} onClick={() => { setAberto(!aberto); setIni(null); setPassa(null); }} aria-expanded={aberto}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></svg>{rot}
      </button>
      {aberto && (
        <>
          <div className="lx-pop-fundo" onClick={() => { setAberto(false); setIni(null); }} />
          <div className="lx-pop" role="dialog" aria-label="Escolher período">
            <p className="lx-pop-dica">{ini ? `Início ${diaBR(ini)}: clique no dia final (o mesmo dia de novo = só esse dia)` : "Clique na data inicial"}</p>
            <div className="lx-pop-meses">
              <button type="button" className="lx-cal-nav" aria-label="Mês anterior" onClick={() => setMes(somaMes(mes, -1))}>‹</button>
              {grade(somaMes(mes, -1))}
              {grade(mes)}
              <button type="button" className="lx-cal-nav" aria-label="Próximo mês" disabled={mes >= hoje.slice(0, 7)} onClick={() => setMes(somaMes(mes, 1))}>›</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ingressos ACUMULADOS dia a dia × ritmo ideal da meta × projeção no ritmo atual.
function Progresso({ turma, hoje, vendas, meta }: { turma: string; hoje: string; vendas: VendaT[]; meta: number }) {
  const ini = inicioDaTurma(turma);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i));
  const real = dias.map((dia) => (dia > hoje ? null : vendas.filter((v) => v.data <= dia).length));
  const decorridos = dias.filter((x) => x <= hoje).length;
  const atual = vendas.length;
  const ritmo = decorridos ? atual / Math.max(0.5, decorridos - 1 + horaSP() / 24) : 0;
  const proj = dias.map((dia, i) => (dia < hoje ? null : Math.round(atual + ritmo * (i - (decorridos - 1)))));
  const ideal = meta ? dias.map((_, i) => Math.round((meta * (i + 1)) / 7)) : null;
  const encerrada = hoje > turma;
  return (
    <div className="lx-card">
      <div className="lx-card-topo">
        <h3>Progresso diário de ingressos</h3>
        <span className="lx-mut">Vendidos: <b className="lx-forte">{int(atual)}{meta ? `/${int(meta)}` : ""}</b>{meta ? ` (${pct(atual / meta)})` : " · defina a meta em Metas da turma"}</span>
      </div>
      {encerrada && <div className="lx-aviso">Captura encerrada em {diaBR(turma)}. Resultado: {int(atual)}{meta ? ` de ${int(meta)} (${pct(atual / meta)})${atual < meta ? ` · faltaram ${int(meta - atual)} ingressos` : ""}` : " ingressos"}.</div>}
      <Linhas rotulos={dias.map((x) => `${DOW[new Date(x + "T12:00:00Z").getUTCDay()]} ${diaBR(x)}`)} altura={220}
        series={[
          { nome: "Realizado", cor: "#f43f5e", valores: real, area: true },
          ...(ideal ? [{ nome: "Meta ideal", cor: "#94a3b8", valores: ideal, tracejado: true }] : []),
          ...(!encerrada ? [{ nome: "Projeção", cor: "#a855f7", valores: proj, tracejado: true }] : []),
        ]} />
    </div>
  );
}

// ROAS GERAL (pedido do dono, 18/10): o resultado do lançamento inteiro — ingresso + gravação +
// vitalício + White Label do pitch, contra anúncio (Meta) + disparos/recuperação (API do WhatsApp) —
// e as conversões da live (comparecimento, ingresso → WL, presente → WL). Presença: o número digitado
// em Metas vence; sem ele, vem das lives do Meet da turma (sem contar o organizador).
function RoasGeral({ x, rot, pres, picoManual }: { x: Num; rot: string; pres?: Presenca; picoManual: number }) {
  const linha = (nome: string, vs: VendaT[]) => ({ nome, n: vs.length, v: soma(vs, (v) => v.liq) });
  const rec = [linha("Ingressos", x.ing), linha("Gravação", x.grav), linha("Vitalício", x.vit), linha("White Label", x.wl)];
  const total = soma(rec, (r) => r.v), invest = x.gasto + x.custoApi;
  const roas = div(total, invest);
  const presentes = picoManual || pres?.participantes || 0;
  const comp = div(presentes, x.ing.length), ingWl = div(x.wl.length, x.ing.length), presWl = div(x.wl.length, presentes);
  const tom = !invest ? " neutro" : roas >= 1 ? " bom" : " ruim";
  const fComp = presentes ? faixaDe("comparecimento", comp * 100) : null;
  return (
    <div className={"lx-roas lx-roas-geral" + tom}>
      <div className="lx-roas-cab">
        <div><span className="lx-rot">ROAS geral · {rot}</span><small className="lx-mut">tudo que entrou (ingresso + bumps + White Label) ÷ tudo que saiu (anúncio + disparos)</small></div>
        {invest ? <b className="lx-roas-n">{xR(roas)}</b> : <span className="lx-roas-sem">sem investimento no período</span>}
      </div>
      <div className="lx-rg">
        <div className={"lx-rg-col" + (total ? " c-verde" : "")}>
          <span className="lx-rot">Entrou (líquido)</span>
          {rec.map((r) => <div key={r.nome} className={"lx-linha" + (r.n ? "" : " inativo")}><span>{int(r.n)} {r.nome}</span><b>{brl(r.v)}</b></div>)}
          <div className="lx-linha lx-rg-tot"><span>Total</span><b>{brl(total)}</b></div>
        </div>
        <div className={"lx-rg-col" + (!invest ? "" : total - invest >= 0 ? " c-verde" : " c-vermelho")}>
          <span className="lx-rot">Saiu (investido)</span>
          <div className="lx-linha"><span>Anúncios (Meta)</span><b>{brl(x.gasto)}</b></div>
          <div className="lx-linha"><span>Disparos e recuperação (API)</span><b>{brl(x.custoApi)}</b></div>
          <div className="lx-linha lx-rg-tot"><span>Total</span><b>{brl(invest)}</b></div>
          <div className={"lx-linha lx-rg-tot " + (total - invest >= 0 ? "lx-bom" : "lx-ruim")}><span>Lucro</span><b>{brl(total - invest)}</b></div>
        </div>
        <div className={"lx-rg-col" + (fComp ? (fComp.tom === "ruim" || fComp.tom === "pessimo" ? " c-vermelho" : fComp.tom === "ok" ? " c-amarelo" : " c-verde") : "")}>
          <span className="lx-rot">Live</span>
          <div className={"lx-linha" + (presentes ? "" : " inativo")}><span>Na live (sem você)</span><b>{presentes ? int(presentes) : "—"}</b></div>
          <div className={"lx-linha" + (presentes ? "" : " inativo")}><span>Taxa de comparecimento</span><b className={fComp ? (fComp.tom === "ruim" || fComp.tom === "pessimo" ? "lx-ruim" : fComp.tom === "ok" ? "lx-amarelo" : "lx-bom") : ""}>{presentes ? pct(comp, 0) : "—"}</b></div>
          <div className={"lx-linha" + (x.ing.length ? "" : " inativo")}><span>Ingresso → White Label</span><b>{pct(ingWl, 0)}</b></div>
          <div className={"lx-linha" + (presentes ? "" : " inativo")}><span>Presente → White Label</span><b>{presentes ? pct(presWl, 0) : "—"}</b></div>
          <small className="lx-mut">{picoManual ? "presença digitada em Metas" : pres?.participantes ? `presença das lives do Meet (${pres.lives} sessão(ões))` : "sem live da turma: escolha a turma ou digite em Metas"}</small>
        </div>
      </div>
    </div>
  );
}

function CaixaRoas({ titulo, sub, x, cfg }: { titulo: string; sub: string; x: Num; cfg?: TurmaCfg }) {
  const mi = cfg?.meta_investimento ?? 0, mIng = cfg?.meta_ingressos ?? 0;
  // Sem gasto da Meta o ROAS não existe — "0,00x" em vermelho parecia prejuízo (print de 18/10).
  const tom = !x.gasto ? " neutro" : x.roasGeral >= 1 ? " bom" : " ruim";
  return (
    <div className={"lx-roas" + tom}>
      <div className="lx-roas-cab">
        <div><span className="lx-rot">{titulo}</span><small className="lx-mut">{sub}</small></div>
        {x.gasto ? <b className="lx-roas-n">{xR(x.roasWs)}</b> : <span className="lx-roas-sem">sem gasto da Meta<br /><small>ROAS aparece quando a Meta sincronizar</small></span>}
      </div>
      <div className="lx-roas-grid">
        <Cel rot="Receita do workshop (pago)" val={brl(x.recWs)} />
        <Cel rot={`Investimento${mi ? ` (meta ${brl(mi)})` : ""}`} val={brl(x.gasto)} sub={mi ? pct(x.gasto / mi, 0) : undefined} tom={tomMeta(x.gasto, mi, true)} />
        <Cel rot={`Ingressos${mIng ? ` (meta ${int(mIng)})` : ""}`} val={int(x.ing.length)} sub={mIng ? pct(x.ing.length / mIng, 0) : undefined} tom={tomMeta(x.ing.length, mIng)} />
        <Cel rot="Todos os produtos (pago)" val={int(x.vs.length)} />
        <Cel rot="Ticket médio" val={brlOu(x.ticket)} />
        <Cel rot="CPA (ingresso)" val={brlOu(x.cpa)} />
        <Cel rot="Custo por visita real" val={brlOu(x.custoVisita)} sub={`${int(x.visitas)} visitas nas páginas`} />
        <Cel rot="Exposição de caixa" val={brl(x.exposicao)} sub="investido que ainda não voltou" tom={!x.gasto ? "" : x.exposicao > 0 ? " c-vermelho" : " c-verde"} />
        <Cel rot="ROAS geral (com White Label)" val={xR(x.roasGeral)} sub={`Meta atribui ${xR(div(x.valorMeta, x.gasto))}`} tom={tomRoas(x.roasGeral)} />
        <Cel rot="API do WhatsApp (disparos)" val={brl(x.custoApi)} sub="templates pagos no período" />
        <Cel rot="Investimento total" val={brl(x.investTotal)} sub="anúncio + API do WhatsApp" />
        <Cel rot="ROAS total (anúncio + API)" val={xR(x.roasTotal)} sub={`lucro ${brl(x.lucro)}`} tom={tomRoas(x.roasTotal)} />
      </div>
    </div>
  );
}
// Cor do card (régua do card de CTR): " c-verde" | " c-amarelo" | " c-vermelho" | "" (neutro).
function Cel({ rot, val, sub, tom = "" }: { rot: string; val: string; sub?: string; tom?: string }) {
  return <div className={"lx-cel" + tom}><span className="lx-rot">{rot}</span><b>{val}</b>{sub && <small className="lx-mut">{sub}</small>}</div>;
}
// ROAS: verde a partir de 1,5x, amarelo de 1x a 1,5x, vermelho abaixo de 1x (sem gasto = neutro).
const tomRoas = (r: number) => (!Number.isFinite(r) || r === 0 ? "" : r >= 1.5 ? " c-verde" : r >= 1 ? " c-amarelo" : " c-vermelho");
// contra uma meta: batida verde, ≥ 60% amarelo, abaixo vermelho; limite de gasto: estourou vermelho.
const tomMeta = (v: number, meta: number, limite = false) => (!meta ? "" : limite ? (v > meta ? " c-vermelho" : v >= meta * 0.85 ? " c-amarelo" : " c-verde") : v >= meta ? " c-verde" : v >= meta * 0.6 ? " c-amarelo" : " c-vermelho");

function Produto({ cls, tag, nome, vs, base }: { cls: string; tag: string; nome: string; vs: VendaT[]; base: number }) {
  return (
    <div className={"lx-prod " + cls + (vs.length ? "" : " inativo")}>
      <span className="lx-rot">{nome}</span>
      <b>{int(vs.length)}</b>
      <small>{cls === "front" ? "" : `${pct(div(vs.length, base))} dos ingressos · `}{brl(soma(vs, (v) => v.liq))}</small>
      <em>{tag}</em>
    </div>
  );
}

function Pagamentos({ vs }: { vs: VendaT[] }) {
  const pix = vs.filter((v) => ehPix(v.pagamento)), car = vs.filter((v) => ehCartao(v.pagamento));
  const outros = vs.filter((v) => v.pagamento && !ehPix(v.pagamento) && !ehCartao(v.pagamento));
  const sem = vs.length - pix.length - car.length - outros.length;
  const deduz = pix.filter((v) => v.pagamento_deduzido).length;
  return (
    <div className="lx-grid2">
      <div className={"lx-pag pix" + (pix.length ? "" : " inativo")}><span className="lx-rot">Pix</span><b>{int(pix.length)}</b><small>{pct(div(pix.length, vs.length))} do total · {brl(soma(pix, (v) => v.liq))}{deduz ? ` · ${deduz} pelo Pix gerado antes da compra` : ""}</small></div>
      <div className={"lx-pag cartao" + (car.length ? "" : " inativo")}><span className="lx-rot">Cartão</span><b>{int(car.length)}</b><small>{pct(div(car.length, vs.length))} do total · {brl(soma(car, (v) => v.liq))}</small></div>
      {(sem > 0 || outros.length > 0) && <p className="lx-nota" style={{ gridColumn: "1 / -1" }}>{sem > 0 ? `${sem} venda(s) sem forma de pagamento registrada (antes de 18/10 e sem Pix gerado antes da compra: provavelmente cartão).` : ""}{outros.length ? ` ${outros.length} em boleto/outro.` : ""}</p>}
    </div>
  );
}

// Ingresso pelo LOTE (código do checkout da Kiwify; venda antiga sem código cai no lote pelo preço).
function PorLote({ vs, lotes, gasto }: { vs: VendaT[]; lotes: Array<{ nome: string; precoLabel: string; codigo: string }>; gasto: number }) {
  const ing = vs.filter((v) => v.etapa === "ingresso");
  const preco = (l: { precoLabel: string }) => Math.round(Number(String(l.precoLabel).replace(/[^\d,]/g, "").replace(",", ".")) || 0);
  const doLote = (l: (typeof lotes)[number]) => ing.filter((v) => (v.oferta ? v.oferta === l.codigo : Math.round(v.bruto || 0) === preco(l)));
  const fones = (arr: VendaT[]) => new Set(arr.map((v) => v.fone.slice(-10)));
  return (
    <div className="lx-card">
      <h3>Por lote</h3>
      <div className="lx-lotes">
        {lotes.map((l) => {
          const a = doLote(l), f = fones(a);
          const grav = vs.filter((v) => v.etapa === "gravacao" && f.has(v.fone.slice(-10))).length;
          const vit = vs.filter((v) => v.etapa === "vitalicio" && f.has(v.fone.slice(-10))).length;
          return (
            <div key={l.codigo} className={"lx-lote" + (a.length ? "" : " inativo")} title={a.length ? undefined : "Nenhuma venda neste lote no período"}>
              <div className="lx-lote-cab"><b>{l.nome}</b><span>{l.precoLabel}</span></div>
              <Linha rot="Vendas" val={int(a.length)} />
              <Linha rot="Receita líquida" val={brl(soma(a, (v) => v.liq))} />
              <Linha rot="% do total" val={pct(div(a.length, ing.length))} />
              <Linha rot="Levaram a gravação" val={`${grav} (${pct(div(grav, a.length), 0)})`} />
              <Linha rot="Levaram o vitalício" val={`${vit} (${pct(div(vit, a.length), 0)})`} />
              <Linha rot="Checkout" val={l.codigo} />
            </div>
          );
        })}
      </div>
      <p className="lx-nota">CPA geral do período: {brlOu(div(gasto, ing.length))}. A Meta não separa o gasto por lote.</p>
    </div>
  );
}
function Linha({ rot, val }: { rot: string; val: string }) {
  return <div className="lx-linha"><span>{rot}</span><b>{val}</b></div>;
}

// Qual PÁGINA vende mais: visitas (checkout_sessions) × ingressos que vieram dela (src = trk).
function PorPagina({ vs, ses }: { vs: VendaT[]; ses: Array<{ pagina: string; n: number }> }) {
  const pags = new Map<string, { visitas: number; ing: VendaT[]; todos: VendaT[] }>();
  const pega = (p: string) => pags.get(p) ?? { visitas: 0, ing: [], todos: [] };
  for (const s of ses) { if (!/workshop/i.test(s.pagina)) continue; const x = pega(s.pagina); x.visitas += s.n; pags.set(s.pagina, x); }
  for (const v of vs) { if (!v.pagina) continue; const x = pega(v.pagina); x.todos.push(v); if (v.etapa === "ingresso") x.ing.push(v); pags.set(v.pagina, x); }
  const lista = [...pags.entries()].sort((a, b) => b[1].visitas - a[1].visitas);
  if (!lista.length) return null;
  const conv = (x: { visitas: number; ing: VendaT[] }) => div(x.ing.length, x.visitas);
  const melhor = [...lista].sort((a, b) => (conv(b[1]) || 0) - (conv(a[1]) || 0));
  const empate = melhor.length < 2 || (conv(melhor[0][1]) || 0) === (conv(melhor[1][1]) || 0);
  const semPagina = vs.filter((v) => v.etapa === "ingresso" && !v.pagina).length;
  const deduzidas = vs.filter((v) => v.etapa === "ingresso" && v.pagina_inferida).length;
  return (
    <div className="lx-card">
      <h3>Por página de vendas</h3>
      <div className="lx-lotes">
        {lista.map(([p, x]) => (
          <div key={p} className={"lx-lote" + (!empate && melhor[0][0] === p ? " vence" : "")}>
            <div className="lx-lote-cab"><b>{p}</b>{!empate && melhor[0][0] === p && <span>melhor conversão</span>}</div>
            <Linha rot="Visitas" val={int(x.visitas)} />
            <Linha rot="Ingressos" val={int(x.ing.length)} />
            <Linha rot="Conversão" val={pct(conv(x), 2)} />
            <Linha rot="Receita líquida" val={brl(soma(x.todos, (v) => v.liq))} />
            <Linha rot="Bumps por ingresso" val={pct(div(x.todos.filter((v) => v.etapa === "gravacao" || v.etapa === "vitalicio").length, x.ing.length), 0)} />
          </div>
        ))}
      </div>
      <p className="lx-nota">{empate ? "Comparativo: empate. " : ""}Visita = sessão aberta na página. {deduzidas ? `${deduzidas} ingresso(s) com a página deduzida pela visita (mesma campanha e criativo, até 90 min antes da compra). ` : ""}{semPagina ? `${semPagina} ingresso(s) sem página identificada (disparo, X1, link direto do checkout ou venda sem visita registrada).` : ""}</p>
    </div>
  );
}

// Gasto acumulado na hora h = última foto da Meta até h.
function gastoAte(snaps: Array<{ hora: number; minuto: number; gasto: number }>, h: number) {
  let g = 0; for (const s of snaps) if (s.hora <= h) g = s.gasto; return g;
}
function HoraCpa({ vendas, snaps }: { vendas: VendaT[]; snaps: Array<{ hora: number; minuto: number; gasto: number }> }) {
  const agora = horaSP();
  const horas = Array.from({ length: agora + 1 }, (_, h) => h);
  const acum = (e: EtapaEsteira, h: number) => vendas.filter((v) => v.etapa === e && v.hora <= h).length;
  return (
    <div className="lx-card">
      <h3>CPA (ingresso) × ingressos · hoje por hora</h3>
      <Linhas rotulos={horas.map((h) => `${h}h`)} altura={190}
        series={[
          { nome: "CPA (ingresso)", cor: "#3b82f6", valores: horas.map((h) => { const n = acum("ingresso", h); return n ? gastoAte(snaps, h) / n : null; }), moeda: true },
          { nome: "Ingressos", cor: "#22c55e", valores: horas.map((h) => acum("ingresso", h)), eixo2: true },
          { nome: "Gravação", cor: "#eab308", valores: horas.map((h) => acum("gravacao", h)), eixo2: true },
          { nome: "Vitalício", cor: "#f97316", valores: horas.map((h) => acum("vitalicio", h)), eixo2: true },
        ]} />
      {!snaps.length && <p className="lx-nota">O gasto por hora começa a ser gravado a cada sincronização da Meta (30 min).</p>}
    </div>
  );
}
function HoraFat({ vendas, snaps }: { vendas: VendaT[]; snaps: Array<{ hora: number; minuto: number; gasto: number }> }) {
  const agora = horaSP();
  const horas = Array.from({ length: agora + 1 }, (_, h) => h);
  return (
    <div className="lx-card">
      <h3>Faturamento × investimento · hoje por hora</h3>
      <Linhas rotulos={horas.map((h) => `${h}h`)} altura={190}
        series={[
          { nome: "Investimento", cor: "#3b82f6", valores: horas.map((h) => gastoAte(snaps, h)), moeda: true, area: true },
          { nome: "Faturamento", cor: "#22c55e", valores: horas.map((h) => soma(vendas.filter((v) => v.hora <= h), (v) => v.liq)), moeda: true, area: true },
        ]} />
    </div>
  );
}

function Mapa({ vendas }: { vendas: VendaT[] }) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const v of vendas) if (v.dow != null && v.hora != null) m[v.dow][v.hora]++;
  const max = Math.max(1, ...m.flat());
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="lx-card">
      <h3>Vendas por hora</h3>
      <p className="lx-nota" style={{ marginTop: -6 }}>Ingresso + gravação + vitalício</p>
      <div className="lx-mapa">
        <span />
        {Array.from({ length: 24 }, (_, h) => <small key={h}>{h % 3 === 0 ? `${h}h` : ""}</small>)}
        {ordem.map((dw) => (
          <div key={dw} style={{ display: "contents" }}>
            <small>{DOW[dw]}</small>
            {m[dw].map((n, h) => <i key={h} title={`${DOW[dw]} ${h}h: ${n}`} style={{ background: n ? `rgba(244,63,94,${(0.2 + (n / max) * 0.8).toFixed(2)})` : undefined }} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
function PorDiaSemana({ vendas }: { vendas: VendaT[] }) {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const c = ordem.map((dw) => vendas.filter((v) => v.dow === dw).length);
  const max = Math.max(1, ...c);
  return (
    <div className="lx-card">
      <h3>Vendas por dia</h3>
      <p className="lx-nota" style={{ marginTop: -6 }}>Ingressos · total {int(vendas.length)}</p>
      <div className="lx-barras">
        {ordem.map((dw, i) => (
          <div key={dw} className="lx-barra-col" title={`${DOW[dw]}: ${c[i]}`}>
            <span>{c[i]}</span><i style={{ height: `${(c[i] / max) * 100}%` }} /><small>{DOW[dw]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Secao({ titulo, children, largo }: { titulo: string; children: ReactNode; largo?: boolean }) {
  return <div className="lx-secao"><h3>{titulo}</h3><div className={"lx-mets" + (largo ? " largo" : "")}>{children}</div></div>;
}
// Cor do card pela régua (mentoria): verde = bom/ótimo, amarelo = dentro do aceitável, vermelho = ruim.
// Sem dado (zero ou sem divisor) o card fica CINZA, como inativo — "0,00% Horrível" em vermelho
// assustava sem ter acontecido nada.
const corDe = (f?: Faixa | null) => (!f ? "" : f.tom === "otimo" || f.tom === "bom" ? " c-verde" : f.tom === "ok" ? " c-amarelo" : " c-vermelho");
const vazio = (v?: number) => v != null && (!Number.isFinite(v) || v === 0);
function Met({ rot, val, faixa, dica, v }: { rot: string; val: string; faixa?: Faixa | null; dica?: string; v?: number }) {
  const off = vazio(v);
  return (
    <div className={"lx-met" + (off ? " inativo" : corDe(faixa))} title={dica}>
      <span className="lx-rot">{rot}</span><b>{val}</b>{!off && faixa && <em className={"lx-selo " + faixa.tom}>{faixa.rot}</em>}
    </div>
  );
}
function Benchmark({ rot, v, tipo }: { rot: string; v: number; tipo: keyof typeof FAIXAS }) {
  const off = vazio(v);
  const f = off ? null : faixaDe(tipo, v);
  return (
    <div className={"lx-met bench" + (off ? " inativo" : corDe(f))}>
      <span className="lx-rot">{rot}</span>
      <b>{Number.isFinite(v) ? v.toFixed(2).replace(".", ",") + "%" : "0,00%"}</b>
      {f && <em className={"lx-selo " + f.tom}>{f.rot}</em>}
      <ul>{FAIXAS[tipo].map((x) => <li key={x.rot} className={f?.rot === x.rot ? "on" : ""}><span>{x.txt}</span>{x.rot}</li>)}</ul>
    </div>
  );
}

// Investimento × faturamento e a evolução do ROAS. Período de UM dia → por HORA (acumulado no dia,
// gasto pelas fotos de 30 em 30 min da Meta); período maior → por DIA. Com um dia só, por dia
// virava 2 pontinhos soltos (print do dono, 18/10).
function Evolucao({ vs, ads, de, ate, hoje, snaps }: { vs: VendaT[]; ads: LinhaAds[]; de: string; ate: string; hoje: string; snaps: Array<{ hora: number; minuto: number; gasto: number }> }) {
  if (de === ate) {
    const ult = de === hoje ? horaSP() : 23;
    const horas = Array.from({ length: ult + 1 }, (_, h) => h);
    const temSnap = snaps.length > 0;
    const totalDia = soma(ads, (a) => a.gasto);
    const g = horas.map((h) => (temSnap ? gastoAte(snaps, h) : null));
    const f = horas.map((h) => soma(vs.filter((v) => v.hora <= h), (v) => v.liq));
    const roas = horas.map((h, i) => (g[i] ? f[i] / (g[i] as number) : null));
    const rot = horas.map((h) => `${h}h`);
    return (
      <div className="lx-grid2">
        <div className="lx-card"><h3>Investimento × faturamento · {diaBR(de)} por hora</h3>
          <Linhas rotulos={rot} altura={200} series={[
            { nome: "Investimento", cor: "#3b82f6", valores: g, moeda: true, area: true },
            { nome: "Faturamento líquido", cor: "#22c55e", valores: f, moeda: true, area: true },
          ]} />
          {!temSnap && <p className="lx-nota">O gasto hora a hora só existe pra hoje e ontem (fotos da Meta a cada 30 min). Gasto total do dia: {brl(totalDia)}.</p>}
        </div>
        <div className="lx-card"><h3>Evolução do ROAS · {diaBR(de)} por hora</h3>
          <Linhas rotulos={rot} altura={200} series={[{ nome: "ROAS", cor: "#eab308", valores: roas, area: true, sufixo: "x" }]} linhaEm={1} />
        </div>
      </div>
    );
  }
  const dias: string[] = [];
  const primeiro = [...vs.map((v) => v.data), ...ads.map((a) => a.data)].sort()[0] ?? de;
  for (let x = primeiro < de ? de : primeiro; x <= ate && dias.length < 120; x = somaDias(x, 1)) dias.push(x);
  const g = dias.map((x) => soma(ads.filter((a) => a.data === x), (a) => a.gasto));
  const f = dias.map((x) => soma(vs.filter((v) => v.data === x), (v) => v.liq));
  let ag = 0, af = 0;
  const roas = dias.map((_, i) => { ag += g[i]; af += f[i]; return ag ? af / ag : null; });
  return (
    <div className="lx-grid2">
      <div className="lx-card"><h3>Investimento × faturamento · por dia</h3>
        <Linhas rotulos={dias.map(diaBR)} altura={200} series={[
          { nome: "Investimento", cor: "#3b82f6", valores: g, moeda: true },
          { nome: "Faturamento líquido", cor: "#22c55e", valores: f, moeda: true },
        ]} />
      </div>
      <div className="lx-card"><h3>Evolução do ROAS (acumulado) · por dia</h3>
        <Linhas rotulos={dias.map(diaBR)} altura={200} series={[{ nome: "ROAS", cor: "#eab308", valores: roas, area: true, sufixo: "x" }]} linhaEm={1} />
      </div>
    </div>
  );
}

// ── presença por turma ────────────────────────────────────────────────────────────────────────
// União dos participantes de todas as lives do sábado da turma (manhã + tarde) menos 1 — quem
// organiza a sala está em todas. `lives.turma` marcada à mão vence; senão: live de sábado é daquele
// sábado, de outro dia é da próxima aula (mesma regra de /lancamento/live-metricas).
type Presenca = { lives: number; participantes: number; porLive: Array<{ titulo: string; hora: string; n: number }> };
function presencaDaTurma(lives: Live[], turma: string): Presenca {
  const das = lives.filter((l) => {
    const dow = new Date(l.dia + "T12:00:00Z").getUTCDay();
    return (l.turma ?? (dow === 6 ? l.dia : proximoSabado(l.dia))) === turma;
  });
  const ids = new Set<string>();
  das.forEach((l) => l.participantes.forEach((p) => ids.add(p.pessoa)));
  return {
    lives: das.length, participantes: Math.max(0, ids.size - 1),
    porLive: das.map((l) => ({ titulo: l.titulo ?? "Live", hora: horaDe(l.inicio), n: Math.max(0, l.participantes.length - 1) })),
  };
}

// ── disparos e custo da API do WhatsApp no período ────────────────────────────────────────────
const NOME_CAT: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação", SERVICE: "Serviço (grátis)", REFERRAL_CONVERSION: "Clique no anúncio (grátis)" };
function DisparosApi({ disparos, api, rot }: { disparos: Array<{ id: string; nome: string; total: number; quando: string }>; api: Array<{ categoria: string; qtd: number; custo: number }>; rot: string }) {
  const cats = new Map<string, { qtd: number; custo: number }>();
  for (const a of api) { const c = cats.get(a.categoria) ?? { qtd: 0, custo: 0 }; c.qtd += a.qtd; c.custo += a.custo; cats.set(a.categoria, c); }
  const total = soma(api, (a) => a.custo), msgs = soma(api, (a) => a.qtd);
  return (
    <div className="lx-card">
      <div className="lx-card-topo">
        <h3>Disparos e recuperação · API do WhatsApp · {rot}</h3>
        <span className="lx-mut">custo por uso informado pela Meta; a fatura do cartão fecha por limite e pode diferir alguns reais</span>
      </div>
      <div className="lx-metas-grid">
        <MetaCard rot="Custo da API no período" v={total} fmt={brl} sub={`${int(msgs)} mensagens contadas pela Meta`} />
        {[...cats.entries()].filter(([, c]) => c.custo > 0 || c.qtd > 0).sort((a, b) => b[1].custo - a[1].custo).map(([k, c]) => (
          <MetaCard key={k} rot={NOME_CAT[k] ?? k} v={c.custo} fmt={brl} sub={`${int(c.qtd)} mensagens`} />
        ))}
        <MetaCard rot="Disparos em massa" v={disparos.length} fmt={int} sub={disparos.length ? `${int(soma(disparos, (x) => x.total))} contatos no total` : "nenhum disparo no período"} />
      </div>
      {disparos.length > 0 && (
        <div className="lx-tab-wrap"><table className="lx-tab">
          <thead><tr><th>Quando</th><th>Disparo</th><th>Contatos</th></tr></thead>
          <tbody>{disparos.map((x) => <tr key={x.id}><td>{x.quando}</td><td>{x.nome}</td><td>{int(x.total)}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="lx-nota">Quem clicou nos botões de cada disparo está em Disparador → Em andamento → Métricas.</p>
    </div>
  );
}

function Metas({ turma, cfg, x, pres, onSalvo }: { turma: string; cfg?: TurmaCfg; x?: Num; pres?: Presenca; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => {
    const v = (k: keyof TurmaCfg) => (cfg?.[k] != null ? String(cfg[k]) : "");
    return { meta_ingressos: v("meta_ingressos"), meta_wl: v("meta_wl"), meta_investimento: v("meta_investimento"),
      membros_grupo: v("membros_grupo"), pico_live: v("pico_live"), ficaram_pitch: v("ficaram_pitch"), obs: v("obs") };
  });
  const [msg, setMsg] = useState("");
  async function salvar() {
    setMsg("Salvando…");
    try { await jsend("/api/lancamento/turma", "PUT", { turma, ...f }); setMsg("Salvo."); setEditando(false); onSalvo(); }
    catch (e: any) { setMsg(e.message); }
  }
  const n = (k: string) => Number(f[k]) || 0;
  const ing = x?.ing.length ?? 0, wl = x?.wl.length ?? 0, gasto = x?.gasto ?? 0;
  const wlLive = x?.wl.filter((v) => v.data === v.turma).length ?? 0;  // fechado no próprio sábado da aula
  // Compareceram: automático das lives sincronizadas (união de manhã + tarde, sem contar quem organiza);
  // o número digitado em Editar vence (aula fora do Meet, CSV, correção à mão).
  const auto = pres?.participantes ?? 0;
  const naLive = n("pico_live") || auto;
  const fonteLive = n("pico_live") ? "digitado em Editar" + (auto ? ` · Meet contou ${int(auto)}` : "")
    : auto ? `Meet: ${pres!.porLive.map((l) => `${int(l.n)} às ${l.hora}`).join(" · ")}` : "preencha em Editar ou sincronize o Meet em Métricas da live";
  const presenca = div(naLive, ing);
  const campo = (k: string, rot: string, tipo = "number") => (
    <label className="lx-campo"><span>{rot}</span>
      <input className="lx-inp" type={tipo} min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="lx-card lx-metas">
      <div className="lx-card-topo">
        <h3>Metas da turma {diaBR(turma)}</h3>
        <button className="lx-btn" onClick={() => setEditando(!editando)}>{editando ? "Fechar" : "Editar"}</button>
      </div>
      {editando && (
        <div className="lx-edita">
          <div className="lx-campos">
            {campo("meta_ingressos", "Meta de ingressos")}
            {campo("meta_wl", "Meta de White Label")}
            {campo("meta_investimento", "Limite de investimento (R$)")}
            {campo("membros_grupo", "Entraram no grupo de alunos")}
            {campo("pico_live", "Pico ao vivo no Meet")}
            {campo("ficaram_pitch", "Ficaram até o pitch")}
          </div>
          {campo("obs", "Observação da turma", "text")}
          <div className="lx-barra-info"><button className="lx-btn primario" onClick={salvar}>Salvar</button>{msg && <span className="lx-mut">{msg}</span>}</div>
        </div>
      )}
      <div className="lx-metas-grid">
        <MetaCard rot="Vendas White Label (pitch)" v={wl} meta={n("meta_wl")} fmt={int} />
        <MetaCard rot="Investimento" v={gasto} meta={n("meta_investimento")} fmt={brl} limite />
        <MetaCard rot="Ingressos (tráfego pago)" v={x?.ingPagos ?? 0} fmt={int} sub={`${int(ing - (x?.ingPagos ?? 0))} de disparo, orgânico ou X1`} />
        <MetaCard rot="Ingressos geral (pago + orgânico)" v={ing} meta={n("meta_ingressos")} fmt={int} />
        <MetaCard rot="ROAS médio (geral)" v={x?.roasGeral ?? NaN} fmt={xR} />
      </div>
      <h3 style={{ marginTop: 18 }}>Comparecimento</h3>
      <div className="lx-metas-grid">
        <MetaCard rot="Entraram no grupo" v={n("membros_grupo")} fmt={int} sub={n("membros_grupo") ? `${pct(div(n("membros_grupo"), ing))} dos ingressos` : "preencha em Editar"} />
        <MetaCard rot="Na live (sem contar você)" v={naLive} fmt={int} sub={`${naLive ? `de ${int(ing)} ingressos · ` : ""}${fonteLive}`} />
        <MetaCard rot="Taxa de comparecimento" v={presenca} fmt={(v) => pct(v)} faixa={naLive ? faixaDe("comparecimento", presenca * 100) : null}
          sub="ideal: acima de 50% de quem comprou" />
        <MetaCard rot="Ingresso → White Label" v={div(wl, ing)} fmt={(v) => pct(v)} sub={`${int(wl)} White Label ÷ ${int(ing)} ingressos da turma`} />
        <MetaCard rot="Presente → White Label" v={div(wl, naLive)} fmt={(v) => pct(v)} sub={naLive ? `${int(wl)} White Label ÷ ${int(naLive)} na live` : "precisa do número de presentes"} />
        <MetaCard rot="Ficaram até o pitch" v={n("ficaram_pitch")} fmt={int} sub={n("ficaram_pitch") && naLive ? `${pct(div(n("ficaram_pitch"), naLive))} de quem estava na live` : "preencha em Editar"} />
        <MetaCard rot="Conversão do pitch" v={div(wlLive, n("ficaram_pitch"))} fmt={(v) => pct(v)} sub={`${int(wlLive)} White Label ao vivo ÷ quem ficou até o pitch`} />
      </div>
      {cfg?.obs && <p className="lx-nota">{cfg.obs}</p>}
    </div>
  );
}
function MetaCard({ rot, v, meta, fmt, sub, limite, faixa }: { rot: string; v: number; meta?: number; fmt: (n: number) => string; sub?: string; limite?: boolean; faixa?: Faixa | null }) {
  const p = meta ? v / meta : NaN;
  const txt = !meta ? sub : limite ? (p >= 1 ? "Limite atingido" : `Sobra ${fmt(meta - v)}`) : p >= 1 ? "Meta batida" : `Falta ${fmt(meta - v)}`;
  // meta: verde batida, amarelo no caminho (≥ 60%), vermelho longe; limite de gasto: vermelho ao estourar.
  const tom = faixa ? corDe(faixa)
    : !meta ? "" : limite ? (p >= 1 ? " c-vermelho" : p >= 0.85 ? " c-amarelo" : " c-verde") : p >= 1 ? " c-verde" : p >= 0.6 ? " c-amarelo" : " c-vermelho";
  const off = !meta && vazio(v);
  return (
    <div className={"lx-metacard" + (off ? " inativo" : tom)}>
      <span className="lx-rot">{rot}</span>
      <b>{Number.isFinite(v) ? fmt(v) : "—"}</b>
      {faixa && !off && <em className={"lx-selo " + faixa.tom}>{faixa.rot}</em>}
      {meta ? <small className="lx-mut">Meta: {fmt(meta)}</small> : null}
      {meta ? <div className="lx-prog"><i style={{ width: `${Math.min(100, (p || 0) * 100)}%` }} /></div> : null}
      {meta ? <small className="lx-mut">{pct(p, 0)} · {txt}</small> : txt ? <small className="lx-mut">{txt}</small> : null}
    </div>
  );
}

function Configuracao({ turma, hIni, hFim, lotes }: { turma: string; hIni: string; hFim: string; lotes: Array<{ nome: string; precoLabel: string; codigo: string }> }) {
  const ini = inicioDaTurma(turma);
  const marcos = [
    { rot: "Início da captura", data: diaBR(ini), det: "domingo" },
    ...lotes.map((l) => ({ rot: l.nome, data: l.precoLabel, det: `checkout ${l.codigo}` })),
    { rot: "Aula ao vivo", data: diaBR(turma), det: `${hIni} às ${hFim} · Google Meet` },
    { rot: "Pitch do White Label", data: diaBR(turma), det: "no fim da aula + 17h pelo WhatsApp" },
    { rot: "Fim da janela do White Label", data: diaBR(somaDias(turma, 6)), det: "sexta" },
  ];
  return (
    <div className="lx-card lx-config">
      <h3>Configuração do lançamento</h3>
      <div className="lx-timeline">
        {marcos.map((m) => <div key={m.rot + m.data} className="lx-marco"><span className="lx-rot">{m.rot}</span><b>{m.data}</b><small className="lx-mut">{m.det}</small></div>)}
      </div>
      <p className="lx-nota">Os lotes viram por vagas vendidas (não por data). Lotes, horários e checkouts mudam na configuração do Workshop no motor; o produto e os bumps estão em lib/workshop-esteira.ts.</p>
    </div>
  );
}

function Campanhas({ ads, vs }: { ads: LinhaAds[]; vs: VendaT[] }) {
  const camp = new Map<string, { gasto: number; impr: number; cliques: number; lpv: number; ic: number; compras: number; reais: number; liq: number }>();
  const pega = (k: string) => camp.get(k) ?? { gasto: 0, impr: 0, cliques: 0, lpv: 0, ic: 0, compras: 0, reais: 0, liq: 0 };
  for (const a of ads) {
    const x = pega(a.campanha);
    x.gasto += a.gasto; x.impr += a.impressoes; x.cliques += a.cliques || (a.ctr_link != null ? (a.impressoes * a.ctr_link) / 100 : 0);
    x.lpv += a.lpv; x.ic += a.ic; x.compras += a.compras; camp.set(a.campanha, x);
  }
  const nomes = new Map([...camp.keys()].map((k) => [k.trim().toLowerCase(), k]));
  for (const v of vs) {
    if (v.etapa !== "ingresso" || !v.utm_campaign) continue;
    const k = nomes.get(v.utm_campaign.trim().toLowerCase());
    if (!k) continue;
    const x = pega(k); x.reais++; x.liq += v.liq; camp.set(k, x);
  }
  const lista = [...camp.entries()].filter(([, x]) => x.gasto > 0 || x.reais > 0).sort((a, b) => b[1].gasto - a[1].gasto);
  if (!lista.length) return null;
  return (
    <div className="lx-card">
      <h3>Campanhas: Meta × ingresso real</h3>
      <div className="lx-tab-wrap">
        <table className="lx-tab">
          <thead><tr><th>Campanha</th><th>Investido</th><th>CTR</th><th>LPV</th><th>IC</th><th>Compras Meta</th><th>Ingressos reais</th><th>CPA real</th><th>ROAS real</th></tr></thead>
          <tbody>
            {lista.map(([nome, x]) => (
              <tr key={nome}>
                <td>{nome}</td><td>{brl(x.gasto)}</td><td>{x.impr ? pct(x.cliques / x.impr, 2) : "—"}</td>
                <td>{int(x.lpv)}</td><td>{int(x.ic)}</td><td>{int(x.compras)}</td><td><b>{int(x.reais)}</b></td>
                <td>{x.reais ? brl(x.gasto / x.reais) : "—"}</td><td>{x.gasto ? xR(x.liq / x.gasto) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lx-nota">Ingresso real = pedido da Kiwify com utm_campaign igual ao nome da campanha.</p>
    </div>
  );
}

// Criativos pela UTM REAL (utm_content). Bumps e White Label seguem a origem do ingresso da pessoa.
function Criativos({ vs }: { vs: VendaT[] }) {
  const rot = (v: Venda) => (v.utm_source || v.utm_content || v.utm_campaign
    ? [v.utm_content || "(sem criativo)", v.utm_campaign || v.utm_medium || v.utm_source].filter(Boolean).join(" · ") : "sem UTM");
  const origem = new Map<string, string>();
  for (const v of vs) if (v.etapa === "ingresso" && v.fone) origem.set(v.fone.slice(-10), rot(v));
  const m = new Map<string, { ing: number; bump: number; wl: number; liq: number }>();
  for (const v of vs) {
    const k = v.etapa === "ingresso" ? rot(v) : origem.get(v.fone.slice(-10)) ?? rot(v);
    const x = m.get(k) ?? { ing: 0, bump: 0, wl: 0, liq: 0 };
    if (v.etapa === "ingresso") x.ing++; else if (v.etapa === "whitelabel") x.wl++; else x.bump++;
    x.liq += v.liq; m.set(k, x);
  }
  const lista = [...m.entries()].sort((a, b) => b[1].liq - a[1].liq);
  if (!lista.length) return null;
  return (
    <div className="lx-card">
      <h3>Criativos e origens que venderam (UTM real da Kiwify)</h3>
      <div className="lx-tab-wrap">
        <table className="lx-tab">
          <thead><tr><th>Criativo · campanha</th><th>Ingressos</th><th>Bumps</th><th>White Label</th><th>Líquido gerado</th></tr></thead>
          <tbody>{lista.map(([k, x]) => <tr key={k}><td>{k}</td><td>{int(x.ing)}</td><td>{int(x.bump)}</td><td>{int(x.wl)}</td><td>{brl(x.liq)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="lx-nota">Anúncios com o mesmo nome aparecem juntos: dê nome único a cada criativo.</p>
    </div>
  );
}

function Historico({ linhas, turma, onEscolhe }: { linhas: Array<{ t: string; cfg?: TurmaCfg; x: Num }>; turma: string; onEscolhe: (t: string) => void }) {
  return (
    <div className="lx-card">
      <h3>Turma a turma</h3>
      <div className="lx-tab-wrap">
        <table className="lx-tab">
          <thead><tr><th>Turma</th><th>Investido</th><th>Ingressos</th><th>Meta</th><th>Gravação</th><th>Vitalício</th><th>White Label</th><th>Receita</th><th>Lucro</th><th>ROAS ws</th><th>ROAS geral</th><th>CPA</th><th>Grupo</th><th>Pico</th><th>Pitch</th></tr></thead>
          <tbody>
            {[...linhas].reverse().map(({ t, cfg, x }) => (
              <tr key={t} className={t === turma ? "on" : ""} onClick={() => onEscolhe(t)}>
                <td>{diaBR(t)}</td><td>{brl(x.gasto)}</td><td>{int(x.ing.length)}</td><td>{cfg?.meta_ingressos ?? "—"}</td>
                <td>{int(x.grav.length)}</td><td>{int(x.vit.length)}</td><td>{int(x.wl.length)}</td><td>{brl(x.recTotal)}</td>
                <td className={x.recTotal - x.gasto < 0 ? "lx-ruim" : "lx-bom"}>{brl(x.recTotal - x.gasto)}</td>
                <td>{xR(x.roasWs)}</td><td>{xR(x.roasGeral)}</td><td>{brlOu(x.cpa)}</td>
                <td>{cfg?.membros_grupo ?? "—"}</td><td>{cfg?.pico_live ?? "—"}</td><td>{cfg?.ficaram_pitch ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
