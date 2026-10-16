"use client";

// Disparador em WIZARD (mockup 17/08): 1 Configurar → 2 Selecionar números → 3 Revisar e enviar.
// Prévia da mensagem fixa na lateral + "Validação da mensagem". "Salvar rascunho" persiste no
// MOTOR (servidor, não navegador). Job roda no motor (fechar a aba não para); o painel polla.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { subirArquivo, jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";
import { WelcomeTour, useWelcomeTour, DISPARADOR_TOUR } from "@/components/WelcomeTour";
import { FoneVideo } from "@/components/MetaTemplates";

interface TplMeta { name: string; status?: string; category?: string; language?: string; components?: any[] }
interface Status {
  existe: boolean; running?: boolean; cancelado?: boolean; template?: string; nota?: string;
  pausadoPorFalhas?: boolean;
  total?: number; done?: number; ok?: number; errosQtd?: number;
  erros?: Array<{ numero: string; erro: string }>; intervaloSeg?: number; inicioEm?: number;
  eventos?: Array<{ at: number; ok: number; err: number }>; // log com horário real do servidor
  // Livro-razão por número (incremental: o motor devolve só a partir de ?desde=)
  itens?: ItemDisparo[]; itensDesde?: number; itensDecididos?: number; pendentes?: number;
}
interface ItemDisparo { numero: string; nome?: string; status: "pendente" | "ok" | "erro"; erro?: string; at?: number }

// Máscara pra gravar stories: some com os 4 últimos dígitos. Só na EXIBIÇÃO — o número real
// continua indo pro motor. "5511999999999" → "+55 11 93224-••••".
function mascaraFinais(numero: string, ocultar: boolean): string {
  const d = String(numero).replace(/\D/g, "");
  const fim = ocultar ? "••••" : d.slice(-4);
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const meio = d.slice(4, -4);
    return `+55 ${d.slice(2, 4)} ${meio}-${fim}`;
  }
  return "+" + d.slice(0, -4) + "-" + fim;
}
import { lerArquivoContatosDetalhado, textoParaContatos, fraseResumo, type ContatoImportado, type ResumoImportacao } from "@/lib/importar-contatos";
import { ImportarContatosModal } from "@/components/ImportarContatosModal";

type Contato = ContatoImportado;
interface SegOpts { total: number; origens: Array<{ origem: string; total: number }>; tags: Array<{ tag: string; total: number }> }
interface NumeroSaude { nome?: string; telefone?: string; qualidade?: string; tier?: string }

const contaVars = (texto: string) => {
  const ns = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return ns.length ? Math.max(...ns) : 0;
};
const corpoDoTpl = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "BODY")?.text ?? "");
const rodapeDoTpl = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "FOOTER")?.text ?? "");
const headerDoTpl = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "HEADER")?.format ?? "").toUpperCase();
const headerExemplo = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "HEADER")?.example?.header_handle?.[0] ?? "");
const botoesDoTpl = (t: TplMeta): string[] =>
  ((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "BUTTONS")?.buttons ?? []).map((b: any) => String(b?.text ?? "")).filter(Boolean);
const fmtNum = (n?: number) => (n ?? 0).toLocaleString("pt-BR");
const ACCEPT_HEADER: Record<string, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };
const IDIOMA: Record<string, string> = { pt_BR: "Português (Brasil)", pt_PT: "Português (PT)", en_US: "Inglês (EUA)", es: "Espanhol", es_MX: "Espanhol (MX)" };
const ORIGEM_ROTULO: Record<string, string> = { lite: "WhatsApp Lite", meta: "API Oficial", agenda: "Agenda do celular", kiwify: "Kiwify", outros: "Outros" };
const QUALIDADE: Record<string, { rot: string; cor: string }> = {
  GREEN: { rot: "Alta", cor: "var(--accent-deep)" }, YELLOW: { rot: "Média", cor: "var(--warn)" }, RED: { rot: "Baixa", cor: "var(--crit)" },
};

// CSV/TXT: uma linha por contato — numero[,nome[,variavel1,variavel2...]] (separador , ; ou tab).
// Parser compartilhado com Contatos (csv/txt/xlsx; números sem 55 ganham o 55).
const parseContatos = (texto: string): Contato[] => textoParaContatos(texto);

// Negrito do WhatsApp (*texto*) na prévia.
function waNegrito(texto: string): React.ReactNode {
  return texto.split(/(\*[^*\n]+\*)/g).map((p, i) =>
    p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b> : p,
  );
}

const fmtTempo = (seg: number) => {
  const s = Math.round(seg);
  const h = Math.floor(s / 3600), m = Math.ceil((s % 3600) / 60);
  return h ? `~${h}h ${m}m` : `~${Math.max(m, 1)} min`;
};

