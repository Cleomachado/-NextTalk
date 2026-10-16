"use client";
import { OrigemLead } from "@/components/OrigemLead";
import { PausaIa } from "@/components/PausaIa";
import { ContratoProcuracao } from "@/components/ContratoProcuracao";
import { EtiquetasChat } from "@/components/EtiquetasChat";
import { CampoMensagem } from "@/components/CampoMensagem";
import { EMOJIS } from "@/lib/emojis";
import { OrigemMsg } from "@/components/OrigemMsg";
import { AnexoPrevia } from "@/components/AnexoPrevia";

// Conversas da API OFICIAL (Cloud API da Meta).
// Diferente do WPP ao Vivo (LITE), aqui o histórico vem do NOSSO banco: a Meta não devolve
// conversa passada, então só existe o que o motor arquivou (recebido no webhook + enviado por nós).
// A regra que muda tudo nesta tela: só dá pra escrever livremente dentro de 24h da última mensagem
// DA PESSOA. Passou disso, a Meta exige modelo aprovado — a tela avisa antes de deixar digitar.
import { Fragment, useMemo, useCallback, useEffect, useRef, useState } from "react";
import { jget, jsend, conferirEnvio } from "@/lib/client";
import { chaveDoDia, rotuloDoDia } from "@/lib/dia";
import { Icon } from "@/components/icons";
import { fmtNumber, useAccounts } from "@/components/accounts";
import { useT } from "@/lib/i18n";
import { LocalCard, type Local } from "./LocalCard";
import { AudioBalao } from "./AudioBalao";
import { ContatoCard, type Contato } from "./ContatoCard";
import { FotoZoom } from "./FotoZoom";
import { FichaContatoModal } from "./FichaContato";

interface ChatOficial { chat_id: string; name: string | null; last_body: string; last_ts: number | null; from_me: boolean; total: number; avatar_url?: string | null }
interface MsgOficial { msg_id: string; from_me: boolean; sender_name?: string; body: string; msg_type?: string; ts?: number; extra?: { alvo?: string; /* reação: wamid da mensagem reagida */ anuncio?: { headline?: string; url?: string; thumb?: string }; tpl?: { nome?: string; idioma?: string; botoes?: Array<{ texto: string; tipo: string }>; rodape?: string }; ack?: string; erro?: string; erroCodigo?: number; origem?: string; /* quem enviou: painel | bot | android | ios | web */ respondeA?: string; /* wamid da mensagem citada */ autor?: string; /* nome de quem enviou pelo painel */ local?: Local; contatos?: Contato[] } }

// ✓/✓✓/✓✓azul no balão oficial (o ack vem do webhook de status da Meta: sent → delivered → read).
// Sem ack ainda = "a Meta aceitou" → um ✓ só, que é o único fato garantido.
function TickOficial({ ack }: { ack?: string }) {
  const dois = ack === "delivered" || ack === "read";
  return (
    <svg className={"tick-svg" + (ack === "read" ? " read" : "")} viewBox="0 0 16 10" width={dois ? 15 : 11} height="10"
      aria-label={ack === "read" ? "lida" : ack === "delivered" ? "entregue" : "enviada"}>
      {dois && <path d="M1 5.3 L4 8.2 L10.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      <path d="M6 5.3 L9 8.2 L15.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        transform={dois ? undefined : "translate(-5 0)"} />
    </svg>
  );
}
interface TplMeta { name: string; status?: string; language?: string; category?: string; components?: any[] }

// Quantas variáveis {{n}} o corpo do template tem (pra montar os campos de preenchimento).
const contaVars = (texto: string) => {
  const ns = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return ns.length ? Math.max(...ns) : 0;
};
const corpoDoTpl = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "BODY")?.text ?? "");
const headerDoTpl = (t: TplMeta) => String((t.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "HEADER")?.format ?? "").toUpperCase();

// URLs no texto viram link clicável — igual o WPP ao Vivo já faz (Inbox.tsx). Sem isso, o link
// era só texto solto: dava pra ler mas não pra tocar/abrir direto no celular (print de 15/08).
const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|www\.[^\s<>()]+[^\s<>().,;:!?'"])/g;
// Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```) — a mesma do WPP ao Vivo,
// porque o cliente não tem que ver asterisco cru num canal e texto formatado no outro.
// O marcador só vale colado no texto e não atravessa quebra de linha; formatos aninham.
// Regra do WhatsApp (validada caso a caso): o marcador não pode ter ESPAÇO colado por dentro
// (`2 * 3` não é negrito) nem letra/número colado por fora (`snake_case`, `email_x@y.com` ficam
// intactos). ``` … ``` é código: nada é interpretado lá dentro.
const marc = (m: string) => `(?<![\\p{L}\\p{N}])${m}[^\\s${m}](?:[^${m}\\n]*[^\\s${m}])?${m}(?![\\p{L}\\p{N}])`;
const FORMATO_RE = new RegExp(`(\`\`\`[\\s\\S]+?\`\`\`|${marc("\\*")}|${marc("_")}|${marc("~")})`, "u");
function comFormato(texto: string, chave: string): React.ReactNode {
  const partes = texto.split(FORMATO_RE);
  if (partes.length === 1) return texto;
  return partes.map((p, i) => {
    if (i % 2 === 0) return p || null;
    const k = `${chave}f${i}`;
    if (p.startsWith("```")) return <code key={k} className="msg-mono">{p.slice(3, -3)}</code>;
    const dentro = p.slice(1, -1);
    if (p.startsWith("*")) return <b key={k}>{comFormato(dentro, k)}</b>;
    if (p.startsWith("_")) return <i key={k}>{comFormato(dentro, k)}</i>;
    return <s key={k}>{comFormato(dentro, k)}</s>;
  });
}
function comLinks(texto: string) {
  const partes = texto.split(URL_RE);
  return partes.map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={p.startsWith("www.") ? "https://" + p : p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {p}
      </a>
    ) : (
      // Formatação DEPOIS do link: endereço com _ ou ~ no meio não vira itálico/riscado.
      <span key={i}>{comFormato(p, "t" + i)}</span>
    ),
  );
}

