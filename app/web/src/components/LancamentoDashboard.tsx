"use client";

// 📊 DASHBOARD DE LANÇAMENTO (pedido do dono, 13/10): o funil do Workshop num lugar só.
// O que a Meta GASTOU e atribui (ads_diario: CSV importado + sincronização automática pela API)
// × o que a Kiwify VENDEU de verdade × as conversas que chegaram no WPP Api.
// Regra da casa: a venda REAL (Kiwify) vence a atribuição da Meta — o ROAS de cima é o real.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { jget, jsend } from "@/lib/client";
import GuiaTokenMetaAds from "@/components/GuiaTokenMetaAds";

interface LinhaAds { data: string; campanha: string; objetivo?: string; gasto: number; impressoes: number; alcance: number; ctr_link: number | null; lpv: number; ic: number; compras: number; valor: number; conversas: number; fonte: string; atualizado: string }
interface Venda { fone: string; produto: string; bruto: number; liquido: number | null; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; data: string; quando: string }
interface ConvDia { data: string; total: number; anuncio: number }
interface Dados { de: string; ate: string; ads: LinhaAds[]; vendas: Venda[]; conversas: ConvDia[]; disparos: Array<{ id: string; nome: string; total: number; quando: string }>; metaAdsConfigurado: boolean }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => (Number.isFinite(v) ? (v * 100).toFixed(1).replace(".", ",") + "%" : "—");
const x2 = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(2).replace(".", ",") : "—");
const diaBR = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const ehWorkshop = (p: string) => /workshop/i.test(p) && !/grava|vital/i.test(p);

