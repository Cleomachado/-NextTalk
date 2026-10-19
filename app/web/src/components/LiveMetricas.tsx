"use client";

// 🎥 MÉTRICAS DA LIVE (/lancamento/live-metricas, 18/10/2026): análise das aulas ao vivo do workshop.
// Fonte: Google Meet (padrão), Zoom ou CSV de presença — todas viram "sessões" de entrada/saída.
// Daqui sai: curva minuto a minuto (uma live ou várias comparadas pelo relógio), pico, quem estava
// no pitch do White Label e quem ficou até o fim, o funil ingresso → presença → White Label, e a
// lista de quem assistiu × quem comprou.
// ⚠️ O Meet não entrega e-mail do participante: lá o cruzamento com a venda é pelo NOME.
import { useEffect, useMemo, useState } from "react";
import { jget, jsend } from "@/lib/client";
import LancamentoAbas from "@/components/LancamentoAbas";
import { Linhas, type Marca } from "@/components/GraficoLinhas";
import { etapaDoProduto, turmaDaVenda, proximoSabado, somaDias, type EtapaEsteira } from "@/lib/workshop-esteira";
import { int, pct, diaBR, div, soma, hojeSP, diaDe, horaDe, duracao, instanteSP } from "@/lib/lancamento-util";

interface Sessao { pessoa: string; nome: string; email: string | null; entrada: string; saida: string | null }
interface Gravacao { tipo: "gravacao" | "transcricao"; url: string; inicio?: string | null }
interface FiltroLive { codigos: string[]; termo: string; minPessoas: number; juntar: boolean }
interface Live { id: string; fonte: "meet" | "zoom" | "csv"; titulo: string; codigo?: string | null; gravacoes?: Gravacao[] | null; ids?: string[]; inicio: string; fim: string | null; pitch: string | null; marcos: Array<{ rot: string; hhmm: string }> | null; turma: string | null; sessoes: Sessao[] }
interface Fontes { meet: { conectado: boolean; email: string | null; appGoogle: boolean }; zoom: { configurado: boolean; accountId: string | null; clientId: string | null } }
interface Venda { fone: string; produto: string; email?: string | null; nome?: string | null; ts?: number; data: string; hora: number; dow: number; liquido: number | null; bruto: number }
type VendaT = Venda & { etapa: EtapaEsteira; turma: string };

