"use client";

// Métricas da API Oficial (layout premium) — o espelho do "Insights" do Gerenciador da Meta.
// Fontes REAIS: Graph (qualidade, limite/tier, enviadas/entregues por dia, custo por categoria) +
// contadores próprios dos webhooks de status (lidas — a Graph não devolve isso). O que ainda não
// dá pra ter honestamente: distribuição por VÁRIOS números (só há 1 hoje) e heatmap por hora
// (os dados são diários) — por isso não invento esses blocos.
import { useEffect, useMemo, useState } from "react";
import { jget } from "@/lib/client";
import { formatTier } from "@/components/MetaConnect";
import { Icon } from "@/components/icons";
import { CalendarioPeriodo, atalhoPeriodo, rotuloPeriodo, type PeriodoDatas } from "@/components/CalendarioPeriodo";
import { ContatosPopup } from "@/components/ContatosPopup";
import { TemplateInsights, type Tpl } from "@/components/MetaTemplates";

// A Meta devolve a capacidade como nível, não como número: traduz pro que significa na prática.
function rotuloThroughput(n?: string): string {
  const v = String(n ?? "").toUpperCase();
  if (v === "STANDARD") return "Padrão";
  if (v === "HIGH") return "Alta";
  if (v === "NOT_APPLICABLE") return "Sem limite fixo";
  return v || "—";
}
interface Saude { telefone?: string; nome?: string; qualidade: string; tier: string; throughput?: string; status?: string }
interface PontoVolume { start: number; sent: number; delivered: number }
interface PontoCusto { start: number; categoria: string; qtd: number; custo: number }
interface PontoProprio { dia: string; enviadas: number; entregues: number; lidas: number; falhas: number }
interface Metricas {
  dias: number; inicio: number; fim: number;
  de?: string; ate?: string; personalizado?: boolean; cortado?: boolean; // período resolvido pelo motor
  saude: Saude[] | { erro: string };
  volume: PontoVolume[] | { erro: string };
  custo: PontoCusto[] | { erro: string };
  proprio?: PontoProprio[] | { erro: string };
}

