"use client";

// 🏆 RANKING DE CRIATIVOS (/lancamento/ranking-criativos, 18/10/2026): cada anúncio da Meta com o
// que ele GASTOU (Meta, por anúncio) × o que VENDEU de verdade (Kiwify). Em lista ou em miniatura
// clicável; o clique abre o detalhe.
// Como a venda acha o anúncio, nesta ordem:
//   1. ad_id da sessão da página (o link do anúncio leva ad_id={{ad.id}}) — exato;
//   2. utm_content = nome do anúncio (+ utm_campaign = campanha, quando há anúncios com o mesmo nome);
//      se ainda empatar, fica com o anúncio que mais gastou no período (marcado "por nome").
// Bumps e White Label entram no anúncio do INGRESSO da mesma pessoa (pelo telefone).
// Regra da casa: venda real vence a atribuição da Meta — CAC e ROAS aqui são os reais.
import { useEffect, useMemo, useState } from "react";
import { jget } from "@/lib/client";
import LancamentoAbas from "@/components/LancamentoAbas";
import { Linhas } from "@/components/GraficoLinhas";
import { etapaDoProduto, turmaDaVenda, inicioDaTurma, proximoSabado, somaDias, ehCampanhaWorkshop, type EtapaEsteira } from "@/lib/workshop-esteira";
import { brl, brlOu, int, pct, xR, diaBR, div, soma, hojeSP, useMetaAuto } from "@/lib/lancamento-util";

interface Linha { data: string; ad_id: string; ad_nome: string; conjunto: string; campanha: string; gasto: number; impressoes: number; alcance: number; cliques: number; lpv: number; ic: number; compras: number; valor: number; video_3s: number; thruplay: number }
interface Criativo { ad_id: string; nome: string; status: string; thumb: string | null; imagem: string | null; video_id: string | null; link: string | null }
interface Venda { fone: string; produto: string; bruto: number; liquido: number | null; utm_content?: string; utm_campaign?: string; ad_id?: string | null; data: string; quando: string; hora: number; dow: number }
type VendaT = Venda & { etapa: EtapaEsteira; turma: string; liq: number };
type Periodo = "turma" | "anterior" | "7" | "30" | "tudo";
type Ordem = "roas" | "cac" | "ingressos" | "gasto" | "taxa";

const norm = (s?: string | null) => String(s ?? "").trim().toLowerCase();
// Onde o criativo abre: o post publicado (toca o vídeo) ou a prévia compartilhável da Meta; sem nenhum
// dos dois, o anúncio no Gerenciador (pede login na conta).
const linkDoCriativo = (id: string, c?: Criativo) => c?.link || `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${id}`;