const CORES = ["#38bdf8", "#a855f7", "#22c55e", "#f97316", "#f43f5e", "#06b6d4", "#eab308", "#ec4899"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIA_LONGO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const normaliza = (s?: string | null) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const chaveNome = (s?: string | null) => { const p = normaliza(s).split(" ").filter((x) => x.length > 1); return p.length ? p[0] + " " + (p.length > 1 ? p[p.length - 1] : "") : ""; };

// ── análise de UMA live ───────────────────────────────────────────────────────────────────────
function analisa(l: Live, vendas: VendaT[], todas: Live[]) {
  const ses = l.sessoes;
  const t0 = Math.min(...ses.map((s) => Date.parse(s.entrada)));
  const fimMs = Math.max(...ses.map((s) => Date.parse(s.saida ?? s.entrada)), l.fim ? Date.parse(l.fim) : 0);
  const ini = Math.floor(t0 / 60_000) * 60_000;
  const minutos = Math.max(1, Math.ceil((fimMs - ini) / 60_000));
  const curva = Array.from({ length: minutos + 1 }, (_, m) => {
    const t = ini + m * 60_000 + 30_000;
    return new Set(ses.filter((s) => Date.parse(s.entrada) <= t && Date.parse(s.saida ?? l.fim ?? new Date(fimMs).toISOString()) > t).map((s) => s.pessoa)).size;
  });
  const pico = Math.max(0, ...curva);
  const dia = diaDe(t0);
  const dow = new Date(dia + "T12:00:00Z").getUTCDay();
  const turma = l.turma ?? (dow === 6 ? dia : proximoSabado(dia));
  const ativosEm = (t: number) => new Set(ses.filter((s) => Date.parse(s.entrada) <= t && Date.parse(s.saida ?? new Date(fimMs).toISOString()) > t).map((s) => s.pessoa));
  const tPitch = l.pitch ? instanteSP(dia, l.pitch) : NaN;
  const noPitch = Number.isFinite(tPitch) ? ativosEm(tPitch) : new Set<string>();
  const noFim = ativosEm(fimMs - 2 * 60_000);
  // pessoas: 1 linha por participante (sessões somadas)
  const pessoas = new Map<string, { pessoa: string; nome: string; email: string | null; entrada: number; saida: number; min: number }>();
  for (const s of ses) {
    const e = Date.parse(s.entrada), sa = Date.parse(s.saida ?? new Date(fimMs).toISOString());
    const x = pessoas.get(s.pessoa) ?? { pessoa: s.pessoa, nome: s.nome, email: s.email, entrada: e, saida: sa, min: 0 };
    x.entrada = Math.min(x.entrada, e); x.saida = Math.max(x.saida, sa); x.min += Math.max(0, (sa - e) / 60_000); if (!x.email && s.email) x.email = s.email;
    pessoas.set(s.pessoa, x);
  }
  // compradores (e-mail vence; sem e-mail, nome e sobrenome)
  const porEmail = new Map<string, VendaT[]>(), porNome = new Map<string, VendaT[]>();
  for (const v of vendas) {
    if (v.email) { const a = porEmail.get(v.email.toLowerCase()) ?? []; a.push(v); porEmail.set(v.email.toLowerCase(), a); }
    const k = chaveNome(v.nome); if (k.includes(" ") && k.split(" ")[1]) { const a = porNome.get(k) ?? []; a.push(v); porNome.set(k, a); }
  }
  const comprasDe = (p: { email: string | null; nome: string }) => {
    const porE = p.email ? porEmail.get(p.email.toLowerCase()) : undefined;
    if (porE?.length) return { vs: porE, por: "e-mail" as const };
    const k = chaveNome(p.nome);
    const porN = k.split(" ")[1] ? porNome.get(k) : undefined;
    return { vs: porN ?? [], por: "nome" as const };
  };
  // quantas lives essa pessoa já tinha visto até esta (perfil "1ª vez" / "Nx")
  const anteriores = todas.filter((x) => x.inicio <= l.inicio);
  const lista = [...pessoas.values()].sort((a, b) => a.entrada - b.entrada).map((p) => {
    const c = comprasDe(p);
    const vezes = anteriores.filter((x) => x.sessoes.some((s) => s.pessoa === p.pessoa || (p.email && s.email === p.email))).length;
    const doTurma = c.vs.filter((v) => v.turma === turma || v.etapa === "whitelabel");
    return {
      ...p, vezes, casouPor: c.vs.length ? c.por : null,
      ingresso: doTurma.some((v) => v.etapa === "ingresso"), gravacao: doTurma.some((v) => v.etapa === "gravacao"),
      vitalicio: doTurma.some((v) => v.etapa === "vitalicio"),
      wl: c.vs.some((v) => v.etapa === "whitelabel" && (v.ts ?? 0) * 1000 >= t0 - 3600_000 && (v.ts ?? 0) * 1000 <= fimMs + 7 * 86_400_000),
    };
  });
  const ingressos = vendas.filter((v) => v.turma === turma && v.etapa === "ingresso").length;
  const wls = vendas.filter((v) => v.etapa === "whitelabel" && v.turma === turma);
  const wlLive = wls.filter((v) => (v.ts ?? 0) * 1000 >= t0 && (v.ts ?? 0) * 1000 <= fimMs + 30 * 60_000);
  return {
    l, t0, fimMs, ini, curva, pico, picoEm: horaDe(ini + curva.indexOf(pico) * 60_000), dia, turma, minutos,
    participantes: pessoas.size, duracaoMin: (fimMs - t0) / 60_000, tPitch, noPitch: noPitch.size,
    ficaramFim: noFim.size, saidasPosPitch: [...noPitch].filter((p) => !noFim.has(p)).length,
    retencaoPosPitch: div([...noPitch].filter((p) => noFim.has(p)).length, noPitch.size),
    lista, ingressos, wlLive, wlSemana: wls, txComp: div(pessoas.size, ingressos),
  };
}
type Analise = ReturnType<typeof analisa>;

export function LiveMetricas() {
  const [lives, setLives] = useState<Live[] | null>(null);
  const [fontes, setFontes] = useState<Fontes | null>(null);
  const [vendas, setVendas] = useState<VendaT[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [modo, setModo] = useState<"cards" | "lista">("cards");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [verFontes, setVerFontes] = useState(false);
  const [filtro, setFiltro] = useState<FiltroLive>({ codigos: [], termo: "", minPessoas: 0, juntar: true });
  const [verFiltro, setVerFiltro] = useState(false);

  async function carregar() {
    try {
      const [a, b] = await Promise.all([jget("/api/lancamento/lives"), jget(`/api/lancamento?de=2026-08-01&ate=${hojeSP()}`)]);
      setLives(a.lives); setFontes(a.fontes); setErro("");
      if (a.filtro) setFiltro({ codigos: a.filtro.codigos ?? [], termo: a.filtro.termo ?? "", minPessoas: a.filtro.minPessoas ?? 0, juntar: a.filtro.juntar !== false });
      const hIni = Number(String(b.workshop?.inicio ?? "09:00").slice(0, 2)) || 9, hFim = Number(String(b.workshop?.fim ?? "15:00").slice(0, 2)) || 15;
      setVendas((b.vendas as Venda[]).map((v) => { const etapa = etapaDoProduto(v.produto); return { ...v, etapa, turma: turmaDaVenda(etapa, v.data, v.dow ?? 0, v.hora ?? 12, hIni, hFim) }; }).filter((v) => v.etapa !== "outro"));
      if (!a.lives.length) setVerFontes(true);
    } catch (e: any) { setErro(e.message); }
  }
  useEffect(() => {
    void carregar();
    const q = new URLSearchParams(location.search).get("meet");
    if (q === "ok") setMsg("Google Meet conectado. Clique em Sincronizar Google Meet.");
    else if (q === "sem_refresh") setMsg("O Google não devolveu a autorização completa. Remova o acesso em myaccount.google.com/permissions e conecte de novo.");
    else if (q === "erro") setMsg("Não deu pra conectar o Google Meet. Confira se a Google Meet REST API está ativada no projeto e tente de novo.");
  }, []);

  // Filtro salvo no servidor: só as lives do workshop (link da call e/ou nome da reunião, mínimo de
  // pessoas). "Juntar": o Meet gratuito corta a chamada a cada hora, então o MESMO link no MESMO dia
  // vira uma live só (sessões somadas, gravações juntas). Pitch e marcos ficam na 1ª sessão do dia.
  const lidas = useMemo(() => {
    if (!lives) return [];
    let ok = lives.filter((l) => l.sessoes.length);
    if (filtro.juntar) {
      const grupos = new Map<string, Live[]>();
      for (const l of ok) { const k = l.codigo ? l.codigo + "|" + diaDe(l.inicio) : l.id; grupos.set(k, [...(grupos.get(k) ?? []), l]); }
      ok = [...grupos.values()].map((g) => {
        if (g.length === 1) return g[0];
        const ord = [...g].sort((x, y) => x.inicio.localeCompare(y.inicio));
        const base = ord.find((x) => x.pitch) ?? ord[0];
        return { ...base, inicio: ord[0].inicio, fim: ord.map((x) => x.fim ?? "").sort().pop() || null, ids: ord.map((x) => x.id),
          sessoes: ord.flatMap((x) => x.sessoes), gravacoes: ord.flatMap((x) => x.gravacoes ?? []),
          marcos: ord.flatMap((x) => x.marcos ?? []), titulo: (ord.find((x) => !/^Google Meet/.test(x.titulo)) ?? base).titulo };
      }).sort((x, y) => y.inicio.localeCompare(x.inicio));
    }
    return ok;
  }, [lives, filtro.juntar]);
  const codigosConhecidos = useMemo(() => {
    const m = new Map<string, { codigo: string; titulo: string; n: number }>();
    for (const l of lidas) if (l.codigo) { const x = m.get(l.codigo) ?? { codigo: l.codigo, titulo: l.titulo, n: 0 }; x.n++; if (/^Google Meet/.test(x.titulo)) x.titulo = l.titulo; m.set(l.codigo, x); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [lidas]);
  const passaFiltro = (l: Live) => {
    if (filtro.codigos.length && !(l.codigo && filtro.codigos.includes(l.codigo))) return false;
    if (filtro.termo && !normaliza(l.titulo).includes(normaliza(filtro.termo))) return false;
    if (filtro.minPessoas && new Set(l.sessoes.map((s) => s.pessoa)).size < filtro.minPessoas) return false;
    return true;
  };
  const filtradas = lidas.filter(passaFiltro);
  const escondidas = lidas.length - filtradas.length;
  const analises = useMemo(() => filtradas.map((l) => analisa(l, vendas, filtradas)), [lidas, vendas, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  async function salvaFiltro(f: FiltroLive) {
    setFiltro(f); setSel([]);
    try { await jsend("/api/lancamento/lives/filtro", "PUT", f); } catch (e: any) { setMsg(e.message); }
  }
  const porId = useMemo(() => new Map(analises.map((a) => [a.l.id, a])), [analises]);
  // Sem seleção: a mais recente.
  const selecionadas = (sel.length ? sel : analises[0] ? [analises[0].l.id] : []).map((id) => porId.get(id)).filter(Boolean) as Analise[];
  const cor = (id: string) => CORES[Math.max(0, selecionadas.findIndex((a) => a.l.id === id)) % CORES.length];
  const alterna = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function sincronizar(fonte: "meet" | "zoom") {
    setMsg(fonte === "meet" ? "Buscando as aulas no Google Meet…" : "Buscando as aulas no Zoom…");
    try { const r = await jsend("/api/lancamento/lives/sincronizar", "POST", { fonte, dias: 90 }); setMsg(`${r.lives} live(s) e ${r.participantes} participante(s) sincronizados.`); void carregar(); }
    catch (e: any) { setMsg(e.message); }
  }

  const meses = useMemo(() => {
    const m = new Map<string, Analise[]>();
    for (const a of analises) { const k = a.dia.slice(0, 7); const x = m.get(k) ?? []; x.push(a); m.set(k, x); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [analises]);

  if (!lives) return <div className="lx"><LancamentoAbas /><div className="lx-card">{erro ? <span className="lx-ruim">{erro}</span> : "Carregando…"}</div></div>;
  const uma = selecionadas.length === 1 ? selecionadas[0] : null;

  return (
    <div className="lx">
      <LancamentoAbas />
      <div className="lx-topo">
        <div>
          <h1 className="lx-titulo">Métricas da live</h1>
          <span className="lx-mut">Análise das aulas ao vivo: presença minuto a minuto, pitch e conversão</span>
        </div>
        <div className="lx-filtros">
          <button className="lx-btn primario" onClick={() => sincronizar("meet")} disabled={!fontes?.meet.conectado} title={fontes?.meet.conectado ? "" : "Conecte o Google Meet em Fontes"}>Sincronizar Google Meet</button>
          <button className="lx-btn" onClick={() => sincronizar("zoom")} disabled={!fontes?.zoom.configurado} title={fontes?.zoom.configurado ? "" : "Configure o Zoom em Fontes"}>Sincronizar Zoom</button>
          <button className={"lx-btn" + (filtro.codigos.length || filtro.termo || filtro.minPessoas ? " primario" : "")} onClick={() => setVerFiltro(!verFiltro)}>Filtrar lives{escondidas ? ` (${escondidas} escondida${escondidas > 1 ? "s" : ""})` : ""}</button>
          <button className="lx-btn" onClick={() => setVerFontes(!verFontes)}>{verFontes ? "Fechar fontes" : "Fontes da live"}</button>
        </div>
      </div>
      {msg && <div className="lx-aviso">{msg}</div>}
      {erro && <div className="lx-aviso">{erro}</div>}
      {verFontes && fontes && <FontesLive fontes={fontes} onMudou={carregar} setMsg={setMsg} />}
      {verFiltro && (
        <div className="lx-card lx-filtro-live">
          <div className="lx-card-topo"><h3>Quais lives entram nas métricas</h3><span className="lx-mut">{filtradas.length} de {lidas.length} live(s) · fica salvo</span></div>
          <p className="lx-nota" style={{ marginTop: 0 }}>Marque o link da call do workshop. Sem nenhum marcado, entram todas.</p>
          <div className="lx-filtros" style={{ marginBottom: 10 }}>
            {codigosConhecidos.map((c) => {
              const on = filtro.codigos.includes(c.codigo);
              return (
                <button key={c.codigo} type="button" className={"lx-chip" + (on ? " on" : "")}
                  onClick={() => salvaFiltro({ ...filtro, codigos: on ? filtro.codigos.filter((x) => x !== c.codigo) : [...filtro.codigos, c.codigo] })}>
                  {on ? "✓ " : ""}{/^Google Meet/.test(c.titulo) ? c.codigo : `${c.titulo} · ${c.codigo}`} <small className="lx-mut">({c.n})</small>
                </button>
              );
            })}
          </div>
          <div className="lx-campos">
            <label className="lx-campo"><span>Nome da reunião contém</span><input className="lx-inp" value={filtro.termo} placeholder="ex.: Workshop" onChange={(e) => setFiltro({ ...filtro, termo: e.target.value })} onBlur={() => salvaFiltro(filtro)} /></label>
            <label className="lx-campo"><span>Mínimo de participantes</span><input className="lx-inp" type="number" min={0} value={filtro.minPessoas || ""} placeholder="0" onChange={(e) => setFiltro({ ...filtro, minPessoas: Number(e.target.value) || 0 })} onBlur={() => salvaFiltro(filtro)} /></label>
            <label className="lx-check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={filtro.juntar} onChange={(e) => salvaFiltro({ ...filtro, juntar: e.target.checked })} /> Juntar o mesmo link no mesmo dia</label>
          </div>
          {(filtro.codigos.length > 0 || filtro.termo || filtro.minPessoas > 0) && <button className="lx-btn" style={{ marginTop: 8 }} onClick={() => salvaFiltro({ codigos: [], termo: "", minPessoas: 0, juntar: filtro.juntar })}>Limpar filtro</button>}
        </div>
      )}

      {!analises.length ? (
        <div className="lx-card"><p className="lx-vazio">Nenhuma live ainda. Conecte o Google Meet (ou o Zoom) em Fontes da live, ou importe o CSV de presença.</p></div>
      ) : (
        <>
          <div className="lx-barra-info">
            <button className={"lx-chip" + (modo === "cards" ? " on" : "")} onClick={() => setModo("cards")}>Cards</button>
            <button className={"lx-chip" + (modo === "lista" ? " on" : "")} onClick={() => setModo("lista")}>Lista</button>
            <span className="lx-mut">{selecionadas.length} selecionada(s) · clique nos cards pra comparar</span>
            {sel.length > 0 && <button className="lx-btn" onClick={() => setSel([])}>Limpar seleção</button>}
          </div>

          {uma ? <Detalhe a={uma} /> : <Comparacao as={selecionadas} cor={cor} />}
          <Funil as={selecionadas} todas={analises} />

          {modo === "lista" ? (
            <div className="lx-card">
              <div className="lx-tab-wrap">
                <table className="lx-tab">
                  <thead><tr><th></th><th>Data</th><th>Live</th><th>Fonte</th><th>Participantes</th><th>Pico</th><th>Duração</th><th>Ingressos</th><th>Tx comp.</th><th>WL na live</th><th>WL semana</th></tr></thead>
                  <tbody>
                    {analises.map((a) => (
                      <tr key={a.l.id} className={selecionadas.includes(a) ? "on" : ""} onClick={() => alterna(a.l.id)} style={{ cursor: "pointer" }}>
                        <td><i className="lx-bolinha" style={{ background: selecionadas.includes(a) ? cor(a.l.id) : "transparent" }} /></td>
                        <td>{diaBR(a.dia)}</td><td>{a.l.titulo}</td><td>{NOME_FONTE[a.l.fonte]}</td><td>{int(a.participantes)}</td><td>{int(a.pico)}</td>
                        <td>{duracao(a.duracaoMin)}</td><td>{int(a.ingressos)}</td><td>{a.ingressos ? pct(a.txComp) : "—"}</td><td>{int(a.wlLive.length)}</td><td>{int(a.wlSemana.length)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : meses.map(([mes, as], i) => {
            const aberto = abertos[mes] ?? i === 0;
            return (
              <div key={mes}>
                <button className="lx-mes" onClick={() => setAbertos({ ...abertos, [mes]: !aberto })} aria-expanded={aberto}>
                  <span>{aberto ? "▾" : "▸"}</span> {MESES[Number(mes.slice(5, 7)) - 1]}/{mes.slice(0, 4)} <em>{as.length}</em>
                </button>
                {aberto && (
                  <div className="lx-lives">
                    {as.map((a) => {
                      const on = selecionadas.includes(a);
                      return (
                        <button key={a.l.id} className={"lx-live" + (on ? " on" : "")} style={on ? { borderColor: cor(a.l.id), boxShadow: `0 0 0 1px ${cor(a.l.id)} inset` } : undefined} onClick={() => alterna(a.l.id)}>
                          <span className="lx-live-data">{DIA_LONGO[new Date(a.dia + "T12:00:00Z").getUTCDay()]}, {a.dia.split("-").reverse().join("/")}</span>
                          <b>{a.l.titulo}</b>
                          <div className="lx-live-nums">
                            <span>Participantes <b>{int(a.participantes)}</b></span><span>Pico <b>{int(a.pico)}</b></span>
                            <span>Duração <b>{duracao(a.duracaoMin)}</b></span><span>Tx comp. <b className={a.txComp >= 0.5 ? "lx-bom" : "lx-amarelo"}>{a.ingressos ? pct(a.txComp) : "—"}</b></span>
                          </div>
                          <small className="lx-mut">{a.l.codigo ? `meet.google.com/${a.l.codigo}` : NOME_FONTE[a.l.fonte]} · turma {diaBR(a.turma)}{a.l.pitch ? ` · pitch ${a.l.pitch}` : ""}{a.l.gravacoes?.some((g) => g.tipo === "gravacao") ? " · tem gravação" : ""}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {uma && <Editor key={uma.l.id} a={uma} onSalvo={carregar} setMsg={setMsg} />}
          {uma && <Participantes a={uma} />}
        </>
      )}
    </div>
  );
}
const NOME_FONTE = { meet: "Google Meet", zoom: "Zoom", csv: "CSV" } as const;
function CopiaEscopo({ v }: { v: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="lx-copia"><code>{v}</code>
      <button type="button" className="lx-btn" onClick={() => void navigator.clipboard.writeText(v).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>{ok ? "Copiado" : "Copiar"}</button>
    </span>
  );
}

// Várias lives no mesmo relógio (as aulas são no mesmo horário), com o pitch de cada uma.
function Comparacao({ as, cor }: { as: Analise[]; cor: (id: string) => string }) {
  if (!as.length) return null;
  const minDia = (a: Analise) => Math.round((a.ini - instanteSP(a.dia, "00:00")) / 60_000);
  const ini = Math.min(...as.map(minDia));
  const fim = Math.max(...as.map((a) => minDia(a) + a.curva.length));
  const rot = Array.from({ length: fim - ini }, (_, i) => { const m = ini + i; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
  const marcas: Marca[] = as.filter((a) => a.l.pitch).map((a) => ({ i: rot.indexOf(a.l.pitch!), rot: `Pitch ${diaBR(a.dia)}`, cor: cor(a.l.id) }));
  return (
    <div className="lx-card">
      <div className="lx-card-topo"><h3>Comparação das lives</h3><div className="lx-filtros">{as.map((a) => <span key={a.l.id} className="lx-pilula" style={{ borderColor: cor(a.l.id), color: cor(a.l.id) }}>{diaBR(a.dia)}</span>)}</div></div>
      <Linhas rotulos={rot} altura={260} marcas={marcas}
        series={as.map((a) => ({ nome: diaBR(a.dia), cor: cor(a.l.id), area: true, valores: rot.map((_, i) => { const k = ini + i - minDia(a); return k >= 0 && k < a.curva.length ? a.curva[k] : null; }) }))} />
    </div>
  );
}

// Link da call e as gravações/transcrições no Drive (abre em aba nova pra assistir).
function Links({ l }: { l: Live }) {
  const gr = (l.gravacoes ?? []).filter((g) => g.tipo === "gravacao"), tr = (l.gravacoes ?? []).filter((g) => g.tipo === "transcricao");
  if (!l.codigo && !gr.length && !tr.length) return null;
  const hora = (g: Gravacao) => (g.inicio ? " " + horaDe(g.inicio) : "");
  return (
    <div className="lx-links-live">
      {l.codigo && <a className="lx-btn" href={`https://meet.google.com/${l.codigo}`} target="_blank" rel="noreferrer">Link da call: meet.google.com/{l.codigo} ↗</a>}
      {gr.map((g, i) => <a key={g.url} className="lx-btn primario" href={g.url} target="_blank" rel="noreferrer">Assistir gravação{gr.length > 1 ? ` ${i + 1}` : ""}{hora(g)} ↗</a>)}
      {tr.map((g, i) => <a key={g.url} className="lx-btn" href={g.url} target="_blank" rel="noreferrer">Transcrição{tr.length > 1 ? ` ${i + 1}` : ""} ↗</a>)}
    </div>
  );
}

function Detalhe({ a }: { a: Analise }) {
  const rot = a.curva.map((_, m) => horaDe(a.ini + m * 60_000));
  const idx = (hhmm: string) => rot.indexOf(hhmm);
  const marcas: Marca[] = [
    ...(a.l.pitch ? [{ i: idx(a.l.pitch), rot: "Pitch", cor: "#f43f5e" }] : []),
    ...(a.l.marcos ?? []).map((m) => ({ i: idx(m.hhmm), rot: m.rot, cor: "#eab308" })),
    ...a.wlLive.map((v) => ({ i: Math.round(((v.ts ?? 0) * 1000 - a.ini) / 60_000), rot: "WL", cor: "#22c55e" })),
  ];
  return (
    <div className="lx-card">
      <div className="lx-card-topo"><h3>Minuto a minuto · {a.l.titulo} · {a.dia.split("-").reverse().join("/")}</h3><span className="lx-mut">Pico <b className="lx-forte">{a.pico}</b> às {a.picoEm}</span></div>
      <Links l={a.l} />
      <Linhas rotulos={rot} altura={260} marcas={marcas} series={[{ nome: "Participantes ao vivo", cor: "#38bdf8", valores: a.curva, area: true }]} />
      <div className="lx-chips-info">
        <span>White Label na live <b>{a.wlLive.length}</b></span>
        <span>White Label na semana <b>{a.wlSemana.length}</b></span>
        <span>Pico <b>{a.pico}</b></span>
        <span>Pitch <b>{a.l.pitch ?? "não marcado"}</b></span>
        <span>Retenção pós-pitch <b>{a.l.pitch ? pct(a.retencaoPosPitch) : "—"}</b></span>
        <span>Duração <b>{duracao(a.duracaoMin)}</b></span>
      </div>
    </div>
  );
}

// Funil da live com a variação contra a live anterior (ou a média, quando várias selecionadas).
function Funil({ as, todas }: { as: Analise[]; todas: Analise[] }) {
  if (!as.length) return null;
  const media = (f: (a: Analise) => number) => soma(as, f) / as.length;
  const ant = as.length === 1 ? todas[todas.indexOf(as[0]) + 1] : undefined;
  const itens: Array<{ rot: string; v: number; a?: number; fmt: (n: number) => string; tom: string }> = [
    { rot: "Ingressos da turma", v: media((a) => a.ingressos), a: ant?.ingressos, fmt: int, tom: "verde" },
    { rot: "Comparecimento", v: media((a) => a.participantes), a: ant?.participantes, fmt: int, tom: "azul" },
    // régua do dono: comparecimento bom é acima de 50% de quem comprou
    { rot: "Tx comparecimento", v: media((a) => a.txComp || 0), a: ant?.txComp, fmt: (n) => pct(n), tom: (() => { const v = media((a) => a.txComp || 0); return !v ? "ciano" : v > 0.5 ? "verde" : v >= 0.35 ? "amarelo" : "vermelho"; })() },
    { rot: "White Label na live", v: media((a) => a.wlLive.length), a: ant?.wlLive.length, fmt: int, tom: "roxo" },
    { rot: "Tx conv. comparec. live", v: media((a) => div(a.wlLive.length, a.participantes) || 0), a: ant ? div(ant.wlLive.length, ant.participantes) : undefined, fmt: (n) => pct(n), tom: "ciano" },
    { rot: "Tx conv. ingressos live", v: media((a) => div(a.wlLive.length, a.ingressos) || 0), a: ant ? div(ant.wlLive.length, ant.ingressos) : undefined, fmt: (n) => pct(n), tom: "laranja" },
    { rot: "Tx conv. comparec. semana", v: media((a) => div(a.wlSemana.length, a.participantes) || 0), a: ant ? div(ant.wlSemana.length, ant.participantes) : undefined, fmt: (n) => pct(n), tom: "ciano" },
    { rot: "Tx conv. ingressos semana", v: media((a) => div(a.wlSemana.length, a.ingressos) || 0), a: ant ? div(ant.wlSemana.length, ant.ingressos) : undefined, fmt: (n) => pct(n), tom: "laranja" },
  ];
  return (
    <div className="lx-secao">
      <div className="lx-card-topo"><h3>Funil de conversão</h3><span className="lx-pilula amarela">{as.length > 1 ? `Média de ${as.length} lives` : `Live ${diaBR(as[0].dia)}${ant ? ` × ${diaBR(ant.dia)}` : ""}`}</span></div>
      <div className="lx-funil">
        {itens.map((x) => {
          const varia = x.a != null && Number.isFinite(x.a) && x.a !== 0 ? (x.v - x.a) / Math.abs(x.a) : null;
          return (
            <div key={x.rot} className={"lx-funil-it " + x.tom + (x.v ? "" : " inativo-z")}>
              <span className="lx-rot">{x.rot}</span><b>{x.fmt(x.v)}</b>
              {varia != null && <small className={varia >= 0 ? "lx-bom" : "lx-ruim"}>{varia >= 0 ? "▲" : "▼"} {Math.abs(varia * 100).toFixed(1).replace(".", ",")}%</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Editor({ a, onSalvo, setMsg }: { a: Analise; onSalvo: () => void; setMsg: (s: string) => void }) {
  const [pitch, setPitch] = useState(a.l.pitch ?? "");
  const [marcos, setMarcos] = useState<Array<{ rot: string; hhmm: string }>>(a.l.marcos?.length ? a.l.marcos : [{ rot: "Prova social", hhmm: "" }, { rot: "Pré-pitch", hhmm: "" }]);
  const [titulo, setTitulo] = useState(a.l.titulo);
  const [turma, setTurma] = useState(a.l.turma ?? a.turma);
  const [apagar, setApagar] = useState(false);
  async function salvar() {
    try { await jsend(`/api/lancamento/lives/${encodeURIComponent(a.l.id)}`, "PUT", { pitch, marcos, titulo, turma }); setMsg("Live salva."); onSalvo(); }
    catch (e: any) { setMsg(e.message); }
  }
  async function remover() {
    try { for (const id of a.l.ids ?? [a.l.id]) await jsend(`/api/lancamento/lives/${encodeURIComponent(id)}`, "DELETE", {}); setMsg("Live removida."); onSalvo(); }
    catch (e: any) { setMsg(e.message); }
  }
  return (
    <div className="lx-card">
      <div className="lx-card-topo"><h3>Live {a.dia.split("-").reverse().join("/")}</h3>
        <div className="lx-filtros">
          <label className="lx-campo-inline">Pitch <input className="lx-inp" type="time" value={pitch} onChange={(e) => setPitch(e.target.value)} /></label>
          <button className="lx-btn primario" onClick={salvar}>Salvar</button>
        </div>
      </div>
      <div className="lx-campos">
        <label className="lx-campo"><span>Nome da live</span><input className="lx-inp" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
        <label className="lx-campo"><span>Turma (sábado)</span><input className="lx-inp" type="date" value={turma} onChange={(e) => setTurma(e.target.value)} /></label>
        {marcos.map((m, i) => (
          <label key={i} className="lx-campo"><span>Marco {i + 1}</span>
            <div className="lx-marco-edit">
              <input className="lx-inp" value={m.rot} placeholder="ex.: Prova social" onChange={(e) => setMarcos(marcos.map((x, k) => (k === i ? { ...x, rot: e.target.value } : x)))} />
              <input className="lx-inp" type="time" value={m.hhmm} onChange={(e) => setMarcos(marcos.map((x, k) => (k === i ? { ...x, hhmm: e.target.value } : x)))} />
              <button className="lx-btn" aria-label="Remover marco" onClick={() => setMarcos(marcos.filter((_, k) => k !== i))}>×</button>
            </div>
          </label>
        ))}
      </div>
      <div className="lx-barra-info" style={{ marginTop: 8 }}>
        <button className="lx-btn" onClick={() => setMarcos([...marcos, { rot: "", hhmm: "" }])}>Adicionar marco</button>
        {!apagar ? <button className="lx-btn" onClick={() => setApagar(true)}>Remover esta live</button>
          : <><span className="lx-ruim">Apagar a live e a lista de presença?</span><button className="lx-btn" onClick={remover}>Sim, apagar</button><button className="lx-btn" onClick={() => setApagar(false)}>Cancelar</button></>}
      </div>
      <div className="lx-metas-grid" style={{ marginTop: 12 }}>
        <Num rot="Participantes" v={int(a.participantes)} />
        <Num rot="Pico" v={int(a.pico)} sub={`às ${a.picoEm}`} />
        <Num rot="Duração" v={duracao(a.duracaoMin)} />
        <Num rot="White Label na live" v={int(a.wlLive.length)} />
        <Num rot="White Label na semana" v={int(a.wlSemana.length)} />
        <Num rot="No pitch" v={a.l.pitch ? int(a.noPitch) : "—"} sub={a.l.pitch ? `${pct(div(a.noPitch, a.pico))} do pico` : "marque o horário do pitch"} />
        <Num rot="Retenção pós-pitch" v={a.l.pitch ? pct(a.retencaoPosPitch) : "—"} />
        <Num rot="Saídas pós-pitch" v={a.l.pitch ? int(a.saidasPosPitch) : "—"} />
        <Num rot="Ficaram até o fim" v={int(a.ficaramFim)} />
      </div>
    </div>
  );
}
function Num({ rot, v, sub }: { rot: string; v: string; sub?: string }) {
  return <div className="lx-metacard"><span className="lx-rot">{rot}</span><b>{v}</b>{sub && <small className="lx-mut">{sub}</small>}</div>;
}

function Participantes({ a }: { a: Analise }) {
  const [filtro, setFiltro] = useState<"todos" | "compr" | "nao">("todos");
  const comprou = (p: Analise["lista"][number]) => p.ingresso || p.gravacao || p.vitalicio || p.wl;
  const lista = a.lista.filter((p) => filtro === "todos" || (filtro === "compr" ? comprou(p) : !comprou(p)));
  const porNome = a.lista.some((p) => p.casouPor === "nome");
  function exportar() {
    const cab = ["Nome", "Perfil", "Email", "Entrada", "Saida", "Duracao (min)", "Ingresso", "Gravacao", "Vitalicio", "White Label"];
    const linhas = lista.map((p) => [p.nome, p.vezes > 1 ? `${p.vezes}x` : "1a vez", p.email ?? "", horaDe(p.entrada), horaDe(p.saida), Math.round(p.min), p.ingresso ? "Sim" : "Nao", p.gravacao ? "Sim" : "Nao", p.vitalicio ? "Sim" : "Nao", p.wl ? "Sim" : "Nao"]);
    const csv = [cab, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const el = document.createElement("a"); el.href = url; el.download = `participantes-live-${a.dia}.csv`; el.click(); URL.revokeObjectURL(url);
  }
  const SimNao = ({ v }: { v: boolean }) => <span className={"lx-sn" + (v ? " sim" : "")}>{v ? "Sim" : "Não"}</span>;
  return (
    <div className="lx-card">
      <div className="lx-card-topo">
        <h3>Participantes da live</h3>
        <div className="lx-filtros">
          {(["todos", "compr", "nao"] as const).map((f) => <button key={f} className={"lx-chip" + (filtro === f ? " on" : "")} onClick={() => setFiltro(f)}>{f === "todos" ? "Todos" : f === "compr" ? "Compradores" : "Não compraram"}</button>)}
          <button className="lx-btn" onClick={exportar}>Exportar CSV</button>
        </div>
      </div>
      <p className="lx-nota" style={{ marginTop: -4 }}>{lista.length} participante(s){porNome ? " · no Google Meet o cruzamento com a compra é pelo nome e sobrenome (o Meet não informa o e-mail)" : ""}</p>
      <div className="lx-tab-wrap">
        <table className="lx-tab">
          <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Ingresso</th><th>Gravação</th><th>Vitalício</th><th>White Label</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.pessoa}>
                <td>{p.nome}</td>
                <td><span className={"lx-tag" + (p.vezes > 1 ? " gravacao" : " ingresso")}>{p.vezes > 1 ? `${p.vezes}x` : "1ª vez"}</span></td>
                <td>{p.email ?? "—"}</td><td>{horaDe(p.entrada)}</td><td>{horaDe(p.saida)}</td><td>{duracao(p.min)}</td>
                <td><SimNao v={p.ingresso} /></td><td><SimNao v={p.gravacao} /></td><td><SimNao v={p.vitalicio} /></td><td><SimNao v={p.wl} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Conexão das fontes: Google Meet (OAuth), Zoom (Server-to-Server) e CSV de presença.
function FontesLive({ fontes, onMudou, setMsg }: { fontes: Fontes; onMudou: () => void; setMsg: (s: string) => void }) {
  const [z, setZ] = useState({ accountId: fontes.zoom.accountId ?? "", clientId: fontes.zoom.clientId ?? "", clientSecret: "" });
  const [csv, setCsv] = useState<{ texto: string; nome: string }>({ texto: "", nome: "" });
  const [dia, setDia] = useState(somaDias(proximoSabado(hojeSP()), -7));
  const [hora, setHora] = useState("09:00");
  const [titulo, setTitulo] = useState("");
  async function conectarMeet() {
    try { const r = await jsend("/api/lancamento/lives/meet/conectar", "POST", {}); location.href = r.url; }
    catch (e: any) { setMsg(e.message); }
  }
  async function salvarZoom() {
    try { await jsend("/api/lancamento/lives/zoom", "PUT", z); setMsg("Zoom conectado. Agora é só sincronizar."); onMudou(); }
    catch (e: any) { setMsg(e.message); }
  }
  async function importar() {
    try { const r = await jsend("/api/lancamento/lives/importar", "POST", { csv: csv.texto, dia, hora, titulo }); setMsg(`Live importada com ${r.participantes} participante(s).`); setCsv({ texto: "", nome: "" }); onMudou(); }
    catch (e: any) { setMsg(e.message); }
  }
  return (
    <div className="lx-grid3">
      <div className="lx-card">
        <h3>Google Meet</h3>
        {fontes.meet.conectado ? <p className="lx-bom">Conectado{fontes.meet.email ? ` como ${fontes.meet.email}` : ""}.</p> : <p className="lx-mut">Conecte a conta Google que <b>cria a reunião</b> da aula (o Meet só mostra a presença pra quem organizou).</p>}
        <button className="lx-btn primario" onClick={conectarMeet} disabled={!fontes.meet.appGoogle}>{fontes.meet.conectado ? "Reconectar" : "Conectar Google Meet"}</button>
        <details className="lx-det"><summary>Primeira vez? 3 passos no Google Cloud</summary>
          <ol>
            <li><a href="https://console.cloud.google.com/apis/library/meet.googleapis.com" target="_blank" rel="noreferrer">Ativar a Google Meet REST API ↗</a> e a <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API ↗</a> (é dela que vem o nome da reunião). Confira no topo que está no projeto do login Google do ZapConverte.</li>
            <li><a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noreferrer">Acesso a dados → Adicionar ou remover escopos ↗</a>. Em "Adicionar escopos manualmente", cole o endereço COMPLETO (só o nome dá "escopo inválido"):
              <CopiaEscopo v="https://www.googleapis.com/auth/meetings.space.readonly" />
              <CopiaEscopo v="https://www.googleapis.com/auth/calendar.events.readonly" />
              Clique em Adicionar à tabela e depois em Atualizar e Salvar.</li>
            <li>Se o app estiver em modo de teste: <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Público-alvo → Usuários de teste ↗</a> e inclua a conta que cria a reunião (nesse modo a autorização dura 7 dias). Depois clique em Reconectar aqui.</li>
          </ol>
        </details>
      </div>
      <div className="lx-card">
        <h3>Zoom</h3>
        <p className="lx-mut">{fontes.zoom.configurado ? "Configurado." : "App Server-to-Server OAuth no marketplace do Zoom, com os escopos de relatório de reuniões e webinars."}</p>
        <div className="lx-campos">
          <label className="lx-campo"><span>Account ID</span><input className="lx-inp" value={z.accountId} onChange={(e) => setZ({ ...z, accountId: e.target.value })} /></label>
          <label className="lx-campo"><span>Client ID</span><input className="lx-inp" value={z.clientId} onChange={(e) => setZ({ ...z, clientId: e.target.value })} /></label>
          <label className="lx-campo"><span>Client Secret</span><input className="lx-inp" type="password" value={z.clientSecret} placeholder={fontes.zoom.configurado ? "guardado (cifrado)" : ""} onChange={(e) => setZ({ ...z, clientSecret: e.target.value })} /></label>
        </div>
        <button className="lx-btn primario" onClick={salvarZoom} style={{ marginTop: 8 }}>Testar e salvar</button>
      </div>
      <div className="lx-card">
        <h3>CSV de presença</h3>
        <p className="lx-mut">Relatório de presença do Meet, extensão de presença ou planilha. Colunas aceitas: nome, e-mail, entrada, saída ou duração.</p>
        <div className="lx-campos">
          <label className="lx-campo"><span>Dia da live</span><input className="lx-inp" type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
          <label className="lx-campo"><span>Início</span><input className="lx-inp" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
          <label className="lx-campo"><span>Nome (opcional)</span><input className="lx-inp" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
          <label className="lx-campo"><span>Arquivo .csv</span>
            <input className="lx-inp" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => setCsv({ texto: t, nome: f.name })); }} />
          </label>
        </div>
        <button className="lx-btn primario" onClick={importar} disabled={!csv.texto} style={{ marginTop: 8 }}>Importar{csv.nome ? ` ${csv.nome}` : ""}</button>
      </div>
    </div>
  );
}

