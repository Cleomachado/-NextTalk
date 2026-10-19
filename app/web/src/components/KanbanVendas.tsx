"use client";

// 🗂️ KANBAN DE VENDAS (/lancamento/kanban, 18/10/2026): cada lead da turma num card, na coluna do passo
// MAIS AVANÇADO que ele deu na esteira — carrinho → pagamento pendente → ingresso → bump → White Label.
// O card anda sozinho: os eventos da Kiwify chegam pelo webhook e a tela recarrega a cada 30 s (e ao
// voltar pra aba). Reembolso tira o lead da venda e vai pra coluna própria.
// Turma: mesma regra do resto do dashboard (lib/workshop-esteira.ts).
import { useEffect, useMemo, useState } from "react";
import { jget } from "@/lib/client";
import LancamentoAbas from "@/components/LancamentoAbas";
import { etapaDoProduto, turmaDaVenda, proximoSabado, somaDias, NOME_ETAPA, type EtapaEsteira } from "@/lib/workshop-esteira";
import { brl, int, diaBR, hojeSP, horaDe, diaDe } from "@/lib/lancamento-util";

interface Evento { fone: string; event: string; produto: string | null; valor: number | null; ts: number }
interface Pedido { fone: string; produto: string; bruto: number; liquido: number | null; nome?: string | null; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; pagamento?: string | null; ts: number }
interface Contato { f10: string; nome: string | null; foto: string | null }

type Coluna = "carrinho" | "pendente" | "ingresso" | "bump" | "whitelabel" | "reembolso";
const COLUNAS: Array<{ id: Coluna; rot: string; dica: string; cor: string }> = [
  { id: "carrinho", rot: "Carrinho abandonado", dica: "Preencheu os dados no checkout e não pagou", cor: "#f97316" },
  { id: "pendente", rot: "Pagamento pendente", dica: "Gerou Pix, boleto atrasado ou cartão recusado", cor: "#eab308" },
  { id: "ingresso", rot: "Ingresso pago", dica: "Comprou só o ingresso", cor: "#3b82f6" },
  { id: "bump", rot: "Ingresso + bump", dica: "Levou gravação ou vitalício junto", cor: "#a855f7" },
  { id: "whitelabel", rot: "White Label", dica: "Comprou no pitch", cor: "#22c55e" },
  { id: "reembolso", rot: "Reembolso", dica: "Pediu o dinheiro de volta", cor: "#f43f5e" },
];
const SP = (ts: number) => ({ data: diaDe(ts * 1000), dow: new Date(diaDe(ts * 1000) + "T12:00:00Z").getUTCDay(), hora: Number(horaDe(ts * 1000).slice(0, 2)) });
const quando = (ts: number) => {
  const min = Math.round((Date.now() / 1000 - ts) / 60);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return `${diaBR(diaDe(ts * 1000))} ${horaDe(ts * 1000)}`;
};

interface Lead {
  f10: string; fone: string; nome: string; foto: string | null; turma: string; coluna: Coluna; ultimo: number;
  produtos: Array<{ etapa: EtapaEsteira; liq: number }>; total: number; origem: string; pendencia: string | null;
}