export function OficialDisparador() {
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [tpls, setTpls] = useState<TplMeta[] | null>(null);
  const [tplNome, setTplNome] = useState("");
  // Dois jeitos de disparar: um TEMPLATE solto, ou um FLUXO inteiro (o template mora dentro dele e
  // o que a pessoa responder cai nos ramos do canvas — disparo que vira funil).
  const [modo, setModo] = useState<"template" | "fluxo">("template");
  const [fluxos, setFluxos] = useState<Array<{ id: string; name?: string; enabled?: boolean; steps?: any[] }>>([]);
  const [fluxoId, setFluxoId] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoKb, setArquivoKb] = useState(0);
  const [colar, setColar] = useState(false);
  const [lista, setLista] = useState("");
  const [dedupe, setDedupe] = useState(true);
  const [pausarFalhas, setPausarFalhas] = useState(false);
  const [intervalo, setIntervalo] = useState(5);
  const [lote, setLote] = useState(2000);
  const [nota, setNota] = useState("");
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerNome, setHeaderNome] = useState("");
  const [headerDim, setHeaderDim] = useState("");
  const [subindoHeader, setSubindoHeader] = useState(false);
  const [erro, setErro] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [st, setSt] = useState<Status | null>(null);
  const [parando, setParando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false); // modal fullscreen "Disparo em andamento"
  // Lista AO VIVO dos números conforme saem. Acumulada num ref (o setInterval captura estado velho).
  const [itens, setItens] = useState<ItemDisparo[]>([]);
  const itensRef = useRef<ItemDisparo[]>([]);
  const inicioRef = useRef<number>(0); // inicioEm do job que a lista pertence — job novo zera a lista
  const listaRef = useRef<HTMLDivElement>(null);
  const [ocultarFinais, setOcultarFinais] = useState<boolean>(() => { try { return localStorage.getItem("zc-disparo-ocultar") === "1"; } catch { return false; } });
  function alternaOcultar() { setOcultarFinais((v) => { try { localStorage.setItem("zc-disparo-ocultar", v ? "0" : "1"); } catch { /* sem storage */ } return !v; }); }
  const [saude, setSaude] = useState<NumeroSaude[]>([]);
  const [numsSel, setNumsSel] = useState<number[]>([]);
  const [custoUnit, setCustoUnit] = useState<Record<string, number>>({});
  const [teste, setTeste] = useState(false);
  const [testeNum, setTesteNum] = useState("");
  const [testeMsg, setTesteMsg] = useState("");
  const [segOpts, setSegOpts] = useState<SegOpts | null>(null);
  const [segSel, setSegSel] = useState("");
  const [segContatos, setSegContatos] = useState<Contato[]>([]);
  const [segCarregando, setSegCarregando] = useState(false);
  const [rascunhoMsg, setRascunhoMsg] = useState("");
  const [salvandoRasc, setSalvandoRasc] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tour do Disparador: chave PRÓPRIA (não a do painel) — quem já viu o tour de boas-vindas ainda
  // precisa ver este, que é onde moram as armadilhas de verdade (mídia do topo, {{nome}} vazio,
  // "enviados" que não é "entregues").
  const { open: tourOpen, openTour, closeTour } = useWelcomeTour("zc-tour-disparador-v1");
  const rascRef = useRef<{ params?: string[]; headerUrl?: string; headerNome?: string } | null>(null);

  useEffect(() => {
    // Templates primeiro; DEPOIS o rascunho (o restore de tplNome precisa dos templates já em mãos
    // pra dimensionar as variáveis certo — ver o efeito [tplNome, nVars]).
    jget("/api/meta/templates")
      .then((d) => {
        setTpls(((d.templates ?? []) as TplMeta[]).filter((t) => String(t.status).toUpperCase() === "APPROVED"));
        return jget("/api/oficial/disparo/rascunho").catch(() => null);
      })
      .then((r) => {
        // ?tpl=<nome> — veio do botão "Disparo em massa" da galeria de templates. VENCE o rascunho:
        // a pessoa acabou de dizer qual modelo quer, então um rascunho velho com outro modelo não
        // pode sobrescrever a escolha (e é justamente aí que se dispara o template errado).
        const pedido = new URLSearchParams(window.location.search).get("tpl");
        if (pedido) {
          setModo("template");
          setTplNome(pedido);
          // Limpa a URL pra um F5 não re-forçar o modelo por cima do que a pessoa mexeu depois.
          window.history.replaceState(null, "", window.location.pathname);
        }
        if (!r?.existe || !r.dados) return;
        const d = r.dados;
        rascRef.current = { params: d.params, headerUrl: d.headerUrl, headerNome: d.headerNome };
        if (d.modo === "fluxo") setModo("fluxo");
        if (d.fluxoId) setFluxoId(String(d.fluxoId));
        if (d.tplNome && !pedido) setTplNome(String(d.tplNome));
        if (pedido) setModo("template"); // rascunho de "fluxo" não pode vencer o pedido explícito
        if (Number.isFinite(Number(d.intervalo))) setIntervalo(Number(d.intervalo));
        if (Number.isFinite(Number(d.lote))) setLote(Number(d.lote));
        if (typeof d.nota === "string") setNota(d.nota);
        if (typeof d.dedupe === "boolean") setDedupe(d.dedupe);
        if (typeof d.pausarFalhas === "boolean") setPausarFalhas(d.pausarFalhas);
        if (Array.isArray(d.contatos)) { setContatos(d.contatos); setArquivoNome(String(d.arquivoNome ?? "")); setArquivoKb(Number(d.arquivoKb) || 0); }
        if (typeof d.lista === "string" && d.lista) { setLista(d.lista); setColar(true); }
        if (d.segSel) void escolheSegmento(String(d.segSel));
        setRascunhoMsg("Rascunho recuperado" + (r.salvoEm ? ` (${new Date(r.salvoEm).toLocaleString("pt-BR")})` : ""));
      })
      .catch((e) => { setTpls([]); setErro(e.message); });
    // Saúde da conta (números da WABA) + custo médio por categoria (pro "custo estimado").
    jget("/api/oficial/metricas?dias=30").then((d) => {
      const nums: NumeroSaude[] = Array.isArray(d.saude) ? d.saude : [];
      setSaude(nums);
      setNumsSel(nums.map((_, i) => i)); // todos marcados por padrão
      if (Array.isArray(d.custo)) {
        const porCat: Record<string, { qtd: number; custo: number }> = {};
        for (const p of d.custo) {
          porCat[p.categoria] = porCat[p.categoria] ?? { qtd: 0, custo: 0 };
          porCat[p.categoria].qtd += p.qtd; porCat[p.categoria].custo += p.custo;
        }
        const unit: Record<string, number> = {};
        for (const [cat, v] of Object.entries(porCat)) if (v.qtd > 0 && v.custo > 0) unit[cat] = v.custo / v.qtd;
        setCustoUnit(unit);
      }
    }).catch(() => {});
    jget("/api/contacts/segments").then((d: SegOpts) => setSegOpts(d)).catch(() => {});
    // Só fluxos com passo de TEMPLATE servem: sem template a Meta não entrega fora da janela de 24h.
    jget("/api/automations")
      .then((d) => setFluxos((d.automations ?? []).filter((f: any) => (f.steps ?? []).some((x: any) => x.type === "template"))))
      .catch(() => {});
    lerStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tpl = useMemo(() => (tpls ?? []).find((t) => t.name === tplNome) ?? null, [tpls, tplNome]);
  const nVars = tpl ? contaVars(corpoDoTpl(tpl)) : 0;
  useEffect(() => {
    const r = rascRef.current;
    rascRef.current = null;
    if (r) {
      setParams(Array.from({ length: nVars }, (_, i) => r.params?.[i] ?? ""));
      setHeaderUrl(r.headerUrl ?? ""); setHeaderNome(r.headerNome ?? "");
    } else {
      setParams(Array.from({ length: nVars }, () => ""));
      setHeaderUrl(""); setHeaderNome(""); setHeaderDim("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplNome, nVars]);
  const headerFmt = tpl ? headerDoTpl(tpl) : "";
  const temMidiaNoTopo = ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFmt);

  const colados = useMemo(() => parseContatos(lista), [lista]);
  const todos = useMemo(() => [...contatos, ...colados, ...segContatos], [contatos, colados, segContatos]);
  const unicos = useMemo(() => {
    const v = new Set<string>();
    return todos.filter((c) => (v.has(c.numero) ? false : (v.add(c.numero), true)));
  }, [todos]);
  const finais = useMemo(() => (dedupe ? unicos : todos).slice(0, Math.max(1, Math.min(lote, 5000))), [dedupe, unicos, todos, lote]);
  const duplicados = todos.length - unicos.length;
  const preenchidas = params.filter((p) => p.trim()).length;
  const categoria = String(tpl?.category ?? "").toUpperCase();
  const unit = tpl ? custoUnit[categoria] : undefined;

  async function lerArquivo(f: File) {
    setErro("");
    try {
      const { contatos: lista, resumo } = await lerArquivoContatosDetalhado(f);
      setContatos(lista); setArquivoNome(f.name); setArquivoKb(Math.max(1, Math.round(f.size / 1024))); setResumoArquivo(resumo);
      if (!lista.length) setErro("Não achei nenhum número válido no arquivo. Use uma coluna com DDD + número (com ou sem 55).");
    } catch (e: any) { setErro(e?.message || "não consegui ler o arquivo"); }
  }
  const [salvarContatosAberto, setSalvarContatosAberto] = useState(false);
  const [resumoArquivo, setResumoArquivo] = useState<ResumoImportacao | null>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  async function subirHeader(file: File) {
    if (subindoHeader) return;
    const maxMb = headerFmt === "IMAGE" ? 5 : 16;
    if (file.size > maxMb * 1024 * 1024) { setErro(`Arquivo acima de ${maxMb}MB — comprima e tente de novo.`); return; }
    setSubindoHeader(true); setErro("");
    try {
      const url = await subirArquivo(file); // binário: o JSON do painel trava em 10MB
      setHeaderUrl(url); setHeaderNome(file.name); setHeaderDim("");
    } catch (e: any) { setErro(e.message); }
    setSubindoHeader(false);
  }

  // Segmento do CRM: "todos" | "origem:x" | "tag:x" → o motor devolve os contatos (sem opt-out).
  async function escolheSegmento(v: string) {
    setSegSel(v);
    if (!v) { setSegContatos([]); return; }
    setSegCarregando(true); setErro("");
    try {
      const q = v === "todos" ? "" : v.startsWith("origem:") ? "?origem=" + encodeURIComponent(v.slice(7)) : "?tag=" + encodeURIComponent(v.slice(4));
      const d = await jget("/api/contacts/segment" + q);
      setSegContatos((d.contatos ?? []) as Contato[]);
    } catch (e: any) { setErro(e.message); setSegContatos([]); setSegSel(""); }
    setSegCarregando(false);
  }
  const segRotulo = segSel === "todos" ? "Todos os contatos"
    : segSel.startsWith("origem:") ? (ORIGEM_ROTULO[segSel.slice(7)] ?? segSel.slice(7))
    : segSel.startsWith("tag:") ? `Tag: ${segSel.slice(4)}` : "";

  async function salvarRascunho() {
    if (salvandoRasc) return;
    setSalvandoRasc(true);
    try {
      await jsend("/api/oficial/disparo/rascunho", "POST", {
        dados: { modo, fluxoId, tplNome, params, intervalo, lote, nota, dedupe, pausarFalhas, headerUrl, headerNome, contatos, arquivoNome, arquivoKb, lista, segSel },
      });
      setRascunhoMsg("Rascunho salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e: any) { setRascunhoMsg(e.message); }
    setSalvandoRasc(false);
  }

  // Funde o pedaço novo (a partir de ?desde=) na lista acumulada. Job novo (inicioEm diferente)
  // recomeça do zero — senão a lista do disparo anterior ficaria colada no de agora.
  function absorve(x: Status) {
    if (!x.existe) return;
    if (x.inicioEm && x.inicioEm !== inicioRef.current) { inicioRef.current = x.inicioEm; itensRef.current = []; }
    const desde = x.itensDesde ?? 0;
    const novos = x.itens ?? [];
    if (novos.length) {
      const base = itensRef.current.slice(0, desde);
      itensRef.current = base.concat(novos);
      setItens(itensRef.current);
    } else if (desde === 0 && itensRef.current.length) {
      // servidor reiniciou o job (lista vazia de novo)
      itensRef.current = []; setItens([]);
    }
  }
  const urlStatus = () => "/api/oficial/disparo?desde=" + itensRef.current.length;
  function lerStatus() {
    jget(urlStatus()).then((d: Status) => {
      setSt(d); absorve(d);
      if (d.existe && d.running && !pollRef.current) {
        pollRef.current = setInterval(() => {
          jget(urlStatus()).then((x: Status) => {
            setSt(x); absorve(x);
            if (!x.running && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          }).catch(() => {});
        }, 1000);
      }
    }).catch(() => {});
  }
  // Rola a lista pro último enviado enquanto está disparando (efeito "metralhadora").
  useEffect(() => {
    const el = listaRef.current;
    if (el && st?.running) el.scrollTop = el.scrollHeight;
  }, [itens, st?.running]);

  function avancar() {
    setErro("");
    if (passo === 1) {
      if (modo === "fluxo") {
        if (!fluxoSel) { setErro("Escolha o fluxo a disparar."); return; }
        if (fluxoSel.enabled === false) { setErro("Esse fluxo está como rascunho — publique antes de disparar pra uma lista."); return; }
      } else {
        if (!tpl) { setErro("Escolha um template aprovado."); return; }
        if (params.some((p) => !p.trim())) { setErro("Preencha todas as variáveis do template (pode usar {{nome}} pra puxar o nome do contato)."); return; }
      }
      if (!finais.length) { setErro("Importe um CSV, cole os números ou escolha um segmento do CRM."); return; }
      setPasso(2);
    } else if (passo === 2) {
      if (!numsSel.length) { setErro("Selecione pelo menos um número."); return; }
      setPasso(3);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function voltar() { setErro(""); setPasso((p) => (p > 1 ? ((p - 1) as 1 | 2) : p)); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function iniciar() {
    if (iniciando) return;
    setErro("");
    setIniciando(true);
    try {
      // disparo novo → a lista ao vivo recomeça do zero (o absorve() também zera pelo inicioEm)
      itensRef.current = []; setItens([]);
      await jsend("/api/oficial/disparo", "POST", {
        contatos: finais, modo, ...(modo === "fluxo" ? { fluxoId } : {}),
        name: tpl?.name ?? "", language: tpl?.language || "pt_BR", params,
        intervaloSeg: intervalo, headerUrl: headerUrl || undefined, nota: nota.trim() || undefined,
        pausarFalhas,
      });
      setModalAberto(true); // abre o acompanhamento fullscreen na hora
      lerStatus();
    } catch (e: any) { setErro(e.message); }
    setIniciando(false);
  }

  async function parar() {
    if (parando) return;
    setParando(true);
    try { await jsend("/api/oficial/disparo/parar", "POST", {}); } catch { /* já parou */ }
    setParando(false);
    lerStatus();
  }

  async function enviarTeste() {
    const num = testeNum.replace(/\D/g, "");
    if (!tpl || num.length < 12) { setTesteMsg("Número inválido — DDI+DDD+número."); return; }
    setTesteMsg("enviando…");
    try {
      await jsend("/api/meta/templates/send", "POST", {
        to: num, name: tpl.name, language: tpl.language || "pt_BR",
        params: params.map((p) => p.replaceAll("{{nome}}", "Teste")), headerUrl: headerUrl || undefined,
      });
      setTesteMsg("Enviado! Confere o WhatsApp.");
    } catch (e: any) { setTesteMsg(e.message); }
  }

  // Log ao vivo: vem do SERVIDOR (st.eventos, horário REAL de cada envio) — aba em 2º plano não engana.
  const logLinhas = (st?.eventos ?? []).slice().reverse().map(
    (e) => `${new Date(e.at * 1000).toLocaleTimeString("pt-BR")} · ${fmtNum(e.ok)} enviados · ${fmtNum(e.err)} erros`,
  );

  const rodando = !!st?.existe && !!st.running;
  const stTitulo = !st ? "" : rodando ? "Disparo em andamento" : st.pausadoPorFalhas ? "Pausado automaticamente (5 falhas seguidas)" : st.cancelado ? "Disparo parado" : "Disparo concluído";
  const pct = st?.total ? Math.round(((st.done ?? 0) / st.total) * 100) : 0;
  const previaParams = params.map((p, i) => (p.trim() ? p.replaceAll("{{nome}}", finais[0]?.nome || "João") : `{{${i + 1}}}`));
  const previaCorpo = tpl ? corpoDoTpl(tpl).replace(/\{\{(\d+)\}\}/g, (_m, i) => previaParams[Number(i) - 1] ?? `{{${i}}}`) : "";
  const previaImg = headerFmt === "IMAGE" ? (headerUrl || (tpl ? headerExemplo(tpl) : "")) : "";
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const tempoEst = finais.length ? fmtTempo(finais.length * Math.max(intervalo, 1.5)) : "—";
  const conta = saude[0] ?? null;
  const fluxoSel = fluxos.find((f) => f.id === fluxoId) ?? null;
  // No modo fluxo a prévia sai do PASSO de template de dentro do fluxo (o retrato que o builder
  // salva quando você escolhe o template lá), com as variáveis já preenchidas por ele.
  const passoTpl: any = modo === "fluxo" ? (fluxoSel?.steps ?? []).find((x: any) => x.type === "template") ?? null : null;
  const mockFluxo = passoTpl?.mock ?? null;
  const corpoFluxo = String(mockFluxo?.body ?? "").replace(/\{\{(\d+)\}\}/g, (_m: string, i: string) =>
    String((passoTpl?.params ?? [])[Number(i) - 1] ?? "").trim() || `{{${i}}}`);
  const midiaFluxo = String(passoTpl?.headerUrl || mockFluxo?.header?.url || "");
  // O que precisa estar pronto pra poder avançar: no modo fluxo é o fluxo publicado; no template,
  // o template escolhido com as variáveis preenchidas.
  // Template com cabeçalho de mídia SEM arquivo anexado não pode disparar. O motor cairia no link
  // de EXEMPLO guardado na aprovação do template — um endereço assinado do CDN da Meta que VENCE.
  // Depois de vencido, a Meta aceita o envio (o disparo marca "ok") e falha na ENTREGA com o
  // código 131053, "Downloading media from weblink failed with http code 403". Aconteceu de
  // verdade em 25/09 com o disparo_carlos_e_botoes: 1/1 ok na tela, 0 mensagens entregues.
  const faltaMidiaTopo = modo === "template" && temMidiaNoTopo && !headerUrl;
  const prontoParaEnviar = (modo === "fluxo" ? !!fluxoSel && fluxoSel.enabled !== false : !!tpl && !params.some((p) => !p.trim()))
    && !faltaMidiaTopo;

  // Validação da mensagem (lateral) — checklist dinâmico, estilo do mockup.
  const validacao: Array<{ ok: boolean; txt: string }> = modo === "fluxo" ? [
    { ok: !!fluxoSel, txt: fluxoSel ? `Fluxo: ${fluxoSel.name || fluxoSel.id}` : "Escolha o fluxo a disparar" },
    { ok: !!fluxoSel && fluxoSel.enabled !== false, txt: fluxoSel && fluxoSel.enabled === false ? "O fluxo está como rascunho — publique antes" : "Fluxo publicado" },
    { ok: finais.length > 0, txt: finais.length > 0 ? `Lista de contatos válida (${fmtNum(finais.length)} contatos)` : "Importe a lista de contatos" },
  ] : [
    { ok: !!tpl, txt: tpl ? "Template aprovado pela Meta" : "Escolha um template aprovado" },
    ...(nVars > 0 ? [{ ok: preenchidas === nVars, txt: preenchidas === nVars ? "Todas as variáveis preenchidas" : `Variáveis: ${preenchidas}/${nVars} preenchidas` }] : []),
    ...(temMidiaNoTopo ? [{ ok: !!headerUrl, txt: headerUrl ? `Mídia do topo carregada (${headerNome || "arquivo"})` : "Anexe a mídia do topo — sem ela a Meta não entrega" }] : []),
    { ok: finais.length > 0, txt: finais.length > 0 ? `Lista de contatos válida (${fmtNum(finais.length)} contatos)` : "Importe a lista de contatos" },
  ];

  const wizTabs = [
    { n: 1, rot: "Configurar" },
    { n: 2, rot: "Selecionar números" },
    { n: 3, rot: "Revisar e enviar" },
  ] as const;

  return (
    <div className="disp2">
      {/* Ações da página: rascunho */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="wiz" style={{ flex: 1, minWidth: 260 }}>
          {wizTabs.map((t) => (
            <button key={t.n} className={"wiz-tab" + (passo === t.n ? " on" : passo > t.n ? " feito" : "")}
              onClick={() => { if (t.n < passo) { setErro(""); setPasso(t.n as 1 | 2 | 3); } }}
              disabled={t.n > passo} title={t.n > passo ? "Avance pelos passos" : undefined}>
              <span className="n">{passo > t.n ? <Icon name="check" size={11} /> : t.n}</span>{t.rot}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {rascunhoMsg && <span className="muted" style={{ fontSize: 12 }}>{rascunhoMsg}</span>}
          <button className="btn" style={{ padding: "8px 12px" }} onClick={openTour}
            title="Ver o passo a passo do Disparador (as armadilhas que derrubam um disparo)">
            <Icon name="help" size={14} />
          </button>
          <button className="btn primary" style={{ padding: "8px 16px" }} onClick={salvarRascunho} disabled={salvandoRasc}>
            <Icon name="save" size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{salvandoRasc ? "salvando…" : "Salvar rascunho"}
          </button>
        </div>
      </div>

      {/* O tour SÓ roda no passo 1: os alvos dos passos 2 e 3 nem existem no DOM ainda, e um
          spotlight sem alvo vira balão solto no meio da tela. */}
      {passo === 1 && (
        <WelcomeTour steps={DISPARADOR_TOUR} seenKey="zc-tour-disparador-v1" open={tourOpen} onClose={closeTour} />
      )}

      {/* Painel AO VIVO (quando há job) */}
      {st?.existe && (
        <div className="card"><div className="card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{stTitulo} · {st.template}{st.nota ? ` · ${st.nota}` : ""}</h3>
            <button className="btn" style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 13 }} onClick={() => setModalAberto(true)}>Acompanhar</button>
            {rodando && (
              <button className="btn danger" style={{ padding: "6px 14px", fontSize: 13 }} onClick={parar} disabled={parando}>
                {parando ? "parando…" : "Parar disparo"}
              </button>
            )}
          </div>
          <div className="disp-numeros">
            <div className="disp-kpi"><b className={rodando ? "vivo" : ""}>{fmtNum(st.ok)}</b><span>enviados</span></div>
            <div className="disp-kpi"><b style={{ color: (st.errosQtd ?? 0) > 0 ? "var(--crit)" : undefined }}>{fmtNum(st.errosQtd)}</b><span>erros</span></div>
            <div className="disp-kpi"><b>{fmtNum((st.total ?? 0) - (st.done ?? 0))}</b><span>na fila</span></div>
            <div className="disp-kpi"><b>{fmtNum(st.total)}</b><span>total</span></div>
          </div>
          <div className="disp-trilha"><div className={"disp-barra" + (rodando ? " vivo" : "")} style={{ width: pct + "%" }} /></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {pct}% · intervalo de {st.intervaloSeg}s
            {rodando && st.total && st.done != null && ` · ~${Math.ceil(((st.total - st.done) * (st.intervaloSeg ?? 5)) / 60)} min restantes`}
          </div>
          {(st.erros?.length ?? 0) > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Ver erros ({st.errosQtd})</summary>
              <table className="aff-table" style={{ marginTop: 8 }}>
                <thead><tr><th>Número</th><th>Erro</th></tr></thead>
                <tbody>{st.erros!.map((e, i) => <tr key={i}><td>{e.numero}</td><td style={{ fontSize: 12 }}>{e.erro}</td></tr>)}</tbody>
              </table>
            </details>
          )}
        </div></div>
      )}

      <div className="disp2-grid">
        {/* Coluna principal — muda por passo */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {passo === 1 && (
            <>
              <div className="card" data-tour="disp-modo"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>O que você vai disparar</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    Um <b>template</b> manda a mensagem e encerra. Um <b>fluxo</b> manda o template que está dentro dele e
                    <b> continua a conversa</b> conforme a pessoa responde (os ramos que você desenhou no canvas).
                  </div>
                </div>
                <div className="disp2-radios">
                  <button type="button" className={"disp2-radio" + (modo === "template" ? " on" : "")} onClick={() => setModo("template")}>
                    <span className="bola" />Um template
                  </button>
                  <button type="button" className={"disp2-radio" + (modo === "fluxo" ? " on" : "")} onClick={() => setModo("fluxo")}>
                    <span className="bola" />Um fluxo completo
                  </button>
                </div>
                {modo === "fluxo" && (
                  <div className="field">
                    <label>Fluxo a disparar</label>
                    {fluxos.length === 0 ? (
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        Nenhum fluxo com passo de <b>template</b>. Crie um em <b>Fluxos</b> — sem template a Meta não entrega
                        pra quem está fora da janela de 24h.
                      </div>
                    ) : (
                      <select className="inp" value={fluxoId} onChange={(e) => setFluxoId(e.target.value)}>
                        <option value="">— escolha o fluxo —</option>
                        {fluxos.map((f) => (
                          <option key={f.id} value={f.id}>{f.name || f.id}{f.enabled === false ? " (rascunho)" : ""}</option>
                        ))}
                      </select>
                    )}
                    {fluxoSel?.enabled === false && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 5, color: "var(--warn)" }}>
                        ⚠️ Este fluxo está como <b>rascunho</b> — publique antes de disparar pra uma lista.
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                      O disparo roda o fluxo do começo pra cada contato. As variáveis do template vêm do próprio passo do fluxo.
                    </div>
                    {/* Só aparece aqui fluxo que COMEÇA com um passo de template. Quem desenhou o
                        template como GATILHO ("Quando respondeu o template") não acha o fluxo na
                        lista e acha que sumiu — era o caso do dono, 29/09. A lista some o fluxo
                        em silêncio; esta linha diz onde ele está. */}
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                      Não achou seu fluxo aqui? Só entram os que têm um <b>passo</b> de template. Se no seu fluxo o template
                      é o <b>gatilho</b> (“Quando respondeu o template”), dispare por <b>Um template</b> — o fluxo assume
                      sozinho assim que a pessoa responder ou clicar num botão.
                    </div>
                  </div>
                )}
              </div></div>

              {modo === "template" && (
              <div className="card" data-tour="disp-template"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Template aprovado</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Use templates já aprovados pela Meta. Marketing, Utilidade e Autenticação são permitidos.</div>
                </div>
                <div className="disp2-selrow">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                      {tpls === null ? <div className="muted" style={{ fontSize: 13 }}>Carregando…</div> : (
                        <select className="inp" style={{ width: "100%", paddingRight: tpl ? 96 : undefined }} value={tplNome} onChange={(e) => setTplNome(e.target.value)}>
                          <option value="">— escolha —</option>
                          {tpls.map((t) => <option key={t.name + (t.language ?? "")} value={t.name}>{t.name} ({CATEGORIA[String(t.category)] ?? t.category} · {t.language ?? "pt_BR"})</option>)}
                        </select>
                      )}
                      {tpl && <span className="disp2-varok" style={{ position: "absolute", right: 30, top: "50%", transform: "translateY(-50%)", padding: "1px 10px" }}>Aprovado</span>}
                    </div>
                    <a className="btn" style={{ justifySelf: "start", fontSize: 12.5 }} href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer">
                      <Icon name="link" size={12} style={{ marginRight: 6, verticalAlign: -2 }} />Ver no Gerenciador de Templates
                    </a>
                  </div>
                  {tpl && (
                    <div className="disp2-info" style={{ marginTop: 0 }}>
                      <div><span>Categoria</span><b>{CATEGORIA[categoria] ?? tpl.category}</b></div>
                      <div><span>Idioma</span><b>{IDIOMA[String(tpl.language)] ?? tpl.language ?? "pt_BR"}</b></div>
                      <div><span>Status</span><b className="disp2-aprovado">Aprovado</b></div>
                      <div><span>Custo estimado</span><b>{unit ? unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 }) + " / msg" : "sem histórico"}</b></div>
                    </div>
                  )}
                </div>
              </div></div>
              )}

              <div className="disp2-duas">
                {/* ESQUERDA: variáveis + mídia do topo (só no modo TEMPLATE — no modo fluxo essas
                    coisas moram no passo do fluxo, e pedir de novo aqui só confundia). */}
                <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
                  {modo === "fluxo" ? (
                    <div className="card"><div className="card-pad">
                      <h3 style={{ margin: 0, fontSize: 14.5 }}>Conteúdo da mensagem</h3>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
                        Vem do <b>passo de template do fluxo</b>{passoTpl?.templateName ? <> (<code>{passoTpl.templateName}</code>)</> : null} —
                        variáveis, imagem e botões são os que você configurou lá. Pra mudar, edite o fluxo.
                      </div>
                      {fluxoSel && (
                        <Link className="btn" style={{ marginTop: 10, fontSize: 12.5 }} href={`/fluxos/${encodeURIComponent(fluxoSel.id)}`}>
                          Abrir o fluxo
                        </Link>
                      )}
                    </div></div>
                  ) : (
                  <div className="card"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14.5 }} data-tour="disp-variaveis">Variáveis do template</h3>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Preencha as variáveis abaixo para personalizar o conteúdo da mensagem.</div>
                    </div>
                    {nVars === 0 ? (
                      <div className="muted" style={{ fontSize: 12.5 }}>{tpl ? "Este template não tem variáveis." : "Escolha um template pra ver as variáveis."}</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {params.map((p, i) => (
                          <div key={i} className="disp2-var">
                            <span className="disp2-varchip2"><Icon name="text" size={12} />{"{{" + (i + 1) + "}}"}</span>
                            <input className="inp" placeholder={i === 0 ? "ex.: {{nome}} (puxa o nome do contato)" : `Valor de {{${i + 1}}}`} value={p}
                              onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
                            <button className="btn ic" title="Limpar valor" onClick={() => setParams(params.map((x, j) => (j === i ? "" : x)))} disabled={!p}>
                              <Icon name="trash" size={13} style={{ color: p ? "var(--crit)" : undefined }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <div className="lbl" style={{ marginBottom: 6 }}>Adicionar variável</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a className="btn" style={{ fontSize: 12.5 }} href="/oficial/templates" target="_blank" rel="noreferrer" title="Variáveis novas são definidas no template — abre Templates Meta em outra aba (o disparo montado aqui não se perde)"><Icon name="text" size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Texto</a>
                        {headerFmt === "IMAGE" || headerFmt === "VIDEO" ? (
                          <button type="button" className="btn" style={{ fontSize: 12.5 }} onClick={() => headerInputRef.current?.click()} disabled={subindoHeader}
                            title={headerFmt === "VIDEO" ? "Escolher o vídeo do topo" : "Escolher a imagem do topo"}><Icon name="media" size={12} style={{ marginRight: 5, verticalAlign: -2 }} />{headerFmt === "VIDEO" ? "Vídeo" : "Imagem"}</button>
                        ) : (
                          <a className="btn" style={{ fontSize: 12.5 }} href="/oficial/templates" target="_blank" rel="noreferrer" title="Este template não tem imagem no topo — abre Templates Meta em outra aba"><Icon name="media" size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Imagem</a>
                        )}
                        {headerFmt === "DOCUMENT" ? (
                          <button type="button" className="btn" style={{ fontSize: 12.5 }} onClick={() => headerInputRef.current?.click()} disabled={subindoHeader}
                            title="Escolher o documento do topo"><Icon name="file" size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Documento</button>
                        ) : (
                          <a className="btn" style={{ fontSize: 12.5 }} href="/oficial/templates" target="_blank" rel="noreferrer" title="Este template não tem documento no topo — abre Templates Meta em outra aba"><Icon name="file" size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Documento</a>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>{temMidiaNoTopo ? "A mídia sobe direto aqui, no topo da mensagem. Texto novo é definido no template (abre em outra aba)." : "Variáveis são definidas no template aprovado — os botões abrem Templates Meta em outra aba."}</div>
                    </div>
                  </div></div>
                  )}

                  {modo === "template" && temMidiaNoTopo && (
                    <div className="card" data-tour="disp-midia"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 14.5 }}>
                          Mídia do topo {headerFmt === "IMAGE" ? "(imagem)" : headerFmt === "VIDEO" ? "(vídeo)" : "(documento)"}
                          <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>
                        </h3>
                        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Exibida no início da mensagem — troque a cada campanha (o jeito coringa).</div>
                      </div>
                      {faltaMidiaTopo && (
                        <div style={{ fontSize: 13, lineHeight: 1.5, padding: "10px 12px", borderRadius: 10,
                          background: "color-mix(in srgb, var(--crit) 12%, var(--surface))",
                          border: "1px solid color-mix(in srgb, var(--crit) 45%, transparent)" }}>
                          <b>Anexe {headerFmt === "IMAGE" ? "a imagem" : headerFmt === "VIDEO" ? "o vídeo" : "o documento"} antes de disparar.</b>{" "}
                          Este template foi aprovado com mídia no topo. Sem anexar, o envio usaria a
                          mídia de exemplo da aprovação, cujo link vence — a Meta aceita o disparo e
                          depois <b>não entrega nenhuma mensagem</b> (erro 131053).
                        </div>
                      )}
                      <div className="disp2-arquivo">
                        {previaImg && headerFmt === "IMAGE" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={previaImg} alt="" className="disp2-thumb" style={{ width: 64, height: 64 }}
                            onLoad={(e) => setHeaderDim(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)} />
                        ) : (
                          <span className="disp2-ico"><Icon name="media" size={15} /></span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headerNome || "Mídia de exemplo da aprovação"}</b>
                          <span className="muted" style={{ fontSize: 12 }}>{headerNome ? [headerNome.split(".").pop()?.toUpperCase(), headerDim].filter(Boolean).join(" · ") : "suba um arquivo pra trocar"}</span>
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <label className="btn" style={{ cursor: "pointer", fontSize: 12.5 }}>
                            {subindoHeader ? "subindo…" : headerNome ? (headerFmt === "IMAGE" ? "Alterar imagem" : "Alterar arquivo") : "Escolher arquivo"}
                            <input ref={headerInputRef} type="file" accept={ACCEPT_HEADER[headerFmt]} style={{ display: "none" }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) subirHeader(f); e.target.value = ""; }} />
                          </label>
                          {headerUrl && (
                            <button className="btn ic" title="Voltar pra mídia de exemplo" onClick={() => { setHeaderUrl(""); setHeaderNome(""); setHeaderDim(""); }}>
                              <Icon name="trash" size={13} style={{ color: "var(--crit)" }} />
                            </button>
                          )}
                        </div>
                      </div>
                      {headerFmt === "IMAGE" && <div className="muted" style={{ fontSize: 11 }}>Recomendado: 1200x628px · JPG/PNG · Máx. 5MB</div>}
                    </div></div>
                  )}
                </div>

                {/* DIREITA: contatos + configurações */}
                <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
                  <div className="card" data-tour="disp-lista"><div className="card-pad" style={{ display: "grid", gap: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14.5 }}>Lista de contatos</h3>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Excel (.xlsx), .csv ou .txt — colunas: <code>numero</code>, <code>nome</code>, <code>variavel1</code>…</div>
                    </div>
                    {arquivoNome ? (
                      <div className="disp2-arquivo">
                        <span className="disp2-ico"><Icon name="sheet" size={15} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arquivoNome}</b>
                          <span className="muted" style={{ fontSize: 12 }}>{fmtNum(contatos.length)} contatos · {fmtNum(arquivoKb)} KB</span>
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <label className="btn" style={{ cursor: "pointer", fontSize: 12.5 }}>
                            Alterar arquivo
                            <input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ display: "none" }}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ""; }} />
                          </label>
                          <button className="btn" style={{ fontSize: 12.5 }} title="Guardar esses números em Contatos com uma tag, pra reaproveitar depois" onClick={() => setSalvarContatosAberto(true)}>
                            Salvar em Contatos
                          </button>
                          <button className="btn ic" title="Remover lista" onClick={() => { setContatos([]); setArquivoNome(""); setArquivoKb(0); setResumoArquivo(null); }}>
                            <Icon name="trash" size={13} style={{ color: "var(--crit)" }} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="disp2-drop" onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) lerArquivo(f); }}>
                        <Icon name="download" size={17} />
                        <span>Arraste e solte ou</span>
                        <span className="disp2-drop-btn">Escolher arquivo</span>
                        <input type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ""; }} />
                      </label>
                    )}
                    {arquivoNome && resumoArquivo && fraseResumo(resumoArquivo).alerta && (
                      <div style={{ fontSize: 12.5, padding: "8px 10px", borderRadius: 10, background: "color-mix(in srgb, var(--warn, #d99a00) 14%, var(--surface))", border: "1px solid color-mix(in srgb, var(--warn, #d99a00) 45%, transparent)" }}>
                        <b>Ajustes feitos:</b> {fraseResumo(resumoArquivo).texto}. Hífen, parênteses, espaços e o "+" foram limpos.
                      </div>
                    )}
                    {segSel && (
                      <div className="disp2-arquivo">
                        <span className="disp2-ico"><Icon name="group" size={15} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block" }}>Segmento: {segRotulo}</b>
                          <span className="muted" style={{ fontSize: 12 }}>{segCarregando ? "carregando…" : `${fmtNum(segContatos.length)} contatos do CRM (sem opt-out)`}</span>
                        </div>
                        <button className="btn ic" style={{ marginLeft: "auto" }} title="Remover segmento" onClick={() => { setSegSel(""); setSegContatos([]); }}>
                          <Icon name="trash" size={13} style={{ color: "var(--crit)" }} />
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select className="inp" style={{ flex: 1, minWidth: 170 }} value={segSel} onChange={(e) => escolheSegmento(e.target.value)} disabled={segCarregando}>
                        <option value="">ou puxar do CRM (segmento/tag)…</option>
                        {segOpts && <option value="todos">Todos os contatos ({fmtNum(segOpts.total)})</option>}
                        {segOpts && segOpts.origens.length > 0 && (
                          <optgroup label="Por origem">
                            {segOpts.origens.map((o) => <option key={o.origem} value={"origem:" + o.origem}>{ORIGEM_ROTULO[o.origem] ?? o.origem} ({fmtNum(o.total)})</option>)}
                          </optgroup>
                        )}
                        {segOpts && segOpts.tags.length > 0 && (
                          <optgroup label="Por tag">
                            {segOpts.tags.map((t) => <option key={t.tag} value={"tag:" + t.tag}>{t.tag} ({fmtNum(t.total)})</option>)}
                          </optgroup>
                        )}
                      </select>
                      <button className="btn" style={{ fontSize: 12.5 }} onClick={() => setColar(!colar)}>{colar ? "esconder colagem" : "ou colar números"}</button>
                    </div>
                    {colar && (
                      <textarea className="inp" rows={4} style={{ resize: "vertical", fontFamily: "inherit", width: "100%" }}
                        placeholder={"5511989898989,João\n5521912345678,Maria"} value={lista} onChange={(e) => setLista(e.target.value)} />
                    )}
                    {todos.length > 0 && (
                      <div style={{ fontSize: 12.5 }}>
                        <b style={{ color: "var(--accent-deep)" }}>{fmtNum(unicos.length)} válidos</b>
                        <span className="muted"> · {fmtNum(duplicados)} duplicados {dedupe ? "removidos" : "(NÃO removidos)"}</span>
                        {finais.length > 1900 && <div style={{ color: "var(--warn)", fontWeight: 700, marginTop: 3 }}>atenção: limite da Meta 2.000 conversas iniciadas/24h</div>}
                      </div>
                    )}
                  </div></div>

                  <div className="card" data-tour="disp-ritmo"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14.5 }}>Configurações de envio</h3>
                    <div>
                      <label className="lbl">Intervalo entre envios (segundos)</label>
                      <input className="inp" type="number" min={0} max={600} value={intervalo} style={{ width: "100%" }}
                        onChange={(e) => { const v = Number(e.target.value); setIntervalo(Number.isFinite(v) ? Math.max(0, Math.min(600, v)) : 5); }} />
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{intervalo === 0 ? "0 = sem espera (~1-3s de rede por envio)" : "Aguarda entre cada mensagem enviada"}</div>
                    </div>
                    <div>
                      <label className="lbl">Limite por número</label>
                      <input className="inp" type="number" min={1} max={5000} value={lote} style={{ width: "100%" }}
                        onChange={(e) => setLote(Math.max(1, Math.min(5000, Number(e.target.value) || 2000)))} />
                      <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Máximo de mensagens por número neste disparo</div>
                    </div>
                    <div>
                      <label className="lbl">Mensagem por contato</label>
                      <select className="inp" style={{ width: "100%" }} value="1" onChange={() => {}}>
                        <option value="1">1 mensagem</option>
                      </select>
                    </div>
                    <div>
                      <div className="lbl" style={{ marginBottom: 6 }}>Opções adicionais</div>
                      <label className="disp2-chk"><input type="checkbox" checked readOnly disabled title="Números inválidos já são pulados na importação" /> Ignorar números inválidos</label>
                      <label className="disp2-chk"><input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} /> Remover duplicados automaticamente</label>
                      <label className="disp2-chk"><input type="checkbox" checked={pausarFalhas} onChange={(e) => setPausarFalhas(e.target.checked)} /> Pausar automaticamente se houver falhas <span className="muted" style={{ fontSize: 11 }}>(5 erros seguidos)</span></label>
                    </div>
                  </div></div>
                </div>
              </div>

              {/* Resumo do disparo */}
              <div className="card"><div className="card-pad">
                <h3 style={{ margin: "0 0 10px", fontSize: 14.5 }}>Resumo do disparo</h3>
                <div className="disp2-strip">
                  <div className="kpi"><b>{fmtNum(todos.length)}</b><span>Total de contatos</span></div>
                  <div className="kpi"><b>{numsSel.length || saude.length || 1}</b><span>Números selecionados</span></div>
                  <div className="kpi"><b>~{fmtNum(finais.length)}</b><span>Mensagens estimadas</span></div>
                  <div className="kpi"><b>{tempoEst}</b><span>Tempo estimado</span></div>
                  <div className="kpi">
                    <b style={{ color: "var(--accent-deep)" }}>{unit && finais.length ? (unit * finais.length).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</b>
                    <span>{unit ? `${unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 })} por msg (${CATEGORIA[categoria] ?? "—"})` : "Custo estimado (sem histórico)"}</span>
                  </div>
                  <Link className="btn" style={{ marginLeft: "auto", fontSize: 12.5 }} href="/oficial/metricas">Ver detalhes</Link>
                </div>
              </div></div>

              {erro && <div style={{ color: "var(--crit)", fontSize: 13 }}>{erro}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={() => { setTeste(!teste); setTesteMsg(""); }} disabled={!tpl}>
                  <Icon name="send" size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Testar template
                </button>
                <button className="btn primary" style={{ marginLeft: "auto", padding: "10px 22px", fontSize: 14, fontWeight: 700 }} onClick={avancar}>
                  Avançar para seleção de números →
                </button>
              </div>
            </>
          )}

          {passo === 2 && (
            <>
              <div className="card"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Selecionar números</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Por quais números oficiais o disparo sai. Com 2+ números, a rotação divide os envios automaticamente.</div>
                </div>
                {saude.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>Carregando os números da conta…</div>
                ) : saude.map((n, i) => {
                  const q = QUALIDADE[String(n.qualidade)] ?? null;
                  const sel = numsSel.includes(i);
                  return (
                    <label key={i} className={"disp2-numrow" + (sel ? " on" : "")}>
                      <input type="checkbox" checked={sel}
                        onChange={(e) => setNumsSel(e.target.checked ? [...numsSel, i] : numsSel.filter((x) => x !== i))} />
                      <span className="disp2-ico"><Icon name="phone" size={15} /></span>
                      <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
                        <b style={{ fontSize: 13.5 }}>{n.nome || "Número oficial"}</b>
                        <span className="muted" style={{ fontSize: 12 }}>{n.telefone || "—"}</span>
                      </span>
                      {q && <span style={{ fontSize: 12, fontWeight: 700, color: q.cor }}>Qualidade {q.rot}</span>}
                    </label>
                  );
                })}
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {saude.length <= 1
                    ? "Você tem 1 número conectado — o disparo inteiro sai por ele. Conecte mais números em Conexão pra ligar a rotação."
                    : "Os envios são divididos entre os números marcados."}
                </div>
              </div></div>
              {erro && <div style={{ color: "var(--crit)", fontSize: 13 }}>{erro}</div>}
              {/* O botão desabilitado sozinho não diz POR QUE — e o motivo aqui custa a campanha inteira. */}
              {faltaMidiaTopo && (
                <div style={{ color: "var(--crit)", fontSize: 13 }}>
                  Falta anexar {headerFmt === "IMAGE" ? "a imagem" : headerFmt === "VIDEO" ? "o vídeo" : "o documento"} do topo, no passo <b>Configurar</b>. Sem ela a Meta não entrega a mensagem.
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={voltar}>← Voltar</button>
                <button className="btn primary" style={{ marginLeft: "auto", padding: "10px 22px", fontSize: 14, fontWeight: 700 }} onClick={avancar}>
                  Avançar para revisão →
                </button>
              </div>
            </>
          )}

          {passo === 3 && (
            <>
              <div className="card"><div className="card-pad" style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Revisar e enviar</h3>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Confira tudo — depois de iniciar, o disparo roda no motor mesmo com a aba fechada.</div>
                </div>
                <div className="disp2-rev">
                  <div><span>{modo === "fluxo" ? "Fluxo" : "Template"}</span><b>
                    {modo === "fluxo"
                      ? `${fluxoSel?.name || fluxoId} · o template de dentro dele abre a conversa`
                      : `${tpl?.name} · ${CATEGORIA[categoria] ?? "—"} · ${tpl?.language ?? "pt_BR"}`}
                  </b></div>
                  <div><span>Contatos</span><b>{fmtNum(finais.length)} envios{duplicados > 0 && dedupe ? ` (${fmtNum(duplicados)} duplicados removidos)` : ""}</b></div>
                  {nVars > 0 && <div><span>Variáveis</span><b>{params.map((p, i) => `{{${i + 1}}} = ${p || "—"}`).join(" · ")}</b></div>}
                  {temMidiaNoTopo && <div><span>Mídia do topo</span><b>{headerNome || "exemplo da aprovação"}</b></div>}
                  <div><span>Número</span><b>{numsSel.map((i) => saude[i]?.telefone || saude[i]?.nome).filter(Boolean).join(", ") || conta?.telefone || "—"}</b></div>
                  <div><span>Ritmo</span><b>{intervalo}s entre envios · máx {fmtNum(lote)} por número{pausarFalhas ? " · pausa com 5 falhas seguidas" : ""}</b></div>
                  <div><span>Tempo estimado</span><b>{tempoEst}</b></div>
                  <div><span>Custo estimado</span><b>{unit && finais.length ? (unit * finais.length).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "sem histórico"}</b></div>
                </div>
                <div>
                  <label className="lbl">Observações da campanha (opcional)</label>
                  <div style={{ position: "relative" }}>
                    <input className="inp" style={{ width: "100%", paddingRight: 62 }} maxLength={100} placeholder="ex.: Campanha Oferta Premium — Agosto/2026" value={nota} onChange={(e) => setNota(e.target.value)} />
                    <span className="muted" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{nota.length}/100</span>
                  </div>
                </div>
              </div></div>
              {erro && <div style={{ color: "var(--crit)", fontSize: 13 }}>{erro}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={voltar}>← Voltar</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => { setTeste(!teste); setTesteMsg(""); }} disabled={!tpl}>
                    <Icon name="send" size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Testar template
                  </button>
                  {/* Com disparo rodando o botão virava um bloco morto escrito "disparo em
                      andamento": quem fechou o acompanhamento sem querer ficava sem caminho de
                      volta, no meio de um disparo de 1.139 contatos (Admin, 30/09). Agora, nesse
                      estado, ele REABRE o acompanhamento ao vivo em vez de não fazer nada. */}
                  <button className="btn primary" style={{ padding: "10px 24px", fontSize: 14.5, fontWeight: 700 }}
                    onClick={() => { if (rodando) setModalAberto(true); else iniciar(); }}
                    title={rodando ? "Ver os números saindo ao vivo" : undefined}
                    disabled={iniciando || (!rodando && (!prontoParaEnviar || finais.length === 0))}>
                    {iniciando ? "iniciando…" : rodando ? "ver disparo em andamento ▸" : `Iniciar disparo (${fmtNum(finais.length)}) ▸`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Lateral: prévia da mensagem + validação */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="disp2-previa-head">
            <b>Prévia da mensagem</b>
            <span className="disp2-pill-previa">Como será enviada</span>
          </div>
          {teste && (
            <div className="card"><div className="card-pad" style={{ display: "grid", gap: 8 }}>
              <label className="lbl" style={{ margin: 0 }}>Mandar teste pra um número</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="inp" style={{ flex: 1, minWidth: 150 }} placeholder="5511989998888" value={testeNum} onChange={(e) => setTesteNum(e.target.value)} />
                <button className="btn primary" style={{ padding: "8px 14px" }} onClick={enviarTeste}>Enviar</button>
              </div>
              {testeMsg && <span className="muted" style={{ fontSize: 12.5 }}>{testeMsg}</span>}
            </div></div>
          )}

          <div className="fone">
            <div className="fone-notch" />
            <div className="fone-tela">
              <div className="fone-topo">
                <span className="fone-volta">‹</span>
                <span className="fone-ava">{(conta?.nome ?? "Z").slice(0, 1).toUpperCase()}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{conta?.nome ?? "Sua conta"}</b>
                  <em>Conta comercial</em>
                </span>
              </div>
              <div className="fone-chat">
                {modo === "fluxo" ? (
                  !fluxoSel ? (
                    <div className="fone-dica">Escolha o fluxo pra ver aqui a mensagem que abre a conversa.</div>
                  ) : !mockFluxo ? (
                    <div className="fone-dica">
                      Abra o fluxo e re-selecione o template no passo pra gravar a prévia — depois ela aparece aqui.
                    </div>
                  ) : (
                    <div className="fone-balao">
                      {mockFluxo.header?.formato === "IMAGE" && midiaFluxo && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img className="fone-img" src={midiaFluxo} alt="" />
                      )}
                      {mockFluxo.header?.formato === "VIDEO" && <FoneVideo src={midiaFluxo} />}
                      {mockFluxo.header?.formato === "DOCUMENT" && <div className="fone-video">Documento</div>}
                      <div className="fone-corpo">{waNegrito(corpoFluxo)}</div>
                      {mockFluxo.footer && <div className="fone-rodape">{mockFluxo.footer}</div>}
                      <span className="fone-hora">{agora}</span>
                      {(mockFluxo.botoes ?? []).length > 0 && (
                        <div className="fone-botoes">
                          {(mockFluxo.botoes ?? []).map((b: any, i: number) => (
                            <div key={i} className="fone-botao">
                              {b.tipo === "url" ? "↗ " : b.tipo === "telefone" ? "☎ " : b.tipo === "copiar" ? "⧉ " : ""}{b.texto}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : !tpl ? (
                  <div className="fone-dica">Escolha um template pra ver a prévia aqui, do jeito que a pessoa recebe.</div>
                ) : (
                  <div className="fone-balao">
                    {previaImg && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img className="fone-img" src={previaImg} alt="" />
                    )}
                    {headerFmt === "VIDEO" && <FoneVideo src={headerUrl || headerExemplo(tpl)} />}
                    <div className="fone-corpo">{waNegrito(previaCorpo)}</div>
                    {rodapeDoTpl(tpl) && <div className="fone-rodape">{rodapeDoTpl(tpl)}</div>}
                    <span className="fone-hora">{agora}</span>
                    {botoesDoTpl(tpl).length > 0 && (
                      <div className="fone-botoes">
                        {botoesDoTpl(tpl).map((b, i) => <div key={i} className="fone-botao">{b}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: -4 }}>
            Visualização aproximada de como a mensagem chega pro destinatário.
          </div>

          <div className="card"><div className="card-pad">
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Validação da mensagem</h3>
            <div style={{ display: "grid", gap: 7 }}>
              {validacao.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5 }}>
                  <Icon name={v.ok ? "check" : "info"} size={13} style={{ color: v.ok ? "var(--accent-deep)" : "var(--muted)", flex: "none", marginTop: 2 }} />
                  <span>{v.txt}</span>
                </div>
              ))}
            </div>
          </div></div>
        </div>
      </div>

      {/* Modal AO VIVO — abre ao Iniciar disparo; acompanha o envio em tela cheia */}
      {modalAberto && st?.existe && (
        <div className="modal-overlay">
          <div className="disp3" onClick={(e) => e.stopPropagation()}>
            <div className="disp3-head">
              <div className="disp3-icone"><Icon name="rocket" size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>{stTitulo}{rodando && <span className="disp3-live">Ao vivo</span>}</h2>
                <p>{st.nota || `Template ${st.template} · API Oficial da Meta`}</p>
              </div>
              <button className="btn ic" onClick={() => setModalAberto(false)} aria-label="Fechar"><Icon name="close" size={18} /></button>
            </div>

            <div className="disp3-corpo">
              <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
                <div className="disp3-kpis">
                  <div className="disp3-kpi"><span>Total da campanha</span><b>{fmtNum(st.total)}</b><em>contatos</em></div>
                  <div className="disp3-kpi"><span>Enviados</span><b className={rodando ? "vivo" : ""}>{fmtNum(st.ok)}</b><em>{pct}% da lista</em></div>
                  <div className="disp3-kpi"><span>Erros</span><b style={{ color: (st.errosQtd ?? 0) > 0 ? "var(--crit)" : undefined }}>{fmtNum(st.errosQtd)}</b><em>falhas de envio</em></div>
                  <div className="disp3-kpi"><span>Tempo restante</span><b>{rodando && st.total && st.done != null ? `${Math.ceil(((st.total - st.done) * (st.intervaloSeg ?? 5)) / 60)} min` : "—"}</b><em>para concluir</em></div>
                </div>

                <div className="card"><div className="card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <b style={{ fontSize: 14 }}>Motor de disparo</b>
                    <span className="muted" style={{ fontSize: 12 }}>{fmtNum(st.total)} contatos · 1 número</span>
                  </div>
                  <div className="disp3-motor">
                    <div className="disp3-num on">
                      <div className="disp3-num-topo">
                        <b>{conta?.telefone ? conta.telefone : (conta?.nome ?? "Seu número")}</b>
                        <span className={"disp3-badge" + (rodando ? " live" : "")}>{rodando ? "Disparando agora" : "Concluído"}</span>
                      </div>
                      <div className="disp3-num-linhas">
                        <div><span>Enviados</span><b>{fmtNum(st.ok)}</b></div>
                        <div><span>Erros</span><b>{fmtNum(st.errosQtd)}</b></div>
                        <div><span>Na fila</span><b>{fmtNum((st.total ?? 0) - (st.done ?? 0))}</b></div>
                      </div>
                      <div className="disp-trilha"><div className={"disp-barra" + (rodando ? " vivo" : "")} style={{ width: pct + "%" }} /></div>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                    A <b>rotação inteligente</b> entre vários números liga automaticamente quando você conectar 2+ contas oficiais.
                  </div>
                </div></div>

                <div className="card"><div className="card-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 14 }}>Números</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {fmtNum(st.ok)} enviados · {fmtNum(st.errosQtd)} erros · {fmtNum(st.pendentes ?? ((st.total ?? 0) - (st.done ?? 0)))} a enviar
                    </span>
                    <button className={"btn ic" + (ocultarFinais ? " on" : "")} style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }}
                      onClick={alternaOcultar} title={ocultarFinais ? "Mostrar os 4 últimos dígitos" : "Ocultar os 4 últimos dígitos (pra gravar stories)"}>
                      <Icon name={ocultarFinais ? "eye-off" : "eye"} size={13} /> {ocultarFinais ? "Finais ocultos" : "Ocultar finais"}
                    </button>
                  </div>
                  <div className="disp3-lista" ref={listaRef}>
                    {itens.length === 0 ? (
                      <div className="muted" style={{ fontSize: 12.5, padding: "6px 2px" }}>Aguardando o primeiro envio…</div>
                    ) : itens.map((it, i) => (
                      <div key={it.numero + i} className={"disp3-item " + it.status}>
                        <span className="disp3-item-n">{i + 1}</span>
                        <span className="disp3-item-tel">{mascaraFinais(it.numero, ocultarFinais)}</span>
                        <span className="disp3-item-nome">{it.nome || ""}</span>
                        <span className={"disp3-item-st " + it.status} title={it.erro || ""}>{it.status === "ok" ? "enviado" : it.status === "erro" ? "erro" : "a enviar"}</span>
                      </div>
                    ))}
                    {(st.pendentes ?? 0) > 0 && (
                      <div className="disp3-item pendente resumo">
                        <span className="disp3-item-n">…</span>
                        <span className="disp3-item-tel muted">mais {fmtNum(st.pendentes)} na fila</span>
                        <span />
                        <span className="disp3-item-st pendente">a enviar</span>
                      </div>
                    )}
                  </div>
                </div></div>

                <div className="card"><div className="card-pad">
                  <b style={{ fontSize: 14 }}>Log em tempo real</b>
                  <div className="disp3-log">
                    {logLinhas.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Aguardando os primeiros envios…</div>
                      : logLinhas.map((l, i) => <div key={i} className="disp3-log-linha"><span className="disp3-log-dot" />{l}</div>)}
                  </div>
                </div></div>
              </div>

              <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <div className="tpl-previa-rot">Template em envio</div>
                <div className="fone">
                  <div className="fone-notch" />
                  <div className="fone-tela">
                    <div className="fone-topo">
                      <span className="fone-volta">‹</span>
                      <span className="fone-ava">{(conta?.nome ?? "Z").slice(0, 1).toUpperCase()}</span>
                      <span style={{ minWidth: 0 }}><b>{conta?.nome ?? "Sua conta"}</b><em>Conta comercial</em></span>
                    </div>
                    <div className="fone-chat">
                      <div className="fone-balao">
                        {previaImg && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img className="fone-img" src={previaImg} alt="" />
                        )}
                        <div className="fone-corpo">{waNegrito(previaCorpo)}</div>
                        {tpl && rodapeDoTpl(tpl) && <div className="fone-rodape">{rodapeDoTpl(tpl)}</div>}
                        <span className="fone-hora">{agora}</span>
                        {tpl && botoesDoTpl(tpl).length > 0 && (
                          <div className="fone-botoes">{botoesDoTpl(tpl).map((b, i) => <div key={i} className="fone-botao">{b}</div>)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <div className="disp3-rodape">
              {rodando ? (
                <button className="btn danger" onClick={parar} disabled={parando}>{parando ? "parando…" : "Parar disparo"}</button>
              ) : <span />}
              <button className="btn primary" onClick={() => setModalAberto(false)}>Acompanhar em segundo plano</button>
            </div>
          </div>
        </div>
      )}
      {salvarContatosAberto && (
        <ImportarContatosModal listaInicial={contatos} nomeInicial={arquivoNome} resumoInicial={resumoArquivo ?? undefined} onClose={() => setSalvarContatosAberto(false)}
          onDone={(r) => { setErro(""); setRascunhoMsg(`${r.importados} contatos salvos em Contatos${r.tags.length ? ` com a tag ${r.tags.join(", ")}` : ""}`); }} />
      )}
    </div>
  );
}
