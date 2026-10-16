"use client";

import "@xyflow/react/dist/style.css";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StepBubble } from "@/components/FlowTemplates";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  NodeResizeControl,
  EdgeLabelRenderer,
  getBezierPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type Connection,
} from "@xyflow/react";
import { subirArquivo, subirDataUri, COMPAT_OFICIAL, fluxoEhOficial, jget, jsend, Automation, Step, StepBody, FlowEdge, TRIGGERS, TRIGGER_PALETTE, paletaDoGatilho, EVENTOS_CHECKOUT, eventoDisponivel, PLATAFORMAS_CHECKOUT, ehGatilhoDeGrupo, ehGatilhoDeCheckout, STEP_META, STEP_GROUPS, stepSummary, GroupListItem, FlowStats, STATS_PERIODS, periodRange, mascaraFone, soDigitosFone, FONE_INICIAL, origemDoFluxo } from "@/lib/client";
import { useAuth } from "@/components/Auth";
import { Icon, stepIcon, triggerIcon, corDoPasso, corDoGatilho } from "@/components/icons";
import { BackTo, SaveBar, useAvisoNaoSalvo } from "@/components/ui";
import { GroupSelect } from "@/components/GroupSelect";
import { FoneVideo } from "@/components/MetaTemplates";
import GuiaTokenMetaAds from "@/components/GuiaTokenMetaAds";
import { useGroupList } from "@/components/groups/useGroupList";
import { useAccounts, fmtNumber, numeroDoFluxo, TELA_TEMPLATES, registraGuardaDeTroca } from "@/components/accounts";

const EVENT_KEYS = Object.keys(TRIGGERS);

// id estável por passo (sobrevive a inserir/remover/reordenar no meio).
function sid(): string {
  try { return "s_" + crypto.randomUUID(); } catch { return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
}
function stepBody(type: string): StepBody {
  switch (type) {
    case "text": return { type: "text", text: "Oi {{primeiro_nome}}! " };
    case "presence": return { type: "presence", presence: "composing", ms: 2000 };
    case "call": return { type: "call", callDuration: 5 };
    case "wait": return { type: "wait", ms: 2000 };
    case "ptt": return { type: "ptt", file: "" };
    case "ptv": return { type: "ptv", file: "" };
    case "media": return { type: "media", mediaType: "image", file: "", caption: "" };
    // "Documento" da paleta é atalho: nasce como passo de mídia com o tipo certo já escolhido
    // (PDF, contrato, boleto…). Funciona nos DOIS: LITE e API Oficial (a Cloud API aceita document).
    case "documento": return { type: "media", mediaType: "document", file: "", caption: "" };
    case "buttons": return { type: "buttons", text: "Escolha uma opção 👇", buttons: ["Sim", "Não"] };
    case "carousel": return {
      type: "carousel",
      text: "Dá uma olhada nessas opções 👇",
      cards: [{ image: "", text: "Primeiro card", buttons: ["Quero esse"] }],
    };
    case "ask": return { type: "ask", text: "Qual seu nome?", variable: "primeiro_nome", hint: "" };
    case "ai_agent": return {
      type: "ai_agent",
      systemPrompt:
        "Você é a Anna, atendente do [seu negócio]. Fale de forma leve, humana e direta, como um atendente real no WhatsApp.\n" +
        "IMPORTANTE: converse e entenda a necessidade ANTES de mandar qualquer link. Faça pelo menos uma pergunta de qualificação. " +
        "Só escolha um caminho quando tiver CERTEZA do que a pessoa quer — se estiver em dúvida, pergunte.",
      maxTurns: 6,
      keepAlive: true,
      paths: [],
    };
    case "add_to_group": return { type: "add_to_group", groupJid: "" };
    case "mention_all": return { type: "mention_all", groupJid: "", text: "", hidden: true };
    case "notify": return { type: "notify", targets: [], text: "🔔 Novo lead: {{nome}} ({{telefone}})" };
    case "note": return { type: "note", text: "Escreva sua anotação aqui…" };
    case "tag": return { type: "tag", tags: ["lead"] };
    case "utm": return { type: "utm" };
    case "window": return { type: "window", horas: 0 };
    case "condition": return { type: "condition", checa: "campo", campo: "", op: "existe", valor: "" };
    case "switch": return { type: "switch", campo: "", casos: [{ rotulo: "Caso 1", valor: "" }] };
    case "location": return { type: "location", lat: "{{latitude}}", lng: "{{longitude}}", nome: "Localização do veículo", endereco: "{{address}}" };
    case "split_out": return { type: "split_out", campo: "", salvarEm: "" };
    case "filter": return { type: "filter", condicoes: [{ campo: "", tipo: "texto", op: "igual", valor: "" }], combinador: "e" };
    case "loop": return { type: "loop", lista: "", campoTelefone: "telefone", limite: 50, intervaloMs: 8000 };
    case "edit_fields": return { type: "edit_fields", campos: [{ campo: "", valor: "" }], salvarNaFicha: true };
    // Porta "dev" da espera: mesmo passo `wait`, já aberto no modo com as opções do n8n.
    case "wait_n8n": return { type: "wait", ms: 5000, modo: "intervalo" };
    case "code": return { type: "code", codigo: "// Trate os dados aqui. O que voltar no return vira variável do fluxo.\nreturn {\n  exemplo: String($campos.nome || \"\").toUpperCase(),\n};" };
    case "set_variable": return { type: "set_variable", campo: "", valor: "" };
    case "google_contact": return { type: "google_contact" };
    case "google_doc": return { type: "google_doc", modo: "criar", titulo: "Proposta — {{nome}}", corpo: "" };
    case "google_calendar": return { type: "google_calendar", acao: "horarios", dias: 5, inicio: "09:00", fim: "18:00", duracaoMin: 30, diasSemana: [1, 2, 3, 4, 5], antecedenciaMin: 60, maxOpcoes: 5, titulo: "Reunião com {{nome}}", descricao: "Lead: {{nome}} · WhatsApp: {{telefone}}", quando: "{{horario_escolhido}}" };
    case "gsheet_append": return { type: "gsheet_append", sheetUrl: "", colunas: ["{{nome}}", "{{telefone}}", "{{utm_source}}"] };
    case "gsheet_read": return { type: "gsheet_read", sheetUrl: "", salvarEm: "planilha" };
    case "email": return { type: "email", para: "{{email}}", assunto: "", corpo: "Oi {{primeiro_nome}},\n\n" };
    case "webhook_out": return { type: "webhook_out", url: "", campos: CAMPOS_WEBHOOK_PADRAO.map((c) => ({ ...c })) };
    case "reminder": return { type: "reminder", text: "Ok! Estou na escuta do lembrete que você quer criar. Manda em áudio ou texto: o dia, a hora, pra quem e a mensagem. 🎙️" };
    case "template": return { type: "template", templateName: "", language: "pt_BR", params: [] };
    case "payment_check": return { type: "payment_check", produto: "", porCodigo: false, horas: 0 };
    case "asaas": return { type: "asaas", acao: "checar_pagamento", buscarPor: "cpf", valorBusca: "" };
    case "zapsign": return { type: "zapsign", acao: "pendentes", diasMin: 0, telefones: true };
    case "meta_ads": return { type: "meta_ads", periodo: "hoje" };
    case "metricas_dia": return { type: "metricas_dia", periodo: "hoje" };
    case "bloquear": return { type: "bloquear", tags: ["Contato bloqueado"] };
    default: return { type: "text", text: "" };
  }
}
function newStep(type: string): Step {
  return { ...stepBody(type), _id: sid() };
}

// Recência dos tipos de nó (localStorage) — o menu da conexão mostra o mais recente no topo.
const RECENT_KEY = "zc-flow-recent-steps";
function loadRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function bumpRecent(type: string): string[] {
  const next = [type, ...loadRecent().filter((t) => t !== type)].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
// Ordena os tipos de STEP_META por recência (recentes primeiro), o resto na ordem padrão.
function orderByRecency(recent: string[]): string[] {
  const all = Object.keys(STEP_META);
  const head = recent.filter((t) => all.includes(t));
  const tail = all.filter((t) => !head.includes(t));
  return [...head, ...tail];
}

// Uma frase por gatilho pro tooltip da paleta: o rótulo curto (a coluna é estreita) não conta o
// que o gatilho faz — e foi o que fez o dono não reconhecer o de template (print 18/08).
const TRIGGER_AJUDA: Record<string, string> = {
  primeiro_contato: "Dispara quando alguém fala com você pela PRIMEIRA vez",
  keyword: "Dispara quando a pessoa escreve uma palavra que você definir",
  grupos: "Dispara por algo que acontece dentro de um GRUPO (menção ou palavra-chave)",
  checkout: "Dispara nos eventos de VENDA (compra aprovada, PIX gerado, carrinho abandonado…)",
  template_reply: "TEMPLATE: dispara quando a pessoa responde ou clica num template que você mandou no Disparador",
  webhook: "Dispara quando outro sistema chama a URL deste fluxo (formulário, CRM, n8n…)",
  afiliado: "Dispara em eventos de afiliado (novo afiliado, lead de teste grátis)",
};

// 📌 PINO DE DADOS FIXADOS (pinData do n8n). Lá o pino faz o nó devolver sempre um exemplo em vez
// de rodar; aqui o nó SEMPRE roda de verdade — então o pino é um aviso, não um comportamento:
// mostra que aquele nó estava alimentado por dado de teste no n8n, com o JSON no tooltip.
function PinoN8n({ dados }: { dados?: string }) {
  if (!String(dados ?? "").trim()) return null;
  return (
    <span
      className="fn-pin"
      title={`Este nó estava com DADOS FIXADOS no n8n (pin):\n${dados}\n\nAqui ele roda de verdade — confira antes de publicar.`}
    >
      <Icon name="pin-dados" size={13} />
    </span>
  );
}

function TriggerNode({ data, selected }: NodeProps) {
  const d = data as { emoji: string; label: string; trigger?: string; eventos?: string[]; botoesGatilho?: string[]; tplNome?: string; paramsGatilho?: string[]; headerUrlGatilho?: string; pin?: string; numero?: { texto: string; aviso?: string }; mockGatilho?: { body?: string; footer?: string; header?: { formato: string; url?: string }; botoes?: Array<{ texto: string; tipo: string }>; waba?: { rotulo?: string; foto?: string } } };
  // GATILHO DE TEMPLATE com retrato salvo → o nó É o mockup do celular (pedido 23/08: "no gatilho
  // de template tem que ter um mockup também"). Mesmo desenho do passo; a diferença é que os
  // handles das respostas rápidas são POR RÓTULO ("b:<texto>") — é como o motor roteia o clique —
  // e botão de URL/ligar/copiar aparece no visual mas sem saída (não gera resposta).
  if (d.trigger === "template_reply" && d.mockGatilho) {
    const mk = d.mockGatilho;
    // {{n}} vira o valor preenchido no editor; sem valor, fica visível pra mostrar o que falta.
    const pg = d.paramsGatilho ?? [];
    const corpoG = String(mk.body ?? "").replace(/\{\{(\d+)\}\}/g, (m0, i) => (pg[Number(i) - 1] || "").trim() || m0);
    return (
      <div className={"flow-node trigger tpl-fone-node" + (selected ? " sel" : "")}>
        <NodeStat id="trigger" />
        <div className="tplnode-topo">
          {mk.waba?.foto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img loading="lazy" decoding="async" className="tplnode-ava" src={mk.waba.foto} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="tplnode-ava tplnode-ava-ini">{(mk.waba?.rotulo ?? "A").slice(0, 1).toUpperCase()}</span>
          )}
          <span className="tplnode-conta">
            <b>Quando respondeu o template</b>
            <em>{d.tplNome}</em>
          </span>
        </div>
        <div className="tplnode-chat">
          <div className="fone-balao">
            {mk.header?.formato === "IMAGE" && (d.headerUrlGatilho || mk.header?.url) && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img loading="lazy" decoding="async" className="fone-img" src={d.headerUrlGatilho || mk.header!.url} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            {mk.header?.formato === "VIDEO" && <FoneVideo src={mk.header?.url} />}
            {mk.header?.formato === "DOCUMENT" && <div className="fone-video">Documento</div>}
            <div className="fone-corpo">{corpoG || <span style={{ color: "#999" }}>(sem corpo)</span>}</div>
            {mk.footer && <div className="fone-rodape">{mk.footer}</div>}
            {(mk.botoes ?? []).length > 0 && (
              <div className="fone-botoes">
                {(mk.botoes ?? []).map((b, i) => {
                  const ehQr = b.tipo === "resposta";
                  return (
                    <div key={i} className={"fone-botao tplnode-botao" + (ehQr ? " with-out" : "")}
                         title={ehQr ? "Clique neste botão sai por esta porta" : "Botão de " + (b.tipo === "url" ? "link" : b.tipo === "telefone" ? "ligação" : "copiar") + " — não gera resposta, não vira saída"}>
                      {b.tipo === "url" ? "↗ " : b.tipo === "telefone" ? "☎ " : b.tipo === "copiar" ? "⧉ " : ""}{b.texto}
                      {ehQr && <Handle type="source" id={"b:" + b.texto} position={Position.Right} className="handle-out" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="gatilho-livre">resposta digitada → saída de baixo</div>
        </div>
        <Handle type="source" position={Position.Right} className="handle-main-out" />
      </div>
    );
  }
  // GATILHO SWITCH (checkout): uma SAÍDA por evento marcado — igual ao Switch do n8n. Cada porta
  // leva a um ramo diferente ("compra aprovada" vai por aqui, "carrinho abandonado" por ali), em
  // vez de exigir um fluxo inteiro por evento. A saída de baixo continua valendo como padrão.
  const portas = d.trigger === "checkout" ? d.eventos ?? [] : [];
  // Resposta de template: cada botão do template é uma PORTA — o clique roteia pro ramo do botão;
  // resposta livre (texto digitado) sai pela porta padrão de baixo.
  const portasBotao: string[] = d.trigger === "template_reply" ? d.botoesGatilho ?? [] : [];
  return (
    <div className={"flow-node trigger" + (selected ? " sel" : "")} style={portas.length || portasBotao.length ? { flexDirection: "column", alignItems: "stretch" } : undefined}>
      <NoTeste id="trigger" />
      <NodeStat id="trigger" />
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <div className="fn-emoji" style={{ color: corDoGatilho(d.trigger ?? "") }}><Icon name={triggerIcon(d.trigger ?? "")} size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="fn-kind">Quando</div>
          <div className="fn-label">{d.label}</div>
          {d.numero?.texto && (
            <div className={"fn-numero" + (d.numero.aviso ? " aviso" : "")} title={d.numero.aviso || "Número deste fluxo"}>
              <Icon name="phone" size={11} /> {d.numero.texto}
            </div>
          )}
        </div>
        <PinoN8n dados={d.pin} />
      </div>
      {portas.length > 0 && (
        <div className="agent-paths" style={{ marginTop: 8 }}>
          {portas.map((ev) => (
            <div key={ev} className="agent-path with-out">
              {TRIGGERS[ev]?.label ?? ev}
              <Handle type="source" id={"ev:" + ev} position={Position.Right} className="handle-out" />
            </div>
          ))}
        </div>
      )}
      {portasBotao.length > 0 && (
        <div className="agent-paths" style={{ marginTop: 8 }}>
          {portasBotao.map((rot) => (
            <div key={rot} className="agent-path btn-out with-out">
              {rot}
              <Handle type="source" id={"b:" + rot} position={Position.Right} className="handle-out" />
            </div>
          ))}
          <div className="agent-path unknown">resposta livre → saída de baixo</div>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="handle-main-out" />
    </div>
  );
}
// Vídeo tocando MUDO em loop dentro do nó, com botão de 🔇/🔊 pra desmutar.
// `round` = variante do vídeo bolinha (PTV). O botão é `nodrag` pra não iniciar o arraste do nó.
function NodeVideo({ src, round, onAspect, controles }: { src: string; round?: boolean; onAspect?: (ar: number) => void; controles?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  // MODO PLAYER (nó de mídia): controles nativos do navegador — pausar, arrastar a linha do tempo,
  // volume, tela cheia. `nodrag nopan` é obrigatório: sem isso, arrastar a linha do tempo arrasta
  // o NÓ pelo canvas em vez de mexer no vídeo.
  if (controles) {
    return (
      <div className="node-vid-wrap player">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={ref}
          className="node-vid nodrag nopan"
          src={src}
          controls
          playsInline
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
          onLoadedMetadata={(e) => { const v = e.currentTarget; if (onAspect && v.videoHeight) onAspect(v.videoWidth / v.videoHeight); }}
        />
      </div>
    );
  }
  // O React tem um bug conhecido: o atributo `muted` do <video> não reflete sozinho.
  // Setar `.muted` imperativamente garante autoplay (browser só toca sozinho se estiver mudo).
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  // A BOLINHA é um player de verdade (pedido do dono, 14/09): o ▶ no meio era só enfeite e o
  // clique não fazia nada. Agora: clique → toca do início COM SOM; clique de novo → pausa.
  // `tocando` acompanha o <video> (play/pause/ended), pra trocar o ícone.
  const [tocando, setTocando] = useState(false);
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    if (!next) v.play().catch(() => {}); // ao desmutar (gesto do usuário), garante o play com som
  }
  function playPause(e: React.MouseEvent) {
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.muted) {
      v.muted = false; setMuted(false);
      if (v.currentTime > 0 && !v.paused) v.currentTime = 0; // estava rodando mudo em loop → recomeça com som
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }
  return (
    <div className={"node-vid-wrap" + (round ? " round" : "")}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        className="node-vid"
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (onAspect && v.videoHeight) onAspect(v.videoWidth / v.videoHeight); }}
      />
      {round && (
        <button type="button" className={"node-play nodrag nopan" + (tocando && !muted ? " tocando" : "")} onClick={playPause}
                title={tocando && !muted ? "Pausar" : "Ouvir o vídeo"} aria-label={tocando && !muted ? "Pausar" : "Ouvir o vídeo"}>
          {tocando && !muted
            ? <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
        </button>
      )}
      <button className="node-mute nodrag nopan" onClick={toggle} title={muted ? "Desmutar" : "Mutar"}>
        <Icon name={muted ? "mute" : "unmute"} size={13} />
      </button>
    </div>
  );
}
// Prévia da mídia que ADAPTA ao formato real do arquivo (vertical/quadrado/wide): o tamanho é
// INTRÍNSECO da imagem/vídeo, só limitado por um teto no CSS (max-height/max-width) — o nó cresce
// em volta. Vertical fica alto e estreito; horizontal fica largo. (Sem trava fixa, sem clamp.)
function MediaThumb({ file, isVideo }: { file: string; isVideo: boolean }) {
  return (
    <div className="fn-media">
      {isVideo ? (
        // `controls`: o dono pediu pra poder pausar, ouvir, voltar e avançar DENTRO do nó
        // (24/08). O PTV (vídeo bolinha) continua com o NodeVideo autoplay/mudo — lá o formato
        // é redondo e curto, controles não caberiam.
        <NodeVideo src={file} controles />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" className="fn-media-img" src={file} alt="" />
      )}
    </div>
  );
}
// Contextos p/ os nós (renderizados DENTRO do ReactFlow) acessarem ações e stats do funil.
// ══ DADOS DO GATILHO — o "play manual" (estilo n8n) ═════════════════════════════════════════
// Depois que a escuta do webhook captura um evento, o botão "Enviar dados pro próximo passo"
// empurra esses dados PRA FRENTE: os fios que carregam ficam VERDES e cada passo seguinte passa
// a oferecer as variáveis como chips clicáveis, que entram direto nos campos.
// É só do EDITOR (não vai pro servidor, some ao recarregar): serve pra montar o fluxo vendo o
// dado real, sem decorar nome de variável nem colar JSON.
export interface DadoDoGatilho { rotulo: string; variavel?: string; valor: string }
const GatilhoDados = createContext<{
  dados: DadoDoGatilho[] | null;
  origem: string; // rótulo do evento que veio ("PIX gerado")
  enviar: (dados: DadoDoGatilho[], origem: string) => void;
  limpar: () => void;
} | null>(null);

const FlowActions = createContext<{ onEdit: (id: string) => void; onCopy: (id: string) => void; onDelete: (id: string) => void; onResize?: (id: string, w: number, h: number) => void } | null>(null);
const StatsCtx = createContext<FlowStats | null>(null);
const NodeLeadsCtx = createContext<((nodeId: string) => void) | null>(null); // abre o popup de leads do nó

// Botões flutuantes no canto do nó: editar (lápis), copiar, excluir. `nodrag` p/ não iniciar arraste.
function NodeBadges({ id }: { id: string }) {
  const a = useContext(FlowActions);
  // O selo do teste mora aqui de carona: NodeBadges já é renderizado por TODOS os desenhos de nó,
  // então o ▶/✓ aparece em qualquer passo sem ter que mexer em cada um deles.
  return (
    <>
      <NoTeste id={id} />
      {a && (
        <div className="node-badges nodrag nopan">
          <button className="nb-btn nb-edit" title="Editar" onClick={(e) => { e.stopPropagation(); a.onEdit(id); }}><Icon name="edit" size={13} /></button>
          <button className="nb-btn nb-copy" title="Duplicar" onClick={(e) => { e.stopPropagation(); a.onCopy(id); }}><Icon name="copy" size={13} /></button>
          <button className="nb-btn nb-del" title="Excluir" onClick={(e) => { e.stopPropagation(); a.onDelete(id); }}><Icon name="close" size={13} /></button>
        </div>
      )}
    </>
  );
}
// Caixinha à direita do nó: quantas PESSOAS passaram + % de quem entrou no fluxo.
function NodeStat({ id }: { id: string }) {
  const stats = useContext(StatsCtx);
  const openLeads = useContext(NodeLeadsCtx);
  if (!stats || stats.total === 0) return null;
  const s = stats.byNode[id];
  const count = s?.count ?? 0;
  const pct = s?.pct ?? 0;
  const cls = pct >= 50 ? "hi" : pct > 0 ? "mid" : "lo";
  return (
    <button
      className={"node-stat " + cls + (count > 0 ? " clickable nodrag nopan" : "")}
      title={count > 0
        ? `${count} passagem(ns)${s?.pessoas ? ` · ${s.pessoas} pessoa(s) distinta(s)` : ""} · ${pct}% — clique pra ver e limpar teste`
        : `${count} passagem(ns) · ${pct}%`}
      onClick={(e) => { if (count > 0 && openLeads) { e.stopPropagation(); openLeads(id); } }}
      disabled={count === 0}
    >
      <div className="ns-count">{count}</div>
      <div className="ns-pct">{pct}%</div>
    </button>
  );
}

// ⚠️ SAÍDA SEM FIO. Um botão (ou ramo de decisão) que não leva a lugar nenhum é o erro mais caro
// do builder: no caso dos BOTÕES o motor nem espera o clique — ele só arma a escuta quando existe
// pelo menos um ramo ligado. Resultado: a pessoa clica no celular e "não acontece nada", sem
// nenhuma pista na tela. (Admin, 24/08: "se eu clicar em Sim não vai pra lugar nenhum pq não tem
// nada na saída do nó".) Agora o próprio nó avisa.
function SaidaSemFio({ nodeId, handle }: { nodeId: string; handle: string }) {
  const ligado = useStore((st) => {
    for (const e of st.edges) if (e.source === nodeId && (e.sourceHandle ?? "") === handle) return true;
    return false;
  });
  if (ligado) return null;
  return <span className="saida-sem-fio" title="Esta saída não está ligada em nenhum passo — quem escolher isto não recebe nada. Arraste a bolinha até o próximo passo.">sem saída</span>;
}

// Nenhum botão ligado → o motor NÃO espera o clique (manda e segue). Aviso no nó inteiro.
function BotoesSemEspera({ nodeId, n }: { nodeId: string; n: number }) {
  const algumLigado = useStore((st) => {
    for (const e of st.edges) {
      if (e.source !== nodeId) continue;
      const h = e.sourceHandle ?? "";
      for (let i = 0; i < n; i++) if (h === "b" + i) return true;
    }
    return false;
  });
  if (algumLigado) return null;
  return (
    <div className="nó-aviso" title="Ligue pelo menos um botão a um passo seguinte">
      Nenhum botão está ligado — o fluxo <b>não espera</b> o clique: manda os botões e segue reto.
    </div>
  );
}

// QUANTOS SEGUIRAM POR ESTA SAÍDA. O motor já grava cada escolha como "<nó>:<saída>" em
// flow_node_hits (botão pelo RÓTULO, decisão por sim/nao/aberta/fechada/pago/nao_pago) — o dado
// sempre esteve lá, faltava desenhar. Pedido do dono (24/08): "quero o percentual de quem
// seguiu pra onde nos botões e nas condicionais".
// O % é sobre quem CHEGOU no nó (não sobre o funil inteiro): é o que responde "dos que viram os
// botões, quantos clicaram em Sim?", que é a pergunta real de quem olha um nó de decisão.
function SaidaStat({ nodeId, saida }: { nodeId: string; saida: string }) {
  const stats = useContext(StatsCtx);
  if (!stats || stats.total === 0) return null;
  const chegaram = stats.byNode[nodeId]?.count ?? 0;
  const seguiram = stats.byNode[`${nodeId}:${saida}`]?.count ?? 0;
  if (!chegaram) return null;
  const pct = Math.round((seguiram / chegaram) * 100);
  return (
    <span className={"saida-stat" + (seguiram > 0 ? " tem" : "")}
      title={`${seguiram} de ${chegaram} que chegaram neste passo seguiram por aqui`}>
      {seguiram} · {pct}%
    </span>
  );
}


// ══ TESTE DE PERCURSO NO CANVAS (nó a nó, estilo n8n) ════════════════════════════════════════
// O payload que o gatilho de webhook capturou (na escuta ou colado) vira o "lead de mentira": o
// teste anda pelo GRAFO tomando as MESMAS decisões que o motor tomaria (switch, condição) e acende
// o caminho no canvas. Onde quem decide é o LEAD (botão, janela, etiqueta, agente de IA) o teste
// PARA e você clica no ramo que quer provar — sem precisar pedir outro POST pra origem.
// É simulação de PERCURSO: nada é enviado, nada entra no funil.
// ⚠️ As comparações abaixo espelham engine/runner.ts de propósito — se mudar lá, muda aqui.
type EscolhaTeste = { handle: string; rotulo: string };
type PassoTeste = { handle?: string; rotulo: string; detalhe?: string; escolhas?: EscolhaTeste[]; motivo?: string; alerta?: string };
type EstadoTeste = {
  fields: Record<string, string>;
  feitos: Record<string, PassoTeste>;                              // nó já rodado → o que aconteceu
  armado: { nodeId: string; passo: PassoTeste } | null;            // nó da vez
  fim: string | null;
  // Onde o teste EMPACOU: escolheu uma saída e ela não leva a lugar nenhum. Fica vermelho no nó —
  // é diferente de "acabou", que é o fim natural de um ramo.
  parada: { nodeId: string; motivo: string } | null;
  ordem: string[];
  automatico: boolean;                                             // veio do "testar tudo": segue sozinho
};
const TesteCtx = createContext<{
  estado: EstadoTeste | null;
  podeIniciar: boolean;
  play: (nodeId: string, handle?: string) => void;
  iniciar: () => void;          // ▶ no gatilho: começa o teste passo a passo
  iniciarTudo: () => void;      // "testar o fluxo inteiro"
  parar: () => void;
  aviso: string;                // por que não deu pra começar (sem payload capturado)
  captura: EspiadaWebhook | null;
  setCaptura: (c: EspiadaWebhook | null) => void;
  rodando: string | null;       // nó sendo executado DE VERDADE no motor agora (▶ vira "rodando…")
} | null>(null);

// Switch: normaliza tirando acento (igual ao motor). Condição: só minúscula/trim (igual ao motor).
const normSwitch = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Troca {{campo}} pelo valor do teste — é como o lead veria a mensagem. Campo aninhado aceita
// tanto {{device_vin}} quanto {{device.vin}}. Desconhecido fica como está (fica visível que faltou).
export function preencheVarsTeste(txt: string, fields: Record<string, string>): string {
  return String(txt ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m0, nome) =>
    fields[String(nome)] ?? fields[String(nome).replace(/\./g, "_")] ?? m0);
}

// Próximo nó por uma saída; sem aresta nessa saída, cai na saída PADRÃO (a sem handle) — mesma
// regra do nextNodeId/saidaPadrao do motor.
export function proximoNoTeste(edges: FlowEdge[], nodeId: string, handle?: string): string | null {
  if (handle) {
    const e = edges.find((x) => x.source === nodeId && (x.sourceHandle ?? "") === handle);
    if (e) return e.target;
  }
  return edges.find((x) => x.source === nodeId && !x.sourceHandle)?.target ?? null;
}

// O que ESTE nó faz no teste: decide sozinho, passa reto, ou devolve os ramos pra você escolher.
// Motivo em português de por que o teste EMPACOU num nó (escolheu uma saída que não vai a lugar
// nenhum). Fala o nome da saída — é o que diz onde ligar o fio.
export function motivoDaParada(step: Step | null, passo: PassoTeste): string {
  if (step?.type === "switch") {
    return passo.handle === "default"
      ? `Parou no Switch: nenhum caso bateu (${passo.detalhe ?? ""}) e a saída "Nenhum caso bateu" não está ligada em nada.`
      : `Parou no Switch: o caso "${passo.rotulo}" bateu, mas essa saída não leva a nenhum passo.`;
  }
  return `Parou aqui: a saída "${passo.rotulo}" não está ligada em nenhum passo.`;
}

export function avaliaNoTeste(step: Step | null, fields: Record<string, string>, edges: FlowEdge[], nodeId: string): PassoTeste {
  if (!step) {
    return {
      rotulo: "disparou",
      detalhe: fields.telefone ? `telefone ${fields.telefone}` : undefined,
      alerta: fields.telefone && fields.telefone.length >= 8 ? undefined : "sem telefone válido — na vida real este POST seria recusado",
    };
  }

  if (step.type === "switch") {
    const campo = String(step.campo ?? "").trim();
    const bruto = fields[campo] ?? "";
    const atual = normSwitch(bruto);
    const casos = (step.casos ?? []).filter((c) => c?.rotulo?.trim());
    const i = casos.findIndex((c) => {
      const val = normSwitch(c.valor);
      return c.op === "contem" ? !!val && atual.includes(val) : atual === val;
    });
    const onde = `${campo || "(sem campo)"} = "${String(bruto).slice(0, 60)}"`;
    return i >= 0
      ? { handle: "c" + i, rotulo: casos[i].rotulo, detalhe: onde }
      : { handle: "default", rotulo: "nenhum caso bateu", detalhe: onde };
  }

  if (step.type === "condition") {
    if (step.checa === "tag") {
      return {
        rotulo: "etiqueta", motivo: `A etiqueta "${step.valor ?? ""}" depende da ficha do contato — escolha o caminho`,
        escolhas: [{ handle: "sim", rotulo: "Tem a etiqueta" }, { handle: "nao", rotulo: "Não tem" }],
      };
    }
    const campo = String(step.campo ?? "").trim();
    const atual = String(fields[campo] ?? "").trim();
    const alvo = preencheVarsTeste(String(step.valor ?? ""), fields).trim();
    const op = step.op ?? "existe";
    const ok = op === "existe" ? !!atual
      : op === "contem" ? !!atual && atual.toLowerCase().includes(alvo.toLowerCase())
      : atual.toLowerCase() === alvo.toLowerCase();
    return { handle: ok ? "sim" : "nao", rotulo: ok ? "Sim" : "Não", detalhe: `${campo || "campo"} = "${atual.slice(0, 60)}"` };
  }

  if (step.type === "window") {
    return {
      rotulo: "janela", motivo: "Depende de quando o lead falou pela última vez — escolha",
      escolhas: [{ handle: "aberta", rotulo: "Aberta" }, { handle: "fechada", rotulo: "Fechada" }],
    };
  }
  if (step.type === "payment_check") {
    return {
      rotulo: "pagamento", motivo: "Depende da consulta real de pagamento — escolha",
      escolhas: [{ handle: "pago", rotulo: "Pagou" }, { handle: "nao_pago", rotulo: "Não pagou" }],
    };
  }

  // Botões/template: o motor SÓ espera o clique se algum ramo "b<i>" estiver ligado — senão manda
  // e segue reto. O teste reproduz isso (é a pegadinha que já confundiu na prática).
  if (step.type === "buttons" || step.type === "template") {
    const rotulos = (step.type === "buttons" ? step.buttons : step.botoes ?? []).filter((r) => r && r.trim());
    const ligados = rotulos.map((r, i) => ({ handle: "b" + i, rotulo: r })).filter((o) => edges.some((e) => e.source === nodeId && (e.sourceHandle ?? "") === o.handle));
    if (ligados.length) return { rotulo: "esperou o clique", motivo: "O lead escolhe — clique no botão que quer testar", escolhas: ligados };
    return { rotulo: "enviou (não espera clique)", detalhe: step.type === "buttons" ? preencheVarsTeste(step.text, fields) : `template ${step.templateName}` };
  }

  if (step.type === "ai_agent") {
    const opcoes = (step.paths ?? []).map((p) => ({ handle: "p:" + p.name, rotulo: p.name }));
    return {
      rotulo: "agente de IA", motivo: "Quem decide é a IA conversando — escolha o caminho pra testar",
      escolhas: [...opcoes, { handle: "ended", rotulo: "encerrou" }, { handle: "fallback", rotulo: "não identificou" }],
    };
  }

  if (step.type === "text") {
    // Variável que o payload não trouxe fica visível como {{...}} no texto — o lead receberia a
    // mensagem com buraco. É o erro mais comum quando o sistema de origem manda campo vazio.
    const txt = preencheVarsTeste(step.text, fields);
    const faltou = [...new Set(txt.match(/\{\{[\w.]+\}\}/g) ?? [])];
    const vazias = [...step.text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
      .map((m) => m[1]).filter((k) => (fields[k] ?? fields[k.replace(/\./g, "_")] ?? "").trim() === "");
    const problema = [...new Set([...faltou, ...vazias.map((k) => `{{${k}}}`)])];
    return { rotulo: "enviou texto", detalhe: txt, alerta: problema.length ? `sem valor: ${problema.join(" ")}` : undefined };
  }
  if (step.type === "ask") return { rotulo: "perguntou e guardou", detalhe: `resposta vai pra {{${step.variable}}}` };
  if (step.type === "tag") return { rotulo: "etiquetou", detalhe: (step.tags ?? []).join(", ") };
  if (step.type === "wait") return { rotulo: "esperou", detalhe: step.ms >= 120_000 ? "follow-up agendado" : `${Math.round(step.ms / 1000)}s` };
  if (step.type === "note") return { rotulo: "anotação (não roda)" };
  return { rotulo: STEP_META[step.type]?.label ?? step.type };
}

// Devolve o payload original com as EDIÇÕES dos campos aplicadas por cima. Usa a estrutura do
// próprio payload pra saber onde cada nome achatado mora — "device_vin" volta pra device.vin sem
// ambiguidade, coisa que adivinhar pelo nome não conseguiria (device_icon_colors_moving tem três
// leituras possíveis). Sem isto, editar um valor mudaria a simulação e NÃO o disparo real, e os
// dois discordariam em silêncio.
export function aplicaEdicoesNoPayload(base: any, campos: Record<string, string>): any {
  const anda = (obj: any, pre: string, prof: number) => {
    for (const [k, v] of Object.entries(obj)) {
      const chave = (pre ? `${pre}_${k.replace(/[^\w]/g, "_")}` : k.replace(/[^\w]/g, "_")).slice(0, 60);
      if (v && typeof v === "object" && !Array.isArray(v) && prof < 2) { anda(v, chave, prof + 1); continue; }
      const novo = campos[chave];
      if (novo !== undefined && String(v ?? "") !== novo) obj[k] = novo;
    }
  };
  anda(base, "", 0);
  return base;
}

// ── O mesmo, pro gatilho de CHECKOUT ─────────────────────────────────────────────────────────
// Aqui a variável NÃO é o caminho: {{nome}} mora em Customer.full_name, {{telefone}} em
// Customer.mobile. Sem este mapa, editar o telefone mudava a simulação e NÃO mudava o disparo
// real — a mensagem sairia pro número original e ninguém entenderia por quê. Num botão que manda
// WhatsApp de verdade, discordar em silêncio é o pior defeito possível.
// A Kiwify manda a VENDA em Customer/Product e o CARRINHO ABANDONADO plano no topo; por isso cada
// variável tem mais de um caminho e vale o primeiro que EXISTE no payload.
const CAMINHOS_DO_CHECKOUT: Record<string, string[]> = {
  telefone: ["Customer.mobile", "phone"],
  nome: ["Customer.full_name", "name"],
  primeiro_nome: ["Customer.first_name"],
  email: ["Customer.email", "email"],
  produto: ["Product.product_name"],
  pix: ["pix_code"],
  oferta: ["checkout_link"],
};

// Devolve o payload com as edições dentro E a lista do que NÃO coube — {{valor}} vira "R$ 69,90"
// na tela mas viaja em centavos, {{utm_*}} depende do formato da plataforma. Em vez de fingir que
// entrou, a tela diz quais edições valem só pra simulação.
export function aplicaEdicoesDoCheckout(base: any, campos: Record<string, string>): { corpo: any; naoAplicados: string[] } {
  const corpo = aplicaEdicoesNoPayload(base, campos); // pega o que bate por caminho (carrinho abandonado é plano)
  const escreve = (caminho: string, valor: string): boolean => {
    const partes = caminho.split(".");
    let o: any = corpo;
    for (const p of partes.slice(0, -1)) {
      if (!o || typeof o !== "object" || !(p in o)) return false;
      o = o[p];
    }
    const ultima = partes[partes.length - 1];
    if (!o || typeof o !== "object" || !(ultima in o)) return false;
    o[ultima] = valor;
    return true;
  };
  for (const [chave, valor] of Object.entries(campos)) {
    (CAMINHOS_DO_CHECKOUT[chave] ?? []).some((c) => escreve(c, valor));
  }
  // Conferência pelo RESULTADO, não pela intenção: se o valor editado não está no JSON que vai
  // sair, a edição não entrou — não importa o motivo.
  const texto = JSON.stringify(corpo);
  const naoAplicados = Object.entries(campos)
    .filter(([, v]) => String(v ?? "").trim() && !texto.includes(String(v)))
    .map(([k]) => k);
  return { corpo, naoAplicados };
}

// Nome de variável clicável: um clique copia {{assim}} pra área de transferência, pra colar no
// texto de um passo lá na frente. Sem isso a pessoa tem que redigitar à mão e erra o nome.
function ChipVar({ nome, titulo }: { nome: string; titulo?: string }) {
  const [copiou, setCopiou] = useState(false);
  const txt = `{{${nome}}}`;
  return (
    <button type="button" className={"chip-var" + (copiou ? " copiou" : "")} title={titulo ?? `Clique pra copiar ${txt}`}
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(txt); setCopiou(true); setTimeout(() => setCopiou(false), 1200); } catch { /* sem permissão */ }
      }}>
      {copiou ? "copiado ✓" : txt}
    </button>
  );
}

// Selo de teste no canto do nó: ▶ na vez dele, os ramos quando a decisão é do lead, ✓ depois.
function NoTeste({ id }: { id: string }) {
  const t = useContext(TesteCtx);
  if (!t) return null;
  if (!t.estado) {
    // Sem teste rodando: só o gatilho oferece o play, e só quando tem payload capturado.
    if (id !== "trigger" || !t.podeIniciar) return null;
    return (
      <div className="no-teste nodrag nopan">
        <button className="nt-play" onClick={(e) => { e.stopPropagation(); t.iniciar(); }}
          title="Passo a passo DE VERDADE com o payload capturado: cada ▶ executa o passo no motor (planilha, agenda e mensagem acontecem no número de teste)">
          <Icon name="play" size={11} /> testar
        </button>
      </div>
    );
  }
  const feito = t.estado.feitos[id];
  const arm = t.estado.armado?.nodeId === id ? t.estado.armado : null;
  const parada = t.estado.parada?.nodeId === id ? t.estado.parada : null;
  if (!feito && !arm) return null;
  // EMPACOU aqui: escolheu uma saída que não leva a nenhum passo. Vermelho, com o motivo.
  if (parada && feito) {
    return (
      <div className="no-teste parou" title={parada.motivo}>
        <Icon name="close" size={11} /> parou: {feito.rotulo}
      </div>
    );
  }
  if (arm) {
    const esc = arm.passo.escolhas ?? [];
    return (
      <div className={"no-teste nodrag nopan" + (esc.length ? " escolha" : "")}>
        {esc.length ? (
          <>
            <span className="nt-msg" title={arm.passo.motivo}>{arm.passo.motivo ?? "escolha o caminho"}</span>
            {esc.map((o) => (
              <button key={o.handle} className="nt-ramo" title={`Seguir por "${o.rotulo}"`}
                onClick={(e) => { e.stopPropagation(); t.play(id, o.handle); }}>{o.rotulo}</button>
            ))}
          </>
        ) : (
          <button className={"nt-play" + (t.rodando === id ? " rodando" : "")} disabled={!!t.rodando} onClick={(e) => { e.stopPropagation(); t.play(id); }}
            title={id === "trigger" ? [arm.passo.rotulo, arm.passo.detalhe].filter(Boolean).join(" — ") : "Executar este passo de verdade e mandar os dados pro próximo"}>
            <Icon name="play" size={11} /> {t.rodando === id ? "rodando…" : arm.passo.rotulo}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={"no-teste feito" + (feito.alerta ? " alerta" : "")}
      title={[feito.rotulo, feito.alerta, feito.detalhe].filter(Boolean).join(" — ")}>
      <Icon name={feito.alerta ? "close" : "check"} size={11} /> {feito.rotulo}
      {feito.alerta && <span className="nt-alerta">{feito.alerta}</span>}
    </div>
  );
}

// ══ Passo "Enviar webhook": campos em LINHAS, não em texto livre ═════════════════════════════
// Antes era um textarea onde a pessoa tinha que digitar `nome: {{nome}}` na mão — um leigo não
// tem como adivinhar os dois-pontos nem as chaves duplas. Agora cada campo é uma linha com dois
// espaços (o rótulo que vai no JSON e o valor), o valor tem um MENU de variáveis, e dá pra testar
// de verdade antes de publicar.
const CAMPOS_WEBHOOK_PADRAO: Array<{ chave: string; valor: string }> = [
  { chave: "nome", valor: "{{nome}}" },
  { chave: "telefone", valor: "{{telefone}}" },
  { chave: "mensagem", valor: "{{mensagem}}" },
  { chave: "ocorrido_em", valor: "{{data}}" },
  { chave: "email", valor: "{{email}}" },
];
// Variáveis oferecidas no menu. `exemplo` é o que o botão Testar manda de verdade — assim o outro
// sistema recebe um dado plausível, não "{{nome}}" cru.
const VARS_WEBHOOK: Array<{ v: string; rotulo: string; exemplo: string }> = [
  { v: "{{nome}}", rotulo: "Nome do contato", exemplo: "Maria (teste)" },
  { v: "{{primeiro_nome}}", rotulo: "Primeiro nome", exemplo: "Admin" },
  { v: "{{telefone}}", rotulo: "Telefone", exemplo: "5511999999999" },
  { v: "{{email}}", rotulo: "E-mail", exemplo: "teste@seudominio.com.br" },
  { v: "{{mensagem}}", rotulo: "Última mensagem do lead", exemplo: "Vim pela página e quero saber mais" },
  { v: "{{data}}", rotulo: "Data e hora de agora", exemplo: "" },
  { v: "{{produto}}", rotulo: "Produto (venda)", exemplo: "Plano 1 conta" },
  { v: "{{valor}}", rotulo: "Valor (venda)", exemplo: "R$ 147,00" },
  { v: "{{link}}", rotulo: "Link do checkout", exemplo: "https://pay.kiwify.com.br/SEU-CHECKOUT" },
  { v: "{{utm_source}}", rotulo: "Origem (utm_source)", exemplo: "meta-ads" },
];
// Troca as variáveis pelo exemplo — é o corpo que o teste manda. Variável desconhecida vira o
// próprio nome sem as chaves (melhor que mandar "{{seja_o_que_for}}" pro outro sistema).
function valorDeTeste(v: string): string {
  return String(v ?? "").replace(/\{\{([a-z0-9_]+)\}\}/gi, (_m, nome) => {
    const achou = VARS_WEBHOOK.find((x) => x.v === "{{" + nome + "}}");
    if (achou) return achou.exemplo || new Date().toLocaleString("pt-BR");
    return String(nome).replace(/_/g, " ");
  });
}

// Operadores POR TIPO, como no n8n. O tipo não é firula: comparar "10" e "9" como texto dá
// "10 < 9" (ordem alfabética), e o filtro barraria a pessoa errada sem avisar ninguém.
const OPS_FILTRO: Record<string, Array<{ id: string; nome: string; semValor?: boolean }>> = {
  comuns: [
    { id: "existe", nome: "existe", semValor: true },
    { id: "nao_existe", nome: "não existe", semValor: true },
    { id: "vazio", nome: "está vazio", semValor: true },
    { id: "nao_vazio", nome: "não está vazio", semValor: true },
  ],
  texto: [
    { id: "igual", nome: "é igual a" }, { id: "diferente", nome: "é diferente de" },
    { id: "contem", nome: "contém" }, { id: "nao_contem", nome: "não contém" },
    { id: "comeca", nome: "começa com" }, { id: "nao_comeca", nome: "não começa com" },
    { id: "termina", nome: "termina com" }, { id: "nao_termina", nome: "não termina com" },
    { id: "regex", nome: "casa com a expressão" }, { id: "nao_regex", nome: "não casa com a expressão" },
  ],
  numero: [
    { id: "igual", nome: "é igual a" }, { id: "diferente", nome: "é diferente de" },
    { id: "maior", nome: "é maior que" }, { id: "menor", nome: "é menor que" },
    { id: "maior_igual", nome: "é maior ou igual a" }, { id: "menor_igual", nome: "é menor ou igual a" },
  ],
  data: [
    { id: "igual", nome: "é igual a" }, { id: "diferente", nome: "é diferente de" },
    { id: "depois", nome: "é depois de" }, { id: "antes", nome: "é antes de" },
    { id: "depois_igual", nome: "é depois ou igual a" }, { id: "antes_igual", nome: "é antes ou igual a" },
  ],
  booleano: [
    { id: "verdadeiro", nome: "é verdadeiro", semValor: true }, { id: "falso", nome: "é falso", semValor: true },
    { id: "igual", nome: "é igual a" }, { id: "diferente", nome: "é diferente de" },
  ],
  lista: [
    { id: "contem", nome: "contém" }, { id: "nao_contem", nome: "não contém" },
    { id: "tam_igual", nome: "tem N itens" }, { id: "tam_diferente", nome: "não tem N itens" },
    { id: "tam_maior", nome: "tem mais de N itens" }, { id: "tam_menor", nome: "tem menos de N itens" },
    { id: "tam_maior_igual", nome: "tem N itens ou mais" }, { id: "tam_menor_igual", nome: "tem N itens ou menos" },
  ],
};
const TIPOS_FILTRO = [
  { id: "texto", nome: "Texto" }, { id: "numero", nome: "Número" }, { id: "data", nome: "Data e hora" },
  { id: "booleano", nome: "Sim/Não" }, { id: "lista", nome: "Lista" },
] as const;

function FiltroEditor({ s, onChange }: {
  s: Extract<StepBody, { type: "filter" }>;
  onChange: (v: StepBody) => void;
}) {
  const conds = s.condicoes ?? [];
  const mexe = (i: number, patch: Partial<(typeof conds)[number]>) =>
    onChange({ ...s, condicoes: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <>
      <div className="ask-note">
        🚦 <b>Filtro.</b> Só continua quem passa — quem não passa <b>para aqui</b>. Diferente da
        Condição, que manda pros dois lados; aqui tem uma saída só. Serve pra descartar o que não
        interessa (cobrança já paga, item sem telefone) sem desenhar um ramo morto.
      </div>

      {conds.length > 1 && (
        <div className="field">
          <label>Precisa passar em</label>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className={"btn" + ((s.combinador ?? "e") === "e" ? " primary" : "")}
              style={{ flex: 1, justifyContent: "center" }} onClick={() => onChange({ ...s, combinador: "e" })}>
              todas as condições
            </button>
            <button type="button" className={"btn" + (s.combinador === "ou" ? " primary" : "")}
              style={{ flex: 1, justifyContent: "center" }} onClick={() => onChange({ ...s, combinador: "ou" })}>
              qualquer uma
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label>Condições</label>
        {conds.map((c, i) => {
          const tipo = c.tipo ?? "texto";
          const lista = [...OPS_FILTRO.comuns, ...(OPS_FILTRO[tipo] ?? [])];
          const opAtual = lista.find((o) => o.id === c.op);
          return (
            <div key={i} className="caso-switch">
              <div className="caso-topo">
                <span className="caso-n">{i + 1}</span>
                <input className="inp" style={{ flex: 1, minWidth: 0 }} value={c.campo} placeholder="nome do campo"
                  onChange={(e) => mexe(i, { campo: e.target.value.replace(/[{}\s]/g, "") })} />
                <button className="caso-x" title="Remover condição"
                  onClick={() => onChange({ ...s, condicoes: conds.filter((_, k) => k !== i) })}>
                  <Icon name="close" size={12} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <select className="inp" style={{ flex: "0 0 108px" }} value={tipo}
                  onChange={(e) => mexe(i, { tipo: e.target.value as any, op: "igual" })}>
                  {TIPOS_FILTRO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <select className="inp" style={{ flex: 1, minWidth: 0 }} value={c.op}
                  onChange={(e) => mexe(i, { op: e.target.value })}>
                  {lista.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
              {!opAtual?.semValor && (
                <input className="inp caso-valor" value={c.valor ?? ""}
                  placeholder={tipo === "data" ? "2026-08-24 (ou {{variavel}})" : tipo === "numero" ? "100" : "valor"}
                  onChange={(e) => mexe(i, { valor: e.target.value })} />
              )}
            </div>
          );
        })}
        <button className="btn" style={{ marginTop: 9 }}
          onClick={() => onChange({ ...s, condicoes: [...conds, { campo: "", tipo: "texto", op: "igual", valor: "" }] })}>
          <Icon name="plus" size={13} /> Adicionar condição
        </button>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.5 }}>
          O <b>tipo</b> muda a comparação de verdade: como <b>número</b>, 10 é maior que 9; como
          <b> texto</b>, "10" vem antes de "9" (ordem alfabética) e o filtro barraria a pessoa
          errada sem avisar. Quando barra, o motivo aparece nos <b>Logs ao vivo</b>.
        </div>
      </div>
    </>
  );
}

// ── Autenticação DENTRO do nó ────────────────────────────────────────────────────────────────
// Não existe tela de credenciais no produto (e criar uma seria outro projeto), então a chave da
// API mora no próprio passo. O valor é enviado uma vez, cifrado no servidor e NUNCA volta — o
// painel só sabe que existe. Por isso o campo aparece como "configurado" em vez de mostrar o
// segredo: assim ele não circula por rede, cache do navegador nem arquivo baixado.
const TIPOS_AUTH: Array<{ id: string; nome: string; ajuda: string; pedeNome?: boolean }> = [
  { id: "nenhuma", nome: "Nenhuma", ajuda: "A API é aberta ou o token já está na própria URL." },
  { id: "header", nome: "Cabeçalho (header)", ajuda: "Manda a chave num cabeçalho com o nome que a API pedir. É o caso do Asaas (access_token) e da Evolution (apikey).", pedeNome: true },
  { id: "bearer", nome: "Bearer (token)", ajuda: "Manda como Authorization: Bearer <sua chave>. É o mais comum em APIs modernas." },
  { id: "basic", nome: "Básica (usuário:senha)", ajuda: "Escreva no formato usuario:senha — o resto é feito pra você." },
  { id: "query", nome: "Na URL (parâmetro)", ajuda: "Anexa a chave como parâmetro (?token=…). Menos seguro: fica no log do outro lado.", pedeNome: true },
];

function AuthDoHttp({ s, onChange }: { s: Extract<Step, { type: "webhook_out" }>; onChange: (v: Step) => void }) {
  const tipo = s.authTipo ?? "nenhuma";
  const meta = TIPOS_AUTH.find((t) => t.id === tipo)!;
  const jaTem = !!(s as any).authConfigurado || !!(s as any).authValorEnc;
  const [trocando, setTrocando] = useState(false);

  return (
    <div className="field">
      <label>Autenticação</label>
      <select className="inp" value={tipo}
        onChange={(e) => onChange({ ...s, authTipo: e.target.value as any } as Step)}>
        {TIPOS_AUTH.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>{meta.ajuda}</div>

      {tipo !== "nenhuma" && (
        <>
          {meta.pedeNome && (
            <input className="inp" style={{ marginTop: 7 }} value={s.authNome ?? ""}
              placeholder={tipo === "header" ? "nome do cabeçalho (ex.: access_token)" : "nome do parâmetro (ex.: token)"}
              onChange={(e) => onChange({ ...s, authNome: e.target.value } as Step)} />
          )}
          {jaTem && !trocando ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
              <span className="chip-var" style={{ cursor: "default" }}>chave configurada</span>
              <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => setTrocando(true)}>trocar</button>
              <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12, color: "var(--crit)" }}
                onClick={() => onChange({ ...s, authValor: "" } as Step)}>remover</button>
            </div>
          ) : (
            <input className="inp" style={{ marginTop: 7 }} type="password" autoComplete="off"
              placeholder={tipo === "basic" ? "usuario:senha" : "cole aqui a chave da API"}
              value={(s as any).authValor ?? ""}
              onChange={(e) => onChange({ ...s, authValor: e.target.value } as Step)} />
          )}
          <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.5 }}>
            A chave é <b>guardada cifrada</b> e não volta pra esta tela depois de salva — nem no
            arquivo do <b>baixar fluxo</b>. Se precisar trocar, use o botão acima.
          </div>
        </>
      )}
    </div>
  );
}

// ══ Passo "Planilha Google": coluna → variável, sem digitar chave ═══════════════════════════
// O nó lê a linha 1 da planilha (os nomes das colunas) e mostra, pra cada coluna, um menu com as
// variáveis que existem no fluxo (as capturadas na escuta do gatilho + as que os passos criam).
// A pessoa escolhe "Telefone → {{telefone}}" clicando. Por baixo continua sendo `colunas`
// (o motor não mudou); `cabecalhos` é só a foto da linha 1 pra desenhar a tabela.
// Pedido do dono, 15/09: "o usuário não sabe que tem que colocar {{}}".
const normCol = (t: string) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Sinônimos do que costuma vir de cabeçalho → variável. Só sugere se a variável existir na lista.
const SINONIMOS_COLUNA: Array<[RegExp, string]> = [
  [/^(nome|name|cliente|lead)$/, "nome"], [/primeiro nome/, "primeiro_nome"],
  [/telefone|whatsapp|celular|fone|phone/, "telefone"], [/instagram|insta\b|@/, "instagram"], [/e ?mail/, "email"],
  [/^data$|^date$/, "data"], [/^hora$|horario|^time$/, "hora_min"], [/data ?e ?hora|data hora/, "data_hora"],
  [/^pagina$|^page$|url/, "pagina"], [/gclid/, "gclid"], [/fbclid/, "fbclid"],
  [/utm ?source/, "utm_source"], [/utm ?medium/, "utm_medium"], [/utm ?campaign/, "utm_campaign"], [/utm ?content/, "utm_content"], [/utm ?term/, "utm_term"],
  [/diagnostico|nivel|resultado/, "nivel"], [/segmento|nicho|ramo/, "nicho"], [/como .*chegam|origem/, "origem"],
  [/ja anunciou|anunciou|experiencia/, "experiencia"], [/custo por cliente|cac/, "cac"], [/incomodo|dor/, "dor"],
  [/verba|investimento/, "verba"], [/faturamento|receita/, "faturamento"], [/estrutura/, "estrutura"], [/quando .*comecar|urgencia|prazo/, "urgencia"],
  [/agenda|reuniao|call/, "agenda_quando"], [/link .*agenda|evento/, "agenda_link"], [/produto/, "produto"], [/valor|preco/, "valor"],
];
function sugereVariavel(cabecalho: string, disponiveis: string[]): string {
  const n = normCol(cabecalho);
  if (!n) return "";
  const exato = disponiveis.find((v) => normCol(v) === n || normCol(v).replace(/ /g, "") === n.replace(/ /g, ""));
  if (exato) return `{{${exato}}}`;
  for (const [re, v] of SINONIMOS_COLUNA) if (re.test(n) && disponiveis.includes(v)) return `{{${v}}}`;
  return "";
}
function MapaPlanilha({ s, onChange }: { s: Extract<Step, { type: "gsheet_append" }>; onChange: (v: Step) => void }) {
  const t = useContext(TesteCtx);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [avancado, setAvancado] = useState(false);
  const capturadas = Object.keys(t?.captura?.fields ?? {});
  const fixas = ["nome", "primeiro_nome", "telefone", "email", "data", "hora_min", "dia_semana", "data_hora", "produto", "valor", "link", "pix",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid",
    "agenda_quando", "agenda_link", "horarios_livres", "horario_1", "horario_2", "doc_link", "asaas_link", "asaas_pago", "tags", "data_entrada", "data_entrada_completa"];
  const disponiveis = Array.from(new Set([...capturadas, ...fixas]));
  const cabecalhos = s.cabecalhos ?? [];
  const colunas = s.colunas ?? [];
  async function lerColunas() {
    if (!s.sheetUrl.trim()) { setErro("Cole o link da planilha primeiro."); return; }
    setLendo(true); setErro("");
    try {
      const r = await jget("/api/google/sheet-headers?sheetUrl=" + encodeURIComponent(s.sheetUrl.trim()));
      const cab: string[] = (r.cabecalhos ?? []).map((x: string) => String(x));
      if (!cab.length) { setErro("A linha 1 da planilha está vazia — escreva os nomes das colunas nela e leia de novo."); setLendo(false); return; }
      // Mantém o que já estava mapeado; sugere pro que estiver em branco.
      const novas = cab.map((c, i) => (colunas[i] ?? "").trim() || sugereVariavel(c, disponiveis));
      onChange({ ...s, cabecalhos: cab, colunas: novas });
    } catch (e: any) { setErro(e?.message ?? "não consegui ler a planilha"); }
    setLendo(false);
  }
  const mexe = (i: number, v: string) => { const n = [...colunas]; while (n.length < cabecalhos.length) n.push(""); n[i] = v; onChange({ ...s, colunas: n }); };
  const ehVar = (v: string) => /^\{\{[\w.]+\}\}$/.test((v ?? "").trim());
  return (
    <div className="field">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={lerColunas} disabled={lendo}>{lendo ? "lendo…" : cabecalhos.length ? "Reler as colunas da planilha" : "📊 Ler as colunas da planilha"}</button>
        {!!cabecalhos.length && <span className="muted" style={{ fontSize: 12 }}>{cabecalhos.length} coluna(s) · escolha de onde vem cada uma</span>}
        <button type="button" className="btn" style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => setAvancado((v) => !v)}>{avancado ? "modo simples" : "modo avançado"}</button>
      </div>
      {erro && <div className="ofi-erro" style={{ marginTop: 6 }}>{erro}</div>}
      {/* UMA LINHA POR LEAD: com a chave escolhida, o passo acha a linha cuja coluna bate (telefone
          compara pelos dígitos) e ATUALIZA — célula vazia mantém o que já estava. Sem chave, acrescenta. */}
      {!!cabecalhos.length && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 12.5 }}>
          <span>Se o lead já estiver na planilha:</span>
          <select className="inp" style={{ flex: "1 1 220px" }} value={typeof s.chave === "number" ? String(s.chave) : ""}
            onChange={(e) => onChange({ ...s, chave: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">acrescentar outra linha (padrão)</option>
            {cabecalhos.map((c, i) => <option key={i} value={String(i)}>atualizar a linha onde "{c || String.fromCharCode(65 + (i % 26))}" for igual</option>)}
          </select>
        </div>
      )}
      {typeof s.chave === "number" && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>
          Uma linha por lead: a mesma linha vai sendo atualizada conforme ele avança. Coluna que este passo deixar vazia mantém o valor que já estava.
        </div>
      )}
      {!capturadas.length && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Dica: capture um exemplo no gatilho ("escutar") e as variáveis que chegaram aparecem aqui no menu.</div>
      )}
      {avancado ? (
        <>
          <textarea className="inp" style={{ minHeight: 110, fontFamily: "var(--mono)", fontSize: 12.5, marginTop: 8 }}
            value={colunas.join("\n")} onChange={(e) => onChange({ ...s, colunas: e.target.value.split("\n") })}
            placeholder={"{{nome}}\n{{telefone}}\n{{utm_source}}"} />
          <div className="muted" style={{ fontSize: 12 }}>Uma linha por coluna (A, B, C…). Aceita variáveis e texto fixo.</div>
        </>
      ) : cabecalhos.length ? (
        <div className="mapa-planilha" style={{ marginTop: 8 }}>
          {cabecalhos.map((c, i) => {
            const v = colunas[i] ?? "";
            const selVal = ehVar(v) ? v : (v ? "__texto__" : "");
            return (
              <div className="mp-linha" key={i}>
                <div className="mp-col" title={`Coluna ${String.fromCharCode(65 + (i % 26))}`}><span className="mp-letra">{String.fromCharCode(65 + (i % 26))}</span>{c || <i className="muted">(sem nome)</i>}</div>
                <div className="mp-valor">
                  <select className="inp" value={selVal} onChange={(e) => { const x = e.target.value; if (x === "__texto__") mexe(i, v && !ehVar(v) ? v : " "); else mexe(i, x); }}>
                    <option value="">— deixar vazio —</option>
                    {disponiveis.map((d) => <option key={d} value={`{{${d}}}`}>{d}{capturadas.includes(d) ? "" : " (do fluxo)"}</option>)}
                    <option value="__texto__">texto fixo…</option>
                  </select>
                  {selVal === "__texto__" && <input className="inp" value={v.trim() === "" ? "" : v} placeholder="texto fixo" onChange={(e) => mexe(i, e.target.value || " ")} />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Clique em <b>Ler as colunas da planilha</b>: o nó traz os nomes da linha 1 e você só escolhe, coluna por coluna, qual dado entra nela.</div>
      )}
    </div>
  );
}

function CamposWebhook({ s, onChange }: { s: Extract<Step, { type: "webhook_out" }>; onChange: (v: Step) => void }) {
  const campos = s.campos && s.campos.length ? s.campos : [];
  const [testando, setTestando] = useState(false);
  const [res, setRes] = useState<null | { ok: boolean; status: number; ms?: number; resposta?: string; erro?: string; enviado?: Record<string, string> }>(null);

  const mexe = (i: number, parte: "chave" | "valor", v: string) =>
    onChange({ ...s, campos: campos.map((c, j) => (j === i ? { ...c, [parte]: v } : c)) });
  const remove = (i: number) => onChange({ ...s, campos: campos.filter((_, j) => j !== i) });
  const adiciona = () => onChange({ ...s, campos: [...campos, { chave: "", valor: "" }] });
  const restaura = () => onChange({ ...s, campos: CAMPOS_WEBHOOK_PADRAO.map((c) => ({ ...c })) });

  const corpoTeste = Object.fromEntries(
    campos.filter((c) => c.chave.trim()).map((c) => [c.chave.trim(), valorDeTeste(c.valor)]),
  );

  async function testar() {
    setTestando(true); setRes(null);
    try {
      const d = await jsend("/api/flow-webhook-test", "POST", {
        url: s.url,
        campos: campos.filter((c) => c.chave.trim()).map((c) => ({ chave: c.chave.trim(), valor: valorDeTeste(c.valor) })),
      });
      setRes(d as any);
    } catch (e: any) {
      setRes({ ok: false, status: 0, erro: e.message });
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="field">
      <label>O que mandar pro outro sistema</label>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Cada linha vira um campo do JSON. À esquerda o <b>nome do campo</b> (como o outro sistema espera receber);
        à direita <b>o que vai dentro</b> — escolha uma variável na setinha e o motor preenche com o dado real do lead.
      </div>

      <div className="wh-campos">
        <div className="wh-cab"><span>Nome do campo</span><span>Valor que vai ser enviado</span><span /></div>
        {campos.length === 0 && (
          <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>Nenhum campo — adicione pelo menos um.</div>
        )}
        {campos.map((c, i) => (
          <div className="wh-linha" key={i}>
            <input className="inp" value={c.chave} placeholder="nome" onChange={(e) => mexe(i, "chave", e.target.value)} />
            <div className="wh-valor">
              <input className="inp" value={c.valor} placeholder="{{nome}} ou um texto fixo" onChange={(e) => mexe(i, "valor", e.target.value)} />
              <select className="inp wh-sel" value="" title="Escolher uma variável" onChange={(e) => { if (e.target.value) mexe(i, "valor", e.target.value); }}>
                <option value="">Variável…</option>
                {VARS_WEBHOOK.map((v) => <option key={v.v} value={v.v}>{v.rotulo}</option>)}
              </select>
            </div>
            <button type="button" className="wh-x" onClick={() => remove(i)} title="Remover este campo" aria-label={"Remover o campo " + (c.chave || i + 1)}>×</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn" onClick={adiciona}>+ Adicionar campo</button>
        <button type="button" className="btn" onClick={restaura} title="Volta aos 5 campos sugeridos">Usar os campos sugeridos</button>
        <button type="button" className="btn primary" onClick={testar} disabled={testando || !s.url.trim()}
          title={s.url.trim() ? "Envia AGORA um POST de teste pro endereço acima" : "Preencha o endereço primeiro"}>
          {testando ? "Enviando…" : "Testar envio"}
        </button>
      </div>

      <div className="wh-previa">
        <div className="wh-previa-t">O teste vai mandar exatamente isto:</div>
        <pre>{JSON.stringify(corpoTeste, null, 2)}</pre>
      </div>

      {res && (
        <div className={"wh-res " + (res.ok ? "ok" : "ruim")}>
          <b>{res.ok ? `Chegou! O outro sistema respondeu ${res.status}` : res.erro ? `Não deu: ${res.erro}` : `O outro sistema recusou (${res.status})`}</b>
          {typeof res.ms === "number" && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{res.ms}ms</span>}
          {res.resposta ? <pre>{res.resposta}</pre> : null}
          {!res.ok && !res.erro && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>O endereço respondeu, mas recusou o conteúdo. Confira se os nomes dos campos são os que ele espera.</div>}
        </div>
      )}
    </div>
  );
}


// Post-it de anotação. A ALÇA no canto inferior direito muda a forma (fina de rodapé, banner
// largo, coluna alta) — o tamanho é gravado NO PASSO, então volta igual depois do reload.
// ══ REDE DE SEGURANÇA DO CANVAS ═════════════════════════════════════════════════════════════
// Se QUALQUER coisa estourar ao desenhar um nó, o React derruba a árvore inteira e a tela fica
// EM BRANCO — foi o "soltei o nó de áudio e apagou tudo" (19/08). Nada se perde de verdade (o
// fluxo salvo está no servidor e o Ctrl+Z desfaz), mas o susto é o mesmo. Aqui o erro vira uma
// mensagem com o motivo, e não um vazio: quem estiver usando sabe que não perdeu nada, e a
// próxima vez que acontecer a gente lê a causa exata em vez de adivinhar.
class CanvasSeguro extends React.Component<{ children: React.ReactNode }, { erro: string }> {
  constructor(p: { children: React.ReactNode }) { super(p); this.state = { erro: "" }; }
  static getDerivedStateFromError(e: any) { return { erro: String(e?.message ?? e) }; }
  componentDidCatch(e: any) { console.error("canvas do fluxo quebrou:", e); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ padding: 26, display: "grid", gap: 10, placeContent: "center", textAlign: "center", height: "100%" }}>
        <b style={{ fontSize: 15 }}>O desenho do fluxo travou — mas nada foi perdido.</b>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 460 }}>
          O que está salvo no servidor continua intacto. Recarregue a página pra voltar ao último
          <b> Salvar</b>. Se ainda não tinha salvo, use <b>Ctrl+Z</b> depois de recarregar não adianta —
          nesse caso refaça o último passo.
        </div>
        <code style={{ fontSize: 11.5, color: "var(--muted)", wordBreak: "break-word", maxWidth: 460 }}>{this.state.erro}</code>
        <div><button className="btn primary" onClick={() => location.reload()}>Recarregar</button></div>
      </div>
    );
  }
}

// Dados que um caminho do Agente IA guarda da conversa (viram {{variável}} no ramo) + "pode repetir".
// O modelo pronto é o do contrato e procuração do escritório (pedido de 04/10).
const DADOS_CONTRATO: Array<{ variable: string; hint?: string }> = [
  { variable: "nome_completo", hint: "nome completo da pessoa" },
  { variable: "cpf" },
  { variable: "rg" },
  { variable: "estado_civil" },
  { variable: "profissao" },
  { variable: "nacionalidade" },
  { variable: "endereco", hint: "rua, número, complemento e bairro" },
  { variable: "cep" },
  { variable: "cidade" },
  { variable: "uf", hint: "sigla do estado, 2 letras" },
  { variable: "email" },
];
function AgentPathGuardar({ guardar, repetir, onChange }: {
  guardar: Array<{ variable: string; hint?: string }>;
  repetir: boolean;
  onChange: (patch: { guardar?: Array<{ variable: string; hint?: string }>; repetir?: boolean }) => void;
}) {
  const [aberto, setAberto] = useState(guardar.length > 0);
  const set = (lista: Array<{ variable: string; hint?: string }>) => onChange({ guardar: lista });
  return (
    <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      {!aberto ? (
        <button type="button" className="btn" style={{ alignSelf: "flex-start", padding: "4px 9px", fontSize: 12 }} onClick={() => setAberto(true)}>
          + guardar dados da conversa
        </button>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Guardar dados da conversa</div>
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>
            Ao escolher este caminho, antes do ramo rodar, a IA tira das mensagens do lead os dados abaixo e grava na ficha.
            Os passos do ramo usam como <b>{"{{variável}}"}</b> (ex.: Chamada HTTP com <b>{"{{cpf}}"}</b>). O que o lead não informou fica vazio.
          </div>
          {guardar.map((c, k) => (
            <div key={k} style={{ display: "flex", gap: 6 }}>
              <input
                className="inp" style={{ flex: "0 0 38%", minWidth: 0 }} value={c.variable} placeholder="variável (ex.: cpf)"
                onChange={(e) => set(guardar.map((x, j) => (j === k ? { ...x, variable: e.target.value.replace(/[^\w]/g, "_") } : x)))}
              />
              <input
                className="inp" style={{ flex: 1, minWidth: 0 }} value={c.hint ?? ""} placeholder="dica (opcional)"
                onChange={(e) => set(guardar.map((x, j) => (j === k ? { ...x, hint: e.target.value } : x)))}
              />
              <button type="button" className="btn" style={{ flex: "none", color: "var(--crit)" }} title="Tirar este dado" onClick={() => set(guardar.filter((_, j) => j !== k))}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {guardar.length < 20 && (
              <button type="button" className="btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => set([...guardar, { variable: "", hint: "" }])}>+ dado</button>
            )}
            {guardar.length === 0 && (
              <button type="button" className="btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => set(DADOS_CONTRATO)}>usar modelo: contrato e procuração</button>
            )}
          </div>
        </>
      )}
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 12 }}>
        <input type="checkbox" checked={repetir} onChange={(e) => onChange({ repetir: e.target.checked })} style={{ marginTop: 2 }} />
        <span>Pode repetir: a agente pode escolher este caminho de novo na mesma conversa (ex.: o lead corrigiu um dado e é preciso reenviar)</span>
      </label>
    </div>
  );
}

function NotaNode({ id, d, selected }: { id: string; d: { note?: string; noteW?: number; noteH?: number }; selected?: boolean }) {
  const acts = useContext(FlowActions);
  const w = d.noteW || 210;
  const h = d.noteH || 0;
  return (
    <div className={"flow-note" + (selected ? " sel" : "")} style={{ width: w, ...(h ? { height: h } : {}) }}>
      <NodeBadges id={id} />
      <Handle type="target" position={Position.Left} />
      <div className="flow-note-head" style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="note" size={12} /> Nota</div>
      <div className="flow-note-body">{(d.note || "").trim() || "(nota vazia — clique pra escrever)"}</div>
      <Handle type="source" position={Position.Right} className="handle-main-out" />
      {acts?.onResize && (
        <NodeResizeControl
          minWidth={150}
          minHeight={70}
          onResize={(_e, p) => acts.onResize!(id, Math.round(p.width), Math.round(p.height))}
          style={{ background: "transparent", border: "none" }}
        >
          <span className="flow-note-alca" title="Arraste pra mudar o formato da nota" />
        </NodeResizeControl>
      )}
    </div>
  );
}

function StepNode({ id, data, selected }: NodeProps) {
  const d = data as { emoji: string; label: string; summary: string; kind?: string; file?: string; mediaType?: string; caption?: string; variable?: string; paths?: string[]; buttons?: string[]; note?: string; noteW?: number; noteH?: number; tplNome?: string; tplParams?: string[]; tplHeaderUrl?: string; tplMock?: { body?: string; footer?: string; header?: { formato: string; url?: string }; botoes?: Array<{ texto: string; tipo: string }>; waba?: { rotulo?: string; foto?: string } }; casos?: Array<{ rotulo: string; valor: string; op?: "igual" | "contem" }>; campoSwitch?: string; pin?: string };
  // Nota: post-it de anotação no canvas (não é enviado ao lead). Mostra o texto completo.
  if (d.kind === "note") {
    return <NotaNode id={id} d={d} selected={selected} />;
  }
  // Agente IA: conversa com o lead e escolhe um caminho — cada caminho é uma SAÍDA (handle) no canvas.
  if (d.kind === "ai_agent") {
    const paths = d.paths ?? [];
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="ai_agent" size={13} /> Agente IA</div>
          <div className="fn-label sm agent-sum">{d.summary}</div>
          {paths.length > 0 && (
            <div className="agent-paths">
              {paths.map((p) => (
                <div key={p} className="agent-path with-out">
                  {p}
                  <Handle type="source" id={"p:" + p} position={Position.Right} className="handle-out" />
                </div>
              ))}
              <div className="agent-path end with-out">
                ✓✓ encerrou
                <Handle type="source" id="ended" position={Position.Right} className="handle-out" />
              </div>
              <div className="agent-path unknown with-out">
                ? não identificou / turnos
                <Handle type="source" id="fallback" position={Position.Right} className="handle-out" />
              </div>
            </div>
          )}
          <div className="ask-warn">⚡ usa IA (OpenAI) — gasta token por turno</div>
        </div>
        {paths.length === 0 && <Handle type="source" position={Position.Right} className="handle-main-out" />}
      </div>
    );
  }
  // TEMPLATE OFICIAL: o nó É um celularzinho — o template como a pessoa recebe (mídia do topo com
  // play, corpo com as variáveis já preenchidas, rodapé e os botões). Resposta rápida ganha SAÍDA
  // por botão (o motor roteia o clique); botão de URL/ligar/copiar não gera resposta → sem saída.
  if (d.kind === "template" && d.tplMock) {
    const mk = d.tplMock as { body?: string; footer?: string; header?: { formato: string; url?: string }; botoes?: Array<{ texto: string; tipo: string }>; waba?: { rotulo?: string; foto?: string } };
    const params: string[] = d.tplParams ?? [];
    // O arquivo do PASSO manda; sem ele, a mídia de exemplo do template.
    const midiaUrl = d.tplHeaderUrl || mk.header?.url;
    const corpo = String(mk.body ?? "").replace(/\{\{(\d+)\}\}/g, (_m, i) => (params[Number(i) - 1] || "").trim() || `{{${i}}}`);
    let qr = -1; // índice da resposta rápida (handle "b0","b1"… conta SÓ as respostas rápidas)
    return (
      <div className={"flow-node step tpl-fone-node" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div className="tplnode-topo">
          {mk.waba?.foto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img loading="lazy" decoding="async" className="tplnode-ava" src={mk.waba.foto} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="tplnode-ava tplnode-ava-ini">{(mk.waba?.rotulo ?? "A").slice(0, 1).toUpperCase()}</span>
          )}
          <span className="tplnode-conta">
            <b>{mk.waba?.rotulo ?? "Conta oficial"}</b>
            <em>template: {d.tplNome}</em>
          </span>
        </div>
        <div className="tplnode-chat">
          <div className="fone-balao">
            {mk.header?.formato === "IMAGE" && midiaUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img loading="lazy" decoding="async" className="fone-img" src={midiaUrl} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
            {mk.header?.formato === "VIDEO" && <FoneVideo src={midiaUrl} />}
            {mk.header?.formato === "DOCUMENT" && <div className="fone-video">Documento</div>}
            <div className="fone-corpo">{corpo || <span style={{ color: "#999" }}>(sem corpo)</span>}</div>
            {mk.footer && <div className="fone-rodape">{mk.footer}</div>}
            {(mk.botoes ?? []).length > 0 && (
              <div className="fone-botoes">
                {(mk.botoes ?? []).map((b, i) => {
                  const ehQr = b.tipo === "resposta";
                  if (ehQr) qr++;
                  return (
                    <div key={i} className={"fone-botao tplnode-botao" + (ehQr ? " with-out" : "")}>
                      {b.tipo === "url" ? "↗ " : b.tipo === "telefone" ? "☎ " : b.tipo === "copiar" ? "⧉ " : ""}{b.texto}
                      {ehQr && <SaidaStat nodeId={id} saida={b.texto} />}
                      {ehQr && <Handle type="source" id={"b" + qr} position={Position.Right} className="handle-out" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* Porta "Falhou" (13/10): o envio do template deu erro (bloqueado, número inválido, Meta
            recusou) → segue por aqui com {{erro_envio}}. Sem fio ligado, o fluxo segue como sempre. */}
        <div className="agent-paths" style={{ marginTop: 4 }}>
          <div className="agent-path btn-out with-out pg-nao">
            <span className="ap-txt">Falhou</span>
            <SaidaStat nodeId={id} saida="falha" />
            <Handle type="source" id="falha" position={Position.Right} className="handle-out" />
          </div>
        </div>
        <Handle type="source" position={Position.Right} className="handle-main-out" />
      </div>
    );
  }
  // Loop: nó de DECISÃO com duas saídas — "cada item" (o ramo que roda por item) e "concluído"
  // (o fluxo original segue). Mesmo desenho do Switch, porque o comportamento é o mesmo: o dado
  // escolhe por onde vai.
  if (d.kind === "loop") {
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}>🔁 Loop</div>
          <div className="fn-label sm">{d.summary}</div>
          <div className="agent-paths">
            <div className="agent-path btn-out with-out">
              <span className="ap-txt">cada item</span>
              <SaidaStat nodeId={id} saida="item" />
              <SaidaSemFio nodeId={id} handle="item" />
              <Handle type="source" id="item" position={Position.Right} className="handle-out" />
            </div>
            <div className="agent-path with-out">
              <span className="ap-txt">concluído</span>
              <SaidaStat nodeId={id} saida="done" />
              <Handle type="source" id="done" position={Position.Right} className="handle-out" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Switch: uma variável, N saídas por valor — cada CASO é uma linha com sua própria bolinha à
  // direita (igual ao nó Switch do n8n). O que não casar sai por "Nenhum caso bateu".
  if (d.kind === "switch") {
    const casos = (d.casos ?? []).filter((c) => c?.rotulo?.trim());
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}>🔀 Switch</div>
          <div className="fn-label sm">{d.campoSwitch ? `campo: ${d.campoSwitch}` : d.summary}</div>
          <div className="agent-paths">
            {casos.length === 0 && <div className="agent-path unknown">sem casos — adicione no editor</div>}
            {casos.map((c, i) => (
              <div key={i} className="agent-path btn-out with-out">
                <span className="ap-txt">{c.rotulo}</span>
                <SaidaStat nodeId={id} saida={"c" + i} />
                <SaidaSemFio nodeId={id} handle={"c" + i} />
                <Handle type="source" id={"c" + i} position={Position.Right} className="handle-out" />
              </div>
            ))}
            <div className="agent-path with-out">
              <span className="ap-txt">Nenhum caso bateu</span>
              <SaidaStat nodeId={id} saida="default" />
              <SaidaSemFio nodeId={id} handle="default" />
              <Handle type="source" id="default" position={Position.Right} className="handle-out" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Consulta de pagamento: nó de DECISÃO — duas saídas (Pagou / Não pagou). Não envia nada.
  // JANELA e CONDIÇÃO: nós de DECISÃO — duas saídas, não enviam nada (mesmo desenho do pagamento).
  if (d.kind === "window" || d.kind === "condition") {
    const ehJanela = d.kind === "window";
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {ehJanela ? "🕐 Janela de conversa" : "🔀 Condição"}
          </div>
          <div className="fn-label sm">{d.summary}</div>
          <div className="agent-paths">
            <div className="agent-path btn-out with-out pg-sim">
              <span className="ap-txt">{ehJanela ? "Aberta" : "Sim"}</span>
              <SaidaStat nodeId={id} saida={ehJanela ? "aberta" : "sim"} />
              <SaidaSemFio nodeId={id} handle={ehJanela ? "aberta" : "sim"} />
              <Handle type="source" id={ehJanela ? "aberta" : "sim"} position={Position.Right} className="handle-out" />
            </div>
            <div className="agent-path btn-out with-out pg-nao">
              <span className="ap-txt">{ehJanela ? "Fechada" : "Não"}</span>
              <SaidaStat nodeId={id} saida={ehJanela ? "fechada" : "nao"} />
              <SaidaSemFio nodeId={id} handle={ehJanela ? "fechada" : "nao"} />
              <Handle type="source" id={ehJanela ? "fechada" : "nao"} position={Position.Right} className="handle-out" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (d.kind === "payment_check") {
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="card" size={13} /> Consulta pagamento</div>
          <div className="fn-label sm">{d.summary}</div>
          <div className="agent-paths">
            <div className="agent-path btn-out with-out pg-sim">
              <span className="ap-txt">Pagou</span>
              <SaidaStat nodeId={id} saida="pago" />
              <Handle type="source" id="pago" position={Position.Right} className="handle-out" />
            </div>
            <div className="agent-path btn-out with-out pg-nao">
              <span className="ap-txt">Não pagou</span>
              <SaidaStat nodeId={id} saida="nao_pago" />
              <Handle type="source" id="nao_pago" position={Position.Right} className="handle-out" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Botões: cada botão é uma SAÍDA (handle) — liga cada um no que deve acontecer se o lead escolher.
  if (d.kind === "buttons") {
    const btns = d.buttons ?? [];
    return (
      <div className={"flow-node step agent" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="fn-kind" style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="buttons" size={13} /> Botões</div>
          <div className="fn-label sm">{d.summary}</div>
          <div className="agent-paths">
            {btns.map((b, i) => (
              <div key={i} className="agent-path btn-out with-out">
                <span className="ap-txt">{b}</span>
                <SaidaStat nodeId={id} saida={b} />
                <SaidaSemFio nodeId={id} handle={"b" + i} />
                <Handle type="source" id={"b" + i} position={Position.Right} className="handle-out" />
              </div>
            ))}
            {btns.length === 0 && <div className="agent-path unknown">sem botões</div>}
          </div>
          {/* NENHUM ramo ligado = o motor nem espera o clique (ver `temRamo` no runner): ele manda
              os botões e segue reto. É o aviso mais importante deste nó. */}
          {btns.length > 0 && <BotoesSemEspera nodeId={id} n={btns.length} />}
        </div>
        {btns.length === 0 && <Handle type="source" position={Position.Right} className="handle-main-out" />}
      </div>
    );
  }
  // Perguntar & capturar (IA): destaca a variável capturada + aviso de custo de token.
  if (d.kind === "ask") {
    return (
      <div className={"flow-node step ask" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div className="fn-emoji"><Icon name="ask" size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="fn-kind">Perguntar → <span className="ask-var">{`{{${d.variable || "?"}}}`}</span></div>
          <div className="fn-label sm">{d.summary}</div>
          <div className="ask-warn">⚡ usa IA pra entender a resposta (gasta token)</div>
        </div>
        <Handle type="source" position={Position.Right} className="handle-main-out" />
      </div>
    );
  }
  // Vídeo bolinha (PTV): moldura REDONDA com o vídeo tocando mudo + botão de desmutar.
  if (d.kind === "ptv") {
    return (
      <div className={"flow-ptv" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <div className="ptv-circle">
          {d.file ? <NodeVideo src={d.file} round /> : <span className="ptv-empty">🎥</span>}
          {!d.file && <span className="ptv-badge">🎥</span>}
        </div>
        <div className="ptv-label">Vídeo bolinha{d.file ? "" : " · sem vídeo"}</div>
        <Handle type="source" position={Position.Right} className="handle-main-out" />
      </div>
    );
  }
  // Mídia com preview embutido: imagem aparece no nó; vídeo toca mudo com botão de desmutar.
  const isImg = d.kind === "media" && d.mediaType === "image" && !!d.file;
  const isVid = d.kind === "media" && d.mediaType === "video" && !!d.file;
  if (isImg || isVid) {
    return (
      <div className={"flow-node step media" + (selected ? " sel" : "")}>
        <NodeBadges id={id} />
        <NodeStat id={id} />
        <Handle type="target" position={Position.Left} />
        <MediaThumb file={d.file!} isVideo={isVid} />
        <div style={{ minWidth: 0 }}>
          <div className="fn-kind">{d.label}</div>
          <div className="fn-label sm">{d.summary}</div>
          {/* A LEGENDA que vai embaixo da mídia no WhatsApp — visível aqui pra conferir sem
              abrir o passo. Sem legenda, não ocupa espaço. */}
          {d.caption?.trim() ? <div className="fn-legenda" title={d.caption}>{d.caption}</div> : null}
        </div>
        <Handle type="source" position={Position.Right} className="handle-main-out" />
      </div>
    );
  }
  return (
    <div className={"flow-node step" + (selected ? " sel" : "")}>
      <NodeBadges id={id} />
      <NodeStat id={id} />
      <Handle type="target" position={Position.Left} />
      <div className="fn-emoji" style={{ color: corDoPasso(d.kind ?? "") }}><Icon name={stepIcon(d.kind ?? "")} size={20} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="fn-kind">{d.label}</div>
        <div className="fn-label sm">{d.summary}</div>
      </div>
      <PinoN8n dados={d.pin} />
      <Handle type="source" position={Position.Right} className="handle-main-out" />
    </div>
  );
}
const nodeTypes = { trigger: TriggerNode, step: StepNode };

// O × da aresta com listener NATIVO no próprio elemento. O handler sintético do React dispara na
// RAIZ da árvore (delegação) — e o canvas, que fica no meio do caminho, processava o pointerdown
// primeiro e podia matá-lo (desselecionando a aresta e desmontando o botão antes do click). O
// listener nativo dispara NO botão, antes de qualquer outra coisa no caminho — não tem corrida.
function BotaoDelEdge({ x, y, onDel }: { x: number; y: number; onDel: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const cb = useRef(onDel);
  cb.current = onDel;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const age = (e: Event) => { e.stopPropagation(); e.preventDefault(); cb.current(); };
    el.addEventListener("pointerdown", age);
    el.addEventListener("click", age); // teclado (Enter vira click) e navegador sem pointer events
    return () => { el.removeEventListener("pointerdown", age); el.removeEventListener("click", age); };
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      className="edge-del nodrag nopan"
      style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${x}px,${y}px)`, pointerEvents: "all" }}
      title="Apagar conexão"
    >×</button>
  );
}

// Aresta com botão × pra APAGAR a conexão. Dois detalhes que custaram caro (relato do dono, 20/08):
//
// 1. A AÇÃO RODA NO pointerdown, não no click. O botão vive num portal FORA do <path> da aresta:
//    o mousedown nele chegava ao "chão" do canvas, o React Flow DESSELECIONAVA a aresta, o botão
//    desmontava — e o click, que só dispara no mouseup, nunca acontecia. Clicava no × e nada.
//
// 2. O × fica no MEIO DO COMPRIMENTO da linha, medido de verdade (getPointAtLength). O ponto t=0,5
//    da bezier que o getBezierPath devolve NÃO é o meio visual — em curva saindo de lado e entrando
//    por cima ele cai deslocado, e o × parecia largado fora do centro.
function DelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const onDel = (data as { onDelete?: (id: string) => void } | undefined)?.onDelete;
  const medidor = useRef<SVGPathElement | null>(null);
  const [meio, setMeio] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = medidor.current;
    if (!el) return;
    try {
      const p = el.getPointAtLength(el.getTotalLength() / 2);
      setMeio({ x: p.x, y: p.y });
    } catch { setMeio(null); } // SVG fora do DOM num frame de transição → cai no ponto da bezier
  }, [path]);
  const cx = meio?.x ?? labelX;
  const cy = meio?.y ?? labelY;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ strokeDasharray: "5 4", strokeWidth: selected ? 2.5 : 1.5 }} />
      {/* path fantasma só pra MEDIR o comprimento (não desenha nem captura mouse) */}
      <path ref={medidor} d={path} fill="none" stroke="none" style={{ pointerEvents: "none" }} />
      {onDel && selected && (
        <EdgeLabelRenderer>
          <BotaoDelEdge x={cx} y={cy} onDel={() => onDel(id)} />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { del: DelEdge };

// Arestas lineares (a "espinha" trigger → s0 → s1 → …) quando o fluxo ainda não foi ramificado.
function linearEdges(steps: Step[]): FlowEdge[] {
  return steps.map((s, i) => ({ id: "e" + i, source: i === 0 ? "trigger" : steps[i - 1]._id ?? "s" + (i - 1), target: s._id ?? "s" + i }));
}
const newEdgeId = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ENCAIXAR UM NÓ NO MEIO DE UMA LIGAÇÃO (arrastou e soltou em cima da seta).
// Lógica PURA (fora do componente pra poder testar): recebe as arestas atuais, o nó arrastado e a
// aresta onde ele foi solto; devolve as arestas novas. Faz 3 coisas:
//   1. corta a aresta A→B e liga A→nó→B (preservando o handle de saída de A: botão, caminho da IA…);
//   2. RECOSTURA o buraco que o nó deixou: se ele estava entre X e Y (1 entrada e 1 saída), liga
//      X→Y — senão o fluxo ficaria com o nó pendurado em dois lugares ao mesmo tempo;
//   3. limpa duplicata (se A→nó ou nó→B já existiam).
export function religarNoMeio(edges: FlowEdge[], nodeId: string, edgeId: string): FlowEdge[] | null {
  const alvo = edges.find((e) => e.id === edgeId);
  if (!alvo || alvo.source === nodeId || alvo.target === nodeId) return null; // já é ponta dessa seta
  const semAlvo = edges.filter((e) => e.id !== edgeId);
  const entradas = semAlvo.filter((e) => e.target === nodeId);
  const saidas = semAlvo.filter((e) => e.source === nodeId);
  let resto = semAlvo;
  const costura: FlowEdge[] = [];
  if (entradas.length === 1 && saidas.length === 1 && entradas[0].source !== saidas[0].target) {
    resto = resto.filter((e) => e !== entradas[0] && e !== saidas[0]);
    costura.push({ id: newEdgeId(), source: entradas[0].source, sourceHandle: entradas[0].sourceHandle ?? null, target: saidas[0].target });
  }
  resto = resto.filter(
    (e) =>
      // duplicata (a ligação que vamos criar já existia)
      !(e.source === alvo.source && e.target === nodeId) && !(e.source === nodeId && e.target === alvo.target) &&
      // CICLO: mover o nó pra frente na fila deixava A→nó→B junto com B→nó (o fluxo voltava e
      // rodava em looping). Some com a ligação antiga entre o nó e as pontas da seta cortada.
      !(e.source === alvo.target && e.target === nodeId) && !(e.source === nodeId && e.target === alvo.source),
  );
  return [
    ...resto,
    ...costura,
    { id: newEdgeId(), source: alvo.source, sourceHandle: alvo.sourceHandle ?? null, target: nodeId },
    { id: newEdgeId(), source: nodeId, sourceHandle: null, target: alvo.target },
  ];
}

// Wrapper com o provider — necessário pro useReactFlow (screenToFlowPosition) funcionar fora do <ReactFlow>.
export function FlowBuilder({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner id={id} />
    </ReactFlowProvider>
  );
}

function FlowBuilderInner({ id }: { id: string }) {
  const router = useRouter();
  const rf = useReactFlow();
  const { session } = useAuth();
  const isAdmin = session?.user.role === "admin"; // gatilhos de Afiliado são da operação do dono
  const { accounts: contasDoWs } = useAccounts(); // pro número do fluxo no nó do gatilho
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [all, setAll] = useState<Automation[] | null>(null);
  const [auto, setAuto] = useState<Automation | null>(null);
  // NÓ DE TEMPLATE SEM RETRATO (criado por importação/script, ou antes do mockup existir): ao abrir o
  // fluxo, busca o template aprovado e completa a miniatura (imagem, corpo, botões). Só visual —
  // as ligações não mudam. Pedido do dono (13/10): "se tem nó de template, tem que aparecer a miniatura".
  const retratoFeito = useRef(false);
  useEffect(() => {
    if (!auto || retratoFeito.current) return;
    const faltam = (auto.steps ?? []).some((s: any) => s?.type === "template" && s.templateName && !s.mock);
    if (!faltam) return;
    retratoFeito.current = true;
    jget("/api/meta/templates").then((d) => {
      const tpls: TplDoEditor[] = d?.templates ?? [];
      const wabas: Array<{ rotulo: string; foto?: string }> = d?.wabas ?? [];
      const w = wabas[0];
      setAuto((a) => a && ({ ...a, steps: a.steps.map((s: any) => {
        if (s?.type !== "template" || s.mock || !s.templateName) return s;
        const t = tpls.find((x) => x.name === s.templateName && (!s.language || x.language === s.language)) ?? tpls.find((x) => x.name === s.templateName);
        if (!t) return s;
        const r = retratoDoTemplate(t, w ? { rotulo: w.rotulo, foto: w.foto } : undefined);
        return { ...s, mock: r.mock, botoes: s.botoes?.length ? s.botoes : r.botoes };
      }) } as Automation));
    }).catch(() => {});
  }, [auto]);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null); // null = nada selecionado (painel some); -1 = gatilho; 0..n-1 = passo
  const [status, setStatus] = useState("");
  // O que IMPEDE a publicação (campo vazio no gatilho, evento não marcado…). Fica numa faixa
  // vermelha até a pessoa resolver — statuszinho cinza ao lado do botão ninguém lê.
  const [bloqueio, setBloqueio] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // limpa o "salvo!" — não pode disparar no meio de outro save
  const [testing, setTesting] = useState(false);
  const { groupList, refresh: refreshGroups, refreshing: refreshingGroups, groupsErr } = useGroupList();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Posições LIVRES dos nós (o usuário arrasta e solta onde quiser). Chave = _id do passo (ou "trigger").
  // Persistidas no campo `layout` da automação. Sem posição salva → cai no layout linear padrão.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [recent, setRecent] = useState<string[]>([]);
  // Menu de nós que abre ao puxar da ponta de um nó (conexão solta no vazio).
  const [picker, setPicker] = useState<{ source: string; sourceHandle: string | null; flowPos: { x: number; y: number }; screen: { x: number; y: number } } | null>(null);
  // Dados que o gatilho "empurrou" pra frente (play manual). Vivem só no editor.
  const [dadosGatilho, setDadosGatilho] = useState<{ dados: DadoDoGatilho[]; origem: string } | null>(null);

  // ── TESTE DE PERCURSO ──────────────────────────────────────────────────────────────────────
  // A captura do gatilho de webhook mora AQUI (não dentro do painel do gatilho): o teste roda no
  // canvas inteiro e o painel pode estar fechado. O painel lê/edita pelo mesmo contexto.
  // Largura do painel lateral: o valor de um webhook (URL, XML do rastreador) não cabe em 340px e
  // a pessoa não consegue LER o que está configurando. Arrastar a borda resolve todos os campos de
  // uma vez. É preferência cosmética — pode viver no navegador.
  const [larguraPainel, setLarguraPainel] = useState(420);
  const larguraRef = useRef(420);
  useEffect(() => {
    try { const v = Number(localStorage.getItem("zc-painel-w")); if (v >= 280 && v <= 980) { setLarguraPainel(v); larguraRef.current = v; } } catch { /* sem storage */ }
  }, []);
  function arrastaLargura(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = larguraRef.current;
    const mover = (ev: MouseEvent) => {
      const w = Math.min(980, Math.max(280, w0 + (x0 - ev.clientX)));
      larguraRef.current = w; setLarguraPainel(w);
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      try { localStorage.setItem("zc-painel-w", String(larguraRef.current)); } catch { /* sem storage */ }
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  }

  // Recursos que dependem de liberação do super admin (hoje: o nó de código). A lista some da
  // paleta pra quem não tem — mas quem barra de verdade é o motor, não esta linha.
  const [featuresLib, setFeaturesLib] = useState<string[]>([]);
  useEffect(() => {
    jget("/api/features").then((d) => setFeaturesLib(d.liberadas ?? [])).catch(() => setFeaturesLib([]));
  }, []);

  const [captura, setCaptura] = useState<EspiadaWebhook | null>(null);
  const [teste, setTeste] = useState<EstadoTeste | null>(null);
  const [testeAviso, setTesteAviso] = useState("");
  useEffect(() => {
    if (!auto || (auto.trigger !== "webhook" && auto.trigger !== "checkout")) { setCaptura(null); return; }
    // O exemplo GRAVADO NO FLUXO é a base — sobrevive a recarregar a página e a deploy.
    const salvo = (auto as Automation).exemploWebhook ?? null;
    setCaptura(salvo as EspiadaWebhook | null);
    let vivo = true;
    // A escuta em memória do motor só sobrepõe se for MAIS NOVA (POST de verdade que acabou de
    // chegar) — senão um exemplo colado hoje seria substituído por uma captura velha.
    jget(`/api/flow-webhook-last?automationId=${encodeURIComponent(auto.id)}&since=0`)
      .then((r) => { if (vivo && r.event && (!salvo || r.event.at > salvo.at)) guardaCaptura(r.event); })
      .catch(() => { /* fluxo ainda não salvo / sem captura */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto?.id, auto?.trigger]);

  // Toda captura que aparece na tela (colada, editada ou vinda da escuta) é gravada NO FLUXO.
  // Endpoint próprio: guardar dado de teste não deve virar uma versão no histórico do fluxo.
  function guardaCaptura(c: EspiadaWebhook | null) {
    setCaptura(c);
    if (!auto) return;
    jsend("/api/flow-webhook-example", "POST", { automationId: auto.id, exemplo: c }).catch(() => { /* melhor esforço */ });
  }
  // Trocar de fluxo zera o teste (o percurso é daquele grafo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTeste(null); setTesteAviso(""); }, [auto?.id]);

  const arestasDoTeste = (): FlowEdge[] => (auto ? (Array.isArray(auto.edges) ? auto.edges : linearEdges(auto.steps)) : []);
  const passoPorId = (nid: string): Step | null => auto?.steps.find((s) => s._id === nid) ?? null;
  const armaNo = (nodeId: string, fields: Record<string, string>) =>
    ({ nodeId, passo: avaliaNoTeste(nodeId === "trigger" ? null : passoPorId(nodeId), fields, arestasDoTeste(), nodeId) });

  // Roda O NÓ DA VEZ e arma o seguinte. `handle` só vem quando a escolha foi sua (botão, janela…).
  function avancaTeste(t: EstadoTeste, nodeId: string, handle?: string): EstadoTeste {
    if (!t.armado || t.armado.nodeId !== nodeId) return t;
    const h = handle ?? t.armado.passo.handle;
    const rotulo = handle ? (t.armado.passo.escolhas?.find((o) => o.handle === handle)?.rotulo ?? t.armado.passo.rotulo) : t.armado.passo.rotulo;
    const feitos = { ...t.feitos, [nodeId]: { ...t.armado.passo, handle: h, rotulo, escolhas: undefined } };
    const ordem = [...t.ordem, nodeId];
    if (ordem.length > 80) return { ...t, feitos, ordem, armado: null, fim: "Parei em 80 passos — parece que o fluxo tem um laço.", parada: { nodeId, motivo: "laço no fluxo" } };
    const prox = proximoNoTeste(arestasDoTeste(), nodeId, h);
    if (!prox) {
      // Saída COM NOME escolhida (switch, condição, botão…) e sem fio = o teste EMPACOU: o dado
      // chegou e não tem pra onde ir. Sem handle é só o fim natural do ramo — não é erro.
      if (h) {
        const motivo = motivoDaParada(nodeId === "trigger" ? null : passoPorId(nodeId), feitos[nodeId]);
        return { ...t, feitos, ordem, armado: null, fim: motivo, parada: { nodeId, motivo } };
      }
      return { ...t, feitos, ordem, armado: null, fim: "Fim do caminho — este era o último passo deste ramo." };
    }
    if (t.feitos[prox]) return { ...t, feitos, ordem, armado: null, fim: "O caminho voltou pra um passo que já rodou — parei aqui.", parada: { nodeId, motivo: "o caminho voltou pra trás" } };
    return { ...t, feitos, ordem, armado: armaNo(prox, t.fields) };
  }
  // No modo "testar tudo" segue sozinho enquanto a decisão não for do lead.
  const corridaAuto = (t: EstadoTeste): EstadoTeste => {
    let cur = t;
    for (let i = 0; i < 80 && cur.armado && !cur.armado.passo.escolhas?.length; i++) cur = avancaTeste(cur, cur.armado.nodeId);
    return cur;
  };
  function novoTeste(automatico: boolean): EstadoTeste | null {
    const fields = captura?.fields ?? {};
    if (!Object.keys(fields).length) {
      setTesteAviso("Pra testar o caminho o fluxo precisa de um exemplo de dados. Clique no nó do gatilho e use \"escutar\" (pra receber um POST de verdade) ou \"cole um exemplo do JSON\".");
      return null;
    }
    setTesteAviso("");
    return { fields, feitos: {}, ordem: [], fim: null, parada: null, automatico, armado: armaNo("trigger", fields) };
  }

  // Fios que o teste PERCORREU (pra pintar o caminho no canvas).
  const fiosDoTeste = useMemo(() => {
    const s = new Set<string>();
    if (!teste || !auto) return s;
    const arestas = Array.isArray(auto.edges) ? auto.edges : linearEdges(auto.steps);
    for (const [nodeId, p] of Object.entries(teste.feitos)) {
      const e = (p.handle && arestas.find((x) => x.source === nodeId && (x.sourceHandle ?? "") === p.handle))
        || arestas.find((x) => x.source === nodeId && !x.sourceHandle);
      if (e) s.add(e.id);
    }
    return s;
  }, [teste, auto]);
  const [rodandoPasso, setRodandoPasso] = useState<string | null>(null);
  // ▶ no nó = EXECUTA DE VERDADE no motor com os dados do teste (planilha recebe a linha, agenda
  // recebe o evento, WhatsApp de teste recebe a mensagem). O motor devolve o próximo nó e os campos
  // que o passo produziu ({{agenda_link}}, {{horarios_livres}}…), que entram no teste. Pedido do
  // Admin, 15/09: "o play envia os dados pro próximo nó". Continua SIMULAÇÃO só quando: é o
  // gatilho, você escolheu um ramo na mão (botão/IA/janela), ou está no "testar tudo".
  const playTeste = (nodeId: string, handle?: string) => {
    const t = teste;
    if (!t || !auto || handle || nodeId === "trigger" || t.automatico) {
      setTeste((cur) => { if (!cur) return cur; const n = avancaTeste(cur, nodeId, handle); return n.automatico ? corridaAuto(n) : n; });
      return;
    }
    if (!t.armado || t.armado.nodeId !== nodeId || rodandoPasso) return;
    setRodandoPasso(nodeId); setTesteAviso("");
    jsend("/api/automations/executar-passo", "POST", { automationId: auto.id, nodeId, fields: t.fields })
      .then((r: { proximo: string | null; pausou: boolean; log?: string[]; fields?: Record<string, string> }) => {
        setTeste((cur) => {
          if (!cur?.armado || cur.armado.nodeId !== nodeId) return cur;
          const fields = { ...cur.fields, ...(r.fields ?? {}) };
          const detalhe = (r.log ?? []).join("\n");
          const passo: PassoTeste = { handle: cur.armado.passo.handle, rotulo: r.pausou ? "enviado · aguardando o lead" : "executado", detalhe };
          const feitos = { ...cur.feitos, [nodeId]: passo };
          const ordem = [...cur.ordem, nodeId];
          if (r.pausou) return { ...cur, fields, feitos, ordem, armado: null, fim: "Este passo ficou esperando a resposta do lead no WhatsApp de teste. Quando ele responder, o resto do fluxo segue sozinho, de verdade." };
          if (!r.proximo) return { ...cur, fields, feitos, ordem, armado: null, fim: "Fim do caminho — este era o último passo deste ramo." };
          if (cur.feitos[r.proximo]) return { ...cur, fields, feitos, ordem, armado: null, fim: "O caminho voltou pra um passo que já rodou — parei aqui.", parada: { nodeId, motivo: "o caminho voltou pra trás" } };
          return { ...cur, fields, feitos, ordem, armado: armaNo(r.proximo, fields) };
        });
      })
      .catch((e: any) => setTesteAviso("Falhou ao executar o passo: " + (e?.message ?? e)))
      .finally(() => setRodandoPasso(null));
  };
  const iniciaTestePasso = () => { const t = novoTeste(false); if (t) setTeste(t); };
  const iniciaTesteTudo = () => { const t = novoTeste(true); if (t) setTeste(corridaAuto(t)); };

  // Quais fios CARREGAM os dados: tudo que é alcançável a partir do gatilho. Verde = "por aqui
  // passou o evento que você capturou" — é o rastro visual do play manual.
  const fiosComDados = useMemo(() => {
    if (!dadosGatilho || !auto) return new Set<string>();
    const arestas = Array.isArray(auto.edges) ? auto.edges : linearEdges(auto.steps);
    const marcadas = new Set<string>();
    const vistos = new Set<string>(["trigger"]);
    let fila = ["trigger"];
    while (fila.length) {
      const prox: string[] = [];
      for (const nid of fila) {
        for (const e of arestas) {
          if (e.source !== nid || marcadas.has(e.id)) continue;
          marcadas.add(e.id);
          if (!vistos.has(e.target)) { vistos.add(e.target); prox.push(e.target); }
        }
      }
      fila = prox;
    }
    return marcadas;
  }, [dadosGatilho, auto]);

  // Seta que vai receber o nó quando ele for solto (acende durante o arraste).
  const [arestaAlvo, setArestaAlvo] = useState<string | null>(null);
  const connectSource = useRef<{ nodeId: string; handleId: string | null } | null>(null);
  // Funil por nó (stats reais do motor).
  const [stats, setStats] = useState<FlowStats | null>(null);
  const [statsPeriod, setStatsPeriod] = useState("7d");
  const [customRange, setCustomRange] = useState<{ since?: string; until?: string }>({});
  const [leadsNode, setLeadsNode] = useState<string | null>(null); // nó cujos leads o popup está mostrando
  const [statsLoading, setStatsLoading] = useState(false);
  const [recarregaStats, setRecarregaStats] = useState(0); // muda → refaz a consulta do funil

  useEffect(() => {
    setRecent(loadRecent());
    jget("/api/automations")
      .then((d) => {
        const list: Automation[] = d.automations ?? [];
        setAll(list);
        const a = list.find((x) => x.id === id);
        if (!a) setNotFound(true);
        else {
          // Backfill de _id nos passos antigos (salvos antes dos ids estáveis).
          // ⚠️ O id tem que ser "s<índice>", NÃO um aleatório: é exatamente o que o MOTOR usa
          // quando o passo não tem _id (`idOf` em engine/graph.ts). Com id aleatório, o motor
          // gravava o funil em "s0" e a tela procurava em "s_uuid…" — o nó ficava 0% PARA SEMPRE,
          // e como o backfill não marca o fluxo como sujo, o id nem chegava a ser salvo: mudava a
          // cada recarga. Foi o que deixou a Etiqueta zerada enquanto o passo seguinte marcava
          // 100% (Admin, 24/08).
          const withIds: Automation = { ...a, steps: a.steps.map((s, i) => (s._id ? s : { ...s, _id: "s" + i })) };
          setAuto(withIds);
          setPositions(a.layout ?? {});
          salvoRef.current = impressao(withIds, a.layout ?? {});
        }
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  // Busca o funil (quantos passaram por nó) quando muda o período. Personalizado só busca com as 2 datas.
  useEffect(() => {
    if (statsPeriod === "custom" && !(customRange.since && customRange.until)) return;
    const { since, until } = periodRange(statsPeriod, customRange);
    const qs = new URLSearchParams({ automationId: id });
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    let alive = true;
    setStatsLoading(true);
    jget("/api/flow-stats?" + qs.toString())
      .then((d) => { if (alive) setStats(d as FlowStats); })
      .catch(() => { if (alive) setStats(null); })
      .finally(() => { if (alive) setStatsLoading(false); });
    return () => { alive = false; };
  }, [id, statsPeriod, customRange, recarregaStats]);

  useEffect(() => {
    if (!auto) return;
    const t = TRIGGERS[auto.trigger] ?? { label: auto.trigger, emoji: "•" };
    const ns: Node[] = [
      { id: "trigger", type: "trigger", position: positions["trigger"] ?? { x: 60, y: 0 }, data: { emoji: t.emoji, label: auto.trigger === "checkout" ? "Checkout (venda)" : auto.trigger === "template_reply" && auto.templateName ? `Respondeu: ${auto.templateName}` : t.label, trigger: auto.trigger, eventos: auto.eventos ?? [], botoesGatilho: auto.botoesGatilho ?? [], tplNome: auto.templateName, mockGatilho: auto.trigger === "template_reply" ? (auto as any).mockGatilho : undefined, paramsGatilho: auto.paramsGatilho ?? [], headerUrlGatilho: auto.headerUrlGatilho, pin: auto.pinData?.trigger ?? "", numero: numeroDoFluxo(auto.conta, contasDoWs) }, selected: sel === -1, draggable: true },
    ];
    auto.steps.forEach((s, i) => {
      const m = STEP_META[s.type] ?? { label: s.type, emoji: "•" };
      const nid = s._id ?? "s" + i;
      ns.push({
        id: nid,
        type: "step",
        position: positions[nid] ?? { x: 60 + (i + 1) * 260, y: 0 },
        data: {
          emoji: m.emoji,
          label: m.label,
          summary: stepSummary(s),
          kind: s.type,
          file: s.type === "ptv" || s.type === "media" ? s.file : "",
          mediaType: s.type === "media" ? s.mediaType : "",
          // Legenda vai pro nó: o dono quer VER o texto que vai embaixo da imagem/vídeo sem
          // precisar abrir o passo (24/08).
          caption: s.type === "media" ? s.caption ?? "" : "",
          casos: s.type === "switch" ? s.casos ?? [] : [],
          campoSwitch: s.type === "switch" ? s.campo ?? "" : "",
          variable: s.type === "ask" ? s.variable : "",
          paths: s.type === "ai_agent" ? s.paths.filter((p) => p.name.trim()).map((p) => p.name) : [],
          buttons: s.type === "buttons" ? s.buttons.filter(Boolean) : [],
          note: s.type === "note" ? s.text : "",
          // Tamanho do post-it (alça no canto): fica NO PASSO, então sobrevive ao reload.
          noteW: s.type === "note" ? s.w ?? 210 : 0,
          noteH: s.type === "note" ? s.h ?? 0 : 0,
          // Template oficial: o retrato salvo pelo editor (mock) + params preenchidos, pro nó
          // desenhar o celularzinho com o conteúdo REAL em vez de um cartão genérico.
          tplNome: s.type === "template" ? s.templateName : "",
          tplMock: s.type === "template" ? (s as any).mock : undefined,
          tplParams: s.type === "template" ? s.params ?? [] : [],
          // Arquivo DESTE envio: o nó tem que mostrar o que vai sair de verdade, não a mídia de
          // exemplo do template (o dono trocou a imagem e o celularzinho continuou com a antiga).
          tplHeaderUrl: s.type === "template" ? (s as any).headerUrl ?? "" : "",
          // 📌 dado que estava FIXADO neste nó no n8n (só sinalização — aqui o nó roda de verdade)
          pin: auto.pinData?.[nid] ?? "",
        },
        selected: sel === i,
        draggable: true,
      });
    });
    // ⚠️ MULTI-SELEÇÃO: este efeito roda em qualquer mudança de sel/positions/auto — e `ns` traz
    // `selected: sel === i`, a seleção ÚNICA do editor. Sobrescrever direto APAGAVA a seleção em
    // grupo do Shift/caixa; o arraste seguinte movia só o nó agarrado (bug do dono, 24/08).
    // Com 2+ nós selecionados no estado do React Flow, a seleção deles é preservada.
    setNodes((atuais) => {
      const selecionados = new Set(atuais.filter((n) => n.selected).map((n) => n.id));
      if (selecionados.size < 2) return ns;
      return ns.map((n) => ({ ...n, selected: selecionados.has(n.id) }));
    });
    // ⚠️ `arestaAlvo` NÃO pode entrar nas dependências deste efeito. Ele muda DURANTE o arraste
    // (é o realce da seta que vai receber o nó), e refazer a lista de nós no meio do arraste
    // reescreve `position` com a posição SALVA — o nó pula de volta pra origem e briga com o
    // mouse. Era exatamente o "pisca e tenta voltar" ao arrastar a nota por cima de uma linha,
    // que também impedia o encaixe. As arestas são montadas num efeito separado, logo abaixo.
  }, [auto, sel, positions, setNodes, contasDoWs]);

  // Arestas: do grafo salvo (auto.edges) ou lineares. Todas apagáveis (× na aresta).
  // Efeito PRÓPRIO justamente pra que o realce da seta durante o arraste não toque nos nós.
  useEffect(() => {
    if (!auto) { setEdges([]); return; }
    // [] = grafo sem conexões (apagou a última seta) — NÃO cai no linear, senão a seta renasce.
    const src = Array.isArray(auto.edges) ? auto.edges : linearEdges(auto.steps);
    setEdges(src.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      type: "del",
      animated: true,
      // O caminho que o TESTE percorreu ganha destaque próprio e vence os outros realces — é o
      // que responde "por onde meu dado passou?" enquanto o teste está na tela.
      className: fiosDoTeste.has(e.id) ? "edge-teste"
        : e.id === arestaAlvo ? "edge-alvo"
        : (fiosComDados.has(e.id) ? "edge-comdados" : undefined),
      data: { onDelete: deleteEdge },
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, arestaAlvo, fiosComDados, fiosDoTeste, setEdges]);

  const ehOficialAgora = !!auto && fluxoEhOficial(auto);
  const indexOfNode = (nid: string) => (auto ? auto.steps.findIndex((s) => s._id === nid) : -1);

  // Alça da nota: grava largura/altura NO PASSO. Sem histórico (undo) de propósito — arrastar a
  // alça dispara dezenas de eventos e entupiria o Ctrl+Z com um passo por pixel.
  function redimensionaNota(nid: string, w: number, h: number) {
    setAuto((prev) => {
      if (!prev) return prev;
      const i = prev.steps.findIndex((x, k) => (x._id ?? "s" + k) === nid);
      if (i < 0 || prev.steps[i].type !== "note") return prev;
      const steps = prev.steps.slice();
      steps[i] = { ...steps[i], w, h } as Step;
      return { ...prev, steps };
    });
  }

  function patch(mut: (a: Automation) => Automation) {
    setAuto((prev) => (prev ? mut({ ...prev }) : prev));
  }
  const curEdges = (a: Automation): FlowEdge[] => (Array.isArray(a.edges) ? a.edges : linearEdges(a.steps));
  // Apaga uma conexão (× na aresta). Materializa as lineares antes, se ainda não ramificado.
  function deleteEdge(eid: string) {
    patch((a) => ({ ...a, edges: curEdges(a).filter((e) => e.id !== eid) }));
  }
  // Liga source→target (arrastar de um handle a outro). Uma saída liga a UM destino.
  function onConnect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    const handle = c.sourceHandle ?? null;
    patch((a) => {
      const filtered = curEdges(a).filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === handle));
      return { ...a, edges: [...filtered, { id: newEdgeId(), source: c.source!, sourceHandle: handle, target: c.target! }] };
    });
  }
  // Insere um passo no índice dado, na posição (flow-coords) dada, e o seleciona.
  // `naAresta` = a seta em que a pessoa MIROU ao soltar. Quando ela existe, é ELA que manda:
  // corta aquela ligação e põe o passo no meio dela, preservando o sourceHandle (o caminho do
  // Agente IA / o botão de onde a seta saía).
  // ⚠️ O BUG que isto conserta: antes o encaixe era feito por ÍNDICE — pegava `steps[at-1]` e
  // cortava a saída padrão DAQUELE passo. Num fluxo ramificado a ordem do array não tem nada a
  // ver com a ordem do desenho, então o nó ia parar em outro caminho (relatado 19/08).
  function insertStep(type: string, index: number, pos?: { x: number; y: number }, naAresta?: Edge | null, deOrigem?: { source: string; sourceHandle: string | null }) {
    if (!auto) return;
    const step = newStep(type);
    const novoId = step._id!;
    const at = naAresta
      ? Math.max(0, Math.min(indexOfNode(naAresta.target) < 0 ? auto.steps.length : indexOfNode(naAresta.target), auto.steps.length))
      : Math.max(0, Math.min(index, auto.steps.length));
    const steps = [...auto.steps];
    steps.splice(at, 0, step);
    if (pos) setPositions((p) => ({ ...p, [novoId]: { x: Math.round(pos.x), y: Math.round(pos.y) } }));
    patch((a) => {
      const next: Automation = { ...a, steps };
      // Sempre trabalha com o grafo EXPLÍCITO: se o fluxo ainda era linear, materializa antes de
      // mexer. Sem isso o encaixe numa aresta "virtual" não teria onde ser gravado.
      const base = Array.isArray(a.edges) ? a.edges : linearEdges(a.steps);
      // Veio do MENU do arrasto (puxou de uma saída e soltou no vazio): liga EXATAMENTE aquela
      // saída no nó novo. Uma saída aponta pra UM destino — se ela já estava ligada em algo, a
      // ligação antiga sai (mesma regra do onConnect de arrastar até um nó existente).
      if (deOrigem) {
        next.edges = [
          ...base.filter((e) => !(e.source === deOrigem.source && (e.sourceHandle ?? null) === (deOrigem.sourceHandle ?? null))),
          { id: newEdgeId(), source: deOrigem.source, sourceHandle: deOrigem.sourceHandle ?? null, target: novoId },
        ];
        return next;
      }
      if (naAresta) {
        const cortada = base.find((e) => e.id === naAresta.id);
        if (cortada) {
          next.edges = [
            ...base.filter((e) => e.id !== cortada.id),
            { id: newEdgeId(), source: cortada.source, sourceHandle: cortada.sourceHandle ?? null, target: novoId },
            { id: newEdgeId(), source: novoId, sourceHandle: null, target: cortada.target },
          ];
          return next;
        }
      }
      // Sem mira numa seta: só mantém o comportamento antigo quando o fluxo JÁ era ramificado
      // (fluxo linear continua linear — as arestas são deduzidas da ordem do array).
      if (a.edges && a.edges.length) {
        const predId = at === 0 ? "trigger" : steps[at - 1]._id ?? "s" + (at - 1);
        const cutting = base.find((e) => e.source === predId && (e.sourceHandle ?? null) === null);
        const edges = base.filter((e) => e !== cutting);
        edges.push({ id: newEdgeId(), source: predId, sourceHandle: null, target: novoId });
        if (cutting) edges.push({ id: newEdgeId(), source: novoId, sourceHandle: null, target: cutting.target });
        next.edges = edges;
      }
      return next;
    });
    setSel(at);
    setRecent(bumpRecent(type));
  }
  // Clique na paleta → adiciona no CENTRO da área visível (com leve cascata p/ não empilhar).
  function addAtCenter(type: string) {
    const el = wrapperRef.current;
    const n = auto?.steps.length ?? 0;
    let pos = { x: 120 + (n + 1) * 260, y: 0 };
    if (el) {
      const r = el.getBoundingClientRect();
      const off = (n % 6) * 26;
      pos = rf.screenToFlowPosition({ x: r.left + r.width / 2 + off, y: r.top + r.height / 2 + off });
    }
    insertStep(type, auto?.steps.length ?? 0, pos);
  }
  // Centro aproximado de um nó (em flow-coords), pra medir distância até uma seta.
  function nodeCenter(nid: string): { x: number; y: number } | null {
    const n = nodes.find((x) => x.id === nid);
    if (!n) return null;
    const w = n.measured?.width ?? n.width ?? 200;
    const h = n.measured?.height ?? n.height ?? 60;
    return { x: n.position.x + w / 2, y: n.position.y + h / 2 };
  }
  // ── ONDE a seta REALMENTE começa e termina ────────────────────────────────────────────────
  // Usar o CENTRO dos dois nós (como era antes) mente: num Agente IA com 6 caminhos, os seis
  // segmentos saem todos do mesmo ponto e se sobrepõem — soltar um nó perto de um deles podia
  // pegar qualquer outro. Aqui a gente pergunta ao React Flow a posição REAL de cada saída
  // (handleBounds), que é onde a linha nasce de verdade: a bolinha daquele caminho.
  function pontaSaida(nid: string, handle?: string | null): { x: number; y: number } | null {
    const n = nodes.find((x) => x.id === nid);
    if (!n) return null;
    const w = n.measured?.width ?? n.width ?? 200;
    const h = n.measured?.height ?? n.height ?? 60;
    const hb = (rf.getInternalNode?.(nid) as any)?.internals?.handleBounds?.source as
      Array<{ id?: string | null; x: number; y: number; width: number; height: number }> | null | undefined;
    const alvo = hb?.find((x) => (x.id ?? null) === (handle ?? null)) ?? (handle ? undefined : hb?.[0]);
    if (alvo) return { x: n.position.x + alvo.x + alvo.width / 2, y: n.position.y + alvo.y + alvo.height / 2 };
    return { x: n.position.x + w / 2, y: n.position.y + h }; // ainda não medido: base do nó
  }
  function pontaEntrada(nid: string): { x: number; y: number } | null {
    const n = nodes.find((x) => x.id === nid);
    if (!n) return null;
    const w = n.measured?.width ?? n.width ?? 200;
    const hb = (rf.getInternalNode?.(nid) as any)?.internals?.handleBounds?.target as
      Array<{ x: number; y: number; width: number; height: number }> | null | undefined;
    const alvo = hb?.[0];
    if (alvo) return { x: n.position.x + alvo.x + alvo.width / 2, y: n.position.y + alvo.y + alvo.height / 2 };
    return { x: n.position.x + w / 2, y: n.position.y }; // topo do nó
  }
  // Distância de um ponto até um segmento de reta.
  function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Soltou um item da paleta: em cima de uma seta → se mete entre os dois; no vazio → vai onde soltou (fim).
  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    setArestaAlvo(null);
    // Arrastou um GATILHO da paleta: troca o gatilho do fluxo e leva o nó QUANDO pra onde soltou
    // (o fluxo tem 1 gatilho só — soltar outro é trocar, não criar um segundo).
    const gat = e.dataTransfer.getData("application/zc-trigger");
    if (gat && auto) {
      const p = TRIGGER_PALETTE.find((x) => x.id === gat);
      if (p) {
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        setPositions((prev) => ({ ...prev, trigger: { x: Math.round(pos.x), y: Math.round(pos.y) } }));
        if (p.id === "checkout") {
          if (auto.trigger !== "checkout") patch((a) => ({ ...a, trigger: "checkout", eventos: a.eventos?.length ? a.eventos : ["purchase_approved"] }));
        } else if (!p.itens.includes(auto.trigger)) {
          patch((a) => ({ ...a, trigger: p.itens[0] }));
        }
        setSel(-1); // abre as configurações pra escolher o evento exato
      }
      return;
    }
    const type = e.dataTransfer.getData("application/zc-step");
    if (!type || !auto) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // A seta mirada MANDA no encaixe (não o índice no array) — é o que faz o nó cair exatamente
    // no caminho onde a pessoa soltou, inclusive nos ramos do Agente IA e dos botões.
    insertStep(type, auto.steps.length, pos, arestaSob(pos));
  }
  // Escolheu um nó no menu que abriu ao puxar da ponta → insere JÁ conectado depois da origem.
  function addFromPicker(type: string) {
    if (!picker || !auto) return;
    const idx = picker.source === "trigger" ? 0 : indexOfNode(picker.source) + 1;
    insertStep(type, idx, picker.flowPos, null, { source: picker.source, sourceHandle: picker.sourceHandle });
    setPicker(null);
  }
  function updateStep(i: number, s: Step) {
    patch((a) => ({ ...a, steps: a.steps.map((x, j) => (j === i ? s : x)) }));
  }
  function removeStep(i: number) {
    const rid = auto?.steps[i]?._id;
    if (rid) setPositions((p) => { const n = { ...p }; delete n[rid]; return n; });
    patch((a) => {
      const next = { ...a, steps: a.steps.filter((_, j) => j !== i) };
      // Tira as conexões que tocavam o nó removido (se o fluxo já foi ramificado).
      if (a.edges && a.edges.length && rid) next.edges = a.edges.filter((e) => e.source !== rid && e.target !== rid);
      return next;
    });
    setSel(-1);
  }
  function moveStep(i: number, dir: number) {
    if (!auto) return;
    const j = i + dir;
    if (j < 0 || j >= auto.steps.length) return;
    const steps = [...auto.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    patch((a) => ({ ...a, steps }));
    setSel(j);
  }
  // Duplica um passo: clone com _id novo, logo depois do original, deslocado no canvas.
  function duplicateStep(nid: string) {
    if (!auto) return;
    const i = indexOfNode(nid);
    if (i < 0) return;
    const orig = auto.steps[i];
    const clone: Step = { ...structuredClone(orig), _id: sid() };
    const base = positions[nid] ?? { x: 60 + (i + 1) * 260, y: 0 };
    const steps = [...auto.steps];
    steps.splice(i + 1, 0, clone);
    if (clone._id) setPositions((p) => ({ ...p, [clone._id!]: { x: base.x + 40, y: base.y + 40 } }));
    patch((a) => ({ ...a, steps }));
    setSel(i + 1);
  }

  // ── Copiar/colar nós ENTRE fluxos (Shift+clique seleciona vários · Ctrl/Cmd+C · Ctrl/Cmd+V) ──
  // O "clipboard" vive no localStorage: sobrevive a navegar pra outro fluxo (é o caso de uso:
  // copiar um pedaço pronto de um fluxo e colar no outro). Copia os passos, as ARESTAS INTERNAS
  // do grupo (ligações com nós de fora ficam de fora) e as posições relativas; no colar, tudo
  // ganha _id novo e o grupo aterrissa no centro visível do canvas, SOLTO (você liga onde quiser).
  const [clipMsg, setClipMsg] = useState("");
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function avisaClip(msg: string) {
    if (clipTimer.current) clearTimeout(clipTimer.current);
    setClipMsg(msg);
    clipTimer.current = setTimeout(() => setClipMsg(""), 3200);
  }
  function copiarSelecionados(): boolean {
    if (!auto) return false;
    const ids = nodes.filter((n) => n.selected && n.id !== "trigger").map((n) => n.id);
    if (!ids.length && sel !== null && sel >= 0 && auto.steps[sel]?._id) ids.push(auto.steps[sel]._id!); // painel aberto num nó = copia ele
    if (!ids.length) return false;
    const idSet = new Set(ids);
    const steps = auto.steps.filter((s) => s._id && idSet.has(s._id)).map((s) => structuredClone(s));
    if (!steps.length) return false;
    const layout: Record<string, { x: number; y: number }> = {};
    for (const nid of ids) layout[nid] = positions[nid] ?? { x: 60 + (indexOfNode(nid) + 1) * 260, y: 0 };
    const edges = curEdges(auto).filter((e) => idSet.has(e.source) && idSet.has(e.target));
    localStorage.setItem("zc-flow-clip", JSON.stringify({ v: 1, steps, edges, layout }));
    avisaClip(steps.length === 1 ? "1 nó copiado — cole com Ctrl/Cmd+V, aqui ou em outro fluxo" : `${steps.length} nós copiados — cole com Ctrl/Cmd+V, aqui ou em outro fluxo`);
    return true;
  }
  function colarCopiados(): boolean {
    if (!auto) return false;
    let clip: { v: number; steps: Step[]; edges: FlowEdge[]; layout: Record<string, { x: number; y: number }> } | null = null;
    try { clip = JSON.parse(localStorage.getItem("zc-flow-clip") ?? "null"); } catch { /* clipboard vazio/corrompido */ }
    if (!clip || clip.v !== 1 || !Array.isArray(clip.steps) || !clip.steps.length) return false;
    const mapa = new Map<string, string>(); // _id antigo → novo
    const novos: Step[] = clip.steps.map((s) => {
      const nid = sid();
      if (s._id) mapa.set(s._id, nid);
      return { ...structuredClone(s), _id: nid };
    });
    const novasEdges: FlowEdge[] = (Array.isArray(clip.edges) ? clip.edges : [])
      .filter((e) => mapa.has(e.source) && mapa.has(e.target))
      .map((e) => ({ id: newEdgeId(), source: mapa.get(e.source)!, sourceHandle: e.sourceHandle ?? undefined, target: mapa.get(e.target)! }));
    // Aterrissa o grupo no centro visível do canvas, preservando o formato (posições relativas).
    const pontos = Object.values(clip.layout ?? {});
    const cx = pontos.length ? pontos.reduce((a, p) => a + p.x, 0) / pontos.length : 0;
    const cy = pontos.length ? pontos.reduce((a, p) => a + p.y, 0) / pontos.length : 0;
    const rect = wrapperRef.current?.getBoundingClientRect();
    const alvo = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: cx + 60, y: cy + 60 };
    const novasPos: Record<string, { x: number; y: number }> = {};
    for (const [velho, novo] of mapa) {
      const p = clip.layout?.[velho];
      novasPos[novo] = p ? { x: Math.round(p.x + alvo.x - cx), y: Math.round(p.y + alvo.y - cy) } : { x: Math.round(alvo.x), y: Math.round(alvo.y) };
    }
    setPositions((p) => ({ ...p, ...novasPos }));
    // Materializa as arestas atuais ANTES de anexar: num fluxo linear, só acrescentar passos os
    // encadearia no fim sem querer — colado entra SOLTO, o desenho continua mandando.
    patch((a) => ({ ...a, steps: [...a.steps, ...novos], edges: [...curEdges(a), ...novasEdges] }));
    setSel(null);
    avisaClip(novos.length === 1 ? "1 nó colado — clique e ligue onde quiser" : `${novos.length} nós colados — o grupo chegou solto, ligue onde quiser`);
    return true;
  }
  // ── Desfazer/refazer LOCAL (Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z ou Ctrl+Y) ─────────────────────────
  // Pilha de snapshots {auto, positions} alimentada por um effect: QUALQUER mudança (apagar, colar,
  // arrastar, editar) vira um ponto de retorno. Rajada de digitação (<800ms) coalesce num ponto só.
  // É o arrependimento rápido DENTRO da sessão; o definitivo entre sessões é o Histórico (servidor).
  type SnapFluxo = { auto: Automation; positions: Record<string, { x: number; y: number }> };
  const histRef = useRef<{ past: SnapFluxo[]; future: SnapFluxo[]; lastPush: number; skip: boolean; loadedAt: number }>({ past: [], future: [], lastPush: 0, skip: false, loadedAt: 0 });
  const prevSnapRef = useRef<SnapFluxo | null>(null);
  const [, histBump] = useState(0); // só pra re-render dos botões ↶ ↷ (a pilha vive em ref)
  useEffect(() => {
    if (!auto) return;
    const h = histRef.current;
    const prev = prevSnapRef.current;
    prevSnapRef.current = { auto, positions };
    if (h.skip) { h.skip = false; return; }               // mudança veio do próprio undo/redo
    if (!prev) { h.loadedAt = Date.now(); return; }        // 1ª carga = baseline, não é edição
    if (Date.now() - h.loadedAt < 600) return;             // setAuto+setPositions da carga inicial
    const agora = Date.now();
    if (agora - h.lastPush < 800 && h.past.length) { h.lastPush = agora; return; } // coalesce digitação
    h.lastPush = agora;
    h.past.push(prev);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    histBump((x) => x + 1);
  }, [auto, positions]);
  function desfazer(): boolean {
    const h = histRef.current;
    const alvo = h.past.pop();
    if (!alvo || !auto) return false;
    h.future.push({ auto, positions });
    h.skip = true;
    setAuto(alvo.auto); setPositions(alvo.positions); setSel(null);
    histBump((x) => x + 1);
    return true;
  }
  function refazer(): boolean {
    const h = histRef.current;
    const alvo = h.future.pop();
    if (!alvo || !auto) return false;
    h.past.push({ auto, positions });
    h.skip = true;
    setAuto(alvo.auto); setPositions(alvo.positions); setSel(null);
    histBump((x) => x + 1);
    return true;
  }

  // ── Histórico de VERSÕES (servidor): quem salvou, quando; restaurar volta o fluxo pra lá ────
  const [histOpen, setHistOpen] = useState(false);
  const [versoes, setVersoes] = useState<Array<{ at: string; autor: string; passos: number }> | null>(null);
  // Config e histórico dividem o mesmo canto do canvas — abrir um fecha o outro.
  useEffect(() => { if (sel !== null) setHistOpen(false); }, [sel]);
  function abreHistorico() {
    setSel(null); setHistOpen(true); setVersoes(null);
    jget(`/api/flow-history?automationId=${encodeURIComponent(id)}`)
      .then((d) => setVersoes(d.versions ?? []))
      .catch(() => setVersoes([]));
  }
  async function restaurarVersao(v: { at: string; autor: string }) {
    const quando = new Date(v.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    if (!window.confirm(`Voltar pra versão de ${quando} (${v.autor})?\n\nO fluxo atual será substituído AGORA no servidor — essa ação é irreversível (a restauração também entra no histórico).`)) return;
    try {
      const r = await jsend("/api/flow-history/restore", "POST", { automationId: id, at: v.at });
      const a: Automation = r.automation;
      const withIds: Automation = { ...a, steps: a.steps.map((s) => (s._id ? s : { ...s, _id: sid() })) };
      histRef.current.skip = true;
      setAuto(withIds);
      setPositions(a.layout ?? {});
      salvoRef.current = impressao(withIds, a.layout ?? {});
      setSel(null);
      setHistOpen(false);
      avisaClip(`Versão de ${quando} restaurada`);
    } catch (e: any) {
      avisaClip("Falha ao restaurar: " + e.message);
    }
  }

  // Delete/Backspace apaga TODOS os nós selecionados (multi-seleção do Shift ou o nó do painel
  // aberto — o rebuild marca ele como selected). O gatilho nunca entra. Sem confirmação: é o
  // comportamento que o dono pediu; o Salvar é quem torna definitivo.
  function deletarSelecionados(): boolean {
    if (!auto) return false;
    const ids = nodes.filter((n) => n.selected && n.id !== "trigger").map((n) => n.id);
    if (!ids.length) return false;
    const idSet = new Set(ids);
    patch((a) => ({
      ...a,
      steps: a.steps.filter((s) => !s._id || !idSet.has(s._id)),
      edges: curEdges(a).filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
    }));
    setSel(null);
    avisaClip(ids.length === 1 ? "1 nó apagado" : `${ids.length} nós apagados`);
    return true;
  }
  // Atalhos de teclado. Guardados num ref pra registrar o listener UMA vez sem closure velha.
  const clipRef = useRef({ copiar: copiarSelecionados, colar: colarCopiados, deletar: deletarSelecionados, desfazer, refazer });
  clipRef.current = { copiar: copiarSelecionados, colar: colarCopiados, deletar: deletarSelecionados, desfazer, refazer };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return; // digitação segue normal (inclusive o undo nativo de texto)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (clipRef.current.deletar()) e.preventDefault();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { if (e.shiftKey ? clipRef.current.refazer() : clipRef.current.desfazer()) e.preventDefault(); return; }
      if (k === "y") { if (clipRef.current.refazer()) e.preventDefault(); return; }
      if (k !== "c" && k !== "v") return;
      if (window.getSelection()?.toString()) return; // tem texto selecionado na página → cópia normal
      if (k === "c" ? clipRef.current.copiar() : clipRef.current.colar()) e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Seta que está sob um ponto do canvas (ignorando as que já tocam `ignora`). Mesma tolerância do
  // drop da paleta. É o que permite "soltar em cima da linha".
  function arestaSob(fp: { x: number; y: number }, ignora?: string): Edge | null {
    let best: Edge | null = null;
    let bestD = 55;
    for (const e of edges) {
      if (ignora && (e.source === ignora || e.target === ignora)) continue;
      const a = pontaSaida(e.source, e.sourceHandle), b = pontaEntrada(e.target);
      if (!a || !b) continue;
      const d = distToSeg(fp, a, b);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  const centroDoArrastado = (n: Node) => ({
    x: n.position.x + (n.measured?.width ?? n.width ?? 200) / 2,
    y: n.position.y + (n.measured?.height ?? n.height ?? 60) / 2,
  });
  // Enquanto arrasta: acende a seta que vai receber o nó (feedback antes de soltar).
  function onNodeDrag(_e: unknown, node: Node, todos?: Node[]) {
    if (node.id === "trigger") return; // o gatilho é o começo do fluxo — não entra no meio
    // Arrastando um GRUPO, o encaixe-no-meio não vale (encaixar 6 nós numa seta não tem sentido).
    if ((todos?.length ?? 1) > 1) { setArestaAlvo(null); return; }
    const alvo = arestaSob(centroDoArrastado(node), node.id);
    setArestaAlvo((atual) => (atual === (alvo?.id ?? null) ? atual : alvo?.id ?? null));
  }
  // Arrastou e soltou um nó → fica EXATAMENTE onde soltou (posição livre, sem reordenar).
  // A ordem de execução não muda com o arraste — ela é a das setas (mude com ↑subir/↓descer).
  // EXCEÇÃO: soltou EM CIMA de uma seta → o nó se encaixa entre os dois (religa sozinho).
  function onDragStop(_e: unknown, dragged: Node, todos?: Node[]) {
    // O React Flow entrega TODOS os nós que se moveram (multi-seleção) no 3º argumento. Salvar só
    // o agarrado fazia o resto do grupo voltar pro lugar antigo no rebuild seguinte.
    const movidos = todos?.length ? todos : [dragged];
    setPositions((p) => {
      const n = { ...p };
      for (const m of movidos) n[m.id] = { x: Math.round(m.position.x), y: Math.round(m.position.y) };
      return n;
    });
    const alvoId = arestaAlvo;
    setArestaAlvo(null);
    if (movidos.length > 1) return; // grupo não encaixa no meio de seta
    if (!alvoId || dragged.id === "trigger" || !auto) return;
    patch((a) => {
      const novas = religarNoMeio(curEdges(a), dragged.id, alvoId);
      return novas ? { ...a, edges: novas } : a;
    });
    avisaClip("Passo encaixado no meio — as ligações foram refeitas");
  }
  // Puxou da PONTA (handle de saída) de um nó: guarda a origem — NÓ **E SAÍDA**. Só o nó não
  // basta: o gatilho de checkout tem várias saídas (Compra aprovada, PIX gerado…), e sem o
  // handleId a ligação nascia sempre na primeira — puxava de "PIX gerado" e o nó novo aparecia
  // pendurado em "Compra aprovada" (relatado 20/08).
  function onConnectStart(_e: unknown, params: { nodeId?: string | null; handleId?: string | null; handleType?: string | null }) {
    connectSource.current = params.handleType === "source" && params.nodeId
      ? { nodeId: params.nodeId, handleId: params.handleId ?? null }
      : null;
  }
  // …e, se soltou no vazio (não em cima de outro nó), abre o menu de nós ali.
  function onConnectEnd(e: MouseEvent | TouchEvent, state: { toNode?: unknown | null }) {
    const src = connectSource.current;
    connectSource.current = null;
    if (!src || state?.toNode) return;
    const p = "clientX" in e ? e : (e as TouchEvent).changedTouches?.[0];
    if (!p) return;
    const flowPos = rf.screenToFlowPosition({ x: p.clientX, y: p.clientY });
    setPicker({ source: src.nodeId, sourceHandle: src.handleId, flowPos, screen: { x: p.clientX, y: p.clientY } });
  }

  // Sobe qualquer mídia embutida (data:) pro motor e troca pela URL — evita base64 gigante na
  // config (o que estourava o teto de corpo do painel e travava TODO save). NÃO engole falha: se um
  // arquivo não hospeda (pesado demais pro painel transportar), aborta com erro claro em vez de
  // salvar base64 escondido. Cada arquivo sobe sozinho (corpo = 1 arquivo), nunca a lista inteira.
  async function hostMedia(a: Automation): Promise<Automation> {
    const steps = await Promise.all(
      a.steps.map(async (s) => {
        if ("file" in s && typeof s.file === "string" && s.file.startsWith("data:")) {
          const approxMB = (s.file.length * 0.75) / 1048576;
          try {
            // Bytes crus: o corpo JSON do painel trava em 10MB (medido 20/08) e base64 infla 33%,
            // então por ali um vídeo de 7,5MB já não passava. O teto real agora é o do motor, 60MB.
            return { ...s, file: await subirDataUri(s.file) };
          } catch (e: any) {
            const msg = String(e?.message || "");
            const authOrDown = /autentic|sess|assine|acesso restrito|indispon|failed to fetch|network|rede|erro 5\d\d|50\d|502/i.test(msg);
            const grande = !authOrDown && (approxMB > 60 || /too large|payload|413|60MB/i.test(msg));
            throw new Error(grande
              ? `Uma mídia tem ~${approxMB.toFixed(1)}MB e o limite é 60MB. Comprima o arquivo ou cole um link direto.`
              : `Falha ao hospedar mídia: ${msg || "erro desconhecido"} (tente de novo; se persistir, entre novamente).`);
          }
        }
        return s;
      }),
    );
    return { ...a, steps };
  }

  // ══ ALTERAÇÃO PENDENTE ═══════════════════════════════════════════════════════════════════
  // Guarda a impressão digital do que está NO SERVIDOR. O botão Salvar some quando bate e volta
  // quando difere — assim a barra responde "tem coisa pra salvar?" sem ninguém precisar lembrar.
  // O layout entra na conta: arrastar um nó É uma alteração, e antes se perdia calada.
  const impressao = (a: Automation | null, pos: Record<string, { x: number; y: number }>) =>
    a ? JSON.stringify({ a: { ...a, updatedAt: undefined, layout: undefined }, pos }) : "";
  const salvoRef = useRef<string>("");
  const sujo = !!auto && impressao(auto, positions) !== salvoRef.current;

  useAvisoNaoSalvo(sujo);

  // 🔄 TROCAR DE CONTA COM UM FLUXO ABERTO. Duas coisas aconteciam calado aqui:
  //  1. o aviso de "não salvo" do painel só intercepta clique em LINK, e o seletor de contas é um
  //     BOTÃO — dava pra trocar de conta no meio de uma edição e perder tudo, sem pergunta;
  //  2. um fluxo com nó de MODELO (template da Meta) só roda na API Oficial. Trocar pra uma conta
  //     LITE deixava na tela um fluxo que aquela conta não consegue executar, sem dizer nada.
  // Agora o seletor pergunta aqui antes de trocar: se houver o que salvar, oferece salvar; e um
  // fluxo com modelo leva direto pra tela de modelos da conta escolhida (pedido do dono, 07/09).
  const usaTemplate = !!auto && (auto.steps ?? []).some((p: any) => p?.type === "template");
  useEffect(() => {
    registraGuardaDeTroca(async (destino) => {
      if (!auto) return true;
      const irPraModelos = usaTemplate ? TELA_TEMPLATES[destino] : null;
      if (sujo) {
        const aviso = usaTemplate
          ? `Este fluxo usa MODELO da Meta, que só roda na API Oficial.\n\nSalvar as alterações antes de trocar de conta?\n\nOK = salvar e abrir os modelos de ${destino}\nCancelar = ficar aqui e continuar editando`
          : "Você tem alterações não salvas neste fluxo.\n\nOK = salvar e trocar de conta\nCancelar = ficar aqui e continuar editando";
        if (!window.confirm(aviso)) return false;   // decidiu ficar: a troca nem acontece
        await save();
      }
      if (irPraModelos) router.push(irPraModelos);
      return true;
    });
    return () => registraGuardaDeTroca(null);   // saiu do builder: nenhuma guarda ativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, sujo, usaTemplate]);

  async function save() {
    if (!auto || !all || status === "salvando…") return; // trava reentrância (evita perda de update)
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } // mata o "salvo!" pendente
    setStatus("salvando…");
    try {
      // Hospeda SÓ a mídia do fluxo editado (cada arquivo sobe sozinho). Os outros fluxos já vêm com
      // URL do servidor — o motor faz de-inline no save e no boot —, então entram na lista sem base64.
      const hosted = await hostMedia(auto);
      const withLayout = { ...hosted, layout: positions, updatedAt: new Date().toISOString() };
      const rebuilt = all.map((x) => (x.id === auto.id ? withLayout : x));
      const r = await jsend("/api/automations", "PUT", { automations: rebuilt });
      setAll(r.automations ?? rebuilt);
      setAuto(withLayout); // reflete as URLs no editor (não fica com data: pendurado)
      salvoRef.current = impressao(withLayout, positions);
      setStatus("salvo!");
      saveTimer.current = setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      setStatus(e.message);
    }
  }
  // PUBLICAR / DESPUBLICAR. "Salvar" grava o desenho; quem faz o fluxo DISPARAR pra valer é o
  // estado `enabled` — que até agora só existia no interruptor da LISTA de fluxos, longe de quem
  // está editando (dava pra passar o dia montando um fluxo e ele nunca rodar). Salva junto: assim
  // publicar nunca põe no ar uma versão diferente da que está na tela.
  async function publicar(novo: boolean) {
    if (!auto || !all || status === "salvando…") return;
    if (!novo && !window.confirm("Despublicar este fluxo?\n\nEle volta a ser rascunho e PARA de disparar pra novos leads. Quem já está no meio de uma conversa não recebe os próximos passos.")) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setStatus("salvando…");
    try {
      const hosted = await hostMedia(auto);
      const atualizado = { ...hosted, layout: positions, enabled: novo, updatedAt: new Date().toISOString() };
      const rebuilt = all.map((x) => (x.id === auto.id ? atualizado : x));
      const r = await jsend("/api/automations", "PUT", { automations: rebuilt });
      setAll(r.automations ?? rebuilt);
      setAuto(atualizado);
      salvoRef.current = impressao(atualizado, positions);
      setStatus(novo ? "publicado!" : "voltou a rascunho");
      setBloqueio("");
      saveTimer.current = setTimeout(() => setStatus(""), 3000);
    } catch (e: any) {
      // ❗ "PRA PUBLICAR, FALTA…" NÃO É ERRO DE SISTEMA — é um campo vazio, e o cliente precisa
      // CHEGAR nele. Antes a frase saía como statuszinho cinza ao lado do botão ("abra o nó do
      // topo e escolha o destino") e o cliente ficava rodando o canvas atrás do tal nó — foi o
      // que travou um cliente com o fluxo por horário importado do n8n. Agora a mesma frase vira
      // faixa vermelha E o painel do gatilho abre sozinho, já centralizado no nó que falta.
      const msg = String(e?.message ?? e);
      if (/^pra publicar/i.test(msg)) {
        setBloqueio(msg);
        setStatus("");
        setSel(-1); // abre o painel do Gatilho, que é onde estão os campos que faltam
        const g = positions["trigger"];
        if (g) rf.setCenter(g.x + 115, g.y + 40, { zoom: 1, duration: 400 });
      } else {
        setStatus(msg);
      }
    }
  }
  // Baixa o fluxo INTEIRO (nome, gatilho, passos, conexões, posições) num .json — mesmo formato
  // que "Fluxos → Importar" lê. Sem token/segredo do webhook: um arquivo baixado pode acabar em
  // qualquer lugar (backup, outra conta, comprador do código), e a URL do webhook muda de qualquer
  // jeito ao reimportar (id novo). Pedido do dono (24/08) — era o ícone que faltava no editor.
  function baixarFluxo() {
    if (!auto) return;
    // ⚠️ LGPD: o arquivo baixado SAI DA CONTA (vai por WhatsApp, e-mail, importado por outra
    // pessoa). O exemploWebhook guarda um payload REAL — telefone, nome do titular, placa,
    // coordenadas, e-mail — então ele NUNCA vai junto. Quem importa monta o exemplo com os dados
    // dele. (Eu tinha deixado ir junto "de brinde" e vazou o número do dono pro fluxo de um cliente.)
    const { webhookToken: _t, webhookSegredoEnc: _s, exemploWebhook: _e, ...limpo } = auto as any;
    // Defesa em profundidade: o servidor já não manda o segredo do passo de HTTP pro painel, mas
    // se um dia mandar, ele não pode sair num arquivo que a pessoa manda por WhatsApp.
    limpo.steps = (limpo.steps ?? []).map((st: any) => {
      if (!st || st.type !== "webhook_out") return st;
      const { authValorEnc: _a, authValor: _b, ...resto } = st;
      return resto;
    });
    const nomeArq = (auto.name || auto.id || "fluxo")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "fluxo";
    const blob = new Blob([JSON.stringify(limpo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url; a2.download = `${nomeArq}.json`;
    document.body.appendChild(a2); a2.click(); a2.remove();
    URL.revokeObjectURL(url);
  }
  async function del() {
    if (!auto || !all) return;
    if (!window.confirm("Excluir este fluxo?")) return;
    try {
      const list = all.filter((x) => x.id !== auto.id);
      await jsend("/api/automations", "PUT", { automations: list });
      router.push("/fluxos");
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (notFound) return <div className="card"><div className="card-pad">Fluxo não encontrado. <BackTo href="/fluxos" label="Voltar aos fluxos" /></div></div>;
  if (!auto) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <BackTo href="/fluxos" label="Fluxos" />

      <div className="card fx-barra">
        <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" style={{ maxWidth: 260 }} value={auto.name ?? ""} placeholder="Nome do fluxo" onChange={(e) => patch((a) => ({ ...a, name: e.target.value }))} />
          {/* Selo de estado: a dúvida "salvei, já está valendo?" some quando a resposta está na tela. */}
          <span className={"fx-estado" + (auto.enabled !== false ? " no-ar" : "")}
            title={auto.enabled !== false ? "Este fluxo está DISPARANDO pra quem entrar no gatilho" : "Rascunho: você pode editar à vontade que nada dispara"}>
            <span className="fx-bolinha" />{auto.enabled !== false ? "No ar" : "Rascunho"}
          </span>
          {(() => {
            // Em qual número este fluxo roda — só aparece quando é EXCLUSIVO de um canal.
            const origem = origemDoFluxo(auto);
            if (origem === "ambos") return null;
            return (
              <span className={"fx-estado fx-origem-" + origem} title={origem === "oficial" ? "Tem passo de template da Meta — só roda numa conta da API Oficial" : "Usa um recurso (grupo, ligação, carrossel livre…) que só existe no WhatsApp Lite"}>
                {origem === "oficial" ? "API Oficial" : "WhatsApp Lite"}
              </span>
            );
          })()}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" onClick={desfazer} disabled={!histRef.current.past.length} title="Desfazer (Ctrl/Cmd+Z)" style={{ padding: "9px 11px" }}><Icon name="undo" size={15} /></button>
            <button className="btn" onClick={refazer} disabled={!histRef.current.future.length} title="Refazer (Ctrl/Cmd+Shift+Z)" style={{ padding: "9px 11px" }}><Icon name="redo" size={15} /></button>
            <button className="btn" onClick={() => (histOpen ? setHistOpen(false) : abreHistorico())} title="Histórico de versões (quem salvou e quando)" style={{ padding: "9px 11px" }}><Icon name="history" size={15} /></button>
            <button className="btn" onClick={baixarFluxo} title="Baixar este fluxo (.json) — pra guardar, duplicar em outra conta, ou importar de novo em Fluxos → Importar" style={{ padding: "9px 11px" }}><Icon name="download" size={15} /></button>
            <button className="btn" onClick={() => setTesting(true)} disabled={!auto.steps.length} title={auto.steps.length ? "Simular a conversa (nada é enviado)" : "Adicione um passo primeiro"}><Icon name="play" size={14} /> Testar</button>
            <SaveBar status={status} onSave={save} sujo={sujo} />
            {auto.enabled !== false ? (
              <button className="btn" onClick={() => publicar(false)} disabled={status === "salvando…"}
                title="Volta a ser rascunho: para de disparar pra novos leads">Despublicar</button>
            ) : (
              <button className="btn primary" onClick={() => publicar(true)} disabled={status === "salvando…" || !auto.steps.length}
                title={auto.steps.length ? "Salva e coloca o fluxo pra rodar de verdade" : "Adicione pelo menos um passo antes de publicar"}>
                <Icon name="rocket" size={14} /> Publicar
              </button>
            )}
            <button className="btn" style={{ color: "var(--crit)" }} onClick={del}>Excluir</button>
          </div>
        </div>
      </div>

      {bloqueio && (
        <div className="fx-bloqueio" role="alert">
          <Icon name="warn" size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{bloqueio}</span>
          <button className="btn" style={{ padding: "3px 10px" }} onClick={() => {
            setSel(-1);
            const g = positions["trigger"];
            if (g) rf.setCenter(g.x + 115, g.y + 40, { zoom: 1, duration: 400 });
          }}>Abrir o gatilho</button>
          <button className="btn" style={{ padding: "3px 10px" }} onClick={() => setBloqueio("")}>OK</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Paleta na lateral esquerda: clique = adiciona no centro; arrastar = adiciona onde soltar */}
        <div className="card flow-palette" style={{ flex: "0 0 150px", alignSelf: "flex-start", minWidth: 132 }}>
          {/* O GATILHO fica em cima, separado: é UM só por fluxo e se escolhe no nó do topo —
              não é algo que se arrasta pra dentro do canvas como os passos. */}
          {/* GATILHO — antes era um botão só que abria um <select> de 17 opções soltas; ninguém
              achava nada. Agora a paleta lista POR CATEGORIA (Conversa · Grupos · Checkout ·
              Integrações · Afiliados), o atual fica destacado e trocar é 1 clique. Afiliados só
              aparece pro super admin (é a operação do dono, não do cliente). */}
          {/* GATILHO — a paleta lista UM nó por assunto (Grupos, Checkout…), igual aos passos:
              clique OU arraste pro canvas. O evento exato (compra aprovada? PIX? me marcaram?)
              é escolhido nas CONFIGURAÇÕES, à direita. Antes eram 17 opções soltas num select. */}
          {/* CAIXA DOS GATILHOS — a moldura existe pra deixar óbvio que estes nós SÓ INICIAM o fluxo
              (um por fluxo), diferente dos passos abaixo, que se empilham. Sem ela, gatilho e passo
              pareciam a mesma coisa na coluna. */}
          <div className="flow-gatilho-box">
            <div className="flow-gatilho-cap">
              <span className="flow-gatilho-selo">início</span>
              Gatilho — o que faz o fluxo começar
            </div>
            <div className="flow-gatilho-dica">Escolha 1 · clique ou arraste pro quadro</div>
          {TRIGGER_PALETTE.filter((p) => !p.oculto && (!p.admin || isAdmin)).map((p, i, lista) => {
            const atual = paletaDoGatilho(auto.trigger).id === p.id;
            const novoGrupo = i === 0 || lista[i - 1].grupo !== p.grupo;
            return (
              <div key={p.id}>
                {novoGrupo && <div className="flow-palette-sub">{p.grupo}</div>}
                <button
                  className={"flow-palette-item" + (atual ? " gatilho" : "")}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("application/zc-trigger", p.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => {
                    // Checkout é switch: o trigger é "checkout" e os eventos entram marcados nas configurações.
                    if (!atual) patch((a) => (p.id === "checkout"
                      ? { ...a, trigger: "checkout", eventos: a.eventos?.length ? a.eventos : ["purchase_approved"] }
                      : { ...a, trigger: p.itens[0] }));
                    setSel(-1);
                  }}
                  title={(TRIGGER_AJUDA[p.id] ?? p.label) + (atual ? " · gatilho atual, clique pra configurar" : "")}>
                  <span className="fpi-emoji" style={{ color: corDoGatilho(p.itens[0]) }}><Icon name={triggerIcon(p.itens[0])} size={17} /></span>
                  <span className="fpi-label">{p.label}</span>
                </button>
              </div>
            );
          })}
          </div>

          <div className="flow-palette-title" style={{ marginTop: 12 }}>Adicionar passo</div>
          {STEP_GROUPS.map((g) => (
            // O grupo Dev é ROXO: é território de quem já trabalha com automação (código, HTTP,
            // laço). A cor separa de longe o que é do dia a dia do que exige saber o que se faz.
            <div key={g.titulo} className={g.titulo.startsWith("Dev") ? "grupo-dev" : undefined}>
              <div className="flow-palette-group">{g.titulo}</div>
              {g.itens.map((k) => {
                const m = STEP_META[k];
                if (!m) return null;
                if (k === "code" && !featuresLib.includes("code_node")) return null; // sem liberação, nem aparece
                return (
                  <button
                    key={k}
                    // Nó que NÃO roda num fluxo de API fica marcado já na paleta ("só Lite"), com o
                    // porquê no title — melhor do que descobrir depois que o lead não recebeu.
                    className={"flow-palette-item" + (ehOficialAgora && COMPAT_OFICIAL[k]?.nivel === "nao" ? " incompat" : "")}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("application/zc-step", k); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => addAtCenter(k)}
                    title={ehOficialAgora && COMPAT_OFICIAL[k]?.aviso
                      ? COMPAT_OFICIAL[k]!.aviso
                      : "Clique = adiciona no centro · Arraste = solta onde quiser"}
                  >
                    <span className="fpi-emoji" style={{ color: corDoPasso(k) }}><Icon name={stepIcon(k)} size={17} /></span>
                    <span className="fpi-label">{m.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="flow-palette-hint muted">Clique = centro · Arraste = onde soltar. Puxe da ponta de um nó pra ligar o próximo.</div>
        </div>

        <div
          ref={wrapperRef}
          className="card"
          // sticky: a paleta é mais ALTA que o canvas — rolar pra ver os nós de baixo deixava o
          // canvas pra trás com um vão feio embaixo. Grudado a 74px (topbar sticky de 62 + 12 de
          // respiro), ele acompanha o scroll e a área de trabalho preenche a tela sempre. Sticky é
          // "relative que gruda", então os filhos absolute (stats-bar, painel de config) seguem juntos.
          style={{ flex: "1 1 420px", height: "calc(100vh - 210px)", minHeight: 440, minWidth: 300, overflow: "hidden", position: "sticky", top: 74, alignSelf: "flex-start" }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            // Item vindo da PALETA também acende a seta que vai recebê-lo (antes só encaixava "às cegas").
            const alvo = arestaSob(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            setArestaAlvo((atual) => (atual === (alvo?.id ?? null) ? atual : alvo?.id ?? null));
          }}
          onDragLeave={() => setArestaAlvo(null)}
          onDrop={onCanvasDrop}
        >
          {/* Barra de funil: período + "N leads no funil" (dados reais do motor) */}
          <div className="stats-bar">
            <div className="stats-tabs">
              {STATS_PERIODS.map((p) => (
                <button key={p.id} className={"stats-tab" + (statsPeriod === p.id ? " on" : "")} onClick={() => setStatsPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            {statsPeriod === "custom" && (
              <div className="stats-custom">
                <input type="date" className="stats-date" value={customRange.since ?? ""} onChange={(e) => setCustomRange((c) => ({ ...c, since: e.target.value }))} />
                <span className="muted" style={{ fontSize: 11 }}>até</span>
                <input type="date" className="stats-date" value={customRange.until ?? ""} onChange={(e) => setCustomRange((c) => ({ ...c, until: e.target.value }))} />
              </div>
            )}
            <span className="stats-total">
              {statsLoading ? "carregando…" : stats ? (<><b>{stats.total}</b> {stats.total === 1 ? "lead" : "leads"} no funil</>) : "—"}
            </span>
          </div>

          <TesteCtx.Provider value={{
            estado: teste,
            podeIniciar: (auto.trigger === "webhook" || auto.trigger === "checkout") && !!Object.keys(captura?.fields ?? {}).length,
            play: playTeste,
            iniciar: iniciaTestePasso,
            iniciarTudo: iniciaTesteTudo,
            parar: () => { setTeste(null); setTesteAviso(""); },
            aviso: testeAviso,
            captura,
            setCaptura: guardaCaptura,
            rodando: rodandoPasso,
          }}>
          <GatilhoDados.Provider value={{
            dados: dadosGatilho?.dados ?? null,
            origem: dadosGatilho?.origem ?? "",
            enviar: (dados, origem) => setDadosGatilho({ dados, origem }),
            limpar: () => setDadosGatilho(null),
          }}>
          <FlowActions.Provider value={{ onEdit: (nid) => setSel(nid === "trigger" ? -1 : indexOfNode(nid)), onCopy: duplicateStep, onDelete: (nid) => removeStep(indexOfNode(nid)), onResize: redimensionaNota }}>
            <NodeLeadsCtx.Provider value={setLeadsNode}>
            <StatsCtx.Provider value={stats}>
              <CanvasSeguro>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onDragStop}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable
                nodesConnectable
                deleteKeyCode={null}
                // Zoom-out MUITO além do padrão (0.5): fluxo grande precisa caber inteiro na tela
                // pra se localizar. O scroll/pinça amplia ancorado NO PONTEIRO (d3-zoom): deixa o
                // mouse em cima da região e dá zoom que ele mergulha exatamente ali.
                minZoom={0.08}
                maxZoom={2.5}
                multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                onNodeClick={(e, n) => {
                  // Com Shift/Cmd/Ctrl o clique é MULTI-SELEÇÃO (pra copiar em grupo) — não abre o editor.
                  if (e.shiftKey || e.metaKey || e.ctrlKey) return;
                  setSel(n.id === "trigger" ? -1 : indexOfNode(n.id));
                }}
                onPaneClick={() => setSel(null)}
                fitView
                // Ao abrir, "encaixar na tela" NÃO pode ampliar além do tamanho natural: com 1 nó
                // só (fluxo novo) ele esticava até o maxZoom e o gatilho aparecia gigante. Teto de
                // 1× = o nó abre no tamanho real; o zoom manual continua indo até 2,5×.
                fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
              </CanvasSeguro>
            </StatsCtx.Provider>
            </NodeLeadsCtx.Provider>
          </FlowActions.Provider>
          </GatilhoDados.Provider>

          {/* Barra do teste de percurso: fica no rodapé do canvas enquanto o teste roda. */}
          {teste && (
            <div className={"teste-barra" + (teste.parada ? " parou" : "")}>
              <span className="tb-tag">{teste.parada ? "PAROU" : "TESTE"}</span>
              <div className="tb-txt">
                {teste.fim
                  ? <><b>{teste.fim}</b> {teste.ordem.length} passo(s) percorrido(s).</>
                  : teste.armado?.passo.escolhas?.length
                    ? <><b>Sua vez:</b> {teste.armado.passo.motivo ?? "escolha um caminho no nó destacado"}.</>
                    : <><b>Passo {teste.ordem.length + 1}.</b> Clique no ▶ do nó destacado pra rodar.</>}
              </div>
              {teste.fim && <button className="btn" onClick={teste.automatico ? iniciaTesteTudo : iniciaTestePasso}>rodar de novo</button>}
              <button className="btn" onClick={() => setTeste(null)}>sair do teste</button>
            </div>
          )}
          {!teste && testeAviso && (
            <div className="teste-barra aviso">
              <div className="tb-txt">{testeAviso}</div>
              <button className="btn" onClick={() => setTesteAviso("")}>ok</button>
            </div>
          )}

        {/* Aviso transitório do copiar/colar de nós */}
        {clipMsg && <div className="clip-aviso">{clipMsg}</div>}

        {/* Histórico de versões (lateral, dentro do canvas — mesmo lugar do painel de config) */}
        {histOpen && (
          <div className="card" style={{ position: "absolute", top: 54, right: 10, width: 340, maxWidth: "calc(100% - 20px)", zIndex: 21, maxHeight: "calc(100% - 64px)", overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
            <div className="card-head" style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>Histórico de versões</h3>
              <button className="btn" style={{ padding: "3px 9px", fontSize: 13 }} onClick={() => setHistOpen(false)}>✕</button>
            </div>
            <div className="card-pad">
              {versoes === null ? (
                <div className="muted" style={{ fontSize: 13 }}>Carregando…</div>
              ) : versoes.length === 0 ? (
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Ainda não há versões — elas passam a ser gravadas a cada <b>Salvar</b> que muda o fluxo, com quem salvou e quando.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {versoes.map((v, i) => (
                    <button key={v.at} type="button" className="hist-versao" onClick={() => i === 0 ? undefined : restaurarVersao(v)} disabled={i === 0} title={i === 0 ? "É a versão atual" : "Clique pra voltar pra esta versão"}>
                      <b>{new Date(v.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</b>
                      {i === 0 && <span className="hist-atual">versão atual</span>}
                      <span className="muted" style={{ display: "block", fontSize: 11.5 }}>{v.autor} · {v.passos} passo{v.passos === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                  <div className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
                    Restaurar substitui o fluxo atual <b>na hora, no servidor</b>. A restauração também vira uma versão — dá pra voltar atrás restaurando a anterior.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Painel de config: SÓ aparece quando um nó está selecionado. FLUTUA sobre o canvas,
            DENTRO do card da área de trabalho (absolute) — alinhado à borda dela e logo abaixo do
            filtro de data (stats-bar em top:10, ~36px de altura), acompanhando o canvas no scroll.
            O overflow:hidden do card garante que nunca vaza pro lado de fora. Fecha no X ou
            clicando no vazio do canvas (onPaneClick → setSel(null)). */}
        {sel !== null && (
          <div
            className="card"
            style={{ position: "absolute", top: 54, right: 10, width: larguraPainel, maxWidth: "calc(100% - 20px)", zIndex: 21, maxHeight: "calc(100% - 64px)", overflowY: "auto", boxShadow: "var(--shadow-lg)" }}
            onDragOver={(e) => e.stopPropagation()}
            onDrop={(e) => e.stopPropagation()}
          >
            {/* Alça: arraste pra esquerda pra alargar o painel e conseguir ler os valores. */}
            <div className="painel-alca" onMouseDown={arrastaLargura} title="Arraste pra alargar o painel" />
            <div className="card-head" style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>{sel === -1 ? "Gatilho" : `Passo ${sel + 1}`}</h3>
              <button className="btn" style={{ padding: "3px 9px", fontSize: 13 }} title="Fechar (mais área de trabalho)" onClick={() => setSel(null)}>✕</button>
            </div>
            <div className="card-pad">
              {sel === -1 ? (
                <TriggerEditor auto={auto} onChange={patch} groupList={groupList} onRefreshGroups={refreshGroups} refreshingGroups={refreshingGroups} groupsErr={groupsErr} ehAdmin={isAdmin} />
              ) : auto.steps[sel] ? (
                <StepEditor
                  step={auto.steps[sel]}
                  groupList={groupList}
                  onRefreshGroups={refreshGroups}
                  refreshingGroups={refreshingGroups}
                  groupsErr={groupsErr}
                  onChange={(s) => updateStep(sel, s)}
                  onRemove={() => removeStep(sel)}
                  onMove={(d) => moveStep(sel, d)}
                  canUp={sel > 0}
                  canDown={sel < auto.steps.length - 1}
                  fluxoId={auto.id}
                  naoSalvo={!!status && status !== "salvo!" && status !== "publicado!"}
                  ehOficial={fluxoEhOficial(auto)}
                />
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>Clique num passo no canvas pra editar, ou adicione um passo pela paleta à esquerda.</div>
              )}
            </div>
          </div>
        )}
        {/* O provider do TESTE fecha aqui, e não logo depois do canvas: o painel lateral do
            gatilho é irmão do canvas dentro deste card, e é ele que lê/edita a captura. */}
        </TesteCtx.Provider>
        </div>
      </div>

      {/* Menu de nós que abre ao puxar da ponta de um nó — ordenado do mais recente pro mais antigo */}
      {picker && (
        <>
          <div className="node-picker-scrim" onClick={() => setPicker(null)} />
          <div className="node-picker" style={{ left: picker.screen.x, top: picker.screen.y }} onClick={(e) => e.stopPropagation()}>
            <div className="node-picker-head">Adicionar nó aqui</div>
            {orderByRecency(recent).map((k) => {
              const m = STEP_META[k];
              if (!m) return null;
              return (
                <button key={k} className="node-picker-item" onClick={() => addFromPicker(k)}>
                  <span className="fpi-emoji"><Icon name={stepIcon(k)} size={17} /></span>
                  <span className="fpi-label">{m.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {testing && <FlowTester auto={auto} onClose={() => setTesting(false)} />}

      {leadsNode && (
        <NodeLeadsModal
          automationId={id}
          nodeId={leadsNode}
          period={periodRange(statsPeriod, customRange)}
          nodeLabel={leadsNode === "trigger" ? "Gatilho" : (auto.steps.find((s) => s._id === leadsNode) ? STEP_META[auto.steps.find((s) => s._id === leadsNode)!.type]?.label : "") ?? "Etapa"}
          onClose={() => setLeadsNode(null)}
          onApagou={() => setRecarregaStats((n) => n + 1)}
        />
      )}
    </div>
  );
}

// Popup ao clicar no chip de funil: lista os leads que passaram por aquela etapa.
function NodeLeadsModal({ automationId, nodeId, period, nodeLabel, onClose, onApagou }: { automationId: string; nodeId: string; period: { since: string | null; until: string | null }; nodeLabel: string; onClose: () => void; onApagou?: () => void }) {
  const [leads, setLeads] = useState<Array<{ id?: number; phone: string; name: string | null; email: string | null; product: string | null; amount: number | null; ran_at: string; tags?: string[]; campos?: Record<string, string> }> | null>(null);
  const [err, setErr] = useState("");
  const [apagando, setApagando] = useState<number | null>(null);
  // Apagar UMA passagem: quem monta o fluxo roda ele várias vezes e depois quer limpar só os
  // testes, sem zerar a estatística inteira do funil.
  async function apagaPassagem(id: number) {
    setApagando(id);
    try {
      await jsend("/api/flow-node-hit-delete", "POST", { id });
      setLeads((l) => (l ?? []).filter((x) => x.id !== id));
      onApagou?.();
    } catch (e: any) { setErr(e.message); }
    setApagando(null);
  }
  useEffect(() => {
    const qs = new URLSearchParams({ automationId, nodeId });
    if (period.since) qs.set("since", period.since);
    if (period.until) qs.set("until", period.until);
    jget("/api/flow-node-leads?" + qs.toString())
      .then((d: any) => setLeads(d.leads ?? []))
      .catch((e: any) => setErr(e.message));
  }, [automationId, nodeId, period.since, period.until]);
  const brl = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  // De onde a pessoa veio: junta as UTMs capturadas. Vazio = tráfego direto / veio pelo WhatsApp.
  const origemDe = (c?: Record<string, string>) =>
    [c?.utm_source, c?.utm_medium, c?.utm_campaign, c?.utm_content, c?.utm_term].filter(Boolean).join(" · ");
  const afiliadoDe = (c?: Record<string, string>) => c?.afiliado_nome || c?.afiliado_slug || "";
  return (
    <div className="modal-overlay">
      <div className="leads-modal" onClick={(e) => e.stopPropagation()}>
        <div className="leads-head">
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Icon name="group" size={17} /> Leads nesta etapa</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {nodeLabel}{leads ? ` · ${leads.length} passagem(ns) · ${new Set(leads.map((l) => l.phone)).size} pessoa(s)` : ""}
            </div>
          </div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {err && <div style={{ color: "var(--crit)", padding: 14 }}>{err}</div>}
        {!leads && !err && <div className="muted" style={{ padding: 18 }}>Carregando…</div>}
        {leads && leads.length === 0 && <div className="muted" style={{ padding: 18 }}>Ninguém passou por esta etapa no período selecionado.</div>}
        {leads && leads.length > 0 && (
          <div className="leads-scroll">
            <table className="aff-table">
              <thead><tr><th>#</th><th>Quando</th><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Veio de (UTM)</th><th>Afiliado</th><th>Etiquetas</th><th>Produto</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={l.id ?? l.phone + i}>
                    <td>{i + 1}</td>
                    <td>{dt(l.ran_at)}</td>
                    <td>{l.name || "—"}</td>
                    <td>{l.phone}</td>
                    <td>{l.email || "—"}</td>
                    <td className="lead-origem">{origemDe(l.campos) || "—"}</td>
                    <td>{afiliadoDe(l.campos) || "—"}</td>
                    <td>{l.tags?.length ? l.tags.map((t) => <span key={t} className="tpl-status" style={{ fontSize: 10, marginRight: 3 }}>{t}</span>) : "—"}</td>
                    <td>{l.product || "—"}</td>
                    <td style={{ fontWeight: 700 }}>{brl(l.amount)}</td>
                    <td>
                      {l.id != null && (
                        <button className="lead-x" disabled={apagando === l.id}
                          title="Apagar esta passagem do funil (não mexe no contato)"
                          onClick={() => apagaPassagem(l.id!)}>
                          {apagando === l.id ? "…" : <Icon name="close" size={12} />}
                        </button>
                      )}
                    </td>
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

// Simulador estilo celular: reproduz o fluxo como uma conversa (nada é enviado de verdade).
function FlowTester({ auto, onClose }: { auto: Automation; onClose: () => void }) {
  const [shown, setShown] = useState<Step[]>([]);
  const [playing, setPlaying] = useState(false);
  const [typing, setTyping] = useState(false);
  const runId = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tr = TRIGGERS[auto.trigger] ?? { emoji: "•", label: auto.trigger };

  useEffect(() => { bodyRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [shown, typing]);
  useEffect(() => () => { runId.current++; }, []); // aborta o loop se fechar

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function start() {
    const my = ++runId.current;
    setShown([]);
    setPlaying(true);
    setTyping(false);
    for (const s of auto.steps) {
      if (runId.current !== my) return;
      if (s.type === "presence") { setTyping(true); await sleep(Math.min(s.ms ?? 1200, 1500)); setTyping(false); continue; }
      if (s.type === "wait") { await sleep(Math.min(s.ms, 1200)); continue; } // espera real é encurtada na simulação
      setTyping(true);
      await sleep(600);
      if (runId.current !== my) return;
      setTyping(false);
      setShown((p) => [...p, s]);
      await sleep(400);
    }
    if (runId.current === my) setPlaying(false);
  }

  return (
    <div className="modal-overlay">
      <div className="sim-phone" onClick={(e) => e.stopPropagation()}>
        <div className="sim-head">
          <span className="sim-ava" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 13.5 }}>Simulação do fluxo</b>
            <div style={{ fontSize: 11, opacity: 0.85 }}>prévia · nada é enviado</div>
          </div>
          <button className="sim-x" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="sim-body" ref={bodyRef}>
          <div className="sim-trigger">Gatilho: {tr.label}</div>
          {shown.map((s, i) => <StepBubble key={i} s={s} />)}
          {typing && <div className="sim-typing"><span /><span /><span /></div>}
          {!playing && shown.length === 0 && (
            <div className="sim-empty">Toque em <b>Iniciar</b> pra simular o fluxo desde o gatilho.</div>
          )}
        </div>
        <div className="sim-foot">
          <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={start} disabled={playing}>
            {playing ? "Simulando…" : shown.length ? "▶ Repetir" : "▶ Iniciar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Nome amigável do grupo pelo JID (o chip mostra o nome, não o identificador cru).
const grupoNome = (jid: string, lista: GroupListItem[]) => lista.find((g) => g.jid === jid)?.name || jid.replace(/@g\.us$/, "");

// Config do gatilho "Resposta de template": escolhe QUAL template do disparo arma o gatilho.
// Ao escolher, os botões de resposta rápida viram PORTAS do nó (o clique roteia pro ramo certo);
// resposta digitada sai pela porta padrão. Reusa o retrato do template (mesma leitura do passo).
function GatilhoTemplateEditor({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const [tpls, setTpls] = useState<TplDoEditor[] | null>(null);
  const [wabas, setWabas] = useState<Array<{ wabaId: string; rotulo: string; foto?: string }>>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    jget("/api/meta/templates")
      .then((d) => {
        setTpls((d.templates || []).filter((t: { status?: string }) => (t.status || "").toUpperCase() === "APPROVED"));
        setWabas(d.wabas ?? []);
      })
      .catch((e: { message?: string }) => { setErr(e?.message || "falha"); setTpls([]); });
  }, []);
  const [foneG, setFoneG] = useState(FONE_INICIAL);
  const [abertoG, setAbertoG] = useState(false);
  const [busyG, setBusyG] = useState(false);
  const [msgG, setMsgG] = useState("");
  const [subindoG, setSubindoG] = useState(false);
  const [errG, setErrG] = useState("");
  // Conta dona pro topo do mockup — mesma regra do passo de template.
  const wabaDe = (t?: TplDoEditor) =>
    wabas.length === 1 ? wabas[0] : wabas.find((x) => x.rotulo === (t as any)?.wabaRotulo) ?? wabas[0];
  // FLUXO ANTIGO (salvo antes do mockup no gatilho): completa o retrato sozinho ao abrir o editor.
  // Só ADICIONA visual — os botões/ligações não mudam (os handles são por rótulo).
  const preencheu = useRef(false);
  useEffect(() => {
    if (preencheu.current || !tpls || !auto.templateName || (auto as any).mockGatilho) return;
    const t = tpls.find((x) => x.name === auto.templateName);
    if (!t) return;
    preencheu.current = true;
    const retrato = retratoDoTemplate(t, wabaDe(t) ? { rotulo: wabaDe(t)!.rotulo, foto: wabaDe(t)!.foto } : undefined);
    onChange((a) => ({ ...a, botoesGatilho: retrato.botoes, mockGatilho: retrato.mock } as Automation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpls, auto.templateName]);
  const selG = (tpls || []).find((t) => t.name === auto.templateName);
  const bodyG = selG?.components?.find((c) => c.type === "BODY")?.text || "";
  const vcG = (() => { const n = [...bodyG.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])); return n.length ? Math.max(...n) : 0; })();
  const fmtG = String(selG?.components?.find((c) => c.type === "HEADER")?.format ?? "").toUpperCase();
  return (
    <>
      <div className="ask-note">
        <b>Como funciona:</b> você manda este template pelo <b>Disparador</b> (ou por outro fluxo). Quem
        <b> responder ou clicar num botão em até 7 dias</b> cai NESTE fluxo — cada botão vira uma
        <b> saída</b> do gatilho, e resposta digitada sai pela saída de baixo. Palavra-chave exata de
        outro fluxo continua tendo prioridade.
      </div>
      <div className="field">
        <label>Qual template arma este gatilho</label>
        {err ? (
          <div className="muted" style={{ color: "var(--crit)", fontSize: 13 }}>{err}</div>
        ) : tpls === null ? (
          <div className="muted">Carregando templates…</div>
        ) : (
          <select className="inp" value={auto.templateName ?? ""} onChange={(e) => {
            const name = e.target.value;
            const t = (tpls || []).find((x) => x.name === name);
            const w = wabaDe(t);
            const retrato = t ? retratoDoTemplate(t, w ? { rotulo: w.rotulo, foto: w.foto } : undefined) : { mock: undefined, botoes: [] };
            onChange((a) => ({ ...a, templateName: name, botoesGatilho: retrato.botoes, mockGatilho: retrato.mock } as Automation));
          }}>
            <option value="">Qualquer template (responde a todos os disparos)</option>
            {tpls.map((t) => <option key={t.name + (t.language ?? "")} value={t.name}>{t.name} ({t.language})</option>)}
          </select>
        )}
        {(auto.botoesGatilho ?? []).length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
            Saídas do gatilho: {(auto.botoesGatilho ?? []).map((b) => `“${b}”`).join(" · ")} + resposta livre.
          </div>
        )}
        {auto.templateName === "" || auto.templateName == null ? (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
            Sem template escolhido, o gatilho pega a resposta de QUALQUER template enviado — sem portas de botão.
          </div>
        ) : null}
      </div>

      {/* VARIÁVEIS + IMAGEM + TESTE. O gatilho não envia nada sozinho (quem envia é o Disparador),
          mas sem isto não dava pra preencher {{1}}/{{2}} nem mandar um teste daqui — o nó mostrava
          as variáveis cruas e virava beco sem saída (pedido do dono, 23/08). */}
      {selG && (
        <>
          {vcG > 0 && (
            <div className="field">
              <label>Valores das variáveis <span className="muted">(prévia do nó e do teste)</span></label>
              {Array.from({ length: vcG }).map((_, i) => (
                <input key={i} className="inp" style={{ marginTop: 5 }} placeholder={`Valor de {{${i + 1}}}`}
                  value={(auto.paramsGatilho ?? [])[i] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((a2) => { const n = [...((a2 as Automation).paramsGatilho ?? [])]; n[i] = v; return { ...a2, paramsGatilho: n } as Automation; });
                  }} />
              ))}
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                No disparo REAL quem preenche é o Disparador (ou o fluxo que manda o template). Aqui é
                pra você ver o nó preenchido e mandar o teste.
              </div>
            </div>
          )}
          {/* Cabeçalho de MÍDIA do teste. Era `fmtG === "IMAGE"` e só isso: num template de VÍDEO o
              campo simplesmente NÃO APARECIA, e a tela não dizia por quê — a pessoa procurava onde
              subir o vídeo e concluía que o fluxo não aceitava vídeo (Admin, 29/09). Agora vale
              pros três formatos de mídia que a Meta aceita no topo. */}
          {(fmtG === "IMAGE" || fmtG === "VIDEO" || fmtG === "DOCUMENT") && (() => {
            const ehImg = fmtG === "IMAGE";
            const rotulo = ehImg ? "Imagem" : fmtG === "VIDEO" ? "Vídeo" : "Documento";
            const aceita = ehImg ? "image/jpeg,image/png" : fmtG === "VIDEO" ? "video/mp4" : "application/pdf";
            const limiteMb = ehImg ? 5 : 16;
            return (
            <div className="field">
              <label>{rotulo} do cabeçalho <span className="muted">(deste teste)</span></label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {auto.headerUrlGatilho && ehImg && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img loading="lazy" decoding="async" src={auto.headerUrlGatilho} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
                )}
                {auto.headerUrlGatilho && !ehImg && (
                  <span className="muted" style={{ fontSize: 12 }}>arquivo pronto</span>
                )}
                <label className="btn" style={{ cursor: "pointer" }}>
                  {subindoG ? "subindo…" : auto.headerUrlGatilho ? `trocar ${rotulo.toLowerCase()}` : `escolher ${rotulo.toLowerCase()}`}
                  <input type="file" accept={aceita} style={{ display: "none" }}
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      if (f.size > limiteMb * 1024 * 1024) { setErrG(`${rotulo} acima de ${limiteMb}MB — a Meta recusa.`); return; }
                      setSubindoG(true); setErrG("");
                      try { const url = await subirArquivo(f); onChange((a2) => ({ ...a2, headerUrlGatilho: url } as Automation)); }
                      catch (er: any) { setErrG(er?.message || "falha ao subir"); }
                      setSubindoG(false);
                    }} />
                </label>
                {auto.headerUrlGatilho && (
                  <button className="btn" onClick={() => onChange((a2) => ({ ...a2, headerUrlGatilho: "" } as Automation))}>usar a do template</button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                Serve só pro <b>Teste ao vivo</b> aqui do gatilho. No disparo de verdade quem manda a
                mídia do topo é o <b>Disparador</b>, na hora do envio.
              </div>
              {errG && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 4 }}>{errG}</div>}
            </div>
            );
          })()}

          <div className="tav">
            <div className="tav-topo">
              <b>Teste ao vivo</b>
              <button className="btn" style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12.5 }}
                onClick={() => setAbertoG(!abertoG)}>{abertoG ? "fechar" : "testar num número"}</button>
            </div>
            {abertoG && (
              <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="inp" style={{ flex: 1, minWidth: 150, fontFamily: "var(--mono)" }} inputMode="tel"
                    placeholder="+55 (11) 98999-8888" value={foneG} onChange={(e) => setFoneG(mascaraFone(e.target.value))} />
                  <button className="btn primary" disabled={busyG} onClick={async () => {
                    const num = soDigitosFone(foneG);
                    if (num.length < 12) { setMsgG("Número inválido — DDI+DDD+número."); return; }
                    if (!confirm(`Enviar AGORA o template "${auto.templateName}" para ${mascaraFone(num)}?\n\nÉ envio REAL — a Meta cobra por esta conversa. Ao clicar num botão, ESTE fluxo dispara (se estiver publicado).`)) return;
                    setBusyG(true); setMsgG("");
                    try {
                      const d = await jsend("/api/meta/templates/send", "POST", {
                        to: num, name: auto.templateName, language: selG?.language || "pt_BR",
                        params: (auto.paramsGatilho ?? []).slice(0, vcG),
                        headerUrl: auto.headerUrlGatilho || undefined,
                      });
                      setMsgG(d?.id
                        ? `✅ A Meta aceitou (id ${String(d.id).slice(-12)}). Clique num botão no celular pra ver este fluxo disparar.`
                        : "✅ Enviado! Clique num botão no celular pra ver este fluxo disparar.");
                    } catch (er: any) { setMsgG(er?.message || "não consegui enviar"); }
                    setBusyG(false);
                  }}>{busyG ? "enviando…" : "Enviar agora"}</button>
                </div>
                <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  Manda o template <b>de verdade</b> e <b>arma este gatilho</b> pro número: quando a pessoa
                  clicar num botão, o fluxo roda pelo ramo daquele botão. <b style={{ color: "var(--warn)" }}>A Meta
                  cobra por esta conversa.</b> O fluxo precisa estar <b>publicado</b> pra disparar.
                </div>
                {msgG && <div style={{ fontSize: 12.5, color: msgG.startsWith("✅") ? "var(--accent-deep)" : "var(--crit)" }}>{msgG}</div>}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// Gatilhos de CONVERSA escutam um número; os de EVENTO (venda, webhook…) só enviam por ele.
const GATILHOS_DE_CONVERSA = new Set(["primeiro_contato", "keyword", "template_reply", "group_mention", "group_keyword"]);
function SeletorNumeroDoFluxo({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const { accounts } = useAccounts();
  const contas = accounts.filter((a) => !a.alheia);
  const escuta = GATILHOS_DE_CONVERSA.has(auto.trigger);
  const atual = numeroDoFluxo(auto.conta, accounts);
  return (
    <div className="field fluxo-numero">
      <label>{escuta ? "Número que este fluxo atende" : "Número que envia as mensagens"}</label>
      <select className="inp" value={auto.conta ?? ""}
        onChange={(e) => onChange((a) => ({ ...a, conta: e.target.value || undefined }))}>
        <option value="">{escuta ? "Todos os números da conta" : "Número padrão da conta"}</option>
        {contas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.number ? fmtNumber(a.number) : a.name}{a.name && a.number ? ` · ${a.name}` : ""}{a.type === "API" ? " (API Oficial)" : ""}{a.connected ? "" : " — desconectado"}
          </option>
        ))}
      </select>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        {escuta
          ? (auto.conta ? "Só dispara quando a mensagem chega neste número. Nos outros números da conta, este fluxo fica quieto." : "Dispara em qualquer número da conta. Escolha um se cada número tem o seu atendimento.")
          : "As mensagens deste fluxo saem por este número."}
      </div>
      {atual.aviso && <div className="ask-note" style={{ borderColor: "var(--warn)", marginTop: 6 }}>{atual.aviso}</div>}
    </div>
  );
}

function TriggerEditor({ auto, onChange, groupList, onRefreshGroups, refreshingGroups, groupsErr, ehAdmin }: {
  auto: Automation; onChange: (mut: (a: Automation) => Automation) => void;
  groupList: GroupListItem[]; onRefreshGroups: () => void; refreshingGroups: boolean; groupsErr: string | null; ehAdmin: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 📱 NÚMERO DO FLUXO no topo (pedido do dono, 03/10): com 2+ números na conta, cada fluxo
          diz qual atende. O agendamento tem o seu próprio "Por qual número enviar" lá embaixo. */}
      {auto.trigger !== "schedule" && <SeletorNumeroDoFluxo auto={auto} onChange={onChange} />}
      {/* O nó escolhido na paleta define o ASSUNTO; aqui escolhe-se o evento exato dele.
          Categoria com um evento só (1º contato, Webhook) não mostra seletor — não há o que escolher. */}
      <div className="field">
        <label>{paletaDoGatilho(auto.trigger).label}</label>
        {auto.trigger !== "checkout" && paletaDoGatilho(auto.trigger).itens.length > 1 ? (
          <select className="inp" value={auto.trigger} onChange={(e) => onChange((a) => ({ ...a, trigger: e.target.value }))}>
            {paletaDoGatilho(auto.trigger).itens.map((k) => (
              <option key={k} value={k}>{TRIGGERS[k]?.label ?? k}</option>
            ))}
          </select>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>{auto.trigger === "checkout" ? "Um nó, várias saídas — marque os eventos abaixo" : TRIGGERS[auto.trigger]?.label ?? auto.trigger}</div>
        )}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          Pra trocar de assunto (Grupos, Checkout, Webhook…), clique ou arraste o nó na coluna da esquerda.
        </div>
        {auto.trigger === "unknown" && (
          <div className="ask-note" style={{ borderColor: "var(--warn)", marginTop: 8 }}>
            ⚠️ <b>Este gatilho não dispara nada.</b> “Outro” era só um rótulo para eventos que o
            sistema não reconhece — nenhum evento real inicia fluxo por ele. Escolha um gatilho de
            verdade na coluna da esquerda (Palavra-chave, Checkout, Grupos…) e salve.
          </div>
        )}
      </div>

      {/* 📋 RESPOSTA DE TEMPLATE — o gatilho do disparo em massa. */}
      {auto.trigger === "template_reply" && <GatilhoTemplateEditor auto={auto} onChange={onChange} />}

      {/* 👥 GRUPOS — escuta o que acontece dentro dos grupos. Em quais grupos: vazio = todos. */}
      {ehGatilhoDeGrupo(auto.trigger) && (
        <>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {auto.trigger === "group_mention"
              ? "Dispara quando alguém marca o SEU número (@) numa mensagem de grupo."
              : "Dispara quando alguém escreve a palavra-chave dentro de um grupo."}
            {" "}O fluxo responde <b>no privado de quem escreveu</b> — o grupo não é poluído. Dá pra
            avisar o grupo usando o passo <b>Avisar alguém</b> com <code>{"{{grupo_jid}}"}</code>.
          </div>
          <div className="field">
            <label>Em quais grupos (vazio = todos)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {(auto.grupos ?? []).map((jid) => (
                <span key={jid} className="tpl-status on" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {grupoNome(jid, groupList)}
                  <button type="button" className="btn" style={{ padding: "0 5px", fontSize: 12 }}
                    onClick={() => onChange((a) => ({ ...a, grupos: (a.grupos ?? []).filter((g) => g !== jid) }))}>✕</button>
                </span>
              ))}
              {!(auto.grupos ?? []).length && <span className="muted" style={{ fontSize: 12 }}>escutando TODOS os grupos</span>}
            </div>
            <GroupSelect value="" placeholder="+ escutar este grupo…" groupList={groupList}
              onRefresh={onRefreshGroups} refreshing={refreshingGroups} error={groupsErr}
              onChange={(jid) => { if (jid) onChange((a) => ({ ...a, grupos: [...new Set([...(a.grupos ?? []), jid])] })); }} />
          </div>
        </>
      )}

      {/* 💳 CHECKOUT — SWITCH: marque os eventos e cada um vira uma SAÍDA no nó do canvas. */}
      {auto.trigger === "checkout" && (
        <div className="field">
          <label>O que faz o fluxo disparar (marque as saídas)</label>
          <div className="sw-eventos">
            {EVENTOS_CHECKOUT.map((ev) => {
              const on = (auto.eventos ?? []).includes(ev);
              // Evento que a integração escolhida NÃO envia: marcar criaria uma saída morta.
              const tem = eventoDisponivel(ev, auto.plataforma);
              return (
                <label key={ev} className={"sw-evento" + (on ? " on" : "") + (tem ? "" : " off")}
                  title={tem ? undefined : `A ${(auto.plataforma || "kiwify").toUpperCase()} não envia este evento — a saída nunca dispararia.`}>
                  <input type="checkbox" checked={on} disabled={!tem && !on}
                    onChange={(e) => onChange((a) => {
                      const atuais = a.eventos ?? [];
                      // Mantém a ordem do cardápio — as saídas do nó não ficam dançando a cada clique.
                      const novos = e.target.checked
                        ? EVENTOS_CHECKOUT.filter((x) => x === ev || atuais.includes(x))
                        : atuais.filter((x) => x !== ev);
                      return { ...a, eventos: novos };
                    })} />
                  <span>{TRIGGERS[ev]?.label ?? ev}</span>
                  {!tem && <span className="sw-nao-envia">a integração não envia</span>}
                </label>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Cada evento marcado vira uma <b>saída própria</b> no nó — ligue cada uma no caminho dela
            (compra aprovada segue por um lado, carrinho abandonado por outro). Um evento marcado
            <b> sem nada ligado</b> na saída dele cai no caminho de baixo, o padrão.
            {!(auto.eventos ?? []).length && <><br /><b style={{ color: "var(--warn)" }}>Marque pelo menos um</b> — sem isso o fluxo não dispara.</>}
          </div>
        </div>
      )}

      {/* De qual integração aceitar o evento (vale pro switch e pros gatilhos de venda antigos). */}
      {ehGatilhoDeCheckout(auto.trigger) && (
        <div className="field">
          <label>De qual integração</label>
          <select className="inp" value={auto.plataforma ?? ""} onChange={(e) => onChange((a) => ({ ...a, plataforma: e.target.value || undefined }))}>
            <option value="">Qualquer integração conectada</option>
            {PLATAFORMAS_CHECKOUT.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.pronta}>{p.label}{p.pronta ? "" : " (em breve)"}</option>
            ))}
          </select>
          <div className="muted" style={{ fontSize: 12 }}>
            Hoje só a <b>Kiwify</b> tem leitura pronta. Escolhendo uma integração, o fluxo <b>só dispara
            com evento dela</b>; deixando “qualquer”, aceita de todas. Dá pra usar a configuração geral
            de <b>Integrações</b> OU o webhook próprio deste fluxo, logo abaixo.
          </div>
        </div>
      )}

      {auto.trigger === "checkout" && <FiltroProdutos auto={auto} onChange={onChange} />}
      {auto.trigger === "checkout" && <EspelhoWebhook auto={auto} onChange={onChange} />}
      {auto.trigger === "checkout" && !auto.webhookDe && <CheckoutWebhook auto={auto} />}

      {auto.trigger === "keyword" || auto.trigger === "group_keyword" || auto.trigger === "primeiro_contato" ? (
        <>
          {auto.trigger === "primeiro_contato" && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Dispara sozinho quando alguém <b>te chama pela primeira vez</b> no WhatsApp — sem precisar digitar nada. É o atendimento automático de quem chega do nada.
            </div>
          )}
          <div className="field">
            <label>{auto.trigger === "primeiro_contato" ? "Palavra-chave extra (opcional — pra você testar quando quiser)" : "Palavra-chave (o cliente digita isto)"}</label>
            <input className="inp" value={auto.keyword ?? ""} placeholder="teste" onChange={(e) => onChange((a) => ({ ...a, keyword: e.target.value }))} />
          </div>
          {/* Como comparar. O motor SEMPRE soube fazer os dois (keywordMatch), mas o painel não
              mostrava — quem precisava de "contém" (frase de anúncio, saudação no meio do texto)
              não tinha como configurar sem mexer no JSON. */}
          <div className="field">
            <label>Como comparar</label>
            <select className="inp" value={auto.keywordMatch ?? "exact"}
              onChange={(e) => onChange((a) => ({ ...a, keywordMatch: e.target.value as "exact" | "contains" }))}>
              <option value="exact">Mensagem é EXATAMENTE isso</option>
              <option value="contains">Mensagem CONTÉM isso (trecho no meio do texto)</option>
            </select>
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {auto.keywordMatch === "contains" ? (
              <>
                Dispara quando o <b>trecho aparece dentro</b> da mensagem — serve pra frase de botão de anúncio,
                por exemplo. Maiúsculas, acentos de pontuação e emojis <b>não atrapalham</b>: a comparação é por
                palavras inteiras, na ordem. Ex.: <code>vim pela página e quero saber mais</code> pega
                “Olá! <b>Vim pela página e quero saber mais</b> sobre o Let&apos;s Go Up Chat.”.
                {" "}<b>Dica:</b> escolha um trecho sem apóstrofo/símbolo (eles variam entre celulares) e
                específico o bastante pra não pegar conversa comum.
              </>
            ) : auto.trigger === "primeiro_contato" ? (
              "Com uma palavra preenchida, o MESMO fluxo também dispara quando alguém digitar ela — inclusive quem já é seu contato. Maiúsculas/minúsculas não importam."
            ) : (
              "Dispara quando a mensagem for exatamente essa palavra (maiúsculas/minúsculas não importam). Pra pegar uma frase dentro de um texto maior, troque pra CONTÉM acima."
            )}
            {" "}Separe por vírgula pra aceitar mais de uma.
          </div>
          {/* 🎤 COMANDO POR VOZ. Muita gente não digita — manda áudio. Sem isto o áudio não casa
              palavra-chave nenhuma e o fluxo simplesmente não dispara. Fica DESLIGADO por padrão
              porque transcrever custa por minuto: quem tem fluxo de comando liga, o resto não paga. */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 10, lineHeight: 1.45 }}>
            <input type="checkbox" checked={!!auto.audioComoTexto}
              onChange={(e) => onChange((a) => ({ ...a, audioComoTexto: e.target.checked }))} />
            <span>Aceitar comando por <b>áudio</b> (transcreve a nota de voz e testa a palavra-chave no que a pessoa falou)</span>
          </label>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
            Serve pra fluxo de <b>comando</b> (“desbloqueia meu carro”, “quero meu boleto”). A transcrição é paga por
            minuto de áudio, então ligue só nos fluxos que precisam.
          </div>
        </>
      ) : auto.trigger === "schedule" ? (
        <ScheduleTrigger auto={auto} onChange={onChange} />
      ) : auto.trigger === "webhook" ? (
        <WebhookTrigger auto={auto} onChange={onChange} />
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          O fluxo dispara quando esse evento chega da plataforma de venda (ex.: Kiwify) e envia os passos abaixo, na ordem, pro cliente.
        </div>
      )}
    </div>
  );
}

// ══ EDITOR DO NÓ DE CÓDIGO ═══════════════════════════════════════════════════════════════════
// Layout inspirado no n8n (entrada · código · saída, com "executar"), porque é o que torna código
// testável por quem não é programador: dá pra ver o que ENTRA, mexer, rodar e ver o que SAI, sem
// publicar nada. A entrada vem do exemplo guardado no gatilho — os mesmos dados da produção.
function CodeEditor({ s, onChange, campos }: {
  s: Extract<StepBody, { type: "code" }>;
  onChange: (v: StepBody) => void;
  campos: Record<string, string>;
}) {
  const [rodando, setRodando] = useState(false);
  const [saida, setSaida] = useState<{ ok: boolean; campos?: Record<string, string>; logs?: string[]; erro?: string } | null>(null);
  const temEntrada = Object.keys(campos).length > 0;

  async function executar() {
    setRodando(true); setSaida(null);
    try { setSaida(await jsend("/api/code/testar", "POST", { codigo: s.codigo, campos })); }
    catch (e: any) { setSaida({ ok: false, erro: e.message }); }
    setRodando(false);
  }

  return (
    <>
      <div className="ask-note">
        🧩 <b>Trata os dados com JavaScript.</b> O que estiver em <code>{"$campos"}</code> entra;
        o que você <code>return</code> vira variável nova pros passos seguintes. Não envia nada.
      </div>

      {/* ENTRADA — o que o código vai receber, dos dados reais do gatilho */}
      <div className="field">
        <label>Entrada <span className="muted">(o que já existe no fluxo)</span></label>
        {temEntrada ? (
          <div className="code-io">
            {Object.entries(campos).slice(0, 40).map(([k, v]) => (
              <div key={k} className="code-io-linha"><code>{`$campos.${k}`}</code><span>{String(v).slice(0, 60)}</span></div>
            ))}
            {Object.keys(campos).length > 40 && <div className="muted" style={{ fontSize: 11 }}>…e mais {Object.keys(campos).length - 40}</div>}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Sem dados de exemplo ainda. Clique no <b>nó do gatilho</b> e cole um exemplo do JSON —
            aí o código roda aqui com os dados de verdade.
          </div>
        )}
      </div>

      <div className="field">
        <label>Código</label>
        <textarea className="inp code-editor" spellCheck={false} value={s.codigo}
          placeholder={"// Ex.: formatar valor e calcular vencimento\nconst valor = Number($campos.valor);\nreturn {\n  valor_formatado: valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),\n};"}
          onChange={(e) => onChange({ ...s, codigo: e.target.value })} />
        <button type="button" className="btn primary" style={{ marginTop: 7, width: "100%", justifyContent: "center" }}
          onClick={executar} disabled={rodando || !s.codigo.trim()}>
          {rodando ? "executando…" : <><Icon name="play" size={13} /> executar e ver o resultado</>}
        </button>
      </div>

      {/* SAÍDA */}
      {saida && (
        <div className="field">
          <label>Saída</label>
          {saida.erro ? (
            <div className="code-io erro"><b>Erro:</b> {saida.erro}</div>
          ) : Object.keys(saida.campos ?? {}).length ? (
            <div className="code-io">
              {Object.entries(saida.campos ?? {}).map(([k, v]) => (
                <div key={k} className="code-io-linha"><ChipVar nome={k} /><span>{String(v).slice(0, 80)}</span></div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 11.5 }}>
              Rodou sem erro, mas não devolveu campo. Use <code>return {"{ nome: valor }"}</code> pra
              criar variáveis.
            </div>
          )}
          {!!saida.logs?.length && (
            <div className="code-io logs">
              {saida.logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
        Roda num <b>interpretador isolado</b>: sem internet, sem arquivos, sem acesso ao servidor —
        só cálculo em cima dos dados do fluxo. Para em <b>1 segundo</b>, então laço infinito não
        trava nada. Se o código der erro, o fluxo <b>segue</b> sem os campos dele (e o erro aparece
        nos Logs ao vivo).
      </div>
    </>
  );
}

// ══ GATILHO POR HORÁRIO (cron) ═══════════════════════════════════════════════════════════════
// Equivalente do "Schedule Trigger" do n8n. Diferente de TODOS os outros gatilhos, aqui não
// existe lead: ninguém escreveu, nenhum sistema chamou. Então o destino tem que ser escolhido
// AQUI — é a pergunta que o n8n não faz (lá o envio é um nó depois) e que sem resposta faria o
// fluxo rodar no vazio.
//
// A UI é por PRESET, não por cron cru: "todo dia às 09:00" é o que a pessoa quer dizer. O campo
// de cron fica atrás de um link, pra quem importou do n8n e quer conferir/ajustar a expressão.
const DIAS_SEMANA = [
  { n: 1, curto: "seg" }, { n: 2, curto: "ter" }, { n: 3, curto: "qua" },
  { n: 4, curto: "qui" }, { n: 5, curto: "sex" }, { n: 6, curto: "sáb" }, { n: 0, curto: "dom" },
];

// Lê um cron simples de volta pros controles. Só entende o que os presets geram — qualquer coisa
// mais exótica (vinda do n8n) cai em "avançado" e a pessoa edita a expressão direto.
function leCron(expr: string): { modo: "dia" | "semana" | "avancado"; hhmm: string; dias: number[] } {
  const partes = String(expr ?? "").trim().split(/\s+/);
  const campos = partes.length === 6 ? partes.slice(1) : partes;
  if (campos.length !== 5) return { modo: "avancado", hhmm: "09:00", dias: [1, 2, 3, 4, 5] };
  const [min, hr, dia, mes, dow] = campos;
  const simples = /^\d{1,2}$/.test(min) && /^\d{1,2}$/.test(hr) && dia === "*" && mes === "*";
  if (!simples) return { modo: "avancado", hhmm: "09:00", dias: [1, 2, 3, 4, 5] };
  const hhmm = `${String(Number(hr)).padStart(2, "0")}:${String(Number(min)).padStart(2, "0")}`;
  if (dow === "*") return { modo: "dia", hhmm, dias: [] };
  const dias: number[] = [];
  for (const p of dow.split(",")) {
    if (/^\d$/.test(p)) dias.push(Number(p));
    else if (/^\d-\d$/.test(p)) { const [a, b] = p.split("-").map(Number); for (let i = a; i <= b; i++) dias.push(i); }
    else return { modo: "avancado", hhmm, dias: [] };
  }
  return { modo: "semana", hhmm, dias };
}

function montaCron(modo: "dia" | "semana", hhmm: string, dias: number[]): string {
  const [h, m] = (hhmm || "09:00").split(":");
  const dow = modo === "semana" && dias.length ? [...dias].sort((a, b) => a - b).join(",") : "*";
  return `${Number(m)} ${Number(h)} * * ${dow}`;
}

// Frase em português do que está configurado — é o que prova que a pessoa entendeu o cron.
function explicaCron(expr: string): string {
  const l = leCron(expr);
  if (l.modo === "avancado") return `recorrência personalizada (${expr})`;
  const hora = `às ${l.hhmm}`;
  if (l.modo === "dia") return `todo dia ${hora}`;
  const nomes = l.dias.map((d) => DIAS_SEMANA.find((x) => x.n === d)?.curto ?? d).join(", ");
  return nomes ? `${hora}, toda ${nomes}` : `todo dia ${hora}`;
}

function ScheduleTrigger({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const cron = auto.scheduleCron ?? "0 9 * * *";
  const lido = leCron(cron);
  const [modo, setModo] = useState<"dia" | "semana" | "avancado">(lido.modo);
  const [avancadoAberto, setAvancadoAberto] = useState(lido.modo === "avancado");
  const { accounts } = useAccounts();
  const lites = accounts.filter((a) => a.type === "LITE");
  const { groupList, refresh, refreshing, groupsErr } = useGroupList(auto.scheduleAccount);
  const [paraGrupo, setParaGrupo] = useState((auto.scheduleTarget ?? "").endsWith("@g.us"));
  // Destino fixo x "quem recebe vem dos passos" (o padrão do n8n: o Schedule só marca a hora).
  const [destinoFixo, setDestinoFixo] = useState(!!(auto.scheduleTarget ?? "").trim());

  const setCron = (novo: string) => onChange((a) => ({ ...a, scheduleCron: novo } as Automation));
  const trocaModo = (m: "dia" | "semana") => {
    setModo(m); setAvancadoAberto(false);
    setCron(montaCron(m, lido.hhmm, m === "semana" ? (lido.dias.length ? lido.dias : [1, 2, 3, 4, 5]) : []));
  };

  return (
    <>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        O fluxo dispara <b>sozinho no horário marcado</b> — sem ninguém escrever e sem sistema de fora.
        Serve pra cobrança recorrente, lembrete de renovação, bom-dia de equipe. É o
        <b> Schedule Trigger</b> de quem vem do n8n.
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label>Quando disparar</label>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className={"btn" + (modo === "dia" && !avancadoAberto ? " primary" : "")}
            style={{ flex: 1, justifyContent: "center" }} onClick={() => trocaModo("dia")}>todo dia</button>
          <button type="button" className={"btn" + (modo === "semana" && !avancadoAberto ? " primary" : "")}
            style={{ flex: 1, justifyContent: "center" }} onClick={() => trocaModo("semana")}>dias da semana</button>
        </div>
      </div>

      {!avancadoAberto && (
        <>
          <div className="field">
            <label>Horário</label>
            <input className="inp" type="time" value={lido.hhmm} style={{ maxWidth: 140 }}
              onChange={(e) => setCron(montaCron(modo === "semana" ? "semana" : "dia", e.target.value, lido.dias))} />
          </div>
          {modo === "semana" && (
            <div className="field">
              <label>Em quais dias</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {DIAS_SEMANA.map((d) => {
                  const on = lido.dias.includes(d.n);
                  return (
                    <button key={d.n} type="button" className={"btn" + (on ? " primary" : "")}
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => {
                        const novos = on ? lido.dias.filter((x) => x !== d.n) : [...lido.dias, d.n];
                        setCron(montaCron("semana", lido.hhmm, novos));
                      }}>{d.curto}</button>
                  );
                })}
              </div>
              {lido.dias.length === 0 && (
                <div className="muted" style={{ fontSize: 11.5, marginTop: 5, color: "var(--warn)" }}>
                  Nenhum dia marcado — assim ele dispara <b>todo dia</b>. Marque pelo menos um.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {avancadoAberto ? (
        <div className="field">
          <label>Expressão (cron)</label>
          <input className="inp" value={cron} placeholder="0 12 * * 1-6" style={{ fontFamily: "var(--mono)" }}
            onChange={(e) => setCron(e.target.value)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
            Formato: <code>minuto hora dia-do-mês mês dia-da-semana</code> (domingo = 0). É o mesmo que
            o n8n exporta, então dá pra colar de lá. Ex.: <code>0 12 * * 1-6</code> = meio-dia, de segunda a sábado.
          </div>
          <button type="button" onClick={() => { setAvancadoAberto(false); const l = leCron(cron); setModo(l.modo === "avancado" ? "dia" : l.modo); }}
            style={{ background: "none", border: "none", padding: 0, marginTop: 6, color: "var(--accent)", textDecoration: "underline", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
            ← voltar pro modo simples
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAvancadoAberto(true)}
          style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
          precisa de uma recorrência mais específica? (cron) →
        </button>
      )}

      {/* 📮 DESTINO É OPCIONAL — igual ao Schedule Trigger do n8n, que só diz QUANDO.
          Exigir um telefone aqui quebrava o caso mais comum de fluxo agendado: buscar uma LISTA
          (cobranças vencidas do Asaas, planilha, API) e falar com CADA pessoa dela — quem recebe
          sai do dado, não de um número fixo. Era o que travava o fluxo de cobrança de um cliente.
          Continua valendo pro caso simples (bom-dia da equipe num grupo, lembrete pro dono). */}
      <div className="field">
        <label>Para quem envia (opcional)</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button type="button" className={"btn" + (!destinoFixo ? " primary" : "")} style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setDestinoFixo(false); setParaGrupo(false); onChange((a) => ({ ...a, scheduleTarget: "" } as Automation)); }}>
            vem dos passos
          </button>
          <button type="button" className={"btn" + (destinoFixo && !paraGrupo ? " primary" : "")} style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setDestinoFixo(true); setParaGrupo(false); onChange((a) => ({ ...a, scheduleTarget: "" } as Automation)); }}>
            um número
          </button>
          <button type="button" className={"btn" + (destinoFixo && paraGrupo ? " primary" : "")} style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setDestinoFixo(true); setParaGrupo(true); onChange((a) => ({ ...a, scheduleTarget: "" } as Automation)); }}>
            um grupo
          </button>
        </div>
        {!destinoFixo ? (
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            O gatilho só marca <b>a hora</b>. Quem recebe é decidido nos passos seguintes — é assim que
            funciona um fluxo de cobrança: buscar as cobranças vencidas, separar a lista e o <b>Loop</b>
            falar com cada cliente. Nesse caso não escolha número nenhum aqui.
          </div>
        ) : paraGrupo ? (
          <GroupSelect value={auto.scheduleTarget ?? ""} onChange={(jid) => onChange((a) => ({ ...a, scheduleTarget: jid } as Automation))}
            groupList={groupList} onRefresh={refresh} refreshing={refreshing} error={groupsErr} />
        ) : (
          <input className="inp" inputMode="tel" placeholder="+55 (11) 98999-8888"
            value={mascaraFone(auto.scheduleTarget ?? "")}
            onChange={(e) => onChange((a) => ({ ...a, scheduleTarget: soDigitosFone(e.target.value) } as Automation))} />
        )}
        {destinoFixo && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
            Destino fixo: todo disparo vai pra esse mesmo número/grupo (bom-dia da equipe, lembrete
            pra você). Os passos de mensagem falam com ele.
          </div>
        )}
      </div>

      <div className="field">
        <label>Por qual número enviar</label>
        <select className="inp" value={auto.scheduleAccount ?? ""}
          onChange={(e) => onChange((a) => ({ ...a, scheduleAccount: e.target.value || undefined } as Automation))}>
          <option value="">— a conta padrão desta área —</option>
          {lites.map((a) => <option key={a.id} value={a.id}>{a.name}{a.number ? ` · ${fmtNumber(a.number)}` : ""}</option>)}
        </select>
      </div>

      <div className="ask-note">
        ⏰ <b>Vai disparar {explicaCron(cron)}</b>
        {auto.scheduleTarget
          ? <> para <b>{auto.scheduleTarget.endsWith("@g.us") ? "o grupo escolhido" : mascaraFone(auto.scheduleTarget)}</b>.</>
          : <> e seguir pros passos abaixo — <b>quem recebe sai deles</b>.</>}
        <br />Horário de <b>Araguaína</b> (o mesmo dos lembretes). O fluxo só dispara <b>publicado</b>;
        como rascunho ele fica parado.
      </div>
    </>
  );
}

// Gatilho por WEBHOOK: mostra a URL pronta pra colar no formulário/sistema de fora e explica
// quais campos mandar. O token é por fluxo — o botão gera/troca (trocar invalida a URL antiga).
// Ao abrir, busca a URL que JÁ existe (GET não rotaciona o token). O "Escutar" faz polling no
// motor até chegar um POST de verdade e mostra telefone + variáveis — estilo teste do Zapier.
// UM tipo só pros dois gatilhos (webhook e checkout). Eram dois, e é o que deixava o nó de
// checkout de fora do teste de percurso: a captura dele não cabia no que o canvas espera.
// `resumo`/`evento`/`produto` só vêm no checkout — é o evento mastigado (Nome, Produto, Valor…).
type EspiadaWebhook = {
  at: number;
  status: "ok" | "sem_telefone" | "rascunho" | "filtrado" | "evento_desmarcado" | "sem_parser" | "duplicado" | "assinatura_invalida" | "sem_assinatura";
  telefone?: string;
  fields?: Record<string, string>;
  raw?: string;
  simulado?: boolean;
  resumo?: Array<{ rotulo: string; variavel?: string; valor: string }>;
  evento?: string;
  produto?: string;
};

// ── Véu de escuta: a tela INTEIRA espera o evento ────────────────────────────────────────────
// Pedido do dono (25/08): escutar não é um estado paralelo — enquanto o painel espera o POST
// de teste, mexer no fluxo só atrapalha e a pessoa esquece que a escuta está ligada. Vidro fosco
// por cima de tudo, o spinner no meio, e QUALQUER clique fora do cartão PARA a escuta — pra
// voltar a escutar, é clicar em "escutar" de novo. Esc também para (mesmo gesto dos modais).
// Portal no body: o painel lateral tem contexto de empilhamento próprio e prenderia o véu.
function EscutaVeu({ texto, onParar }: { texto: React.ReactNode; onParar: () => void }) {
  const pararRef = useRef(onParar);
  pararRef.current = onParar;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") pararRef.current(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  return createPortal(
    <div className="escuta-veu" role="status" onClick={() => pararRef.current()}>
      <div className="escuta-cartao" onClick={(e) => e.stopPropagation()}>
        <span className="wh-spin" aria-hidden />
        <b>Escutando…</b>
        <div>{texto}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>clique em qualquer lugar fora pra parar a escuta</div>
      </div>
    </div>,
    document.body,
  );
}

function CheckoutWebhook({ auto }: { auto: Automation }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [escutando, setEscutando] = useState(false);
  const [cansou, setCansou] = useState(false);
  const [copiadoVar, setCopiadoVar] = useState("");
  const gd = useContext(GatilhoDados); // pra empurrar os dados capturados pros passos seguintes
  const [segredo, setSegredo] = useState("");
  const [segredoOk, setSegredoOk] = useState(false); // já existe um salvo (o valor nunca volta)
  const [salvandoSeg, setSalvandoSeg] = useState(false);
  const [msgSeg, setMsgSeg] = useState("");
  const escutaRef = useRef(0);
  // A captura vive no FlowBuilder, igual à do gatilho de webhook: é ela que o teste de percurso
  // lê no canvas (com este painel fechado) e é ela que fica GRAVADA no fluxo — o evento que você
  // capturou hoje continua aqui amanhã, depois de recarregar e depois de um deploy.
  const tc = useContext(TesteCtx);
  const chegou = tc?.captura ?? null;
  const setChegou = (c: EspiadaWebhook | null) => tc?.setCaptura(c);

  useEffect(() => {
    let vivo = true;
    jget(`/api/flow-webhook-token?automationId=${encodeURIComponent(auto.id)}`)
      .then((r) => { if (!vivo) return; if (r.url) setUrl(r.url); setSegredoOk(!!r.segredoConfigurado); })
      .catch(() => { /* fluxo ainda não salvo — o botão gerar cobre */ });
    return () => { vivo = false; escutaRef.current++; };
  }, [auto.id]);

  async function gerar(trocando = false) {
    // Trocar INVALIDA o endereço anterior — quem já colou na Kiwify para de funcionar na hora.
    // Por isso confirma antes: é destrutivo e silencioso do outro lado.
    if (trocando && !window.confirm(
      "Gerar um endereço NOVO?\n\nO endereço atual para de funcionar na hora. "
      + "Você vai precisar colar o novo lá na Kiwify (Apps → Webhooks → editar), "
      + "senão os eventos param de chegar.",
    )) return;
    setGerando(true); setErro("");
    try {
      const r = await jsend("/api/flow-webhook-token", "POST", { automationId: auto.id });
      setUrl(r.url);
      if (trocando) { setChegou(null); setCansou(false); }
      // Já deixa na área de transferência: o passo seguinte é sempre colar lá.
      try { await navigator.clipboard.writeText(r.url); setCopiado(true); setTimeout(() => setCopiado(false), 2200); } catch { /* sem permissão */ }
    } catch (e: any) {
      setErro(/não encontrado/i.test(String(e.message)) ? "Salve o fluxo primeiro (botão Salvar lá em cima) e tente de novo." : e.message);
    }
    setGerando(false);
  }
  async function salvaSegredo(valor: string) {
    setSalvandoSeg(true); setMsgSeg("");
    try {
      const r = await jsend("/api/flow-webhook-secret", "POST", { automationId: auto.id, segredo: valor });
      setSegredoOk(!!r.segredoConfigurado);
      setSegredo("");
      setMsgSeg(r.segredoConfigurado ? "Token salvo — só evento assinado pela Kiwify passa a valer." : "Token removido.");
      setTimeout(() => setMsgSeg(""), 4000);
    } catch (e: any) { setMsgSeg(e.message); }
    setSalvandoSeg(false);
  }
  async function copiar() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão */ }
  }
  async function copiaVar(v: string) {
    try { await navigator.clipboard.writeText(v); setCopiadoVar(v); setTimeout(() => setCopiadoVar(""), 1500); } catch { /* sem permissão */ }
  }

  // ── Mexer no evento capturado ──────────────────────────────────────────────────────────────
  // Editar um valor é como se testa OUTRO caminho sem pedir uma venda nova: trocar o produto pra
  // ver o filtro segurar, trocar o valor pra conferir o texto. Salva junto com a captura.
  const salvaCampos = useRef<ReturnType<typeof setTimeout> | null>(null);
  function editaCampo(chave: string, valor: string) {
    if (!chegou) return;
    const campos = { ...(chegou.fields ?? {}), [chave]: valor };
    const resumo = chegou.resumo?.map((li) =>
      li.variavel && li.variavel.replace(/[{}]/g, "") === chave ? { ...li, valor } : li);
    setChegou({ ...chegou, fields: campos, telefone: campos.telefone || chegou.telefone, ...(resumo ? { resumo } : {}) });
    if (salvaCampos.current) clearTimeout(salvaCampos.current);
    salvaCampos.current = setTimeout(() => {
      jsend("/api/flow-webhook-simulate", "POST", { automationId: auto.id, campos }).catch(() => { /* melhor esforço */ });
    }, 700);
  }
  const [copiouPayload, setCopiouPayload] = useState(false);
  async function copiarPayload() {
    if (!chegou) return;
    const texto = chegou.raw ?? JSON.stringify(chegou.fields ?? {}, null, 2);
    try { await navigator.clipboard.writeText(texto); setCopiouPayload(true); setTimeout(() => setCopiouPayload(false), 1800); } catch { /* sem permissão */ }
  }
  async function apagarCaptura() {
    try { await jsend("/api/flow-webhook-clear", "POST", { automationId: auto.id }); } catch { /* melhor esforço */ }
    setChegou(null); setCansou(false);
  }

  // "Colar payload": pra quem já tem o JSON do evento em mãos (copiou de outro teste, a plataforma
  // mandou por e-mail) — cola aqui e vira o exemplo, sem esperar escuta e sem disparar nada.
  const [colando, setColando] = useState(false);
  const [payloadTxt, setPayloadTxt] = useState("");
  const [simulando, setSimulando] = useState(false);
  const [erroPayload, setErroPayload] = useState("");
  async function usarPayload() {
    let corpo: any;
    try { corpo = JSON.parse(payloadTxt); } catch { setErroPayload("Isso não é um JSON válido — confere se copiou inteiro (começa com { e termina com })."); return; }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) { setErroPayload("O payload precisa ser um objeto JSON: { ... }"); return; }
    setSimulando(true); setErroPayload("");
    try {
      const r = await jsend("/api/flow-webhook-simulate", "POST", { automationId: auto.id, payload: corpo });
      if (r.event) setChegou(r.event);
      setColando(false); setPayloadTxt(""); setCansou(false);
    } catch (e: any) {
      setErroPayload(/não encontrado/i.test(String(e.message)) ? "Salve o fluxo primeiro (botão Salvar lá em cima) e tente de novo." : e.message);
    }
    setSimulando(false);
  }

  // DISPARO DE VERDADE: repete o evento no endereço real do fluxo, com as edições aplicadas por
  // cima do JSON original — assim o que você mudou na lista é o que sai, e simulação e disparo
  // não discordam em silêncio. Quem assina (quando há token da Kiwify) é o motor.
  const [disparando, setDisparando] = useState(false);
  const [respDisparo, setRespDisparo] = useState("");
  async function dispararDeVerdade() {
    let pronto: { corpo: any; naoAplicados: string[] } | null = null;
    try { if (chegou?.raw) pronto = aplicaEdicoesDoCheckout(JSON.parse(chegou.raw), chegou.fields ?? {}); } catch { pronto = null; }
    if (!pronto) { setRespDisparo("Não tenho o JSON original deste evento — capture de novo na escuta (ou cole o payload) pra poder disparar."); return; }
    const tel = chegou?.telefone || "(sem telefone)";
    const ressalva = pronto.naoAplicados.length
      ? `\n\nAtenção: a plataforma manda ${pronto.naoAplicados.join(", ")} no formato dela, então sua edição desses campos vale só na simulação — no disparo vai o valor original.`
      : "";
    if (!window.confirm(
      `Isto repete a venda DE VERDADE e envia WhatsApp para ${tel}, pela conta conectada deste fluxo.\n\n`
      + "Vai passar pelo caminho real: mesmo endereço, mesmo motor, mesma conta." + ressalva + "\n\nContinuar?",
    )) return;
    setDisparando(true); setRespDisparo("");
    try {
      const r = await jsend("/api/flow-webhook-fire", "POST", { automationId: auto.id, payload: pronto.corpo });
      setRespDisparo(r.ok
        ? `Disparado — o webhook aceitou (HTTP ${r.status}). A mensagem sai pela conta conectada; confira o WhatsApp de ${tel}.`
        : `O webhook recusou (HTTP ${r.status}): ${r.resposta || "sem detalhe"}`);
    } catch (e: any) { setRespDisparo(e.message); }
    setDisparando(false);
  }

  async function escutar() {
    const id = ++escutaRef.current;
    setEscutando(true); setChegou(null); setCansou(false); setErro("");
    try {
      const base = await jget(`/api/flow-webhook-last?automationId=${encodeURIComponent(auto.id)}&since=0`);
      const since = Number(base.now ?? 0);
      for (let i = 0; i < 150; i++) { // ~5 min
        await new Promise((r) => setTimeout(r, 2000));
        if (escutaRef.current !== id) return;
        const r = await jget(`/api/flow-webhook-last?automationId=${encodeURIComponent(auto.id)}&since=${since}`).catch(() => null);
        if (escutaRef.current !== id) return;
        if (r?.event) { setChegou(r.event); setEscutando(false); return; }
      }
      if (escutaRef.current === id) { setEscutando(false); setCansou(true); }
    } catch (e: any) {
      if (escutaRef.current === id) { setErro(e.message); setEscutando(false); }
    }
  }
  function pararEscuta() { escutaRef.current++; setEscutando(false); }

  return (
    <div className={"field ck-webhook" + (escutando ? " pulsando" : "")}>
      <label>Webhook deste fluxo (cole na plataforma de venda)</label>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
        Este fluxo tem o <b>próprio endereço</b>: na Kiwify, vá em <b>Apps → Webhooks → Criar webhook</b>,
        cole a URL abaixo e marque os eventos. O que chegar aqui dispara <b>só este fluxo</b> — sem
        depender da configuração geral de Integrações.
      </div>
      {url ? (
        <>
          {/* Clicar NO endereço já copia — é sempre o passo seguinte (colar lá na Kiwify). */}
          <textarea
            className="inp ck-url"
            readOnly
            value={url}
            title="Clique para copiar"
            style={{ minHeight: 62, fontSize: 11.5, cursor: "pointer" }}
            onClick={() => { void copiar(); }}
            onFocus={(e) => e.currentTarget.select()}
          />
          {copiado && <div className="ck-copiado">endereço copiado ✓</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => { void copiar(); }}>{copiado ? "copiado ✓" : "copiar endereço"}</button>
            <button type="button" className="btn" onClick={() => { void gerar(true); }} disabled={gerando}
              title="Cria um endereço novo e derruba o atual">
              {gerando ? "gerando…" : "gerar novo endereço"}
            </button>
            {escutando ? (
              <button type="button" className="btn" onClick={pararEscuta}>parar a escuta</button>
            ) : (
              <button type="button" className="btn primary" onClick={escutar}>
                {chegou || cansou ? "escutar de novo" : "escutar — esperar um teste da plataforma"}
              </button>
            )}
          </div>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => { void gerar(false); }} disabled={gerando}>
          {gerando ? "gerando…" : "gerar o endereço deste fluxo"}
        </button>
      )}
      {erro && <div style={{ color: "var(--crit)", fontSize: 12, marginTop: 6 }}>{erro}</div>}

      {/* TOKEN DA PLATAFORMA — a Kiwify assina cada webhook com ele. Com o token salvo, evento sem
          assinatura válida é RECUSADO: só a Kiwify consegue disparar este fluxo. */}
      {url && (
        <div className="ck-segredo">
          <label style={{ marginBottom: 4 }}>Token da Kiwify (segurança — recomendado)</label>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 6 }}>
            Na mesma tela onde você cola a URL, a Kiwify mostra um <b>Token</b>. Cole ele aqui: o motor
            passa a conferir a <b>assinatura</b> de cada evento e recusa qualquer coisa que não venha
            mesmo da Kiwify. Sem isso, quem descobrir o endereço consegue simular uma venda.
            {segredoOk && <> <b style={{ color: "var(--accent-deep)" }}>Já configurado</b> — o valor fica guardado criptografado e não é exibido de volta.</>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="inp"
              style={{ flex: "1 1 200px" }}
              type="password"
              autoComplete="off"
              placeholder={segredoOk ? "•••••••••• (trocar)" : "ex.: 567lvsnxr9p"}
              value={segredo}
              onChange={(e) => setSegredo(e.target.value)}
            />
            <button type="button" className="btn primary" disabled={salvandoSeg || !segredo.trim()}
              onClick={() => void salvaSegredo(segredo)}>
              {salvandoSeg ? "salvando…" : "salvar token"}
            </button>
            {segredoOk && (
              <button type="button" className="btn" disabled={salvandoSeg}
                title="Volta a aceitar sem conferir assinatura"
                onClick={() => { if (window.confirm("Remover o token?\n\nO fluxo volta a aceitar qualquer POST que chegue no endereço, sem conferir se veio mesmo da Kiwify.")) void salvaSegredo(""); }}>
                remover
              </button>
            )}
          </div>
          {msgSeg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{msgSeg}</div>}
        </div>
      )}

      {escutando && (
        <EscutaVeu onParar={pararEscuta}
          texto={<>dispare o <b>teste de webhook</b> na sua plataforma de venda — ou gere um PIX de
            verdade — que o evento aparece aqui na hora, já traduzido.</>} />
      )}
      {cansou && !escutando && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          5 minutos sem nada — confere se a URL está colada na plataforma e se os eventos estão marcados lá.
        </div>
      )}
      {chegou && !escutando && (
        <div className="wh-chegou" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <span className="muted" style={{ flex: 1, minWidth: 0, fontSize: 11 }}>
              {chegou.simulado ? "Exemplo salvo no fluxo" : "Última captura"} ·{" "}
              {new Date(chegou.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={copiarPayload}
              title="Copiar o JSON completo do evento — pra guardar ou colar em outra ferramenta">
              {copiouPayload ? "copiado ✓" : "copiar payload"}
            </button>
            <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={apagarCaptura}
              title="Apagar este exemplo do fluxo (some de vez)">
              apagar
            </button>
          </div>
          <b>{chegou.simulado ? "Exemplo lido" : "Chegou"}{chegou.evento ? `: ${chegou.evento}` : "!"}</b>{" "}
          {chegou.simulado && chegou.status === "ok" && <>— telefone <b>{chegou.telefone}</b>. <b>Nada foi enviado</b>; as variáveis abaixo já valem pros textos.</>}
          {!chegou.simulado && chegou.status === "ok" && <>— e o fluxo <b>disparou de verdade</b> pro {chegou.telefone}.</>}
          {chegou.status === "filtrado" && <>— mas é do produto <b>{chegou.produto || "?"}</b>, que está <b>fora do filtro</b> abaixo. O fluxo não andou (é exatamente o combinado: recebe o dado, não dispara).</>}
          {chegou.status === "evento_desmarcado" && <>— mas esse evento <b>não está marcado</b> nas saídas do nó, então o fluxo não andou. Marque-o acima se quiser que dispare.</>}
          {chegou.status === "rascunho" && <>— mas o fluxo está como <b>rascunho</b>: nada foi enviado. Publique pra valer.</>}
          {chegou.status === "sem_telefone" && <>— mas veio <b>sem telefone</b> do cliente (teste da Kiwify às vezes vem incompleto). Com venda real o telefone vem.</>}
          {chegou.status === "duplicado" && <>— evento repetido (a Kiwify reenviou). O fluxo já tinha rodado pra esse pedido; não dispara duas vezes.</>}
          {chegou.status === "sem_parser" && <>— essa integração ainda não tem leitura própria; por enquanto o webhook próprio entende a <b>Kiwify</b>.</>}
          {chegou.status === "assinatura_invalida" && <>— mas a <b>assinatura não confere</b>: os dois lados têm token, só que são <b>tokens diferentes</b>. Abra o webhook na Kiwify, copie o Token que aparece lá e cole de novo no campo abaixo. <b>Nada foi enviado</b> pro cliente.</>}
          {chegou.status === "sem_assinatura" && <>— mas veio <b>sem assinatura nenhuma</b>: esse webhook na Kiwify está <b>sem Token cadastrado</b>, e aqui você exigiu um. Ou cadastre o mesmo token lá, ou <b>apague o token do campo abaixo</b> pra aceitar sem conferir. <b>Nada foi enviado</b> pro cliente.</>}
          {(chegou.resumo ?? []).length > 0 && (
            <div className="ck-resumo">
              <span className="muted" style={{ fontSize: 11.5 }}>
                O que esse evento te dá — clique na variável pra copiar, ou mande tudo pra frente:
              </span>
              {/* PLAY MANUAL (estilo n8n): empurra o que chegou pros passos seguintes. Os fios
                  ficam VERDES e cada passo passa a oferecer estes valores como chips clicáveis —
                  monta-se o fluxo vendo o dado REAL, sem decorar nome de variável. */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 4px" }}>
                <button type="button" className="btn primary"
                  onClick={() => gd?.enviar(chegou.resumo ?? [], chegou.evento ?? "evento")}>
                  Enviar dados pro próximo passo →
                </button>
                {gd?.dados && (
                  <button type="button" className="btn" onClick={() => gd.limpar()}>limpar o envio</button>
                )}
              </div>
              {gd?.dados && (
                <div className="ck-enviado">
                  Dados de <b>{gd.origem}</b> em circulação — os fios verdes mostram por onde eles
                  passam, e cada passo à frente já oferece esses valores pra clicar.
                </div>
              )}
              {(chegou.resumo ?? []).map((li, i) => (
                <div key={i} className="ck-linha">
                  <span className="ck-rotulo">{li.rotulo}</span>
                  <span className="ck-valor" title={li.valor}>{li.valor}</span>
                  {li.variavel && (
                    <button type="button" className="ck-var" onClick={() => copiaVar(li.variavel!)} title="Copiar a variável">
                      {copiadoVar === li.variavel ? "copiado ✓" : li.variavel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* AS VARIÁVEIS, EDITÁVEIS — a lista de cima é pra ler; esta é pra mexer. Trocar o
              produto aqui testa o filtro; trocar o valor confere o texto. Sem pedir venda nova. */}
          {Object.keys(chegou.fields ?? {}).length > 0 && (
            <div className="wh-vars">
              <span className="muted" style={{ fontSize: 11.5 }}>
                Variáveis pros textos — <b>pode editar</b> pra testar outro caminho do fluxo:
              </span>
              {Object.entries(chegou.fields ?? {}).map(([k, v]) => (
                <div key={k} className="wh-var edit">
                  <ChipVar nome={k} />
                  <textarea className="inp wh-var-inp" rows={1} value={v} onChange={(e) => editaCampo(k, e.target.value)}
                    title="Mudar este valor muda o caminho que o teste vai seguir · arraste o canto pra ler inteiro" />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn" style={{ width: "100%", justifyContent: "center" }}
              onClick={() => tc?.iniciarTudo()}
              title="Acende o caminho no quadro. NÃO manda mensagem nenhuma.">
              <Icon name="play" size={13} /> simular o caminho <span className="muted" style={{ fontWeight: 400 }}>(não envia)</span>
            </button>
            <button type="button" className="btn primary" style={{ width: "100%", justifyContent: "center" }}
              onClick={dispararDeVerdade} disabled={disparando || !chegou?.raw}
              title={chegou?.raw ? "Repete a venda no endereço real e envia mesmo" : "Capture ou cole um evento primeiro"}>
              {disparando ? "disparando…" : "enviar de verdade agora"}
            </button>
            {respDisparo && <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{respDisparo}</div>}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
            <b>Simular</b> só acende o caminho no quadro, pra conferir por onde o dado passa — não manda
            mensagem. <b>Enviar de verdade</b> repete a venda no endereço real: a mensagem sai mesmo, pela
            conta conectada. Pra ir passo a passo, use o <b>▶</b> em cima do nó do gatilho. Este exemplo
            fica <b>guardado no fluxo</b>: só some se você apagar, colar outro, ou chegar um evento novo
            na escuta.
          </div>
        </div>
      )}
      {/* Já tem o JSON do evento? Cola e vira o exemplo, sem esperar a plataforma disparar. */}
      {!escutando && (colando ? (
        <div style={{ marginTop: 8 }}>
          <textarea className="inp" value={payloadTxt} onChange={(e) => setPayloadTxt(e.target.value)}
            placeholder={'cole aqui o JSON do webhook da Kiwify — ex.: { "webhook_event_type": "pix_generated", "Customer": { ... } }'}
            style={{ minHeight: 96, fontSize: 11.5, fontFamily: "ui-monospace, monospace" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button type="button" className="btn" onClick={usarPayload} disabled={simulando || !payloadTxt.trim()}>
              {simulando ? "lendo…" : "usar este payload"}
            </button>
            <button type="button" className="btn" onClick={() => { setColando(false); setErroPayload(""); }}>cancelar</button>
          </div>
          {erroPayload && <div style={{ color: "var(--crit)", fontSize: 12, marginTop: 6 }}>{erroPayload}</div>}
        </div>
      ) : (
        <button type="button" onClick={() => setColando(true)}
          style={{ background: "none", border: "none", padding: 0, marginTop: 6, color: "var(--accent)", textDecoration: "underline", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
          já tem o JSON de um evento? cole ele aqui →
        </button>
      ))}
    </div>
  );
}

// ── Filtro de PRODUTO do gatilho de checkout ────────────────────────────────────────────────
// "Recuperação de carrinho SÓ do Workshop": com a lista preenchida, evento de outro produto chega
// (aparece na escuta) mas NÃO dispara o fluxo. Order bump: o evento vem com o produto do bump —
// adicione ele aqui quando quiser que também dispare.
// 🔎 O QUE VEIO NO ÚLTIMO PAYLOAD. Digitar o id de um produto na mão é onde o filtro quebra: um
// caractere errado e o fluxo simplesmente não dispara, sem erro nenhum pra explicar. Se o nó já
// escutou um evento de verdade (o JSON fica salvo em exemploWebhook), os ids e nomes que vieram
// nele viram sugestão nas duas caixas — é só clicar e escolher. Sem JSON salvo, nada aparece.
// Order bump entra aqui naturalmente: a Kiwify manda um evento por produto, então depois de
// escutar os dois, os dois nomes aparecem na lista (pedido do dono, 07/09).
function produtosDoPayload(auto: Automation): Array<{ id: string; nome: string }> {
  const bruto = (auto as any)?.exemploWebhook?.raw;
  if (!bruto) return [];
  let j: any;
  try { j = JSON.parse(bruto); } catch { return []; }
  const achados = new Map<string, { id: string; nome: string }>();
  // Varre o JSON inteiro (a Kiwify aninha em Product; outras plataformas põem na raiz ou em data).
  const anda = (v: any, prof: number) => {
    if (!v || typeof v !== "object" || prof > 4) return;
    if (Array.isArray(v)) { v.forEach((x) => anda(x, prof + 1)); return; }
    const id = String(v.product_id ?? v.productId ?? v.id ?? "").trim();
    const nome = String(v.product_name ?? v.productName ?? v.name ?? v.offer_name ?? v.product_offer_name ?? "").trim();
    // Só conta como "produto" quando tem NOME — senão qualquer objeto com id viraria sugestão.
    if (nome) achados.set(id + "|" + nome, { id, nome });
    for (const vv of Object.values(v)) anda(vv, prof + 1);
  };
  anda(j, 0);
  return [...achados.values()].slice(0, 20);
}

// 🪞 Receber pelo webhook de OUTRO fluxo: um endereço só na Kiwify alimenta vários fluxos (o da
// API Oficial E o do número Lite, por exemplo), cada um com o próprio número e filtro de produto.
// Com um dono escolhido, o endereço próprio deste fluxo some do painel — ele não precisa existir.
function EspelhoWebhook({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const [outros, setOutros] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let vivo = true;
    jget("/api/automations")
      .then((d) => {
        if (!vivo) return;
        const lista = ((d.automations ?? []) as Automation[])
          .filter((a) => a.id !== auto.id && a.trigger === "checkout" && !a.webhookDe)
          .map((a) => ({ id: a.id, name: String(a.name ?? a.id) }));
        setOutros(lista);
      })
      .catch(() => { /* sem lista = só a opção "não" */ });
    return () => { vivo = false; };
  }, [auto.id]);
  const atual = auto.webhookDe ?? "";
  const donoSumiu = !!atual && !outros.some((o) => o.id === atual);
  return (
    <div className="field">
      <label>Receber pelo webhook de outro fluxo</label>
      <select className="inp" value={atual} onChange={(e) => onChange((a) => ({ ...a, webhookDe: e.target.value || undefined }))}>
        <option value="">Não — este fluxo tem o próprio endereço (abaixo)</option>
        {donoSumiu && <option value={atual}>{atual} (fluxo não encontrado)</option>}
        {outros.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div className="muted" style={{ fontSize: 12 }}>
        Escolhendo um fluxo, todo evento que chegar no endereço <b>dele</b> também roda aqui — com o número,
        os eventos e o filtro de produto <b>deste</b> fluxo. Serve pra confirmar a mesma venda pela API Oficial
        e pelo WhatsApp Lite sem cadastrar dois webhooks na Kiwify.
      </div>
    </div>
  );
}

function FiltroProdutos({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const lista = auto.produtos ?? [];
  const sugestoes = produtosDoPayload(auto);
  const mexe = (i: number, parte: "id" | "nome", v: string) =>
    onChange((a) => ({ ...a, produtos: (a.produtos ?? []).map((x, j) => (j === i ? { ...x, [parte]: v } : x)) }));
  return (
    <div className="field">
      <label>Quais produtos disparam este fluxo</label>
      {lista.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          <b>Todos os produtos</b> disparam. Pra travar num produto só (ex.: recuperação de carrinho
          apenas do Workshop), adicione ele abaixo — por <b>ID</b> (mais seguro) ou por <b>nome</b>.
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Só evento <b>destes produtos</b> dispara — o resto chega, aparece na escuta, e é segurado.
          Basta preencher ID <b>ou</b> nome (o nome casa por trecho: &ldquo;Workshop&rdquo; serve).
        </div>
      )}
      {lista.map((pr, i) => (
        <div key={i} className="ck-prod-linha">
          {/* datalist: clicar na caixa abre o que veio no último payload escutado. */}
          <input className="inp" list={sugestoes.length ? "prod-ids-" + auto.id : undefined}
            placeholder={sugestoes.length ? "ID do produto (clique pra ver os do payload)" : "ID do produto (da plataforma)"}
            value={pr.id ?? ""} onChange={(e) => mexe(i, "id", e.target.value)} />
          <input className="inp" list={sugestoes.length ? "prod-nomes-" + auto.id : undefined}
            placeholder={sugestoes.length ? "ou nome (clique pra ver os do payload)" : "ou nome (trecho serve)"}
            value={pr.nome ?? ""} onChange={(e) => mexe(i, "nome", e.target.value)} />
          <button type="button" className="wh-x" title="Remover este produto"
            onClick={() => onChange((a) => ({ ...a, produtos: (a.produtos ?? []).filter((_, j) => j !== i) }))}>×</button>
        </div>
      ))}
      {sugestoes.length > 0 && (
        <>
          <datalist id={"prod-ids-" + auto.id}>
            {sugestoes.filter((p) => p.id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </datalist>
          <datalist id={"prod-nomes-" + auto.id}>
            {sugestoes.map((p) => <option key={p.nome} value={p.nome} />)}
          </datalist>
        </>
      )}
      <button type="button" className="btn" style={{ marginTop: lista.length ? 6 : 0 }}
        onClick={() => onChange((a) => ({ ...a, produtos: [...(a.produtos ?? []), { id: "", nome: "" }] }))}>
        + Adicionar produto
      </button>
      {sugestoes.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          As caixas sugerem o que veio no último evento escutado ({sugestoes.map((p) => p.nome).join(" · ")}).
        </div>
      )}
      {lista.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
          <b>Order bump:</b> a venda do bump chega como OUTRO produto. Adicione o ID/nome do bump aqui
          se quiser que ele também dispare; deixando de fora, os dados chegam mas o fluxo não anda.
        </div>
      )}
    </div>
  );
}

function WebhookTrigger({ auto, onChange }: { auto: Automation; onChange: (mut: (a: Automation) => Automation) => void }) {
  const [avancado, setAvancado] = useState(!!auto.campoTelefone);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [escutando, setEscutando] = useState(false);
  const [cansou, setCansou] = useState(false); // 5 min sem nada — para sozinho
  const [copiouPayload, setCopiouPayload] = useState(false);
  const escutaRef = useRef(0); // id da escuta corrente: incrementar mata o polling antigo
  // A captura vive no FlowBuilder (o teste de percurso roda no canvas, com este painel fechado).
  const tc = useContext(TesteCtx);
  const chegou = tc?.captura ?? null;
  const setChegou = (c: EspiadaWebhook | null) => tc?.setCaptura(c);

  useEffect(() => {
    let vivo = true;
    jget(`/api/flow-webhook-token?automationId=${encodeURIComponent(auto.id)}`)
      .then((r) => { if (vivo && r.url) setUrl(r.url); })
      .catch(() => { /* fluxo novo ainda não salvo no motor — o botão "gerar" cobre */ });
    return () => { vivo = false; escutaRef.current++; };
  }, [auto.id]);

  // Editar um valor da captura: é assim que se testa OUTRO caminho sem pedir novo POST pra origem
  // (trocar `message` de "chave ligada" pra "BLOQUEADO" e rodar o teste de novo). Salva no motor
  // junto com a captura — continua sendo dado de teste, some quando você apagar.
  const salvaCampos = useRef<ReturnType<typeof setTimeout> | null>(null);
  function editaCampo(chave: string, valor: string) {
    if (!chegou) return;
    const campos = { ...(chegou.fields ?? {}), [chave]: valor };
    setChegou({ ...chegou, fields: campos, telefone: campos.telefone || chegou.telefone });
    if (salvaCampos.current) clearTimeout(salvaCampos.current);
    salvaCampos.current = setTimeout(() => {
      jsend("/api/flow-webhook-simulate", "POST", { automationId: auto.id, campos }).catch(() => { /* melhor esforço */ });
    }, 700);
  }

  async function copiarPayload() {
    if (!chegou) return;
    const texto = chegou.raw ?? JSON.stringify(chegou.fields ?? {}, null, 2);
    try { await navigator.clipboard.writeText(texto); setCopiouPayload(true); setTimeout(() => setCopiouPayload(false), 1800); } catch { /* sem permissão */ }
  }
  async function apagarCaptura() {
    try { await jsend("/api/flow-webhook-clear", "POST", { automationId: auto.id }); } catch { /* melhor esforço */ }
    setChegou(null); setCansou(false);
  }

  // DISPARO DE VERDADE. O payload que sai é o `raw` original COM as edições dos campos aplicadas
  // por cima — usando a estrutura do próprio raw pra saber onde cada campo mora (device_vin volta
  // pra device.vin sem ambiguidade). Sem isso, editar um valor mudaria a simulação mas não o
  // disparo real, e os dois discordariam em silêncio.
  function payloadPraDisparar(): any | null {
    if (!chegou?.raw) return null;
    try { return aplicaEdicoesNoPayload(JSON.parse(chegou.raw), chegou.fields ?? {}); } catch { return null; }
  }
  const [disparando, setDisparando] = useState(false);
  const [respDisparo, setRespDisparo] = useState("");
  async function dispararDeVerdade() {
    const corpo = payloadPraDisparar();
    if (!corpo) { setRespDisparo("Não tenho o JSON original deste exemplo — cole o payload de novo pra poder disparar."); return; }
    const tel = chegou?.telefone || "(sem telefone)";
    if (!window.confirm(
      `Isto envia WhatsApp DE VERDADE para ${tel}, pela conta conectada deste fluxo.\n\n`
      + "Vai passar pelo caminho real: mesmo endereço, mesmo motor, mesma conta. Continuar?",
    )) return;
    setDisparando(true); setRespDisparo("");
    try {
      const r = await jsend("/api/flow-webhook-fire", "POST", { automationId: auto.id, payload: corpo });
      setRespDisparo(r.ok
        ? `Disparado — o webhook aceitou (HTTP ${r.status}). A mensagem sai pela conta conectada; confira o WhatsApp de ${tel}.`
        : `O webhook recusou (HTTP ${r.status}): ${r.resposta || "sem detalhe"}`);
    } catch (e: any) { setRespDisparo(e.message); }
    setDisparando(false);
  }

  // "Colar payload": pra quem JÁ TEM um exemplo do JSON em mãos (a origem mandou por WhatsApp,
  // copiou do n8n…) — cola aqui e vira a captura de teste, sem esperar escuta nem disparar nada.
  const [colando, setColando] = useState(false);
  const [payloadTxt, setPayloadTxt] = useState("");
  const [simulando, setSimulando] = useState(false);
  const [erroPayload, setErroPayload] = useState("");
  async function usarPayload() {
    let corpo: any;
    try { corpo = JSON.parse(payloadTxt); } catch { setErroPayload("Isso não é um JSON válido — confere se copiou inteiro (começa com { e termina com })."); return; }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) { setErroPayload("O payload precisa ser um objeto JSON: { ... }"); return; }
    setSimulando(true); setErroPayload("");
    try {
      const r = await jsend("/api/flow-webhook-simulate", "POST", { automationId: auto.id, payload: corpo });
      if (r.event) setChegou(r.event);
      setColando(false); setPayloadTxt(""); setCansou(false);
    } catch (e: any) {
      setErroPayload(/não encontrado/i.test(String(e.message)) ? "Salve o fluxo primeiro (botão Salvar lá em cima) e tente de novo." : e.message);
    }
    setSimulando(false);
  }

  async function gerar() {
    setGerando(true); setErro("");
    try {
      const r = await jsend("/api/flow-webhook-token", "POST", { automationId: auto.id });
      setUrl(r.url);
    } catch (e: any) { setErro(e.message); }
    setGerando(false);
  }
  async function copiar() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão */ }
  }

  async function escutar() {
    const id = ++escutaRef.current;
    setEscutando(true); setChegou(null); setCansou(false); setErro("");
    try {
      // Baseline no relógio DO SERVIDOR: só interessa o que chegar DEPOIS deste clique.
      const base = await jget(`/api/flow-webhook-last?automationId=${encodeURIComponent(auto.id)}&since=0`);
      const since = Number(base.now ?? 0);
      for (let i = 0; i < 150; i++) { // ~5 min (2 s por volta)
        await new Promise((r) => setTimeout(r, 2000));
        if (escutaRef.current !== id) return; // cancelou / trocou de fluxo / fechou o painel
        const r = await jget(`/api/flow-webhook-last?automationId=${encodeURIComponent(auto.id)}&since=${since}`).catch(() => null);
        if (escutaRef.current !== id) return;
        if (r?.event) { setChegou(r.event); setEscutando(false); return; }
      }
      if (escutaRef.current === id) { setEscutando(false); setCansou(true); }
    } catch (e: any) {
      if (escutaRef.current === id) { setErro(e.message); setEscutando(false); }
    }
  }
  function pararEscuta() { escutaRef.current++; setEscutando(false); }

  return (
    <>
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Qualquer sistema de fora chama esta URL e o fluxo dispara na hora. Serve pra
        <b> formulário de site</b>, CRM, n8n, Zapier — o que mandar um POST.
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Endereço pra colar lá</label>
        {url ? (
          <>
            <textarea className="inp" readOnly value={url} style={{ minHeight: 62, fontSize: 11.5 }} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn" style={{ marginTop: 6 }} onClick={copiar}>{copiado ? "copiado ✓" : "copiar endereço"}</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={gerar} disabled={gerando}>
            {gerando ? "gerando…" : "gerar endereço do webhook"}
          </button>
        )}
        {erro && <div style={{ color: "var(--crit)", fontSize: 12, marginTop: 6 }}>{erro}</div>}
      </div>
      <div className="field">
        <label>Testar recebimento</label>
        {escutando ? (
          <EscutaVeu onParar={pararEscuta}
            texto={<>mande um <b>POST</b> pro endereço deste fluxo — pode vir de <b>qualquer
              sistema</b> (formulário, n8n, CRM, plataforma…) — que ele aparece aqui na hora.</>} />
        ) : url ? (
          <button type="button" className="btn" onClick={escutar}>
            {chegou || cansou ? "escutar de novo" : "escutar — esperar um POST de teste"}
          </button>
        ) : null}
        {cansou && !escutando && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            5 minutos sem nada chegar — confere se o outro sistema está mesmo chamando o endereço acima.
          </div>
        )}
        {chegou && !escutando && (
          <div className="wh-chegou">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{chegou.simulado ? "Exemplo salvo no fluxo" : "Última captura"}</b>{" "}
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(chegou.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={copiarPayload}
                title="Copiar o JSON completo — pra colar em outra ferramenta">
                {copiouPayload ? "copiado ✓" : "copiar payload"}
              </button>
              <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={apagarCaptura}
                title="Apagar este exemplo do fluxo (some de vez)">
                apagar
              </button>
            </div>
            <div style={{ marginTop: 4 }}>
              {chegou.simulado && chegou.status === "ok" && <>Payload de exemplo lido — telefone <b>{chegou.telefone}</b>. Nada foi enviado; as variáveis abaixo já valem pros textos.</>}
              {!chegou.simulado && chegou.status === "ok" && <>POST recebido pro telefone <b>{chegou.telefone}</b> — o fluxo disparou de verdade pra esse número.</>}
              {chegou.status === "rascunho" && <>O POST chegou, mas o fluxo está como <b>rascunho</b> — nada foi enviado. Ative o fluxo pra disparar de verdade.</>}
              {chegou.status === "sem_telefone" && <>{chegou.simulado ? "Payload" : "Chegou um POST"} <b>sem telefone válido</b> — inclua <code>telefone</code> no JSON (ou <code>phone</code>/<code>whatsapp</code>/<code>celular</code>/<code>numero</code>){auto.campoTelefone ? <> — ou confira o campo <code>{auto.campoTelefone}</code> configurado abaixo</> : null}.</>}
            </div>
            {Object.keys(chegou.fields ?? {}).length > 0 && (
              <div className="wh-vars">
                <span className="muted" style={{ fontSize: 11.5 }}>
                  Variáveis pros textos — <b>pode editar</b> pra testar outro caminho do fluxo:
                </span>
                {Object.entries(chegou.fields ?? {}).map(([k, v]) => (
                  <div key={k} className="wh-var edit">
                    <ChipVar nome={k} />
                    {/* textarea de 1 linha: valores longos (URL do webhook, XML do rastreador) dão
                        pra abrir arrastando o cantinho e LER — num input eles ficavam cortados. */}
                    <textarea className="inp wh-var-inp" rows={1} value={v} onChange={(e) => editaCampo(k, e.target.value)}
                      title="Mudar este valor muda o caminho que o teste vai seguir · arraste o canto pra ler inteiro" />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <button type="button" className="btn" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => tc?.iniciarTudo()}
                title="Acende o caminho no quadro. NÃO manda mensagem nenhuma.">
                <Icon name="play" size={13} /> simular o caminho <span className="muted" style={{ fontWeight: 400 }}>(não envia)</span>
              </button>
              <button type="button" className="btn primary" style={{ width: "100%", justifyContent: "center" }}
                onClick={dispararDeVerdade} disabled={disparando || !chegou?.raw}
                title={chegou?.raw ? "Chama o endereço real do webhook e envia mesmo" : "Cole um payload primeiro"}>
                {disparando ? "disparando…" : <>enviar de verdade agora</>}
              </button>
              {respDisparo && <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{respDisparo}</div>}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
              <b>Simular</b> só acende o caminho no quadro, pra conferir por onde o dado passa — não manda
              mensagem. <b>Enviar de verdade</b> chama o endereço real do webhook: a mensagem sai mesmo, pela
              conta conectada, igual a um POST do sistema de fora. Pra ir passo a passo, use o <b>▶</b> em cima
              do nó do gatilho. Este exemplo fica <b>guardado no fluxo</b>:
              só some se você apagar, colar outro, ou chegar um POST novo na escuta.
            </div>
          </div>
        )}
        {!escutando && (colando ? (
          <div style={{ marginTop: 8 }}>
            <textarea className="inp" value={payloadTxt} onChange={(e) => setPayloadTxt(e.target.value)}
              placeholder={'cole aqui o JSON que o sistema de fora envia — ex.: { "telefone": "5511...", "nome": "Ana" }'}
              style={{ minHeight: 96, fontSize: 11.5, fontFamily: "ui-monospace, monospace" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" className="btn" onClick={usarPayload} disabled={simulando || !payloadTxt.trim()}>
                {simulando ? "lendo…" : "usar este payload"}
              </button>
              <button type="button" className="btn" onClick={() => { setColando(false); setErroPayload(""); }}>cancelar</button>
            </div>
            {erroPayload && <div style={{ color: "var(--crit)", fontSize: 12, marginTop: 6 }}>{erroPayload}</div>}
          </div>
        ) : (
          <button type="button" onClick={() => setColando(true)}
            style={{ background: "none", border: "none", padding: 0, marginTop: 6, color: "var(--accent)", textDecoration: "underline", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
            já tem um exemplo do JSON? cole ele aqui →
          </button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
        <b>Como mandar:</b> POST com JSON. O <b>telefone é obrigatório</b> — aceito em
        <code> telefone</code>, <code>phone</code>, <code>whatsapp</code>, <code>celular</code> ou <code>numero</code>.<br />
        <b>Todo o resto vira variável</b> pros textos: mandar <code>{"{ \"nome\": \"Ana\" }"}</code> te dá <code>{"{{nome}}"}</code>.
        Campo aninhado também: <code>{"{ \"device\": { \"vin\": \"...\" } }"}</code> te dá <code>{"{{device_vin}}"}</code>.<br />
        Exemplo: <code>{"{ \"telefone\": \"5511999998888\", \"nome\": \"Ana\", \"plano\": \"Pro\" }"}</code>
        <br /><br />
        ⚠️ Gerar de novo <b>invalida o endereço anterior</b> — quem estiver usando para de funcionar até você atualizar lá.
      </div>
      {avancado ? (
        <div className="field">
          <label>Campo do telefone (avançado)</label>
          <input className="inp" value={auto.campoTelefone ?? ""} placeholder="ex.: device.vin"
            onChange={(e) => onChange((a) => ({ ...a, campoTelefone: e.target.value }))} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
            Use quando o telefone vem <b>dentro de um objeto</b> no JSON, em vez de um campo de topo.
            Caminho pontuado (ex.: <code>device.vin</code> lê <code>{"{ \"device\": { \"vin\": \"55...\" } }"}</code>).
            Vazio = usa os nomes padrão acima.
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAvancado(true)}
          style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", fontSize: 12, cursor: "pointer", textAlign: "left" }}>
          o telefone vem dentro de um objeto aninhado? →
        </button>
      )}
    </>
  );
}

// Editor do nó ESPERAR. Duas naturezas bem diferentes, então a UI explica qual está valendo:
//  • curta (< 2 min): pausa dentro da conversa, só pra parecer gente digitando;
//  • longa (>= 2 min): vira FOLLOW-UP AGENDADO — o fluxo pausa, o lead continua sendo atendido
//    normalmente, e a continuação dispara na hora certa (sobrevive a redeploy).
const WAIT_UNITS: Array<{ id: string; label: string; ms: number }> = [
  { id: "s", label: "segundos", ms: 1000 },
  { id: "m", label: "minutos", ms: 60_000 },
  { id: "h", label: "horas", ms: 3_600_000 },
  { id: "d", label: "dias", ms: 86_400_000 },
];
const AGENDA_MS = 120_000; // igual ao SLEEP_MAX_MS do motor

function WaitEditor({ step, onChange }: { step: Extract<StepBody, { type: "wait" }>; onChange: (s: StepBody) => void }) {
  // Modo "data" = o "At Specified Time" do n8n. Fica escondido enquanto ninguém escolhe, pra não
  // pesar o nó pra quem só quer "espere 2 minutos".
  const modo = step.modo ?? "intervalo";
  if (modo === "data") {
    return (
      <>
        <div className="field">
          <label>Modo</label>
          <select className="inp" value={modo} onChange={(e) => onChange({ ...step, modo: e.target.value as "intervalo" | "data" })}>
            <option value="intervalo">Esperar um tempo</option>
            <option value="data">Esperar até uma data/hora</option>
            <option value="_wh" disabled>Esperar uma chamada de webhook — em breve</option>
            <option value="_form" disabled>Esperar envio de formulário — em breve</option>
          </select>
        </div>
        <div className="field">
          <label>Continuar em</label>
          <input className="inp" type="datetime-local" value={(step.quando ?? "").slice(0, 16)}
            onChange={(e) => onChange({ ...step, quando: e.target.value })} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
            O fluxo <b>pausa aqui</b> e volta sozinho nesse momento — sobrevive a atualização do
            sistema. Data que já passou não trava nada: o fluxo segue na hora.
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={step.cancelOnReply !== false} onChange={(e) => onChange({ ...step, cancelOnReply: e.target.checked })} />
          Cancelar se o lead responder antes
        </label>
      </>
    );
  }
  return <WaitIntervalo step={step} onChange={onChange} />;
}

function WaitIntervalo({ step, onChange }: { step: Extract<StepBody, { type: "wait" }>; onChange: (s: StepBody) => void }) {
  // escolhe a maior unidade que representa o valor sem quebrar
  const unit = step.ms % 86_400_000 === 0 && step.ms >= 86_400_000 ? "d"
    : step.ms % 3_600_000 === 0 && step.ms >= 3_600_000 ? "h"
    : step.ms % 60_000 === 0 && step.ms >= 60_000 ? "m" : "s";
  const mult = WAIT_UNITS.find((u) => u.id === unit)!.ms;
  const val = step.ms / mult;
  const agendado = step.ms >= AGENDA_MS;

  return (
    <>
      {step.modo && (
        <div className="field">
          <label>Modo</label>
          <select className="inp" value="intervalo" onChange={(e) => onChange({ ...step, modo: e.target.value as "intervalo" | "data" })}>
            <option value="intervalo">Esperar um tempo</option>
            <option value="data">Esperar até uma data/hora</option>
            <option value="_wh" disabled>Esperar uma chamada de webhook — em breve</option>
            <option value="_form" disabled>Esperar envio de formulário — em breve</option>
          </select>
        </div>
      )}
      <div className="field">
        <label>Esperar</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" type="number" min={0} step={unit === "s" ? 0.5 : 1} value={val} style={{ maxWidth: 110 }}
            onChange={(e) => onChange({ ...step, ms: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * mult)) })} />
          <select className="inp" value={unit} style={{ maxWidth: 130 }}
            onChange={(e) => { const u = WAIT_UNITS.find((x) => x.id === e.target.value)!; onChange({ ...step, ms: Math.round(val * u.ms) }); }}>
            {WAIT_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
      </div>
      {agendado ? (
        <>
          <div className="ask-note">
            ⏰ <b>Follow-up agendado.</b> Como a espera passa de 2 minutos, o fluxo <b>pausa aqui</b> e volta sozinho na hora certa.
            A conversa <b>não trava</b> — se o lead escrever nesse meio-tempo, ele é atendido na hora. E sobrevive a atualizações do sistema.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={step.cancelOnReply !== false} onChange={(e) => onChange({ ...step, cancelOnReply: e.target.checked })} />
            Cancelar se o lead responder antes <span className="muted">(recomendado pra follow-up de vácuo)</span>
          </label>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>Pausa curta dentro da conversa — serve pra parecer gente digitando. A partir de 2 minutos vira follow-up agendado.</div>
      )}
    </>
  );
}

function SecondsField({ label, ms, onChange }: { label: string; ms: number; onChange: (ms: number) => void }) {
  return (
    <div className="field">
      <label>{label} (segundos)</label>
      <input
        className="inp"
        type="number"
        min={0}
        step={0.5}
        value={ms / 1000}
        onChange={(e) => onChange(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 1000)))}
      />
    </div>
  );
}
function VarsHint() {
  return (
    <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
      Variáveis: {"{{primeiro_nome}}"} · {"{{nome}}"} · {"{{telefone}}"} · {"{{produto}}"} · {"{{valor}}"} · {"{{link}}"} · {"{{pix}}"}
    </div>
  );
}


// Campo de mídia: aceita URL OU upload do computador, com validação de tamanho e (pro PTV) duração.
// Gravador de voz no navegador. Grava em mp4/AAC (ou opus como fallback) — o mp4 é o formato mais
// aceito; a UazAPI transcodifica pro áudio de voz do WhatsApp no envio (type ptt). Auto-para em 5min.
const REC_MIMES = ['audio/mp4;codecs="mp4a.40.2"', "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
const REC_MAX = 300;
function pickRecMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return REC_MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) ?? null;
}
function AudioRecorder({ onRecorded }: { onRecorded: (dataUrl: string) => void }) {
  const [mime, setMime] = useState<string | null | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMime(typeof navigator?.mediaDevices?.getUserMedia === "function" ? pickRecMime() : null); }, []);
  // Nunca deixa o microfone aberto se o painel fechar no meio da gravação.
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    const r = recRef.current;
    if (r && r.state !== "inactive") r.stop();
    r?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  function stop() { const r = recRef.current; if (r && r.state !== "inactive") r.stop(); }
  useEffect(() => { if (recording && secs >= REC_MAX) stop(); }, [recording, secs]);

  async function start() {
    setErr("");
    if (!mime) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: (mime || "audio/mp4").split(";")[0] });
        chunks.current = [];
        if (!blob.size) { setErr("Não gravou nada. Tente de novo."); return; }
        const reader = new FileReader();
        reader.onload = () => onRecorded(String(reader.result));
        reader.readAsDataURL(blob);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch { setErr("Não consegui acessar o microfone. Autorize o acesso no navegador."); }
  }

  if (mime === undefined) return null;
  if (mime === null) return <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Seu navegador não grava áudio aqui — use Chrome/Safari ou envie um arquivo.</div>;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <div style={{ marginTop: 6 }}>
      {recording ? (
        <button type="button" className="btn rec-stop" onClick={stop}>⏹ Parar e usar ({mm}:{ss})</button>
      ) : (
        <button type="button" className="btn rec-start" onClick={start}>🎤 Gravar áudio agora</button>
      )}
      {err && <div style={{ color: "var(--crit)", fontSize: 11, marginTop: 4 }}>{err}</div>}
      {recording && <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>Gravando… para sozinho em {REC_MAX / 60} min.</div>}
    </div>
  );
}

function MediaFileField({ value, onChange, accept, maxMB, maxDurationSec, hint }: {
  value: string;
  onChange: (v: string) => void;
  accept: string;
  maxMB: number;
  maxDurationSec?: number;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState("");
  const [tooBig, setTooBig] = useState(false); // erro de TAMANHO → mostra link do compressor
  const [busy, setBusy] = useState(false);
  const isFile = value.startsWith("data:");
  const isVideo = accept.includes("video");
  const isAudio = accept.includes("audio");

  function duration(file: File): Promise<number> {
    return new Promise((res) => {
      if (!maxDurationSec) return res(0);
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { const d = v.duration || 0; URL.revokeObjectURL(url); res(d); };
      v.onerror = () => { URL.revokeObjectURL(url); res(0); };
      v.src = url;
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(""); setTooBig(false);
    if (f.size > maxMB * 1024 * 1024) { setErr(`Arquivo muito grande (${(f.size / 1048576).toFixed(0)}MB · máx ${maxMB}MB).`); setTooBig(true); return; }
    setBusy(true);
    const dur = await duration(f);
    if (maxDurationSec && dur > maxDurationSec + 1) { setBusy(false); setErr(`O vídeo tem ${Math.round(dur)}s — o bolinha (PTV) precisa ter no máximo ${maxDurationSec}s.`); return; }
    const reader = new FileReader();
    reader.onload = () => { onChange(String(reader.result)); setBusy(false); };
    reader.onerror = () => { setErr("Falha ao ler o arquivo."); setBusy(false); };
    reader.readAsDataURL(f);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input className="inp" style={{ flex: 1, minWidth: 0 }} value={isFile ? "" : value} disabled={isFile} placeholder={isFile ? "✓ arquivo enviado" : "https://…"} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn" style={{ flex: "none" }} onClick={() => ref.current?.click()} disabled={busy}>{busy ? "…" : "📤 Enviar"}</button>
        {value && <button type="button" className="btn" style={{ flex: "none" }} title="Remover arquivo" onClick={() => { onChange(""); setErr(""); }}>✕</button>}
      </div>
      {err && <div style={{ color: "var(--crit)", fontSize: 12, marginTop: 5 }}>{err}</div>}
      {tooBig && (
        <div style={{ fontSize: 11, marginTop: 4 }}>
          {isVideo && (
            <><a href="https://www.freeconvert.com/pt/video-compressor" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>🗜️ Comprimir o vídeo aqui</a>{" "}</>
          )}
          <span className="muted">e envie o reduzido (o painel aceita até {maxMB}MB por arquivo) — ou cole um link direto no campo acima.</span>
        </div>
      )}
      {hint && !err && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
      {isAudio && <AudioRecorder onRecorded={(d) => { onChange(d); setErr(""); setTooBig(false); }} />}
      {isAudio && isFile && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={value} style={{ width: "100%", marginTop: 8, height: 34 }} />
      )}
      <input ref={ref} type="file" accept={accept} hidden onChange={onFile} />
    </>
  );
}

// Seletor da variável de captura do nó "perguntar": as conhecidas + criar personalizada ("add +").
// Editor do nó "Avisar alguém": destinos (grupos com busca + números) como chips + mensagem.
// Chips dos DADOS QUE CHEGARAM pelo play manual. Clicar insere a variável no campo — o valor
// real fica visível ao lado, então a pessoa escolhe pelo CONTEÚDO ("Admin", "R$ 47,00"), não
// pelo nome técnico. Some quando nada foi enviado (não polui quem não usa o recurso).
function ChipsDoGatilho({ onInserir, titulo = "Dados que chegaram do gatilho" }: {
  onInserir: (variavel: string) => void;
  titulo?: string;
}) {
  const gd = useContext(GatilhoDados);
  const uteis = (gd?.dados ?? []).filter((d) => d.variavel);
  if (!uteis.length) return null;
  return (
    <div className="gd-chips">
      <div className="gd-chips-topo">
        {titulo} <span className="muted">· {gd!.origem}</span>
      </div>
      <div className="gd-chips-lista">
        {uteis.map((d, i) => (
          <button key={i} type="button" className="gd-chip" title={`Inserir ${d.variavel}`}
            onClick={() => onInserir(d.variavel!)}>
            <span className="gd-chip-rot">{d.rotulo}</span>
            <span className="gd-chip-val">{d.valor}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Editor do passo TEMPLATE: carrega os templates APROVADOS da conta oficial e monta os params.
// Ao escolher, salva no passo o RETRATO do template (mock) — corpo, mídia, botões com tipo e a
// conta dona — pro nó do canvas virar um mockup de celular; e os rótulos das respostas rápidas
// (botoes), que o motor usa pra rotear o clique.
interface TplDoEditor { name: string; language?: string; status?: string; category?: string; wabaRotulo?: string; components?: Array<{ type: string; text?: string; format?: string; example?: any; buttons?: Array<{ type: string; text: string }> }> }
function retratoDoTemplate(t: TplDoEditor, waba?: { rotulo?: string; foto?: string }) {
  const h = t.components?.find((c) => c.type === "HEADER");
  const fmt = String(h?.format ?? "").toUpperCase();
  const botoes = (t.components?.find((c) => c.type === "BUTTONS")?.buttons ?? []).map((b) => ({
    texto: String(b.text ?? ""),
    tipo: (b.type === "URL" ? "url" : b.type === "PHONE_NUMBER" ? "telefone" : /COPY/i.test(String(b.type)) ? "copiar" : "resposta") as "resposta" | "url" | "telefone" | "copiar",
  })).filter((b) => b.texto);
  return {
    mock: {
      body: t.components?.find((c) => c.type === "BODY")?.text || "",
      footer: t.components?.find((c) => c.type === "FOOTER")?.text || "",
      header: fmt && fmt !== "TEXT" ? { formato: fmt, url: String(h?.example?.header_handle?.[0] ?? "") || undefined } : undefined,
      botoes,
      waba,
    },
    botoes: botoes.filter((b) => b.tipo === "resposta").map((b) => b.texto),
  };
}
// MÍDIA DO CABEÇALHO no passo do fluxo. Sem isto o motor mandava sempre o arquivo de EXEMPLO da
// aprovação — que a Meta usa só pra revisar: ele EXPIRA e não dá pra personalizar por campanha.
// (Admin lembrou disso de outra ferramenta: "eu tinha que subir a imagem mesmo com o template
// aprovado". Está certo — é assim que se faz.) Mesmo caminho do Disparador: sobe pro nosso /media
// e o motor manda a URL pública pra Meta baixar.
const ACEITA_HEADER: Record<string, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
// Teto do SUPER ADMIN pra mídia de cabeçalho — ver o comentário em subir(). Não amplia o que a
// Meta aceita; só permite ao admin testar o limite real dela em vez do nosso palpite.
const TETO_ADMIN_MB = 30;
function MidiaDoTemplate({ step, onChange, formato }: {
  step: Extract<Step, { type: "template" }>; onChange: (s: Step) => void; formato: string;
}) {
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [nome, setNome] = useState("");
  const { session } = useAuth();
  const ehAdmin = session?.user.role === "admin";
  const rot = formato === "IMAGE" ? "imagem" : formato === "VIDEO" ? "vídeo" : "documento";
  const exemplo = String((step as any).mock?.header?.url ?? "");

  async function subir(f: File) {
    // 16MB é limite DA META (documentado: imagem 5MB, vídeo/áudio 16MB), não nosso. O super admin
    // pode passar do teto pra ver o comportamento REAL da Meta — o erro que voltar é dela, não um
    // palpite nosso. Pro cliente o teto continua no documentado: melhor barrar aqui do que ele
    // esperar o upload inteiro pra ouvir "recusado" depois.
    const maxMb = formato === "IMAGE" ? 5 : ehAdmin ? TETO_ADMIN_MB : 16;
    if (f.size > maxMb * 1024 * 1024) { setErro(`Arquivo acima de ${maxMb}MB — comprima e tente de novo.`); return; }
    const mb = f.size / 1024 / 1024;
    setAviso(mb > 16 && formato !== "IMAGE"
      ? `${mb.toFixed(1)}MB passa dos 16MB que a Meta documenta pra vídeo. Subindo assim mesmo — se ela recusar, o erro dela aparece aqui.`
      : "");
    setSubindo(true); setErro("");
    try {
      // Bytes crus: base64 em JSON esbarra no teto de 10MB do painel (medido 20/08).
      const url = await subirArquivo(f);
      onChange({ ...step, headerUrl: url });
      setNome(f.name);
    } catch (e: any) { setErro(e?.message || "falha ao subir"); }
    setSubindo(false);
  }

  return (
    <div className="field">
      <label>{rot.charAt(0).toUpperCase() + rot.slice(1)} do cabeçalho <span className="muted">(deste envio)</span></label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {step.headerUrl && formato === "IMAGE" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img loading="lazy" decoding="async" src={step.headerUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
        )}
        <label className="btn" style={{ cursor: "pointer" }}>
          {subindo ? "subindo…" : step.headerUrl ? `trocar ${rot}` : `escolher ${rot}`}
          <input type="file" accept={ACEITA_HEADER[formato] ?? undefined} style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ""; }} />
        </label>
        {step.headerUrl && (
          <button className="btn" onClick={() => { onChange({ ...step, headerUrl: "" }); setNome(""); }}>usar o do template</button>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>
        {step.headerUrl
          ? <>Vai usar <b>{nome || "o arquivo que você subiu"}</b> neste passo.</>
          : exemplo
            ? <>Hoje vai a <b>mídia de exemplo da aprovação</b>. Ela serve pra testar, mas <b>expira</b> — pra
              produção, suba o seu arquivo aqui.</>
            : <b style={{ color: "var(--crit)" }}>Este template exige {rot} e a Meta não devolveu o exemplo — suba o arquivo, senão o envio é recusado.</b>}
      </div>
      {aviso && <div style={{ color: "var(--amber, #E8A33D)", fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>{aviso}</div>}
      {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginTop: 4 }}>{erro}</div>}
    </div>
  );
}

// TESTE AO VIVO: manda o template DE VERDADE pro número informado e segue rodando o resto do
// fluxo a partir deste nó. É o único jeito de conferir template oficial + botões + o funil inteiro
// (o "Testar" da barra é simulação e não envia nada). Custa dinheiro — a tela diz isso.
function TesteAoVivo({ step, fluxoId, naoSalvo, conta }: {
  step: Extract<Step, { type: "template" }>; fluxoId?: string; naoSalvo?: boolean; conta?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [fone, setFone] = useState(FONE_INICIAL); // já nasce com o +55
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const nodeId = step._id;

  async function disparar() {
    const num = soDigitosFone(fone);
    if (!fluxoId || !nodeId) { setMsg("Salve o fluxo uma vez antes de testar ao vivo."); return; }
    if (num.length < 12) { setMsg("Número inválido — use DDI+DDD+número (ex.: 5511989998888)."); return; }
    if (!confirm(`Enviar AGORA o template "${step.templateName}" para +${num} e rodar o restante do fluxo a partir deste passo?\n\nÉ envio REAL pela API Oficial — a Meta cobra por esta conversa.`)) return;
    setBusy(true); setMsg("");
    try {
      const d = await jsend("/api/automations/teste-ao-vivo", "POST", { automationId: fluxoId, nodeId, phone: num });
      // Mostra o id que a Meta devolveu: é a prova de que ela ACEITOU. Se chegou id e a mensagem
      // não aparecer no celular, o problema é ENTREGA (limite de marketing, qualidade do número),
      // não o painel — e isso muda completamente onde procurar.
      setMsg(d?.messageId
        ? `✅ A Meta aceitou (id ${String(d.messageId).slice(-12)}). Se não chegar, é bloqueio de ENTREGA da Meta, não erro de envio.`
        : "✅ Disparado! Confere o WhatsApp — o resto do fluxo continua a partir daqui.");
    } catch (e: any) { setMsg(e?.message || "não consegui disparar"); }
    setBusy(false);
  }

  return (
    <div className="tav">
      <div className="tav-topo">
        <b>Teste ao vivo</b>
        <button className="btn" style={{ marginLeft: "auto", padding: "5px 12px", fontSize: 12.5 }} onClick={() => setAberto(!aberto)}>
          {aberto ? "fechar" : "testar num número"}
        </button>
      </div>
      {aberto && (
        <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
          {naoSalvo && <div className="muted" style={{ fontSize: 11.5, color: "var(--warn)" }}>⚠️ Salve o fluxo antes — o teste roda a versão SALVA, não a da tela.</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="inp" style={{ flex: 1, minWidth: 150, fontFamily: "var(--mono)" }} inputMode="tel"
              placeholder="+55 (11) 98999-8888" value={fone} onChange={(e) => setFone(mascaraFone(e.target.value))} />
            <button className="btn primary" onClick={disparar} disabled={busy}>{busy ? "enviando…" : "Enviar agora"}</button>
          </div>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Envia o template <b>de verdade</b>{conta ? <> pela conta <b>{conta}</b></> : null} e <b>continua o fluxo</b> a partir
            deste passo (esperas, textos e ramos de botão inclusive). <b style={{ color: "var(--warn)" }}>A Meta cobra por esta
            conversa</b> — é uma mensagem paga, igual a de um cliente real.
          </div>
          {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("✅") ? "var(--accent-deep)" : "var(--crit)" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ step, onChange, fluxoId, naoSalvo }: { step: Extract<Step, { type: "template" }>; onChange: (s: Step) => void; fluxoId?: string; naoSalvo?: boolean }) {
  const [tpls, setTpls] = useState<TplDoEditor[] | null>(null);
  const [campoAtivo, setCampoAtivo] = useState<number | null>(null); // qual {{n}} recebe o chip clicado
  const [wabas, setWabas] = useState<Array<{ wabaId: string; rotulo: string; foto?: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    // `wabas` vem na MESMA resposta de /api/meta/templates. Antes havia uma 2ª chamada pra
    // /api/meta/wabas, que nunca existiu como rota — e o .catch vazio escondia o 404, então a
    // lista de contas simplesmente nunca preenchia e ninguém percebia.
    jget("/api/meta/templates")
      .then((d) => {
        setTpls((d.templates || []).filter((t: { status?: string }) => (t.status || "").toUpperCase() === "APPROVED"));
        setWabas(d.wabas ?? []);
      })
      .catch((e: { message?: string }) => { setErr(e?.message || "falha"); setTpls([]); });
  }, []);
  const sel = (tpls || []).find((t) => t.name === step.templateName && (!step.language || t.language === step.language));
  const body = sel?.components?.find((c) => c.type === "BODY")?.text || "";
  // MARKETING x UTILIDADE. A Meta LIMITA quanta mensagem de marketing cada pessoa recebe e, quando
  // estoura, ela simplesmente NÃO ENTREGA — o envio dá 200, some, e no Gerenciador aparece como
  // "Integridade do ecossistema: a Meta optou por não entregar". Foi o que engoliu o Pix de uma cliente
  // em 21/08: webhook ok, fluxo ok, template enviado, e a Meta segurou.
  // Mensagem sobre algo que a pessoa ACABOU DE FAZER (gerou Pix, comprou, pediu) se qualifica como
  // UTILIDADE: não entra nesse limite e, na conta do próprio Admin, custou ~9x menos
  // (R$ 0,32 por marketing contra R$ 0,035 por utilidade).
  const ehMarketing = String(sel?.category ?? "").toUpperCase() === "MARKETING";
  const vc = (() => { const n = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])); return n.length ? Math.max(...n) : 0; })();
  const params = step.params ?? [];
  const qrDoSel = (step.botoes ?? []).length;
  // Formato do cabeçalho do template escolhido (IMAGE/VIDEO/DOCUMENT) — vem do retrato salvo.
  const fmtHeader = String(((step as any).mock?.header?.formato ?? "")).toUpperCase();
  return (
    <>
      <div className="ask-note">
        <b>Template da API Oficial.</b> Só funciona numa conta/fluxo <b>oficial da Meta</b> — é o único jeito de falar <b>fora da janela de 24h</b>. Crie e aprove templates em <b>Conexão → Templates Meta</b>.
      </div>
      {err ? (
        <div className="muted" style={{ color: "var(--crit)", fontSize: 13 }}>{/conecte/i.test(err) ? "Conecte a conta oficial (Conexão) pra listar os templates." : err}</div>
      ) : tpls === null ? (
        <div className="muted">Carregando templates…</div>
      ) : tpls.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>Nenhum template aprovado ainda. Crie um em <b>Conexão → Templates Meta</b>.</div>
      ) : (
        <div className="field">
          <label>Template aprovado</label>
          <select className="inp" value={step.templateName + "|" + (step.language || "")} onChange={(e) => {
            const [name, lang] = e.target.value.split("|");
            const t = (tpls || []).find((x) => x.name === name && (!lang || x.language === lang));
            // Conta dona pro topo do mockup: com 1 conta é ela; com várias, casa pelo rótulo do card.
            const w = wabas.length === 1 ? wabas[0] : wabas.find((x) => x.rotulo === (t as any)?.wabaRotulo) ?? wabas[0];
            const retrato = t ? retratoDoTemplate(t, w ? { rotulo: w.rotulo, foto: w.foto } : undefined) : { mock: undefined, botoes: [] };
            onChange({ ...step, templateName: name, language: lang || "pt_BR", params: [], botoes: retrato.botoes, mock: retrato.mock });
          }}>
            <option value="|">— escolha —</option>
            {tpls.map((t) => <option key={t.name + t.language} value={t.name + "|" + (t.language || "")}>{t.name} ({t.language})</option>)}
          </select>
          {ehMarketing && (
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(232,163,61,.10)", border: "1px solid rgba(232,163,61,.35)", fontSize: 12.5, lineHeight: 1.5 }}>
              Este template está na categoria <b>MARKETING</b>. A Meta limita quanta mensagem de
              marketing cada pessoa recebe — passando do limite ela <b>não entrega</b>, sem erro no
              envio (aparece como “Integridade do ecossistema” no Gerenciador).
              <br />
              Se a mensagem é sobre algo que a pessoa <b>acabou de fazer</b> (gerou Pix, comprou,
              pediu), ela se qualifica como <b>UTILIDADE</b>: não entra nesse limite e custa bem
              menos. Vale recriar o template como Utilidade, escrevendo só sobre a transação — sem
              vender o evento no texto, senão a Meta reclassifica pra Marketing de novo.
            </div>
          )}
        </div>
      )}
      {sel && (
        <>
          {body && <div className="tpl-body" style={{ fontSize: 13 }}>{body}</div>}
          {vc > 0 && (
            <div className="field">
              <label>Valores das variáveis</label>
              {Array.from({ length: vc }).map((_, i) => (
                <input key={i} className="inp" style={{ marginTop: 5 }} placeholder={`Valor de {{${i + 1}}}`} value={params[i] ?? ""}
                  onFocus={() => setCampoAtivo(i)}
                  onChange={(e) => { const n = [...params]; n[i] = e.target.value; onChange({ ...step, params: n }); }} />
              ))}
              {/* Clicar num chip preenche o campo em que você estava — o dado real vira variável
                  sem digitar nada. Sem campo escolhido, cai no primeiro vazio. */}
              <ChipsDoGatilho
                titulo={`Clique pra preencher ${campoAtivo != null ? `o valor de {{${campoAtivo + 1}}}` : "o próximo campo vazio"}`}
                onInserir={(v) => {
                  const alvo = campoAtivo ?? Array.from({ length: vc }).findIndex((_, j) => !(params[j] ?? "").trim());
                  const idx = alvo >= 0 ? alvo : 0;
                  const n = [...params];
                  n[idx] = ((n[idx] ?? "") + (n[idx] ? " " : "") + v).trim();
                  onChange({ ...step, params: n });
                }}
              />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                Os dados do EVENTO entram como variável: {"{{nome}}"} e {"{{primeiro_nome}}"} (quem comprou),
                {" {{produto}}"}, {"{{valor}}"}, {"{{link}}"} (checkout/boleto) e <b>{"{{pix}}"}</b> (o código
                copia-e-cola do PIX gerado). Num gatilho de venda da Kiwify, é só escrever a variável no campo.
              </div>
            </div>
          )}
          {qrDoSel > 0 && (
            <div className="ask-note" style={{ marginTop: 8 }}>
              Este template tem <b>{qrDoSel} botão(ões) de resposta rápida</b> — no canvas, cada um vira uma
              <b> saída</b> do nó: ligue o ramo do botão no que deve acontecer quando o lead clicar.
              Resposta que não casar com botão nenhum segue pela saída de baixo (padrão).
            </div>
          )}
          {fmtHeader && <MidiaDoTemplate step={step} onChange={onChange} formato={fmtHeader} />}
          <TesteAoVivo step={step} fluxoId={fluxoId} naoSalvo={naoSalvo} conta={(step as any).mock?.waba?.rotulo} />
        </>
      )}
    </>
  );
}

// Carrossel: cards com imagem + botões que o lead desliza pro lado. Só WhatsApp Lite (na API
// ── Editor do nó ASAAS ──────────────────────────────────────────────────────────────────────
// Um nó, várias ações — a ação escolhida muda os campos (pedido do dono e de um cliente, 27/08). A chave
// da API mora em Integrações → Asaas; aqui só aparece o status e o link pra configurar.
const ASAAS_ACOES: Array<{ id: Extract<Step, { type: "asaas" }>["acao"]; rotulo: string; dica: string }> = [
  { id: "checar_pagamento", rotulo: "Checar pagamento", dica: "Acha a cobrança do cliente e vira variáveis — {{asaas_pago}} (sim/não), {{asaas_valor}}, {{asaas_status_rotulo}}… Use uma Condição depois pra separar pago de não-pago." },
  { id: "enviar_comprovante", rotulo: "Enviar comprovante de pagamento", dica: "Checa a cobrança e, SE estiver paga, envia a mensagem com o comprovante oficial do Asaas no WhatsApp. Não paga = não envia nada (e {{asaas_pago}} fica \"não\")." },
  { id: "criar_cobranca", rotulo: "Criar cobrança (PIX/boleto)", dica: "Cria a cobrança pro cliente no Asaas e devolve {{asaas_link}}, {{asaas_pix}} (copia-e-cola) e {{asaas_boleto_linha}} — mande num passo de texto em seguida." },
  { id: "pix_copia_cola", rotulo: "PIX copia-e-cola da cobrança", dica: "Pega o código PIX de uma cobrança que já existe → {{asaas_pix}} e {{asaas_pix_validade}}." },
  { id: "listar_cobrancas", rotulo: "Listar cobranças (pra cobrar em massa)", dica: "Busca as cobranças por status/vencimento e entrega a lista pro Separar lista + Loop — é o coração do fluxo de cobrança agendada." },
  { id: "buscar_cliente", rotulo: "Buscar cliente no Asaas", dica: "Acha o cadastro (por CPF/CNPJ, e-mail ou id) e vira variáveis — nome, e-mail, telefone…" },
];
const ASAAS_STATUS_OPCOES = [
  { v: "", r: "qualquer status" },
  { v: "PENDING", r: "aguardando pagamento" },
  { v: "OVERDUE", r: "vencidas" },
  { v: "RECEIVED", r: "pagas (na conta)" },
  { v: "CONFIRMED", r: "pagas (confirmadas)" },
];
// ✍️ Nó ZapSign: hoje uma ação (pendentes). O token mora em Integrações → ZapSign.
function EmailEditor({ step, onChange }: { step: Extract<Step, { type: "email" }>; onChange: (s: Step) => void }) {
  const [st, setSt] = useState<{ configurado: boolean; remetente?: string; nome?: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    jget("/api/resend/config").then((d) => { if (vivo) setSt(d && !d.error ? d : { configurado: false }); }).catch(() => { if (vivo) setSt({ configurado: false }); });
    return () => { vivo = false; };
  }, []);
  const s = step;
  return (
    <>
      <div className="ask-note">
        <b>Enviar e-mail.</b> Sai pela sua conta Resend{st?.configurado && st.remetente ? <>, com o remetente <b>{st.nome ? `${st.nome} <${st.remetente}>` : st.remetente}</b></> : null}.
        Vale qualquer variável do fluxo no destinatário, no assunto e no texto. Sem e-mail válido no contato, o passo é pulado e o fluxo segue.
      </div>
      {st && !st.configurado && (
        <div className="ask-note" style={{ borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>Resend não conectada.</b> Cole a chave e o remetente em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → Resend</b></a> (uma vez só, vale pra todos os fluxos).
        </div>
      )}
      <div className="field">
        <label>Para</label>
        <input className="inp" value={s.para} placeholder="{{email}}" onChange={(e) => onChange({ ...s, para: e.target.value })} />
      </div>
      <div className="field">
        <label>Assunto</label>
        <input className="inp" value={s.assunto} placeholder="Ex.: Seu acesso ao workshop, {{primeiro_nome}}" onChange={(e) => onChange({ ...s, assunto: e.target.value })} />
      </div>
      <div className="field">
        <label>Texto do e-mail</label>
        <textarea className="inp" rows={10} value={s.corpo} onChange={(e) => onChange({ ...s, corpo: e.target.value })} />
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Quebra de linha vira parágrafo, <b>*palavra*</b> fica em negrito e link solto vira clicável.</div>
      </div>
      <div className="field">
        <label>Nome do remetente neste e-mail (opcional)</label>
        <input className="inp" value={s.nomeRemetente ?? ""} placeholder={st?.nome || "usa o nome salvo na integração"} onChange={(e) => onChange({ ...s, nomeRemetente: e.target.value })} />
      </div>
      <div className="field">
        <label>Responder para (opcional)</label>
        <input className="inp" value={s.responderPara ?? ""} placeholder="usa o da integração" onChange={(e) => onChange({ ...s, responderPara: e.target.value })} />
      </div>
    </>
  );
}

function LerPlanilhaEditor({ step, onChange }: { step: Extract<Step, { type: "gsheet_read" }>; onChange: (s: Step) => void }) {
  const s = step;
  const p = (s.salvarEm || "planilha").replace(/[^\w]/g, "_");
  return (
    <>
      <div className="ask-note">
        <b>Ler planilha.</b> Puxa a planilha inteira do Google (a linha 1 são os nomes das colunas) e entrega a lista pro
        próximo passo <b>Loop</b>, que manda a mensagem pra cada pessoa. Use num fluxo com gatilho <b>Horário</b>.
        A planilha precisa ter uma coluna <b>Telefone</b> (ou Celular/WhatsApp) e, de preferência, <b>Nome</b>.
      </div>
      <div className="field">
        <label>Link da planilha</label>
        <input className="inp" value={s.sheetUrl} placeholder="https://docs.google.com/spreadsheets/d/…"
          onChange={(e) => onChange({ ...s, sheetUrl: e.target.value })} />
      </div>
      <div className="field">
        <label>Aba (vazio = primeira aba)</label>
        <input className="inp" value={s.aba ?? ""} placeholder="Página1" onChange={(e) => onChange({ ...s, aba: e.target.value })} />
      </div>
      <div className="field">
        <label>Guardar em (prefixo das variáveis)</label>
        <input className="inp" value={s.salvarEm ?? ""} placeholder="planilha" onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
      </div>
      <div className="ask-note" style={{ marginTop: 6 }}>
        <b>Disparo em lotes.</b> Preencha pra mandar aos poucos (ex.: 500 por vez) sem repetir ninguém.
      </div>
      <div className="field">
        <label>Pular linhas que já têm valor na coluna</label>
        <input className="inp" value={s.pularSe ?? ""} placeholder="status" onChange={(e) => onChange({ ...s, pularSe: e.target.value })} />
      </div>
      <div className="field">
        <label>Só quem entrou nas últimas horas (opcional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" style={{ flex: 2 }} value={s.colunaData ?? ""} placeholder="coluna de data (ex.: Data da compra)" onChange={(e) => onChange({ ...s, colunaData: e.target.value || undefined })} />
          <input className="inp" style={{ flex: 1 }} type="number" min={0} value={s.ultimasHoras ?? ""} placeholder="horas"
            onChange={(e) => onChange({ ...s, ultimasHoras: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>Ex.: aviso de sexta 18h só pra quem comprou desde o sábado anterior = 150 horas. A data precisa estar como 14/10/2026 09:18.</div>
      </div>
      <div className="field">
        <label>Pegar no máximo (linhas por execução)</label>
        <input className="inp" type="number" min={0} value={s.limite ?? ""} placeholder="vazio = todas"
          onChange={(e) => onChange({ ...s, limite: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={!!s.ab} onChange={(e) => onChange({ ...s, ab: e.target.checked })} />
        Teste A/B: marcar <b>{"{{variante}}"}</b> A e B alternado (use uma Condição em "variante")
      </label>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        No Loop, use a lista <b>{`${p}_data`}</b> com o campo de telefone <b>telefone</b>. Em cada mensagem valem <b>{"{{nome}}"}</b>,
        <b>{" {{primeiro_nome}}"}</b> e qualquer coluna da planilha com o nome em minúsculas e sem acento (ex.: <b>{"{{email}}"}</b>).
        Total de linhas: <b>{`{{${p}_total}}`}</b>. Telefone repetido recebe uma vez só. O Google precisa estar conectado em Integrações.
      </div>
    </>
  );
}

function ZapSignEditor({ step, onChange }: { step: Extract<Step, { type: "zapsign" }>; onChange: (s: Step) => void }) {
  const [st, setSt] = useState<{ configurado: boolean } | null>(null);
  useEffect(() => {
    let vivo = true;
    jget("/api/zapsign/config").then((d) => { if (vivo) setSt(d && !d.error ? d : { configurado: false }); }).catch(() => { if (vivo) setSt({ configurado: false }); });
    return () => { vivo = false; };
  }, []);
  const s = step;
  const p = (s.salvarEm || "zapsign").replace(/[^\w]/g, "_");
  return (
    <>
      <div className="ask-note">
        <b>ZapSign · assinaturas pendentes.</b> Consulta na ZapSign os documentos que ainda não foram assinados e por quem.
        Use num fluxo com gatilho <b>Horário</b> e mande o resultado pra equipe com o passo <b>Avisar</b>.
      </div>
      {st && !st.configurado && (
        <div className="ask-note" style={{ borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>Token da ZapSign não configurado.</b> Cole o token da API em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → ZapSign</b></a> (uma vez só, vale pra todos os fluxos).
        </div>
      )}
      <div className="field">
        <label>Só os pendentes há pelo menos quantos dias? (0 = todos)</label>
        <input className="inp" type="number" min={0} max={365} value={s.diasMin ?? 0}
          onChange={(e) => onChange({ ...s, diasMin: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
      </div>
      <div className="field">
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={s.telefones !== false} onChange={(e) => onChange({ ...s, telefones: e.target.checked })} />
          <span>Trazer o telefone de cada pessoa (link do WhatsApp no resumo)</span>
        </label>
      </div>
      <div className="field">
        <label>Guardar em (prefixo das variáveis)</label>
        <input className="inp" value={s.salvarEm ?? ""} placeholder="zapsign" onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
      </div>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Variáveis: <b>{`{{${p}_total}}`}</b> (quantos), <b>{`{{${p}_resumo}}`}</b> (texto pronto com nome, há quantos dias e link do WhatsApp)
        e <b>{`{{${p}_data}}`}</b> (lista pro Loop: nome, telefone, link, dias). Pra mandar só quando houver pendência, use uma
        Condição: <b>{`${p}_total`}</b> igual a <b>0</b>.
      </div>
    </>
  );
}

// 📈 Métricas Meta Ads: gasto/resultados da conta de anúncio viram variáveis pro relatório.
function MetaAdsEditor({ step, onChange }: { step: Extract<Step, { type: "meta_ads" }>; onChange: (s: Step) => void }) {
  const [st, setSt] = useState<{ configurado: boolean; actId?: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    jget("/api/meta-ads/config").then((d) => { if (vivo) setSt(d && !d.error ? d : { configurado: false }); }).catch(() => { if (vivo) setSt({ configurado: false }); });
    return () => { vivo = false; };
  }, []);
  const s = step;
  const p = (s.salvarEm || "ads").replace(/[^\w]/g, "_");
  const temPropria = !!(s.actId || s.token);
  return (
    <>
      <div className="ask-note">
        <b>Métricas Meta Ads.</b> Pergunta à Meta o gasto e os resultados das campanhas no período e
        transforma em variáveis — ideal num fluxo com gatilho <b>Horário</b>, terminando num <b>Avisar</b>.
      </div>
      {st && !st.configurado && !temPropria && (
        <div className="ask-note" style={{ borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>Conta de anúncio não configurada.</b> Cole o ID (act_…) e o token em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → Meta Ads</b></a> (uma vez só), ou preencha abaixo só neste nó.
        </div>
      )}
      <div className="field">
        <label>Período</label>
        <select className="inp" value={s.periodo ?? "hoje"} onChange={(e) => onChange({ ...s, periodo: e.target.value === "ontem" ? "ontem" : "hoje" })}>
          <option value="hoje">Hoje (parcial até agora)</option>
          <option value="ontem">Ontem (dia fechado)</option>
        </select>
      </div>
      <div className="field">
        <label>Conta de anúncio deste nó (opcional — vazio usa a de Integrações)</label>
        <input className="inp" placeholder="act_1234567890" value={s.actId ?? ""} onChange={(e) => onChange({ ...s, actId: e.target.value || undefined })} />
        <input className="inp" style={{ marginTop: 6 }} placeholder="Token (ads_read) — só se quiser um diferente" value={s.token ?? ""}
          onChange={(e) => onChange({ ...s, token: e.target.value || undefined })} />
        {!!s.token && <div className="muted" style={{ fontSize: 11.5, color: "var(--warn)" }}>O token digitado aqui fica visível no desenho do fluxo — prefira guardar em Integrações.</div>}
      </div>
      <div className="field"><GuiaTokenMetaAds onde="no" aberto={!!st && !st.configurado && !temPropria} /></div>
      <div className="field">
        <label>Guardar em (prefixo das variáveis)</label>
        <input className="inp" value={s.salvarEm ?? ""} placeholder="ads" onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
      </div>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Variáveis: <b>{`{{${p}_resumo}}`}</b> (texto pronto), <b>{`{{${p}_gasto}}`}</b>, <b>{`{{${p}_gasto_whatsapp}}`}</b>, <b>{`{{${p}_gasto_compra}}`}</b>,{" "}
        <b>{`{{${p}_conversas_iniciadas}}`}</b>, <b>{`{{${p}_custo_por_conversa}}`}</b>, <b>{`{{${p}_compras}}`}</b>, <b>{`{{${p}_valor_compras}}`}</b>,{" "}
        <b>{`{{${p}_roas_meta}}`}</b>, <b>{`{{${p}_cliques}}`}</b>, <b>{`{{${p}_impressoes}}`}</b>. O período usa o fuso DA CONTA de anúncio.
      </div>
    </>
  );
}

// 📊 Métricas do dia: o que aconteceu AQUI (conversas novas anúncio × orgânico + pedidos Kiwify).
function MetricasDiaEditor({ step, onChange }: { step: Extract<Step, { type: "metricas_dia" }>; onChange: (s: Step) => void }) {
  const s = step;
  const p = (s.salvarEm || "dia").replace(/[^\w]/g, "_");
  return (
    <>
      <div className="ask-note">
        <b>Métricas do dia.</b> Conta as conversas NOVAS do WPP Api no período (separando quem veio de
        anúncio Click-to-WhatsApp de quem chegou orgânico) e os pedidos aprovados da Kiwify. Colocado
        DEPOIS do nó Métricas Meta Ads, calcula também o ROAS real (faturamento ÷ gasto).
      </div>
      <div className="field">
        <label>Período</label>
        <select className="inp" value={s.periodo ?? "hoje"} onChange={(e) => onChange({ ...s, periodo: e.target.value === "ontem" ? "ontem" : "hoje" })}>
          <option value="hoje">Hoje (parcial até agora)</option>
          <option value="ontem">Ontem (dia fechado)</option>
        </select>
      </div>
      <div className="field">
        <label>Guardar em (prefixo das variáveis)</label>
        <input className="inp" value={s.salvarEm ?? ""} placeholder="dia" onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
      </div>
      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Variáveis: <b>{`{{${p}_resumo}}`}</b> (texto pronto), <b>{`{{${p}_conversas_novas}}`}</b>, <b>{`{{${p}_conversas_anuncio}}`}</b>,{" "}
        <b>{`{{${p}_conversas_organico}}`}</b>, <b>{`{{${p}_pedidos}}`}</b>, <b>{`{{${p}_faturamento}}`}</b>, <b>{`{{${p}_liquido}}`}</b>,{" "}
        <b>{`{{${p}_ticket_medio}}`}</b>, <b>{`{{${p}_roas}}`}</b>.
      </div>
    </>
  );
}

function AsaasEditor({ step, onChange }: { step: Extract<Step, { type: "asaas" }>; onChange: (s: Step) => void }) {
  const [st, setSt] = useState<{ configurado: boolean; ambiente?: string; last4?: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    jget("/api/asaas/config")
      .then((d) => { if (vivo) setSt(d && !d.error ? d : { configurado: false }); })
      .catch(() => { if (vivo) setSt({ configurado: false }); });
    return () => { vivo = false; };
  }, []);
  const s = step;
  const acao = ASAAS_ACOES.find((a) => a.id === s.acao) ?? ASAAS_ACOES[0];
  const precisaBusca = ["checar_pagamento", "enviar_comprovante", "pix_copia_cola", "criar_cobranca", "buscar_cliente"].includes(s.acao);
  const buscaOpcoes = s.acao === "criar_cobranca" || s.acao === "buscar_cliente"
    ? [["cpf", "CPF/CNPJ do cliente"], ["email", "e-mail do cliente"], ["cliente", "id do cliente no Asaas"]] as const
    : [["cpf", "CPF/CNPJ do cliente"], ["email", "e-mail do cliente"], ["cliente", "id do cliente no Asaas"], ["cobranca", "id da cobrança"]] as const;
  const placeholderBusca: Record<string, string> = {
    cpf: "{{cpf}} — colete antes com o nó Perguntar", email: "{{email}}",
    cliente: "{{asaas_cliente_id}}", cobranca: "{{asaas_cobranca_id}}",
  };
  const filtroVenc = s.filtroVencidoDias === undefined || s.filtroVencidoDias === null ? "" : String(s.filtroVencidoDias);
  return (
    <>
      <div className="ask-note">
        <b>Asaas.</b> {acao.dica}
      </div>
      {st && !st.configurado && (
        <div className="ask-note" style={{ borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>Chave do Asaas não configurada.</b> Este nó só funciona depois de colar sua chave de API
          em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → Asaas</b></a> (uma vez só — vale pra todos os fluxos).
        </div>
      )}
      {st?.configurado && (
        <div className="muted" style={{ fontSize: 12.5, margin: "2px 0 8px" }}>
          Conectado (chave …{st.last4}{st.ambiente === "sandbox" ? " · ambiente de TESTE" : ""}). Erro do Asaas não trava o fluxo: registra no log e segue.
        </div>
      )}
      <div className="field">
        <label>O que este nó faz</label>
        <select className="inp" value={s.acao} onChange={(e) => onChange({ ...s, acao: e.target.value as typeof s.acao })}>
          {ASAAS_ACOES.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
        </select>
      </div>
      {precisaBusca && (
        <div className="field">
          <label>{s.acao === "criar_cobranca" ? "Achar o cliente por" : "Achar por"}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="inp" style={{ flex: "0 0 210px" }} value={s.buscarPor ?? "cpf"}
              onChange={(e) => onChange({ ...s, buscarPor: e.target.value as typeof s.buscarPor })}>
              {buscaOpcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <input className="inp" style={{ flex: "1 1 180px" }} value={s.valorBusca ?? ""}
              placeholder={placeholderBusca[s.buscarPor ?? "cpf"]}
              onChange={(e) => onChange({ ...s, valorBusca: e.target.value })} />
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Aceita variável. O Asaas não busca cliente por telefone — por isso CPF/CNPJ ou e-mail.
          </div>
        </div>
      )}
      {(s.acao === "checar_pagamento" || s.acao === "enviar_comprovante") && (s.buscarPor ?? "cpf") !== "cobranca" && (
        <div className="field">
          <label>Olhar qual cobrança do cliente</label>
          <select className="inp" value={s.filtroStatus ?? ""} onChange={(e) => onChange({ ...s, filtroStatus: e.target.value })}>
            <option value="">a mais recente (qualquer status)</option>
            <option value="PENDING">a mais recente aguardando pagamento</option>
            <option value="OVERDUE">a mais recente vencida</option>
            <option value="RECEIVED">a mais recente paga</option>
          </select>
        </div>
      )}
      {s.acao === "enviar_comprovante" && (
        <div className="field">
          <label>Mensagem do comprovante (aceita variáveis)</label>
          <textarea className="inp" rows={4} value={s.mensagem ?? ""}
            placeholder={"Pagamento confirmado, {{primeiro_nome}}! Recebemos {{asaas_valor}}.\n\nSeu comprovante: {{asaas_comprovante}}"}
            onChange={(e) => onChange({ ...s, mensagem: e.target.value })} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Vazio = usa o texto acima. {"{{asaas_comprovante}}"} é o comprovante oficial do Asaas (link).
          </div>
        </div>
      )}
      {s.acao === "criar_cobranca" && (
        <>
          <div className="field">
            <label>Tipo e valor</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="inp" style={{ flex: "0 0 150px" }} value={s.cobrancaTipo ?? "PIX"}
                onChange={(e) => onChange({ ...s, cobrancaTipo: e.target.value as typeof s.cobrancaTipo })}>
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="UNDEFINED">Cliente escolhe</option>
              </select>
              <input className="inp" style={{ flex: "1 1 140px" }} value={s.cobrancaValor ?? ""} placeholder="ex.: 97,00 ou {{valor}}"
                onChange={(e) => onChange({ ...s, cobrancaValor: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Vence em quantos dias</label>
            <input className="inp" type="number" min={0} max={365} style={{ width: 120 }} value={s.cobrancaVencimentoDias ?? 3}
              onChange={(e) => onChange({ ...s, cobrancaVencimentoDias: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="field">
            <label>Descrição (aparece na fatura · opcional)</label>
            <input className="inp" value={s.cobrancaDescricao ?? ""} placeholder="ex.: Mensalidade {{mes}}"
              onChange={(e) => onChange({ ...s, cobrancaDescricao: e.target.value })} />
          </div>
        </>
      )}
      {s.acao === "listar_cobrancas" && (
        <>
          <div className="field">
            <label>Quais cobranças</label>
            <select className="inp" value={s.filtroStatus ?? ""} onChange={(e) => onChange({ ...s, filtroStatus: e.target.value })}>
              {ASAAS_STATUS_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Vencimento</label>
            {/* dias > 0 = venceu há (cobrança) · 0 = vence hoje · dias < 0 = vence daqui a
                (LEMBRETE antes de vencer — o "vencendo em 3 dias" do dono). O número no passo
                guarda o sinal; a UI mostra sempre positivo com a direção no select. */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="inp" style={{ flex: "0 0 220px" }}
                value={filtroVenc === "" ? "" : Number(filtroVenc) === 0 ? "hoje" : Number(filtroVenc) > 0 ? "atras" : "futuro"}
                onChange={(e) => {
                  const v = e.target.value;
                  const n = Math.max(1, Math.abs(Number(filtroVenc) || 0) || 3);
                  onChange({ ...s, filtroVencidoDias: v === "" ? undefined : v === "hoje" ? 0 : v === "atras" ? n : -n });
                }}>
                <option value="">qualquer data</option>
                <option value="hoje">vence hoje</option>
                <option value="atras">venceu há exatamente…</option>
                <option value="futuro">vence daqui a exatamente…</option>
              </select>
              {filtroVenc !== "" && Number(filtroVenc) !== 0 && (
                <>
                  <input className="inp" type="number" min={1} max={365} style={{ width: 90 }} value={Math.abs(Number(filtroVenc))}
                    onChange={(e) => {
                      const n = Math.max(1, Math.abs(Number(e.target.value) || 1));
                      onChange({ ...s, filtroVencidoDias: Number(filtroVenc) > 0 ? n : -n });
                    }} />
                  <span className="muted" style={{ fontSize: 12.5 }}>dia(s)</span>
                </>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              "Exatamente" é de propósito: o fluxo agendado de amanhã pega as de amanhã — ninguém é cobrado
              duas vezes. Lembrete antes de vencer: "vence daqui a 3 dias" + status "aguardando pagamento".
            </div>
          </div>
          <div className="field">
            <label>Guardar a lista em</label>
            <input className="inp" style={{ width: 200 }} value={s.salvarEm ?? ""} placeholder="resposta"
              onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Depois ligue em <b>Separar lista</b> (campo <code>{(s.salvarEm?.trim() || "resposta") + ".data"}</code>) e no <b>Loop</b> pra disparar um a um.
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Cada cobrança já vem com os dados do cliente: no ramo do Loop use {"{{telefone}}"} (é o que o Loop usa pra saber
              pra quem mandar), {"{{nome}}"}, {"{{valor}}"}, {"{{vencimento}}"}, {"{{link}}"}, {"{{boleto}}"}, {"{{cpf}}"}, {"{{email}}"}.
              Cliente sem celular no Asaas fica de fora — o log mostra quantos têm telefone.
            </div>
          </div>
        </>
      )}
      {s.acao === "buscar_cliente" && (
        <div className="field">
          <label>Guardar os dados em</label>
          <input className="inp" style={{ width: 200 }} value={s.salvarEm ?? ""} placeholder="resposta"
            onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Vira {"{{resposta_name}}"}, {"{{resposta_email}}"}, {"{{resposta_mobilePhone}}"}… (e {"{{asaas_cliente_id}}"} sempre).
          </div>
        </div>
      )}
      {(s.acao === "checar_pagamento" || s.acao === "enviar_comprovante" || s.acao === "criar_cobranca" || s.acao === "pix_copia_cola") && (
        <div className="field">
          <label>Variáveis que este nó cria (clique pra copiar)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["asaas_pago", "asaas_valor", "asaas_status_rotulo", "asaas_vencimento", "asaas_link", "asaas_comprovante", "asaas_pix", "asaas_boleto_linha"].map((v) => <ChipVar key={v} nome={v} />)}
          </div>
        </div>
      )}
    </>
  );
}

// Editor do nó "Google Contatos": salva o lead no Google Contatos PESSOAL do dono. Busca o status
// da conexão OAuth e, se NÃO estiver conectado, avisa que precisa conectar em Integrações (era o
// pedido do dono: arrastou o nó sem conexão → aviso claro pra ir conectar).
function GoogleContatosEditor({ step, onChange }: { step: Extract<Step, { type: "google_contact" }>; onChange: (s: Step) => void }) {
  const [st, setSt] = useState<{ connected: boolean; email?: string | null; configurado?: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    jget("/api/app/google/contacts/status")
      .then((d) => { if (vivo) setSt(d && !d.error ? d : { connected: false }); })
      .catch(() => { if (vivo) setSt({ connected: false }); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);
  const conectado = !!st?.connected;
  return (
    <>
      <div className="ask-note">
        <b>Google Contatos.</b> Quando o lead passa por aqui, ele é salvo no <b>seu Google Contatos</b> —
        nome, telefone e e-mail. Passo de passagem: <b>não envia mensagem</b> e, se o Google recusar, o
        fluxo segue normal.
      </div>
      {!carregando && !conectado && (
        <div className="ask-note" style={{ borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>
          <b>⚠️ Google Contatos não conectado.</b> Este nó só funciona depois que você conectar sua
          conta Google em <a href="/integracoes" target="_blank" rel="noreferrer"><b>Integrações → Google Contatos</b></a>.
          {st && st.configurado === false && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              (O login Google ainda não foi ativado no servidor — avise o suporte.)
            </div>
          )}
        </div>
      )}
      {!carregando && conectado && (
        <div className="muted" style={{ fontSize: 12.5, margin: "2px 0 8px" }}>
          Conectado{st?.email ? <> na conta <b>{st.email}</b></> : ""}. Os contatos vão pra essa conta.
        </div>
      )}
      <div className="field">
        <label>Nome do contato (aceita variáveis)</label>
        <input className="inp" value={step.nome ?? ""} placeholder="{{nome}}"
          onChange={(e) => onChange({ ...step, nome: e.target.value })} />
      </div>
      <div className="field">
        <label>Telefone (aceita variáveis)</label>
        <input className="inp" value={step.telefone ?? ""} placeholder="{{telefone}}"
          onChange={(e) => onChange({ ...step, telefone: e.target.value })} />
      </div>
      <div className="field">
        <label>E-mail (opcional, aceita variáveis)</label>
        <input className="inp" value={step.email ?? ""} placeholder="{{email}}"
          onChange={(e) => onChange({ ...step, email: e.target.value })} />
        <div className="muted" style={{ fontSize: 12 }}>Em branco, usa <code>{"{{nome}}"}</code> e <code>{"{{telefone}}"}</code> do lead.</div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Observações do contato (opcional, aceita variáveis)</label>
          <textarea className="inp" rows={2} value={step.notas ?? ""} placeholder="{{data_entrada_completa}} | Trabalhista | {{resumo_conversa}}"
            onChange={(e) => onChange({ ...step, notas: e.target.value })} />
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
            Vai no campo &quot;Observações&quot; do contato no Google. Dica: use <code>|</code> entre partes no nome e nas observações
            (ex.: <code>{"{{nome}} | Lead quente | {{data_entrada}} | {{utm_source}}"}</code>) — parte vazia some sozinha. Se o contato já existir,
            o nó <b>atualiza</b> nome e observações (é assim que o status muda no Contatos).
          </div>
        </div>
      </div>
    </>
  );
}

// Oficial da Meta o equivalente exige template de carrossel aprovado).
function CarouselEditor({ step, onChange }: { step: Extract<Step, { type: "carousel" }>; onChange: (s: Step) => void }) {
  const cards = step.cards ?? [];
  const setCard = (i: number, patch: Partial<(typeof cards)[number]>) =>
    onChange({ ...step, cards: cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <>
      <div className="field">
        <label>Mensagem (aparece antes dos cards)</label>
        <textarea className="inp" value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} />
        <VarsHint />
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: -4 }}>
        Só no WhatsApp Lite. Até 10 cards, 3 botões por card. Todo card precisa de imagem e texto — sem isso ele é descartado.
      </div>
      {cards.map((c, i) => (
        <div key={i} className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <b style={{ fontSize: 12.5 }}>Card {i + 1}</b>
            <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: 12, color: "var(--crit)" }} onClick={() => onChange({ ...step, cards: cards.filter((_, j) => j !== i) })}>remover</button>
          </div>
          <div className="field">
            <label>Imagem (URL)</label>
            <input className="inp" value={c.image} placeholder="https://…" onChange={(e) => setCard(i, { image: e.target.value })} />
          </div>
          <div className="field">
            <label>Texto do card</label>
            <textarea className="inp" style={{ minHeight: 54 }} value={c.text} onChange={(e) => setCard(i, { text: e.target.value })} />
          </div>
          <div className="field">
            <label>Botões (até 3)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(c.buttons ?? []).map((b, bi) => (
                <div key={bi} style={{ display: "flex", gap: 6 }}>
                  <input className="inp" style={{ flex: 1 }} value={b} placeholder={`Botão ${bi + 1}`} onChange={(e) => setCard(i, { buttons: (c.buttons ?? []).map((x, j) => (j === bi ? e.target.value : x)) })} />
                  <button type="button" className="btn" style={{ flex: "none", color: "var(--crit)" }} title="Remover" onClick={() => setCard(i, { buttons: (c.buttons ?? []).filter((_, j) => j !== bi) })}>✕</button>
                </div>
              ))}
              {(c.buttons ?? []).length < 3 && (
                <button type="button" className="btn" style={{ alignSelf: "flex-start", padding: "5px 10px", fontSize: 12 }} onClick={() => setCard(i, { buttons: [...(c.buttons ?? []), ""] })}>+ botão</button>
              )}
            </div>
          </div>
        </div>
      ))}
      {cards.length < 10 && (
        <button type="button" className="btn" style={{ alignSelf: "flex-start", padding: "6px 11px", fontSize: 12.5 }} onClick={() => onChange({ ...step, cards: [...cards, { image: "", text: "", buttons: [] }] })}>+ card</button>
      )}
    </>
  );
}

// ── Seletor de NÚMERO + GRUPO pros passos de mundo Lite ─────────────────────────────────────
// Grupo pertence ao APARELHO, não à conta: com 2 números conectados, a lista tem que dizer de
// qual deles. E num fluxo de API (disparado por template) o gateway da vez é a Meta, que não
// tem grupo nenhum — sem escolher o número aqui, o passo não teria como rodar.
function ContaEGrupo({ s, onChange, comGrupo }: {
  s: Extract<Step, { type: "add_to_group" | "mention_all" | "notify" }>;
  onChange: (v: Step) => void;
  comGrupo: boolean;
}) {
  const { accounts } = useAccounts();
  const lites = accounts.filter((a) => a.type === "LITE");
  const conta = (s as any).account as string | undefined;
  // A lista de grupos segue o número escolhido — trocar o número troca os grupos na hora.
  const { groupList, refresh, refreshing, groupsErr } = useGroupList(conta);
  return (
    <>
      <div className="field">
        <label>Por qual número (WhatsApp Lite)</label>
        <select className="inp" value={conta ?? ""} onChange={(e) => onChange({ ...s, account: e.target.value || undefined } as Step)}>
          <option value="">— o número que disparou o fluxo —</option>
          {lites.map((a) => <option key={a.id} value={a.id}>{a.name}{a.number ? ` · ${fmtNumber(a.number)}` : ""}</option>)}
        </select>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
          Grupo é do <b>aparelho</b>, não da conta — a lista abaixo muda conforme o número escolhido.
          {" "}Num fluxo que começa por <b>template da API Oficial</b> esta escolha é <b>obrigatória</b>:
          a API da Meta não tem grupos, então sem um número Lite aqui o passo não roda.
        </div>
      </div>
      {comGrupo && (
        <div className="field">
          <label>Grupo</label>
          <GroupSelect value={(s as any).groupJid ?? ""} onChange={(jid) => onChange({ ...s, groupJid: jid } as Step)}
            groupList={groupList} onRefresh={refresh} refreshing={refreshing} error={groupsErr} />
        </div>
      )}
      {!comGrupo && (
        <NotifyEditor step={s as Extract<Step, { type: "notify" }>} onChange={onChange} groupList={groupList}
          onRefreshGroups={refresh} refreshingGroups={refreshing} groupsErr={groupsErr} />
      )}
    </>
  );
}

function NotifyEditor({ step, onChange, groupList, onRefreshGroups, refreshingGroups, groupsErr }:{ step: Extract<Step, { type: "notify" }>; onChange: (s: Step) => void; groupList: GroupListItem[]; onRefreshGroups?: () => void | Promise<void>; refreshingGroups?: boolean; groupsErr?: string | null }) {
  const [num, setNum] = useState("");
  const targets = step.targets;
  const isGroup = (t: string) => t.includes("@g.us");
  const nameFor = (t: string) => { const g = groupList.find((x) => x.jid === t); return g ? (g.name || "").trim() || g.jid : t; };
  const addTarget = (t: string) => { const v = t.trim(); if (v && !targets.includes(v)) onChange({ ...step, targets: [...targets, v] }); };
  const removeTarget = (t: string) => onChange({ ...step, targets: targets.filter((x) => x !== t) });
  return (
    <>
      <div className="field">
        <label>Avisar em grupos</label>
        <GroupSelect value="" onChange={addTarget} groupList={groupList} placeholder="+ adicionar grupo…" onRefresh={onRefreshGroups} refreshing={refreshingGroups} error={groupsErr} />
      </div>
      <div className="field">
        <label>Ou números (com DDD)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="inp"
            style={{ flex: 1, minWidth: 0 }}
            value={num}
            placeholder="5511999999999"
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTarget(num.replace(/\D/g, "")); setNum(""); } }}
          />
          <button type="button" className="btn" style={{ flex: "none" }} onClick={() => { addTarget(num.replace(/\D/g, "")); setNum(""); }}>+ add</button>
        </div>
      </div>
      {targets.length > 0 && (
        <div className="notify-chips">
          {targets.map((t) => (
            <span key={t} className={"notify-chip" + (isGroup(t) ? " grp" : "")}>
              {isGroup(t) ? "👥 " : "📱 "}{nameFor(t)}
              <button type="button" className="notify-chip-x" onClick={() => removeTarget(t)} title="Remover">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="field">
        <label>Mensagem de aviso</label>
        <textarea className="inp" rows={3} value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} />
        <VarsHint />
      </div>
      <div className="agent-info">
        🔔 Passo de passagem: manda o aviso pros destinos e <b>segue o fluxo do lead</b> normalmente. Bom pra avisar a equipe (lead novo, virou atendimento humano, PIX gerado…).
      </div>
    </>
  );
}

const KNOWN_VARS = ["primeiro_nome", "nome", "email", "cidade", "produto", "valor", "link", "pix", "horario_escolhido", "data", "hora_min"];
function VariablePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const opts = KNOWN_VARS.includes(value) || !value ? KNOWN_VARS : [value, ...KNOWN_VARS];
  function confirm() {
    const v = draft.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (v) onChange(v);
    setAdding(false);
    setDraft("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <select className="inp" style={{ flex: 1 }} value={KNOWN_VARS.includes(value) || !value ? value : value} onChange={(e) => onChange(e.target.value)}>
          {opts.map((v) => (
            <option key={v} value={v}>{`{{${v}}}`}</option>
          ))}
        </select>
        <button type="button" className="btn" style={{ flex: "none" }} title="Criar campo personalizado" onClick={() => setAdding(true)}>add +</button>
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="inp"
            style={{ flex: 1 }}
            autoFocus
            value={draft}
            placeholder="nome do campo (ex.: instagram)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
          />
          <button type="button" className="btn" style={{ flex: "none" }} onClick={confirm}>OK</button>
        </div>
      )}
    </div>
  );
}

function StepEditor({
  step,
  groupList,
  onRefreshGroups,
  refreshingGroups,
  groupsErr,
  onChange,
  onRemove,
  onMove,
  canUp,
  canDown,
  fluxoId,
  naoSalvo,
  ehOficial,
}: {
  step: Step;
  groupList: GroupListItem[];
  onRefreshGroups?: () => void | Promise<void>;
  refreshingGroups?: boolean;
  groupsErr?: string | null;
  onChange: (s: Step) => void;
  onRemove: () => void;
  onMove: (dir: number) => void;
  canUp: boolean;
  canDown: boolean;
  fluxoId?: string;
  naoSalvo?: boolean;
  ehOficial?: boolean; // o fluxo fala pela API Oficial (tem template) → avisa o que não roda
}) {
  const s = step;
  // ⚠️ HOOK NO TOPO, SEMPRE. Isto vivia dentro do JSX do nó de Código (`s.type === "code" &&
  // <CodeEditor campos={useContext(...)} />`): como o && curto-circuita, o hook só era chamado
  // quando o passo era de código. Clicar de um nó de Código pra qualquer outro mudava a
  // quantidade de hooks do MESMO componente (o StepEditor não é remontado — não tem key) e o
  // React derrubava o builder inteiro com "Rendered fewer hooks than expected".
  const camposDoTeste = useContext(TesteCtx)?.captura?.fields ?? {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {s.type === "text" && (
        <div className="field">
          <label>Mensagem</label>
          <textarea className="inp" value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
          <VarsHint />
          <ChipsDoGatilho titulo="Clique pra inserir no fim da mensagem"
            onInserir={(v) => onChange({ ...s, text: ((s as Extract<Step, { type: "text" }>).text ?? "") + v })} />
        </div>
      )}

      {s.type === "note" && (
        <div className="field">
          <label>📝 Nota (só pra você — não é enviada ao lead)</label>
          <textarea className="inp" style={{ minHeight: 130 }} value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} placeholder="Escreva um lembrete, ideia ou observação sobre esta etapa…" />
          <div className="muted" style={{ fontSize: 12 }}>Aparece como um post-it amarelo no canvas. O motor ignora este nó (não envia nada).</div>
        </div>
      )}

      {s.type === "tag" && (
        <div className="field">
          <label>🏷️ Etiquetas (separe por vírgula)</label>
          <input className="inp" value={(s.tags || []).join(", ")} onChange={(e) => onChange({ ...s, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} placeholder="lead IA, quente, veio do anúncio" />
          {(s.tags || []).filter(Boolean).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {(s.tags || []).filter(Boolean).map((t, i) => <span key={i} className="tpl-status on" style={{ fontSize: 11 }}>🏷️ {t}</span>)}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12 }}>Carimba o contato no CRM (Contatos). Não envia nada ao lead — segue o fluxo direto. Aceita variáveis, ex.: <code>{"{{nome}}"}</code>.</div>
        </div>
      )}

      {s.type === "payment_check" && (
        <>
          <div className="ask-note">
            <b>Consulta de pagamento.</b> Este nó <b>não envia nada</b>: ele olha no banco se esta pessoa já
            pagou e manda o fluxo por um de <b>dois caminhos</b> — <b>Pagou</b> e <b>Não pagou</b>. É o que fecha
            a recuperação de PIX: espere 1h depois do PIX gerado e só cobre quem <b>não</b> pagou.
          </div>
          <div className="field">
            <label>Filtrar por</label>
            <select className="inp" value={s.porCodigo ? "codigo" : "nome"} onChange={(e) => onChange({ ...s, porCodigo: e.target.value === "codigo" })}>
              <option value="nome">Nome do produto (parcial)</option>
              <option value="codigo">Código do produto (exato)</option>
            </select>
          </div>
          <div className="field">
            <label>{s.porCodigo ? "Código do produto" : "Nome do produto"}</label>
            <input className="inp" value={s.produto ?? ""} onChange={(e) => onChange({ ...s, produto: e.target.value })}
              placeholder={s.porCodigo ? "ex.: 9f2c1a80-…  (o ID que a plataforma manda)" : "ex.: Curso de Typebot"} />
            <div className="muted" style={{ fontSize: 12 }}>
              {s.porCodigo
                ? "O código é o mais seguro: não muda quando você renomeia a oferta. Ele é gravado a partir das vendas que chegarem daqui pra frente."
                : "Casa por PARTE do nome, sem diferenciar maiúscula/minúscula — “typebot” acha “Curso de Typebot ADVANCED”."}
              {" "}Em branco = qualquer produto.
            </div>
          </div>
          <div className="field">
            <label>Só considerar pagamento das últimas (horas)</label>
            <input className="inp" type="number" min={0} max={8760} style={{ width: 120 }} value={s.horas ?? 0}
              onChange={(e) => onChange({ ...s, horas: Math.max(0, Math.min(8760, Number(e.target.value) || 0)) })} />
            <div className="muted" style={{ fontSize: 12 }}>0 = qualquer época (se a pessoa já comprou um dia, conta como pagou).</div>
          </div>
          <div className="ask-note" style={{ marginTop: 4 }}>
            Conta como pago: <b>compra aprovada</b> e <b>assinatura renovada</b>. Reembolso e chargeback não entram.
            Ligue as duas saídas do nó no canvas — o que não estiver ligado cai na saída de baixo.
          </div>
        </>
      )}

      {s.type === "bloquear" && (
        <>
          <div className="ask-note">
            <b>Bloquear contato.</b> Coloca a pessoa na <b>lista de bloqueio</b> — é o mesmo opt-out do
            “PARAR”, então <b>nenhum</b> fluxo, follow-up agendado, atendente IA ou disparo fala com ela de novo.
            Ela volta sozinha se mandar <b>VOLTAR</b>.
          </div>
          <div className="field">
            <label>🏷️ Etiquetas ao bloquear (separe por vírgula)</label>
            <input className="inp" value={(s.tags || []).join(", ")}
              onChange={(e) => onChange({ ...s, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              placeholder="Contato bloqueado" />
            <div className="muted" style={{ fontSize: 12 }}>
              Em branco usa <b>“Contato bloqueado”</b>. Quer registrar também numa planilha? Ligue o nó
              <b> Planilha Google</b> logo depois deste — ele grava a linha com as variáveis que você escolher.
            </div>
          </div>
        </>
      )}

      {s.type === "window" && (
        <>
          <div className="ask-note">
            <b>Janela de conversa.</b> A Meta só deixa mandar mensagem livre enquanto a janela estiver
            <b> aberta</b> — e ela conta a partir da <b>última vez que a PESSOA falou</b>, então é a hora
            dela, muda de lead pra lead. Fechada, só template aprovado passa. Este nó <b>não envia nada</b>:
            ele olha o relógio daquele lead e escolhe o caminho.
          </div>
          <div className="field">
            <label>Qual janela</label>
            <select className="inp" value={String(s.horas ?? 0)} onChange={(e) => onChange({ ...s, horas: Number(e.target.value) })}>
              <option value="0">Descobrir sozinho (72h se veio de anúncio, senão 24h)</option>
              <option value="24">24 horas — conversa normal</option>
              <option value="72">72 horas — lead de anúncio (Click-to-WhatsApp)</option>
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>
              Quem chega por um anúncio de clique-pro-WhatsApp ganha <b>72h</b> da Meta (Free Entry Point),
              não 24h. Deixando em <b>descobrir sozinho</b>, o nó usa 72h pra quem veio de anúncio e 24h
              pro resto — que é o certo na maioria dos fluxos.
            </div>
          </div>
          <div className="ask-note">
            Depois deste nó dá pra usar <code>{"{{janela_min}}"}</code> (minutos que faltam) num texto de
            urgência — ex.: <i>“ainda dá tempo, mas só por mais {"{{janela_min}}"} minutos”</i>.
          </div>
        </>
      )}

      {s.type === "code" && <CodeEditor s={s} onChange={onChange} campos={camposDoTeste} />}

      {s.type === "location" && (
        <>
          <div className="ask-note">
            📍 <b>Pino no mapa.</b> Manda a localização como o WhatsApp mostra: cartão com mapa, nome e
            endereço. As coordenadas podem vir de <b>variável</b> — é assim que um alerta de rastreador
            mostra onde o veículo está no momento do evento.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Latitude</label>
              <input className="inp" value={s.lat} placeholder="{{latitude}}" onChange={(e) => onChange({ ...s, lat: e.target.value })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Longitude</label>
              <input className="inp" value={s.lng} placeholder="{{longitude}}" onChange={(e) => onChange({ ...s, lng: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Nome do local <span className="muted">(opcional)</span></label>
            <input className="inp" value={s.nome ?? ""} placeholder="Localização do veículo" onChange={(e) => onChange({ ...s, nome: e.target.value })} />
          </div>
          <div className="field">
            <label>Endereço <span className="muted">(opcional)</span></label>
            <input className="inp" value={s.endereco ?? ""} placeholder="{{address}}" onChange={(e) => onChange({ ...s, endereco: e.target.value })} />
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Sem coordenada válida o passo é <b>pulado</b> (e o log diz por quê) — pino em 0,0 seria pior
            que não mandar nada.
          </div>
        </>
      )}

      {s.type === "switch" && (
        <>
          <div className="ask-note">
            <b>Switch.</b> Olha o valor de UM campo (variável) e escolhe entre VÁRIOS caminhos — cada
            caso vira uma saída. Útil pra status vindo de webhook (rastreador, ERP, CRM…): chave
            ligada, veículo bloqueado, fatura em aberto… tudo no mesmo nó. Não envia nada; o que não
            casar com nenhum caso sai por <b>"Nenhum caso bateu"</b>.
          </div>
          <div className="field">
            <label>Campo a comparar</label>
            <input className="inp" value={s.campo ?? ""} onChange={(e) => onChange({ ...s, campo: e.target.value })} placeholder="status" />
            <div className="muted" style={{ fontSize: 12 }}>
              Sem chaves — só o nome: <code>status</code>, <code>evento</code>, <code>message</code>…
              (o que o webhook trouxer).
            </div>
          </div>
          <div className="field">
            <label>Casos</label>
            {(s.casos ?? []).map((c, i) => (
              // Duas linhas por caso: em cima a REGRA, que se lê como frase ({{message}} contém
              // "chave ligada"); embaixo o nome da saída. Numa linha só, com o painel estreito,
              // sobrava ~60px por campo e não dava pra ler nem a regra nem o rótulo.
              // O VALOR ganha linha própria: com campo + operador + valor + remover na mesma
              // linha, num painel estreito sobrava ~10px pro valor e ele sumia (print do dono).
              <div key={i} className="caso-switch">
                <div className="caso-topo">
                  <span className="caso-n">{i + 1}</span>
                  <ChipVar nome={s.campo || "campo"} titulo={`Campo comparado neste Switch — clique pra copiar {{${s.campo || "campo"}}}`} />
                  <select className="inp caso-op" value={c.op ?? "igual"}
                    onChange={(e) => { const n = [...(s.casos ?? [])]; n[i] = { ...n[i], op: e.target.value as "igual" | "contem" }; onChange({ ...s, casos: n }); }}>
                    <option value="igual">é exatamente</option>
                    <option value="contem">contém</option>
                  </select>
                  <button className="caso-x" onClick={() => onChange({ ...s, casos: (s.casos ?? []).filter((_, k) => k !== i) })} title="Remover este caso">
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <input className="inp caso-valor" value={c.valor} placeholder="chave ligada" title={c.valor}
                  onChange={(e) => { const n = [...(s.casos ?? [])]; n[i] = { ...n[i], valor: e.target.value }; onChange({ ...s, casos: n }); }} />
                <label className="caso-saida">
                  <span>nome da saída no nó</span>
                  <input className="inp" value={c.rotulo} placeholder="Chave ligada" title={c.rotulo}
                    onChange={(e) => { const n = [...(s.casos ?? [])]; n[i] = { ...n[i], rotulo: e.target.value }; onChange({ ...s, casos: n }); }} />
                </label>
              </div>
            ))}
            <button className="btn" style={{ marginTop: 8 }}
              onClick={() => onChange({ ...s, casos: [...(s.casos ?? []), { rotulo: `Caso ${(s.casos ?? []).length + 1}`, valor: "", op: "igual" }] })}>
              <Icon name="plus" size={13} /> Adicionar caso
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Comparação ignora maiúscula/minúscula e acento. <b>"contém"</b> casa quando o trecho aparece
              em qualquer parte do valor (útil pra mensagem de alerta com texto variável). A ordem dos
              casos importa: o primeiro que bater ganha — coloque o mais específico antes do mais genérico.
              Cada caso vira uma bolinha no nó — ligue no passo que deve rodar quando aquele valor chegar.
            </div>
          </div>
        </>
      )}

      {s.type === "condition" && (
        <>
          <div className="ask-note">
            <b>Condição.</b> Olha a ficha do contato e escolhe o caminho: saída <b>Sim</b> e saída <b>Não</b>.
            Não envia nada. O que não estiver ligado cai na saída padrão.
          </div>
          <div className="field">
            <label>O que checar</label>
            <select className="inp" value={s.checa ?? "campo"} onChange={(e) => onChange({ ...s, checa: e.target.value as "campo" | "tag" })}>
              <option value="campo">Um campo da ficha (nome, e-mail, utm_source, o que você capturou…)</option>
              <option value="tag">Uma etiqueta do CRM</option>
            </select>
          </div>
          {s.checa === "tag" ? (
            <div className="field">
              <label>Nome da etiqueta</label>
              <input className="inp" value={s.valor ?? ""} onChange={(e) => onChange({ ...s, valor: e.target.value })} placeholder="cliente" />
              <div className="muted" style={{ fontSize: 12 }}>Sai por <b>Sim</b> se o contato tiver essa etiqueta.</div>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Campo</label>
                <input className="inp" value={s.campo ?? ""} onChange={(e) => onChange({ ...s, campo: e.target.value })} placeholder="email" />
                <div className="muted" style={{ fontSize: 12 }}>
                  Sem chaves — só o nome: <code>email</code>, <code>nome</code>, <code>utm_source</code>, <code>pix</code>…
                </div>
              </div>
              <div className="field">
                <label>Comparação</label>
                <select className="inp" value={s.op ?? "existe"} onChange={(e) => onChange({ ...s, op: e.target.value as "igual" | "contem" | "existe" })}>
                  <option value="existe">Está preenchido</option>
                  <option value="igual">É igual a…</option>
                  <option value="contem">Contém…</option>
                </select>
              </div>
              {s.op && s.op !== "existe" && (
                <div className="field">
                  <label>Valor</label>
                  <input className="inp" value={s.valor ?? ""} onChange={(e) => onChange({ ...s, valor: e.target.value })} placeholder="ex.: meta" />
                  <div className="muted" style={{ fontSize: 12 }}>Aceita variáveis. Não diferencia maiúscula de minúscula.</div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {s.type === "split_out" && (
        <>
          <div className="ask-note">
            📤 <b>Separar lista.</b> Tira a lista de dentro da resposta de uma API e deixa pronta
            num campo — é o <b>Split Out</b> de quem vem do n8n. Costuma vir logo depois de um
            passo de HTTP e alimentar o <b>Loop</b>.
          </div>
          <div className="field">
            <label>Campo que tem a lista</label>
            <input className="inp" value={s.campo} placeholder="ex.: resposta_data"
              onChange={(e) => onChange({ ...s, campo: e.target.value.replace(/[{}\s]/g, "") })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Sem chaves — só o nome. Acha a lista mesmo quando ela vem <b>dentro de um objeto</b>
              (<code>{"{ \"data\": [...] }"}</code>) ou por caminho pontuado (<code>resposta.data</code>).
            </div>
          </div>
          <div className="field">
            <label>Guardar em <span className="muted">(opcional)</span></label>
            <input className="inp" value={s.salvarEm ?? ""} placeholder={(s.campo || "campo").replace(/[^\w]/g, "_") + "_itens"}
              onChange={(e) => onChange({ ...s, salvarEm: e.target.value.replace(/[^\w]/g, "_") })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Além da lista, você ganha a <b>contagem</b> em
              <code> {"{{" + (s.salvarEm || (s.campo || "campo").replace(/[^\w]/g, "_") + "_itens") + "_total}}"}</code> —
              útil pra avisar “encontrei 12 cobranças” antes de disparar.
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Sozinho ele <b>não envia nem repete nada</b>: só prepara. Quem percorre item por item é
            o nó <b>Loop</b>, apontando pro campo que este aqui produziu.
          </div>
        </>
      )}

      {s.type === "filter" && <FiltroEditor s={s} onChange={onChange} />}

      {s.type === "loop" && (
        <>
          <div className="ask-note">
            🔁 <b>Para cada item da lista.</b> Pega uma lista (normalmente a resposta de um passo de
            HTTP) e roda o ramo <b>“cada item”</b> uma vez por item. Como cada item costuma ser
            <b> uma pessoa diferente</b>, cada volta vira um envio próprio — não é repetição dentro
            da mesma conversa.
          </div>
          <div className="field">
            <label>Campo que tem a lista</label>
            <input className="inp" value={s.lista} placeholder="ex.: cobranca_data"
              onChange={(e) => onChange({ ...s, lista: e.target.value.replace(/[{}\s]/g, "") })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Sem chaves — só o nome. Se o passo de HTTP guardou em <code>cobranca</code> e a API
              devolveu <code>{"{ \"data\": [...] }"}</code>, o campo aqui é <code>cobranca_data</code>.
            </div>
          </div>
          <div className="field">
            <label>Onde está o telefone em cada item</label>
            <input className="inp" value={s.campoTelefone ?? ""} placeholder="telefone"
              onChange={(e) => onChange({ ...s, campoTelefone: e.target.value.replace(/[{}\s]/g, "") })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Nome do campo dentro de cada item da lista (ex.: <code>telefone</code>,
              <code> customer_mobilePhone</code>). Item sem telefone válido é <b>pulado</b>.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Máximo de envios</label>
              <input className="inp" type="number" min={1} max={500} value={s.limite ?? 50}
                onChange={(e) => onChange({ ...s, limite: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Intervalo entre eles (s)</label>
              <input className="inp" type="number" min={1} max={600} value={Math.round((s.intervaloMs ?? 8000) / 1000)}
                onChange={(e) => onChange({ ...s, intervaloMs: Math.max(1, Math.min(600, Number(e.target.value) || 1)) * 1000 })} />
            </div>
          </div>
          <div className="ask-warn">
            ⚠️ Isto é <b>disparo em massa</b>: cada item manda mensagem pra uma pessoa. O limite e o
            intervalo existem pra proteger seu número — rajada de mensagem é o caminho mais curto
            pro WhatsApp bloquear. Com {s.limite ?? 50} envios a cada {Math.round((s.intervaloMs ?? 8000) / 1000)}s,
            o último sai em <b>~{Math.round(((s.limite ?? 50) - 1) * ((s.intervaloMs ?? 8000) / 1000) / 60)} min</b>.
            Quem pediu PARAR nunca recebe.
          </div>
        </>
      )}

      {s.type === "edit_fields" && (
        <>
          <div className="ask-note">
            📝 <b>Editar campos.</b> Define vários valores de uma vez — o equivalente ao
            <b> Edit Fields (Set)</b> do n8n. Cada campo vira variável pros passos seguintes.
            Não envia nada.
          </div>
          <div className="field">
            <label>Campos</label>
            {(s.campos ?? []).map((c, i) => (
              <div key={i} className="caso-switch">
                <div className="caso-topo">
                  <span className="caso-n">{i + 1}</span>
                  <input className="inp" style={{ flex: 1, minWidth: 0 }} value={c.campo} placeholder="nome do campo"
                    onChange={(e) => { const n = [...(s.campos ?? [])]; n[i] = { ...n[i], campo: e.target.value }; onChange({ ...s, campos: n }); }} />
                  <button className="caso-x" title="Remover campo"
                    onClick={() => onChange({ ...s, campos: (s.campos ?? []).filter((_, k) => k !== i) })}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <input className="inp caso-valor" value={c.valor} placeholder="valor (aceita {{variaveis}})"
                  onChange={(e) => { const n = [...(s.campos ?? [])]; n[i] = { ...n[i], valor: e.target.value }; onChange({ ...s, campos: n }); }} />
                {c.campo?.trim() && (
                  <div className="caso-saida"><span>vira</span><div><ChipVar nome={c.campo.trim().replace(/[^\w]/g, "_")} /></div></div>
                )}
              </div>
            ))}
            <button className="btn" style={{ marginTop: 9 }}
              onClick={() => onChange({ ...s, campos: [...(s.campos ?? []), { campo: "", valor: "" }] })}>
              <Icon name="plus" size={13} /> Adicionar campo
            </button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={s.salvarNaFicha !== false}
              onChange={(e) => onChange({ ...s, salvarNaFicha: e.target.checked })} />
            Guardar na ficha do contato <span className="muted">(aparece no CRM e vale nos próximos fluxos)</span>
          </label>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Desmarcado, o valor vale <b>só neste disparo</b> — que é como o Set do n8n se comporta.
          </div>
        </>
      )}

      {s.type === "set_variable" && (
        <>
          <div className="ask-note">
            <b>Definir variável.</b> Grava um valor na ficha do contato. Vale já nos próximos passos deste
            fluxo <b>e</b> fica salvo pra sempre (aparece no CRM e nos fluxos seguintes). Não envia nada.
          </div>
          <div className="field">
            <label>Nome do campo</label>
            <input className="inp" value={s.campo ?? ""} onChange={(e) => onChange({ ...s, campo: e.target.value })} placeholder="etapa" />
            <div className="muted" style={{ fontSize: 12 }}>Vira <code>{"{{"}{s.campo || "etapa"}{"}}"}</code> nos textos.</div>
          </div>
          <div className="field">
            <label>Valor</label>
            <input className="inp" value={s.valor ?? ""} onChange={(e) => onChange({ ...s, valor: e.target.value })} placeholder="quente" />
            <div className="muted" style={{ fontSize: 12 }}>Aceita variáveis — ex.: <code>{"{{primeiro_nome}}"}</code> ou <code>{"{{utm_campaign}}"}</code>.</div>
          </div>
        </>
      )}

      {s.type === "utm" && (
        <div className="ask-note">
          <b>Coletar UTMs.</b> Guarda na ficha do lead <b>de onde ele veio</b> — origem, mídia,
          campanha, criativo, termo e o id do anúncio — o que tiver vindo no evento que disparou este
          fluxo (ex.: o checkout da Kiwify). <b>Se o lead não tiver nenhuma UTM, o nó não faz nada</b> e
          segue reto. Não envia mensagem nenhuma.
          <div style={{ marginTop: 8 }}>
            Depois de passar por aqui, a conversa mostra o selo <b>ADS</b> e a lista de origem no
            cabeçalho, o funil ganha a coluna <b>“Veio de (UTM)”</b>, e as variáveis
            <code> {"{{utm_source}}"}</code>, <code>{"{{utm_campaign}}"}</code>, <code>{"{{ad_id}}"}</code>…
            ficam prontas pros próximos passos.
          </div>
        </div>
      )}

      {s.type === "gsheet_append" && (
        <>
          <div className="field">
            <label>📊 Link da planilha (Google Sheets)</label>
            <input className="inp" type="url" value={s.sheetUrl} onChange={(e) => onChange({ ...s, sheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <div className="muted" style={{ fontSize: 12 }}>É o <b>link</b> da planilha (copie da barra do navegador). Ela precisa estar <b>compartilhada como Editor</b> com o e-mail da conta de serviço — conecte em <b>Configurações → Conectores</b>.</div>
          </div>
          <MapaPlanilha s={s} onChange={onChange} />
          <div className="muted" style={{ fontSize: 12 }}>Cada coluna da planilha recebe o dado escolhido, na mesma ordem da linha 1. Erro na planilha <b>não trava o fluxo</b> (fica no log).</div>
        </>
      )}

      {s.type === "webhook_out" && (
        <>
          <div className="field">
            <label>Método e endereço</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="inp" style={{ maxWidth: 118 }} value={s.metodo ?? "POST"}
                onChange={(e) => { const v = e.target.value; if (v.startsWith("_")) return; onChange({ ...s, metodo: v as "GET" | "POST" | "PUT" }); }}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                {/* Visíveis pra não parecer que faltam — mas desligados. Ninguém usa hoje (nem o
                    um cliente), e método que grava/apaga no sistema do cliente merece pedido explícito. */}
                <option value="_del" disabled>DELETE — em breve</option>
                <option value="_patch" disabled>PATCH — em breve</option>
                <option value="_head" disabled>HEAD — em breve</option>
                <option value="_opt" disabled>OPTIONS — em breve</option>
              </select>
              <input className="inp" style={{ flex: 1, minWidth: 0 }} type="url" value={s.url}
                onChange={(e) => onChange({ ...s, url: e.target.value })} placeholder="https://api.exemplo.com/v3/clientes" />
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              {(s.metodo ?? "POST") === "GET"
                ? <>No <b>GET</b> os campos abaixo viram <b>parâmetros na URL</b> (?status=OVERDUE&limit=100).</>
                : <>No <b>{s.metodo ?? "POST"}</b> os campos abaixo viram o <b>corpo JSON</b> da chamada.</>}
              {" "}Precisa ser um endereço público — a rede interna do servidor é bloqueada.
            </div>
          </div>

          <AuthDoHttp s={s} onChange={onChange} />

          <div className="field">
            <label>Guardar a resposta em <span className="muted">(opcional)</span></label>
            <input className="inp" value={s.salvarEm ?? ""} placeholder="ex.: cobranca"
              onChange={(e) => onChange({ ...s, salvarEm: e.target.value.replace(/[^\w]/g, "_") })} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
              Com um nome aqui, o que o outro sistema responder vira variável pros próximos passos:
              a resposta <code>{"{ \"valor\": 197 }"}</code> com o nome <code>cobranca</code> te dá
              <code> {"{{cobranca_valor}}"}</code>. Vazio = só chama e segue, sem guardar.
            </div>
          </div>
          <CamposWebhook s={s} onChange={onChange} />
        </>
      )}

      {s.type === "reminder" && (
        <>
          <div className="field">
            <label>Mensagem de "estou na escuta"</label>
            <textarea className="inp" value={s.text ?? ""} onChange={(e) => onChange({ ...s, text: e.target.value })} placeholder="Ok! Estou na escuta do lembrete…" />
          </div>
          <div className="ask-note">
            <b>Como funciona:</b> ao chegar aqui, o fluxo responde essa mensagem e fica <b>na escuta</b>. A próxima mensagem (texto ou <b>áudio</b>) é interpretada pela IA — dia, hora, destinatário (número, nome de grupo ou de contato) e o texto — e vira um <b>Lembrete agendado</b> (aparece na tela Lembretes). Funciona inclusive com mensagens <b>suas</b> — use o gatilho <code>#lembrete</code> no seu próprio chat pra ditar lembretes por áudio. Responder <i>cancelar</i> desiste.
          </div>
        </>
      )}

      {s.type === "presence" && (
        <>
          <div className="field">
            <label>Ação</label>
            <select className="inp" value={s.presence} onChange={(e) => onChange({ ...s, presence: e.target.value })}>
              <option value="composing">Digitando…</option>
              <option value="recording">Gravando áudio…</option>
            </select>
          </div>
          <SecondsField label="Por quanto tempo" ms={s.ms ?? 2000} onChange={(ms) => onChange({ ...s, ms })} />
        </>
      )}

      {s.type === "call" && (
        <>
          <div className="ask-note" style={{ borderColor: "rgba(240,180,41,.5)", background: "rgba(240,180,41,.08)" }}>
            <b>Só WhatsApp Lite.</b> Faz o telefone da pessoa <b>tocar</b> — a ligação fica <b>muda</b>
            (a API não coloca áudio na chamada). Use com parcimônia: ligação automática é o gatilho de
            banimento mais rápido do WhatsApp. Em fluxo da API Oficial, este passo é ignorado.
          </div>
          <div className="field">
            <label>Encerrar depois de (segundos)</label>
            <input className="inp" type="number" min={1} max={15}
              value={s.callDuration ?? 5}
              onChange={(e) => onChange({ ...s, callDuration: Math.min(15, Math.max(1, Number(e.target.value) || 5)) })} />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              A chamada desliga sozinha nesse tempo. Máximo de 15 segundos.
            </div>
          </div>
        </>
      )}

      {s.type === "wait" && <WaitEditor step={s} onChange={onChange} />}

      {s.type === "ptv" && (
        <div className="ask-note" style={{ borderColor: "rgba(240,180,41,.5)", background: "rgba(240,180,41,.08)" }}>
          <b>Só WhatsApp Lite.</b> A API Oficial da Meta <b>não tem vídeo de bolinha</b> — num fluxo que
          fala pela conta oficial, este passo é recusado (o log diz “não suportado”). Pra vídeo na
          oficial, use o passo <b>Mídia</b> (vídeo normal) ou o vídeo no cabeçalho do template.
        </div>
      )}
      {(s.type === "ptt" || s.type === "ptv") && (
        <div className="field">
          <label>{s.type === "ptt" ? "Áudio de voz" : "Vídeo bolinha (PTV)"} — URL ou envie do computador</label>
          <MediaFileField
            value={s.file}
            onChange={(v) => onChange({ ...s, file: v })}
            accept={s.type === "ptt" ? "audio/*" : "video/*"}
            maxMB={70}
            maxDurationSec={s.type === "ptv" ? 60 : undefined}
            hint={s.type === "ptv" ? "Vídeo bolinha: quadrado, no máx 60s e até 70MB pelo painel (maior: cole um link)." : "Áudio de voz, até 70MB pelo painel."}
          />
        </div>
      )}

      {s.type === "media" && (
        <>
          <div className="field">
            <label>Tipo</label>
            <select className="inp" value={s.mediaType} onChange={(e) => onChange({ ...s, mediaType: e.target.value })}>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
              <option value="document">Documento</option>
            </select>
          </div>
          <div className="field">
            <label>Arquivo — URL ou envie do computador</label>
            <MediaFileField
              value={s.file}
              onChange={(v) => onChange({ ...s, file: v })}
              accept={s.mediaType === "video" ? "video/*" : s.mediaType === "document" ? "*/*" : s.mediaType === "audio" ? "audio/*" : "image/*"}
              maxMB={70}
              hint={s.mediaType === "image" ? "Imagem até 70MB. Ou cole uma URL (ex.: nifty com {{nome}})." : s.mediaType === "video" ? "Vídeo até 70MB pelo painel — maior: cole um link direto. Na API Oficial a Meta aceita vídeo até 16MB." : "Arquivo até 70MB pelo painel — maior: cole um link direto."}
            />
          </div>
          <div className="field">
            <label>Legenda (opcional)</label>
            <input className="inp" value={s.caption ?? ""} onChange={(e) => onChange({ ...s, caption: e.target.value })} />
          </div>
        </>
      )}

      {s.type === "buttons" && (
        <>
          <div className="field">
            <label>Mensagem (acima dos botões)</label>
            <textarea className="inp" value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
            <VarsHint />
          </div>
          <div className="field">
            <label>Botões (até 3 · resposta rápida)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {s.buttons.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input className="inp" style={{ flex: 1 }} value={b} placeholder={`Botão ${i + 1}`} onChange={(e) => onChange({ ...s, buttons: s.buttons.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" className="btn" style={{ flex: "none", color: "var(--crit)" }} title="Remover" onClick={() => onChange({ ...s, buttons: s.buttons.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {s.buttons.length < 3 && (
                <button type="button" className="btn" style={{ alignSelf: "flex-start", padding: "6px 11px", fontSize: 12.5 }} onClick={() => onChange({ ...s, buttons: [...s.buttons, ""] })}>+ botão</button>
              )}
            </div>
          </div>
        </>
      )}

      {s.type === "carousel" && <CarouselEditor step={s} onChange={onChange} />}

      {s.type === "google_contact" && <GoogleContatosEditor step={s} onChange={onChange} />}
      {s.type === "asaas" && <AsaasEditor step={s} onChange={onChange} />}
      {s.type === "zapsign" && <ZapSignEditor step={s} onChange={onChange} />}
      {s.type === "meta_ads" && <MetaAdsEditor step={s} onChange={onChange} />}
      {s.type === "metricas_dia" && <MetricasDiaEditor step={s} onChange={onChange} />}
      {s.type === "gsheet_read" && <LerPlanilhaEditor step={s} onChange={onChange} />}
      {s.type === "email" && <EmailEditor step={s} onChange={onChange} />}

      {s.type === "google_doc" && (
        <>
          <div className="ask-note">
            <b>Google Docs.</b> Usa a <b>mesma conexão</b> do Google Contatos (Integrações). Passo de
            passagem: não envia mensagem, e se o Google recusar o fluxo <b>segue normal</b>.
            <div style={{ marginTop: 6 }}>
              Depois deste passo, <code>{"{{doc_link}}"}</code> tem o link do documento — dá pra mandar
              pro lead no passo seguinte.
            </div>
          </div>
          <div className="field">
            <label>O que fazer</label>
            <select className="inp" value={s.modo ?? "criar"} onChange={(e) => onChange({ ...s, modo: e.target.value as "criar" | "anexar" | "preencher" })}>
              <option value="criar">Criar um documento novo (um por lead)</option>
              <option value="preencher">Preencher um documento: troca «campos» pelos dados do lead</option>
              <option value="anexar">Escrever no fim de um documento que já existe</option>
            </select>
          </div>
          {s.modo === "anexar" || s.modo === "preencher" ? (
            <div className="field">
              <label>Link do documento</label>
              <input className="inp" value={s.docUrl ?? ""} onChange={(e) => onChange({ ...s, docUrl: e.target.value })}
                placeholder="https://docs.google.com/document/d/…" />
              <div className="muted" style={{ fontSize: 12 }}>
                Cole o link da barra do navegador. O documento precisa ser da <b>mesma conta</b> que você
                conectou em Integrações.
              </div>
              {s.modo === "preencher" && (
                <div className="ask-note" style={{ marginTop: 8 }}>
                  Escreva no documento os marcadores <code>&lt;&lt;nome&gt;&gt;</code>,{" "}
                  <code>&lt;&lt;telefone&gt;&gt;</code>, <code>&lt;&lt;valor&gt;&gt;</code>… (ou com{" "}
                  <code>{"{{ }}"}</code>) e o nó troca pelos dados do lead. <b>Atenção:</b> ele edita{" "}
                  <b>esse documento mesmo</b> — preenchido uma vez, os marcadores somem. Pra gerar{" "}
                  <b>um documento por lead</b>, use o modo <b>Criar</b>.
                </div>
              )}
            </div>
          ) : (
            <div className="field">
              <label>Título do documento (aceita variáveis)</label>
              <input className="inp" value={s.titulo ?? ""} onChange={(e) => onChange({ ...s, titulo: e.target.value })}
                placeholder="Proposta — {{nome}}" />
              <div className="muted" style={{ fontSize: 12 }}>
                O documento nasce na <b>raiz do seu Drive</b> (o Google não deixa escolher pasta sem
                permissão ampla, que a gente não pede de propósito).
              </div>
            </div>
          )}
          {s.modo !== "preencher" && (
          <div className="field">
            <label>{s.modo === "anexar" ? "Parágrafo a acrescentar" : "Conteúdo do documento"} (aceita variáveis)</label>
            <textarea className="inp" style={{ minHeight: 130 }} value={s.corpo ?? ""}
              onChange={(e) => onChange({ ...s, corpo: e.target.value })}
              placeholder={s.modo === "anexar"
                ? "{{nome}} — {{telefone}} — entrou pelo {{utm_source}}"
                : "Olá {{primeiro_nome}},\n\nSegue a proposta do {{produto}} no valor de {{valor}}.\n\nQualquer dúvida é só chamar no WhatsApp."} />
          </div>
          )}
        </>
      )}

      {s.type === "google_calendar" && (
        <>
          <div className="ask-note">
            <b>Agenda Google.</b> Usa a <b>mesma conexão</b> do Google (Integrações). Passo de passagem:
            não envia mensagem, e se o Google recusar o fluxo <b>segue normal</b>.
            <div style={{ marginTop: 6 }}>
              <b>Receita pra IA marcar reunião:</b> ① <i>Horários livres</i> → ② <i>Agente de IA</i> com{" "}
              <code>{"{{horarios_livres}}"}</code> no prompt e um caminho "agendar" → ③ <i>Pergunta</i> guardando em{" "}
              <code>horario_escolhido</code> (dica: "número da opção") → ④ <i>Marcar reunião</i> → ⑤ texto com{" "}
              <code>{"{{agenda_quando}}"}</code> e <code>{"{{agenda_link}}"}</code>.
            </div>
          </div>
          <div className="field">
            <label>O que fazer</label>
            <select className="inp" value={s.acao ?? "horarios"} onChange={(e) => onChange({ ...s, acao: e.target.value as "horarios" | "criar" | "calls_do_dia" | "convidar" })}>
              <option value="horarios">Buscar horários livres na minha agenda</option>
              <option value="criar">Marcar a reunião no horário que o lead escolheu</option>
              <option value="calls_do_dia">Listar as calls do dia (pra lembrete e confirmação)</option>
              <option value="convidar">Convidar o lead pra um evento (ex.: aula, workshop)</option>
            </select>
          </div>
          {s.acao === "convidar" ? (
            <>
              <div className="ask-note">
                Acha a <b>próxima ocorrência</b> do evento na sua agenda e põe o e-mail do lead como convidado. O Google
                manda o convite por e-mail e lembra a pessoa no dia. Evento semanal: entra só a data mais próxima.
              </div>
              <div className="field"><label>Link do Meet do evento (ou um trecho do título)</label>
                <input className="inp" value={s.busca ?? ""} placeholder="https://meet.google.com/SUA-SALA" onChange={(e) => onChange({ ...s, busca: e.target.value })} /></div>
              <div className="field"><label>E-mail do convidado</label>
                <input className="inp" value={s.email ?? ""} placeholder="{{email}}" onChange={(e) => onChange({ ...s, email: e.target.value || undefined })} /></div>
              <div className="muted" style={{ fontSize: 11.5 }}>Cria <code>{"{{agenda_convite}}"}</code> = ok, ja_estava ou sem_email. Precisa do Google conectado em Integrações.</div>
            </>
          ) : s.acao === "calls_do_dia" ? (
            <>
              <div className="ask-note">
                Lê as reuniões que o modo <i>Marcar</i> criou (o telefone do lead fica na descrição do evento) e
                monta uma <b>lista</b> pro passo <i>Loop</i> falar com cada um. Combina com o gatilho{" "}
                <i>Agendamento</i> (ex.: todo dia útil às 8h).
              </div>
              <div className="cmp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field"><label>Qual dia</label>
                  <select className="inp" value={String(s.diaOffset ?? 0)} onChange={(e) => onChange({ ...s, diaOffset: Number(e.target.value) })}>
                    <option value="0">Hoje</option>
                    <option value="1">Amanhã (lembrete na véspera)</option>
                  </select></div>
                <div className="field"><label>Nome da lista</label>
                  <input className="inp" value={s.salvarEm ?? ""} onChange={(e) => onChange({ ...s, salvarEm: e.target.value })} placeholder="calls_hoje" /></div>
              </div>
              <div className="field">
                <label>Variáveis que este passo cria</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["calls_hoje", "calls_qtd", "calls_dia", "calls_hoje_texto"].map((v) => <ChipVar key={v} nome={v} />)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  No <i>Loop</i> (campo da lista: <code>calls_hoje</code>, telefone em <code>telefone</code>) cada lead recebe
                  os passos do ramo "item" com <code>{"{{primeiro_nome}}"}</code>, <code>{"{{call_hora}}"}</code>,{" "}
                  <code>{"{{call_quando}}"}</code> e <code>{"{{call_link}}"}</code>.
                </div>
              </div>
            </>
          ) : (s.acao ?? "horarios") === "horarios" ? (
            <>
              <div className="cmp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="field"><label>Olhar quantos dias</label>
                  <input className="inp" type="number" min={1} max={30} value={s.dias ?? 5} onChange={(e) => onChange({ ...s, dias: Math.min(30, Math.max(1, Number(e.target.value) || 5)) })} /></div>
                <div className="field"><label>Expediente: das</label>
                  <input className="inp" type="time" value={s.inicio ?? "09:00"} onChange={(e) => onChange({ ...s, inicio: e.target.value })} /></div>
                <div className="field"><label>até as</label>
                  <input className="inp" type="time" value={s.fim ?? "18:00"} onChange={(e) => onChange({ ...s, fim: e.target.value })} /></div>
                <div className="field"><label>Duração da reunião (min)</label>
                  <input className="inp" type="number" min={5} max={480} step={5} value={s.duracaoMin ?? 30} onChange={(e) => onChange({ ...s, duracaoMin: Math.min(480, Math.max(5, Number(e.target.value) || 30)) })} /></div>
                <div className="field"><label>Antecedência mínima (min)</label>
                  <input className="inp" type="number" min={0} max={1440} step={15} value={s.antecedenciaMin ?? 60} onChange={(e) => onChange({ ...s, antecedenciaMin: Math.max(0, Number(e.target.value) || 0) })} /></div>
                <div className="field"><label>Quantas opções oferecer</label>
                  <input className="inp" type="number" min={1} max={20} value={s.maxOpcoes ?? 5} onChange={(e) => onChange({ ...s, maxOpcoes: Math.min(20, Math.max(1, Number(e.target.value) || 5)) })} /></div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!s.porPeriodo} onChange={(e) => onChange({ ...s, porPeriodo: e.target.checked })} />
                Dois horários pela hora de entrada (manhã → 2 à tarde; tarde → hoje + amanhã) e rótulo "hoje/amanhã"
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!s.umPorDia} disabled={!!s.porPeriodo} onChange={(e) => onChange({ ...s, umPorDia: e.target.checked })} />
                No máximo uma opção por dia (ex.: "hoje às 14:00 ou amanhã às 09:00")
              </label>
              <div className="field">
                <label>Dias da semana</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d, i) => {
                    const on = (s.diasSemana ?? [1, 2, 3, 4, 5]).includes(i);
                    return (
                      <button key={d} type="button" className={"btn" + (on ? " primary" : "")} style={{ padding: "4px 10px" }}
                        onClick={() => { const cur = new Set(s.diasSemana ?? [1, 2, 3, 4, 5]); if (on) cur.delete(i); else cur.add(i); onChange({ ...s, diasSemana: Array.from(cur).sort() }); }}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="field">
                <label>Variáveis que este passo cria</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["horarios_livres", "horarios_qtd", "horario_1", "horario_2", "horario_3"].map((v) => <ChipVar key={v} nome={v} />)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  <code>{"{{horarios_livres}}"}</code> é a lista numerada ("1) seg 15/09 às 10:00…") pronta pra colar no
                  prompt da IA ou numa mensagem. Vazia = nenhum horário livre no período.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>De onde vem o horário escolhido</label>
                <input className="inp" value={s.quando ?? ""} onChange={(e) => onChange({ ...s, quando: e.target.value })} placeholder="{{horario_escolhido}}" />
                <div className="muted" style={{ fontSize: 12 }}>
                  Aceita o <b>número da opção</b> (1, 2, 3… da lista de horários livres), uma data como{" "}
                  <b>16/09 14:30</b>, ou um horário ISO. Normalmente é a variável do passo <i>Pergunta</i>.
                </div>
              </div>
              <div className="cmp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field"><label>Duração (min)</label>
                  <input className="inp" type="number" min={5} max={480} step={5} value={s.duracaoMin ?? 30} onChange={(e) => onChange({ ...s, duracaoMin: Math.min(480, Math.max(5, Number(e.target.value) || 30)) })} /></div>
                <div className="field"><label>Agenda (em branco = principal)</label>
                  <input className="inp" value={s.calendarId ?? ""} onChange={(e) => onChange({ ...s, calendarId: e.target.value })} placeholder="primary" /></div>
              </div>
              <div className="field">
                <label>Título do evento (aceita variáveis)</label>
                <input className="inp" value={s.titulo ?? ""} onChange={(e) => onChange({ ...s, titulo: e.target.value })} placeholder="Reunião com {{nome}}" />
              </div>
              <div className="field">
                <label>Descrição (aceita variáveis)</label>
                <textarea className="inp" style={{ minHeight: 70 }} value={s.descricao ?? ""} onChange={(e) => onChange({ ...s, descricao: e.target.value })} placeholder="Lead: {{nome}} · WhatsApp: {{telefone}} · Origem: {{utm_source}}" />
              </div>
              <div className="field">
                <label>Variáveis que este passo cria</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["agenda_quando", "agenda_link", "agenda_erro"].map((v) => <ChipVar key={v} nome={v} />)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Se não entendeu o horário, <code>{"{{agenda_link}}"}</code> fica vazio e <code>{"{{agenda_erro}}"}</code> vira
                  "nao_entendi": use um passo <i>Condição</i> (campo agenda_link · existe) pra pedir de novo.
                </div>
              </div>
            </>
          )}
        </>
      )}

      {s.type === "ask" && (
        <>
          <div className="field">
            <label>Pergunta (enviada ao lead)</label>
            <textarea className="inp" value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
            <VarsHint />
          </div>
          <div className="field">
            <label>Salvar a resposta em</label>
            <VariablePicker value={s.variable} onChange={(v) => onChange({ ...s, variable: v })} />
          </div>
          <div className="field">
            <label>Dica pra IA (opcional)</label>
            <input className="inp" value={s.hint ?? ""} placeholder="ex.: só o primeiro nome · e-mail válido" onChange={(e) => onChange({ ...s, hint: e.target.value })} />
          </div>
          <div className="ask-note">
            ⚡ <b>Usa IA (gasta token):</b> o fluxo PAUSA aqui e espera a resposta. A IA entende a resposta
            (ex.: &quot;Bom dia, meu nome é José&quot; → <b>José</b>) e salva em <b>{`{{${s.variable || "?"}}}`}</b> — os passos
            seguintes já podem usar essa variável.
          </div>
        </>
      )}

      {s.type === "ai_agent" && (
        <>
          <div className="field">
            <label>Instruções da agente (o &quot;cérebro&quot;)</label>
            <textarea
              className="inp"
              rows={8}
              value={s.systemPrompt}
              placeholder={"Você é a Ana, atendente da [empresa]. Seu objetivo é qualificar o lead.\nFale de forma leve e direta. Preços: plano X R$97/mês…\nSe perguntarem algo fora do tema, redirecione com educação."}
              onChange={(e) => onChange({ ...s, systemPrompt: e.target.value })}
            />
            <VarsHint />
          </div>
          <div className="field">
            <label>Máximo de idas e voltas (turnos)</label>
            <input
              className="inp"
              type="number"
              min={1}
              max={20}
              value={s.maxTurns ?? 6}
              onChange={(e) => onChange({ ...s, maxTurns: Math.min(20, Math.max(1, Number(e.target.value) || 6)) })}
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              1 turno = o lead manda uma mensagem e a agente responde. Com <b>{s.maxTurns ?? 6}</b>, ela conversa até {s.maxTurns ?? 6} vezes
              e então <b>solta o lead pros passos abaixo</b> mesmo sem ter terminado — é a trava pra não virar chatbot eterno
              gastando seus créditos. Se ela cumprir o objetivo antes, sai antes. Sugestão: 4-6 pra qualificar, 10+ pra atendimento.
            </div>
          </div>
          {/* ⏳ Acumular mensagens (pedido do dono, 02/10): o lead marca uma mensagem e responde,
              marca outra e responde — com 6 s de espera a agente respondia fala por fala. */}
          <div className="field">
            <label>Esperar o lead terminar de escrever (segundos)</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="inp"
                type="number"
                min={0}
                max={600}
                style={{ maxWidth: 110 }}
                placeholder="6"
                value={s.acumularSeg ? s.acumularSeg : ""}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  const { acumularSeg: _tira, ...resto } = s;
                  void _tira;
                  onChange(Number.isFinite(n) && n > 0 ? { ...resto, acumularSeg: Math.min(600, n) } : resto);
                }}
              />
              {[[0, "Padrão (6 s)"], [30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"]].map(([v, rot]) => (
                <button key={String(v)} type="button" className={"btn" + ((s.acumularSeg ?? 0) === v ? " primary" : "")} style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => { const { acumularSeg: _t, ...resto } = s; void _t; onChange(v ? { ...resto, acumularSeg: v as number } : resto); }}>{rot}</button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              A agente só responde depois que o lead ficar <b>esse tempo sem mandar nada</b>, e trata tudo o que chegou como
              <b> uma fala só</b>. Use quando o lead responde em pedaços ou marca várias mensagens antes de terminar. Quanto maior,
              mais contexto e mais demora. Vale enquanto a conversa com esta agente está aberta (a primeira mensagem usa o padrão)
              e tem um teto de 4 esperas, pra quem não para de escrever não ficar sem resposta.
            </div>
          </div>
          <div className="field">
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={s.keepAlive !== false}
                onChange={(e) => onChange({ ...s, keepAlive: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <span>Depois do caminho, o lead continua falando? <b>A agente volta a atender</b> quando ele responder</span>
            </label>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
              Ligado (recomendado): depois que o caminho entrega o link/mensagem, o lead que <b>continuar digitando</b> é atendido
              pela agente de novo — e se demonstrar outro interesse, ela pode mandá-lo por <b>outro caminho</b>. Desligado, a conversa
              segue direto pros passos abaixo. Ela <b>não repete</b> um caminho que já entregou (não manda o mesmo link duas vezes), salvo os marcados com <b>pode repetir</b>.
            </div>
          </div>
          <div className="field">
            <label>Caminhos (a agente escolhe pela conversa)</label>
            {s.paths.length === 0 && (
              <div className="agent-empty muted">
                Sem caminhos: a agente só conversa e, ao encerrar, o fluxo segue nos passos abaixo. Crie caminhos para ela
                <b> separar seus públicos</b> — cada um entrega a própria resposta (link, mensagem…).
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.paths.map((p, i) => (
                <div key={i} className="agent-path-card">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="agent-path-badge">caminho {i + 1}</span>
                    <input
                      className="inp"
                      style={{ flex: 1, minWidth: 0 }}
                      value={p.name}
                      placeholder="Nome (ex.: Tráfego)"
                      onChange={(e) => onChange({ ...s, paths: s.paths.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    />
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: "none", color: "var(--crit)" }}
                      title="Excluir este caminho"
                      onClick={() => onChange({ ...s, paths: s.paths.filter((_, j) => j !== i) })}
                    >✕</button>
                  </div>
                  <textarea
                    className="inp"
                    rows={2}
                    value={p.description}
                    placeholder="Quando escolher este caminho? (ex.: quando a pessoa quer contratar gestão de anúncios, Meta Ads)"
                    onChange={(e) => onChange({ ...s, paths: s.paths.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                  />
                  {!p.description.trim() && (
                    <div className="agent-warn-desc">Sem o &quot;quando escolher&quot;, a agente não sabe que este caminho serve — ela vai ignorá-lo.</div>
                  )}
                  <textarea
                    className="inp"
                    rows={2}
                    value={p.reply}
                    placeholder="Resposta entregue ao escolher (link, mensagem… ex.: https://pay.kiwify.com.br/...)"
                    onChange={(e) => onChange({ ...s, paths: s.paths.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)) })}
                  />
                  <input
                    className="inp"
                    value={p.midia ?? ""}
                    placeholder="Mídia junto (opcional): URL de vídeo, imagem ou PDF. A resposta acima vira a legenda"
                    onChange={(e) => onChange({ ...s, paths: s.paths.map((x, j) => (j === i ? { ...x, midia: e.target.value.trim() || undefined } : x)) })}
                  />
                  <AgentPathGuardar
                    guardar={p.guardar ?? []}
                    repetir={!!p.repetir}
                    onChange={(patch) => onChange({ ...s, paths: s.paths.map((x, j) => (j === i ? { ...x, ...patch } : x)) })}
                  />
                </div>
              ))}
              {s.paths.length < 6 && (
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: "flex-start", padding: "6px 11px", fontSize: 12.5 }}
                  onClick={() => onChange({ ...s, paths: [...s.paths, { name: "", description: "", reply: "" }] })}
                >+ caminho</button>
              )}
            </div>
          </div>
          <div className="agent-info">
            🤖 A agente responde o lead <b>e fica conversando</b> até cumprir o objetivo (ou até o teto de turnos) — aí o fluxo
            segue nos passos abaixo dela. Entende <b>texto e áudio</b> do lead (o áudio é transcrito automático via Whisper; imagem/PDF ficam pra próxima). Usa a
            <b> chave da OpenAI do servidor</b> — sem chave, o nó é pulado. Cada turno (e cada transcrição) consome créditos na sua conta OpenAI.
          </div>
          <div className="ask-note">
            ⚠️ Se o lead escrever &quot;parar&quot;, o descadastro acontece <b>ANTES</b> da agente — ela nunca responde a quem pediu pra sair.
            E pra testar, use <b>OUTRO número</b>: mensagens suas (fromMe) não entram na conversa.
          </div>
        </>
      )}

      {/* Compatibilidade com a API Oficial: o fluxo fala pela Meta quando tem template. Avisa
          ANTES de a pessoa montar o passo — descobrir isso só quando o lead não recebe é caro. */}
      {ehOficial && COMPAT_OFICIAL[s.type] && (
        <div className={"compat-aviso " + COMPAT_OFICIAL[s.type].nivel}>
          <b>{COMPAT_OFICIAL[s.type].nivel === "nao" ? "Não funciona neste fluxo:" : COMPAT_OFICIAL[s.type].nivel === "ok" ? "Funciona na API Oficial:" : "Atenção:"}</b>{" "}
          {COMPAT_OFICIAL[s.type].aviso}
        </div>
      )}

      {(s.type === "add_to_group" || s.type === "mention_all") && (
        <ContaEGrupo s={s} onChange={onChange} comGrupo />
      )}

      {/* 👥 Adicionar direto SÓ funciona pra quem deixa "qualquer um pode me adicionar" na
          privacidade do WhatsApp — o que não é o caso da maioria. Quando falha, o padrão é mandar
          o link de convite: a pessoa entra sozinha e ninguém fica de fora em silêncio. */}
      {s.type === "add_to_group" && (
        <>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" checked={s.convite !== false}
              onChange={(e) => onChange({ ...s, convite: e.target.checked })} />
            <span>Se não der pra adicionar, <b>mandar o link de convite</b> (recomendado — a maioria
              bloqueia ser adicionada em grupo). Exige que este número seja <b>admin</b> do grupo.</span>
          </label>
          {s.convite !== false && (
            <div className="field">
              <label>Mensagem do convite</label>
              <textarea className="inp" rows={2} placeholder="Te mandei o convite do nosso grupo 👇&#10;{{link_grupo}}"
                value={s.textoConvite ?? ""} onChange={(e) => onChange({ ...s, textoConvite: e.target.value })} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                Use <code>{"{{link_grupo}}"}</code> onde o link deve entrar (se esquecer, ele vai no fim). <code>{"{{grupo}}"}</code> = nome do grupo.
              </div>
            </div>
          )}
        </>
      )}

      {s.type === "notify" && (
        <ContaEGrupo s={s} onChange={onChange} comGrupo={false} />
      )}

      {s.type === "template" && (
        <TemplateEditor step={s} onChange={onChange} fluxoId={fluxoId} naoSalvo={naoSalvo} />
      )}

      {s.type === "mention_all" && (
        <>
          <div className="field">
            <label>Mensagem</label>
            <textarea className="inp" value={s.text} onChange={(e) => onChange({ ...s, text: e.target.value })} />
            <VarsHint />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={s.hidden ?? true} onChange={(e) => onChange({ ...s, hidden: e.target.checked })} />
            Menção oculta (todos recebem, sem @ visível)
          </label>
        </>
      )}

      <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line-2)", paddingTop: 12 }}>
        <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} disabled={!canUp} onClick={() => onMove(-1)}>↑ subir</button>
        <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} disabled={!canDown} onClick={() => onMove(1)}>↓ descer</button>
        <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5, color: "var(--crit)", marginLeft: "auto" }} onClick={onRemove}>Remover</button>
      </div>
    </div>
  );
}