export function KanbanVendas() {
  const hoje = hojeSP();
  const [d, setD] = useState<{ eventos: Evento[]; pedidos: Pedido[]; contatos: Contato[] } | null>(null);
  const [erro, setErro] = useState("");
  const [turmaSel, setTurmaSel] = useState("");
  const [busca, setBusca] = useState("");
  const [atualizado, setAtualizado] = useState<number>(0);

  async function carregar() {
    try { setD(await jget(`/api/lancamento/kanban?de=${somaDias(hoje, -35)}&ate=${somaDias(hoje, 1)}`)); setErro(""); setAtualizado(Date.now()); }
    catch (e: any) { setErro(e.message); }
  }
  useEffect(() => {
    void carregar();
    const t = setInterval(carregar, 30_000);
    const vis = () => { if (document.visibilityState === "visible") void carregar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leads = useMemo(() => {
    if (!d) return [] as Lead[];
    const nomes = new Map(d.contatos.map((c) => [c.f10, c]));
    const por = new Map<string, { ev: Evento[]; ped: Pedido[] }>();
    const pega = (f: string) => { const k = f.slice(-10); const x = por.get(k) ?? { ev: [], ped: [] }; por.set(k, x); return x; };
    for (const e of d.eventos) if (e.fone.length >= 10 && etapaDoProduto(e.produto) !== "outro") pega(e.fone).ev.push(e);
    for (const p of d.pedidos) if (p.fone.length >= 10 && etapaDoProduto(p.produto) !== "outro") pega(p.fone).ped.push(p);
    const out: Lead[] = [];
    for (const [f10, { ev, ped }] of por) {
      const todos = [...ev.map((e) => e.ts), ...ped.map((p) => p.ts)];
      const ultimo = Math.max(...todos);
      // compras: pedido gravado (com líquido) vence; sem ele, o evento de compra aprovada
      const comprados = new Map<EtapaEsteira, number>();
      for (const p of ped) { const e = etapaDoProduto(p.produto); comprados.set(e, (comprados.get(e) ?? 0) + (p.liquido ?? p.bruto ?? 0)); }
      for (const e of ev.filter((x) => x.event === "purchase_approved")) { const et = etapaDoProduto(e.produto); if (!comprados.has(et)) comprados.set(et, e.valor ?? 0); }
      const reembolso = ev.some((e) => e.event === "refund" || e.event === "chargeback");
      const coluna: Coluna = reembolso ? "reembolso" : comprados.has("whitelabel") ? "whitelabel"
        : comprados.has("gravacao") || comprados.has("vitalicio") ? "bump" : comprados.has("ingresso") ? "ingresso"
        : ev.some((e) => ["pix_generated", "purchase_refused", "payment_delayed"].includes(e.event)) ? "pendente" : "carrinho";
      const ultimoEv = [...ev].sort((a, b) => b.ts - a.ts)[0];
      const pendencia = coluna === "pendente" ? (ultimoEv?.event === "purchase_refused" ? "cartão recusado" : ultimoEv?.event === "payment_delayed" ? "boleto atrasado" : "Pix gerado") : null;
      // turma: a do ingresso (ou do WL pelo pitch); sem compra, a do último evento
      const ref = ped.find((p) => etapaDoProduto(p.produto) === "ingresso")?.ts ?? ev.find((e) => e.event === "purchase_approved" && etapaDoProduto(e.produto) === "ingresso")?.ts;
      const wlTs = ped.find((p) => etapaDoProduto(p.produto) === "whitelabel")?.ts;
      const base = ref ?? (coluna === "whitelabel" && wlTs ? wlTs : ultimo);
      const sp = SP(base);
      const turma = turmaDaVenda(!ref && coluna === "whitelabel" ? "whitelabel" : "ingresso", sp.data, sp.dow, sp.hora);
      const contato = nomes.get(f10);
      const pedNome = ped.find((p) => p.nome)?.nome;
      const utm = ped.find((p) => p.utm_source || p.utm_campaign);
      out.push({
        f10, fone: (ped[0]?.fone ?? ev[0]?.fone ?? f10), nome: contato?.nome || pedNome || "Sem nome", foto: contato?.foto ?? null, turma, coluna, ultimo,
        produtos: [...comprados.entries()].map(([etapa, liq]) => ({ etapa, liq })), total: [...comprados.values()].reduce((s, v) => s + v, 0),
        origem: utm ? [utm.utm_source, utm.utm_content || utm.utm_campaign].filter(Boolean).join(" · ") : "", pendencia,
      });
    }
    return out.sort((a, b) => b.ultimo - a.ultimo);
  }, [d]);

  const atual = proximoSabado(hoje);
  const turmas = useMemo(() => [...new Set([atual, ...leads.map((l) => l.turma)])].filter((t) => t <= somaDias(atual, 0)).sort().reverse(), [leads, atual]);
  const turma = turmaSel || atual;
  const nb = busca.trim().toLowerCase();
  const daTurma = leads.filter((l) => l.turma === turma && (!nb || l.nome.toLowerCase().includes(nb) || l.fone.includes(nb.replace(/\D/g, "") || "§")));

  if (!d) return <div className="lx"><LancamentoAbas /><div className="lx-card">{erro ? <span className="lx-ruim">{erro}</span> : "Carregando…"}</div></div>;
  const vendidos = daTurma.filter((l) => ["ingresso", "bump", "whitelabel"].includes(l.coluna));
  return (
    <div className="lx">
      <LancamentoAbas />
      <div className="lx-topo">
        <div>
          <h1 className="lx-titulo">Kanban de vendas · Turma {diaBR(turma)}</h1>
          <span className="lx-mut">{int(daTurma.length)} lead(s) · {int(vendidos.length)} comprador(es) · {brl(vendidos.reduce((s, l) => s + l.total, 0))} líquido · atualiza sozinho a cada 30 s{atualizado ? ` (última ${horaDe(atualizado)})` : ""}</span>
        </div>
        <div className="lx-filtros">
          <button className={"lx-chip" + (turma === atual ? " on" : "")} onClick={() => setTurmaSel("")}>Turma atual</button>
          <button className={"lx-chip" + (turma === somaDias(atual, -7) ? " on" : "")} onClick={() => setTurmaSel(somaDias(atual, -7))}>Turma anterior</button>
          <select className="lx-inp" value={turma} onChange={(e) => setTurmaSel(e.target.value)} aria-label="Escolher turma">
            {turmas.map((t) => <option key={t} value={t}>Turma {diaBR(t)}</option>)}
          </select>
          <input className="lx-inp" placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lead" />
        </div>
      </div>
      {erro && <div className="lx-aviso">{erro}</div>}
      <div className="lx-kb">
        {COLUNAS.map((c) => {
          const cards = daTurma.filter((l) => l.coluna === c.id);
          return (
            <section key={c.id} className="lx-kb-col" style={{ ["--kb" as any]: c.cor }} aria-label={c.rot}>
              <header className="lx-kb-cab" title={c.dica}>
                <b>{c.rot}</b><span className="lx-kb-n">{cards.length}</span>
                {cards.some((l) => l.total) && <small className="lx-mut">{brl(cards.reduce((s, l) => s + l.total, 0))}</small>}
              </header>
              <div className="lx-kb-lista">
                {cards.length === 0 && <p className="lx-kb-vazio">ninguém aqui</p>}
                {cards.map((l) => (
                  <article key={l.f10} className="lx-kb-card">
                    <div className="lx-kb-quem">
                      {l.foto ? <img src={l.foto} alt="" className="lx-kb-foto" loading="lazy" referrerPolicy="no-referrer" /> : <span className="lx-kb-foto ini">{l.nome.slice(0, 1).toUpperCase()}</span>}
                      <div style={{ minWidth: 0 }}>
                        <b className="lx-kb-nome">{l.nome}</b>
                        <a className="lx-kb-fone" href={`https://wa.me/${l.fone.length <= 11 ? "55" + l.fone : l.fone}`} target="_blank" rel="noreferrer">…{l.fone.slice(-4)} · WhatsApp ↗</a>
                      </div>
                    </div>
                    {l.produtos.length > 0 && (
                      <div className="lx-kb-tags">{l.produtos.map((p) => <span key={p.etapa} className={"lx-tag " + p.etapa}>{NOME_ETAPA[p.etapa]}</span>)}</div>
                    )}
                    {l.pendencia && <div className="lx-kb-tags"><span className="lx-tag pend">{l.pendencia}</span></div>}
                    <div className="lx-kb-rodape">
                      <span>{quando(l.ultimo)}</span>
                      {l.total > 0 && <b>{brl(l.total)}</b>}
                    </div>
                    {l.origem && <small className="lx-mut lx-kb-origem" title={l.origem}>{l.origem}</small>}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="lx-nota">O card vai sozinho pra coluna do passo mais avançado assim que a Kiwify avisa (carrinho → pagamento → compra → bump → White Label). Compras de teste do dono ficam de fora. Clique no telefone pra abrir a conversa no WhatsApp.</p>
    </div>
  );
}