export function LancamentoDashboard() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [de, setDe] = useState("2026-10-07");
  const [ate, setAte] = useState(hoje);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [sinc, setSinc] = useState("");

  async function carregar() {
    try { setD(await jget(`/api/lancamento?de=${de}&ate=${ate}`)); setErro(""); }
    catch (e: any) { setErro(e.message); }
  }
  useEffect(() => { void carregar(); const t = setInterval(carregar, 5 * 60_000); return () => clearInterval(t); }, [de, ate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sincronizar() {
    setSinc("Puxando da Meta…");
    try { const r = await jsend("/api/lancamento/sincronizar", "POST", {}); setSinc(`${r.linhas} linha(s) atualizadas da Meta.`); void carregar(); }
    catch (e: any) { setSinc(e.message); }
  }

  const k = useMemo(() => {
    if (!d) return null;
    const ads = d.ads;
    const gasto = ads.reduce((s, a) => s + a.gasto, 0);
    const impr = ads.reduce((s, a) => s + a.impressoes, 0);
    const cliques = ads.reduce((s, a) => s + (a.ctr_link != null ? (a.impressoes * a.ctr_link) / 100 : 0), 0);
    const lpv = ads.reduce((s, a) => s + a.lpv, 0);
    const ic = ads.reduce((s, a) => s + a.ic, 0);
    const comprasMeta = ads.reduce((s, a) => s + a.compras, 0);
    const valorMeta = ads.reduce((s, a) => s + a.valor, 0);
    const convAds = ads.reduce((s, a) => s + a.conversas, 0);
    const vendas = d.vendas;
    const bruto = vendas.reduce((s, v) => s + (v.bruto || 0), 0);
    const comLiq = vendas.filter((v) => v.liquido != null);
    const liquido = comLiq.reduce((s, v) => s + (v.liquido || 0), 0);
    const ingressos = vendas.filter((v) => ehWorkshop(v.produto)).length;
    const convNovas = d.conversas.reduce((s, c) => s + c.total, 0);
    const convAnuncio = d.conversas.reduce((s, c) => s + c.anuncio, 0);
    // por dia
    const dias = new Map<string, { gasto: number; bruto: number; vendas: number; comprasMeta: number }>();
    for (const a of ads) { const x = dias.get(a.data) ?? { gasto: 0, bruto: 0, vendas: 0, comprasMeta: 0 }; x.gasto += a.gasto; x.comprasMeta += a.compras; dias.set(a.data, x); }
    for (const v of vendas) { const x = dias.get(v.data) ?? { gasto: 0, bruto: 0, vendas: 0, comprasMeta: 0 }; x.bruto += v.bruto || 0; x.vendas++; dias.set(v.data, x); }
    const porDia = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // por campanha
    const camp = new Map<string, { gasto: number; impr: number; cliques: number; lpv: number; ic: number; compras: number; valor: number; conversas: number }>();
    for (const a of ads) {
      const x = camp.get(a.campanha) ?? { gasto: 0, impr: 0, cliques: 0, lpv: 0, ic: 0, compras: 0, valor: 0, conversas: 0 };
      x.gasto += a.gasto; x.impr += a.impressoes; x.cliques += a.ctr_link != null ? (a.impressoes * a.ctr_link) / 100 : 0;
      x.lpv += a.lpv; x.ic += a.ic; x.compras += a.compras; x.valor += a.valor; x.conversas += a.conversas;
      camp.set(a.campanha, x);
    }
    const porCampanha = [...camp.entries()].filter(([, x]) => x.gasto > 0).sort((a, b) => b[1].gasto - a[1].gasto);
    // vendas reais por origem (UTM) e por produto
    const origem = new Map<string, { n: number; bruto: number }>();
    for (const v of vendas) {
      const chave = v.utm_source || v.utm_content ? [v.utm_source, v.utm_medium, v.utm_content].filter(Boolean).join(" · ") : "sem UTM";
      const x = origem.get(chave) ?? { n: 0, bruto: 0 }; x.n++; x.bruto += v.bruto || 0; origem.set(chave, x);
    }
    const produto = new Map<string, { n: number; bruto: number }>();
    for (const v of vendas) { const x = produto.get(v.produto) ?? { n: 0, bruto: 0 }; x.n++; x.bruto += v.bruto || 0; produto.set(v.produto, x); }
    const ultimaApi = ads.filter((a) => a.fonte === "api").map((a) => a.atualizado).sort().pop();
    return {
      gasto, impr, cliques, lpv, ic, comprasMeta, valorMeta, convAds, bruto, liquido, liqParcial: comLiq.length < vendas.length,
      vendas: vendas.length, ingressos, convNovas, convAnuncio, porDia, porCampanha,
      porOrigem: [...origem.entries()].sort((a, b) => b[1].bruto - a[1].bruto),
      porProduto: [...produto.entries()].sort((a, b) => b[1].bruto - a[1].bruto),
      temCsv: ads.some((a) => a.fonte === "csv"), ultimaApi,
    };
  }, [d]);

  const maxDia = k ? Math.max(1, ...k.porDia.map(([, x]) => Math.max(x.gasto, x.bruto))) : 1;

  return (
    <div className="lanc">
      <div className="lanc-topo">
        <div className="lanc-periodo">
          <label>De <input className="inp" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até <input className="inp" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <button className="btn" onClick={() => { setDe(hoje); setAte(hoje); }}>Hoje</button>
          <button className="btn" onClick={() => { setDe("2026-10-07"); setAte(hoje); }}>Lançamento todo</button>
        </div>
        <div className="lanc-fonte">
          {d && !d.metaAdsConfigurado ? (
            <span className="lanc-aviso">Meta Ads sem token — números de anúncio vêm do CSV importado. <Link href="/integracoes">Conectar em Integrações → Meta Ads</Link></span>
          ) : (
            <>
              <span className="muted">{k?.ultimaApi ? `Meta atualizada ${new Date(k.ultimaApi).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · automático a cada 30 min` : "Meta conectada — aguardando a 1ª sincronização"}</span>
              <button className="btn" onClick={sincronizar}>Sincronizar agora</button>
            </>
          )}
          {sinc && <span className="muted">{sinc}</span>}
        </div>
      </div>
      {erro && <div className="lanc-aviso">{erro}</div>}
      {d && <GuiaTokenMetaAds onde="dashboard" aberto={!d.metaAdsConfigurado} />}
      {!k ? <div className="muted" style={{ padding: 20 }}>Carregando…</div> : (
        <>
          <div className="lanc-kpis">
            <Kpi rot="Investido (Meta)" val={brl(k.gasto)} />
            <Kpi rot="Faturamento real (Kiwify)" val={brl(k.bruto)} sub={k.liquido ? `${brl(k.liquido)} líquido${k.liqParcial ? " (parcial)" : ""}` : undefined} destaque />
            <Kpi rot="ROAS real" val={x2(k.gasto ? k.bruto / k.gasto : 0)} sub={`Meta diz ${x2(k.gasto ? k.valorMeta / k.gasto : 0)}`} destaque />
            <Kpi rot="Pedidos (Kiwify)" val={int(k.vendas)} sub={`${int(k.ingressos)} ingresso(s) · ${int(k.vendas - k.ingressos)} bump/WL`} />
            <Kpi rot="Custo por ingresso" val={k.ingressos ? brl(k.gasto / k.ingressos) : "—"} sub={`Meta atribui ${int(k.comprasMeta)} compra(s)`} />
            <Kpi rot="Conversas novas WPP Api" val={int(k.convNovas)} sub={`${int(k.convAnuncio)} de anúncio · ${int(k.convNovas - k.convAnuncio)} orgânicas`} />
          </div>

          <div className="lanc-grid">
            <div className="card lanc-card">
              <h3>Funil dos anúncios de venda</h3>
              {[
                ["Impressões", k.impr],
                ["Cliques no link", k.cliques],
                ["Visualizações da página", k.lpv],
                ["Checkout iniciado", k.ic],
                ["Compras (Meta)", k.comprasMeta],
                ["Ingressos vendidos (Kiwify)", k.ingressos],
              ].map(([rot, v], i, arr) => {
                const base = Number(arr[0][1]) || 1;
                const ant = i ? Number(arr[i - 1][1]) : 0;
                return (
                  <div key={String(rot)} className="lanc-funil-linha">
                    <span className="rot">{rot}</span>
                    <div className="barra"><i style={{ width: `${Math.max(2, (Number(v) / base) * 100)}%` }} /></div>
                    <b>{int(Number(v))}</b>
                    <small className="muted">{i ? pct(ant ? Number(v) / ant : 0) : ""}</small>
                  </div>
                );
              })}
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>% = conversão da etapa anterior. Conversas iniciadas por anúncio (Meta): {int(k.convAds)}.</div>
            </div>

            <div className="card lanc-card">
              <h3>Dia a dia — investido × faturamento real</h3>
              <div className="lanc-dias">
                {k.porDia.map(([dia, x]) => (
                  <div key={dia} className="lanc-dia" title={`${diaBR(dia)} · gasto ${brl(x.gasto)} · faturamento ${brl(x.bruto)} · ${x.vendas} pedido(s)`}>
                    <div className="lanc-dia-barras">
                      <i className="g" style={{ height: `${(x.gasto / maxDia) * 100}%` }} />
                      <i className="f" style={{ height: `${(x.bruto / maxDia) * 100}%` }} />
                    </div>
                    <small>{diaBR(dia)}</small>
                    <small className="muted">{x.vendas}p</small>
                  </div>
                ))}
              </div>
              <div className="lanc-legenda"><span><i className="g" /> investido</span><span><i className="f" /> faturamento Kiwify</span><span className="muted">p = pedidos</span></div>
            </div>
          </div>

          <div className="card lanc-card">
            <h3>Campanhas</h3>
            <div className="lanc-tabela-wrap">
              <table className="lanc-tabela">
                <thead><tr><th>Campanha</th><th>Investido</th><th>Impr.</th><th>CTR</th><th>LPV</th><th>IC</th><th>Compras Meta</th><th>CPA Meta</th><th>ROAS Meta</th><th>Conversas</th></tr></thead>
                <tbody>
                  {k.porCampanha.map(([nome, x]) => (
                    <tr key={nome}>
                      <td>{nome}</td><td>{brl(x.gasto)}</td><td>{int(x.impr)}</td><td>{x.impr ? pct(x.cliques / x.impr) : "—"}</td>
                      <td>{int(x.lpv)}</td><td>{int(x.ic)}</td><td>{int(x.compras)}</td><td>{x.compras ? brl(x.gasto / x.compras) : "—"}</td>
                      <td>{x2(x.gasto ? x.valor / x.gasto : 0)}</td><td>{x.conversas ? int(x.conversas) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lanc-grid">
            <div className="card lanc-card">
              <h3>Vendas reais por origem (UTM da Kiwify)</h3>
              <table className="lanc-tabela"><tbody>
                {k.porOrigem.map(([o, x]) => <tr key={o}><td>{o}</td><td>{x.n} pedido(s)</td><td>{brl(x.bruto)}</td></tr>)}
              </tbody></table>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>UTM só existe nos pedidos a partir de 13/10 (antes disso aparecem como "sem UTM").</div>
            </div>
            <div className="card lanc-card">
              <h3>Por produto</h3>
              <table className="lanc-tabela"><tbody>
                {k.porProduto.map(([p, x]) => <tr key={p}><td>{p}</td><td>{x.n}</td><td>{brl(x.bruto)}</td></tr>)}
              </tbody></table>
              {d && d.disparos.length > 0 && (
                <>
                  <h3 style={{ marginTop: 14 }}>Disparos no período</h3>
                  <table className="lanc-tabela"><tbody>
                    {d.disparos.map((x) => <tr key={x.id}><td>{x.quando}</td><td>{x.nome}</td><td>{int(x.total)}</td></tr>)}
                  </tbody></table>
                </>
              )}
            </div>
          </div>

          <div className="card lanc-card">
            <h3>Últimos pedidos</h3>
            <div className="lanc-tabela-wrap">
              <table className="lanc-tabela">
                <thead><tr><th>Quando</th><th>Produto</th><th>Valor</th><th>Líquido</th><th>Origem</th></tr></thead>
                <tbody>
                  {[...(d?.vendas ?? [])].sort((a, b) => b.data.localeCompare(a.data) || b.quando.localeCompare(a.quando)).slice(0, 40).map((v, i) => (
                    <tr key={i}><td>{v.quando}</td><td>{v.produto}</td><td>{brl(v.bruto || 0)}</td><td>{v.liquido != null ? brl(v.liquido) : "—"}</td>
                      <td>{[v.utm_source, v.utm_medium, v.utm_content].filter(Boolean).join(" · ") || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ rot, val, sub, destaque }: { rot: string; val: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={"card lanc-kpi" + (destaque ? " destaque" : "")}>
      <span className="rot">{rot}</span>
      <b>{val}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}
