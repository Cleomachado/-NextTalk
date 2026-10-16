"use client";

// Templates da API Oficial (modelos aprovados pela Meta). Fora da janela de 24h, SÓ dá pra mandar
// template aprovado. Aqui o dono LISTA (com status), CRIA/submete, ENVIA teste e EXCLUI.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { jget, jsend, mascaraFone, soDigitosFone, FONE_INICIAL, subirArquivo } from "@/lib/client";
import { useAuth } from "@/components/Auth";

// Teto do SUPER ADMIN pra mídia de cabeçalho. A Meta documenta 16MB pra vídeo/áudio e 5MB pra
// imagem — este teto NÃO amplia o que a Meta aceita, só deixa o admin testar o comportamento
// real dela em vez de esbarrar num palpite nosso. Cliente segue no limite documentado, que é o
// que evita ele perder tempo subindo arquivo que vai ser recusado lá na frente.
const TETO_ADMIN_MB = 30;

// Negrito do WhatsApp (*texto*) na prévia do template.
function waNegrito(texto: string): React.ReactNode {
  return texto.split(/(\*[^*\n]+\*)/g).map((p, i) =>
    p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b> : p,
  );
}
import { Icon } from "@/components/icons";
import { textoFixoPorVariavel, MIN_TEXTO_POR_VARIAVEL } from "@/lib/coringas";

export interface Tpl {
  id?: string;
  name: string;
  status?: string;
  quality_score?: { score?: string }; // GREEN/YELLOW/RED — a "saúde" que a Meta dá pro modelo
  category?: string;
  language?: string;
  components?: Array<{ type: string; text?: string; format?: string; buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>; example?: any }>;
  previaUrl?: string;   // NOSSA cópia do arquivo do cabeçalho (a Meta não devolve enquanto está em análise)
  wabaId?: string;      // de qual conta (WABA) este template é — quando há mais de uma
  wabaRotulo?: string;
}

// Converte um template da Meta pro formato do formulário — usado no botão DUPLICAR.
function tplParaInicial(t: Tpl): TemplateInicial {
  const h = t.components?.find((c) => c.type === "HEADER") as any;
  const fmt = String(h?.format ?? "").toUpperCase();
  const headerTipo = fmt === "TEXT" ? "text" : fmt === "IMAGE" ? "image" : fmt === "VIDEO" ? "video" : fmt === "DOCUMENT" ? "document" : "none";
  const bodyComp = t.components?.find((c) => c.type === "BODY") as any;
  const exemplos: string[] = Array.isArray(bodyComp?.example?.body_text?.[0]) ? bodyComp.example.body_text[0].map((x: any) => String(x ?? "")) : [];
  const botoes = (t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? []).map((b: any) => {
    const tipo = b.type === "URL" ? "url" : b.type === "PHONE_NUMBER" ? "telefone" : "resposta";
    return { tipo, texto: String(b.text ?? ""), url: String(b.url ?? ""), telefone: String(b.phone_number ?? "").replace(/\D/g, "") } as BotaoForm;
  });
  return {
    name: (t.name + "_copia").slice(0, 60),
    category: (t.category || "MARKETING").toUpperCase(),
    headerTipo,
    body: compText(t, "BODY"),
    footerText: compText(t, "FOOTER"),
    examples: exemplos,
    botoes,
  };
}

const compText = (t: Tpl, type: string) => t.components?.find((c) => c.type === type)?.text ?? "";
const headerFormato = (t: Tpl) => String(t.components?.find((c) => c.type === "HEADER")?.format ?? "").toUpperCase();
const botoesDoTpl = (t: Tpl) => t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? [];

// Um botão de LINK e um de RESPOSTA RÁPIDA eram desenhados IGUAIS na galeria — e a diferença entre
// eles é a mais importante que existe aqui: quem clica num botão de link sai do WhatsApp e a gente
// NUNCA fica sabendo (nenhum fluxo dispara); quem clica numa resposta rápida manda uma mensagem de
// volta, e é isso que arma o gatilho "Quando respondeu o template". Sem o selo, o dono não tinha
// como saber qual template continua a conversa e qual só entrega o link (29/09).
function BotaoTpl({ bt }: { bt: any }) {
  const t = String(bt?.type ?? "").toUpperCase();
  const ehUrl = t === "URL";
  const ehFone = t === "PHONE_NUMBER";
  const titulo = ehUrl
    ? `Botão de LINK — abre ${bt?.url || "o endereço"} fora da conversa. NÃO volta pra cá: nenhum fluxo dispara.`
    : ehFone
      ? "Botão de LIGAÇÃO — abre o discador. Não volta pra cá: nenhum fluxo dispara."
      : "Resposta rápida — a pessoa manda essa palavra de volta. É o que arma o gatilho do fluxo.";
  return (
    <div className={"fone-botao" + (ehUrl || ehFone ? " externo" : "")} title={titulo}>
      {(ehUrl || ehFone) && <Icon name={ehUrl ? "link" : "phone"} size={12} />}
      {bt?.text}
    </div>
  );
}

// Resumo do card: este template CONTINUA a conversa (tem resposta rápida) ou só manda a pessoa
// embora (só link/ligação)? É o que decide se dá pra pendurar um fluxo nele.
function resumoBotoes(t: Tpl): { rotulo: string; classe: string; dica: string } | null {
  const bs = botoesDoTpl(t);
  if (!bs.length) return null;
  const tipos = bs.map((b: any) => String(b?.type ?? "").toUpperCase());
  const temResposta = tipos.some((x) => x !== "URL" && x !== "PHONE_NUMBER");
  const temLink = tipos.some((x) => x === "URL" || x === "PHONE_NUMBER");
  if (temResposta && temLink) return { rotulo: "link + resposta", classe: "misto", dica: "Tem botão de link E resposta rápida. Só o clique na resposta rápida volta pra cá e dispara fluxo." };
  if (temResposta) return { rotulo: "resposta → fluxo", classe: "resposta", dica: "Só respostas rápidas: todo clique volta pra cá e pode disparar um fluxo." };
  return { rotulo: "só abre link", classe: "link", dica: "Só botão de link/ligação: o clique NÃO volta pra cá. Nenhum fluxo dispara — o link tem que já estar dentro do botão." };
}
// URL de exemplo da imagem no topo (a que o revisor aprovou). Pode expirar — se falhar, cai no rótulo.
const headerImg = (t: Tpl): string => {
  const h = t.components?.find((c) => c.type === "HEADER") as any;
  if (h?.format !== "IMAGE") return "";
  // NOSSA cópia primeiro: enquanto o template está em análise a Meta não devolve o arquivo.
  return t.previaUrl || String(h?.example?.header_handle?.[0] ?? "");
};
// Mesma coisa pro VÍDEO aprovado — pro card mostrar o vídeo, não um retângulo cinza.
const headerVideo = (t: Tpl): string => {
  const h = t.components?.find((c) => c.type === "HEADER") as any;
  if (h?.format !== "VIDEO") return "";
  return t.previaUrl || String(h?.example?.header_handle?.[0] ?? "");
};
// Rótulo de quando NÃO temos o arquivo pra mostrar. Acontece com template criado ANTES de a
// gente passar a guardar cópia própria: enquanto a Meta revisa, ela não devolve a mídia, e depois
// de aprovar devolve. Dizer só "Vídeo no topo" parecia defeito — o texto agora explica a espera.
const FORMATO_ROTULO: Record<string, string> = { IMAGE: "Imagem no topo", VIDEO: "Vídeo no topo", DOCUMENT: "Documento no topo" };
const SEM_PREVIA: Record<string, string> = {
  IMAGE: "Imagem enviada — prévia aparece quando a Meta aprovar",
  VIDEO: "Vídeo enviado — prévia aparece quando a Meta aprovar",
  DOCUMENT: "Documento enviado — prévia aparece quando a Meta aprovar",
};

// Idiomas da Meta pelo NOME (o campo mostrava o código "pt_BR", que só quem é técnico entende).
// O código continua sendo o que vai pra Graph — muda só o que aparece na tela. Português primeiro.
const IDIOMAS: Array<{ v: string; label: string }> = [
  { v: "pt_BR", label: "Português (Brasil)" },
  { v: "pt_PT", label: "Português (Portugal)" },
  { v: "es", label: "Espanhol" },
  { v: "es_AR", label: "Espanhol (Argentina)" },
  { v: "es_MX", label: "Espanhol (México)" },
  { v: "es_ES", label: "Espanhol (Espanha)" },
  { v: "en", label: "Inglês" },
  { v: "en_US", label: "Inglês (EUA)" },
  { v: "en_GB", label: "Inglês (Reino Unido)" },
  { v: "fr", label: "Francês" },
  { v: "it", label: "Italiano" },
  { v: "de", label: "Alemão" },
  { v: "nl", label: "Holandês" },
  { v: "sv", label: "Sueco" },
  { v: "da", label: "Dinamarquês" },
  { v: "nb", label: "Norueguês" },
  { v: "fi", label: "Finlandês" },
  { v: "pl", label: "Polonês" },
  { v: "ro", label: "Romeno" },
  { v: "hu", label: "Húngaro" },
  { v: "cs", label: "Tcheco" },
  { v: "el", label: "Grego" },
  { v: "ru", label: "Russo" },
  { v: "uk", label: "Ucraniano" },
  { v: "tr", label: "Turco" },
  { v: "ar", label: "Árabe" },
  { v: "he", label: "Hebraico" },
  { v: "hi", label: "Híndi" },
  { v: "id", label: "Indonésio" },
  { v: "ms", label: "Malaio" },
  { v: "th", label: "Tailandês" },
  { v: "vi", label: "Vietnamita" },
  { v: "ja", label: "Japonês" },
  { v: "ko", label: "Coreano" },
  { v: "zh_CN", label: "Chinês (simplificado)" },
  { v: "zh_TW", label: "Chinês (tradicional)" },
];
export const nomeIdioma = (v?: string) => IDIOMAS.find((i) => i.v === v)?.label ?? v ?? "";