// Mídia no arquivo: balão com msg_type image/video/audio/document/sticker guarda
// "URL do arquivo[\n legenda]" no body — separa aqui pra renderizar player/imagem + legenda.
const TIPOS_MIDIA = ["image", "video", "audio", "document", "sticker"];
function separaMidia(m: MsgOficial): { url: string; legenda: string } | null {
  if (!TIPOS_MIDIA.includes(m.msg_type || "")) return null;
  const [primeira, ...resto] = m.body.split("\n");
  if (!/^https?:\/\//i.test(primeira)) return null; // mídia antiga sem URL arquivada → cai no texto
  return { url: primeira, legenda: resto.join("\n").trim() };
}

const JANELA_H = 24;
const hhmm = (ts?: number | null) => (ts ? new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const quando = (ts?: number | null) => {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? hhmm(ts) : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
// Horas desde a última mensagem DO CLIENTE — é ela que abre a janela de 24h.
function horasDesdeCliente(msgs: MsgOficial[]): number | null {
  const ultima = [...msgs].reverse().find((m) => !m.from_me && m.ts);
  return ultima?.ts ? (Date.now() / 1000 - ultima.ts) / 3600 : null;
}

export function OficialInbox() {
  const t = useT();
  const [chats, setChats] = useState<ChatOficial[] | null>(null);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MsgOficial[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [fotoGrande, setFotoGrande] = useState<string | null>(null); // foto de perfil ampliada
  const [fichaOpen, setFichaOpen] = useState(false); // ficha do contato (clique no nome)
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  // Enviar TEMPLATE dentro do chat: é o único jeito de INICIAR conversa ou REABRIR a janela de 24h.
  const [tplOpen, setTplOpen] = useState(false);
  const [tpls, setTpls] = useState<TplMeta[] | null>(null);
  const [tplSel, setTplSel] = useState<TplMeta | null>(null);
  // Esta tela NUNCA navega embora (redirect daqui + redirect do Lite = loop; visto ao vivo 18/08).
  // Se a bolinha ativa é Lite mas existe conta API, ela só PUXA a bolinha da API e fica. E o
  // convite pra conectar sai da CONFIGURAÇÃO (/api/meta), não das bolinhas: na coexistência
  // (mesmo número no Lite e na API) o seletor funde as bolinhas por telefone e some com a da API —
  // pelas bolinhas a tela juraria que não existe conta oficial, com conversa arquivada na cara.
  const { accounts, activeAcct, setActive } = useAccounts();
  const bolinhaApi = accounts.find((a) => a.type === "API");
  useEffect(() => {
    if (bolinhaApi && activeAcct && activeAcct.type === "LITE") setActive(bolinhaApi.id);
  }, [bolinhaApi, activeAcct, setActive]);
  // Link direto (botão "Chamar" dos Resumos): /oficial/inbox?abrir=<telefone>&texto=<msg> abre a
  // conversa com a mensagem já na caixa. Lido uma vez; a URL é limpa em seguida.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const tel = (q.get("abrir") || "").replace(/\D/g, "");
    if (!tel) return;
    grudado.current = true;
    setAtivo(tel);
    const t = q.get("texto");
    if (t) setTexto(t);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [apiConectada, setApiConectada] = useState<boolean | null>(null); // null = ainda não sei
  useEffect(() => {
    jget("/api/meta")
      .then((d) => setApiConectada(!!d?.connected || !!d?.phoneNumberId))
      .catch(() => setApiConectada(null)); // sem resposta → não afirma nada (não esconde a caixa por palpite)
  }, []);
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [tplEnviando, setTplEnviando] = useState(false);
  const [tplErr, setTplErr] = useState("");
  const [anexando, setAnexando] = useState(false);
  // Respostas rápidas: digitar "/" no começo abre o menu (mesmo padrão do WPP ao Vivo; os atalhos
  // vêm de Configurações → Respostas rápidas).
  // Busca DENTRO da conversa aberta: filtra os balões conforme digita (pedido do dono 19/08).
  const [buscaMsgOn, setBuscaMsgOn] = useState(false);
  const [buscaMsg, setBuscaMsg] = useState("");
  // Agendar mensagem pra esta conversa — mesma lógica do WPP ao Vivo (vira um Lembrete "once" com
  // account "api"; o agendador envia pelo número oficial do workspace).
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [agMsg, setAgMsg] = useState("");
  const [agData, setAgData] = useState("");
  const [agHora, setAgHora] = useState("");
  const [agSalvando, setAgSalvando] = useState(false);
  const [agErro, setAgErro] = useState("");
  const [agOk, setAgOk] = useState("");
  // Enviar um FLUXO pra esta conversa (o template vai dentro dele, com os ramos armados).
  const [fluxoOpen, setFluxoOpen] = useState(false);
  const [fluxos, setFluxos] = useState<Array<{ id: string; name?: string }> | null>(null);
  const [fluxoEnviando, setFluxoEnviando] = useState("");
  const [fluxoErr, setFluxoErr] = useState("");
  const [quickReplies, setQuickReplies] = useState<Array<{ shortcut: string; text: string }>>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrQ, setQrQ] = useState("");
  const composeRef = useRef<HTMLTextAreaElement>(null);
  // 😀 Botão de emoji ao lado do Enviar (pedido do dono, 13/10 — igual ao WhatsApp e ao WPP ao Vivo).
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Abas do painel: emoji · respostas rápidas (no celular o "/" fica escondido no teclado) · figurinha
  const [emojiAba, setEmojiAba] = useState<"emoji" | "qr" | "fig">("emoji");
  const figRef = useRef<HTMLInputElement>(null);
  // Barra de reação aberta em qual balão (wamid)
  const [reagindo, setReagindo] = useState<string | null>(null);
  // Arrastar o balão pro lado = responder (celular), igual ao WhatsApp
  const swipe = useRef<{ x: number; y: number; el: HTMLElement | null; m: MsgOficial | null }>({ x: 0, y: 0, el: null, m: null });
  // 😀 REAÇÕES: cada msg_type "reaction" aponta pro balão alvo (extra.alvo). Vale a ÚLTIMA de cada
  // lado (lead/nós) — reagir de novo troca, emoji vazio tira.
  const reacoes = useMemo(() => {
    const porAlvo = new Map<string, { meu?: string; dele?: string }>();
    for (const r of msgs) {
      if (r.msg_type !== "reaction" || !r.extra?.alvo) continue;
      const cur = porAlvo.get(r.extra.alvo) ?? {};
      if (r.from_me) cur.meu = r.body || undefined; else cur.dele = r.body || undefined;
      porAlvo.set(r.extra.alvo, cur);
    }
    return porAlvo;
  }, [msgs]);
  useEffect(() => {
    if (!emojiOpen) return;
    const fora = (ev: PointerEvent) => { if (!(ev.target as HTMLElement | null)?.closest?.(".ofi-emoji-wrap")) setEmojiOpen(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [emojiOpen]);
  // Insere no PONTO DO CURSOR (não no fim) e devolve o foco/cursor logo depois do emoji.
  function insereEmoji(emo: string) {
    const el = composeRef.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + emo + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => { if (el) { el.focus(); const pos = ini + emo.length; el.setSelectionRange(pos, pos); } });
  }
  async function reagir(m: MsgOficial, emoji: string) {
    setReagindo(null);
    if (!ativo || !/^wamid\./.test(m.msg_id)) return;
    try {
      await jsend("/api/oficial/reagir", "POST", { chatid: ativo, mid: m.msg_id, emoji });
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []);
    } catch (e: any) { setErro(e.message); }
  }
  // Figurinha: qualquer imagem → o motor converte pro WEBP 512×512 que a Meta exige.
  async function enviaFigurinha(file: File) {
    if (!ativo || anexando) return;
    setAnexando(true); setErro(""); setEmojiOpen(false);
    try {
      const qs = new URLSearchParams({ chatid: ativo, mime: file.type || "image/png", figurinha: "1" });
      const up = await fetch("/api/oficial/send-media?" + qs.toString(), { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const du = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(du?.error || "não consegui enviar a figurinha");
      grudado.current = true;
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []);
    } catch (e: any) { setErro(e.message); }
    setAnexando(false);
    if (figRef.current) figRef.current.value = "";
  }
  function swipeIni(e: React.TouchEvent<HTMLDivElement>, m: MsgOficial) {
    const t0 = e.touches[0]; swipe.current = { x: t0.clientX, y: t0.clientY, el: e.currentTarget, m };
  }
  function swipeMove(e: React.TouchEvent<HTMLDivElement>) {
    const sw = swipe.current; if (!sw.el) return;
    const dx = e.touches[0].clientX - sw.x, dy = Math.abs(e.touches[0].clientY - sw.y);
    if (dy > 30) { sw.el.style.transform = ""; sw.el = null; return; } // rolagem vertical: desiste
    if (dx > 0) sw.el.style.transform = `translateX(${Math.min(dx, 70)}px)`;
  }
  function swipeFim(e: React.TouchEvent<HTMLDivElement>) {
    const sw = swipe.current; if (!sw.el) return;
    const dx = (e.changedTouches[0]?.clientX ?? sw.x) - sw.x;
    sw.el.style.transform = "";
    if (dx > 55 && sw.m) citar(sw.m);
    sw.el = null;
  }
  const arquivoRef = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);
  // Pílula flutuante de dia (igual ao inbox LITE): texto em vista + liga/desliga com fade.
  const [diaFlutuante, setDiaFlutuante] = useState("");
  const [flutuanteOn, setFlutuanteOn] = useState(false);
  const flutuanteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    jget("/api/config/quick-replies").then((d) => setQuickReplies(Array.isArray(d.items) ? d.items : [])).catch(() => {});
  }, []);
  const qrFiltradas = quickReplies.filter((r) => {
    const s = qrQ.trim().toLowerCase();
    return !s || r.shortcut.toLowerCase().includes(s) || r.text.toLowerCase().includes(s);
  });
  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTexto(val);
    const ate = val.slice(0, e.target.selectionStart ?? val.length);
    const m = /^\/(\S*)$/.exec(ate);
    if (m && quickReplies.length) { setQrQ(m[1]); setQrOpen(true); return; }
    setQrOpen(false);
  }
  function escolheResposta(r: { shortcut: string; text: string }) {
    const el = composeRef.current;
    const caret = el?.selectionStart ?? texto.length;
    if (!/^\/(\S*)$/.test(texto.slice(0, caret))) { setQrOpen(false); return; } // cursor saiu do /atalho → não corrompe
    const novo = r.text + texto.slice(caret);
    setTexto(novo);
    setQrOpen(false);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(r.text.length, r.text.length); } });
  }

  function abreAgendar() {
    const t = new Date(Date.now() + 30 * 60000);
    setAgData(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
    setAgHora(`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
    setAgMsg(texto.trim());
    setAgErro(""); setAgOk("");
    setAgendarOpen((v) => !v);
  }
  async function salvaAgendada() {
    if (!ativo || agSalvando) return;
    const msg = agMsg.trim();
    if (!msg) return setAgErro(t("inbox.agendarErroMensagemVazia"));
    if (!agData || !/^\d{2}:\d{2}$/.test(agHora)) return setAgErro(t("inbox.agendarErroDataHora"));
    if (new Date(`${agData}T${agHora}`) <= new Date()) return setAgErro(t("inbox.agendarErroPassado"));
    setAgSalvando(true); setAgErro("");
    try {
      const atual = await jget("/api/reminders");
      const lista = Array.isArray(atual?.reminders) ? atual.reminders : [];
      lista.push({
        id: "ag-" + Date.now(),
        name: t("inbox.agendarNomeLembrete", { nome: (chats?.find((c) => c.chat_id === ativo)?.name || fmtNumber(ativo)).slice(0, 40) }),
        enabled: true,
        schedule: { type: "once", time: agHora, date: agData },
        target: ativo,
        message: msg,
        account: "api", // o agendador envia pelo número OFICIAL do workspace
      });
      await jsend("/api/reminders", "PUT", { reminders: lista });
      const [, mm, dd] = agData.split("-");
      setAgOk(t("inbox.agendarOk", { dd, mm, hora: agHora }));
      setTimeout(() => setAgendarOpen(false), 1800);
    } catch (e: any) {
      setAgErro(t("inbox.agendarErroSalvar", { erro: e.message }));
    } finally {
      setAgSalvando(false);
    }
  }
  function abreFluxos() {
    setFluxoErr(""); setTplOpen(false);
    setFluxoOpen((v) => !v);
    if (fluxos === null) {
      // Só fluxo PUBLICADO e com passo de template serve: é o template que atravessa a janela.
      jget("/api/automations")
        .then((d) => setFluxos((d.automations ?? [])
          .filter((f: any) => f.enabled !== false && (f.steps ?? []).some((x: any) => x.type === "template"))
          .map((f: any) => ({ id: f.id, name: f.name }))))
        .catch((e) => { setFluxos([]); setFluxoErr(e.message); });
    }
  }
  async function enviaFluxo(id: string) {
    if (!ativo || fluxoEnviando) return;
    setFluxoEnviando(id); setFluxoErr("");
    try {
      await jsend("/api/oficial/inbox-fluxo", "POST", { chatId: ativo, fluxoId: id });
      setFluxoOpen(false);
      carregarChats();
    } catch (e: any) {
      setFluxoErr(e.message);
    } finally {
      setFluxoEnviando("");
    }
  }

  // Carrega TODAS as conversas (sem teto) e a busca vai pro SERVIDOR. Antes o servidor mandava no
  // máximo 100 e a busca peneirava só o que já estava carregado: depois do disparo de 1.139
  // contatos, procurar alguém fora das 100 mais recentes não achava nada (Admin, 30/09).
  const buscaRef = useRef("");
  buscaRef.current = busca;
  const [temMais, setTemMais] = useState(false);
  const [totalChats, setTotalChats] = useState(0);
  const carregandoMais = useRef(false);
  const PAGINA = 120;

  // Busca UM pedaço da lista. `offset > 0` = rolagem (emenda no fim); `offset 0` = primeira carga,
  // busca nova ou o poll de 15s (renova o topo SEM jogar fora o que já foi rolado).
  const buscaPagina = useCallback(async (offset: number) => {
    const termoAtual = buscaRef.current.trim();
    const qs = `?limit=${PAGINA}&offset=${offset}` + (termoAtual ? "&busca=" + encodeURIComponent(termoAtual) : "");
    const d = await jget("/api/oficial/chats" + qs);
    const novos: ChatOficial[] = d.chats ?? [];
    setTotalChats(Number(d.total) || 0);
    setChats((antes) => {
      if (offset === 0) {
        // Poll: troca as do topo pelas versões novas e PRESERVA as antigas já roladas, na ordem.
        const idsNovos = new Set(novos.map((c) => c.chat_id));
        const resto = (antes ?? []).filter((c) => !idsNovos.has(c.chat_id));
        const juntos = [...novos, ...resto];
        setTemMais(!!d.temMais && juntos.length < (Number(d.total) || 0));
        return juntos;
      }
      const vistos = new Set((antes ?? []).map((c) => c.chat_id));
      const juntos = [...(antes ?? []), ...novos.filter((c) => !vistos.has(c.chat_id))];
      setTemMais(!!d.temMais && juntos.length < (Number(d.total) || 0));
      return juntos;
    });
  }, []);

  const carregarChats = useCallback(
    () => buscaPagina(0).then(() => setErro("")).catch((e: any) => setErro(e.message)),
    [buscaPagina],
  );
  useEffect(() => { carregarChats(); const t = setInterval(carregarChats, 15_000); return () => clearInterval(t); }, [carregarChats]);
  // Busca nova começa do zero (senão emendaria resultado de termo diferente no que já estava).
  useEffect(() => {
    const t = setTimeout(() => { setChats(null); void carregarChats(); }, 350);
    return () => clearTimeout(t);
  }, [busca, carregarChats]);

  // Rolou perto do fim → traz o próximo pedaço.
  const aoRolarLista = useCallback((e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (carregandoMais.current || !temMais) return;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 300) return;
    carregandoMais.current = true;
    void buscaPagina((chats ?? []).length)
      .catch(() => {})
      .finally(() => { carregandoMais.current = false; });
  }, [temMais, chats, buscaPagina]);

  // Mensagens da conversa aberta (poll de 6s, igual ao WPP ao Vivo).
  useEffect(() => {
    if (!ativo) { setMsgs([]); return; }
    let vivo = true;
    const ler = () =>
      jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo))
        .then((d) => { if (vivo) setMsgs(d.messages ?? []); })
        .catch(() => {});
    ler();
    const t = setInterval(ler, 6_000);
    return () => { vivo = false; clearInterval(t); };
  }, [ativo]);

  // Só rola sozinho se você já estiver no rodapé (senão atrapalha quem está lendo o histórico).
  useEffect(() => { if (grudado.current) fim.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  const horas = horasDesdeCliente(msgs);
  // 📣 Lead de ANÚNCIO (Click-to-WhatsApp): desde 01/10/2026 a Meta dá 7 DIAS de janela a partir do
  // clique no anúncio — não 24h. O marcador "ctwa" gravado na conversa diz quando foi o clique, e a
  // janela real é a MAIOR entre as duas (uma resposta nova não encurta a janela do anúncio).
  const agoraS = Date.now() / 1000;
  const ctwaTs = [...msgs].reverse().find((m) => m.msg_type === "ctwa" && m.ts)?.ts ?? null;
  const fimPadrao = horas != null ? agoraS + (JANELA_H - horas) * 3600 : null;
  const fimCtwa = ctwaTs ? ctwaTs + 7 * 24 * 3600 : null;
  const temJanela = fimPadrao != null || fimCtwa != null;
  const fimJanela = Math.max(fimPadrao ?? -Infinity, fimCtwa ?? -Infinity);
  const foraDaJanela = temJanela && fimJanela < agoraS;
  const semResposta = !temJanela && msgs.length > 0; // só temos mensagens nossas
  // Quanto falta pra janela fechar (só quando ela está ABERTA). Acima de 48h mostra em dias.
  const restanteMin = temJanela && !foraDaJanela ? Math.max(0, Math.round((fimJanela - agoraS) / 60)) : null;
  const janelaAnuncio = restanteMin != null && fimCtwa != null && (fimPadrao == null || fimCtwa > fimPadrao);
  const restanteTxt = restanteMin == null ? ""
    : restanteMin >= 48 * 60 ? `${Math.floor(restanteMin / 1440)}d ${Math.floor((restanteMin % 1440) / 60)}h`
    : t("inbox.janelaTempoRestante", { h: Math.floor(restanteMin / 60), m: String(restanteMin % 60).padStart(2, "0") });

  function abrirTemplates() {
    setFluxoOpen(false);
    setTplOpen(true); setTplSel(null); setTplErr("");
    if (tpls === null) {
      jget("/api/meta/templates")
        .then((d) => setTpls(((d.templates ?? []) as TplMeta[]).filter((t) => String(t.status).toUpperCase() === "APPROVED")))
        .catch((e) => { setTpls([]); setTplErr(e.message); });
    }
  }
  function escolherTpl(t: TplMeta) {
    setTplSel(t);
    setTplParams(Array.from({ length: contaVars(corpoDoTpl(t)) }, () => ""));
    setTplErr("");
  }
  async function enviarTpl() {
    if (!tplSel || !ativo || tplEnviando) return;
    if (tplParams.some((p) => !p.trim())) { setTplErr(t("inbox.erroPreenchaVariaveis")); return; }
    setTplEnviando(true); setTplErr("");
    try {
      await jsend("/api/meta/templates/send", "POST", { to: ativo, name: tplSel.name, language: tplSel.language || "pt_BR", params: tplParams });
      setTplOpen(false); setTplSel(null);
      grudado.current = true;
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []);
      carregarChats();
    } catch (e: any) { setTplErr(e.message); }
    setTplEnviando(false);
  }

  // ── FIXAR conversa no topo (até 10, igual o WPP ao Vivo). Guardado no servidor (chats-fixados:api). ──
  async function fixarChat(chatid: string, pin: boolean) {
    try {
      await jsend("/api/inbox/chat-pin", "POST", { account: "api", chatid, pin });
      setChats((prev) => (prev ?? []).map((x: any) => (x.chat_id === chatid ? { ...x, pinned: pin } : x))
        .sort((a: any, b: any) => Number(!!b.pinned) - Number(!!a.pinned) || Number(b.last_ts ?? 0) - Number(a.last_ts ?? 0)));
      carregarChats();
    } catch (e: any) { setErro(e.message); }
  }

  // ── Responder CITANDO (duplo clique no balão, igual o WPP ao Vivo e o WhatsApp) ──
  const [respondendo, setRespondendo] = useState<MsgOficial | null>(null);
  useEffect(() => { setRespondendo(null); }, [ativo]); // citação não atravessa conversas
  function temTextoSelecionado(): boolean {
    const s = typeof window !== "undefined" ? window.getSelection() : null;
    return !!s && !s.isCollapsed && s.toString().trim().length > 0;
  }
  function citar(m: MsgOficial) {
    if (!/^wamid\./.test(m.msg_id)) return; // otimista/evento: a Meta não aceita citar
    setRespondendo(m);
    requestAnimationFrame(() => composeRef.current?.focus());
  }
  function resumoCitacao(m: MsgOficial): string {
    const tipo = m.msg_type || "text";
    if (tipo === "image" || tipo === "sticker") return "Foto";
    if (tipo === "video") return "Vídeo";
    if (tipo === "audio") return "Áudio";
    if (tipo === "document") return "Documento";
    if (tipo === "location") return "Localização";
    const tx = (m.body || "").trim();
    return tx.length > 90 ? tx.slice(0, 90) + "…" : tx || "Mensagem";
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || !ativo || enviando) return;
    const citando = respondendo; // snapshot: se falhar, a citação volta junto com o texto
    setRespondendo(null);
    setEnviando(true); setErro("");
    // OTIMISTA: o balão aparece NA HORA do clique (e o campo limpa), sem esperar a ida à Meta —
    // era o "delay" sentido no envio (Graph ~0,5s + refetch). Se falhar, o balão sai e o texto volta.
    const tempId = "tmp-" + Date.now();
    setTexto("");
    grudado.current = true;
    setMsgs((m) => [...m, { msg_id: tempId, from_me: true, body: t, msg_type: "text", ts: Math.floor(Date.now() / 1000),
      ...(citando ? { extra: { respondeA: citando.msg_id } } : {}) }]);
    try {
      await jsend("/api/oficial/send", "POST", { chatid: ativo, text: t, ...(citando ? { replyTo: citando.msg_id } : {}) });
      window.dispatchEvent(new Event("zc-pausa-rever")); // enviar à mão pausa a IA — o botão do topo relê na hora
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []); // o motor agora arquiva ANTES de responder — a lista já vem com a enviada
      carregarChats();
    } catch (e: any) {
      setMsgs((m) => m.filter((x) => x.msg_id !== tempId));
      // Erro só na VOLTA (timeout/502 montando a prévia de um link) com a mensagem já entregue?
      // O motor arquiva antes de responder — se ela está na conversa, o envio deu certo e o texto
      // NÃO volta pro campo (senão vai em dobro; print de 10/09).
      const chegou = await conferirEnvio("/api/oficial/messages?chatid=" + encodeURIComponent(ativo), [t]);
      if (chegou) {
        const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo)).catch(() => null);
        if (d) setMsgs(d.messages ?? []);
        carregarChats();
      } else {
        setErro(e.message);
        setTexto(t); // devolve o texto pro campo — nada se perde
        setRespondendo(citando);
      }
    }
    setEnviando(false);
  }

  // ── Gravar e mandar NOTA DE VOZ (igual o microfone do WhatsApp) ──
  // O navegador grava webm (Chrome) ou mp4 (Safari); o motor converte pra OGG/Opus, que é o formato
  // que a API Oficial mostra como áudio de voz.
  const [gravando, setGravando] = useState(false);
  const [gravSeg, setGravSeg] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelado = useRef(false);
  async function comecaGravar() {
    if (gravando || anexando || !ativo) return;
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunks.current = [];
      recCancelado.current = false;
      rec.ondataavailable = (ev) => { if (ev.data.size) recChunks.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop()); // solta o microfone
        if (!recCancelado.current) void enviaAudio(new Blob(recChunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      recRef.current = rec;
      rec.start();
      setGravSeg(0);
      setGravando(true);
      recTimer.current = setInterval(() => setGravSeg((sg) => {
        if (sg + 1 >= 300) paraGravar(false); // 5 min, igual o limite prático do WhatsApp
        return sg + 1;
      }), 1000);
    } catch {
      setErro(t("inbox.audioSemMicrofone"));
    }
  }
  function paraGravar(cancelar: boolean) {
    if (!recRef.current) return;
    recCancelado.current = cancelar;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    setGravando(false);
    try { recRef.current.stop(); } catch { /* já parado */ }
    recRef.current = null;
  }
  async function enviaAudio(blob: Blob) {
    if (!ativo) return;
    if (blob.size < 1500) { setErro(t("inbox.audioCurto")); return; }
    setAnexando(true); setErro("");
    try {
      const qs = new URLSearchParams({ chatid: ativo, mime: blob.type || "audio/webm", voz: "1" });
      const up = await fetch("/api/oficial/send-media?" + qs.toString(), {
        method: "POST", headers: { "content-type": "application/octet-stream" }, body: blob,
      });
      const du = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(du?.error || t("inbox.erroFalhaEnvioMidia", { status: up.status }));
      grudado.current = true;
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []);
      carregarChats();
    } catch (e: any) { setErro(e.message); }
    setAnexando(false);
  }
  useEffect(() => () => { if (recRef.current) paraGravar(true); }, [ativo]); // trocou de conversa: descarta

  // Escolher o arquivo abre a PRÉVIA (legenda + Enviar/Cancelar) — antes já disparava o envio.
  const [anexoPend, setAnexoPend] = useState<File | null>(null);
  function anexar(file: File) {
    if (!ativo || anexando) return;
    if (file.size > 25 * 1024 * 1024) { setErro(t("inbox.erroArquivoGrande")); return; }
    setErro("");
    setAnexoPend(file);
    if (arquivoRef.current) arquivoRef.current.value = "";
  }
  // Anexo (imagem/vídeo/áudio/documento) dentro da janela de 24h, com a legenda da prévia.
  async function enviaAnexo(file: File, legenda: string) {
    if (!ativo || anexando) return;
    setAnexando(true); setErro("");
    try {
      // Bytes crus: vídeo pelo JSON estourava o teto de 10MB do painel e morria sem explicação.
      const qs = new URLSearchParams({ chatid: ativo, mime: file.type || "application/octet-stream" });
      const leg = legenda.trim(); if (leg) qs.set("caption", leg);
      const up = await fetch("/api/oficial/send-media?" + qs.toString(), {
        method: "POST", headers: { "content-type": "application/octet-stream" }, body: file,
      });
      const du = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(du?.error || t("inbox.erroFalhaEnvioMidia", { status: up.status }));
      if (leg && texto.trim() === leg) setTexto(""); // a legenda veio do campo: limpa
      setAnexoPend(null);
      grudado.current = true;
      const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
      setMsgs(d.messages ?? []);
      carregarChats();
    } catch (e: any) { setErro(e.message); }
    setAnexando(false);
    if (arquivoRef.current) arquivoRef.current.value = ""; // permite reanexar o MESMO arquivo
  }

  // A busca é resolvida no BANCO (ver buscaPagina). Peneirar de novo aqui seria pior que inútil:
  // o servidor também casa pelo sender_name, então o filtro local ESCONDERIA resultados legítimos
  // que ele acabou de devolver.
  const lista = chats ?? [];

  // Sem NENHUMA conexão oficial configurada: é o único caso em que a tela explica em vez de
  // mostrar — e leva pro passo que resolve. Decidido pela configuração, nunca pelas bolinhas.
  if (apiConectada === false) {
    return (
      <div className="card"><div className="card-pad">
        <b>{t("inbox.semNumeroTitulo")}</b>
        <p className="muted" style={{ margin: "6px 0 14px" }}>
          {t("inbox.semNumeroTexto")}
        </p>
        <a className="btn primary" href="/oficial">{t("inbox.conectarNumero")}</a>
      </div></div>
    );
  }
  // Falhou a carga (sessão caiu, motor fora): mostra o ERRO com botão de tentar — antes ficava
  // "Carregando conversas…" pra sempre, porque o erro só era pintado dentro da tela principal.
  if (chats === null) {
    return erro ? (
      <div className="card"><div className="card-pad">
        <b>{t("inbox.falhaCarregarTitulo")}</b>
        <p className="muted" style={{ margin: "6px 0 14px" }}>{erro}</p>
        <button className="btn primary" onClick={() => { setErro(""); carregarChats(); }}>{t("inbox.tentarDeNovo")}</button>
      </div></div>
    ) : (
      <div className="card"><div className="card-pad muted">{t("inbox.carregandoConversas")}</div></div>
    );
  }

  return (
    // "tem-ativo" comanda o modo celular: sem conversa aberta mostra SÓ a lista; abriu, SÓ a
    // conversa (com o ‹ voltar) — igual o WhatsApp. No desktop as duas colunas convivem.
    <div className={"card ofi-wrap" + (ativo ? " tem-ativo" : "")}>
      <aside className="ofi-lista" onScroll={aoRolarLista}>
        <div className="ofi-busca">
          <input className="inp" placeholder={t("inbox.buscarConversaPlaceholder")} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {lista.length === 0 ? (
          <div className="muted" style={{ padding: 14, fontSize: 13, lineHeight: 1.5 }}>
            {chats.length === 0
              ? t("inbox.listaVazia")
              : t("inbox.buscaSemResultado")}
          </div>
        ) : null}
        {lista.map((c) => (
          <button key={c.chat_id} className={"ofi-chat" + (ativo === c.chat_id ? " on" : "")} onClick={() => { grudado.current = true; setAtivo(c.chat_id); }}>
            <div className="ofi-ava">
              {c.avatar_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={c.avatar_url} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                : (c.name || c.chat_id).slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ofi-nome">{c.name || fmtNumber(c.chat_id)}</div>
              <div className="ofi-previa">{c.from_me ? t("inbox.previaVoce") : ""}{c.last_body}</div>
            </div>
            <span role="button" tabIndex={-1} className={"ofi-pin" + ((c as any).pinned ? " on" : "")}
              title={(c as any).pinned ? "Desafixar conversa" : "Fixar conversa no topo (até 10)"}
              onClick={(e) => { e.stopPropagation(); void fixarChat(c.chat_id, !(c as any).pinned); }}>
              <Icon name="pin" size={13} />
            </span>
            <div className="ofi-quando">{quando(c.last_ts)}</div>
          </button>
        ))}
        {/* Rodapé da rolagem: diz QUANTAS ainda faltam. Sem isso, com mil conversas, não dá pra
            saber se a lista acabou ou se ainda tem coisa vindo. */}
        {lista.length > 0 && (
          <div className="muted" style={{ padding: "10px 14px", fontSize: 12, textAlign: "center" }}>
            {temMais
              ? `${lista.length} de ${totalChats} conversas — role para carregar mais`
              : `${lista.length} conversa${lista.length === 1 ? "" : "s"}`}
          </div>
        )}
      </aside>

      <section className="ofi-conversa">
        {!ativo ? (
          <div className="ofi-vazio">
            <Icon name="text" size={28} />
            <div style={{ marginTop: 8 }}>{t("inbox.escolhaConversa")}</div>
          </div>
        ) : (
          <>
            <div className="ofi-topo">
              <button className="ofi-volta-lista" onClick={() => setAtivo(null)} aria-label={t("inbox.voltarParaLista")}>‹</button>
              {/* Clicar na foto amplia (igual WhatsApp). Sem foto, fica só as iniciais, sem clique. */}
              {(() => {
                const foto = chats.find((c) => c.chat_id === ativo)?.avatar_url;
                if (!foto) return <div className="ofi-ava">{(chats.find((c) => c.chat_id === ativo)?.name || ativo).slice(0, 2).toUpperCase()}</div>;
                return (
                  <button type="button" className="ofi-ava clicavel" onClick={() => setFotoGrande(foto)}
                          title={t("inbox.verFoto")} aria-label={t("inbox.verFoto")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </button>
                );
              })()}
              <button type="button" className="ofi-topo-info clicavel" onClick={() => setFichaOpen(true)} title="Ficha do contato">
                <b>{chats.find((c) => c.chat_id === ativo)?.name || fmtNumber(ativo)}</b>
                <div className="muted ofi-topo-sub">{t("inbox.subtituloCanal", { numero: fmtNumber(ativo) })}</div>
              </button>
              {/* Timer da janela de 24h: verde com folga, âmbar nas últimas 4h, vermelho fechada. */}
              {restanteMin != null && (
                <span className={"ofi-janela" + (restanteMin <= 240 ? " urgente" : "")} title={t("inbox.janelaTooltip")}>
                  {t("inbox.janelaFechaEm", { tempo: restanteTxt })}{janelaAnuncio ? " · anúncio 7d" : ""}
                </span>
              )}
              {(foraDaJanela || semResposta) && <span className="ofi-janela fechada">{t("inbox.janelaFechada")}</span>}
              {ativo && (
                <ContratoProcuracao
                  phone={ativo}
                  nome={chats.find((c) => c.chat_id === ativo)?.name ?? undefined}
                  falas={() => msgs.filter((m) => !m.from_me && (m.body || "").trim()).map((m) => m.body)}
                  onEnviar={async (texto) => {
                    await jsend("/api/oficial/send", "POST", { chatid: ativo, text: texto });
                    window.dispatchEvent(new Event("zc-pausa-rever"));
                    const d = await jget("/api/oficial/messages?chatid=" + encodeURIComponent(ativo));
                    setMsgs(d.messages ?? []);
                  }}
                />
              )}
              {ativo && <OrigemLead phone={ativo} />}
              {ativo && <EtiquetasChat phone={ativo} style={{ flex: "none" }} />}
              {ativo && <PausaIa chatId={ativo} account="api" style={{ flex: "none" }} />}
              <button className={"btn ic ofi-topo-btn" + (buscaMsgOn ? " on" : "")} title={t("inbox.buscarNaConversaTitle")}
                onClick={() => { setBuscaMsgOn((v) => !v); setBuscaMsg(""); }}>
                <Icon name="search" size={15} />
              </button>
              <button className={"btn ic ofi-topo-btn agendar-btn" + (agendarOpen ? " on" : "")} title={t("inbox.agendarTitle")}
                onClick={abreAgendar}>
                <Icon name="wait" size={15} />
              </button>
            </div>

            {/* Busca NA conversa: filtra os balões conforme digita. Esc ou × volta ao normal. */}
            {buscaMsgOn && (
              <div className="ofi-busca-msg">
                <input className="inp" autoFocus placeholder={t("inbox.buscarNaConversaPlaceholder")} value={buscaMsg}
                  onChange={(e) => setBuscaMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setBuscaMsgOn(false); setBuscaMsg(""); } }} />
                <span className="muted" style={{ fontSize: 12, flex: "none" }}>
                  {buscaMsg.trim() ? t("inbox.buscaContador", { n: msgs.filter((m) => m.body.toLowerCase().includes(buscaMsg.trim().toLowerCase())).length, total: msgs.length }) : t("inbox.totalMensagens", { n: msgs.length })}
                </span>
                <button className="btn ic" style={{ flex: "none" }} aria-label={t("inbox.fecharBusca")} onClick={() => { setBuscaMsgOn(false); setBuscaMsg(""); }}>×</button>
              </div>
            )}

            {/* Agendar mensagem — cria um Lembrete "once" com account "api" (envia pelo número oficial). */}
            {agendarOpen && (
              <div className="ofi-agendar agendar-pop">
                <b style={{ fontSize: 13 }}>{t("inbox.agendarTitulo")}</b>
                <textarea className="inp" style={{ minHeight: 64 }} placeholder={t("inbox.agendarMsgPlaceholder")} value={agMsg} onChange={(e) => setAgMsg(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="inp" type="date" value={agData} onChange={(e) => setAgData(e.target.value)} />
                  <input className="inp" type="time" value={agHora} onChange={(e) => setAgHora(e.target.value)} />
                </div>
                <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  {t("inbox.agendarAviso")}
                </div>
                {agErro && <div className="ofi-erro" style={{ margin: 0 }}>{agErro}</div>}
                {agOk && <div style={{ color: "var(--accent-deep)", fontSize: 12.5, fontWeight: 600 }}>{agOk}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setAgendarOpen(false)} disabled={agSalvando}>{t("comum.cancelar")}</button>
                  <button className="btn primary" onClick={salvaAgendada} disabled={agSalvando}>{agSalvando ? t("comum.salvando") : t("inbox.agendarBotao")}</button>
                </div>
              </div>
            )}

            <div className="ofi-msgs" onScroll={(e) => {
              const el = e.currentTarget;
              grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              // PÍLULA FLUTUANTE DE DIA (igual ao inbox LITE e ao WhatsApp): enquanto rola, o dia das
              // mensagens em vista fica preso no topo e some com fade quando a rolagem para. O dia
              // "corrente" = o do ÚLTIMO separador que já passou do topo da janela (08/09).
              const topo = el.getBoundingClientRect().top;
              let label = "";
              el.querySelectorAll<HTMLElement>(".msg-day[data-dia]").forEach((sep) => {
                if (sep.getBoundingClientRect().top - topo <= 34) label = sep.dataset.dia || label;
              });
              if (!label) { setFlutuanteOn(false); return; } // sem separador acima → sem bolinha vazia
              setDiaFlutuante(label);
              setFlutuanteOn(true);
              if (flutuanteTimer.current) clearTimeout(flutuanteTimer.current);
              flutuanteTimer.current = setTimeout(() => setFlutuanteOn(false), 900);
            }}>
              {diaFlutuante && (
                <div className={"msg-day-float" + (flutuanteOn ? " on" : "")} aria-hidden>
                  <span>{diaFlutuante}</span>
                </div>
              )}
              {(buscaMsg.trim() ? msgs.filter((m) => m.body.toLowerCase().includes(buscaMsg.trim().toLowerCase())) : msgs).filter((m) => m.msg_type !== "reaction").map((m, i, lista) => {
                // SEPARADOR DE DIA ("Hoje", "Ontem", "12/09"): entra quando o dia muda em relação
                // à mensagem anterior. É também o que a pílula flutuante lê (data-dia).
                const dia = chaveDoDia(m.ts);
                const mostraDia = !!dia && dia !== chaveDoDia(lista[i - 1]?.ts);
                const sepDia = mostraDia ? <div key={"dia-" + m.msg_id} className="msg-day" data-dia={rotuloDoDia(m.ts)}><span>{rotuloDoDia(m.ts)}</span></div> : null;
                // EVENTO DE SISTEMA inline (igual WhatsApp): ligação (recebida/perdida/atendida) e
                // origem de anúncio (CTWA) viram um chip centralizado, não um balão de conversa.
                if (m.msg_type === "call" || m.msg_type === "ctwa") {
                  const anu = m.extra?.anuncio;
                  return (
                    <Fragment key={m.msg_id}>
                      {sepDia}
                      {anu?.thumb ? (
                        /* 🖼️ cartão do anúncio: a MINIATURA do criativo que trouxe o lead (pedido 13/10) */
                        <div className="ofi-evento ofi-evento-anuncio" title={m.ts ? new Date(m.ts * 1000).toLocaleString("pt-BR") : undefined}>
                          {anu.url ? (
                            <a href={anu.url} target="_blank" rel="noreferrer"><img src={anu.thumb} alt={anu.headline || "anúncio"} /></a>
                          ) : (
                            <img src={anu.thumb} alt={anu.headline || "anúncio"} />
                          )}
                          <div>{m.body}</div>
                        </div>
                      ) : (
                        <div className="ofi-evento" title={m.ts ? new Date(m.ts * 1000).toLocaleString("pt-BR") : undefined}>{m.body}</div>
                      )}
                    </Fragment>
                  );
                }
                const midia = separaMidia(m);
                const tpl = m.extra?.tpl;
                const ehCliqueBotao = !m.from_me && (m.msg_type === "button" || m.msg_type === "interactive");
                return (
                  <Fragment key={m.msg_id}>
                  {sepDia}
                  <div className={"ofi-balao" + (m.from_me ? " meu" : "") + (ehCliqueBotao ? " clique-botao" : "") + (m.from_me && m.extra?.ack === "failed" ? " falhou" : "")}
                       data-mid={m.msg_id}
                       title={/^wamid\./.test(m.msg_id) ? t("inbox.duploCliqueResponder") : undefined}
                       // Clique na FAIXA vazia ao lado do balão (o ::before) = responder, igual ao WPP ao
                       // Vivo; o pseudo-elemento chega aqui como currentTarget — texto, link e mídia não.
                       onClick={(e) => { if (e.target === e.currentTarget && !temTextoSelecionado()) citar(m); }}
                       onDoubleClick={() => { if (!temTextoSelecionado()) citar(m); }}
                       onTouchStart={(e) => swipeIni(e, m)} onTouchMove={swipeMove} onTouchEnd={swipeFim}>
                    {/^wamid\./.test(m.msg_id) && !foraDaJanela && (
                      <button type="button" className="ofi-reagir-btn" title="Reagir" aria-label="Reagir"
                        onClick={(e) => { e.stopPropagation(); setReagindo((r) => (r === m.msg_id ? null : m.msg_id)); }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1.8 2 5.2 2 7 0" /></svg>
                      </button>
                    )}
                    {reagindo === m.msg_id && (
                      <div className="ofi-reagir-barra" onClick={(e) => e.stopPropagation()}>
                        {["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"].map((emo) => (
                          <button key={emo} type="button" onClick={() => reagir(m, emo)}>{emo}</button>
                        ))}
                        {reacoes.get(m.msg_id)?.meu && (
                          <button type="button" className="tirar" title="Tirar minha reação" onClick={() => reagir(m, "")}>✕</button>
                        )}
                      </div>
                    )}
                    {/* Citação: a que mensagem esta responde (do cliente ou nossa). Clique leva até ela. */}
                    {m.extra?.respondeA && !ehCliqueBotao && (() => {
                      const alvo = msgs.find((x) => x.msg_id === m.extra!.respondeA);
                      return (
                        <div className={"msg-citacao" + (alvo ? " clicavel" : "")}
                             onClick={alvo ? (e) => { e.stopPropagation(); document.querySelector(`[data-mid="${CSS.escape(alvo.msg_id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); } : undefined}>
                          <b>{alvo ? (alvo.from_me ? t("inbox.voce") : (alvo.sender_name || t("inbox.cliente"))) : t("inbox.mensagemCitada")}</b>
                          <span>{alvo ? resumoCitacao(alvo) : t("inbox.mensagemCitadaAntiga")}</span>
                        </div>
                      );
                    })()}
                    {/* A pessoa CLICOU num botão do template (não digitou) — o selo diferencia. */}
                    {ehCliqueBotao && <span className="ofi-selo-botao">{t("inbox.seloRespondeuBotao")}</span>}
                    {m.msg_type === "location" && m.extra?.local ? (
                      // 📍 localização recebida/enviada pela Cloud API — mesmo cartão do LITE
                      <LocalCard local={m.extra.local} abrirLabel={t("inbox.abrirNoMapa")} />
                    ) : m.msg_type === "contacts" && m.extra?.contatos?.length ? (
                      // 👤 contato compartilhado — "Conversar" abre a conversa daquele número aqui
                      // mesmo (a conversa existente, ou uma nova em branco).
                      <ContatoCard
                        contatos={m.extra.contatos}
                        rotuloConversar={t("inbox.contatoConversar")}
                        rotuloCopiar={t("inbox.contatoCopiar")}
                        onConversar={(tel) => { const d = tel.replace(/\D/g, ""); if (d) { grudado.current = true; setAtivo(d); } }}
                        onCopiar={(tel) => { navigator.clipboard?.writeText(tel).catch(() => {}); }}
                      />
                    ) : midia ? (
                      <>
                        {(m.msg_type === "image" || m.msg_type === "sticker") && (
                          <a href={midia.url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ofi-midia" src={midia.url} alt="" />
                          </a>
                        )}
                        {m.msg_type === "video" && <video className="ofi-midia" src={midia.url} controls preload="metadata" />}
                        {/* Mesmo player do WPP ao Vivo (a Meta não manda a onda nem a duração: a onda é
                            estável por URL e a duração aparece assim que o navegador lê o cabeçalho). */}
                        {m.msg_type === "audio" && <AudioBalao url={midia.url} meu={m.from_me} />}
                        {m.msg_type === "document" && (
                          <a href={midia.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{t("inbox.abrirDocumento")}</a>
                        )}
                        {midia.legenda && <div style={{ marginTop: 4 }}>{comLinks(midia.legenda)}</div>}
                      </>
                    ) : (
                      <div>{comLinks(m.body)}</div>
                    )}
                    {/* 🏷️ DE QUAL MODELO veio esta mensagem. O dono via o balão e não sabia qual
                        template tinha disparado — agora o nome aparece aqui, o mouse por cima mostra
                        o idioma, e o clique abre o modelo em Meus templates (auditoria 07/09). */}
                    {tpl?.nome && (
                      <a className="ofi-tpl-selo"
                         href={`/oficial/templates?tpl=${encodeURIComponent(tpl.nome)}`}
                         title={`Modelo "${tpl.nome}"${tpl.idioma ? ` (${tpl.idioma})` : ""} — clique para abrir em Meus templates`}>
                        {tpl.nome}
                      </a>
                    )}
                    {/* Template como o cliente RECEBEU: rodapé e botões desenhados (extra.tpl,
                        gravado no envio). Visual apenas — botão de template não é clicável daqui. */}
                    {tpl?.rodape ? <div className="ofi-tpl-rodape">{tpl.rodape}</div> : null}
                    {tpl?.botoes && tpl.botoes.length > 0 && (
                      <div className="ofi-tpl-botoes">
                        {tpl.botoes.map((b, i) => <div key={i} className="ofi-tpl-botao">{b.texto}</div>)}
                      </div>
                    )}
                    {/* A Meta ACEITA o envio e só avisa DEPOIS que segurou (webhook de status). Sem
                        isto o painel dizia "enviado" e a pessoa nunca recebia — caso de uma cliente, 23/08. */}
                    {m.from_me && m.extra?.ack === "failed" && (
                      <div className="ofi-falha">{t("inbox.naoEntregue")}{m.extra?.erro ? ` — ${m.extra.erro}` : ""}</div>
                    )}
                    <span className="ofi-hora">{m.from_me && <OrigemMsg origem={m.extra?.origem} autor={m.extra?.autor} />}{hhmm(m.ts)}{m.from_me && m.extra?.ack !== "failed" && <TickOficial ack={m.extra?.ack} />}</span>
                    {(() => {
                      const r = reacoes.get(m.msg_id);
                      const emos = [r?.dele, r?.meu].filter(Boolean) as string[];
                      return emos.length ? <span className="ofi-reacoes">{emos.join(" ")}</span> : null;
                    })()}
                  </div>
                  </Fragment>
                );
              })}
              <div ref={fim} />
            </div>

            {/* A janela de 24h é a regra que mais confunde na API Oficial — avisa ANTES de digitar. */}
            {foraDaJanela && !tplOpen && (
              <div className="ofi-aviso">
                {t("inbox.avisoForaDaJanela", { horas: Math.floor(horas!) })}
                <button className="btn primary" style={{ marginLeft: 10, padding: "4px 12px", fontSize: 12.5 }} onClick={abrirTemplates}>{t("inbox.enviarModeloAprovado")}</button>
              </div>
            )}
            {semResposta && !tplOpen && (
              <div className="ofi-aviso">
                {t("inbox.avisoSemResposta")}
                <button className="btn primary" style={{ marginLeft: 10, padding: "4px 12px", fontSize: 12.5 }} onClick={abrirTemplates}>{t("inbox.enviarModeloAprovado")}</button>
              </div>
            )}

            {/* Painel de templates: escolher modelo aprovado → preencher variáveis → disparar. */}
            {tplOpen && (
              <div className="ofi-tpl">
                <div className="ofi-tpl-topo">
                  <b>{tplSel ? tplSel.name : t("inbox.escolhaModeloAprovado")}</b>
                  <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => (tplSel ? setTplSel(null) : setTplOpen(false))}>
                    {tplSel ? t("inbox.voltarSeta") : t("inbox.fecharPainel")}
                  </button>
                </div>
                {!tplSel ? (
                  tpls === null ? (
                    <div className="muted" style={{ padding: 10, fontSize: 13 }}>{t("inbox.carregandoModelos")}</div>
                  ) : tpls.length === 0 ? (
                    <div className="muted" style={{ padding: 10, fontSize: 13 }}>{t("inbox.semModeloAprovado")}</div>
                  ) : (
                    <div className="ofi-tpl-lista">
                      {tpls.map((tp) => (
                        <button key={tp.name + (tp.language ?? "")} className="ofi-tpl-item" onClick={() => escolherTpl(tp)}>
                          <b>{tp.name}</b>
                          <span className="muted" style={{ fontSize: 11 }}>{tp.category}{headerDoTpl(tp) && !["", "TEXT"].includes(headerDoTpl(tp)) ? " " + t("inbox.modeloCabecalhoNoTopo", { formato: headerDoTpl(tp) }) : ""}</span>
                          <span className="ofi-tpl-corpo">{corpoDoTpl(tp)}</span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div style={{ padding: "8px 10px", display: "grid", gap: 8 }}>
                    <div className="ofi-tpl-corpo" style={{ whiteSpace: "pre-wrap" }}>{corpoDoTpl(tplSel)}</div>
                    {tplParams.map((p, i) => (
                      <input key={i} className="inp" placeholder={t("inbox.valorDaVariavelPlaceholder", { n: i + 1 })} value={p}
                        onChange={(e) => setTplParams(tplParams.map((x, j) => (j === i ? e.target.value : x)))} />
                    ))}
                    <button className="btn primary" onClick={enviarTpl} disabled={tplEnviando}>
                      {tplEnviando ? t("inbox.enviandoCurto") : t("inbox.enviarTemplate")}
                    </button>
                  </div>
                )}
                {tplErr && <div className="ofi-erro">{tplErr}</div>}
              </div>
            )}

            {/* Menu de respostas rápidas (digite "/" no começo) */}
            {qrOpen && qrFiltradas.length > 0 && (
              <div className="ofi-qr">
                {qrFiltradas.slice(0, 6).map((r) => (
                  <button key={r.shortcut} className="ofi-qr-item" onClick={() => escolheResposta(r)}>
                    <b>/{r.shortcut}</b>
                    <span>{r.text}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Painel de FLUXOS: roda um fluxo inteiro pra esta conversa (template + ramos dos botões). */}
            {fluxoOpen && (
              <div className="ofi-tpl">
                <div className="ofi-tpl-topo">
                  <b>{t("inbox.fluxoTitulo")}</b>
                  <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setFluxoOpen(false)}>{t("inbox.fecharPainel")}</button>
                </div>
                <div className="muted" style={{ padding: "0 10px 8px", fontSize: 12, lineHeight: 1.45 }}>
                  {t("inbox.fluxoExplicacao")}
                </div>
                {fluxos === null ? (
                  <div className="muted" style={{ padding: 10, fontSize: 13 }}>{t("inbox.carregandoFluxos")}</div>
                ) : fluxos.length === 0 ? (
                  <div className="muted" style={{ padding: 10, fontSize: 13 }}>
                    {t("inbox.semFluxoComTemplate")}
                  </div>
                ) : (
                  <div className="ofi-tpl-lista">
                    {fluxos.map((f) => (
                      <button key={f.id} className="ofi-tpl-item" disabled={!!fluxoEnviando} onClick={() => enviaFluxo(f.id)}>
                        <b>{f.name || f.id}</b>
                        <span className="muted" style={{ fontSize: 11 }}>{fluxoEnviando === f.id ? t("inbox.enviandoCurto") : t("inbox.fluxoEnviarAgora")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {fluxoErr && <div className="ofi-erro">{fluxoErr}</div>}
              </div>
            )}

            {anexoPend && (
              <AnexoPrevia arquivo={anexoPend} legendaInicial={texto.trim()} enviando={anexando}
                onEnviar={(leg) => void enviaAnexo(anexoPend, leg)} onCancelar={() => setAnexoPend(null)} />
            )}
            {respondendo && (
              <div className="reply-bar" style={{ margin: "0 12px 6px" }}>
                <div className="reply-corpo">
                  <b>{respondendo.from_me ? t("inbox.voce") : (respondendo.sender_name || t("inbox.cliente"))}</b>
                  <span>{resumoCitacao(respondendo)}</span>
                </div>
                <button className="reply-x" onClick={() => setRespondendo(null)} aria-label={t("inbox.audioCancelar")}>✕</button>
              </div>
            )}
            <div className="ofi-compor">
              <button className="btn ofi-btn-acao" title={t("inbox.botaoModeloTitle")} onClick={abrirTemplates}>
                <Icon name="copy" size={15} /><span className="ofi-btn-rot">{t("inbox.botaoModelo")}</span>
              </button>
              <button className="btn ofi-btn-acao" title={t("inbox.botaoFluxoTitle")} onClick={abreFluxos}>
                <Icon name="spark" size={15} /><span className="ofi-btn-rot">{t("inbox.botaoFluxo")}</span>
              </button>
              <input ref={arquivoRef} type="file" style={{ display: "none" }}
                accept="image/jpeg,image/png,video/mp4,audio/mpeg,audio/ogg,audio/aac,audio/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); }} />
              <button className="btn ofi-btn-acao" disabled={foraDaJanela || semResposta || anexando}
                title={foraDaJanela || semResposta ? t("inbox.anexarBloqueadoTitle") : t("inbox.anexarTitle")}
                onClick={() => arquivoRef.current?.click()}>
                <Icon name="plus" size={15} /><span className="ofi-btn-rot">{anexando ? t("inbox.enviandoCurto") : t("inbox.botaoAnexar")}</span>
              </button>
              {gravando ? (
                <>
                  <button className="btn ofi-btn-acao" title={t("inbox.audioCancelar")} onClick={() => paraGravar(true)}>
                    <Icon name="close" size={15} /><span className="ofi-btn-rot">{t("inbox.audioCancelar")}</span>
                  </button>
                  <button className="btn primary ofi-btn-acao" title={t("inbox.audioEnviarTitle")} onClick={() => paraGravar(false)}>
                    <Icon name="send" size={15} /><span className="ofi-btn-rot">{`${Math.floor(gravSeg / 60)}:${String(gravSeg % 60).padStart(2, "0")}`}</span>
                  </button>
                </>
              ) : (
                <button className="btn ofi-btn-acao" disabled={foraDaJanela || semResposta || anexando}
                  title={foraDaJanela || semResposta ? t("inbox.anexarBloqueadoTitle") : t("inbox.audioGravarTitle")}
                  onClick={comecaGravar}>
                  <Icon name="ptt" size={15} /><span className="ofi-btn-rot">{t("inbox.botaoAudio")}</span>
                </button>
              )}
              <CampoMensagem ref={composeRef} className="inp" placeholder={foraDaJanela ? t("inbox.composerForaDaJanela") : t("inbox.composerPlaceholder")}
                value={texto} disabled={foraDaJanela || semResposta}
                onChange={aoDigitar}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setQrOpen(false); setRespondendo(null); return; }
                  if (e.key === "Enter" && !e.shiftKey && !qrOpen && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); }
                  if (e.key === "Enter" && qrOpen && qrFiltradas.length) { e.preventDefault(); escolheResposta(qrFiltradas[0]); }
                }} />
              <div className="attach-wrap ofi-emoji-wrap">
                <button type="button" className="btn ofi-btn-acao ofi-emoji-btn" disabled={foraDaJanela || semResposta}
                  onClick={() => setEmojiOpen((o) => !o)} title="Emoji" aria-label="Emoji" aria-expanded={emojiOpen}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1.8 2 5.2 2 7 0" /></svg>
                </button>
                {emojiOpen && (
                  <div className="emoji-panel ofi-emoji-panel">
                    <div className="emoji-abas">
                      <button className={emojiAba === "emoji" ? "on" : ""} onClick={() => setEmojiAba("emoji")}>Emojis</button>
                      <button className={emojiAba === "qr" ? "on" : ""} onClick={() => setEmojiAba("qr")}>Respostas</button>
                      <button className={emojiAba === "fig" ? "on" : ""} onClick={() => setEmojiAba("fig")}>Figurinha</button>
                    </div>
                    {emojiAba === "emoji" && (
                      <div className="emoji-grade">
                        {EMOJIS.map((emo, i) => (
                          <button key={i} type="button" onClick={() => insereEmoji(emo)}>{emo}</button>
                        ))}
                      </div>
                    )}
                    {emojiAba === "qr" && (
                      <div className="ofi-qr ofi-qr-painel">
                        {quickReplies.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 8 }}>Nenhuma resposta rápida ainda — crie em Configurações.</div>}
                        {quickReplies.map((r) => (
                          <button key={r.shortcut} type="button" className="ofi-qr-item"
                            onClick={() => { setTexto(r.text); setEmojiOpen(false); requestAnimationFrame(() => composeRef.current?.focus()); }}>
                            <b>/{r.shortcut}</b>
                            <span>{r.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {emojiAba === "fig" && (
                      <div className="emoji-fig-breve">
                        <span>🏷️</span>
                        Mande qualquer imagem como figurinha
                        <em>A gente converte pro formato do WhatsApp (quadrado 512×512, fundo transparente).</em>
                        <button type="button" className="btn primary" disabled={anexando} onClick={() => figRef.current?.click()}>
                          {anexando ? "Enviando…" : "Escolher imagem"}
                        </button>
                        <input ref={figRef} type="file" accept="image/*" hidden
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviaFigurinha(f); }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button className="btn primary" onClick={enviar} disabled={enviando || !texto.trim() || foraDaJanela || semResposta}>
                {enviando ? t("inbox.enviandoCurto") : t("inbox.enviar")}
              </button>
            </div>
            {erro && <div className="ofi-erro">{erro}</div>}
          </>
        )}
      </section>
      {fichaOpen && ativo && (
        <FichaContatoModal
          phone={ativo.replace(/\D/g, "")}
          nome={chats?.find((c) => c.chat_id === ativo)?.name || fmtNumber(ativo)}
          onClose={() => setFichaOpen(false)}
          onNome={(nome) => { if (nome) setChats((antes) => antes?.map((c) => (c.chat_id === ativo ? { ...c, name: nome } : c)) ?? antes); }}
        />
      )}
      {fotoGrande && (
        <FotoZoom url={fotoGrande} nome={chats.find((c) => c.chat_id === ativo)?.name || (ativo ? fmtNumber(ativo) : undefined)} onClose={() => setFotoGrande(null)} />
      )}
    </div>
  );
}
