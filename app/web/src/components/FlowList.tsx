"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { jget, jsend, Automation, Step, TRIGGERS, STEP_META, origemDoFluxo } from "@/lib/client";
import { ehFluxoN8n, converteN8n } from "@/lib/n8n-import";
import { Icon, stepIcon, triggerIcon } from "@/components/icons";
import { useAccounts, numeroDoFluxo } from "@/components/accounts";

const isActive = (a: Automation) => a.enabled !== false;
// Canal do fluxo (pro filtro): API Oficial quando o número escolhido é o oficial ("api"/"meta-…") ou,
// sem número, quando tem passo de template; o resto é WhatsApp Lite.
const ehOficial = (a: Automation): boolean => {
  const c = String((a.trigger === "schedule" ? ((a as any).scheduleAccount ?? (a as any).conta) : (a as any).conta) ?? "").trim();
  if (c) return c === "api" || c.startsWith("meta");
  return (a.steps ?? []).some((s: any) => s?.type === "template");
};

// Prévia dos nós: agrupa por tipo e mostra ícone+rótulo com contagem (×N).
function nodePreview(steps: Step[]): Array<{ type: string; n: number; label: string }> {
  const counts: Record<string, number> = {};
  for (const s of steps) counts[s.type] = (counts[s.type] ?? 0) + 1;
  return Object.entries(counts).map(([type, n]) => ({ type, n, label: STEP_META[type]?.label ?? type }));
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FlowList() {
  const router = useRouter();
  const { accounts: contasDoWs } = useAccounts();
  const [autos, setAutos] = useState<Automation[] | null>(null);
  const [err, setErr] = useState<string | null>(null); // erro de CARREGAMENTO (página cheia)
  const [notice, setNotice] = useState<string | null>(null); // aviso de SAVE (discreto, não apaga a lista)
  const [busy, setBusy] = useState(false);
  // Relatório da importação do n8n — o que veio e o que ficou de fora.
  const [importado, setImportado] = useState<{ id: string; nome: string; convertidos: number; avisos: string[] } | null>(null);
  const [q, setQ] = useState("");
  // Filtros rápidos (pedido do dono, 13/10): status e canal.
  const [fStatus, setFStatus] = useState<"" | "ativos" | "inativos">("");
  const [fCanal, setFCanal] = useState<"" | "api" | "lite">("");
  // Cópia recém-criada: segura o aviso verde e destaca a linha nova. Antes o "Duplicar" criava a
  // cópia e PULAVA pro editor — na tela era idêntico ao "Abrir", então parecia que não duplicou
  // (o dono clicou 2× e ficou com 2 cópias, 29/09). A cópia nasce RASCUNHO e a lista põe ativos
  // primeiro: ela ia parar no fim de 50 fluxos, a 58% de opacidade. Agora ela vem até os olhos.
  const [copiada, setCopiada] = useState<{ id: string; nome: string } | null>(null);
  const copiaRef = useRef<HTMLDivElement | null>(null);
  const [iaAberta, setIaAberta] = useState(false);
  // Quantas pessoas já entraram em cada funil (bolinha à esquerda). Uma chamada só pra todos.
  const [totais, setTotais] = useState<Record<string, number>>({});
  useEffect(() => { jget("/api/flow-totals").then((d) => setTotais(d.totals ?? {})).catch(() => {}); }, []);
  const importRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (copiada && copiaRef.current) copiaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [copiada]);

  useEffect(() => {
    jget("/api/automations").then((d) => setAutos(d.automations ?? [])).catch((e) => setErr(e.message));
  }, []);

  // Salva a lista. Falha de save NÃO apaga a página: reverte pro estado anterior e mostra um aviso
  // discreto — assim uma falha transitória (motor reiniciando no deploy, rede) não parece perda de dados.
  async function persist(next: Automation[]) {
    const prev = autos;
    setAutos(next); // otimista
    setNotice(null);
    try {
      const r = await jsend("/api/automations", "PUT", { automations: next });
      if (Array.isArray(r.automations)) setAutos(r.automations); // reconcilia com a verdade do servidor
    } catch (e: any) {
      setAutos(prev ?? null); // nada foi salvo → volta o que estava (o fluxo "excluído" reaparece)
      setNotice("Não deu pra salvar agora — nada foi perdido. Tente de novo. (" + (e?.message || "erro") + ")");
    }
  }
  async function toggle(a: Automation) {
    if (!autos) return;
    await persist(autos.map((x) => (x.id === a.id ? { ...x, enabled: !isActive(a) } : x)));
  }
  async function del(a: Automation) {
    if (!autos || !confirm(`Excluir o fluxo "${a.name || a.id}"? Isso não tem volta.`)) return;
    await persist(autos.filter((x) => x.id !== a.id));
  }

  // Nome da cópia sem colidir: "X (cópia)", depois "X (cópia 2)", "X (cópia 3)"…
  function nomeDaCopia(base: string, lista: Automation[]): string {
    const limpo = base.replace(/\s*\(cópia(?:\s+\d+)?\)\s*$/i, "").trim() || "Fluxo";
    const usados = new Set(lista.map((x) => (x.name || x.id).trim().toLowerCase()));
    let nome = `${limpo} (cópia)`;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${limpo} (cópia ${n})`;
    return nome;
  }

  async function duplicar(a: Automation) {
    if (!autos || busy) return;
    setBusy(true);
    // A cópia NÃO herda as credenciais do original. O token do webhook vai na URL, e essa URL muda
    // junto com o id do fluxo — teria de ser recadastrada na plataforma de qualquer jeito. Já o
    // segredo da plataforma, se viesse junto, se multiplicaria a cada cópia sem ninguém perceber:
    // o dia que precisar girar, sobra segredo velho espalhado em fluxo que ninguém lembra.
    const { webhookToken: _t, webhookSegredoEnc: _s, ...limpo } = a as any;
    const copia: Automation = {
      ...limpo,
      id: "fluxo-" + Date.now(),
      name: nomeDaCopia(a.name || a.id, autos),
      // Nasce RASCUNHO de propósito: cópia que já sai ativa manda a MESMA mensagem duas vezes pro
      // mesmo cliente, e ninguém duplica um fluxo pra deixá-lo idêntico.
      enabled: false,
      updatedAt: new Date().toISOString(),
    };
    try {
      const r = await jsend("/api/automations", "PUT", { automations: [...autos, copia] });
      setAutos(Array.isArray(r.automations) ? r.automations : [...autos, copia]);
      setCopiada({ id: copia.id, nome: copia.name || copia.id });
      setBusy(false);
    } catch (e: any) { setNotice("Não deu pra duplicar agora — nada foi criado. (" + (e?.message || "erro") + ")"); setBusy(false); }
  }

  async function createFlow(base: { name: string; trigger: string; keyword?: string; steps: Step[] }) {
    if (!autos || busy) return;
    setBusy(true);
    const id = "fluxo-" + Date.now();
    const nova: Automation = { id, name: base.name, trigger: base.trigger, ...(base.keyword ? { keyword: base.keyword } : {}), platforms: ["*"], steps: base.steps, enabled: false, updatedAt: new Date().toISOString() };
    try {
      await jsend("/api/automations", "PUT", { automations: [...autos, nova] });
      router.push(`/fluxos/${encodeURIComponent(id)}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  function novo() { createFlow({ name: "Novo fluxo", trigger: "purchase_approved", steps: [] }); }

  // Salva o fluxo que a IA montou (já vem com nós, conexões e posições) e abre no builder.
  async function salvaDaIA(a: Automation) {
    if (!autos || busy) return;
    setBusy(true);
    try {
      await jsend("/api/automations", "PUT", { automations: [...autos, { ...a, updatedAt: new Date().toISOString() }] });
      router.push(`/fluxos/${encodeURIComponent(a.id)}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  // Importa o fluxo INTEIRO (não só nome/gatilho/passos) — sem isto um fluxo de palavra-chave
  // perdia a palavra-chave, um de checkout perdia os eventos marcados, e um de template perdia
  // o template escolhido: a pessoa baixava e reimportava um fluxo quebrado (pedido do dono,
  // 24/08, junto com o botão de baixar no editor). Mesma cautela do "Duplicar": token e segredo
  // do webhook NUNCA vêm junto (a URL muda de qualquer jeito com o id novo) e nasce rascunho.
  // Depois de importar do n8n: o que NÃO veio junto. Fica na tela até a pessoa ler — some
  // silenciosamente seria pior que não importar.
  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !autos || busy) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const j = JSON.parse(String(reader.result));
        // Arquivo exportado do n8n: converte antes (nós, ligações, expressões e posições).
        if (ehFluxoN8n(j)) {
          const r = converteN8n(j);
          if (!r.auto.steps.length) throw new Error("não achei nenhum passo aproveitável neste fluxo do n8n");
          const novaN8n = { ...r.auto, id: "fluxo-" + Date.now(), updatedAt: new Date().toISOString() } as Automation;
          setBusy(true);
          await jsend("/api/automations", "PUT", { automations: [...autos, novaN8n] });
          if (r.avisos.length) { setImportado({ id: novaN8n.id, nome: novaN8n.name || "", convertidos: r.convertidos, avisos: r.avisos }); setBusy(false); return; }
          router.push(`/fluxos/${encodeURIComponent(novaN8n.id)}`);
          return;
        }
        const steps = Array.isArray(j?.steps) ? (j.steps as Step[]) : [];
        if (!steps.length) throw new Error("arquivo sem passos válidos");
        // exemploWebhook fica de fora na entrada também: arquivo antigo (ou de outra pessoa) não
        // planta dado pessoal de terceiro dentro da conta de quem importou.
        const { id: _id, webhookToken: _t, webhookSegredoEnc: _s, updatedAt: _u, exemploWebhook: _e, ...resto } = j as any;
        const nova: Automation = {
          ...resto,
          id: "fluxo-" + Date.now(),
          name: String(j?.name || "Fluxo importado"),
          trigger: typeof j?.trigger === "string" && j.trigger ? j.trigger : "purchase_approved",
          steps,
          enabled: false,
          updatedAt: new Date().toISOString(),
        };
        setBusy(true);
        await jsend("/api/automations", "PUT", { automations: [...autos, nova] });
        router.push(`/fluxos/${encodeURIComponent(nova.id)}`);
      } catch (ex: any) { setErr("Importação falhou: " + ex.message); setBusy(false); }
    };
    reader.readAsText(f);
  }

  const filtered = useMemo(() => {
    if (!autos) return [];
    const term = q.trim().toLowerCase();
    const list = (term ? autos.filter((a) => (a.name || a.id).toLowerCase().includes(term) || (a.keyword ?? "").toLowerCase().includes(term)) : autos)
      .filter((a) => !fStatus || (fStatus === "ativos" ? isActive(a) : !isActive(a)))
      .filter((a) => !fCanal || (fCanal === "api" ? ehOficial(a) : !ehOficial(a)));
    // O ÚLTIMO EDITADO no topo, sempre (pedido do dono, 13/10) — ativo ou não.
    return [...list].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  }, [autos, q, fStatus, fCanal]);

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!autos) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="flow-search-wrap">
          <Icon name="search" size={16} className="flow-search-ico" />
          <input className="inp flow-search" placeholder="Buscar fluxo pelo nome…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn ic" onClick={() => importRef.current?.click()} disabled={busy}><Icon name="download" size={16} /> Importar</button>
        <button className="btn ic fluxo-ia-btn" onClick={() => setIaAberta(true)} disabled={busy}><Icon name="spark" size={16} /> Criar com IA</button>
        <button className="btn primary ic" onClick={novo} disabled={busy}><Icon name="plus" size={16} /> Novo fluxo</button>
      </div>
      <div className="tpl-filtros" role="group" aria-label="Filtrar fluxos">
        {([["", "Todos"], ["ativos", "Ativos"], ["inativos", "Inativos"]] as const).map(([v, r]) => (
          <button key={"s" + v} type="button" className={"tpl-filtro" + (fStatus === v ? " on" : "")} onClick={() => setFStatus(v)}>
            {r} <b>{(autos ?? []).filter((a) => !v || (v === "ativos" ? isActive(a) : !isActive(a))).length}</b>
          </button>
        ))}
        <span style={{ width: 1, background: "var(--line)", margin: "0 4px" }} />
        {([["", "Todos os números"], ["api", "API Oficial"], ["lite", "WhatsApp Lite"]] as const).map(([v, r]) => (
          <button key={"c" + v} type="button" className={"tpl-filtro" + (fCanal === v ? " on" : "")} onClick={() => setFCanal(v)}>
            {r} <b>{(autos ?? []).filter((a) => !v || (v === "api" ? ehOficial(a) : !ehOficial(a))).length}</b>
          </button>
        ))}
      </div>

      {iaAberta && <CriarComIA onFechar={() => setIaAberta(false)} onUsar={salvaDaIA} salvando={busy} />}

      {copiada && (
        <div className="flow-notice ok" role="status">
          <Icon name="copy" size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Cópia criada: <b>{copiada.nome}</b>. Ela nasce como <b>rascunho</b>, por isso aparece mais apagada e no fim da lista.</span>
          <Link href={`/fluxos/${encodeURIComponent(copiada.id)}`} className="btn ic" style={{ padding: "2px 10px" }}>Abrir a cópia</Link>
          <button className="btn" onClick={() => setCopiada(null)} style={{ padding: "2px 10px" }}>OK</button>
        </div>
      )}

      {notice && (
        <div className="flow-notice" role="alert">
          <Icon name="warn" size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button className="btn" onClick={() => setNotice(null)} style={{ padding: "2px 10px" }}>OK</button>
        </div>
      )}

      {autos.length === 0 ? (
        <div className="card"><div className="card-pad muted">Nenhum fluxo ainda. Clique em “Novo fluxo” pra criar do zero, ou vá em <b>Templates</b> (no menu) e use um modelo pronto.</div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-pad muted">Nenhum fluxo encontrado pra “{q}”.</div></div>
      ) : (
        <div className="flow-list">
          {filtered.map((a) => {
            const t = TRIGGERS[a.trigger] ?? { label: a.trigger, emoji: "•" };
            const active = isActive(a);
            const kws = (a.keyword ?? "").split(",").map((k) => k.trim()).filter(Boolean);
            const preview = nodePreview(a.steps);
            const shown = preview.slice(0, 5);
            const extra = preview.length - shown.length;
            const date = fmtDate(a.updatedAt);
            const empty = a.steps.length === 0;
            const kwMissing = a.trigger === "keyword" && kws.length === 0;
            return (
              <div
                key={a.id}
                ref={a.id === copiada?.id ? copiaRef : undefined}
                className={"flow-row" + (active ? " active" : " draft") + (a.id === copiada?.id ? " destaque" : "")}
              >
                <div className={"flow-entrou" + ((totais[a.id] ?? 0) > 0 ? " tem" : "")} title={`${totais[a.id] ?? 0} pessoa(s) já entraram neste funil`}>
                  <b>{String(totais[a.id] ?? 0).padStart(2, "0")}</b>
                  <span>entrou</span>
                </div>
                <div className="flow-row-main">
                  <div className="flow-row-title">{a.name || a.id}</div>
                  {date && <div className="flow-row-date">Atualizado em {date}</div>}
                  <div className="flow-chips">
                    <span className="flow-chip trigger"><Icon name={triggerIcon(a.trigger)} size={13} /> {t.label}</span>
                    {(() => {
                      // 📱 Qual número este fluxo atende (ou por qual envia) — pedido do dono, 03/10.
                      const n = numeroDoFluxo(a.trigger === "schedule" ? (a.scheduleAccount ?? a.conta) : a.conta, contasDoWs);
                      return (
                        <span className={"flow-chip numero" + (n.aviso ? " aviso" : "")} title={n.aviso || "Número deste fluxo"}>
                          <Icon name="phone" size={12} /> {n.texto}
                        </span>
                      );
                    })()}
                    {(() => {
                      // Só aparece quando o fluxo é EXCLUSIVO de um canal — se roda nos dois,
                      // o chip só seria ruído (é a maioria dos fluxos comuns de texto/mídia).
                      const origem = origemDoFluxo(a);
                      if (origem === "ambos") return null;
                      return (
                        <span className={"flow-chip origem-" + origem} title={origem === "oficial" ? "Tem template da Meta — só roda na API Oficial" : "Usa um recurso (grupo, ligação, carrossel livre…) que só existe no WhatsApp Lite"}>
                          {origem === "oficial" ? "API Oficial" : "WhatsApp Lite"}
                        </span>
                      );
                    })()}
                    {kws.map((k) => <span key={k} className="flow-chip kw">{k}</span>)}
                    {kwMissing && <span className="flow-chip warn">sem palavra-chave</span>}
                    {shown.map((p) => (
                      <span key={p.type} className="flow-chip node"><Icon name={stepIcon(p.type)} size={13} /> {p.label}{p.n > 1 ? ` ×${p.n}` : ""}</span>
                    ))}
                    {extra > 0 && <span className="flow-chip more">+{extra}</span>}
                    {empty && <span className="flow-chip muted-chip">(fluxo vazio)</span>}
                  </div>
                </div>
                <div className="flow-row-actions">
                  <button
                    className={"flow-toggle" + (active ? " on" : "")}
                    title={active ? "Ativo — clique pra virar rascunho" : "Rascunho — clique pra ativar"}
                    onClick={() => toggle(a)}
                    role="switch"
                    aria-checked={active}
                  >
                    <span className="ft-knob" />
                    <span className="ft-label">{active ? "Ativo" : "Rascunho"}</span>
                  </button>
                  <Link href={`/fluxos/${encodeURIComponent(a.id)}`} className="btn ic"><Icon name="edit" size={15} /> Abrir</Link>
                  <button className="btn ic" onClick={() => duplicar(a)} disabled={busy}
                    title="Cria uma cópia deste fluxo como rascunho (sem o token do webhook)">
                    <Icon name="copy" size={15} /> Duplicar
                  </button>
                  <button className="btn danger ic" onClick={() => del(a)}><Icon name="trash" size={15} /> Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImport} />

      {/* Importou do n8n e alguma coisa ficou de fora: mostra ANTES de abrir o fluxo. */}
      {importado && (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 520, width: "calc(100% - 32px)", maxHeight: "80vh", overflowY: "auto" }} onClick={(ev) => ev.stopPropagation()}>
            <div className="card-head"><h3>Importado do n8n</h3></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <b>{importado.nome}</b> entrou como rascunho com <b>{importado.convertidos} passos</b>.
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>O que não veio junto:</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                  {importado.avisos.map((a, i) => (
                    <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{a}</li>
                  ))}
                </ul>
              </div>
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                Confira o fluxo antes de publicar — principalmente os textos das mensagens e para
                onde cada saída do Switch aponta.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => router.push(`/fluxos/${encodeURIComponent(importado.id)}`)}>abrir o fluxo</button>
                <button className="btn" onClick={() => setImportado(null)}>fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Criar com IA ─────────────────────────────────────────────────────────────
// Você descreve a automação em português; a IA devolve o fluxo montado (nós + conexões). A tela
// mostra a PRÉVIA antes de criar — e lista com franqueza o que ficou faltando (mídia, número da
// equipe, template) em vez de fingir que está tudo pronto. O fluxo nasce como RASCUNHO.
const EXEMPLOS_IA = [
  {
    rot: "Atendente de vendas",
    txt: "Quando um lead novo chamar no WhatsApp, quero uma atendente de IA chamada Ana que apresenta meu curso de confeitaria (R$ 297, 12x no cartão), tira dúvidas sobre conteúdo e prazo, e manda o link do checkout pra quem demonstrar interesse. Se a pessoa pedir pra falar com humano, avisa minha equipe. Se ela sumir, manda 3 follow-ups: 20 minutos, 3 horas e no dia seguinte.",
  },
  {
    rot: "Carrinho abandonado",
    txt: "Quando alguém abandonar o carrinho, esperar 15 minutos e mandar uma mensagem perguntando se ficou alguma dúvida, com o link pra finalizar. Se não responder, mandar mais uma em 6 horas com um lembrete de que a vaga é limitada, e uma última no dia seguinte se despedindo.",
  },
  {
    rot: "Pós-venda",
    txt: "Quando a compra for aprovada, agradecer pelo nome, explicar que o acesso chega no e-mail em até 5 minutos, etiquetar o contato como cliente e, 2 dias depois, perguntar se conseguiu acessar tudo direitinho.",
  },
  {
    rot: "Palavra-chave",
    txt: "Quando alguém mandar a palavra 'orçamento', perguntar o nome, depois o tipo de serviço que precisa, salvar as duas respostas e avisar minha equipe com os dados pra alguém retornar.",
  },
];

function CriarComIA({ onFechar, onUsar, salvando }: { onFechar: () => void; onUsar: (a: Automation) => void; salvando: boolean }) {
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<{ automacao: Automation; resumo?: string; avisos?: string[] } | null>(null);

  async function gerar() {
    if (gerando || texto.trim().length < 15) return;
    setGerando(true); setErro(""); setRes(null);
    try {
      const d = await jsend("/api/automations/gerar-ia", "POST", { texto: texto.trim() });
      setRes({ automacao: d.automacao, resumo: d.resumo, avisos: d.avisos ?? [] });
    } catch (e: any) { setErro(e?.message || "não consegui gerar agora"); }
    setGerando(false);
  }

  const a = res?.automacao;
  const gat = a ? (TRIGGERS[a.trigger]?.label ?? a.trigger) : "";

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onFechar} aria-label="Fechar">×</button>
        <div className="modal-head">
          <h2><Icon name="spark" size={18} style={{ verticalAlign: -3, marginRight: 7, color: "var(--accent-deep)" }} />Criar fluxo com IA</h2>
          <p className="muted" style={{ fontSize: 13 }}>Descreva a automação em português, como você explicaria pra um funcionário. A IA monta os passos; você revisa antes de ativar.</p>
        </div>

        <label className="lbl">O que esse fluxo deve fazer?</label>
        <textarea className="inp" rows={6} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          placeholder="Ex.: Quando um lead novo chamar, quero uma atendente de IA que apresenta meu produto, tira dúvidas e manda o link do checkout. Se a pessoa sumir, mandar 3 follow-ups."
          value={texto} onChange={(e) => setTexto(e.target.value)} disabled={gerando} />
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Exemplos:</span>
          {EXEMPLOS_IA.map((ex) => (
            <button key={ex.rot} className="btn" style={{ fontSize: 12, padding: "4px 11px" }} onClick={() => setTexto(ex.txt)} disabled={gerando}>{ex.rot}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>{texto.trim().length < 15 ? "Escreva pelo menos uma frase." : "Leva de 10 a 30 segundos."}</span>
          <button className="btn primary ic" style={{ marginLeft: "auto" }} onClick={gerar} disabled={gerando || texto.trim().length < 15}>
            <Icon name="spark" size={15} /> {gerando ? "Montando o fluxo…" : res ? "Gerar de novo" : "Gerar fluxo"}
          </button>
        </div>

        {erro && <div style={{ color: "var(--crit)", fontSize: 13, marginTop: 12 }}>{erro}</div>}

        {a && (
          <div className="ia-previa">
            <div className="ia-previa-head">
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{a.name}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{res?.resumo}</div>
              </div>
              <span className="flow-chip node" style={{ flex: "none" }}>{TRIGGERS[a.trigger]?.emoji} {gat}{a.keyword ? `: “${a.keyword}”` : ""}</span>
            </div>

            <div className="ia-passos">
              {a.steps.map((s: Step, i: number) => (
                <div key={s._id ?? i} className="ia-passo">
                  <span className="ia-passo-n">{i + 1}</span>
                  <span className="ia-passo-ico"><Icon name={stepIcon(s.type)} size={14} /></span>
                  <div style={{ minWidth: 0 }}>
                    <b>{STEP_META[s.type]?.label ?? s.type}</b>
                    <span>{resumoDoPasso(s)}</span>
                  </div>
                </div>
              ))}
            </div>

            {(res?.avisos?.length ?? 0) > 0 && (
              <div className="ia-avisos">
                <b><Icon name="warn" size={13} /> Confira antes de ativar</b>
                {res!.avisos!.map((av, i) => <div key={i} className="linha">{av}</div>)}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12 }}>Vai ser criado como <b>rascunho</b> — nada dispara até você ativar.</span>
              <button className="btn primary" style={{ marginLeft: "auto", padding: "9px 20px", fontWeight: 700 }} onClick={() => onUsar(a)} disabled={salvando}>
                {salvando ? "criando…" : "Criar e abrir no builder →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Uma linha de prévia por passo (o que ele faz, em poucas palavras).
function resumoDoPasso(s: Step): string {
  const corta = (t: string, n = 90) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
  const a = s as any;
  switch (s.type) {
    case "text": return corta(String(a.text ?? "").replace(/\n+/g, " "));
    case "note": return corta(String(a.text ?? "").replace(/\n+/g, " "));
    case "presence": return `${Math.round((a.ms ?? 2500) / 1000)}s de "digitando…"`;
    case "wait": {
      const ms = Number(a.ms ?? 0);
      const dur = ms >= 3600000 ? `${Math.round(ms / 3600000)}h` : ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)}s`;
      return `espera ${dur}${a.cancelOnReply !== false ? " (cancela se a pessoa responder)" : ""}`;
    }
    case "buttons": return `${corta(String(a.text ?? ""), 50)} · [${(a.buttons ?? []).join("] [")}]`;
    case "ask": return `pergunta e salva em {{${a.variable}}}`;
    case "ai_agent": return `${(a.paths ?? []).length} caminho(s): ${(a.paths ?? []).map((p: any) => p.name).join(", ")}`;
    case "tag": return `etiqueta: ${(a.tags ?? []).join(", ")}`;
    case "notify": return corta(String(a.text ?? "").replace(/\n+/g, " "), 60) + " · falta o destinatário";
    case "template": return `modelo “${a.templateName}”`;
    default: return "";
  }
}