export function RankingCriativos() {
  const hoje = hojeSP();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [vendas, setVendas] = useState<VendaT[]>([]);
  const [erro, setErro] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("turma");
  const [visao, setVisao] = useState<"miniaturas" | "lista">("miniaturas");
  const [ordem, setOrdem] = useState<Ordem>("ingressos");
  const [soWorkshop, setSoWorkshop] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const [recarga, setRecarga] = useState(0);
  useMetaAuto(() => setRecarga((x) => x + 1));   // abriu/trocou de aba → Meta dos últimos 3 dias
  useEffect(() => {
    (async () => {
      try {
        const [c, l] = await Promise.all([jget("/api/lancamento/criativos"), jget(`/api/lancamento?de=2026-08-01&ate=${hoje}`)]);
        setLinhas(c.linhas); setCriativos(c.criativos);
        const hIni = Number(String(l.workshop?.inicio ?? "09:00").slice(0, 2)) || 9, hFim = Number(String(l.workshop?.fim ?? "15:00").slice(0, 2)) || 15;
        setVendas((l.vendas as Venda[]).map((v) => { const etapa = etapaDoProduto(v.produto); return { ...v, etapa, turma: turmaDaVenda(etapa, v.data, v.dow ?? 0, v.hora ?? 12, hIni, hFim), liq: v.liquido ?? v.bruto ?? 0 }; }).filter((v) => v.etapa !== "outro"));
      } catch (e: any) { setErro(e.message); }
    })();
  }, [hoje, recarga]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(null); }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);

  const r = useMemo(() => {
    if (!linhas) return null;
    const atual = proximoSabado(hoje);
    const turma = periodo === "anterior" ? somaDias(atual, -7) : atual;
    const [de, ate] = periodo === "turma" || periodo === "anterior" ? [inicioDaTurma(turma), turma]
      : periodo === "tudo" ? ["2000-01-01", hoje] : [somaDias(hoje, -(Number(periodo) - 1)), hoje];
    const ls = linhas.filter((x) => x.data >= de && x.data <= ate && (!soWorkshop || ehCampanhaWorkshop(x.campanha)));
    const vs = periodo === "turma" || periodo === "anterior" ? vendas.filter((v) => v.turma === turma) : vendas.filter((v) => v.data >= de && v.data <= ate);
    // agrega por anúncio
    const ads = new Map<string, { id: string; nome: string; campanha: string; conjunto: string; gasto: number; impr: number; cliques: number; lpv: number; ic: number; compras: number; v3: number; thru: number; dias: Map<string, number>; vendas: VendaT[]; porNome: number }>();
    for (const x of ls) {
      const a = ads.get(x.ad_id) ?? { id: x.ad_id, nome: x.ad_nome, campanha: x.campanha, conjunto: x.conjunto, gasto: 0, impr: 0, cliques: 0, lpv: 0, ic: 0, compras: 0, v3: 0, thru: 0, dias: new Map(), vendas: [], porNome: 0 };
      a.gasto += x.gasto; a.impr += x.impressoes; a.cliques += x.cliques; a.lpv += x.lpv; a.ic += x.ic; a.compras += x.compras; a.v3 += x.video_3s; a.thru += x.thruplay;
      a.dias.set(x.data, (a.dias.get(x.data) ?? 0) + x.gasto);
      ads.set(x.ad_id, a);
    }
    // venda → anúncio
    const porNomeCamp = new Map<string, string[]>(), porNomeSo = new Map<string, string[]>();
    for (const a of ads.values()) {
      const k1 = norm(a.nome) + "|" + norm(a.campanha), k2 = norm(a.nome);
      porNomeCamp.set(k1, [...(porNomeCamp.get(k1) ?? []), a.id]); porNomeSo.set(k2, [...(porNomeSo.get(k2) ?? []), a.id]);
    }
    const maisGastou = (ids: string[]) => ids.sort((p, q) => (ads.get(q)?.gasto ?? 0) - (ads.get(p)?.gasto ?? 0))[0];
    const anuncioDaVenda = (v: VendaT): { id: string; nome: boolean } | null => {
      if (v.ad_id && ads.has(v.ad_id)) return { id: v.ad_id, nome: false };
      if (!v.utm_content) return null;
      const c = porNomeCamp.get(norm(v.utm_content) + "|" + norm(v.utm_campaign)) ?? porNomeSo.get(norm(v.utm_content));
      return c?.length ? { id: maisGastou([...c]), nome: true } : null;
    };
    const doFone = new Map<string, { id: string; nome: boolean }>();
    let semAnuncio = 0;
    for (const v of vs.filter((x) => x.etapa === "ingresso")) {
      const a = anuncioDaVenda(v);
      if (!a) { semAnuncio++; continue; }
      const ad = ads.get(a.id)!; ad.vendas.push(v); if (a.nome) ad.porNome++;
      if (v.fone) doFone.set(v.fone.slice(-10), a);
    }
    for (const v of vs.filter((x) => x.etapa !== "ingresso")) {
      const a = (v.fone && doFone.get(v.fone.slice(-10))) || anuncioDaVenda(v);
      if (a) ads.get(a.id)!.vendas.push(v);
    }
    const lista = [...ads.values()].filter((a) => a.gasto > 0 || a.vendas.length).map((a) => {
      const ing = a.vendas.filter((v) => v.etapa === "ingresso");
      const front = soma(a.vendas.filter((v) => v.etapa !== "whitelabel"), (v) => v.liq);
      const total = soma(a.vendas, (v) => v.liq);
      return {
        ...a, ingressos: ing.length, front, total, wl: a.vendas.filter((v) => v.etapa === "whitelabel").length,
        bumps: a.vendas.filter((v) => v.etapa === "gravacao" || v.etapa === "vitalicio").length,
        cac: div(a.gasto, ing.length), roas: div(front, a.gasto), roasGeral: div(total, a.gasto),
        taxa: div(ing.length, a.cliques), taxaLpv: div(ing.length, a.lpv), ctr: div(a.cliques, a.impr), cpm: div(a.gasto * 1000, a.impr),
        hook: div(a.v3, a.impr), hold: div(a.thru, a.v3),
      };
    });
    const chave: Record<Ordem, (x: (typeof lista)[number]) => number> = {
      roas: (x) => (Number.isFinite(x.roas) ? x.roas : -1), cac: (x) => (Number.isFinite(x.cac) ? -x.cac : -1e9),
      ingressos: (x) => x.ingressos * 1e6 + x.gasto, gasto: (x) => x.gasto, taxa: (x) => (Number.isFinite(x.taxa) ? x.taxa : -1),
    };
    lista.sort((p, q) => chave[ordem](q) - chave[ordem](p));
    return { lista, de, ate, semAnuncio, gasto: soma(lista, (x) => x.gasto), ingressos: soma(lista, (x) => x.ingressos), total: soma(lista, (x) => x.total), front: soma(lista, (x) => x.front) };
  }, [linhas, vendas, periodo, soWorkshop, ordem, hoje]);

  const cr = useMemo(() => new Map(criativos.map((c) => [c.ad_id, c])), [criativos]);
  if (!r) return <div className="lx"><LancamentoAbas /><div className="lx-card">{erro ? <span className="lx-ruim">{erro}</span> : "Carregando…"}</div></div>;
  const sel = aberto ? r.lista.find((x) => x.id === aberto) : null;
  const PERIODOS: Array<[Periodo, string]> = [["turma", "Turma atual"], ["anterior", "Turma anterior"], ["7", "7 dias"], ["30", "30 dias"], ["tudo", "Todo o período"]];

  return (
    <div className="lx">
      <LancamentoAbas />
      <div className="lx-topo">
        <div>
          <h1 className="lx-titulo">Ranking de criativos</h1>
          <span className="lx-mut">{diaBR(r.de)} a {diaBR(r.ate)} · ingresso real da Kiwify por anúncio</span>
        </div>
        <div className="lx-filtros">{PERIODOS.map(([k, rot]) => <button key={k} className={"lx-chip" + (periodo === k ? " on" : "")} onClick={() => setPeriodo(k)}>{rot}</button>)}</div>
      </div>
      <div className="lx-barra-info">
        <button className={"lx-chip" + (visao === "miniaturas" ? " on" : "")} onClick={() => setVisao("miniaturas")}>Miniaturas</button>
        <button className={"lx-chip" + (visao === "lista" ? " on" : "")} onClick={() => setVisao("lista")}>Lista</button>
        <label className="lx-campo-inline">Ordenar por
          <select className="lx-inp" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="ingressos">Mais ingressos</option><option value="roas">Maior ROAS</option><option value="cac">Menor CAC</option>
            <option value="taxa">Maior taxa de conversão</option><option value="gasto">Mais investido</option>
          </select>
        </label>
        <label className="lx-check"><input type="checkbox" checked={soWorkshop} onChange={(e) => setSoWorkshop(e.target.checked)} /> Só campanhas do workshop</label>
      </div>

      <div className="lx-roas-grid">
        <div className="lx-cel"><span className="lx-rot">Investido</span><b>{brl(r.gasto)}</b></div>
        <div className="lx-cel"><span className="lx-rot">Ingressos com anúncio</span><b>{int(r.ingressos)}</b><small className="lx-mut">{r.semAnuncio} sem anúncio identificado</small></div>
        <div className="lx-cel"><span className="lx-rot">CAC médio</span><b>{brlOu(div(r.gasto, r.ingressos))}</b></div>
        <div className="lx-cel"><span className="lx-rot">ROAS do ingresso</span><b>{xR(div(r.front, r.gasto))}</b><small className="lx-mut">ingresso + bumps</small></div>
        <div className="lx-cel"><span className="lx-rot">ROAS geral</span><b>{xR(div(r.total, r.gasto))}</b><small className="lx-mut">com White Label</small></div>
        <div className="lx-cel"><span className="lx-rot">Anúncios</span><b>{int(r.lista.length)}</b></div>
      </div>

      {!r.lista.length ? <div className="lx-card"><p className="lx-vazio">Sem dados por anúncio no período. Os números por anúncio começam na próxima sincronização da Meta (botão Atualizar Meta na Visão geral, que traz 30 dias).</p></div>
        : visao === "miniaturas" ? (
          <div className="lx-cria-grid">
            {r.lista.map((a, i) => {
              const c = cr.get(a.id);
              return (
                <div key={a.id} className="lx-cria">
                  {/* a MINIATURA abre o criativo na Meta (aba nova); o resto do card abre o detalhe */}
                  <a className="lx-cria-img" href={linkDoCriativo(a.id, c)} target="_blank" rel="noreferrer" title="Abrir o criativo na Meta">
                    {c?.thumb || c?.imagem ? <img src={c.imagem || c.thumb || ""} alt={`Criativo ${a.nome}`} loading="lazy" referrerPolicy="no-referrer" /> : <span className="lx-mut">sem miniatura</span>}
                    <em>#{i + 1}</em>{c?.video_id && <span className="lx-cria-video">vídeo</span>}
                    <span className="lx-cria-abrir">{c?.video_id ? "Assistir na Meta ↗" : "Abrir na Meta ↗"}</span>
                  </a>
                  <button type="button" className="lx-cria-info" onClick={() => setAberto(a.id)}>
                  <b className="lx-cria-nome">{a.nome}</b>
                  <small className="lx-mut lx-cria-camp">{a.campanha}</small>
                  <div className="lx-cria-nums">
                    <span>Investido<b>{brl(a.gasto)}</b></span><span>Ingressos<b>{int(a.ingressos)}</b></span>
                    <span>Tx conv.<b>{pct(a.taxa, 2)}</b></span><span>CAC<b>{brlOu(a.cac)}</b></span>
                    <span>ROAS<b className={a.roas >= 1 ? "lx-bom" : a.ingressos ? "lx-amarelo" : ""}>{xR(a.roas)}</b></span><span>CTR<b>{pct(a.ctr, 2)}</b></span>
                  </div>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="lx-card">
            <div className="lx-tab-wrap">
              <table className="lx-tab">
                <thead><tr><th>#</th><th>Criativo</th><th>Investido</th><th>Ingressos</th><th>Tx conv. (clique)</th><th>Tx conv. (página)</th><th>CAC</th><th>ROAS</th><th>ROAS geral</th><th>Bumps</th><th>WL</th><th>CTR</th><th>CPM</th><th>Hook</th><th>Compras Meta</th></tr></thead>
                <tbody>
                  {r.lista.map((a, i) => {
                    const c = cr.get(a.id);
                    return (
                      <tr key={a.id} onClick={() => setAberto(a.id)} style={{ cursor: "pointer" }}>
                        <td>{i + 1}</td>
                        <td><div className="lx-cria-linha">{c?.thumb ? <a href={linkDoCriativo(a.id, c)} target="_blank" rel="noreferrer" title="Abrir o criativo na Meta" onClick={(e) => e.stopPropagation()}><img src={c.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /></a> : <i />}<span><b>{a.nome}</b><small className="lx-mut">{a.campanha}</small></span></div></td>
                        <td>{brl(a.gasto)}</td><td><b>{int(a.ingressos)}</b></td><td>{pct(a.taxa, 2)}</td><td>{pct(a.taxaLpv, 2)}</td><td>{brlOu(a.cac)}</td>
                        <td className={a.roas >= 1 ? "lx-bom" : ""}>{xR(a.roas)}</td><td>{xR(a.roasGeral)}</td><td>{int(a.bumps)}</td><td>{int(a.wl)}</td>
                        <td>{pct(a.ctr, 2)}</td><td>{brlOu(a.cpm)}</td><td>{a.v3 ? pct(a.hook, 1) : "—"}</td><td>{int(a.compras)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      <p className="lx-nota">Pra casar cada venda com o anúncio exato, use nos parâmetros de URL dos anúncios: <code>utm_content={"{{ad.name}}"}&amp;ad_id={"{{ad.id}}"}</code>. Sem o ad_id, a venda casa pelo nome do anúncio, e anúncios com o mesmo nome ("Novo anúncio de Vendas") se confundem.</p>

      {sel && (
        <div className="lx-modal" role="dialog" aria-modal="true" aria-label={`Criativo ${sel.nome}`} onClick={(e) => { if (e.target === e.currentTarget) setAberto(null); }}>
          <div className="lx-modal-caixa">
            <button className="lx-modal-x" onClick={() => setAberto(null)} aria-label="Fechar">×</button>
            <div className="lx-modal-grid">
              <div className="lx-modal-img">
                <a href={linkDoCriativo(sel.id, cr.get(sel.id))} target="_blank" rel="noreferrer" title="Abrir o criativo na Meta">
                  {cr.get(sel.id)?.imagem || cr.get(sel.id)?.thumb ? <img src={cr.get(sel.id)!.imagem || cr.get(sel.id)!.thumb!} alt={`Criativo ${sel.nome}`} referrerPolicy="no-referrer" /> : <span className="lx-mut">sem miniatura</span>}
                </a>
                <a className="lx-btn" href={linkDoCriativo(sel.id, cr.get(sel.id))} target="_blank" rel="noreferrer">{cr.get(sel.id)?.video_id ? "Assistir o criativo na Meta ↗" : "Abrir o criativo na Meta ↗"}</a>
              </div>
              <div>
                <h3 style={{ marginBottom: 2 }}>{sel.nome}</h3>
                <p className="lx-mut" style={{ margin: "0 0 10px" }}>{sel.campanha} · {sel.conjunto}{cr.get(sel.id)?.status ? ` · ${cr.get(sel.id)!.status.toLowerCase()}` : ""}</p>
                <div className="lx-roas-grid">
                  <div className="lx-cel"><span className="lx-rot">Investido</span><b>{brl(sel.gasto)}</b></div>
                  <div className="lx-cel"><span className="lx-rot">Ingressos (conversões)</span><b>{int(sel.ingressos)}</b>{sel.porNome > 0 && <small className="lx-mut">{sel.porNome} casada(s) pelo nome</small>}</div>
                  <div className="lx-cel"><span className="lx-rot">Tx de conversão</span><b>{pct(sel.taxa, 2)}</b><small className="lx-mut">ingressos ÷ cliques · {pct(sel.taxaLpv, 2)} da página</small></div>
                  <div className="lx-cel"><span className="lx-rot">CAC</span><b>{brlOu(sel.cac)}</b></div>
                  <div className="lx-cel"><span className="lx-rot">ROAS</span><b className={sel.roas >= 1 ? "lx-bom" : ""}>{xR(sel.roas)}</b><small className="lx-mut">ingresso + bumps</small></div>
                  <div className="lx-cel"><span className="lx-rot">ROAS geral</span><b>{xR(sel.roasGeral)}</b><small className="lx-mut">{sel.wl} White Label</small></div>
                  <div className="lx-cel"><span className="lx-rot">CTR · CPM</span><b>{pct(sel.ctr, 2)}</b><small className="lx-mut">{brlOu(sel.cpm)} por mil</small></div>
                  <div className="lx-cel"><span className="lx-rot">Hook · Hold</span><b>{sel.v3 ? pct(sel.hook, 1) : "—"}</b><small className="lx-mut">{sel.v3 ? pct(sel.hold, 1) + " hold" : "imagem"}</small></div>
                  <div className="lx-cel"><span className="lx-rot">Compras (Meta)</span><b>{int(sel.compras)}</b><small className="lx-mut">a Kiwify confirmou {int(sel.ingressos)}</small></div>
                </div>
                {sel.dias.size > 1 && (() => {
                  const dias = [...sel.dias.keys()].sort();
                  return <Linhas rotulos={dias.map(diaBR)} altura={160} series={[
                    { nome: "Investido", cor: "#3b82f6", valores: dias.map((d) => sel.dias.get(d) ?? 0), moeda: true },
                    { nome: "Ingressos", cor: "#22c55e", valores: dias.map((d) => sel.vendas.filter((v) => v.etapa === "ingresso" && v.data === d).length), eixo2: true },
                  ]} />;
                })()}
                {sel.vendas.length > 0 && (
                  <div className="lx-tab-wrap" style={{ marginTop: 10 }}>
                    <table className="lx-tab"><thead><tr><th>Quando</th><th>Produto</th><th>Líquido</th></tr></thead>
                      <tbody>{[...sel.vendas].sort((p, q) => q.data.localeCompare(p.data) || q.quando.localeCompare(p.quando)).map((v, i) => <tr key={i}><td>{v.quando}</td><td><span className={"lx-tag " + v.etapa}>{v.etapa === "ingresso" ? "Ingresso" : v.etapa === "whitelabel" ? "White Label" : v.etapa === "gravacao" ? "Gravação" : "Vitalício"}</span></td><td>{brl(v.liq)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