const QUALIDADE: Record<string, { rotulo: string; cls: string }> = {
  GREEN: { rotulo: "Alta", cls: "boa" }, YELLOW: { rotulo: "Média", cls: "media" }, RED: { rotulo: "Baixa", cls: "baixa" },
};
const CATEGORIA: Record<string, string> = {
  MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação",
  SERVICE: "Serviço", REFERRAL_CONVERSION: "Ponto de entrada", OUTRA: "Outra",
};
// Cores do donut de categoria (paleta do painel, distintas entre si).
const COR_CAT: Record<string, string> = {
  MARKETING: "#1EA956", UTILITY: "#2AA9E0", AUTHENTICATION: "#E8A33D", SERVICE: "#7C6CF0", OUTRA: "#8FB3A4",
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const nf = (v: number) => v.toLocaleString("pt-BR");
const diaCurto = (sec: number) => new Date(sec * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const comErro = (x: unknown): x is { erro: string } => !!x && !Array.isArray(x) && typeof (x as any).erro === "string";

// Sparkline (linha + área) SVG — o "gráficozinho" do topo. Série única, endpoint destacado.
function Sparkline({ valores, cor = "var(--accent-deep)" }: { valores: number[]; cor?: string }) {
  if (valores.length < 2) return <div className="omx-spark-vazio" />;
  const w = 120, h = 34, max = Math.max(1, ...valores), min = Math.min(...valores);
  const span = max - min || 1;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const linha = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `0,${h} ${linha} ${w},${h}`;
  const fim = pts[pts.length - 1];
  const gid = "sg" + Math.round(valores.reduce((a, b) => a + b, 0)) + valores.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="omx-spark" preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={cor} stopOpacity="0.28" /><stop offset="100%" stopColor={cor} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={fim[0]} cy={fim[1]} r="2.6" fill={cor} />
    </svg>
  );
}

// KPI do topo: rótulo, valor grande, sub, e um sparklinezinho.
function Kpi({ rotulo, valor, sub, spark, cor, valorCls }: { rotulo: string; valor: React.ReactNode; sub?: string; spark?: number[]; cor?: string; valorCls?: string }) {
  return (
    <div className="card omx-kpi">
      <span className="omx-rotulo">{rotulo}</span>
      <b className={"omx-kpi-val " + (valorCls ?? "")}>{valor}</b>
      {spark && spark.length > 1 ? <Sparkline valores={spark} cor={cor} /> : <div className="omx-spark-vazio" />}
      {sub && <span className="omx-sub muted">{sub}</span>}
    </div>
  );
}

// Barras por dia (custo). Série única, valor no hover.
function GraficoBarras({ titulo, pontos, formata }: { titulo: string; pontos: Array<{ rotulo: string; valor: number }>; formata: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  if (!pontos.length) return null;
  return (
    <div className="card"><div className="card-pad">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{titulo}</h3>
      <div className="omx-grafico">
        {pontos.map((p, i) => (
          <div key={i} className="omx-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && <div className="omx-tip">{p.rotulo} · <b>{formata(p.valor)}</b></div>}
            <div className={"omx-barra" + (hover === i ? " on" : "")} style={{ height: `${Math.max(2, (p.valor / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="omx-eixo"><span>{pontos[0].rotulo}</span><span>{pontos[pontos.length - 1].rotulo}</span></div>
    </div></div>
  );
}

// Donut SVG de custo por categoria.
function Donut({ fatias, total }: { fatias: Array<{ cat: string; valor: number }>; total: number }) {
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="omx-donut-wrap">
      <svg viewBox="0 0 120 120" className="omx-donut">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line-2)" strokeWidth="14" />
        {total > 0 && fatias.map((f) => {
          const frac = f.valor / total;
          const dash = frac * C;
          const el = <circle key={f.cat} cx="60" cy="60" r={R} fill="none" stroke={COR_CAT[f.cat] ?? COR_CAT.OUTRA}
            strokeWidth="14" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />;
          off += dash;
          return el;
        })}
        <text x="60" y="55" textAnchor="middle" className="omx-donut-lbl">Total</text>
        <text x="60" y="72" textAnchor="middle" className="omx-donut-val">{brl(total)}</text>
      </svg>
    </div>
  );
}

// Período: atalho (7/30/90) OU calendário (de/ate). O calendário é o da Meta Ads — clica em duas
// datas e vira período; duas vezes na mesma = 1 dia (pedido do dono, 30/09).
type Periodo = { tipo: "preset"; dias: number } | { tipo: "custom"; de: string; ate: string };

// Uma linha da tabela "Por template": o funil, os cliques ABERTOS POR BOTÃO e o custo estimado.
interface TplLinha {
  chave: string; nome: string; idioma: string; id: string; waba: string; categoria: string;
  enviadas: number; entregues: number; lidas: number; cliques: number;
  botoes: Array<{ texto: string; cliques: number }>; custoAprox: number | null;
}
interface TplMetricas { porTemplate: Record<string, Omit<TplLinha, "chave" | "nome" | "idioma">>; capturaLigada: boolean | null; capturaAtivadaAgora?: boolean }

export function OficialMetricas() {
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: "preset", dias: 30 });
  // Clique num botão da coluna "Por botão" → popup com QUEM clicou (resposta rápida) — pedido 13/10.
  const [botaoPopup, setBotaoPopup] = useState<{ template: string; waba?: string; botao: string; cliques: number } | null>(null);
  const [calAberto, setCalAberto] = useState(false);
  const [data, setData] = useState<Metricas | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // Métricas POR TEMPLATE (mesmo período): pedido do dono — "quero ver separado por template,
  // quantos receberam, abriram, clicaram no botão X ou Y, e quanto gastou".
  const [tplData, setTplData] = useState<TplMetricas | null>(null);
  const [tplErro, setTplErro] = useState("");
  const [tplBusca, setTplBusca] = useState("");
  const [tplCat, setTplCat] = useState("");
  const [tplSoComEnvio, setTplSoComEnvio] = useState(true);
  const [ordem, setOrdem] = useState<{ col: string; desc: boolean }>({ col: "enviadas", desc: true });
  const [insightsFor, setInsightsFor] = useState<Tpl | null>(null);

  const qs = periodo.tipo === "preset" ? `?dias=${periodo.dias}` : `?de=${encodeURIComponent(periodo.de)}&ate=${encodeURIComponent(periodo.ate)}`;
  const dias = periodo.tipo === "preset" ? periodo.dias : (data?.dias ?? 0);
  const rotuloPer = periodo.tipo === "custom" ? rotuloPeriodo(periodo) : `últimos ${periodo.dias} dias`;

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro("");
    jget("/api/oficial/metricas" + qs)
      .then((d) => { if (vivo) setData(d); })
      .catch((e) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setCarregando(false); });
    // Em paralelo, sem travar a tela principal: a Graph consulta os templates em lotes de 10.
    setTplData(null); setTplErro("");
    jget("/api/meta/templates/metricas" + qs)
      .then((d) => { if (vivo) setTplData(d); })
      .catch((e) => { if (vivo) setTplErro(e.message); });
    return () => { vivo = false; };
  }, [qs]);

  const linhasTpl = useMemo<TplLinha[]>(() => {
    const src = tplData?.porTemplate ?? {};
    let arr: TplLinha[] = Object.entries(src).map(([chave, v]) => {
      const [nome, idioma] = chave.split("|");
      return { chave, nome, idioma: idioma || "", ...v, botoes: v.botoes ?? [] };
    });
    const q = tplBusca.trim().toLowerCase();
    if (q) arr = arr.filter((l) => l.nome.toLowerCase().includes(q));
    if (tplCat) arr = arr.filter((l) => l.categoria === tplCat);
    if (tplSoComEnvio) arr = arr.filter((l) => l.enviadas > 0);
    const k = ordem.col;
    arr.sort((a, b) => {
      if (k === "nome") return ordem.desc ? b.nome.localeCompare(a.nome) : a.nome.localeCompare(b.nome);
      const av = Number((a as unknown as Record<string, unknown>)[k] ?? 0), bv = Number((b as unknown as Record<string, unknown>)[k] ?? 0);
      return ordem.desc ? bv - av : av - bv;
    });
    return arr;
  }, [tplData, tplBusca, tplCat, tplSoComEnvio, ordem]);
  const ordena = (col: string) => setOrdem((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== "nome" }));
  const pctDe = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) + "%" : "");
  // Cliques a Meta conta por CLIQUE, não por pessoa: 5 cliques num único envio dava "500%" na tela e
  // parecia bug (print do dono, 30/09). Acima de 100% mostra o teto e explica no tooltip.
  const pctCliques = (n: number, base: number): { texto: string; titulo?: string } => {
    if (base <= 0) return { texto: "" };
    const p = Math.round((n / base) * 100);
    if (p <= 100) return { texto: p + "%" };
    return { texto: "100%+", titulo: `${nf(n)} cliques em ${nf(base)} envio${base === 1 ? "" : "s"} — a Meta conta cada clique, e a mesma pessoa pode clicar mais de uma vez` };
  };
  const Th = ({ col, children, num }: { col: string; children: React.ReactNode; num?: boolean }) => (
    <th className={(num ? "num" : "") + (ordem.col === col ? " on" : "")} onClick={() => ordena(col)} title="Ordenar">
      {children}{ordem.col === col ? (ordem.desc ? " ↓" : " ↑") : ""}
    </th>
  );

  const volume = useMemo(() => (data && !comErro(data.volume) ? [...data.volume].sort((a, b) => a.start - b.start) : []), [data]);
  const proprio = useMemo(() => (data && data.proprio && !comErro(data.proprio) ? data.proprio : []), [data]);
  const custoPontos = useMemo(() => (data && !comErro(data.custo) ? data.custo : []), [data]);
  const custoPorDia = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of custoPontos) m.set(p.start, (m.get(p.start) ?? 0) + p.custo);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([start, valor]) => ({ rotulo: diaCurto(start), valor }));
  }, [custoPontos]);
  const porCategoria = useMemo(() => {
    const m = new Map<string, { qtd: number; custo: number }>();
    for (const p of custoPontos) {
      const a = m.get(p.categoria) ?? { qtd: 0, custo: 0 };
      m.set(p.categoria, { qtd: a.qtd + p.qtd, custo: a.custo + p.custo });
    }
    return [...m.entries()].sort((a, b) => b[1].custo - a[1].custo || b[1].qtd - a[1].qtd);
  }, [custoPontos]);

  const enviadas = volume.reduce((s, p) => s + p.sent, 0);
  const entregues = volume.reduce((s, p) => s + p.delivered, 0);
  const lidas = proprio.reduce((s, p) => s + p.lidas, 0);
  const custoTotal = custoPontos.reduce((s, p) => s + p.custo, 0);
  const totalPago = porCategoria.reduce((s, [, v]) => s + v.qtd, 0);
  const taxaEntrega = enviadas > 0 ? (entregues / enviadas) * 100 : 0;
  const taxaLeitura = entregues > 0 && lidas > 0 ? (lidas / entregues) * 100 : 0;
  const numero = data && !comErro(data.saude) ? data.saude[0] : null;
  const q = numero ? QUALIDADE[numero.qualidade] : null;

  // Sparklines (série diária). Enviadas/entregues do Graph; lidas dos status próprios; custo/dia.
  const sparkEnv = volume.map((p) => p.sent);
  const sparkEnt = volume.map((p) => p.delivered);
  const sparkLidas = proprio.map((p) => p.lidas);
  const sparkCusto = custoPorDia.map((p) => p.valor);

  if (erro) return <div className="card"><div className="card-pad" style={{ color: "var(--crit)" }}>{erro}</div></div>;
  if (carregando && !data) return <div className="card"><div className="card-pad muted">Consultando a Meta…</div></div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {[7, 30, 90].map((d) => (
          <button key={d} className={"btn" + (periodo.tipo === "preset" && periodo.dias === d ? " primary" : "")} style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={() => { setCalAberto(false); setPeriodo({ tipo: "preset", dias: d }); }}>{d} dias</button>
        ))}
        <div className="cal-pop">
          <button className={"btn" + (periodo.tipo === "custom" ? " primary" : "")} style={{ padding: "6px 14px", fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}
            onClick={() => setCalAberto((v) => !v)} title="Escolher um período no calendário">
            <Icon name="calendar" size={13} />{periodo.tipo === "custom" ? rotuloPeriodo(periodo) : "Personalizado"}
          </button>
          {calAberto && (
            <CalendarioPeriodo
              valor={periodo.tipo === "custom" ? periodo : atalhoPeriodo("30d")}
              onChange={(p: PeriodoDatas) => { setPeriodo({ tipo: "custom", ...p }); setCalAberto(false); }}
              onFechar={() => setCalAberto(false)}
            />
          )}
        </div>
        {data?.cortado && <span style={{ fontSize: 12, color: "var(--warn)" }}>a Meta só devolve 90 dias por consulta — mostrando os últimos 90 do período</span>}
        {carregando && <span className="muted" style={{ fontSize: 12 }}>atualizando…</span>}
        <span className="muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>Dados da Meta (aprox., cache 5 min)</span>
      </div>

      {/* KPIs com sparklines */}
      <div className="omx-kpis">
        <Kpi rotulo="Qualidade" valor={q?.rotulo ?? "—"} valorCls={"omx-q " + (q?.cls ?? "")} sub={numero?.telefone ?? "número oficial"} />
        {/* A Meta parou de mandar o TIER em contas sem restrição (migrou pro throughput, que é
            capacidade por segundo). Antes o card mostrava só "—" e parecia defeito nosso. */}
        <Kpi
          rotulo="Limite de envio"
          valor={numero?.tier ? formatTier(numero.tier) : numero?.throughput ? rotuloThroughput(numero.throughput) : "Sem limite fixo"}
          sub={numero?.tier ? "conversas / 24h" : numero?.throughput ? "capacidade de envio (Meta)" : "a Meta não define teto pra esta conta"}
        />
        <Kpi rotulo="Enviadas" valor={nf(enviadas)} spark={sparkEnv} sub={`${rotuloPer}`} />
        <Kpi rotulo="Entregues" valor={nf(entregues)} spark={sparkEnt} cor="#2AA9E0" sub={enviadas > 0 ? `${Math.round(taxaEntrega)}% das enviadas` : `${rotuloPer}`} />
        <Kpi rotulo="Lidas" valor={lidas > 0 ? nf(lidas) : "—"} spark={sparkLidas} cor="#7C6CF0" sub={lidas > 0 ? (taxaLeitura ? `${Math.round(taxaLeitura)}% de leitura` : "abertas") : "começa a contar agora"} />
        <Kpi rotulo="Taxa de entrega" valor={enviadas > 0 ? `${taxaEntrega.toFixed(1)}%` : "—"} sub={`${nf(entregues)} de ${nf(enviadas)}`} />
        <Kpi rotulo="Custo total" valor={brl(custoTotal)} spark={sparkCusto} cor="#E8A33D" sub={`${rotuloPer}`} />
        <Kpi rotulo="Custo por conversa" valor={totalPago > 0 ? brl(custoTotal / totalPago) : "R$ 0,00"} sub={`${nf(totalPago)} pagas`} />
      </div>

      {/* Aviso honesto sobre lidas quando ainda não acumulou */}
      {lidas === 0 && (
        <div className="muted" style={{ fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 12px" }}>
          As <b>leituras</b> (✓✓ azul) são contadas a partir dos avisos de status da Meta — começam a aparecer nos próximos envios. Enviadas e entregues já vêm do histórico da conta.
        </div>
      )}

      {/* Volume por dia (área) + custo por dia (barras) */}
      <div className="omx-2col">
        <div className="card"><div className="card-pad">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Enviadas × entregues por dia</h3>
          {volume.length > 1 ? (
            <>
              <div className="omx-dual">
                <Sparkline valores={sparkEnv} />
              </div>
              <div className="omx-dual-legenda">
                <span><i style={{ background: "var(--accent-deep)" }} /> Enviadas ({nf(enviadas)})</span>
                <span><i style={{ background: "#2AA9E0" }} /> Entregues ({nf(entregues)})</span>
              </div>
            </>
          ) : volume.length === 1 ? (
            // Um dia só (calendário com a mesma data 2×): não há dois pontos pra ligar, mas há o
            // dia — mostrar "sem volume" com 952 envios na tela parecia defeito (print do dono, 30/09).
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", padding: "6px 0" }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{new Date(volume[0].start * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent-deep)" }}>{nf(volume[0].sent)} <small style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>enviadas</small></span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#2AA9E0" }}>{nf(volume[0].delivered)} <small style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>entregues</small></span>
              <span className="muted" style={{ fontSize: 12.5 }}>{volume[0].sent > 0 ? Math.round((volume[0].delivered / volume[0].sent) * 100) + "% de entrega" : ""}</span>
              <span className="muted" style={{ fontSize: 11.5, width: "100%" }}>Escolha um período de 2+ dias pra ver a curva.</span>
            </div>
          ) : <div className="muted" style={{ fontSize: 13 }}>Sem volume suficiente no período ainda.</div>}
        </div></div>
        {custoPorDia.length > 0 && custoTotal > 0
          ? <GraficoBarras titulo="Custo por dia (R$)" formata={brl} pontos={custoPorDia} />
          : <div className="card"><div className="card-pad"><h3 style={{ marginTop: 0, fontSize: 15 }}>Custo por dia (R$)</h3><div className="muted" style={{ fontSize: 13 }}>Nenhuma cobrança no período — conversa iniciada pelo cliente (Serviço) é grátis.</div></div></div>}
      </div>

      {/* Categoria: donut + tabela */}
      <div className="card"><div className="card-pad">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Mensagens pagas por categoria</h3>
        {porCategoria.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Nenhuma cobrança no período. A Meta só cobra template de Marketing/Utilidade/Autenticação fora da janela de 24h.</div>
        ) : (
          <div className="omx-cat">
            <Donut fatias={porCategoria.map(([cat, v]) => ({ cat, valor: v.custo || v.qtd }))} total={custoTotal || totalPago} />
            <table className="aff-table" style={{ margin: 0 }}>
              <thead><tr><th>Categoria</th><th>Mensagens</th><th>Custo</th></tr></thead>
              <tbody>
                {porCategoria.map(([cat, v]) => (
                  <tr key={cat}>
                    <td><span className="omx-cat-dot" style={{ background: COR_CAT[cat] ?? COR_CAT.OUTRA }} />{CATEGORIA[cat] ?? cat}</td>
                    <td>{nf(v.qtd)}</td>
                    <td>{v.custo > 0 ? brl(v.custo) : <span className="muted">grátis</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div></div>

      {/* ── Por template: funil + cliques por botão + custo estimado, no MESMO período ── */}
      <div className="card"><div className="card-pad">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Por template</h3>
          <span className="muted" style={{ fontSize: 12 }}>{rotuloPer} · clique numa linha pra ver o funil dia a dia</span>
        </div>
        {/* Os cards do topo e esta tabela são DUAS estatísticas diferentes da Meta: o topo é o
            número (tudo que saiu, bate com o Gerenciador na hora); aqui é por modelo, que a Meta
            processa em outra fila e chega com horas de atraso — 764 → 799 → 832 → 915 em duas
            horas no disparo de 30/09. Sem este aviso, a diferença parecia dado perdido. */}
        <div className="muted" style={{ fontSize: 11.5, margin: "-4px 0 10px" }}>
          Estes números são a estatística <b>por modelo</b> da Meta, que chega com algumas horas de atraso e sobe ao longo do dia.
          Os cards do topo são a estatística do <b>número</b> (tudo que saiu, em tempo real) — por isso, no mesmo dia, o topo fica acima da tabela até a Meta terminar de contar.
        </div>
        {tplErro ? (
          <div className="muted" style={{ fontSize: 13 }}>Não consegui consultar os templates: {tplErro}</div>
        ) : tplData === null ? (
          <div className="muted" style={{ fontSize: 13 }}>Consultando a Meta…</div>
        ) : (
          <>
            {tplData.capturaLigada === false && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8, color: "var(--warn)" }}>
                A captura de métricas por template está DESLIGADA nesta conta na Meta — os números ficam zerados até ligar.
              </div>
            )}
            {tplData.capturaAtivadaAgora && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                Liguei agora a captura de métricas por template. Não é retroativo: a Meta começa a contar dos próximos envios.
              </div>
            )}
            <div className="omx-tpl-filtros">
              <input className="inp" style={{ maxWidth: 260 }} placeholder="Buscar template…" value={tplBusca} onChange={(e) => setTplBusca(e.target.value)} />
              <select className="inp" style={{ maxWidth: 190 }} value={tplCat} onChange={(e) => setTplCat(e.target.value)}>
                <option value="">Todas as categorias</option>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidade</option>
                <option value="AUTHENTICATION">Autenticação</option>
              </select>
              <label className="muted" style={{ fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={tplSoComEnvio} onChange={(e) => setTplSoComEnvio(e.target.checked)} /> só com envios
              </label>
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{linhasTpl.length} template{linhasTpl.length === 1 ? "" : "s"}</span>
            </div>
            {linhasTpl.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Nenhum template com dados no período.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="omx-tpl-tabela">
                  <thead>
                    <tr>
                      <Th col="nome">Template</Th>
                      <Th col="enviadas" num>Enviadas</Th>
                      <Th col="entregues" num>Entregues</Th>
                      <Th col="lidas" num>Lidas</Th>
                      <Th col="cliques" num>Cliques</Th>
                      <th>Por botão</th>
                      <Th col="custoAprox" num>Custo ~</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasTpl.map((l) => (
                      <tr key={l.chave} onClick={() => setInsightsFor({ id: l.id, name: l.nome, category: l.categoria, language: l.idioma, wabaId: l.waba })}>
                        <td>
                          <div className="omx-tpl-nome">{l.nome}</div>
                          <span className="omx-tpl-cat">{CATEGORIA[l.categoria] ?? l.categoria}{l.idioma ? ` · ${l.idioma}` : ""}</span>
                        </td>
                        <td className="num">{nf(l.enviadas)}</td>
                        <td className="num">{nf(l.entregues)}<span className="omx-tpl-pct">{pctDe(l.entregues, l.enviadas)}</span></td>
                        <td className="num">{nf(l.lidas)}<span className="omx-tpl-pct">{pctDe(l.lidas, l.enviadas)}</span></td>
                        <td className="num">{nf(l.cliques)}{(() => { const c = pctCliques(l.cliques, l.enviadas); return <span className="omx-tpl-pct" title={c.titulo}>{c.texto}</span>; })()}</td>
                        <td>
                          {l.botoes.length ? (
                            <div className="omx-tpl-botoes">
                              {l.botoes.map((b) => (
                                <button key={b.texto} type="button" className="omx-tpl-botao omx-tpl-botao-click" title="Ver quem clicou"
                                  onClick={(e) => { e.stopPropagation(); setBotaoPopup({ template: l.nome, waba: l.waba, botao: b.texto, cliques: b.cliques }); }}>
                                  {b.texto} <b>{nf(b.cliques)}</b>
                                </button>
                              ))}
                            </div>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td className="num">{l.custoAprox != null ? "~" + brl(l.custoAprox) : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div></div>
      {insightsFor && (
        <TemplateInsights
          tpl={insightsFor}
          periodo={data?.de && data?.ate ? { de: data.de, ate: data.ate } : undefined}
          onClose={() => setInsightsFor(null)}
        />
      )}
      {botaoPopup && (
        <ContatosPopup
          titulo={`Clicaram em "${botaoPopup.botao}"`}
          subtitulo={`${botaoPopup.template} · ${rotuloPer} · ${nf(botaoPopup.cliques)} clique(s) segundo a Meta`}
          exportNome={`cliques-${botaoPopup.botao.replace(/\s+/g, "-").toLowerCase()}`}
          onClose={() => setBotaoPopup(null)}
          carregar={async () => {
            const per = data?.de && data?.ate ? `&de=${encodeURIComponent(data.de)}&ate=${encodeURIComponent(data.ate)}` : `&dias=${dias}`;
            const r = await jget(`/api/oficial/metricas/botao?template=${encodeURIComponent(botaoPopup.template)}&botao=${encodeURIComponent(botaoPopup.botao)}${botaoPopup.waba ? "&waba=" + encodeURIComponent(botaoPopup.waba) : ""}${per}`);
            const contatos = (r.contatos ?? []).map((c: any) => ({ phone: String(c.phone), name: c.name, ts: c.ts }));
            const aviso = r.tipo === "url"
              ? `Este é um botão de LINK: a Meta informa só o total (${nf(botaoPopup.cliques)} cliques) e não identifica quem clicou. Pra saber quem comprou, use a UTM do link na Kiwify.`
              : contatos.length < botaoPopup.cliques ? `A Meta contou ${nf(botaoPopup.cliques)} clique(s); aqui aparecem os ${contatos.length} que chegaram como resposta no WhatsApp (a mesma pessoa pode clicar mais de uma vez).` : "";
            return { contatos, aviso };
          }}
        />
      )}

      {comErro(data?.volume) && <div className="muted" style={{ fontSize: 12 }}>Volume indisponível: {(data!.volume as any).erro}</div>}
      {comErro(data?.custo) && <div className="muted" style={{ fontSize: 12 }}>Custo indisponível: {(data!.custo as any).erro}</div>}
    </div>
  );
}