// Documento do topo: o WhatsApp mostra um CARD (ícone do tipo + nome + tamanho), não a página do
// arquivo — então a prévia mostra o card, que é o que a pessoa realmente vai ver. Antes era um
// retângulo cinza escrito "Documento", que não dizia nem o nome do arquivo.
export function FoneDoc({ nome, dataUri }: { nome?: string; dataUri?: string }) {
  if (!nome) return <div className="fone-video">Documento</div>;
  const ext = (nome.split(".").pop() || "DOC").toUpperCase().slice(0, 4);
  // dataUri é base64: cada 4 caracteres viram 3 bytes — dá o tamanho sem guardar o File.
  const b64 = dataUri?.split(",")[1] ?? "";
  const kb = b64 ? Math.max(1, Math.round((b64.length * 3) / 4 / 1024)) : 0;
  return (
    <div className="fone-doc">
      <span className="fone-doc-ico">{ext}</span>
      <span className="fone-doc-txt">
        <b>{nome}</b>
        <em>{kb ? `${kb.toLocaleString("pt-BR")} KB` : ext}</em>
      </span>
    </div>
  );
}

// Vídeo do topo na prévia: mostra o VÍDEO de verdade (primeiro quadro como capa, e dá pra tocar)
// em vez do retângulo cinza escrito "Vídeo do topo". `#t=0.1` faz o navegador buscar um quadro pra
// usar de capa; sem isso muito vídeo aparece preto. Se a URL não tocar (handle da Meta expirado,
// formato que o navegador não abre), cai no rótulo — melhor rótulo honesto que buraco preto.
export function FoneVideo({ src, rotulo = "Vídeo do topo" }: { src?: string; rotulo?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou) return <div className="fone-video">{rotulo}</div>;
  return (
    <video
      className="fone-video-play"
      src={src.startsWith("data:") ? src : src + (src.includes("#") ? "" : "#t=0.1")}
      controls muted playsInline preload="metadata"
      onError={() => setFalhou(true)}
    />
  );
}
const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const varCount = (body: string) => {
  const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
};

function StatusBadge({ s }: { s?: string }) {
  const up = (s || "").toUpperCase();
  const map: Record<string, { cls: string; label: string }> = {
    APPROVED: { cls: "on", label: "Aprovado" },
    PENDING: { cls: "warn", label: "Em análise" },
    REJECTED: { cls: "crit", label: "Rejeitado" },
    PAUSED: { cls: "warn", label: "Pausado" },
    DISABLED: { cls: "crit", label: "Desativado" },
  };
  const m = map[up] ?? { cls: "", label: s || "—" };
  return <span className={"tpl-status " + m.cls}>{m.label}</span>;
}

const CATS = [
  { v: "MARKETING", label: "Marketing" },
  { v: "UTILITY", label: "Utilitário" },
];

// Corpo do template no card. O "ver mais" aparece quando o texto REALMENTE está cortado —
// medido no DOM (scrollHeight > clientHeight), não chutado por número de caracteres. O chute
// anterior (>220 chars) deixava sem botão textos que estouravam as 3 linhas por serem largos:
// no card do Pix o texto aparecia cortado e sem saída (print do dono, 20/08).
function CorpoTemplate({ conteudo, expandido, onAlternar }: {
  conteudo: React.ReactNode; expandido: boolean; onAlternar: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cortado, setCortado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // +2px de folga: arredondamento de linha faz scrollHeight passar 1px sem corte nenhum.
    const medir = () => setCortado(el.scrollHeight > el.clientHeight + 2);
    medir();
    // A grade muda de 3 → 2 → 1 coluna: o mesmo texto passa a caber (ou não). Remede no resize.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [conteudo, expandido]);
  return (
    <>
      <div ref={ref} className={"fone-corpo" + (expandido ? "" : " fone-corpo-clamp")}>{conteudo}</div>
      {(cortado || expandido) && (
        <button type="button" className="fone-vermais" onClick={onAlternar}>
          {expandido ? "ver menos" : "ver mais"}
        </button>
      )}
    </>
  );
}

export function MetaTemplates() {
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [wabas, setWabas] = useState<Array<{ wabaId: string; rotulo: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState<TemplateInicial | true | null>(null); // true = em branco; objeto = duplicar
  // Rascunhos: template começado e não enviado. Ficam no servidor, não no navegador.
  const [rascunhos, setRascunhos] = useState<Array<{ id: string; nome: string; salvoEm: number; dados: TemplateInicial }>>([]);
  const [sendFor, setSendFor] = useState<Tpl | null>(null);
  async function carregaRascunhos() {
    try { const d = await jget("/api/oficial/templates/rascunhos"); setRascunhos(d?.rascunhos ?? []); } catch { /* sem rascunhos */ }
  }
  useEffect(() => { carregaRascunhos(); }, []);
  async function apagaRascunho(id: string) {
    if (!confirm("Descartar este rascunho?")) return;
    try { const d = await jsend("/api/oficial/templates/rascunhos/" + encodeURIComponent(id), "DELETE", {}); setRascunhos(d?.rascunhos ?? []); } catch { /* ignora */ }
  }

  const [insightsFor, setInsightsFor] = useState<Tpl | null>(null); // clique no card → Insights do modelo
  const [nomesAbertos, setNomesAbertos] = useState<Set<string>>(new Set()); // nomes expandidos ("ver mais")
  // Filtro por categoria (pedido do dono, 30/09): clica em Marketing e fica só Marketing; clica
  // de novo e volta a mostrar tudo. Os botões nascem das categorias que EXISTEM nos templates da
  // conta — nada de botão morto. (Template só tem Marketing/Utilidade/Autenticação; "Serviço" é
  // categoria de CONVERSA, não de modelo.)
  const [catFiltro, setCatFiltro] = useState<string>("");
  // Faixa de métricas dos cards (envios/lidas/cliques/custo~ do período) — uma chamada pra tela toda.
  const [metricas, setMetricas] = useState<Record<string, { enviadas: number; entregues: number; lidas: number; cliques: number; custoAprox: number | null }> | null>(null);
  // Estado da CAPTURA de métricas na Meta (is_enabled_for_insights). Desligada = todos os cards
  // em "—" mesmo com o Gerenciador cheio de números — o banner explica e conserta.
  const [captura, setCaptura] = useState<{ ligada: boolean | null; ativadaAgora: boolean }>({ ligada: null, ativadaAgora: false });
  const [ligandoCaptura, setLigandoCaptura] = useState(false);
  // Cards padronizados: corpo longo fica CLAMPADO; o id aqui dentro está expandido ("ver mais").
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const multiWaba = wabas.length > 1;
  // 🏷️ Chegou de um balão da conversa (/oficial/templates?tpl=nome): rola até o modelo e destaca.
  // Sem isso o dono clicava no selo e caía na lista inteira, tendo que procurar o nome na mão.
  const [destacado, setDestacado] = useState<string | null>(null);
  useEffect(() => {
    try {
      const alvo = new URLSearchParams(window.location.search).get("tpl");
      if (alvo) setDestacado(alvo);
    } catch { /* SSR / navegador sem search */ }
  }, []);
  useEffect(() => {
    if (!destacado || !tpls?.length) return;
    const el = document.getElementById("tpl-" + destacado);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    // O destaque some sozinho: é dica de navegação, não estado permanente da tela.
    const t = setTimeout(() => setDestacado(null), 6000);
    return () => clearTimeout(t);
  }, [destacado, tpls]);

  async function load() {
    try {
      const d = await jget("/api/meta/templates");
      setTpls(d.templates ?? []);
      setWabas(d.wabas ?? []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "falha ao carregar");
      setTpls([]);
    }
  }
  useEffect(() => {
    load();
    jget("/api/meta/templates/metricas?dias=30")
      .then((d) => {
        setMetricas(d.porTemplate ?? {});
        setCaptura({ ligada: d.capturaLigada ?? null, ativadaAgora: !!d.capturaAtivadaAgora });
      })
      .catch(() => setMetricas({})); // sem métrica não é erro de tela — a faixinha só não aparece
  }, []);

  async function ligarCaptura() {
    setLigandoCaptura(true);
    try {
      await jsend("/api/meta/templates/insights/ativar", "POST", {});
      setCaptura({ ligada: true, ativadaAgora: true });
    } catch (e: any) {
      alert(e?.message || "não consegui ligar a captura — tente de novo");
    }
    setLigandoCaptura(false);
  }

  async function del(t: Tpl) {
    if (!confirm(`Excluir o template "${t.name}"${multiWaba && t.wabaRotulo ? ` da conta ${t.wabaRotulo}` : ""}? Remove TODAS as línguas com esse nome e não tem volta.`)) return;
    try {
      await jsend("/api/meta/templates?name=" + encodeURIComponent(t.name) + (t.wabaId ? "&waba=" + encodeURIComponent(t.wabaId) : ""), "DELETE", {});
      await load();
    } catch (e: any) {
      alert(e?.message || "falha ao excluir");
    }
  }

  const notConnected = err && /conecte a conta oficial/i.test(err);

  return (
    // Sem maxWidth: a grade usa a tela inteira. O 900px que havia aqui era o motivo de sobrar
    // metade do monitor vazia — e não a quantidade de colunas (print do dono, 20/08).
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: 900 }}>
        <div className="muted" style={{ fontSize: 13, flex: 1 }}>
          Modelos aprovados pela Meta — o único jeito de enviar <b>fora da janela de 24h</b>. A aprovação leva de minutos a horas.
        </div>
        <button className="btn primary ic" onClick={() => setCreating(true)} disabled={!!notConnected}>
          <Icon name="plus" size={15} /> Novo template
        </button>
        {multiWaba && <div className="muted" style={{ fontSize: 11.5, flexBasis: "100%" }}>Você tem <b>{wabas.length} contas</b> — ao criar, dá pra escolher uma ou <b>todas de uma vez</b>.</div>}
      </div>

      {rascunhos.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Rascunhos</h3><span className="page-hint">{rascunhos.length} começado(s), ainda não enviado(s) pra Meta</span></div>
          <div className="feed">
            {rascunhos.map((r) => (
              <div key={r.id} className="feed-item" style={{ alignItems: "center" }}>
                <div className="feed-txt" style={{ flex: 1, minWidth: 0 }}>
                  <b>{r.nome}</b>
                  <div className="feed-time">salvo em {new Date(r.salvoEm).toLocaleString("pt-BR")}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" onClick={() => setCreating({ ...r.dados, rascunhoId: r.id })}>Continuar</button>
                  <button className="btn ic" title="Descartar rascunho" onClick={() => apagaRascunho(r.id)}>
                    <Icon name="trash" size={13} style={{ color: "var(--crit)" }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banner da CAPTURA de métricas: explica por que os cards estão em "—" enquanto o
          Gerenciador da Meta mostra números (a Graph só conta depois de ligada, e não é retroativa). */}
      {captura.ativadaAgora && (
        <div className="card"><div className="card-pad" style={{ fontSize: 13 }}>
          <b>Captura de métricas ligada agora.</b>{" "}
          <span className="muted">
            Ela estava desligada na Meta — por isso os cards mostram “—” mesmo com números no Gerenciador
            (lá é o histórico interno da Meta). A partir de agora os próximos envios passam a contar aqui;
            o que já foi enviado não entra (a Meta não conta o passado pela API).
          </span>
        </div></div>
      )}
      {!captura.ativadaAgora && captura.ligada === false && (
        <div className="card"><div className="card-pad" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            <b style={{ color: "var(--warn)" }}>A captura de métricas está desligada na Meta.</b>{" "}
            <span className="muted">Sem ela, os cards de envios/entregues/custo ficam em “—” pra sempre.</span>
          </span>
          <button className="btn primary" onClick={ligarCaptura} disabled={ligandoCaptura}>
            {ligandoCaptura ? "Ligando…" : "Ligar captura"}
          </button>
        </div></div>
      )}

      {notConnected ? (
        <div className="card"><div className="card-pad">
          <b style={{ color: "var(--crit)" }}>Conecte a conta oficial primeiro.</b>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Vá em <Link href="/oficial">Conexão</Link> e preencha o WABA ID + Access Token.</div>
        </div></div>
      ) : err ? (
        <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>Erro:</b> <span className="muted">{err}</span></div></div>
      ) : tpls === null ? (
        <div className="card"><div className="card-pad muted">Carregando…</div></div>
      ) : tpls.length === 0 ? (
        <div className="card"><div className="card-pad muted">Nenhum template ainda. Clique em <b>Novo template</b> pra criar o primeiro.</div></div>
      ) : (
        <>
        {(() => {
          const ROTULO: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };
          const contagem = new Map<string, number>();
          for (const t of tpls) { const c = String(t.category ?? "").toUpperCase() || "OUTRA"; contagem.set(c, (contagem.get(c) ?? 0) + 1); }
          const cats = [...contagem.keys()].sort((a, b) => (contagem.get(b)! - contagem.get(a)!));
          const nReprov = tpls.filter((t) => String(t.status ?? "").toUpperCase() === "REJECTED").length;
          if (cats.length < 2 && !nReprov && !catFiltro) return null; // uma categoria só: filtro não serve pra nada
          return (
            <div className="tpl-filtros" role="group" aria-label="Filtrar por categoria">
              <button type="button" className={"tpl-filtro" + (!catFiltro ? " on" : "")} onClick={() => setCatFiltro("")}>Todos <b>{tpls.length}</b></button>
              {cats.map((c) => (
                <button key={c} type="button" className={"tpl-filtro" + (catFiltro === c ? " on" : "")}
                  title={catFiltro === c ? "Clique de novo pra mostrar todos" : `Mostrar só ${ROTULO[c] ?? c}`}
                  onClick={() => setCatFiltro((atual) => (atual === c ? "" : c))}>
                  {ROTULO[c] ?? c} <b>{contagem.get(c)}</b>
                </button>
              ))}
              {/* Reprovados (pedido do dono, 13/10): filtra por STATUS, não por categoria. */}
              {nReprov > 0 && (
                <button type="button" className={"tpl-filtro reprov" + (catFiltro === "__REPROVADOS" ? " on" : "")}
                  title={catFiltro === "__REPROVADOS" ? "Clique de novo pra mostrar todos" : "Mostrar só os reprovados pela Meta"}
                  onClick={() => setCatFiltro((atual) => (atual === "__REPROVADOS" ? "" : "__REPROVADOS"))}>
                  Reprovados <b>{nReprov}</b>
                </button>
              )}
            </div>
          );
        })()}
        <div className="tpl-list">
          {tpls.filter((t) => !catFiltro
            || (catFiltro === "__REPROVADOS" ? String(t.status ?? "").toUpperCase() === "REJECTED"
              : (String(t.category ?? "").toUpperCase() || "OUTRA") === catFiltro)).map((t) => {
            const body = compText(t, "BODY");
            const approved = (t.status || "").toUpperCase() === "APPROVED";
            const chaveTpl = t.name + "|" + (t.language ?? "");
            const m = metricas?.[chaveTpl];
            const expandido = expandidos.has(chaveTpl);
            const qual = (t.quality_score?.score || "").toUpperCase();
            const qualidade = qual === "GREEN" ? { rotulo: "Alta", cor: "var(--accent-deep)" }
              : qual === "YELLOW" ? { rotulo: "Média", cor: "#d9a520" }
              : qual === "RED" ? { rotulo: "Baixa", cor: "var(--crit)" } : null;
            return (
              <div key={t.name + (t.language || "")} id={"tpl-" + t.name}
                   className={"card tpl-card" + (expandido ? "" : " tpl-card-fixa") + (destacado === t.name ? " tpl-card-destaque" : "")}>
                <div className="tpl-head">
                  <div style={{ minWidth: 0 }}>
                    {/* Nome em 2 linhas com reticências (pedido do dono, 30/09): nomes como
                        "util_disparo_carlos_video_30_set_botao_com_link_copia" quebravam em 4 linhas
                        e estouravam a altura do card. Nome inteiro no hover (title) e no clique. */}
                    <div
                      className={"tpl-name" + (nomesAbertos.has(t.name + "|" + (t.language ?? "")) ? " aberto" : "")}
                      title={t.name}
                      onClick={(e) => { e.stopPropagation(); setNomesAbertos((prev) => { const n = new Set(prev); const k = t.name + "|" + (t.language ?? ""); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }}
                      style={{ cursor: "pointer" }}
                    >{t.name}</div>
                    <div className="tpl-meta">{CATS.find((c) => c.v === t.category)?.label ?? t.category} · {nomeIdioma(t.language)}{multiWaba && t.wabaRotulo ? " · " : ""}{multiWaba && t.wabaRotulo && <span className="tpl-waba">{t.wabaRotulo}</span>}</div>
                    {(() => {
                      const r = resumoBotoes(t);
                      return r ? <span className={"tpl-botoes-tag " + r.classe} title={r.dica}>{r.rotulo}</span> : null;
                    })()}
                  </div>
                  <StatusBadge s={t.status} />
                </div>
                {/* O template DENTRO do mockup — como a pessoa recebe no WhatsApp (pedido 16/08).
                    Clique = abre os INSIGHTS do modelo (funil, lidas, cliques — pedido 17/08). */}
                <div className="tpl-fone-chat" style={{ cursor: "pointer" }} title="Ver insights deste template"
                  onClick={() => t.id && setInsightsFor(t)}>
                  <div className="fone-balao">
                    {headerImg(t) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img loading="lazy" decoding="async" className="fone-img" src={headerImg(t)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : headerFormato(t) === "IMAGE" ? (
                      <div className="fone-video sem-previa">{SEM_PREVIA.IMAGE}</div>
                    ) : headerFormato(t) === "VIDEO" ? (
                      <FoneVideo src={headerVideo(t)} rotulo={SEM_PREVIA.VIDEO} />
                    ) : headerFormato(t) === "DOCUMENT" ? (
                      <div className="fone-video sem-previa">{SEM_PREVIA.DOCUMENT}</div>
                    ) : null}
                    {compText(t, "HEADER") && <div className="fone-corpo" style={{ fontWeight: 700, paddingBottom: 0 }}>{compText(t, "HEADER")}</div>}
                    <CorpoTemplate
                      conteudo={body ? waNegrito(body) : <span style={{ color: "#999" }}>(sem corpo)</span>}
                      expandido={expandido}
                      onAlternar={(e) => {
                        e.stopPropagation(); // o card abre insights no clique — o "ver mais" não
                        setExpandidos((prev) => { const n = new Set(prev); if (n.has(chaveTpl)) n.delete(chaveTpl); else n.add(chaveTpl); return n; });
                      }}
                    />
                    {compText(t, "FOOTER") && <div className="fone-rodape">{compText(t, "FOOTER")}</div>}
                    <span className="fone-hora">{horaAgora()}</span>
                    {botoesDoTpl(t).length > 0 && (
                      <div className="fone-botoes">{botoesDoTpl(t).map((bt, i) => <BotaoTpl key={i} bt={bt} />)}</div>
                    )}
                  </div>
                </div>
                {/* NÚMEROS DO MODELO (30 dias). Ficam SEMPRE, inclusive no rejeitado: o rejeitado
                    nunca enviou nada, mas sumir com a faixa desalinharia a altura dos cards na
                    grade e a linha inteira ficaria torta. Sem dado → travessão, não zero, porque
                    "0 envios" e "ainda não sei" são coisas diferentes. */}
                <div className="tpl-nums" title="Últimos 30 dias">
                  <div className="tpl-num">
                    <b>{m ? m.enviadas.toLocaleString("pt-BR") : "—"}</b>
                    <span>envios</span>
                  </div>
                  <div className="tpl-num">
                    <b>{m ? m.entregues.toLocaleString("pt-BR") : "—"}</b>
                    <span>entregues</span>
                  </div>
                  <div className="tpl-num" title="Estimado pelo preço médio por mensagem paga da sua conta">
                    <b>{m && m.custoAprox != null && m.custoAprox > 0
                      ? "~" + m.custoAprox.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : m && m.enviadas === 0 ? "R$ 0,00" : "—"}</b>
                    <span>custo</span>
                  </div>
                </div>
                <div className="tpl-actions">
                  <button className="btn ic" disabled={!approved} title={approved ? "" : "só templates aprovados"} onClick={() => setSendFor(t)}>
                    <Icon name="send" size={14} /> Enviar teste
                  </button>
                  <button className="btn ic" title="Duplicar pra criar um parecido" onClick={() => setCreating(tplParaInicial(t))}>
                    <Icon name="copy" size={14} /> Duplicar
                  </button>
                  {/* Atalho pro disparo em massa COM este modelo já escolhido. Sem ele o caminho era
                      decorar o nome do template aqui, abrir o Disparador e procurar na lista — com
                      vários "coringa_imagem_copia"/"curingaimagem_copia" na galeria, é exatamente
                      onde se erra de modelo (pedido do dono ao vivo com um cliente, 30/09). */}
                  <Link
                    className="btn ic"
                    href={approved ? `/oficial/disparador?tpl=${encodeURIComponent(t.name)}&lang=${encodeURIComponent(t.language ?? "")}` : "#"}
                    onClick={(e) => { if (!approved) e.preventDefault(); }}
                    aria-disabled={!approved}
                    title={approved ? "Abre o Disparador já com este modelo selecionado" : "só templates aprovados"}
                    style={approved ? undefined : { opacity: .45, pointerEvents: "none" }}
                  >
                    <Icon name="send" size={14} /> Disparo em massa
                  </Link>
                  <button className="btn danger ic" onClick={() => del(t)}><Icon name="trash" size={14} /> Excluir</button>
                </div>
                {/* MÉTRICAS do modelo (30 dias): uso real, leitura, cliques e custo estimado pelo
                    preço médio por mensagem paga DESTA conta. Qualidade = a nota da própria Meta. */}
                {(m || qualidade) && (
                  <div className="tpl-metricas" title="Últimos 30 dias · custo estimado pelo preço médio por mensagem paga da sua conta">
                    {/* envios e custo saíram daqui: agora são cards acima dos botões. Sobra o que
                        os cards não mostram — leitura, cliques e a nota da própria Meta. */}
                    {m && m.entregues > 0 && <span><b>{Math.round((m.lidas / m.entregues) * 100)}%</b> lidas</span>}
                    {m && m.cliques > 0 && <span><b>{m.cliques}</b> clique{m.cliques === 1 ? "" : "s"}</span>}
                    {qualidade && <span style={{ color: qualidade.cor }}>qualidade <b>{qualidade.rotulo}</b></span>}
                  </div>
                )}
                {!m && !qualidade && metricas === null && <div className="tpl-metricas muted">métricas…</div>}
              </div>
            );
          })}
        </div>
        </>
      )}

      {creating && <CreateTemplate
        inicial={creating === true ? undefined : creating}
        onClose={() => { setCreating(null); carregaRascunhos(); }}
        onDone={(rascId?: string) => {
          // foi pra Meta: o rascunho cumpriu o papel e some sozinho
          if (rascId) jsend("/api/oficial/templates/rascunhos/" + encodeURIComponent(rascId), "DELETE", {}).then((d) => setRascunhos(d?.rascunhos ?? [])).catch(() => {});
          setCreating(null); load();
        }} />}
      {sendFor && <SendTest tpl={sendFor} onClose={() => setSendFor(null)} />}
      {insightsFor && <TemplateInsights tpl={insightsFor} onClose={() => setInsightsFor(null)} />}
    </div>
  );
}

// Tipos de cabeçalho que a Meta aceita no builder (AUTHENTICATION fica de fora — estrutura fixa).
const HEADERS = [
  { v: "none", label: "Sem cabeçalho" },
  { v: "text", label: "Texto" },
  { v: "image", label: "Imagem", accept: "image/jpeg,image/png", hint: "JPG ou PNG, até 5MB" },
  { v: "video", label: "Vídeo", accept: "video/mp4", hint: "MP4, até 16MB" },
  { v: "document", label: "Documento", accept: "application/pdf", hint: "PDF, até 16MB" },
];
export interface BotaoForm { tipo: "resposta" | "url" | "telefone"; texto: string; url: string; telefone: string }
// Prefill do modal (usado pela aba Coringa: abre já com corpo/exemplos/botões prontos).
export interface TemplateInicial {
  name?: string; category?: string; headerTipo?: string; body?: string;
  footerText?: string; examples?: string[]; botoes?: BotaoForm[];
  headerText?: string;      // cabeçalho de texto (o ARQUIVO nunca entra no rascunho)
  rascunhoId?: string;      // quando veio de um rascunho salvo: atualiza esse mesmo
}

export function CreateTemplate({ onClose, onDone, inicial }: { onClose: () => void; onDone: (rascunhoId?: string) => void; inicial?: TemplateInicial }) {
  const [name, setName] = useState(inicial?.name ?? "");
  const [category, setCategory] = useState(inicial?.category ?? "MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [headerTipo, setHeaderTipo] = useState(inicial?.headerTipo ?? "none");
  const [headerText, setHeaderText] = useState(inicial?.headerText ?? "");
  const [headerArquivo, setHeaderArquivo] = useState<{ dataUri: string; nome: string; file: File; mime: string } | null>(null);
  const [etapa, setEtapa] = useState(""); // vídeo de 16MB demora — a tela diz em que passo está
  const [body, setBody] = useState(inicial?.body ?? "");
  const [footerText, setFooterText] = useState(inicial?.footerText ?? "");
  const [examples, setExamples] = useState<string[]>(inicial?.examples ?? []);
  const [botoes, setBotoes] = useState<BotaoForm[]>(inicial?.botoes ?? []);
  // Reordenar botão ARRASTANDO. Antes a única forma de trocar a ordem era apagar e recriar lá
  // embaixo — e a ordem importa: é ela que define a posição no WhatsApp e o índice do ramo no fluxo.
  // Quem é arrastável é só a ALÇA (⠿), não a linha inteira: senão não dá pra selecionar texto
  // dentro dos campos.
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvoSolta, setAlvoSolta] = useState<number | null>(null);
  function moveBotao(de: number, para: number) {
    if (de === para || de < 0 || para < 0) return;
    setBotoes((prev) => {
      const l = prev.slice();
      const [item] = l.splice(de, 1);
      l.splice(para, 0, item);
      return l;
    });
  }
  // Em qual WABA aprovar: quando o painel tem MAIS de uma conta oficial, dá pra escolher uma ou
  // TODAS de uma vez ("aprovar nas 10" do pedido do dono). Com 1 só, o seletor nem aparece.
  const [wabas, setWabas] = useState<Array<{ wabaId: string; rotulo: string; numero?: string; foto?: string }>>([]);
  const [wabaSel, setWabaSel] = useState<string>("");
  useEffect(() => {
    jget("/api/meta/wabas").then((d) => setWabas(d.wabas ?? [])).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avisoPeso, setAvisoPeso] = useState("");
  const [rascunhoId, setRascunhoId] = useState(inicial?.rascunhoId ?? "");
  const [salvandoRasc, setSalvandoRasc] = useState(false);
  const [rascMsg, setRascMsg] = useState("");
  const { session } = useAuth();
  const ehAdmin = session?.user.role === "admin";
  // "Escrever com IA": descreve em linguagem livre → a IA preenche o form e tenta o encaixe UTILITY
  // (mais barato e menos sujeito a bloqueio que MARKETING).
  const [iaPedido, setIaPedido] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const [iaVeredito, setIaVeredito] = useState<{ categoria: string; motivo: string; dica?: string } | null>(null);

  const vc = useMemo(() => varCount(body), [body]);
  // Guarda o template pela metade no servidor, pra continuar depois. O ARQUIVO do cabeçalho não
  // vai junto (vídeo de 16MB não cabe numa config) — o aviso diz isso quando há arquivo escolhido.
  async function salvarRascunho() {
    if (salvandoRasc) return;
    setSalvandoRasc(true); setRascMsg("");
    try {
      const r = await jsend("/api/oficial/templates/rascunhos", "POST", {
        id: rascunhoId || undefined,
        dados: { name, category, headerTipo, headerText, body, footerText, examples, botoes },
      });
      if (r.id) setRascunhoId(r.id);
      setRascMsg(headerArquivo
        ? "Rascunho salvo. O arquivo do cabeçalho não fica guardado — escolha de novo ao enviar."
        : "Rascunho salvo. Ele aparece em Templates Meta, no topo da lista.");
    } catch (e: any) { setRascMsg(e?.message || "não consegui salvar o rascunho"); }
    setSalvandoRasc(false);
  }

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const headerDef = HEADERS.find((h) => h.v === headerTipo)!;
  const precisaArquivo = !!headerDef.accept;
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Insere {{N}} (N = próxima variável) NO CURSOR — gente não sabe que a variável é digitar "{{1}}".
  function inserirVariavel() {
    const token = `{{${vc + 1}}}`;
    const el = bodyRef.current;
    if (!el) { setBody(body + token); return; }
    const ini = el.selectionStart ?? body.length;
    const fim = el.selectionEnd ?? body.length;
    setBody(body.slice(0, ini) + token + body.slice(fim));
    setTimeout(() => { el.focus(); const p = ini + token.length; el.setSelectionRange(p, p); }, 0);
  }

  // Prévia: substitui {{n}} pelo exemplo (ou fica {{n}} se vazio) — é o que a pessoa vê no WhatsApp.
  const previaCorpo = body.replace(/\{\{(\d+)\}\}/g, (_m, i) => examples[Number(i) - 1]?.trim() || `{{${i}}}`);
  const previaImg = headerTipo === "image" && headerArquivo ? headerArquivo.dataUri : "";
  const previaBotoes = botoes.map((b) => b.texto.trim()).filter(Boolean);
  const horaPrev = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  // Conta que aparece no topo da prévia: a escolhida no seletor (ou a principal). Em "todas", mostra
  // a principal e o rodapé avisa que vai pras N contas.
  const contaPreview = wabaSel && wabaSel !== "all" ? wabas.find((w) => w.wabaId === wabaSel) ?? wabas[0] : wabas[0];

  async function sugerirComIA() {
    if (iaPedido.trim().length < 10 || iaBusy) return;
    setIaBusy(true); setErr(null); setIaVeredito(null);
    try {
      const d = await jsend("/api/meta/templates/sugerir", "POST", { texto: iaPedido.trim() });
      const s = d.sugestao ?? {};
      if (s.nome) setName(s.nome);
      if (s.categoria) setCategory(s.categoria);
      if (s.corpo) setBody(s.corpo);
      setExamples(Array.isArray(s.exemplos) ? s.exemplos : []);
      setFooterText(s.rodape ?? "");
      setBotoes((Array.isArray(s.botoes) ? s.botoes : []).map((b: any) => ({
        tipo: b.tipo ?? "resposta", texto: b.texto ?? "", url: b.url ?? "", telefone: b.telefone ?? "",
      })));
      setIaVeredito({ categoria: s.categoria, motivo: s.motivo, dica: s.dica });
    } catch (e: any) {
      setErr(e?.message || "a IA não respondeu — tente de novo");
    } finally {
      setIaBusy(false);
    }
  }

  function lerArquivo(f: File) {
    // 16MB é limite DA META (documentado: imagem 5MB, vídeo/áudio 16MB), não nosso. Acima disso a
    // Meta recusa ou o WhatsApp não entrega. O super admin pode passar do teto pra TESTAR o
    // comportamento real da Meta — o erro que voltar é dela, não um chute nosso.
    const max = headerTipo === "image" ? 5 : ehAdmin ? TETO_ADMIN_MB : 16;
    if (f.size > max * 1024 * 1024) { setErr(`Arquivo acima de ${max}MB — comprima e tente de novo.`); return; }
    const mb = f.size / 1024 / 1024;
    setAvisoPeso(mb > 16 && headerTipo !== "image"
      ? `Atenção: ${mb.toFixed(1)}MB passa do limite de 16MB que a Meta documenta pra vídeo. Vai subir mesmo assim — se ela recusar, o erro dela aparece aqui.`
      : "");
    const fr = new FileReader();
    fr.onload = () => { setHeaderArquivo({ dataUri: String(fr.result), nome: f.name, file: f, mime: f.type || "application/octet-stream" }); setErr(null); };
    fr.readAsDataURL(f);
  }

  async function submit() {
    if (!cleanName || !body.trim() || busy) return;
    if (precisaArquivo && !headerArquivo) { setErr("Escolha o arquivo do cabeçalho (é o exemplo que o revisor da Meta vê)."); return; }
    setBusy(true);
    setErr(null);
    try {
      // O ARQUIVO SOBE SOZINHO, em binário. Antes ele ia em base64 dentro do JSON do template:
      // um MP4 de 16MB virava ~21MB de texto numa requisição só, e qualquer engasgo no caminho
      // quebrava o JSON — o painel mostrava só "corpo inválido", sem dizer que era o arquivo.
      let handle = "", formatoHeader = "", previaHeader = "";
      if (precisaArquivo) {
        setEtapa("Enviando o arquivo pra Meta…");
        // `bytes` = tamanho REAL do arquivo no disco. É a única prova de ponta a ponta: se a conexão
        // cair no meio do upload, o que chega no motor é um MP4 cortado COM content-length coerente,
        // e ninguém percebe — a Meta aceita o handle e só depois responde "No video stream found in
        // given video file" (caso do dono, 29/09: 16,3MB viraram 10,4MB três vezes seguidas).
        const up = await fetch("/api/meta/templates/header?bytes=" + headerArquivo!.file.size + "&mime=" + encodeURIComponent(headerArquivo!.mime), {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: headerArquivo!.file,
        });
        const d = await up.json().catch(() => ({}));
        if (!up.ok || !d?.handle) throw new Error(d?.error || `não consegui enviar o arquivo (erro ${up.status})`);
        handle = d.handle;
        formatoHeader = d.formato;
        previaHeader = d.previa || "";
        setEtapa("Criando o template…");
      }
      const r = await jsend("/api/meta/templates", "POST", {
        name: cleanName, category, language,
        headerText: headerTipo === "text" ? headerText : "",
        headerHandle: handle, headerFormato: formatoHeader, previaUrl: previaHeader,
        body: body.trim(), footerText,
        examples: examples.slice(0, vc),
        botoes: botoes.map((b) => ({ tipo: b.tipo, texto: b.texto, url: b.url, telefone: b.telefone })),
        waba: wabaSel || undefined,
      });
      // Multi-WABA: mostra o que falhou por conta em vez de fechar como se tudo tivesse ido.
      if (Array.isArray(r?.resultados) && r.resultados.some((x: any) => !x.ok)) {
        const falhas = r.resultados.filter((x: any) => !x.ok).map((x: any) => `${x.rotulo}: ${x.error}`).join(" · ");
        setErr("Criado em parte das contas. Falhou em — " + falhas);
        setBusy(false);
        return;
      }
      onDone(rascunhoId || undefined);
    } catch (e: any) {
      setErr(e?.message || "falha ao criar");
    } finally {
      setBusy(false);
      setEtapa("");
    }
  }

  return (
    <div className="modal-overlay">
      <div className="tpl-modal tpl-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="import-head">
          <h3 style={{ margin: 0 }}>Novo template</h3>
          <button className="btn ic" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </div>
        <div className="tpl-modal-grid">
        <div className="tpl-form">
          <div className="tpl-ia">
            <label style={{ fontWeight: 700, fontSize: 13 }}>Escrever com IA</label>
            <div className="muted" style={{ fontSize: 12, margin: "2px 0 7px" }}>
              Descreva o que você quer mandar — a IA monta o template e tenta encaixar como <b>Utilidade</b> (mais barato que Marketing e com menos risco de bloqueio).
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="inp" style={{ flex: 1 }} value={iaPedido} onChange={(e) => setIaPedido(e.target.value)}
                placeholder="ex.: avisar que o boleto vence amanhã, com o valor e link pra pagar"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sugerirComIA(); } }} />
              <button type="button" className="btn primary" style={{ flex: "none" }} onClick={sugerirComIA} disabled={iaBusy || iaPedido.trim().length < 10}>
                {iaBusy ? "pensando…" : "Sugerir"}
              </button>
            </div>
            {iaVeredito && (
              <div className={"tpl-ia-veredito" + (iaVeredito.categoria === "UTILITY" ? " util" : "")}>
                <b>{iaVeredito.categoria === "UTILITY" ? "Encaixou como Utilidade" : "Isto é Marketing"}</b> — {iaVeredito.motivo}
                {iaVeredito.dica && <div style={{ marginTop: 3 }}>{iaVeredito.dica}</div>}
              </div>
            )}
          </div>
          <div className="field">
            <label>Nome (só minúsculas, números e _)</label>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: boas_vindas_pos_compra" />
            {name && cleanName !== name.trim() && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>vai virar: <code>{cleanName}</code></div>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>Categoria</label>
              <select className="inp" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 170 }}>
              <label>Idioma</label>
              <select className="inp" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
              </select>
            </div>
            {wabas.length > 1 && (
              <div className="field" style={{ flex: 1, minWidth: 170 }}>
                <label>Aprovar em qual conta</label>
                <select className="inp" value={wabaSel} onChange={(e) => setWabaSel(e.target.value)}>
                  <option value="">{wabas[0].rotulo} (principal)</option>
                  {wabas.slice(1).map((w) => <option key={w.wabaId} value={w.wabaId}>{w.rotulo}</option>)}
                  <option value="all">Todas as {wabas.length} contas</option>
                </select>
              </div>
            )}
          </div>
          <div className="field">
            <label>Cabeçalho (opcional)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {HEADERS.map((h) => (
                <button key={h.v} type="button" className={"btn" + (headerTipo === h.v ? " primary" : "")} style={{ padding: "5px 12px", fontSize: 12.5 }}
                  onClick={() => { setHeaderTipo(h.v); setHeaderArquivo(null); }}>
                  {h.label}
                </button>
              ))}
            </div>
            {headerTipo === "text" && (
              <input className="inp" style={{ marginTop: 8 }} value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Título curto" maxLength={60} />
            )}
            {precisaArquivo && (
              <div style={{ marginTop: 8 }}>
                <label className={"btn arquivo" + (headerArquivo ? " ok" : "")} style={{ cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Icon name={headerArquivo ? "check" : "plus"} size={13} /> {headerArquivo ? headerArquivo.nome : `Escolher arquivo (${headerDef.hint})`}
                  <input type="file" accept={headerDef.accept} style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }} />
                </label>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Este arquivo é o EXEMPLO que o revisor da Meta vê. Na hora de enviar, dá pra trocar por outro.
                </div>
              </div>
            )}
          </div>
          <div className="field">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <label style={{ margin: 0 }}>Corpo da mensagem *</label>
              <button type="button" className="btn ic" style={{ padding: "3px 10px", fontSize: 12 }} onClick={inserirVariavel} title="Insere um campo que você preenche na hora de enviar (ex.: o nome da pessoa)">
                <Icon name="plus" size={12} /> Adicionar variável
              </button>
            </div>
            <textarea ref={bodyRef} className="inp" style={{ marginTop: 5 }} rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado! 🎉" />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>As <b>variáveis</b> ({"{{1}}"}, {"{{2}}"}…) são campos que você preenche a cada envio. Clique em <b>Adicionar variável</b> ou digite direto.</div>
            {/* AVISO ANTES DA RECUSA: a Meta reprova "muitas variáveis para sua extensão" comparando
                o nº de variáveis com o texto FIXO do corpo. Antes só se descobria depois de enviar
                e esperar — agora o aviso aparece enquanto escreve, com o que fazer pra resolver. */}
            {(() => {
              const m = textoFixoPorVariavel(body);
              if (m.vars < 2 || m.porVar >= MIN_TEXTO_POR_VARIAVEL) return null;
              return (
                <div className="tpl-alerta-var">
                  <b>A Meta provavelmente vai recusar:</b> {m.vars} variáveis para só {m.fixo} caracteres de
                  texto fixo. Ela reclama de &ldquo;muitas variáveis para sua extensão&rdquo;.
                  {" "}<b>Como resolver:</b> escreva mais texto seu entre as variáveis (o que não muda de
                  envio pra envio) ou tire uma variável.
                </div>
              );
            })()}
          </div>
          {vc > 0 && (
            <div className="field">
              <label>Exemplos das variáveis (a Meta exige pra aprovar)</label>
              {Array.from({ length: vc }).map((_, i) => (
                <input key={i} className="inp" style={{ marginTop: 5 }} placeholder={`Exemplo pra {{${i + 1}}}`} value={examples[i] ?? ""}
                  onChange={(e) => setExamples((p) => { const n = [...p]; n[i] = e.target.value; return n; })} />
              ))}
            </div>
          )}
          <div className="field">
            <label>Rodapé (opcional)</label>
            <input className="inp" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="ex.: Responda PARAR pra sair" maxLength={60} />
          </div>
          <div className="field">
            <label>Botões (opcional, até 3){botoes.length > 1 ? <span className="muted" style={{ fontWeight: 500, marginLeft: 8, fontSize: 11.5 }}>— arraste pelo ⠿ pra mudar a ordem</span> : null}</label>
            {botoes.map((bt, i) => (
              <div
                key={i}
                className={"tpl-botao-linha" + (arrastando === i ? " arrastando" : "") + (alvoSolta === i && arrastando !== i ? " alvo" : "")}
                onDragOver={(e) => { if (arrastando !== null) { e.preventDefault(); setAlvoSolta(i); } }}
                onDragLeave={() => setAlvoSolta((v) => (v === i ? null : v))}
                onDrop={(e) => { e.preventDefault(); if (arrastando !== null) moveBotao(arrastando, i); setArrastando(null); setAlvoSolta(null); }}
              >
                <span
                  className="tpl-botao-alca"
                  draggable
                  onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* Safari exige o setData */ } }}
                  onDragEnd={() => { setArrastando(null); setAlvoSolta(null); }}
                  title="Arraste pra mudar a ordem dos botões"
                  aria-label={"Mover o botão " + (i + 1)}
                >⠿</span>
                <select className="inp" style={{ width: 150, flex: "none" }} value={bt.tipo}
                  onChange={(e) => setBotoes(botoes.map((x, j) => (j === i ? { ...x, tipo: e.target.value as BotaoForm["tipo"] } : x)))}>
                  <option value="resposta">Resposta rápida</option>
                  <option value="url">Abrir site</option>
                  <option value="telefone">Ligar</option>
                </select>
                <input className="inp" placeholder="Texto do botão" maxLength={25} value={bt.texto}
                  onChange={(e) => setBotoes(botoes.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                {bt.tipo === "url" && (
                  <input className="inp" placeholder="https://..." value={bt.url}
                    onChange={(e) => setBotoes(botoes.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                )}
                {bt.tipo === "telefone" && (
                  <input className="inp" placeholder="5511989998888" value={bt.telefone}
                    onChange={(e) => setBotoes(botoes.map((x, j) => (j === i ? { ...x, telefone: e.target.value } : x)))} />
                )}
                <button type="button" className="btn ic" title="Remover botão" onClick={() => setBotoes(botoes.filter((_, j) => j !== i))}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            {botoes.length < 3 && (
              <button type="button" className="btn ic" style={{ marginTop: botoes.length ? 6 : 0 }}
                onClick={() => setBotoes([...botoes, { tipo: "resposta", texto: "", url: "", telefone: "" }])}>
                <Icon name="plus" size={13} /> Adicionar botão
              </button>
            )}
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={busy || !cleanName || !body.trim()} onClick={submit}>
            {busy ? (etapa || "Enviando pra aprovação…") : "Criar e enviar pra aprovação"}
          </button>
          <button className="btn" style={{ width: "100%" }} disabled={busy || salvandoRasc || (!name.trim() && !body.trim())} onClick={salvarRascunho}>
            {salvandoRasc ? "salvando…" : rascunhoId ? "Salvar rascunho (atualizar)" : "Salvar como rascunho"}
          </button>
          {rascMsg && <div className="muted" style={{ fontSize: 12 }}>{rascMsg}</div>}
          {avisoPeso && <div style={{ color: "var(--amber, #E8A33D)", fontSize: 13, lineHeight: 1.45 }}>{avisoPeso}</div>}
          {err && <div style={{ color: "var(--crit)", fontSize: 13 }}>{err}</div>}
          <div className="muted" style={{ fontSize: 11.5 }}>A Meta revisa o template (minutos a horas). Depois de <b>Aprovado</b>, dá pra enviar.</div>
        </div>

        {/* Prévia AO VIVO — o template do jeito que a pessoa recebe no WhatsApp */}
        <aside className="tpl-previa">
          <div className="tpl-previa-rot">Prévia no WhatsApp</div>
          <div className="fone">
            <div className="fone-notch" />
            <div className="fone-tela">
              {/* Cabeçalho com a conta REAL onde o template vai ser criado — com 2+ contas, criar
                  no lugar errado é fácil demais. A foto vem miniatura (32px) pra não pesar. */}
              <div className="fone-topo">
                <span className="fone-volta">‹</span>
                {contaPreview?.foto ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="fone-ava fone-ava-img" src={contaPreview.foto} alt="" width={30} height={30} loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <span className="fone-ava">{(contaPreview?.rotulo ?? "A").slice(0, 1).toUpperCase()}</span>
                )}
                <span style={{ minWidth: 0 }}>
                  <b>{contaPreview?.rotulo ?? "Sua empresa"}</b>
                  <em>{wabaSel === "all" ? `criando em ${wabas.length} contas` : contaPreview?.numero || "Conta comercial"}</em>
                </span>
              </div>
              <div className="fone-chat">
                {!body.trim() && headerTipo === "none" && previaBotoes.length === 0 ? (
                  <div className="fone-dica">Vai montando o template — a prévia aparece aqui, igual a pessoa recebe.</div>
                ) : (
                  <div className="fone-balao">
                    {previaImg && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img loading="lazy" decoding="async" className="fone-img" src={previaImg} alt="" />
                    )}
                    {headerTipo === "video" && <FoneVideo src={headerArquivo?.dataUri} />}
                    {headerTipo === "document" && <FoneDoc nome={headerArquivo?.nome} dataUri={headerArquivo?.dataUri} />}
                    {headerTipo === "text" && headerText.trim() && <div className="fone-corpo" style={{ fontWeight: 700, paddingBottom: 0 }}>{headerText}</div>}
                    {previaCorpo.trim() && <div className="fone-corpo">{waNegrito(previaCorpo)}</div>}
                    {footerText.trim() && <div className="fone-rodape">{footerText}</div>}
                    <span className="fone-hora">{horaPrev}</span>
                    {previaBotoes.length > 0 && (
                      <div className="fone-botoes">{previaBotoes.map((b, i) => <div key={i} className="fone-botao">{b}</div>)}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}

function SendTest({ tpl, onClose }: { tpl: Tpl; onClose: () => void }) {
  const body = compText(tpl, "BODY");
  const vc = varCount(body);
  const [to, setTo] = useState(FONE_INICIAL); // já nasce com o +55 (a máscara completa enquanto digita)
  const [params, setParams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null); // número pra onde FOI (trava o reenvio sem querer)
  const [erro, setErro] = useState<string | null>(null);
  // MÍDIA DO TOPO (pedido do dono, 13/10): template com imagem/vídeo/documento PERGUNTA o que mandar —
  // a aprovada (padrão; o motor hospeda a cópia dela) ou outra que a pessoa sobe agora.
  const hdr = tpl.components?.find((c) => c.type === "HEADER") as any;
  const fmtTopo = ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(hdr?.format ?? "")) ? String(hdr.format) : "";
  const rotuloTopo = fmtTopo === "VIDEO" ? "vídeo" : fmtTopo === "DOCUMENT" ? "documento" : "imagem";
  const [usarOutra, setUsarOutra] = useState(false);
  const [topoUrl, setTopoUrl] = useState("");
  const [topoNome, setTopoNome] = useState("");
  const [subindo, setSubindo] = useState(false);
  async function escolheArquivo(f: File) {
    setSubindo(true); setErro(null);
    try { setTopoUrl(await subirArquivo(f, f.type)); setTopoNome(f.name); if (enviado) setEnviado(null); }
    catch (e: any) { setErro(e?.message || "falha ao subir o arquivo"); }
    setSubindo(false);
  }
  // Depois do "Meta aceitou", a entrega pode falhar segundos depois (ex.: "Media upload error").
  // Confere o status da mensagem por ~25s e mostra o motivo aqui mesmo, sem precisar ir ao WPP Api.
  const [entrega, setEntrega] = useState<string>("");

  // O corpo com as variáveis PREENCHIDAS ao vivo — é o que alimenta o mockup do lado direito.
  const bodyPreenchido = body.replace(/\{\{(\d+)\}\}/g, (m0, n) => {
    const v = (params[Number(n) - 1] ?? "").trim();
    return v || m0; // vazio mantém o {{n}} visível — a pessoa VÊ o que falta preencher
  });

  async function send() {
    const num = soDigitosFone(to);
    if (num.length < 12 || busy || enviado) return;
    setBusy(true);
    setErro(null);
    try {
      if (fmtTopo && usarOutra && !topoUrl) throw new Error(`escolha o arquivo de ${rotuloTopo} ou marque "usar a ${rotuloTopo} aprovada"`);
      await jsend("/api/meta/templates/send", "POST", { to: num, name: tpl.name, language: tpl.language, params: params.slice(0, vc),
        ...(fmtTopo && usarOutra && topoUrl ? { headerUrl: topoUrl } : {}) });
      setEnviado(mascaraFone(num));
      setEntrega("conferindo a entrega…");
      void (async () => {
        const desde = Date.now() / 1000 - 5;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 4500));
          const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(num)).catch(() => null);
          const m = ((d?.messages ?? []) as any[]).filter((x) => x.from_me && (x.ts ?? 0) >= desde).pop();
          const ack = String(m?.extra?.ack ?? "");
          if (ack === "failed") { setEntrega("Não entregue: " + (m?.extra?.erro || "a Meta recusou a entrega")); return; }
          if (ack === "delivered" || ack === "read") { setEntrega(ack === "read" ? "Entregue e lido ✓✓" : "Entregue ✓✓"); return; }
        }
        setEntrega("Sem confirmação da Meta ainda — confira no WPP Api.");
      })();
    } catch (e: any) {
      setErro(e?.message || "falha ao enviar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="tpl-modal tpl-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="import-head">
          <div><h3 style={{ margin: 0 }}>Enviar teste</h3><div className="muted" style={{ fontSize: 12.5 }}>{tpl.name} · {nomeIdioma(tpl.language)}</div></div>
          <button className="btn ic" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </div>
        <div className="tpl-modal-grid">
          <div className="tpl-form">
            <div className="field">
              <label>Enviar para (DDI+DDD+número)</label>
              <input className="inp" style={{ fontFamily: "var(--mono)" }} inputMode="tel" value={to}
                onChange={(e) => { setTo(mascaraFone(e.target.value)); if (enviado) setEnviado(null); }}
                placeholder="+55 (11) 98999-8888" disabled={busy} />
            </div>
            {fmtTopo && (
              <div className="field">
                <label>{rotuloTopo === "imagem" ? "Imagem" : rotuloTopo === "vídeo" ? "Vídeo" : "Documento"} do topo</label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, marginTop: 4 }}>
                  <input type="radio" checked={!usarOutra} onChange={() => { setUsarOutra(false); if (enviado) setEnviado(null); }} disabled={busy} />
                  Usar a {rotuloTopo} aprovada no template
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, marginTop: 4 }}>
                  <input type="radio" checked={usarOutra} onChange={() => { setUsarOutra(true); if (enviado) setEnviado(null); }} disabled={busy} />
                  Enviar outra {rotuloTopo}
                </label>
                {usarOutra && (
                  <label className="btn" style={{ marginTop: 6, cursor: "pointer", justifySelf: "start", fontSize: 12.5 }}>
                    {subindo ? "subindo…" : topoNome ? `Trocar arquivo (${topoNome.slice(0, 30)})` : "Escolher arquivo"}
                    <input type="file" style={{ display: "none" }}
                      accept={fmtTopo === "IMAGE" ? "image/jpeg,image/png" : fmtTopo === "VIDEO" ? "video/mp4" : "application/pdf"}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) escolheArquivo(f); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            )}
            {vc > 0 && (
              <div className="field">
                <label>Valores das variáveis</label>
                {Array.from({ length: vc }).map((_, i) => (
                  <input key={i} className="inp" style={{ marginTop: 5 }} placeholder={`Valor de {{${i + 1}}}`} value={params[i] ?? ""}
                    onChange={(e) => setParams((p) => { const n = [...p]; n[i] = e.target.value; if (enviado) setEnviado(null); return n; })} disabled={busy} />
                ))}
              </div>
            )}
            {/* Estado INCONFUNDÍVEL do envio: depois do sucesso o botão TRAVA em "Enviado" —
                clicar de novo não reenvia (era o medo do dono: achar que falhou e duplicar).
                Pra mandar outro, ou muda o número/variável, ou clica em "Enviar outro teste". */}
            {enviado ? (
              <>
                <div className="teste-ok">
                  <b>Teste enviado pra {enviado}</b>
                  <span>A Meta aceitou o envio. Confira o WhatsApp do número — se ela segurar a entrega
                  (acontece com marketing repetido pro mesmo número), o balão no WPP Api mostra o motivo em vermelho.</span>
                </div>
                {entrega && <div className={entrega.startsWith("Não entregue") ? "teste-erro" : "muted"} style={{ fontSize: 12.5 }}>{entrega.startsWith("Não entregue") ? <b>{entrega}</b> : entrega}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" style={{ flex: 1 }} disabled>
                    <svg viewBox="0 0 16 12" width="14" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: "-1px" }}><path d="M1.5 6.5 L5.5 10.5 L14.5 1.5" /></svg>
                    Enviado
                  </button>
                  <button className="btn" onClick={() => { setEnviado(null); setEntrega(""); }}>Enviar outro teste</button>
                </div>
              </>
            ) : (
              <button className="btn primary" style={{ width: "100%" }} disabled={busy || soDigitosFone(to).length < 12} onClick={send}>{busy ? "Enviando…" : "Enviar teste"}</button>
            )}
            {erro && <div className="teste-erro"><b>Não foi.</b> {erro}</div>}
          </div>
          {/* O celularzinho AO VIVO: as variáveis digitadas entram no balão na hora (pedido 23/08).
              Reusa os mesmos blocos do card e do criador — mockup é sempre o mesmo em toda tela. */}
          <aside className="tpl-previa">
            <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Como a pessoa recebe</div>
            <div className="tpl-fone-chat">
              <div className="fone-balao">
                {headerImg(tpl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img loading="lazy" decoding="async" className="fone-img" src={headerImg(tpl)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : headerFormato(tpl) === "IMAGE" ? (
                  <div className="fone-video sem-previa">{SEM_PREVIA.IMAGE}</div>
                ) : headerFormato(tpl) === "VIDEO" ? (
                  <FoneVideo src={headerVideo(tpl)} rotulo={SEM_PREVIA.VIDEO} />
                ) : headerFormato(tpl) === "DOCUMENT" ? (
                  <div className="fone-video sem-previa">{SEM_PREVIA.DOCUMENT}</div>
                ) : null}
                {compText(tpl, "HEADER") && <div className="fone-corpo" style={{ fontWeight: 700, paddingBottom: 0 }}>{compText(tpl, "HEADER")}</div>}
                <div className="fone-corpo">{bodyPreenchido ? waNegrito(bodyPreenchido) : <span style={{ color: "#999" }}>(sem corpo)</span>}</div>
                {compText(tpl, "FOOTER") && <div className="fone-rodape">{compText(tpl, "FOOTER")}</div>}
                <span className="fone-hora">{horaAgora()}</span>
                {botoesDoTpl(tpl).length > 0 && (
                  <div className="fone-botoes">{botoesDoTpl(tpl).map((bt: any, i: number) => <BotaoTpl key={i} bt={bt} />)}</div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// INSIGHTS do template — o "Insights sobre o modelo" do Gerenciador dentro do painel:
// funil enviadas → entregues → lidas → cliques, série diária e cliques por botão.
// Fonte: Template Analytics API da Meta (por template_id, na WABA do card).
// `periodo` (calendário) vence `dias` (atalho 7/30/90): a página de Métricas abre este painel já
// no período que a pessoa escolheu lá, e os botões 7/30/90 aqui trocam pro atalho.
export function TemplateInsights({ tpl, onClose, periodo }: { tpl: Tpl; onClose: () => void; periodo?: { de: string; ate: string } }) {
  const [custom, setCustom] = useState<{ de: string; ate: string } | null>(periodo ?? null);
  const [dias, setDias] = useState(30);
  const [d, setD] = useState<any | null>(null);
  const [erro, setErro] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [ligando, setLigando] = useState(false);
  const [ligou, setLigou] = useState(false);

  useEffect(() => {
    let vivo = true;
    setD(null); setErro("");
    const faixa = custom ? `&de=${encodeURIComponent(custom.de)}&ate=${encodeURIComponent(custom.ate)}` : `&dias=${dias}`;
    jget(`/api/meta/templates/insights?id=${encodeURIComponent(tpl.id ?? "")}${tpl.wabaId ? "&waba=" + encodeURIComponent(tpl.wabaId) : ""}${faixa}`)
      .then((x) => { if (vivo) setD(x); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [tpl, dias, custom]);

  // ZERO tem duas causas MUITO diferentes: "ninguém enviou" ou "a Meta nunca capturou". A segunda
  // é uma pegadinha silenciosa (precisa ligar is_enabled_for_insights na WABA) e some da tela sem
  // aviso nenhum — quem olha conclui que o template não performa.
  const capturaDesligada = d?.capturaLigada === false && !ligou;
  async function ligarMetricas() {
    setLigando(true);
    try {
      await jsend("/api/meta/templates/insights/ativar", "POST", {});
      setLigou(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLigando(false);
    }
  }

  const t = d?.totais ?? { enviadas: 0, entregues: 0, lidas: 0, cliques: 0 };
  const pct = (v: number) => (t.enviadas > 0 ? Math.round((v / t.enviadas) * 100) : 0);
  const funil: Array<[string, number, number]> = [
    ["Enviadas", t.enviadas, t.enviadas > 0 ? 100 : 0],
    ["Entregues", t.entregues, pct(t.entregues)],
    ["Lidas", t.lidas, pct(t.lidas)],
    ["Cliques", t.cliques, pct(t.cliques)],
  ];
  const pontos: any[] = (d?.pontos ?? []).slice().sort((a: any, b: any) => a.start - b.start);
  const maxDia = Math.max(1, ...pontos.map((p) => p.delivered));
  const diaCurto = (sec: number) => new Date(sec * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="modal-overlay">
      <div className="tpl-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="import-head">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>Insights · {tpl.name}</h3>
            <div className="muted" style={{ fontSize: 12 }}>{CATS.find((c) => c.v === tpl.category)?.label ?? tpl.category} · {nomeIdioma(tpl.language)}{tpl.wabaRotulo ? ` · ${tpl.wabaRotulo}` : ""}</div>
          </div>
          <button className="btn ic" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, margin: "10px 0", alignItems: "center", flexWrap: "wrap" }}>
          {[7, 30, 90].map((n) => (
            <button key={n} className={"btn" + (!custom && dias === n ? " primary" : "")} style={{ padding: "4px 12px", fontSize: 12.5 }} onClick={() => { setCustom(null); setDias(n); }}>{n} dias</button>
          ))}
          {custom && (
            <span className="btn primary" style={{ padding: "4px 12px", fontSize: 12.5, cursor: "default" }}>
              {custom.de === custom.ate ? custom.de.split("-").reverse().join("/") : `${custom.de.split("-").reverse().join("/")} – ${custom.ate.split("-").reverse().join("/")}`}
            </span>
          )}
        </div>

        {/* A captura NUNCA foi ligada nesta conta: a Meta responde 200 com tudo zerado, sem erro
            nenhum. Explica e resolve num clique — com o aviso de que não vem histórico. */}
        {capturaDesligada && (
          <div className="tpli-aviso">
            <b>As métricas nunca foram ligadas nesta conta.</b>
            <p>
              A Meta só começa a contar envios, leituras e cliques depois que a captura é ativada na
              conta — e <b>não devolve o que passou</b>. É por isso que está tudo zerado, mesmo com
              template já enviado.
            </p>
            <button className="btn primary" disabled={ligando} onClick={ligarMetricas}>
              {ligando ? "Ligando…" : "Ligar as métricas agora"}
            </button>
          </div>
        )}
        {ligou && (
          <div className="tpli-aviso ok">
            <b>Métricas ligadas.</b>
            <p>A partir de agora a Meta conta cada envio deste e dos outros modelos. Os números
            começam a aparecer aqui nas próximas horas — o período anterior segue sem dados.</p>
          </div>
        )}

        {erro ? (
          <div style={{ color: "var(--crit)", fontSize: 13, lineHeight: 1.5 }}>
            A Meta respondeu: {erro}
          </div>
        ) : !d ? (
          <div className="muted" style={{ fontSize: 13 }}>Consultando a Meta…</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="tpli-kpis">
              <div><span>Enviadas</span><b>{t.enviadas.toLocaleString("pt-BR")}</b></div>
              <div><span>Entregues</span><b>{t.entregues.toLocaleString("pt-BR")}</b><em>{pct(t.entregues)}%</em></div>
              <div><span>Lidas</span><b>{t.lidas.toLocaleString("pt-BR")}</b><em>{pct(t.lidas)}%</em></div>
              <div><span>Cliques</span><b>{t.cliques.toLocaleString("pt-BR")}</b><em>{pct(t.cliques)}%</em></div>
            </div>

            {/* Funil (como a aba "Funil" do Gerenciador) */}
            <div style={{ display: "grid", gap: 6 }}>
              {funil.map(([rotulo, valor, p]) => (
                <div key={rotulo} className="tpli-funil-linha">
                  <span className="tpli-funil-rotulo">{rotulo}</span>
                  <div className="tpli-funil-trilha"><div className="tpli-funil-barra" style={{ width: `${Math.max(p, valor > 0 ? 3 : 0)}%` }} /></div>
                  <span className="tpli-funil-pct">{valor.toLocaleString("pt-BR")} · {p}%</span>
                </div>
              ))}
            </div>

            {(d.botoes ?? []).length > 0 && (
              <div>
                <b style={{ fontSize: 13 }}>Cliques por botão</b>
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {d.botoes.map((b: any) => (
                    <div key={b.texto} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span className="tpl-botao">{b.texto}</span><b>{b.cliques.toLocaleString("pt-BR")}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pontos.length > 1 ? (
              <div>
                <b style={{ fontSize: 13 }}>Entregues por dia</b>
                <div className="omx-grafico" style={{ height: 90, marginTop: 6 }}>
                  {pontos.map((p, i) => (
                    <div key={p.start} className="omx-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                      {hover === i && <div className="omx-tip">{diaCurto(p.start)} · <b>{p.delivered} entregues · {p.read} lidas</b></div>}
                      <div className={"omx-barra" + (hover === i ? " on" : "")} style={{ height: `${Math.max(2, (p.delivered / maxDia) * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="omx-eixo"><span>{diaCurto(pontos[0].start)}</span><span>{diaCurto(pontos[pontos.length - 1].start)}</span></div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12.5 }}>Sem volume suficiente no período pra desenhar o gráfico.</div>
            )}

            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              Erros de entrega (ex.: “a Meta optou por não entregar”, código 131049 — limite de marketing
              por pessoa) e custo por modelo ficam só no Gerenciador da Meta, a API não expõe.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
