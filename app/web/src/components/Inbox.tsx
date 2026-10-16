"use client";
import { OrigemLead } from "@/components/OrigemLead";
import { PausaIa } from "@/components/PausaIa";
import { ContratoProcuracao } from "@/components/ContratoProcuracao";
import { EtiquetasChat } from "@/components/EtiquetasChat";
import { AgendadasConversa } from "@/components/AgendadasConversa";
import { EMOJIS } from "@/lib/emojis";
import { CampoMensagem } from "@/components/CampoMensagem";
import { OrigemMsg } from "@/components/OrigemMsg";
import { AnexoPrevia } from "@/components/AnexoPrevia";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalCard, type Local } from "./LocalCard";
import { AudioBalao } from "./AudioBalao";
import { ContatoCard } from "./ContatoCard";
import { subirArquivo, jget, jsend, initials, QuickReply, conferirEnvio } from "@/lib/client";
import { chaveDoDia, rotuloDoDia } from "@/lib/dia";
import { useAccounts, fmtNumber, TELA_AO_VIVO } from "@/components/accounts";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { GroupImportModal } from "@/components/groups/GroupImportModal";
import { ChatInfoModal } from "@/components/ChatInfoModal";
import { fundoAtual, cssDoFundo, EVENTO_FUNDO, type FundoSalvo } from "@/lib/chatbg";

interface Participant {
  lid: string;
  phone: string;
  name: string;
  isAdmin: boolean;
}

interface Chat {
  id: string;
  name: string;
  phone?: string;
  image?: string;
  lastMessage?: string;
  timestamp?: number;
  unread: number;
  isGroup: boolean;
  mencionado?: boolean; // alguém te marcou nesta conversa (some ao abrir)
  pinned?: boolean;     // fixada no topo da lista (até 10, igual WhatsApp) — vem do motor
}
// De onde o lead veio (cabeçalho da conversa). Vem de /api/inbox/rastreio.
interface Rastreio {
  veioDeAds: boolean;
  anuncio: { headline?: string | null; link?: string | null } | null;
  utm: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null; adId?: string | null } | null;
}
interface Msg {
  id: string;
  mid?: string;
  text: string;
  fromMe: boolean;
  timestamp?: number;
  type?: string;
  fileURL?: string;
  reaction?: string;
  citacao?: { alvoId?: string; texto?: string; tipo?: string };
  pendente?: boolean; // balão otimista, ainda não confirmado pelo servidor
  senderName?: string;
  status?: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  pageCount?: number;
  vcard?: string;
  contactName?: string;
  local?: Local;      // 📍 localização (lat/lng + nome/endereço) — o motor extrai do content
  // Botões da mensagem (template/lista). O motor manda rótulo + ação (url/phone/copy; sem ação =
  // resposta rápida). String solta = mensagem antiga do formato só-rótulo — vira botão inerte.
  buttons?: Array<string | { label: string; url?: string; phone?: string; copy?: string }>;
  source?: string;    // android/ios/web — mostrado junto do aviso de mensagem apagada
  origem?: string;    // android | ios | web | painel | bot — quem enviou a mensagem nossa (selo no balão)
  autor?: string;     // nome de quem da equipe enviou pelo painel (selo mostra o primeiro nome)
  durationSec?: number; // duração do áudio (a API manda pronta — mostra 0:14 sem baixar nada)
  waveform?: string;  // onda REAL do áudio (base64 de amplitudes, direto do WhatsApp)
  pinned?: boolean;   // fixada no chat (📌) — vem do motor; alimenta Fixar/Desafixar
  // Enquete (o motor extrai a pergunta e as opções). `pollVoto` = é um VOTO, não a enquete.
  poll?: { pergunta: string; opcoes: Array<{ texto: string; votos?: number }>; multipla?: boolean };
  pollVoto?: boolean;
  chamada?: { video: boolean; motivo?: string; estado?: string }; // 📞 ligação de WhatsApp
  anuncio?: { headline?: string; url?: string; thumb?: string };   // 📣 lead veio de anúncio (CTWA)
}

const MEDIA_TYPES = new Set(["ImageMessage", "StickerMessage", "AudioMessage", "PttMessage", "VideoMessage"]);

// Busca sem acento: "reuniao" acha "Reunião" (compara os dois lados normalizados).
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Um item do compositor de foto. Guardamos o File (não o base64) e uma object URL
// só pra prévia — o base64 é lido na hora do envio, pra não reter ~49MB/foto na memória.
interface Shot {
  id: number;
  file: File;
  url: string;
  caption: string;
}

const MAX_FILE = 37 * 1024 * 1024; // base64 infla ~33%; motor aceita 50MB → ~37MB cru

// Emojis mais usados no zap: lista compartilhada com o WPP Api (lib/emojis).

// Check desenhado (SVG) — os tracinhos ficam SOBREPOSTOS como no WhatsApp (com "✓✓" de texto eles
// ficavam largados um do outro). São os MESMOS 3 estados do WhatsApp:
//   1 tracinho = saiu daqui · 2 tracinhos = chegou no aparelho · 2 azuis = a pessoa leu.
// ⚠️ Antes desenhava SEMPRE os dois e só trocava a cor no "lida" — ou seja, dizia "entregue" para
// mensagem que só tinha saído. O dono pegou isso comparando com o WhatsApp oficial (10/08):
// número inexistente ficava com 1 check no app e 2 no nosso painel.
function Tick({ ack }: { ack: AckNivel }) {
  const dois = ack !== "enviado";
  return (
    <svg className={"tick-svg" + (ack === "lida" ? " read" : "")} viewBox="0 0 16 10" width={dois ? 15 : 11} height="10"
      aria-label={ack === "lida" ? "lida" : ack === "entregue" ? "entregue" : "enviada"}>
      {dois && <path d="M1 5.3 L4 8.2 L10.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      <path d="M6 5.3 L9 8.2 L15.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        transform={dois ? undefined : "translate(-5 0)"} />
    </svg>
  );
}

// Status que a UazAPI devolve de verdade (conferido ao vivo em 10/08): "Sent", "Delivered" e vazio
// no histórico antigo. Sem informação a gente NÃO afirma entrega — fica em "enviada", que é o único
// fato garantido (a mensagem existe, então saiu). O poll do inbox atualiza sozinho quando muda.
type AckNivel = "enviado" | "entregue" | "lida";
function ackDe(m: Msg): AckNivel {
  const s = (m.status || "").toLowerCase();
  if (s.includes("read") || s.includes("played") || s.includes("seen") || s.includes("lida")) return "lida";
  if (s.includes("deliver") || s.includes("entregue")) return "entregue";
  return "enviado";
}

// Estilo WhatsApp na LISTA: hoje → hora; ontem → "ontem"; últimos 7 dias → dia da semana;
// mais velho → data. Antes mostrava sempre a hora, e conversa de semana passada parecia de hoje.
function fmtQuando(ts?: number): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const hoje = new Date();
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const difDias = Math.round((dia(hoje) - dia(d)) / 86_400_000);
  try {
    if (difDias <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (difDias === 1) return "ontem";
    if (difDias < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch { return ""; }
}

function fmtTime(ts?: number): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000; // aceita segundos ou milissegundos
  try {
    return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// rotuloDoDia / chaveDoDia moraram aqui; agora em @/lib/dia (o inbox oficial também usa).
// A mensagem foi apagada por quem enviou? O WhatsApp some com ela; aqui a gente MOSTRA com aviso
// (o conteúdo vem preservado da API) — é o que o atendente precisa pra entender a conversa.
const foiApagada = (m: Msg) => String(m.status || "").toLowerCase() === "deleted";
const APARELHO: Record<string, string> = { android: "Android", ios: "iOS", web: "Web", unknown: "" };


const MEDIA_LABEL: Record<string, string> = {
  ImageMessage: "🖼️ Imagem",
  VideoMessage: "🎥 Vídeo",
  AudioMessage: "🎤 Áudio",
  PttMessage: "🎤 Áudio",
  DocumentMessage: "📎 Documento",
  StickerMessage: "🩷 Figurinha",
  LocationMessage: "📍 Localização",
  LiveLocationMessage: "📍 Localização",
  ContactMessage: "👤 Contato",
  ContactsArrayMessage: "👤 Contatos",
  PollCreationMessage: "📊 Enquete",
};

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1).replace(".0", "")} MB`;
}
function fileExt(name?: string, mime?: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || "");
  if (m) return m[1].toLowerCase();
  if (mime?.includes("pdf")) return "pdf";
  if (mime) return (mime.split("/")[1] || "").slice(0, 5);
  return "";
}
// Extrai nome + telefone de um vCard (formatos variados da UazAPI).
function parseVcard(v: string): { name: string; phone: string } {
  const text = v || "";
  let name = "";
  const fn = /FN:(.+)/i.exec(text);
  if (fn) name = fn[1].trim();
  if (!name) {
    name = text.split(/\r?\n/).map((s) => s.trim()).find((s) => s && !/^[A-Za-z-]+[;:]/.test(s) && !/^(BEGIN|END|VERSION|X-)/i.test(s)) || "Contato";
  }
  const tel = /(?:TEL[^:]*:|Phone:)\s*([+\d][\d\s()\-]{6,})/i.exec(text) || /(\+?\d[\d\s()\-]{8,}\d)/.exec(text);
  return { name: name.slice(0, 60), phone: tel ? tel[1].trim() : "" };
}

// Corpo da mensagem: texto, mídia (imagem/áudio/figurinha/vídeo) ou rótulo. Reação → null (vira badge no alvo).
// URLs no texto viram LINK clicável (igual o app). A captura alterna texto/url no split.
const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|www\.[^\s<>()]+[^\s<>().,;:!?'"])/g;
// Menção crua no texto do grupo: "@152200823214117" (LID) ou "@5598..." (telefone).
const MENCAO_RE = /@(\d{6,})/g;
// `mencaoEl` (opcional) transforma cada menção num elemento (nome + hover + duplo clique).
// FORMATAÇÃO DO WHATSAPP (*negrito*, _itálico_, ~riscado~, ```mono```). O painel mostrava os
// símbolos crus — "*CRÉDITOS EM DOBRO*" aparecia com os asteriscos (print do dono, 17/08).
// Regras do WhatsApp que a implementação respeita:
//  • o marcador só vale colado no texto (`a * b` não vira negrito);
//  • não atravessa quebra de linha;
//  • formatos aninham (*negrito com _itálico_ dentro*), por isso a função se chama recursiva;
//  • dentro de ``` nada é interpretado (é código).
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

function comLinks(texto: string, mencaoEl?: (id: string, key: string) => React.ReactNode): React.ReactNode {
  const partes = texto.split(URL_RE);
  const out: React.ReactNode[] = [];
  partes.forEach((p, i) => {
    if (i % 2 === 1) {
      out.push(
        // stopPropagation: clicar no link não pode disparar o duplo-clique de "responder"
        <a key={"l" + i} href={p.startsWith("www.") ? "https://" + p : p} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>{p}</a>
      );
      return;
    }
    // A formatação entra DEPOIS do link: assim um endereço com _ ou ~ no meio não vira itálico.
    if (!mencaoEl) { if (p) out.push(<span key={"t" + i}>{comFormato(p, "t" + i)}</span>); return; }
    p.split(MENCAO_RE).forEach((q, j) => {
      if (j % 2 === 1) out.push(mencaoEl(q, `m${i}-${j}`));
      else if (q) out.push(<span key={`t${i}-${j}`}>{comFormato(q, `t${i}-${j}`)}</span>);
    });
  });
  return out;
}

// Botões da mensagem, CLICÁVEIS como no WhatsApp: url abre o link, phone liga, copy copia o
// código, e resposta rápida manda o rótulo na conversa (via onReply). Antes eram <span> inertes —
// o botão aparecia mas o clique não fazia nada (print de 08/08). stopPropagation em tudo: o clique
// não pode disparar o duplo-clique de "responder" do balão.
function MsgBotoes({ btns, onReply }: { btns: NonNullable<Msg["buttons"]>; onReply?: (rotulo: string) => void }) {
  const [copiado, setCopiado] = useState(-1);
  const pare = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() };
  return (
    <div className="msg-btns">
      {btns.map((raw, i) => {
        const b = typeof raw === "string" ? { label: raw } : raw;
        if (b.url) {
          const href = /^https?:\/\//i.test(b.url) ? b.url : "https://" + b.url;
          return <a key={i} className="msg-btn" href={href} target="_blank" rel="noopener noreferrer" title={href} {...pare}>{b.label} ↗</a>;
        }
        if (b.phone) return <a key={i} className="msg-btn" href={"tel:" + b.phone} title={b.phone} {...pare}>{b.label}</a>;
        if (b.copy) {
          const codigo = b.copy;
          return (
            <button key={i} type="button" className="msg-btn" title={"Copiar: " + codigo}
              onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(codigo).then(() => { setCopiado(i); setTimeout(() => setCopiado(-1), 1600); }); }}
              onDoubleClick={(e) => e.stopPropagation()}>
              {copiado === i ? "Copiado! ✓" : b.label}
            </button>
          );
        }
        // Resposta rápida: clicar responde a conversa com o rótulo (igual tocar no botão no app).
        // Sem onReply (mensagem antiga só-rótulo em contexto sem envio) fica como etiqueta.
        if (onReply) {
          return (
            <button key={i} type="button" className="msg-btn" title={`Responder "${b.label}"`}
              onClick={(e) => { e.stopPropagation(); onReply(b.label); }} onDoubleClick={(e) => e.stopPropagation()}>
              {b.label}
            </button>
          );
        }
        return <span key={i} className="msg-btn">{b.label}</span>;
      })}
    </div>
  );
}

function msgBody(m: Msg, media: Record<string, { url: string; mime: string }>, onDownload?: (m: Msg) => void, onFetch?: (m: Msg) => Promise<void>, fotos?: { chat?: string; minha?: string }, mencaoEl?: (id: string, key: string) => React.ReactNode, onZoom?: (url: string) => void, onBtnReply?: (rotulo: string) => void, onContato?: (acao: "conversar" | "copiar", tel: string, nome: string) => void) {
  const t = m.type || "";
  if (t === "error" || t === "ReactionMessage") return null;
  const isText = !t || t === "Conversation" || t === "ExtendedTextMessage" || t === "TextMessage";
  // Mensagem COM BOTÕES (template da API Oficial, botões, lista): mostra o texto e os botões
  // embaixo, como o cliente viu no WhatsApp — e cada botão FUNCIONA (MsgBotoes).
  if (m.buttons?.length) {
    return (
      <>
        {m.text ? <span className="msg-text">{comLinks(m.text, mencaoEl)}</span> : null}
        <MsgBotoes btns={m.buttons} onReply={m.fromMe ? undefined : onBtnReply} />
      </>
    );
  }
  if (isText) return m.text ? <span className="msg-text">{comLinks(m.text, mencaoEl)}</span> : null;
  if (t === "TemplateMessage" || t === "ButtonsMessage" || t === "ListMessage" || t === "InteractiveMessage") {
    return m.text ? <span className="msg-text">{comLinks(m.text, mencaoEl)}</span> : <span className="msg-media">📋 mensagem interativa</span>;
  }
  const cap = m.text ? <span className="msg-text" style={{ display: "block", marginTop: 3 }}>{comLinks(m.text, mencaoEl)}</span> : null;
  const url = media[m.id]?.url;

  if (t === "ImageMessage" || t === "StickerMessage") {
    if (url) return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={t === "StickerMessage" ? "msg-sticker" : "msg-img"} src={url} alt=""
          onClick={(e) => { if (onZoom) { e.stopPropagation(); onZoom(url); } }}
          title={t === "StickerMessage" ? undefined : "Clique pra ampliar"} />
        {cap}
      </>
    );
    return <span className={"msg-media" + (t === "StickerMessage" ? "" : " reserva")}>{t === "StickerMessage" ? "🩷 carregando figurinha…" : "🖼️ carregando imagem…"}</span>;
  }
  if (t === "AudioMessage" || t === "PttMessage") {
    return <AudioBalao url={url} durationSec={m.durationSec} waveform={m.waveform} onBaixar={onFetch ? () => onFetch(m) : undefined} avatar={m.fromMe ? fotos?.minha : fotos?.chat} meu={m.fromMe} />;
  }
  if (t === "VideoMessage") {
    if (url) return (
      <>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video className="msg-video" controls preload="none" src={url} />
        {cap}
      </>
    );
    return <span className="msg-media reserva">🎥 carregando vídeo…</span>;
  }
  if (t === "DocumentMessage") {
    const ext = fileExt(m.fileName, m.mime);
    const metaLine = [
      m.pageCount ? `${m.pageCount} página${m.pageCount > 1 ? "s" : ""}` : "",
      fmtBytes(m.fileSize),
      ext,
    ].filter(Boolean).join(" · ");
    const nm = m.fileName || (m.text && m.text.length < 90 ? m.text : "") || "Documento";
    return (
      <>
        <button type="button" className="msg-doc" onClick={() => onDownload?.(m)} title="Baixar documento">
          <span className="msg-doc-ico">{(ext || "doc").toUpperCase().slice(0, 4)}</span>
          <span className="msg-doc-info">
            <span className="msg-doc-name">{nm}</span>
            {metaLine && <span className="msg-doc-meta">{metaLine}</span>}
          </span>
        </button>
        {m.text && m.text !== nm ? cap : null}
      </>
    );
  }
  // ENQUETE — antes caía no "📎 Mídia" genérico e a pergunta/opções sumiam.
  if (m.poll) {
    const total = m.poll.opcoes.reduce((s, o) => s + (o.votos ?? 0), 0);
    const temContagem = m.poll.opcoes.some((o) => o.votos != null);
    return (
      <div className="msg-poll">
        <div className="msg-poll-perg">{m.poll.pergunta}</div>
        <div className="msg-poll-sub">{m.poll.multipla ? "Selecione uma ou mais opções" : "Selecione uma opção"}</div>
        {m.poll.opcoes.map((o, i) => (
          <div key={i} className="msg-poll-op">
            <span className="msg-poll-bola" />
            <span className="msg-poll-txt">{o.texto}</span>
            {o.votos != null && <span className="msg-poll-n">{o.votos}</span>}
            {o.votos != null && total > 0 && (
              <span className="msg-poll-trilha"><span className="msg-poll-barra" style={{ width: Math.round((o.votos / total) * 100) + "%" }} /></span>
            )}
          </div>
        ))}
        {!temContagem && (
          // Honesto: o WhatsApp criptografa os votos e a API não devolve a contagem. Melhor dizer
          // isso que mostrar "0 votos" e o dono achar que ninguém votou.
          <div className="msg-poll-nota">Os votos são criptografados pelo WhatsApp — veja o resultado no celular.</div>
        )}
      </div>
    );
  }
  // VOTO numa enquete: chega como mensagem separada (um balão por pessoa). O WhatsApp não mostra
  // isso como mensagem — mostrava 6 balões "📎 Mídia" num grupo com 6 votos. Vira uma linha discreta.
  if (m.pollVoto) return <span className="msg-media">🗳️ votou na enquete</span>;
  // 📞 LIGAÇÃO: o WhatsApp registra a chamada como uma "mensagem" na conversa. Antes caía no
  // "Mídia" genérico e ninguém sabia o que era (conversa do Sergio na HG, 03/10).
  if (m.chamada || t === "call") {
    const ch = m.chamada ?? { video: false };
    const motivo: Record<string, string> = {
      accepted_elsewhere: "atendida em outro aparelho", accepted: "atendida", rejected: "recusada",
      rejected_elsewhere: "recusada em outro aparelho", timeout: "não atendida", missed: "perdida", busy: "ocupado",
    };
    const det = (ch.motivo && motivo[ch.motivo]) || (ch.estado === "terminated" ? "encerrada" : "");
    return (
      <span className="msg-chamada">
        <Icon name="phone" size={14} />
        <span>{m.fromMe ? "Você ligou" : "Ligação recebida"} · {ch.video ? "vídeo" : "voz"}{det ? " · " + det : ""}</span>
      </span>
    );
  }
  // 📍 LOCALIZAÇÃO: cartão com mapa + link. Sem coordenadas (mensagem antiga arquivada antes
  // desta versão, ou content sem lat/lng) cai no rótulo genérico lá embaixo.
  if ((t === "LocationMessage" || t === "LiveLocationMessage") && m.local) {
    return <>{<LocalCard local={m.local} />}{cap}</>;
  }
  if (t === "ContactMessage" || t === "ContactsArrayMessage") {
    const parsed = parseVcard(m.vcard || m.text || "");
    const nm = m.contactName || parsed.name || "Contato";
    // "Conversar" abre a conversa 1:1 com o contato compartilhado (cria a entrada se ainda não
    // conversaram) — igual WhatsApp. Pedido do dono, 10/09.
    return (
      <ContatoCard
        contatos={[{ nome: nm, telefone: parsed.phone }]}
        onConversar={onContato ? (tel, nome) => onContato("conversar", tel, nome) : undefined}
        onCopiar={onContato ? (tel) => onContato("copiar", tel, nm) : undefined}
      />
    );
  }
  return (
    <>
      <span className="msg-media">{MEDIA_LABEL[t] || "📎 Mídia"}</span>
      {cap}
    </>
  );
}

// Ícones (line-style, iguais aos da referência do WhatsApp).
const Ic = (d: string, extra?: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);
const IcCrop = Ic("M6 2v14a2 2 0 0 0 2 2h14", <path d="M18 22V8a2 2 0 0 0-2-2H2" />);
const IcSticker = Ic("M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2z", <path d="M14 21v-5a2 2 0 0 1 2-2h5" />);
const IcPencil = Ic("M12 20h9", <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />);
const IcSmile = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9.2" x2="9.01" y2="9.2" />
    <line x1="15" y1="9.2" x2="15.01" y2="9.2" />
  </svg>
);
const IcAddPhoto = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="8" width="13" height="13" rx="2.4" />
    <path d="M4 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
    <path d="M14.5 11.5v6M11.5 14.5h6" />
  </svg>
);
const IcSend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export function Inbox() {
  const { activeAcct, accounts, setActive } = useAccounts();
  const router = useRouter();
  // Conta ativa é da API Oficial: esta caixa (Lite) não mostra as conversas dela. Se existe um
  // número Lite, a tela PUXA a bolinha certa (troca a conta ativa e fica) — navegar embora aqui
  // brigava com o portão do Shell e a tela piscava em loop (BMA, 18/08). Só quando NÃO existe
  // nenhum Lite é que vai pra caixa da API, e via replace pra não sujar o histórico.
  const contaEhApi = !!activeAcct && activeAcct.type !== "LITE";
  const bolinhaLite = accounts.find((a) => a.type === "LITE");
  useEffect(() => {
    if (!contaEhApi) return;
    if (bolinhaLite) setActive(bolinhaLite.id);
    else router.replace(TELA_AO_VIVO.API);
  }, [contaEhApi, bolinhaLite, setActive, router]);
  const account = activeAcct?.id ?? "lite";
  const [chats, setChats] = useState<Chat[]>([]);
  const [sel, setSel] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachMsg, setAttachMsg] = useState("");
  const [pendingType, setPendingType] = useState<"image" | "document">("image");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const moreRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const msgsRef = useRef<HTMLDivElement | null>(null); // container rolável das mensagens
  const composeRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Menção "@" em grupo: lista os participantes pra marcar ─────────────────
  const [parts, setParts] = useState<Participant[]>([]);
  const [partsErr, setPartsErr] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  // Respostas rápidas (o "/" no começo da mensagem)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrQ, setQrQ] = useState("");
  const [importGroup, setImportGroup] = useState<{ jid: string; name: string } | null>(null);
  // Mostra "@Nome" no campo, mas guarda o LID pra converter no envio (o WhatsApp
  // precisa do @id no texto pra renderizar a menção).
  const [mentionRefs, setMentionRefs] = useState<Array<{ token: string; lid: string }>>([]);

  // Mídia baixada por mensagem (id → url) + controle de requisições em voo.
  const [media, setMedia] = useState<Record<string, { url: string; mime: string }>>({});
  const mediaInflight = useRef<Set<string>>(new Set());

  // Menu de contexto da mensagem (setinha) + barra de reação rápida.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reactBar, setReactBar] = useState<string | null>(null);
  // Perto do FUNDO o menu abre pra CIMA (senão corta atrás do campo de mensagem); perto do TOPO
  // a barra de reações abre pra BAIXO (senão some acima da janela). Igual o WhatsApp faz.
  const [menuFlip, setMenuFlip] = useState(false);
  const [reactFlip, setReactFlip] = useState(false);
  function medePosicao(ev: React.MouseEvent): { espacoAbaixo: number; espacoAcima: number } {
    const el = (ev.currentTarget as HTMLElement).closest(".msg");
    const cont = msgsRef.current;
    if (!el || !cont) return { espacoAbaixo: 9999, espacoAcima: 9999 };
    const r = el.getBoundingClientRect();
    const c = cont.getBoundingClientRect();
    return { espacoAbaixo: c.bottom - r.top, espacoAcima: r.top - c.top };
  }

  // Divisor "Mensagens não lidas: N" (igual WhatsApp): quantas havia quando a conversa foi aberta.
  // Some ao trocar de conversa ou quando o usuário rola até o fim (leu tudo).
  const [naoLidasAoAbrir, setNaoLidasAoAbrir] = useState(0);
  // Imagem ampliada em tela cheia (clique na foto do chat).
  const [zoom, setZoom] = useState<{ url: string; nome?: string } | null>(null);

  // Busca de conversas (filtra por nome OU telefone conforme digita).
  const [busca, setBusca] = useState("");
  // A lista normal traz só as 50 mais recentes (poll leve de 12s) — a busca precisa enxergar
  // TODAS: ao digitar, carrega a lista completa uma vez (revalida a cada 60s no máximo).
  // Sem isso, "rreunião" não achava um grupo que não falava desde quinta (bug de 08/08).
  const [chatsTodos, setChatsTodos] = useState<Chat[] | null>(null);
  const [buscandoTudo, setBuscandoTudo] = useState(false);
  const chatsTodosAt = useRef(0);
  useEffect(() => { setChatsTodos(null); chatsTodosAt.current = 0; }, [account]); // trocou de conta → zera
  // Carrega a lista COMPLETA (uma vez por minuto, no máximo). Usada por dois caminhos: a busca e a
  // ROLAGEM — sem o segundo, a lista simplesmente acabava na 50ª conversa e não dava pra chegar nas
  // antigas (o poll leve só traz 50). Print do dono 17/08: rolava e batia num muro.
  const carregaTodos = useCallback(() => {
    if (Date.now() - chatsTodosAt.current < 60_000) return;
    chatsTodosAt.current = Date.now();
    setBuscandoTudo(true);
    jget("/api/inbox/chats?account=" + encodeURIComponent(account) + "&limit=3000")
      .then((r) => setChatsTodos(r.chats ?? []))
      .catch(() => { /* segue com as que já vieram */ })
      .finally(() => setBuscandoTudo(false));
  }, [account]);
  useEffect(() => { if (busca.trim()) carregaTodos(); }, [busca, carregaTodos]);
  // Chegou perto do fim da lista → busca o resto (só uma vez; depois é tudo local).
  function aoRolarLista(e: React.UIEvent<HTMLDivElement>) {
    if (chatsTodos || buscandoTudo) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) carregaTodos();
  }

  const chatsVisiveis = useMemo(() => {
    const q = semAcento(busca.trim().toLowerCase());
    // Buscando: usa a lista completa (se já veio). Sem busca: as 50 recentes do poll.
    // Sem busca: as 50 do poll (dados FRESCOS, na ordem certa) + as antigas que só a lista
    // completa conhece. Com busca: a lista completa.
    let fonte: Chat[];
    if (q && chatsTodos) fonte = chatsTodos;
    else if (chatsTodos) {
      const vistos = new Set(chats.map((c) => c.id));
      fonte = [...chats, ...chatsTodos.filter((c) => !vistos.has(c.id))];
    } else fonte = chats;
    // Fixadas primeiro (sort estável: dentro de cada bloco continua por última mensagem).
    const base = [...fonte].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    if (!q) return base;
    const dig = q.replace(/\D/g, ""); // "98 98333" também acha — compara só os dígitos
    return base.filter((c) => {
      if (semAcento(c.name.toLowerCase()).includes(q)) return true; // sem acento: "reuniao" acha "Reunião"
      const tel = (c.phone || c.id).replace(/\D/g, "");
      return dig.length >= 2 && tel.includes(dig);
    });
  }, [chats, chatsTodos, busca]);

  // Modal "Dados da conversa" (clique no cabeçalho, estilo WhatsApp) + fixar conversas.
  const [infoOpen, setInfoOpen] = useState(false);
  // De onde o lead veio: selo ADS + lista suspensa de UTMs no cabeçalho (checkout Kiwify / anúncio).
  const [rastreio, setRastreio] = useState<Rastreio | null>(null);
  const [utmOpen, setUtmOpen] = useState(false);
  const [pinAviso, setPinAviso] = useState("");
  // Fixa/desafixa e atualiza a lista na hora (otimista). Devolve a mensagem de erro ou null —
  // o limite de 10 vem do motor e aparece onde o clique aconteceu (lista ou modal).
  const fixarChat = useCallback(async (chatid: string, pin: boolean): Promise<string | null> => {
    try {
      await jsend("/api/inbox/chat-pin", "POST", { account, chatid, pin });
      setChats((prev) => prev.map((x) => (x.id === chatid ? { ...x, pinned: pin } : x)));
      return null;
    } catch (e: any) {
      return e.message as string;
    }
  }, [account]);

  // Painel de emoji/figurinhas do CAMPO DE MENSAGEM (o do compositor de foto é outro, emojiOpen).
  const [emojiMsgOpen, setEmojiMsgOpen] = useState(false);
  const [emojiAba, setEmojiAba] = useState<"emoji" | "fig">("emoji");

  // Responder citando: a mensagem marcada vira uma barrinha em cima do campo e o envio
  // vai com replyid pra UazAPI (o balão sai com a citação, igual WhatsApp).
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [ligando, setLigando] = useState(false);
  // Clique na citação → rola até a mensagem original e pisca nela, como no WhatsApp.
  function vaiPara(id: string) {
    const el = document.getElementById("msg-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("piscando");
    setTimeout(() => el.classList.remove("piscando"), 1600);
  }

  // Reações agrupadas por mensagem-alvo (id curto) → lista de emojis (com contagem).
  const { reactionsByTarget, myReaction } = useMemo(() => {
    const bySender: Record<string, Record<string, string>> = {};
    for (const m of msgs) {
      if (m.type !== "ReactionMessage" || !m.reaction) continue;
      const who = m.fromMe ? "me" : m.senderName || m.id;
      (bySender[m.reaction] ??= {})[who] = m.text || ""; // vazio = reação removida
    }
    const out: Record<string, string[]> = {};
    const mine: Record<string, string> = {}; // minha reação atual por mensagem
    for (const [tgt, senders] of Object.entries(bySender)) {
      const counts: Record<string, number> = {};
      for (const emo of Object.values(senders)) if (emo) counts[emo] = (counts[emo] || 0) + 1;
      const pills = Object.entries(counts).map(([e, c]) => (c > 1 ? `${e} ${c}` : e));
      if (pills.length) out[tgt] = pills;
      if (senders["me"]) mine[tgt] = senders["me"];
    }
    return { reactionsByTarget: out, myReaction: mine };
  }, [msgs]);
  function partsFor(q: string) {
    const s = q.toLowerCase().trim();
    if (!s) return parts;
    return parts.filter((p) => {
      const nm = (p.name || "").toLowerCase();
      return (
        nm.includes(s) ||
        nm.split(/\s+/).some((w) => w.startsWith(s)) || // "@n" → nomes que começam com N
        p.phone.includes(s) ||
        p.lid.includes(s)
      );
    });
  }
  // Respostas rápidas (cadastradas em Configurações). Carrega uma vez.
  useEffect(() => {
    jget("/api/config/quick-replies").then((d) => setQuickReplies(Array.isArray(d.items) ? d.items : [])).catch(() => {});
  }, []);
  function qrFor(q: string): QuickReply[] {
    const s = q.trim().toLowerCase();
    if (!s) return quickReplies;
    return quickReplies.filter((r) => r.shortcut.toLowerCase().includes(s) || r.text.toLowerCase().includes(s));
  }
  function pickQuickReply(r: QuickReply) {
    const el = composeRef.current;
    const caret = el?.selectionStart ?? text.length;
    // revalida que o cursor ainda está no "/atalho" (igual pickMention) — se o usuário moveu o
    // cursor pra fora, aborta pra NÃO corromper a mensagem (ex.: colar o "/promo" no fim).
    if (!/^\/(\S*)$/.test(text.slice(0, caret))) { setQrOpen(false); return; }
    const next = r.text + text.slice(caret);
    setText(next);
    setQrOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = r.text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Ao digitar, detecta "/atalho" no começo (respostas rápidas) ou "@algo" (menção em grupo).
  function onCompose(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const upto = val.slice(0, e.target.selectionStart ?? val.length);
    // "/atalho" no COMEÇO da mensagem → menu de respostas rápidas
    const qr = /^\/(\S*)$/.exec(upto);
    if (qr && quickReplies.length) { setQrQ(qr[1]); setQrOpen(true); setMentionOpen(false); return; }
    setQrOpen(false);
    if (!sel?.isGroup) return setMentionOpen(false);
    const m = /(^|\s)@(\S*)$/.exec(upto);
    if (m) { setMentionQ(m[2]); setMentionOpen(true); }
    else setMentionOpen(false);
  }
  function pickMention(p: Participant) {
    const el = composeRef.current;
    const caret = el?.selectionStart ?? text.length;
    const upto = text.slice(0, caret);
    const m = /(^|\s)@(\S*)$/.exec(upto);
    if (!m) return;
    const at = m.index + m[1].length; // posição do "@"
    // TELEFONE primeiro, LID só como reserva — a MESMA ordem do marcar-todos, que funciona. Estava
    // invertido (LID primeiro) e, como hoje quase todo participante vem com LID, a menção saía como
    // @<lid> e a UazAPI não marcava ninguém (caso Alan, grupo de tráfego, 08/09).
    const lid = p.phone || p.lid;
    // nome limpo (corta em "|"/quebra, tira espaços duplos, limita) pra virar o "@Nome"
    const nm = (p.name || "").split(/[|\n]/)[0].trim().replace(/\s+/g, " ").slice(0, 24).trim();
    let token: string;
    if (nm) {
      token = "@" + nm;
      if (mentionRefs.some((x) => x.token === token && x.lid !== lid)) token = "@" + nm + " " + lid.slice(-4); // desambigua nomes iguais
      const tk = token;
      setMentionRefs((prev) => (prev.some((x) => x.token === tk) ? prev : [...prev, { token: tk, lid }]));
    } else {
      token = "@" + lid; // sem nome na agenda → id numérico mesmo
    }
    const next = text.slice(0, at) + token + " " + text.slice(caret);
    setText(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = at + token.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Compositor de foto (prévia + legenda + emoji + várias fotos) ──────────
  const [composer, setComposer] = useState<{ to: string; items: Shot[]; active: number } | null>(null);
  const [cmpSending, setCmpSending] = useState(false);
  const [cmpProgress, setCmpProgress] = useState("");
  const [cmpToast, setCmpToast] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const capRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const shotId = useRef(1);
  const urlsRef = useRef<Set<string>>(new Set()); // object URLs vivas, pra revogar
  const emojiOpenRef = useRef(false);
  const composerOpen = !!composer;
  const activeShot = composer ? composer.items[composer.active] : null;

  useEffect(() => { emojiOpenRef.current = emojiOpen; }, [emojiOpen]);

  function toast(msg: string, ms = 3200) {
    setAttachMsg(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setAttachMsg(""), ms);
  }
  function cmpFlash(msg: string, ms = 2800) {
    setCmpToast(msg);
    if (flashT.current) clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setCmpToast(""), ms);
  }
  function revokeAllUrls() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current.clear();
  }
  function soon(name: string) {
    setAttachOpen(false);
    toast(name + " — em breve 🚧");
  }
  function pick(type: "image" | "document") {
    setPendingType(type);
    setAttachOpen(false);
    if (fileRef.current) {
      // "Foto e vídeo": vídeo vai como VÍDEO (toca na conversa), não como arquivo (pedido 09/10).
      fileRef.current.accept = type === "image" ? "image/*,video/*" : "*/*";
      fileRef.current.multiple = type === "image";
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  // Filtra imagens válidas (tipo + tamanho) e abre/alimenta o compositor.
  const addShots = useCallback((files: File[], to: string) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const notImg = files.length - imgs.length;
    const ok = imgs.filter((f) => f.size <= MAX_FILE);
    const tooBig = imgs.length - ok.length;
    const newItems: Shot[] = ok.map((f) => {
      const url = URL.createObjectURL(f);
      urlsRef.current.add(url);
      return { id: shotId.current++, file: f, url, caption: "" };
    });
    const skipped: string[] = [];
    if (notImg) skipped.push(`${notImg} não é imagem`);
    if (tooBig) skipped.push(`${tooBig} acima de 37MB`);
    if (!newItems.length) {
      cmpFlash(skipped.length ? `Ignorado: ${skipped.join(" · ")}` : "Nenhuma imagem válida");
      return;
    }
    setComposer((c) => {
      if (c && c.to === to) return { ...c, items: [...c.items, ...newItems], active: c.items.length };
      return { to, items: newItems, active: 0 };
    });
    setEmojiOpen(false);
    if (skipped.length) cmpFlash(`Ignorado: ${skipped.join(" · ")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Envia arquivos como DOCUMENTO, um por um (usado pelo ＋ e pelo arrastar-e-soltar).
  async function enviaDocs(files: File[], chat: Chat) {
    const grandes = files.filter((f) => f.size > MAX_FILE);
    const ok = files.filter((f) => f.size <= MAX_FILE);
    if (grandes.length) toast(`${grandes.length} arquivo(s) acima de ~37MB — ignorados`, 4000);
    let n = 0;
    for (const f of ok) {
      n++;
      setAttachMsg(ok.length > 1 ? `Enviando ${n}/${ok.length}…` : "Enviando…");
      try {
        // Sobe o arquivo em BINÁRIO e manda só a URL: o corpo JSON do painel trava em 10MB
        // (medido 20/08) e base64 infla 33% — documento de 8MB não passava por aqui.
        const src = await subirArquivo(f);
        await jsend("/api/inbox/send-media", "POST", { account, to: chat.id, type: "document", file: src, caption: "" });
      } catch (ex: any) {
        toast(`Falhou no "${f.name}": ` + ex.message, 4000);
        await loadMsgs(chat.id);
        return;
      }
    }
    if (ok.length) { toast(ok.length > 1 ? `${ok.length} enviados ✅` : "Enviado ✅"); await loadMsgs(chat.id); }
  }

  // Envia VÍDEO como vídeo (prévia + play no WhatsApp do cliente). Se o WhatsApp recusar o
  // formato (ex.: .mov de iPhone), tenta de novo como documento — o vídeo chega de qualquer jeito.
  // Vídeo também passa pela PRÉVIA com legenda (antes saía direto, sem legenda — pedido 13/10).
  const [videoPend, setVideoPend] = useState<{ files: File[]; chat: Chat } | null>(null);
  const [videoEnviando, setVideoEnviando] = useState(false);
  async function enviaVideos(files: File[], chat: Chat, legenda = "") {
    const grandes = files.filter((f) => f.size > MAX_FILE);
    const ok = files.filter((f) => f.size <= MAX_FILE);
    if (grandes.length) toast(`${grandes.length} vídeo(s) acima de ~37MB — ignorados`, 4000);
    let n = 0;
    for (const f of ok) {
      n++;
      setAttachMsg(ok.length > 1 ? `Enviando vídeo ${n}/${ok.length}…` : "Enviando vídeo…");
      let src = "";
      try {
        src = await subirArquivo(f);
        await jsend("/api/inbox/send-media", "POST", { account, to: chat.id, type: "video", file: src, caption: n === 1 ? legenda : "" });
      } catch (ex: any) {
        try {
          if (!src) throw ex;
          // Timeout com o vídeo JÁ entregue? Então não manda de novo como arquivo (sairia em dobro).
          const r = await jget(`/api/inbox/messages?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(chat.id)}`).catch(() => null);
          const agora = Date.now() / 1000;
          const chegou = (r?.messages ?? []).some((m: Msg) => {
            let ts = Number(m.timestamp ?? 0); if (ts > 1e12) ts /= 1000;
            return m.fromMe && m.type === "VideoMessage" && agora - ts < 180;
          });
          if (chegou) continue;
          await jsend("/api/inbox/send-media", "POST", { account, to: chat.id, type: "document", file: src, caption: n === 1 ? legenda : "" });
          toast(`"${f.name}" foi como arquivo (o WhatsApp não aceitou como vídeo)`, 4500);
        } catch (ex2: any) {
          toast(`Falhou no "${f.name}": ` + ex2.message, 4000);
          await loadMsgs(chat.id);
          return;
        }
      }
    }
    if (ok.length) { toast(ok.length > 1 ? `${ok.length} vídeos enviados` : "Vídeo enviado"); await loadMsgs(chat.id); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !sel) return;
    const chat = sel;
    if (pendingType === "document") return void enviaDocs(files.slice(0, 1), chat);
    const videos = files.filter((f) => f.type.startsWith("video/"));
    const imgs = files.filter((f) => !f.type.startsWith("video/"));
    if (imgs.length) addShots(imgs, chat.id); // imagem → compositor
    if (videos.length) setVideoPend({ files: videos, chat }); // prévia com legenda antes de enviar
  }

  // ── COLAR imagem (Cmd+V / Ctrl+V) — print da tela vai direto pro compositor ──
  // Igual WhatsApp: abre a prévia em tela cheia com campo de legenda e botão enviar.
  useEffect(() => {
    if (!sel) return;
    const alvo = sel.id;
    function aoColar(e: ClipboardEvent) {
      const itens = Array.from(e.clipboardData?.items ?? []);
      const imgs = itens
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (!imgs.length) return; // colou texto → segue o comportamento normal do campo
      e.preventDefault();
      addShots(imgs, alvo); // compositor já aberto na mesma conversa → só acrescenta
    }
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
  }, [sel, addShots]);

  // ── Arrastar e soltar arquivo na conversa (igual WhatsApp Web) ─────────────
  // Imagem → abre o compositor (prévia + legenda); o resto vai como documento.
  const [arrastando, setArrastando] = useState(false);
  const dragDepth = useRef(0); // dragenter/leave disparam nos FILHOS também — conta a profundidade
  function temArquivo(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }
  function onDragEnter(e: React.DragEvent) {
    if (!sel || !temArquivo(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setArrastando(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!sel || !temArquivo(e)) return;
    e.preventDefault(); // sem isto o navegador ABRE o arquivo em vez de soltar aqui
  }
  function onDragLeave(e: React.DragEvent) {
    if (!temArquivo(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setArrastando(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!sel || !temArquivo(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setArrastando(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const videos = files.filter((f) => f.type.startsWith("video/"));
    const docs = files.filter((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));
    if (imgs.length) addShots(imgs, sel.id);
    if (videos.length) setVideoPend({ files: videos, chat: sel });
    if (docs.length) void enviaDocs(docs, sel);
  }
  function onMoreFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !composer) return;
    addShots(files, composer.to);
  }
  function openMore() {
    if (cmpSending) return;
    moreRef.current?.click();
  }

  function setCaption(val: string) {
    setComposer((c) => (c ? { ...c, items: c.items.map((it, i) => (i === c.active ? { ...it, caption: val } : it)) } : c));
  }
  function selectShot(i: number) {
    if (cmpSending) return;
    setComposer((c) => (c ? { ...c, active: i } : c));
  }
  function removeShot(idx: number) {
    if (cmpSending) return;
    setComposer((c) => {
      if (!c) return c;
      const removed = c.items[idx];
      if (removed) { URL.revokeObjectURL(removed.url); urlsRef.current.delete(removed.url); }
      const items = c.items.filter((_, i) => i !== idx);
      if (!items.length) return null;
      // se removeu ANTES da ativa, o índice desliza → compensa; senão só faz clamp.
      const active = idx < c.active ? c.active - 1 : Math.min(c.active, items.length - 1);
      return { ...c, items, active };
    });
  }
  function insertEmoji(emo: string) {
    const el = capRef.current;
    const cur = activeShot?.caption ?? "";
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + emo + cur.slice(end);
    setCaption(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emo.length;
      el.setSelectionRange(pos, pos);
    });
  }
  function closeComposer() {
    if (cmpSending) return;
    revokeAllUrls();
    setComposer(null);
    setEmojiOpen(false);
    setCmpProgress("");
  }
  async function sendComposer() {
    if (!composer || cmpSending || !composer.items.length) return;
    const to = composer.to;
    const queue = [...composer.items]; // snapshot do que ainda falta enviar
    const total = queue.length;
    setCmpSending(true);
    setEmojiOpen(false);
    let sent = 0;
    try {
      for (const shot of queue) {
        setCmpProgress(total > 1 ? `Enviando ${sent + 1}/${total}…` : "Enviando…");
        const src = await subirArquivo(shot.file);
        await jsend("/api/inbox/send-media", "POST", { account, to, type: "image", file: src, caption: shot.caption });
        sent++;
        // tira a foto já enviada do compositor → num retry NUNCA reenvia (evita duplicar).
        URL.revokeObjectURL(shot.url);
        urlsRef.current.delete(shot.url);
        setComposer((c) => (c ? { ...c, items: c.items.filter((x) => x.id !== shot.id), active: 0 } : c));
        if (sent < total) await new Promise((r) => setTimeout(r, 220)); // preserva a ordem no zap
      }
      setComposer(null);
      setCmpProgress("");
      await loadMsgs(to);
    } catch (e: any) {
      setCmpProgress(`Enviou ${sent}/${total}. Falhou o resto: ${e.message}. Toque em enviar pra tentar de novo.`);
      if (sent > 0) await loadMsgs(to);
    } finally {
      setCmpSending(false);
    }
  }

  const loadChats = useCallback(async () => {
    try {
      const r = await jget("/api/inbox/chats?account=" + encodeURIComponent(account));
      setChats(r.chats ?? []);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingChats(false);
    }
  }, [account]);

  const loadMsgs = useCallback(
    async (chatid: string) => {
      try {
        const r = await jget(`/api/inbox/messages?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(chatid)}`);
        setMsgs(r.messages ?? []);
      } catch {
        /* mantém o que tem */
      }
    },
    [account],
  );

  useEffect(() => {
    if (contaEhApi) return; // indo pra caixa da API — poll de Lite aqui só erraria (account "api" não resolve token)
    setLoadingChats(true);
    loadChats();
    const t = setInterval(loadChats, 12000);
    return () => clearInterval(t);
  }, [loadChats, contaEhApi]);

  useEffect(() => {
    if (!sel) return;
    loadMsgs(sel.id);
    const t = setInterval(() => loadMsgs(sel.id), 6000);
    return () => clearInterval(t);
  }, [sel, loadMsgs]);

  // Rastreio da conversa (selo ADS + UTMs). Só 1:1 — grupo não tem origem de anúncio. Zera na troca
  // de conversa pra não mostrar a origem de um lead no chat de outro.
  useEffect(() => {
    setUtmOpen(false);
    setRastreio(null);
    if (!sel || sel.isGroup) return;
    const tel = (sel.phone || sel.id).replace(/@.*/, "").replace(/\D/g, "");
    if (!tel) return;
    let vivo = true;
    jget(`/api/inbox/rastreio?phone=${encodeURIComponent(tel)}`)
      .then((d) => { if (vivo && d && !d.error) setRastreio(d as Rastreio); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [sel]);

  // ROLAGEM AUTOMÁTICA — só quando faz sentido. A cada 6s as mensagens são recarregadas; antes isso
  // arrastava a tela pro fim SEMPRE, então quem estava lendo conversa antiga era puxado de volta e
  // nunca conseguia subir. Agora: desce sozinho apenas se você JÁ estava no rodapé (ou acabou de
  // abrir a conversa). Se você subiu pra ler, a tela fica parada onde está.
  const perto = () => {
    const el = msgsRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120; // ~1 mensagem do fim
  };
  const grudadoRef = useRef(true);
  // Fundo da conversa (escolhido nas Configurações; fica no localStorage — nada no banco).
  const [fundo, setFundo] = useState<FundoSalvo>({ id: "padrao" });
  useEffect(() => {
    setFundo(fundoAtual());
    const f = () => setFundo(fundoAtual());
    window.addEventListener(EVENTO_FUNDO, f);
    window.addEventListener("storage", f); // mudou em OUTRA aba → sincroniza
    return () => { window.removeEventListener(EVENTO_FUNDO, f); window.removeEventListener("storage", f); };
  }, []);
  // PÍLULA FLUTUANTE DE DIA (igual WhatsApp): aparece presa no topo ENQUANTO se rola, mostrando o
  // dia das mensagens em vista, e some com fade ~1s depois que a rolagem para. Os separadores
  // fixos entre os dias continuam — esta é a peça que acompanha o dedo.
  const [diaFlutuante, setDiaFlutuante] = useState("");
  const [flutuanteOn, setFlutuanteOn] = useState(false);
  const flutuanteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoRolar = () => {
    grudadoRef.current = perto();
    const el = msgsRef.current;
    if (!el) return;
    // O dia "corrente" = o do ÚLTIMO separador que já passou do topo da janela de mensagens.
    // getBoundingClientRect (e não offsetTop) porque é relativo ao que se VÊ, não ao layout.
    const topo = el.getBoundingClientRect().top;
    let label = "";
    el.querySelectorAll<HTMLElement>(".msg-day[data-dia]").forEach((sep) => {
      if (sep.getBoundingClientRect().top - topo <= 34) label = sep.dataset.dia || label;
    });
    // Sem separador acima do topo (ex.: conversa recém-aberta lá em cima) NÃO liga a pílula —
    // ligada sem texto ela aparecia como uma bolinha branca vazia (bug visto no tema claro).
    if (!label) { setFlutuanteOn(false); return; }
    setDiaFlutuante(label);
    setFlutuanteOn(true);
    if (flutuanteTimer.current) clearTimeout(flutuanteTimer.current);
    flutuanteTimer.current = setTimeout(() => setFlutuanteOn(false), 900);
  };
  const chatAtual = sel?.id;
  // 1ª pintura da conversa recém-aberta: a tela tem que NASCER no fim, como no WhatsApp. O
  // comentário antigo dizia isso, mas a condição fazia o contrário — `msgs.length ? "smooth"` —
  // e quando as 500 mensagens chegavam a rolagem ANIMAVA do topo até o fim, atravessando a
  // conversa inteira ("fica rolando, rolando" — Admin, 08/09). Suave só para mensagem NOVA
  // chegando com a pessoa já no rodapé.
  const primeiraPinturaRef = useRef(true);
  useEffect(() => { grudadoRef.current = true; primeiraPinturaRef.current = true; setDiaFlutuante(""); setFlutuanteOn(false); setZoom(null); }, [chatAtual]); // trocou de conversa → começa no fim, pílula zera
  useEffect(() => {
    if (!grudadoRef.current || !msgs.length) return;
    const el = msgsRef.current;
    if (primeiraPinturaRef.current) {
      // Salto seco, sem animação: posiciona no fim antes de o olho perceber qualquer coisa.
      if (el) el.scrollTop = el.scrollHeight; else bottomRef.current?.scrollIntoView({ behavior: "auto" });
      primeiraPinturaRef.current = false;
      // ASSENTAMENTO: nos 2,5s seguintes as mídias visíveis ainda chegam e crescem o rodapé. Sem
      // isto, a última mensagem ia sendo empurrada pra baixo da dobra. Mantém colado no fim
      // enquanto a pessoa não rolou pra cima (grudado) — depois disso, não mexe mais.
      if (el) {
        const t0 = Date.now();
        const tick = setInterval(() => {
          if (!grudadoRef.current || Date.now() - t0 > 2500) { clearInterval(tick); return; }
          el.scrollTop = el.scrollHeight;
        }, 120);
      }
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Busca a URL de UMA mídia (o /message/find vem sem URL). Usada pelo download automático e pela
  // setinha do áudio. Devolve a promise pra quem quiser mostrar "baixando…".
  const fetchMedia = useCallback((m: Msg): Promise<void> => {
    if (!m.mid || media[m.id] || mediaInflight.current.has(m.id)) return Promise.resolve();
    const id = m.id;
    mediaInflight.current.add(id);
    return jget(`/api/inbox/download?account=${encodeURIComponent(account)}&id=${encodeURIComponent(m.mid)}`)
      .then((r) => { if (r?.fileURL) setMedia((p) => ({ ...p, [id]: { url: r.fileURL, mime: r.mimetype || "" } })); })
      .finally(() => mediaInflight.current.delete(id));
  }, [account, media]);

  // Mídia que JÁ vem com URL (cache do motor, gravado no arquivo) → usa direto, zero requisição.
  // É o que faz a conversa reabrir instantânea.
  useEffect(() => {
    for (const m of msgs) {
      if (m.fileURL && !media[m.id]) {
        const u = m.fileURL;
        setMedia((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: { url: u, mime: "" } }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  // DOWNLOAD PREGUIÇOSO (pedido do dono, 08/09). Antes, abrir a conversa disparava o download
  // de TODA imagem/vídeo das 500 mensagens de uma vez — centenas de requisições, e cada uma que
  // chegava trocava um "carregando…" por um bloco de 220px, empurrando a tela. Agora só busca o
  // que está a até ~700px da janela: abre no fim com a mídia recente; a antiga só é baixada se a
  // pessoa rolar pra cima até ela. Igual ao WhatsApp.
  useEffect(() => {
    const cont = msgsRef.current;
    if (!cont || typeof IntersectionObserver === "undefined") return;
    const porId = new Map(msgs.map((m) => [m.id, m] as const));
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const m = porId.get(String((e.target as HTMLElement).dataset.mid ?? ""));
        if (!m) continue;
        const t = m.type || "";
        // ÁUDIO entrou (10/09): o WhatsApp baixa a nota de voz sozinho e o balão já nasce com
        // o ▶. Ficou de fora quando o download era "tudo de uma vez"; perto da janela é barato.
        if (!MEDIA_TYPES.has(t)) continue;
        if (m.fileURL || media[m.id]) continue;
        obs.unobserve(e.target); // buscou uma vez, chega
        fetchMedia(m).catch(() => {});
      }
    }, { root: cont, rootMargin: "700px 0px" });
    cont.querySelectorAll<HTMLElement>(".msg[data-mid]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, fetchMedia]);

  // Carrega os participantes quando abre um GRUPO (pro seletor de "@").
  useEffect(() => {
    setMentionOpen(false);
    setQrOpen(false); // fecha o menu de respostas rápidas ao trocar de conversa
    setPartsErr("");
    setMentionRefs([]);
    setReplyTo(null); // citação não atravessa conversas
    setEmojiMsgOpen(false);
    paraGravar(true); // trocou de conversa no meio da gravação → descarta o áudio
    sairSelecao(); // seleção também não atravessa
    setFwd(null);
    setFwdBusca("");
    if (!sel || !sel.isGroup) { setParts([]); return; }
    let alive = true;
    jget(`/api/inbox/participants?account=${encodeURIComponent(account)}&jid=${encodeURIComponent(sel.id)}`)
      .then((r) => { if (alive) { setParts(r.participants ?? []); setPartsErr(""); } })
      .catch((e) => { if (alive) { setParts([]); setPartsErr(e?.message || "erro ao carregar participantes"); } });
    return () => { alive = false; };
  }, [sel, account]);

  // Limpeza geral no unmount: timers e object URLs.
  useEffect(() => {
    return () => {
      if (toastT.current) clearTimeout(toastT.current);
      if (flashT.current) clearTimeout(flashT.current);
      if (recTimer.current) clearInterval(recTimer.current);
      recCancelado.current = true;
      try { recRef.current?.stop(); } catch { /* já parado */ }
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current.clear();
    };
  }, []);

  // Compositor aberto: foca a legenda e devolve o foco a quem abriu ao fechar.
  useEffect(() => {
    if (!composerOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => capRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      opener?.focus?.();
    };
  }, [composerOpen]);

  // Teclado do compositor: Esc fecha (emoji primeiro); Tab fica preso dentro do modal.
  useEffect(() => {
    if (!composer) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        if (emojiOpenRef.current) setEmojiOpen(false);
        else closeComposer();
        return;
      }
      if (ev.key === "Tab" && overlayRef.current) {
        const nodes = overlayRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        const list = Array.from(nodes);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        const act = document.activeElement as HTMLElement | null;
        if (!overlayRef.current.contains(act)) { ev.preventDefault(); first.focus(); }
        else if (ev.shiftKey && act === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && act === last) { ev.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer, cmpSending]);

  // Esc fecha a imagem ampliada.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  // Fecha o menu da mensagem / barra de reação ao clicar fora.
  useEffect(() => {
    if (!menuFor && !reactBar) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".msg-menu") && !t?.closest?.(".msg-menu-btn") && !t?.closest?.(".msg-reactbar") && !t?.closest?.(".msg-reactions")) {
        setMenuFor(null);
        setReactBar(null);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuFor, reactBar]);

  // Fecha a lista de UTMs (origem do lead) ao clicar fora dela.
  useEffect(() => {
    if (!utmOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".conv-origem")) setUtmOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [utmOpen]);

  // Fecha a caixinha do "+" (anexar) ao clicar fora ou apertar Esc — antes ela ficava aberta
  // por cima da conversa sem jeito de fechar (pedido do dono, 09/10).
  useEffect(() => {
    if (!attachOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".attach-wrap-anexo")) setAttachOpen(false);
    }
    function onKey(ev: KeyboardEvent) { if (ev.key === "Escape") setAttachOpen(false); }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [attachOpen]);

  // Fecha o painel de emoji do CAMPO DE MENSAGEM ao clicar fora dele.
  useEffect(() => {
    if (!emojiMsgOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".emoji-msg-wrap")) setEmojiMsgOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [emojiMsgOpen]);

  // Fecha o painel de emoji ao clicar fora dele.
  useEffect(() => {
    if (!emojiOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".cmp-capbar")) setEmojiOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [emojiOpen]);

  // ── Ações da mensagem (menu da setinha) ───────────────────────────────────
  async function doReact(m: Msg, emoji: string) {
    setReactBar(null);
    // clicar no MESMO emoji que já reagi = remover (manda vazio)
    const toSend = myReaction[m.id] === emoji ? "" : emoji;
    try {
      await jsend("/api/inbox/react", "POST", { account, id: m.mid || m.id, emoji: toSend });
      if (sel) await loadMsgs(sel.id);
    } catch (e: any) {
      setErr("Falhou reagir: " + e.message);
    }
  }
  async function doCopy(m: Msg) {
    setMenuFor(null);
    if (m.text) { navigator.clipboard?.writeText(m.text).catch(() => {}); toast("Texto copiado 📋"); return; }
    // Sem texto (figurinha/foto): copia a IMAGEM pro clipboard; se o navegador não deixar, copia o link.
    const url = media[m.id]?.url;
    if (!url) return toast("Nada pra copiar aqui");
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const tipo = blob.type.includes("png") ? blob.type : "image/png";
      const png = blob.type === tipo ? blob : await recodificaPng(url);
      await navigator.clipboard.write([new ClipboardItem({ [tipo]: png })]);
      toast("Imagem copiada 📋");
    } catch {
      navigator.clipboard?.writeText(url).catch(() => {});
      toast("Link copiado 📋 (o navegador não deixou copiar a imagem)");
    }
  }
  // Converte pra PNG num canvas — o clipboard do Chrome só aceita PNG.
  function recodificaPng(url: string): Promise<Blob> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d")?.drawImage(img, 0, 0);
        c.toBlob((b) => (b ? res(b) : rej(new Error("sem blob"))), "image/png");
      };
      img.onerror = () => rej(new Error("falha ao carregar"));
      img.src = url;
    });
  }
  function doDownload(m: Msg) {
    setMenuFor(null);
    const mm = media[m.id];
    if (!mm) return;
    const a = document.createElement("a");
    a.href = mm.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }
  async function doDelete(m: Msg) {
    setMenuFor(null);
    if (!window.confirm("Apagar esta mensagem para todos?")) return;
    try {
      await jsend("/api/inbox/delete", "POST", { account, id: m.mid || m.id });
      if (sel) await loadMsgs(sel.id);
    } catch (e: any) {
      setErr("Falhou apagar: " + e.message);
    }
  }

  // Abriu a conversa → marca LIDA no servidor (UazAPI), não só na tela. O `opened` local dá o
  // efeito imediato; o POST zera o contador de verdade — é o que faz o "lido" sobreviver ao
  // refresh e valer pra qualquer atendente/aba (estado no servidor, nunca só no navegador).
  function abriuConversa(c: Chat) {
    setOpened((p) => new Set(p).add(c.id));
    setNaoLidasAoAbrir(c.unread || 0); // alimenta o divisor "Mensagens não lidas"
    if (!c.unread) return; // nada a marcar — não gasta chamada
    setChats((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
    jsend("/api/inbox/read", "POST", { account, chatid: c.id }).catch(() => {}); // best-effort
  }

  // ── Gravar e mandar ÁUDIO (nota de voz / PTT, igual o microfone do WhatsApp) ──
  const [gravando, setGravando] = useState(false);
  const [gravSeg, setGravSeg] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelado = useRef(false);

  async function comecaGravar() {
    if (gravando || enviandoAudio || !sel) return;
    setAttachOpen(false);
    setEmojiMsgOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Firefox gravam webm+opus; Safari grava mp4 — a UazAPI converte pro formato de voz.
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunks.current = [];
      recCancelado.current = false;
      rec.ondataavailable = (ev) => { if (ev.data.size) recChunks.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // solta o microfone (apaga a bolinha da aba)
        if (!recCancelado.current) void enviaAudio(new Blob(recChunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      recRef.current = rec;
      rec.start();
      setGravSeg(0);
      setGravando(true);
      recTimer.current = setInterval(() => setGravSeg((s) => s + 1), 1000);
    } catch {
      toast("Não consegui usar o microfone — libera a permissão no navegador", 4000);
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
    if (!sel) return;
    if (blob.size < 1500) return toast("Áudio curto demais — segura mais um pouquinho", 2500);
    const chat = sel;
    setEnviandoAudio(true);
    try {
      const src = await subirArquivo(blob, blob.type || "audio/ogg");
      await jsend("/api/inbox/send-media", "POST", { account, to: chat.id, type: "ptt", file: src, caption: "" });
      toast("Áudio enviado ✅");
      await loadMsgs(chat.id);
    } catch (e: any) {
      toast("Falhou o áudio: " + e.message, 4000);
    } finally {
      setEnviandoAudio(false);
    }
  }
  function fmtGrav(s: number): string {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // ── Menu da setinha: Fixar (nativo) · Favoritar (interno) · Encaminhar · Selecionar ──
  // ⭐ Favoritas: marcador do PAINEL (WhatsApp não tem API de favoritar), salvo no servidor.
  const [favoritas, setFavoritas] = useState<Set<string>>(new Set());
  useEffect(() => {
    jget("/api/inbox/favoritas").then((d) => setFavoritas(new Set(Object.keys(d?.favoritas ?? {})))).catch(() => {});
  }, []);
  async function doPin(m: Msg) {
    setMenuFor(null);
    try {
      await jsend("/api/inbox/pin", "POST", { account, id: m.mid || m.id, pin: !m.pinned, duration: 7 });
      toast(m.pinned ? "Mensagem desafixada" : "Mensagem fixada 📌 (7 dias)");
      if (sel) await loadMsgs(sel.id);
    } catch (e: any) {
      setErr("Falhou fixar: " + e.message);
    }
  }
  function doFavorita(m: Msg) {
    setMenuFor(null);
    const on = !favoritas.has(m.id);
    setFavoritas((p) => { const n = new Set(p); if (on) n.add(m.id); else n.delete(m.id); return n; });
    jsend("/api/inbox/favorita", "POST", {
      id: m.id, on, chatid: sel?.id ?? "", chatName: sel?.name ?? "",
      texto: m.text || m.type || "", fromMe: m.fromMe,
    }).catch(() => {});
  }

  // ✔️ Modo SELECIONAR: marca várias e age em massa (copiar / encaminhar / apagar as minhas).
  const [selMode, setSelMode] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  function sairSelecao() { setSelMode(false); setMarcadas(new Set()); }
  function toggleMarcada(id: string) {
    setMarcadas((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const msgsMarcadas = msgs.filter((m) => marcadas.has(m.id)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  function copiaMarcadas() {
    const texto = msgsMarcadas.map((m) => m.text).filter(Boolean).join("\n");
    navigator.clipboard?.writeText(texto).catch(() => {});
    toast(`${msgsMarcadas.length} copiada(s) 📋`);
    sairSelecao();
  }
  async function apagaMarcadas() {
    const minhas = msgsMarcadas.filter((m) => m.fromMe);
    if (!minhas.length) return;
    if (!window.confirm(`Apagar ${minhas.length} mensagem(ns) SUA(S) para todos? (as dos outros não dá)`)) return;
    try {
      for (const m of minhas) await jsend("/api/inbox/delete", "POST", { account, id: m.mid || m.id });
      toast(`${minhas.length} apagada(s) 🗑️`);
    } catch (e: any) {
      toast("Falhou apagar: " + e.message, 4000);
    }
    sairSelecao();
    if (sel) await loadMsgs(sel.id);
  }

  // ➡️ ENCAMINHAR: a UazAPI não tem forward nativo (sondado no spec 05/08) — REENVIA o conteúdo
  // (texto como texto; mídia baixa a URL e manda de novo). Sem o selo "encaminhada" do WhatsApp.
  const [fwd, setFwd] = useState<Msg[] | null>(null);
  const [fwdBusca, setFwdBusca] = useState("");
  const [fwdEnviando, setFwdEnviando] = useState(false);
  function tipoParaEnvio(t?: string): string | null {
    if (t === "ImageMessage") return "image";
    if (t === "VideoMessage" || t === "PtvMessage") return "video";
    if (t === "AudioMessage" || t === "PttMessage") return "audio";
    if (t === "StickerMessage") return "sticker";
    if (t === "DocumentMessage") return "document";
    return null;
  }
  const fwdChats = useMemo(() => {
    const q = fwdBusca.trim().toLowerCase();
    const dig = q.replace(/\D/g, "");
    return chats.filter((c) => !q || c.name.toLowerCase().includes(q) || (dig.length >= 2 && (c.phone || c.id).replace(/\D/g, "").includes(dig))).slice(0, 14);
  }, [chats, fwdBusca]);
  async function encaminharPara(destino: Chat) {
    if (!fwd?.length || fwdEnviando) return;
    setFwdEnviando(true);
    try {
      let ok = 0;
      for (const m of [...fwd].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) {
        const tipo = tipoParaEnvio(m.type);
        if (tipo) {
          let url = media[m.id]?.url;
          if (!url && m.mid) {
            const r = await jget(`/api/inbox/download?account=${encodeURIComponent(account)}&id=${encodeURIComponent(m.mid)}`).catch(() => null);
            url = r?.fileURL;
          }
          if (!url) continue; // mídia indisponível → pula, não trava o lote
          await jsend("/api/inbox/send-media", "POST", { account, to: destino.id, type: tipo, file: url, caption: tipo === "sticker" ? "" : (m.text || "") });
          ok++;
        } else if (m.text) {
          await jsend("/api/inbox/send", "POST", { account, to: destino.id, text: m.text });
          ok++;
        }
      }
      toast(ok ? `${ok} encaminhada(s) pra ${destino.name} ✅` : "Nada pra encaminhar (mídia indisponível)", 4000);
      setFwd(null);
      setFwdBusca("");
      sairSelecao();
    } catch (e: any) {
      toast("Falhou encaminhar: " + e.message, 4000);
    } finally {
      setFwdEnviando(false);
    }
  }

  // ── 📣 Marcar TODOS do grupo (botão do cabeçalho — reusa o mentionAll dos fluxos) ──
  const [mtOpen, setMtOpen] = useState(false);
  const [mtTexto, setMtTexto] = useState("");
  const [mtVisivel, setMtVisivel] = useState(false); // false = oculta (só notifica), true = @ de todos no texto
  const [mtEnviando, setMtEnviando] = useState(false);
  async function enviaMarcarTodos() {
    if (!sel?.isGroup || mtEnviando) return;
    if (!mtVisivel && !mtTexto.trim()) return toast("Menção oculta precisa de mensagem — ou marca a opção de mostrar os @", 4000);
    setMtEnviando(true);
    try {
      await jsend("/api/inbox/mention-all", "POST", { account, groupJid: sel.id, text: mtTexto.trim(), hidden: !mtVisivel });
      toast("Todo mundo marcado 📣✅");
      setMtOpen(false);
      setMtTexto("");
      await loadMsgs(sel.id);
    } catch (e: any) {
      toast("Falhou marcar todos: " + e.message, 4000);
    } finally {
      setMtEnviando(false);
    }
  }
  useEffect(() => {
    if (!mtOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".mtodos-pop") && !t?.closest?.(".mtodos-btn")) setMtOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [mtOpen]);

  // ── Agendar mensagem pra ESTA conversa (contato ou grupo) ─────────────────
  // Versão objetiva do menu Lembretes: cria um lembrete "once" (data+hora) mirando o chat
  // aberto. O agendador do motor (tick 60s, fuso de Araguaína) faz o envio.
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [agMsg, setAgMsg] = useState("");
  const [agData, setAgData] = useState("");
  const [agHora, setAgHora] = useState("");
  const [agSalvando, setAgSalvando] = useState(false);
  const [agErro, setAgErro] = useState("");
  // AVISAR ALGUÉM (pedido do dono, 05/10): "o cliente pediu pra ligar 18:30 e eu não posso
  // esquecer". Um 2º lembrete vai pro número da equipe X minutos antes do horário. Com a mensagem
  // do cliente vazia, só o aviso é criado. O número fica lembrado neste navegador (conveniência).
  const [agAvisar, setAgAvisar] = useState(false);
  const [agAvisoNum, setAgAvisoNum] = useState("");
  const [agAvisoAntes, setAgAvisoAntes] = useState(10);
  const [agAvisoMsg, setAgAvisoMsg] = useState("");

  function abreAgendar() {
    const agora = new Date(Date.now() + 30 * 60000); // sugestão: daqui a 30min
    setAgData(`${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`);
    setAgHora(`${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`);
    setAgMsg(text.trim()); // aproveita o rascunho do campo, se tiver
    setAgErro("");
    setAgAvisar(false);
    setAgAvisoMsg("");
    try { setAgAvisoNum(localStorage.getItem("zc-aviso-numero") || ""); } catch { /* sem storage: digita de novo */ }
    setAgendarOpen(true);
  }
  async function salvaAgendada() {
    if (!sel || agSalvando) return;
    const msg = agMsg.trim();
    if (!msg && !agAvisar) return setAgErro("Escreve a mensagem que vai ser enviada (ou marque Avisar alguém).");
    if (!agData || !/^\d{2}:\d{2}$/.test(agHora)) return setAgErro("Confere a data e a hora.");
    const horario = new Date(`${agData}T${agHora}`);
    if (horario <= new Date()) return setAgErro("Esse horário já passou — escolhe um futuro.");
    // Aviso à equipe: número com DDD (sem 55 ganha 55) e horário = agendamento − antecedência.
    let avisoNum = "", avisoData = "", avisoHora = "";
    if (agAvisar) {
      avisoNum = agAvisoNum.replace(/\D/g, "");
      if (avisoNum.length === 10 || avisoNum.length === 11) avisoNum = "55" + avisoNum;
      if (avisoNum.length < 12) return setAgErro("Coloque o número de quem vai ser avisado, com DDD.");
      const quando = new Date(horario.getTime() - agAvisoAntes * 60000);
      if (quando <= new Date()) return setAgErro(`O aviso cairia no passado (${agAvisoAntes} min antes). Diminua a antecedência ou mude o horário.`);
      avisoData = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, "0")}-${String(quando.getDate()).padStart(2, "0")}`;
      avisoHora = `${String(quando.getHours()).padStart(2, "0")}:${String(quando.getMinutes()).padStart(2, "0")}`;
    }
    setAgSalvando(true);
    setAgErro("");
    try {
      const atual = await jget("/api/reminders");
      const lista = Array.isArray(atual?.reminders) ? atual.reminders : [];
      const alvo = sel.isGroup ? sel.id : (sel.phone || sel.id.split("@")[0]);
      if (msg) {
        lista.push({
          id: "ag-" + Date.now(),
          name: "Agendada — " + sel.name.slice(0, 40),
          enabled: true,
          schedule: { type: "once", time: agHora, date: agData },
          target: alvo,
          message: msg,
          account,
        });
      }
      if (agAvisar) {
        const [, m2, d2] = agData.split("-");
        const tel = sel.isGroup ? "" : (sel.phone || sel.id.split("@")[0]).replace(/\D/g, "");
        const padrao = `⏰ Lembrete: ${sel.name}${tel ? ` (${fmtNumber(tel)})` : ""} às ${agHora} de ${d2}/${m2}.` +
          (tel ? `\nhttps://wa.me/${tel}` : "") + (msg ? `\n\nMensagem agendada pro cliente:\n"${msg.slice(0, 300)}"` : "");
        lista.push({
          id: "av-" + Date.now(),
          name: "Aviso — " + sel.name.slice(0, 40),
          enabled: true,
          schedule: { type: "once", time: avisoHora, date: avisoData },
          target: avisoNum,
          message: agAvisoMsg.trim() || padrao,
          account,
          sobre: alvo,
        });
        try { localStorage.setItem("zc-aviso-numero", agAvisoNum.trim()); } catch { /* conveniência */ }
      }
      await jsend("/api/reminders", "PUT", { reminders: lista });
      setAgendarOpen(false);
      window.dispatchEvent(new Event("zc-agendadas-rever")); // a faixa "Mensagem agendada" aparece na hora
      const [, mm, dd] = agData.split("-");
      toast((msg ? `Agendada pra ${dd}/${mm} às ${agHora}` : "Aviso agendado") + (agAvisar ? ` · ${fmtNumber(avisoNum)} é avisado às ${avisoHora}` : "") + " ✅", 5000);
    } catch (e: any) {
      setAgErro("Falhou ao salvar: " + e.message);
    } finally {
      setAgSalvando(false);
    }
  }

  // Fecha o popover de agendar ao clicar fora.
  useEffect(() => {
    if (!agendarOpen) return;
    function onDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".agendar-pop") && !t?.closest?.(".agendar-btn")) setAgendarOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [agendarOpen]);

  // ── Menção legível: "@152200823..." vira "@Nome" ──────────────────────────
  // Resolve pelo participante do grupo aberto (lid OU telefone) e, se não achar,
  // pela lista de conversas. Últimos 8 dígitos só quando o id PARECE telefone
  // (LID tem 14+ dígitos e casaria errado).
  const resolveMencao = useCallback((id: string): { nome: string; tel: string } | null => {
    const pareceTel = id.length <= 13;
    const p = parts.find((x) =>
      x.lid === id || x.phone === id ||
      (pareceTel && !!x.phone && x.phone.replace(/\D/g, "").slice(-8) === id.slice(-8)));
    if (p) return { nome: (p.name || "").trim() || fmtNumber(p.phone || id), tel: p.phone || (pareceTel ? id : "") };
    if (!pareceTel) return null;
    const c = chats.find((x) => !x.isGroup && (x.phone || x.id.split("@")[0] || "").replace(/\D/g, "").slice(-8) === id.slice(-8));
    if (c) return { nome: c.name, tel: c.phone || c.id.split("@")[0] };
    return null;
  }, [parts, chats]);

  // Abre a conversa 1:1 de um número — a existente se já tiver (compara últimos 8 dígitos: JID BR
  // pode vir sem o 9º), senão uma nova em branco. Usada pelo "Conversar" do cartão de contato, pelo
  // "Conversar no privado" do grupo e pela menção.
  function abrirConversaComNumero(phone: string, nome: string) {
    const dig = phone.replace(/\D/g, "");
    if (dig.length < 8) return toast("Esse contato veio sem telefone", 3000);
    const jaTem = chats.find((c) => !c.isGroup && (c.phone || c.id).replace(/\D/g, "").slice(-8) === dig.slice(-8));
    const alvo: Chat = jaTem ?? { id: dig + "@s.whatsapp.net", name: nome || fmtNumber(dig), phone: dig, unread: 0, isGroup: false };
    setSel(alvo);
    setMsgs([]);
    abriuConversa(alvo);
  }
  // Link direto pra uma conversa com a mensagem já escrita: /ao-vivo?abrir=<telefone>&texto=<msg>.
  // Nasceu do botão "Chamar" dos Resumos (05/10): abre a conversa com "Bom dia, Fulano, tudo bem?"
  // na caixa e a pessoa só clica em Enviar — sai pelo número conectado, não pelo WhatsApp do PC.
  // Espera a lista de conversas chegar (pra abrir a existente, com foto e histórico); sem lista em
  // 4 s, abre em branco mesmo. Roda uma vez e limpa a URL (recarregar não reescreve o texto).
  const linkDiretoFeito = useRef(false);
  useEffect(() => {
    if (linkDiretoFeito.current || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const tel = (q.get("abrir") || "").replace(/\D/g, "");
    if (!tel) { linkDiretoFeito.current = true; return; }
    const executa = () => {
      if (linkDiretoFeito.current) return;
      linkDiretoFeito.current = true;
      abrirConversaComNumero(tel, q.get("nome") || "");
      const t = q.get("texto");
      if (t) setText(t);
      window.history.replaceState(null, "", window.location.pathname);
    };
    if (chats.length) { executa(); return; }
    const espera = setTimeout(executa, 4000);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats]);

  function acaoContato(acao: "conversar" | "copiar", tel: string, nome: string) {
    if (acao === "conversar") return abrirConversaComNumero(tel, nome);
    navigator.clipboard?.writeText(tel).then(() => toast("Número copiado", 1800)).catch(() => {});
  }

  // 2 cliques na menção → abre a conversa 1:1 com a pessoa (cria a entrada se ainda não conversaram).
  function abrirContato(id: string) {
    const r = resolveMencao(id);
    const tel = (r?.tel || (id.length <= 13 ? id : "")).replace(/\D/g, "");
    if (!tel) return toast("Esse contato usa id privado do WhatsApp — sem telefone pra abrir a conversa", 3500);
    const c = chats.find((x) => !x.isGroup && (x.phone || x.id.split("@")[0] || "").replace(/\D/g, "").slice(-8) === tel.slice(-8));
    const alvo: Chat = c ?? { id: tel + "@s.whatsapp.net", name: r?.nome || fmtNumber(tel), phone: tel, unread: 0, isGroup: false };
    setSel(alvo);
    setMsgs([]);
    abriuConversa(alvo);
  }

  const mencaoEl = (id: string, key: string): React.ReactNode => {
    const r = resolveMencao(id);
    return (
      <span
        key={key}
        className="msg-mencao"
        title={r ? `${r.nome}${r.tel ? " · " + fmtNumber(r.tel) : ""} — 2 cliques abrem a conversa` : "Contato fora do grupo"}
        onDoubleClick={(e) => { e.stopPropagation(); abrirContato(id); }}
      >
        @{r?.nome || id}
      </span>
    );
  };

  // Tem texto selecionado na tela? Então o clique foi pra COPIAR, não pra responder.
  function temTextoSelecionado(): boolean {
    const s = typeof window !== "undefined" ? window.getSelection() : null;
    return !!s && !s.isCollapsed && s.toString().trim().length > 0;
  }
  // Marca a mensagem pra responder citando (menu "Responder" OU duplo clique no balão).
  function startReply(m: Msg) {
    if (foiApagada(m) || m.type === "ReactionMessage") return; // apagada/reação não se cita
    setMenuFor(null);
    setReactBar(null);
    setReplyTo(m);
    requestAnimationFrame(() => composeRef.current?.focus());
  }
  // Resuminho da mensagem citada na barrinha (texto ou o tipo da mídia).
  function resumoDeMsg(m: Msg): string {
    if (m.text) return m.text.length > 90 ? m.text.slice(0, 90) + "…" : m.text;
    const t = m.type || "";
    if (t === "ImageMessage") return "📷 Foto";
    if (t === "VideoMessage" || t === "PtvMessage") return "🎥 Vídeo";
    if (t === "AudioMessage" || t === "PttMessage") return "🎤 Áudio";
    if (t === "StickerMessage") return "🏷️ Figurinha";
    if (t === "DocumentMessage") return "📄 " + (m.fileName || "Documento");
    if (t === "ContactMessage" || t === "ContactsArrayMessage") return "👤 Contato";
    if (t === "LocationMessage" || t === "LiveLocationMessage") return "📍 " + (m.local?.nome || m.local?.endereco || "Localização");
    return "Mensagem";
  }
  // Insere o emoji no PONTO DO CURSOR do campo de mensagem (não só no fim).
  function insereEmojiMsg(emo: string) {
    const el = composeRef.current;
    const ini = el?.selectionStart ?? text.length;
    const fim = el?.selectionEnd ?? ini;
    setText(text.slice(0, ini) + emo + text.slice(fim));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = ini + emo.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    if (!sel || !text.trim() || sending) return;
    setSending(true);
    setMentionOpen(false);
    setQrOpen(false);
    const shown = text; // o que o usuário vê (com @Nome)
    // converte @Nome → @<lid> (mais longos primeiro, p/ não corromper prefixos) e coleta os ids
    let out = shown;
    const ids: string[] = [];
    const refs = mentionRefs.filter((r) => out.includes(r.token)).sort((a, b) => b.token.length - a.token.length);
    for (const r of refs) { out = out.split(r.token).join("@" + r.lid); ids.push(r.lid); }
    Array.from(shown.matchAll(/@(\d{6,})/g)).forEach((x) => ids.push(x[1])); // menções sem nome / digitadas à mão
    const citando = replyTo; // snapshot: se falhar, volta a citação junto com o texto
    setText("");
    setMentionRefs([]);
    setReplyTo(null);
    setEmojiMsgOpen(false);
    // OTIMISTA: o balão aparece NA HORA, com o texto que a pessoa vê (com @Nome). Antes só surgia
    // depois do POST + de uma recarga inteira da conversa — as duas viagens somadas davam ~2,5s de
    // espera olhando pro nada. Aqui a mensagem entra na lista já, e o loadMsgs depois só a
    // substitui pela versão de verdade (mesmo texto → sem piscada perceptível).
    const tmpId = "tmp-" + Date.now();
    const otimista: Msg = {
      id: tmpId, text: shown, fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      citacao: citando ? { alvoId: citando.id, texto: citando.text, tipo: undefined } : undefined,
      pendente: true,
    };
    grudadoRef.current = true; // depois de enviar, sempre rola pro fim pra ver o que mandei
    setMsgs((atual) => [...atual, otimista]);
    try {
      await jsend("/api/inbox/send", "POST", { account, to: sel.id, text: out, mentions: Array.from(new Set(ids)).join(","), replyId: citando?.id || undefined });
      window.dispatchEvent(new Event("zc-pausa-rever")); // enviar à mão pausa a IA — o botão do topo relê na hora
      await loadMsgs(sel.id);
    } catch (e: any) {
      setMsgs((atual) => atual.filter((m) => m.id !== tmpId));
      // O erro pode ser só da VOLTA (timeout/502 montando a prévia de um link) com a mensagem já
      // entregue. Confere no servidor antes de devolver o texto — senão o link fica na caixa e a
      // pessoa manda duas vezes (print de 10/09).
      const chegou = await conferirEnvio(`/api/inbox/messages?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(sel.id)}`, [out, shown]);
      if (chegou) {
        await loadMsgs(sel.id);
      } else {
        // Falhou de verdade: devolve texto + citação pra pessoa tentar de novo.
        setText(shown);
        setReplyTo(citando);
        setErr("Falhou ao enviar: " + e.message);
      }
    } finally {
      setSending(false);
    }
  }

  // Clique num botão de RESPOSTA RÁPIDA de uma mensagem recebida → responde a conversa com o
  // rótulo, igual tocar no botão no app (não passa pelo compositor: o texto é o do botão).
  async function responderBotao(rotulo: string) {
    if (!sel || sending) return;
    setSending(true);
    try {
      await jsend("/api/inbox/send", "POST", { account, to: sel.id, text: rotulo });
      await loadMsgs(sel.id);
    } catch (e: any) {
      setErr("Falhou ao enviar: " + e.message);
    } finally {
      setSending(false);
    }
  }

  // Um frame enquanto o effect troca a bolinha (ou a rota) — não pisca a caixa vazia do Lite.
  if (contaEhApi) {
    return bolinhaLite ? (
      <div className="card"><div className="card-pad muted">Abrindo suas conversas do WhatsApp Lite…</div></div>
    ) : (
      <div className="card"><div className="card-pad">
        <b>Abrindo as conversas da API Oficial…</b>
        <p className="muted" style={{ margin: "6px 0 14px" }}>
          A conta <b>{activeAcct!.name}</b> é da API Oficial da Meta, e as conversas dela ficam no WPP Api.
        </p>
        <a className="btn primary" href={TELA_AO_VIVO.API}>Abrir o WPP Api</a>
      </div></div>
    );
  }

  return (
    <>
    <div className={"card inbox" + (sel ? " tem-ativo" : "")}>
      <div className="inbox-list">
        <div className="inbox-list-head">
          Conversas {loadingChats && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· carregando…</span>}
        </div>
        <div className="chat-busca">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            className="chat-busca-inp"
            placeholder="Pesquisar por nome ou telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setBusca(""); }}
          />
          {busca && <button className="chat-busca-x" onClick={() => setBusca("")} aria-label="Limpar busca">✕</button>}
        </div>
        {pinAviso && <div className="pin-aviso">{pinAviso}</div>}
        {err && <div className="card-pad" style={{ color: "var(--crit)", fontSize: 12.5 }}>{err}</div>}
        {!err && chats.length === 0 && !loadingChats && (
          <div className="card-pad muted" style={{ fontSize: 13 }}>Nenhuma conversa ainda.</div>
        )}
        {!err && chats.length > 0 && chatsVisiveis.length === 0 && (
          <div className="card-pad muted" style={{ fontSize: 13 }}>
            {buscandoTudo ? "Procurando em todas as conversas…" : <>Nada com “{busca.trim()}”.</>}
          </div>
        )}
        <div className="inbox-chats" onScroll={aoRolarLista}>
          {chatsVisiveis.map((c) => {
            const naoLidas = opened.has(c.id) ? 0 : c.unread;
            return (
            <button key={c.id} className={"inbox-chat" + (sel?.id === c.id ? " on" : "")} onClick={() => { setSel(c); setMsgs([]); abriuConversa(c); }}>
              <span className="inbox-ava">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" />
                ) : (
                  initials(c.name)
                )}
              </span>
              <span className="inbox-chat-txt">
                <span className="inbox-chat-top">
                  <b>{c.name}</b>
                  {c.timestamp ? <span className={"inbox-time" + (naoLidas ? " nova" : "")}>{fmtQuando(c.timestamp)}</span> : null}
                </span>
                <span className="inbox-last">{c.lastMessage || ""}</span>
              </span>
              {/* Alfinete: fixada mostra sempre; no hover vira o botão de (des)fixar. span com role
                  de propósito — <button> dentro do <button> da linha é HTML inválido. */}
              <span
                className={"inbox-pin" + (c.pinned ? " on" : "")}
                role="button" tabIndex={-1}
                title={c.pinned ? "Desafixar conversa" : "Fixar conversa no topo (até 10)"}
                onClick={async (e) => {
                  e.stopPropagation();
                  const erro = await fixarChat(c.id, !c.pinned);
                  setPinAviso(erro ?? "");
                  if (erro) setTimeout(() => setPinAviso(""), 5000);
                }}
              >
                <Icon name="pin" size={13} />
              </span>
              {naoLidas > 0 && (
                <span className="inbox-badges">
                  {/* @ quando alguém te MARCOU numa conversa não lida (igual WhatsApp) */}
                  {c.mencionado && <span className="inbox-at" title="Mencionaram você">@</span>}
                  <span className="inbox-unread">{naoLidas}</span>
                </span>
              )}
            </button>
            );
          })}
          {!busca.trim() && buscandoTudo && (
            <div className="card-pad muted" style={{ fontSize: 12.5, textAlign: "center" }}>Carregando conversas antigas…</div>
          )}
        </div>
      </div>

      <div className="inbox-conv" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {!sel ? (
          <div className="inbox-empty muted">Escolha uma conversa pra ver as mensagens.</div>
        ) : (
          <>
            {arrastando && (
              <div className="drop-overlay" aria-hidden>
                <div className="drop-caixa">
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                  <b>Solte o arquivo aqui</b>
                  <span>Imagem abre a prévia com legenda · o resto vai como documento</span>
                </div>
              </div>
            )}
            <div className="inbox-conv-head">
              {/* No celular a conversa ocupa a tela toda — este ‹ volta pra lista (some no desktop). */}
              <button className="ofi-volta-lista" onClick={() => setSel(null)} aria-label="Voltar para as conversas">‹</button>
              {/* Clicar no nome/foto abre o modal "Dados da conversa" (igual WhatsApp). */}
              <button className="inbox-head-info" onClick={() => setInfoOpen(true)} title="Dados da conversa">
                <span className="inbox-ava sm">
                  {sel.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sel.image} alt="" />
                  ) : (
                    initials(sel.name)
                  )}
                </span>
                <span className="inbox-head-nome">
                  <b>{sel.name}</b>
                  <span className="muted" style={{ display: "block", fontSize: 11.5, fontFamily: "var(--mono)" }}>{sel.phone || sel.id}</span>
                </span>
              </button>
              {/* DE ONDE O LEAD VEIO: selo ADS (tráfego pago) + lista suspensa das UTMs que vieram do
                  checkout/anúncio. Só aparece quando há dado de origem — conversa comum não mostra nada. */}
              {!sel.isGroup && rastreio && (rastreio.veioDeAds || rastreio.utm) && (
                <div className="conv-origem" onClick={(e) => e.stopPropagation()}>
                  {rastreio.veioDeAds && (
                    <span className="selo-ads" title={rastreio.anuncio?.headline ? `Anúncio: ${rastreio.anuncio.headline}` : "Lead veio de tráfego pago (ADS)"}>ADS</span>
                  )}
                  {rastreio.utm && (
                    <div className="utm-wrap">
                      <button className="utm-btn" onClick={() => setUtmOpen((o) => !o)} aria-expanded={utmOpen}
                              title="Parâmetros de origem (UTM) deste lead">
                        UTMs
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: utmOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      {utmOpen && (
                        <div className="utm-pop" role="menu">
                          <div className="utm-titulo">De onde este lead veio</div>
                          {([
                            ["Origem", rastreio.utm.source],
                            ["Mídia", rastreio.utm.medium],
                            ["Campanha", rastreio.utm.campaign],
                            ["Criativo", rastreio.utm.content],
                            ["Termo", rastreio.utm.term],
                            ["Anúncio (id)", rastreio.utm.adId],
                          ] as [string, string | null | undefined][])
                            .filter(([, v]) => !!v)
                            .map(([rot, v]) => (
                              <button key={rot} className="utm-linha" title="Clique pra copiar"
                                      onClick={() => { navigator.clipboard?.writeText(String(v)); toast(`${rot} copiado`, 1600); }}>
                                <span className="utm-rot">{rot}</span>
                                <span className="utm-val">{v}</span>
                              </button>
                            ))}
                          {rastreio.anuncio?.link && (
                            <a className="utm-linha utm-link" href={rastreio.anuncio.link} target="_blank" rel="noreferrer">
                              <span className="utm-rot">Anúncio</span>
                              <span className="utm-val">abrir link ↗</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* BOTÕES DA CONVERSA num grupo que QUEBRA EM LINHAS quando falta espaço (zoom, tela
                  menor, conta com Contrato + Etiquetas + Pausar IA + Ligar + Agendar). Antes ficavam
                  na mesma linha do nome e, sem espaço, espremiam o nome e subiam uns sobre os outros
                  (print de 05/10). Os popovers (Agendar, Marcar todos) ficam FORA do grupo: se
                  posicionam pelo cabeçalho inteiro. */}
              <div className="inbox-head-acoes">
              {!sel.isGroup && (
                <ContratoProcuracao
                  phone={sel.phone || sel.id}
                  nome={sel.name}
                  falas={() => msgs.filter((m) => !m.fromMe && (m.text || "").trim()).map((m) => m.text)}
                  onEnviar={async (texto) => {
                    await jsend("/api/inbox/send", "POST", { account, to: sel.id, text: texto });
                    window.dispatchEvent(new Event("zc-pausa-rever"));
                    await loadMsgs(sel.id);
                  }}
                />
              )}
              {!sel.isGroup && <OrigemLead phone={sel.phone || sel.id} />}
              {!sel.isGroup && <EtiquetasChat phone={sel.phone || sel.id} style={{ flex: "none" }} />}
              {!sel.isGroup && <PausaIa chatId={sel.phone || sel.id} account={account} style={{ flex: "none" }} />}
              {!sel.isGroup && (
                /* Era um link tel:, que no Mac abre o FaceTime e no PC não faz nada — nunca ligou
                   pelo WhatsApp. Agora toca o WhatsApp do contato de verdade, pelo número LITE
                   ativo. Confirma antes porque FAZ O TELEFONE DA PESSOA TOCAR. */
                <button className="btn ic agendar-btn" style={{ flex: "none" }}
                  title="Ligar por WhatsApp usando o número conectado" disabled={ligando}
                  onClick={async () => {
                    const num = (sel.phone || sel.id).replace(/@.*/, "").replace(/\D/g, "");
                    if (!num || !confirm(`Ligar por WhatsApp para ${fmtNumber(num)}?\n\nO telefone da pessoa vai tocar agora.`)) return;
                    setLigando(true);
                    try {
                      await jsend("/api/app/lite/call", "POST", { number: num, account });
                    } catch (e: any) {
                      alert("Não consegui ligar: " + (e?.message || "erro desconhecido"));
                    }
                    setLigando(false);
                  }}>
                  <Icon name="phone" size={15} />
                  {" "}<span className="rot rot-sec">{ligando ? "Chamando…" : "Ligar"}</span>
                </button>
              )}
              <button className="btn ic agendar-btn" style={{ flex: "none" }} title="Agendar uma mensagem pra esta conversa"
                onClick={() => (agendarOpen ? setAgendarOpen(false) : abreAgendar())}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                {" "}<span className="rot rot-sec">Agendar</span>
              </button>
              {sel.isGroup && (
                <button className="btn ic mtodos-btn" style={{ flex: "none" }} title="Marcar todos os participantes do grupo"
                  onClick={() => setMtOpen((o) => !o)}>
                  @ Todos
                </button>
              )}
              {sel.isGroup && (
                <button className="btn ic" style={{ flex: "none" }} title="Importar os contatos deste grupo pro CRM"
                  onClick={() => setImportGroup({ jid: sel.id, name: sel.name })}>
                  <Icon name="download" size={15} /> Importar contatos
                </button>
              )}
              </div>
              {mtOpen && sel.isGroup && (
                <div className="agendar-pop mtodos-pop">
                  <div className="ag-titulo">📣 Marcar todos do grupo</div>
                  <div className="ag-para">notifica <b>todos os participantes</b> de {sel.name}</div>
                  <textarea className="inp ag-txt" rows={3} placeholder="Mensagem (opcional se mostrar os @)…" value={mtTexto}
                    onChange={(e) => setMtTexto(e.target.value)} autoFocus />
                  <label className="mt-opcao">
                    <input type="checkbox" checked={mtVisivel} onChange={(e) => setMtVisivel(e.target.checked)} />
                    Mostrar o @ de cada um no texto — desmarcado, a menção é oculta (todos são notificados, sem poluir a mensagem)
                  </label>
                  <div className="ag-acoes">
                    <button className="btn" onClick={() => setMtOpen(false)} disabled={mtEnviando}>Cancelar</button>
                    <button className="btn primary" onClick={enviaMarcarTodos} disabled={mtEnviando}>{mtEnviando ? "…" : "Marcar todos"}</button>
                  </div>
                </div>
              )}
              {agendarOpen && (
                <div className="agendar-pop">
                  <div className="ag-titulo">Agendar mensagem</div>
                  <div className="ag-para">para <b>{sel.name}</b></div>
                  <textarea className="inp ag-txt" rows={3} placeholder="O que vai ser enviado…" value={agMsg}
                    onChange={(e) => { setAgMsg(e.target.value); setAgErro(""); }} autoFocus />
                  <div className="ag-linha">
                    <input className="inp" type="date" value={agData} onChange={(e) => { setAgData(e.target.value); setAgErro(""); }} />
                    <input className="inp" type="time" value={agHora} onChange={(e) => { setAgHora(e.target.value); setAgErro(""); }} />
                  </div>
                  <label className="ag-avisar">
                    <input type="checkbox" checked={agAvisar} onChange={(e) => { setAgAvisar(e.target.checked); setAgErro(""); }} />
                    Avisar alguém da equipe antes
                  </label>
                  {agAvisar && (
                    <div className="ag-aviso">
                      <div className="ag-linha">
                        <input className="inp" inputMode="tel" placeholder="WhatsApp de quem avisar (DDD + número)" value={agAvisoNum}
                          onChange={(e) => { setAgAvisoNum(e.target.value); setAgErro(""); }} />
                        <select className="inp" style={{ flex: "0 0 128px" }} value={agAvisoAntes} onChange={(e) => { setAgAvisoAntes(Number(e.target.value)); setAgErro(""); }}>
                          {[0, 1, 5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m === 0 ? "na hora" : m < 60 ? `${m} min antes` : `${m / 60} h antes`}</option>)}
                        </select>
                      </div>
                      <textarea className="inp ag-txt" rows={2} value={agAvisoMsg} onChange={(e) => setAgAvisoMsg(e.target.value)}
                        placeholder={`Mensagem do aviso (vazio = "⏰ Lembrete: ${sel.name} às ${agHora || "hh:mm"}" + link do WhatsApp)`} />
                      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                        {agMsg.trim() ? "Vão dois agendamentos: a mensagem pro cliente e o aviso pra equipe." : "Sem mensagem pro cliente: só o aviso pra equipe é agendado."}
                      </div>
                    </div>
                  )}
                  {agErro && <div className="ag-erro">{agErro}</div>}
                  <div className="ag-acoes">
                    <button className="btn" onClick={() => setAgendarOpen(false)} disabled={agSalvando}>Cancelar</button>
                    <button className="btn primary" onClick={salvaAgendada} disabled={agSalvando}>{agSalvando ? "…" : "Agendar"}</button>
                  </div>
                </div>
              )}
            </div>

            <div
              className="inbox-msgs"
              ref={msgsRef}
              onScroll={aoRolar}
              style={cssDoFundo(fundo)}
            >
              {diaFlutuante && (
                <div className={"msg-day-float" + (flutuanteOn ? " on" : "")} aria-hidden>
                  <span>{diaFlutuante}</span>
                </div>
              )}
              {msgs.map((m, mi) => {
                // 📣 MARCADOR DE ANÚNCIO (CTWA): chip/cartão centralizado, fora do balão — igual ao WPP Api.
                if (m.type === "ctwa") {
                  const diaC = chaveDoDia(m.timestamp);
                  const antC = msgs[mi - 1];
                  const mostraDiaC = !!diaC && diaC !== chaveDoDia(antC?.timestamp);
                  return (
                    <Fragment key={m.id}>
                      {mostraDiaC && <div className="msg-day" data-dia={rotuloDoDia(m.timestamp)}><span>{rotuloDoDia(m.timestamp)}</span></div>}
                      {m.anuncio?.thumb ? (
                        <div className="ofi-evento ofi-evento-anuncio" title={m.timestamp ? new Date(m.timestamp * 1000).toLocaleString("pt-BR") : undefined}>
                          {m.anuncio.url ? (
                            <a href={m.anuncio.url} target="_blank" rel="noreferrer"><img src={m.anuncio.thumb} alt={m.anuncio.headline || "anúncio"} /></a>
                          ) : (
                            <img src={m.anuncio.thumb} alt={m.anuncio.headline || "anúncio"} />
                          )}
                          <div>{m.text}</div>
                        </div>
                      ) : (
                        <div className="ofi-evento" title={m.timestamp ? new Date(m.timestamp * 1000).toLocaleString("pt-BR") : undefined}>{m.text}</div>
                      )}
                    </Fragment>
                  );
                }
                const body = msgBody(m, media, doDownload, fetchMedia, { chat: sel?.image, minha: activeAcct?.avatar }, mencaoEl, (u) => setZoom({ url: u, nome: sel?.name }), responderBotao, acaoContato);
                if (!body) return null; // pula reações (viram badge) e vazios
                const reacts = reactionsByTarget[m.id];
                const isMedia = MEDIA_TYPES.has(m.type || "");
                const ehAudio = !foiApagada(m) && (m.type === "AudioMessage" || m.type === "PttMessage");
                // horário sobre a mídia (imagem/vídeo SEM legenda — igual WhatsApp)
                const overTime = !!media[m.id] && !m.text && (m.type === "ImageMessage" || m.type === "VideoMessage");
                // SEPARADOR DE DIA: entra sempre que a data muda em relação à mensagem anterior
                // VISÍVEL (as puladas acima não contam, senão o separador nasceria no lugar errado).
                let anterior: Msg | undefined;
                for (let k = mi - 1; k >= 0; k--) {
                  if (msgBody(msgs[k], media, doDownload, fetchMedia)) { anterior = msgs[k]; break; }
                }
                const dia = chaveDoDia(m.timestamp);
                const mostraDia = !!dia && dia !== chaveDoDia(anterior?.timestamp);
                const apagada = foiApagada(m);
                // DIVISOR "Mensagens não lidas": entra logo antes do bloco final de mensagens que
                // já estavam sem ler quando a conversa foi aberta (some ao trocar de conversa).
                const mostraNaoLidas = naoLidasAoAbrir > 0 && mi === Math.max(0, msgs.length - naoLidasAoAbrir);
                const aparelho = APARELHO[String(m.source || "").toLowerCase()] || "";
                return (
                  <Fragment key={m.id}>
                  {mostraDia && <div className="msg-day" data-dia={rotuloDoDia(m.timestamp)}><span>{rotuloDoDia(m.timestamp)}</span></div>}
                  {mostraNaoLidas && (
                    <div className="msg-naolidas"><span>{naoLidasAoAbrir} mensagem{naoLidasAoAbrir > 1 ? "s" : ""} não lida{naoLidasAoAbrir > 1 ? "s" : ""}</span></div>
                  )}
                  <div
                    id={"msg-" + m.id}
                    data-mid={m.id}
                    className={"msg" + (m.fromMe ? " me" : "") + (overTime ? " media" : "") + (ehAudio ? " audio" + (m.fromMe ? "" : " ava-dir") : "") + (reacts ? " has-react" : "") + (apagada ? " apagada" : "") + (selMode && marcadas.has(m.id) ? " marcada" : "")}
                    onClick={selMode ? () => toggleMarcada(m.id) : (e) => {
                      // Só a FAIXA vazia ao lado do balão (o ::before) e o respiro do próprio balão
                      // chegam aqui como currentTarget — texto, mídia e botões são filhos e não
                      // disparam. É o que deixa "clicar do lado pra responder" sem atrapalhar
                      // selecionar texto nem clicar em link.
                      if (!apagada && e.target === e.currentTarget && !temTextoSelecionado()) startReply(m);
                    }}
                    // Duplo clique em PALAVRA seleciona (o navegador faz isso) — responder ali
                    // jogava o foco pro campo de mensagem e APAGAVA a seleção (print do dono, 09/10:
                    // não conseguia copiar o link). Só responde se não há texto selecionado.
                    onDoubleClick={selMode ? undefined : () => { if (!temTextoSelecionado()) startReply(m); }}
                    onContextMenu={(e) => { e.preventDefault(); setReactBar(null); setMenuFlip(medePosicao(e).espacoAbaixo < 380); setMenuFor(m.id); }}
                    title={apagada || selMode ? undefined : "Clique ao lado (ou duplo clique) pra responder"}
                  >
                    {apagada && (
                      <div className="msg-apagada-aviso">
                        <span>🚫 Mensagem apagada</span>
                        {aparelho && <em>{aparelho}</em>}
                      </div>
                    )}
                    {/* Igual WhatsApp: a setinha ▾ mora SOZINHA no canto superior direito (abre o menu);
                        o emoji de reagir e a setinha de encaminhar flutuam AO LADO do balão. */}
                    <span className="msg-hover-acoes">
                      <button className="msg-hover-btn msg-menu-btn" onClick={(e) => { setReactBar(null); if (menuFor === m.id) { setMenuFor(null); } else { setMenuFlip(medePosicao(e).espacoAbaixo < 380); setMenuFor(m.id); } }} aria-label="Opções da mensagem"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                    </span>
                    {!apagada && !selMode && (
                      <span className="msg-hover-lado"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}>
                        <button className="msg-lado-btn" onClick={(e) => { setMenuFor(null); setReactFlip(medePosicao(e).espacoAcima < 52); setReactBar(reactBar === m.id ? null : m.id); }} aria-label="Reagir" title="Reagir">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1.8 2 5.2 2 7 0" /></svg>
                        </button>
                        <button className="msg-lado-btn" onClick={() => { setMenuFor(null); setReactBar(null); setFwd([m]); }} aria-label="Encaminhar" title="Encaminhar">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7l5 5-5 5" /><path d="M18 12H8.5a4.5 4.5 0 00-4.5 4.5V18" /></svg>
                        </button>
                      </span>
                    )}
                    {sel.isGroup && !m.fromMe && m.senderName && <div className="msg-sender">{m.senderName}</div>}
                    {/* RESPOSTA CITADA. O autor vem da UazAPI como LID (…@lid), que não resolve pra
                        nome — então procuramos a mensagem original NA PRÓPRIA LISTA pelo id e usamos
                        o remetente dela. Não achou (rolagem ainda não carregou), mostra só o texto
                        citado, que já é o que importa pra entender a conversa. */}
                    {m.citacao && (() => {
                      const alvo = m.citacao.alvoId ? msgs.find((x) => x.id === m.citacao!.alvoId) : undefined;
                      const autor = alvo ? (alvo.fromMe ? "Você" : alvo.senderName) : undefined;
                      const resumo = m.citacao.texto || (m.citacao.tipo ? m.citacao.tipo[0].toUpperCase() + m.citacao.tipo.slice(1) : "Mensagem");
                      return (
                        <div className={"msg-citacao" + (alvo ? " clicavel" : "")}
                             title={alvo ? "Ir para a mensagem" : undefined}
                             onClick={alvo ? (e) => { e.stopPropagation(); vaiPara(alvo.id); } : undefined}>
                          {autor && <b>{autor}</b>}
                          <span>{resumo}</span>
                        </div>
                      );
                    })()}
                    {body}
                    <div className={"msg-time" + (overTime ? " over" : "")}>
                      {m.pinned && <span className="msg-flag" title="Fixada">📌</span>}
                      {favoritas.has(m.id) && <span className="msg-flag" title="Favorita">⭐</span>}
                      {m.fromMe && <OrigemMsg origem={m.origem} source={m.source} autor={m.autor} />}
                      {fmtTime(m.timestamp)}
                      {m.fromMe && (m.pendente
                        ? <svg className="tick-svg" viewBox="0 0 16 16" width="11" height="11" aria-label="enviando"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.6 V8 L10.3 9.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                        : <Tick ack={ackDe(m)} />)}
                    </div>
                    {reacts && (
                      <button className="msg-reactions" title="Trocar ou remover reação" onClick={(e) => { setMenuFor(null); setReactFlip(medePosicao(e).espacoAcima < 52); setReactBar(reactBar === m.id ? null : m.id); }}>
                        {reacts.map((r, i) => <span key={i} className="msg-react">{r}</span>)}
                      </button>
                    )}

                    {reactBar === m.id && (
                      <div className={"msg-reactbar" + (reactFlip ? " flip" : "")}>
                        {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                          <button key={e} className={myReaction[m.id] === e ? "on" : ""} onClick={() => doReact(m, e)}>{e}</button>
                        ))}
                        {myReaction[m.id] && <button className="rm" title="Remover reação" onClick={() => doReact(m, myReaction[m.id])}>✕</button>}
                      </div>
                    )}
                    {menuFor === m.id && (
                      <div className={"msg-menu" + (menuFlip ? " flip" : "")}>
                        {!apagada && <button onClick={() => startReply(m)}>Responder</button>}
                        <button onClick={(e) => { setMenuFor(null); setReactFlip(medePosicao(e).espacoAcima < 52); setReactBar(m.id); }}>Reagir</button>
                        <button onClick={() => doCopy(m)}>Copiar</button>
                        {isMedia && media[m.id] && <button onClick={() => doDownload(m)}>Baixar</button>}
                        {!apagada && <button onClick={() => doFavorita(m)}>{favoritas.has(m.id) ? "Desfavoritar" : "Favoritar"}</button>}
                        {!apagada && <button onClick={() => doPin(m)}>{m.pinned ? "Desafixar" : "Fixar"}</button>}
                        {!apagada && <button onClick={() => { setMenuFor(null); setFwd([m]); }}>Encaminhar</button>}
                        <button onClick={() => { setMenuFor(null); setSelMode(true); setMarcadas(new Set([m.id])); }}>Selecionar</button>
                        {!m.fromMe && <button className="soon" disabled>Denunciar<em>em breve</em></button>}
                        {m.fromMe && <button className="danger" onClick={() => doDelete(m)}>Apagar</button>}
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {selMode && (
              <div className="sel-bar">
                <b>{marcadas.size} selecionada{marcadas.size === 1 ? "" : "s"}</b>
                <span className="sel-acoes">
                  <button className="btn" disabled={!msgsMarcadas.some((m) => m.text)} onClick={copiaMarcadas}>Copiar</button>
                  <button className="btn" disabled={!marcadas.size} onClick={() => setFwd(msgsMarcadas)}>Encaminhar</button>
                  <button className="btn danger" disabled={!msgsMarcadas.some((m) => m.fromMe)} onClick={apagaMarcadas}>
                    Apagar{msgsMarcadas.filter((m) => m.fromMe).length ? ` (${msgsMarcadas.filter((m) => m.fromMe).length})` : ""}
                  </button>
                </span>
                <button className="sel-x" onClick={sairSelecao} aria-label="Sair da seleção">✕</button>
              </div>
            )}
            {fwd && (
              <div className="fwd-overlay" onClick={(e) => { if (e.target === e.currentTarget && !fwdEnviando) { setFwd(null); setFwdBusca(""); } }}>
                <div className="fwd-modal">
                  <div className="fwd-titulo">
                    Encaminhar {fwd.length > 1 ? `${fwd.length} mensagens` : "para…"}
                    <button className="sel-x" onClick={() => { setFwd(null); setFwdBusca(""); }} disabled={fwdEnviando} aria-label="Fechar">✕</button>
                  </div>
                  <input className="inp" placeholder="Pesquisar conversa…" value={fwdBusca} onChange={(e) => setFwdBusca(e.target.value)} autoFocus disabled={fwdEnviando} />
                  <div className="fwd-lista">
                    {fwdChats.map((c) => (
                      <button key={c.id} onClick={() => encaminharPara(c)} disabled={fwdEnviando}>
                        <span className="inbox-ava sm">{c.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.image} alt="" /> : initials(c.name)}</span>
                        <span className="fwd-nome">{c.name}</span>
                      </button>
                    ))}
                    {!fwdChats.length && <div className="muted" style={{ padding: 10, fontSize: 13 }}>Nenhuma conversa com “{fwdBusca}”.</div>}
                  </div>
                  {fwdEnviando && <div className="muted" style={{ fontSize: 12.5 }}>Enviando…</div>}
                </div>
              </div>
            )}
            <div className="inbox-compose">
              {attachMsg && <div className="attach-toast">{attachMsg}</div>}
              {qrOpen && qrFor(qrQ).length > 0 && (
                <div className="mention-menu qr-menu">
                  <div className="mm-head">Respostas rápidas</div>
                  {qrFor(qrQ).slice(0, 8).map((r) => (
                    <button key={r.shortcut} type="button" onClick={() => pickQuickReply(r)}>
                      <span className="qr-mm-sc">/{r.shortcut}</span>
                      <span className="qr-mm-text">{r.text}</span>
                    </button>
                  ))}
                </div>
              )}
              {mentionOpen && sel.isGroup && (partsFor(mentionQ).length > 0 || partsErr) && (
                <div className="mention-menu">
                  <div className="mm-head">Marcar no grupo</div>
                  {partsErr && partsFor(mentionQ).length === 0 && (
                    <div style={{ padding: "8px 9px", fontSize: 12, color: "var(--crit)" }}>Não carreguei os participantes: {partsErr}</div>
                  )}
                  {partsFor(mentionQ).slice(0, 8).map((p) => (
                    <button key={p.lid || p.phone} type="button" onClick={() => pickMention(p)}>
                      <span className="mm-at">@</span>
                      <span className="mm-txt">
                        <b className="mm-name">{p.name || (p.phone ? fmtNumber(p.phone) : p.lid)}</b>
                        {p.name && p.phone && <span className="mm-num">{fmtNumber(p.phone)}</span>}
                      </span>
                      {p.isAdmin && <span className="mm-adm">admin</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Agendadas desta conversa: faixa clicável → janela pra ver/editar/cancelar/agendar outra. */}
              <AgendadasConversa alvo={sel.isGroup ? sel.id : (sel.phone || sel.id.split("@")[0])} ehGrupo={!!sel.isGroup} nome={sel.name} account={account} />
              {videoPend && (
                <AnexoPrevia arquivo={videoPend.files[0]} enviando={videoEnviando}
                  onCancelar={() => setVideoPend(null)}
                  onEnviar={async (leg) => {
                    const p = videoPend; setVideoEnviando(true);
                    try { await enviaVideos(p.files, p.chat, leg); } finally { setVideoEnviando(false); setVideoPend(null); }
                  }} />
              )}
              {replyTo && (
                <div className="reply-bar">
                  <div className="reply-corpo">
                    <b>{replyTo.fromMe ? "Você" : (replyTo.senderName || sel.name)}</b>
                    <span>{resumoDeMsg(replyTo)}</span>
                  </div>
                  <button className="reply-x" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">✕</button>
                </div>
              )}
              <div className="attach-wrap emoji-msg-wrap">
                <button className="attach-btn" onClick={() => { setEmojiMsgOpen((o) => !o); setAttachOpen(false); }} title="Emoji e figurinhas" aria-label="Emoji e figurinhas">
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1.8 2 5.2 2 7 0" /></svg>
                </button>
                {emojiMsgOpen && (
                  <div className="emoji-panel">
                    <div className="emoji-abas">
                      <button className={emojiAba === "emoji" ? "on" : ""} onClick={() => setEmojiAba("emoji")}>Emojis</button>
                      <button className={emojiAba === "fig" ? "on" : ""} onClick={() => setEmojiAba("fig")}>Figurinhas</button>
                    </div>
                    {emojiAba === "emoji" ? (
                      <div className="emoji-grade">
                        {EMOJIS.map((emo, i) => (
                          <button key={i} type="button" onClick={() => insereEmojiMsg(emo)}>{emo}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="emoji-fig-breve">
                        <span>🏷️</span>
                        Figurinhas — em breve 🚧
                        <em>Por enquanto dá pra receber; o envio das suas figurinhas vem na próxima leva.</em>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="attach-wrap attach-wrap-anexo">
                <button className={"attach-btn" + (attachOpen ? " aberto" : "")} onClick={() => { setAttachOpen((o) => !o); setEmojiMsgOpen(false); }} title={attachOpen ? "Fechar" : "Anexar"} aria-expanded={attachOpen}>＋</button>
                {attachOpen && (
                  <div className="attach-menu">
                    <button className="attach-fechar" onClick={() => setAttachOpen(false)} aria-label="Fechar" title="Fechar">✕</button>
                    <button onClick={() => pick("image")}><span>📷</span>Foto e vídeo</button>
                    <button onClick={() => pick("document")}><span>📄</span>Documento</button>
                    <button onClick={comecaGravar}><span>🎤</span>Áudio</button>
                    <button onClick={() => soon("Contato")}><span>👤</span>Contato</button>
                    <button onClick={() => soon("Resposta rápida")}><span>⚡</span>Resp. rápida</button>
                    <button onClick={() => soon("Enquete")}><span>📊</span>Enquete</button>
                    <button onClick={() => soon("Evento")}><span>📅</span>Evento</button>
                    <button onClick={() => soon("Catálogo")}><span>🛍️</span>Catálogo</button>
                    <button onClick={() => soon("Localização")}><span>📍</span>Local.</button>
                  </div>
                )}
              </div>
              <CampoMensagem
                ref={composeRef}
                className="inp"
                placeholder={sel.isGroup ? "Mensagem… (digite @ pra marcar alguém)" : "Escreva uma mensagem…"}
                value={text}
                onChange={onCompose}
                onKeyDown={(e) => {
                  const qrList = qrOpen ? qrFor(qrQ) : [];
                  if (qrList.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickQuickReply(qrList[0]); return; }
                  if (e.key === "Escape" && qrOpen) { setQrOpen(false); return; }
                  const list = mentionOpen && sel.isGroup ? partsFor(mentionQ) : [];
                  if (list.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); pickMention(list[0]); return; }
                  if (e.key === "Escape" && mentionOpen) { setMentionOpen(false); return; }
                  if (e.key === "Escape" && replyTo) { setReplyTo(null); return; }
                  // Enter envia; Shift+Enter quebra a linha (o padrão do <textarea>). O isComposing
                  // evita enviar no Enter que só confirma um acento/sugestão do teclado.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                }}
              />
              {gravando ? (
                <div className="grav-bar">
                  <span className="grav-dot" />
                  <span className="grav-tempo">{fmtGrav(gravSeg)}</span>
                  <button className="grav-x" onClick={() => paraGravar(true)} title="Descartar" aria-label="Descartar áudio">✕</button>
                  <button className="btn primary" onClick={() => paraGravar(false)}>Enviar</button>
                </div>
              ) : text.trim() ? (
                <button className="btn primary" onClick={send} disabled={sending}>{sending ? "…" : "Enviar"}</button>
              ) : (
                <button className="attach-btn" onClick={comecaGravar} disabled={enviandoAudio} title="Gravar áudio" aria-label="Gravar áudio">
                  {enviandoAudio ? "…" : (
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  )}
                </button>
              )}
              <input ref={fileRef} type="file" hidden onChange={onFile} />
            </div>
          </>
        )}
      </div>
    </div>

    {/* Imagem ampliada (clique na foto do chat) — Esc ou clique fora fecha. */}
    {zoom && (
      <div className="zoom-overlay" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
        <button className="zoom-x" onClick={() => setZoom(null)} aria-label="Fechar">✕</button>
        <a className="zoom-baixar" href={zoom.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Abrir/baixar original">⬇</a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={zoom.url} alt="" onClick={(e) => e.stopPropagation()} />
      </div>
    )}

    {/* ── Compositor de foto (estilo WhatsApp) ─────────────────────────────── */}
    {composer && activeShot && (
      <div className="cmp-overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label="Enviar foto">
        <div className="cmp-bar">
          <button className="cmp-tool" onClick={closeComposer} disabled={cmpSending} title="Fechar" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
          <div className="cmp-tools">
            <button className="cmp-tool hd" onClick={() => cmpFlash("Qualidade HD — em breve 🚧")}>HD</button>
            <button className="cmp-tool" onClick={() => cmpFlash("Cortar/girar — em breve 🚧")} title="Cortar" aria-label="Cortar">{IcCrop}</button>
            <button className="cmp-tool" onClick={() => cmpFlash("Figurinha — em breve 🚧")} title="Figurinha" aria-label="Figurinha">{IcSticker}</button>
            <button className="cmp-tool" onClick={() => cmpFlash("Texto na imagem — em breve 🚧")} title="Texto" aria-label="Texto" style={{ fontWeight: 800, fontSize: 16 }}>T</button>
            <button className="cmp-tool" onClick={() => cmpFlash("Desenhar — em breve 🚧")} title="Desenhar" aria-label="Desenhar">{IcPencil}</button>
          </div>
        </div>

        <div className="cmp-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cmp-img" src={activeShot.url} alt="prévia" />
        </div>

        <div className="cmp-foot">
          {cmpProgress && <div className="cmp-progress">{cmpProgress}</div>}
          {composer.items.length > 1 && (
            <div className="cmp-thumbs">
              {composer.items.map((it, i) => (
                <div key={it.id} className={"cmp-thumb" + (i === composer.active ? " on" : "")}>
                  <button type="button" className="cmp-thumb-sel" onClick={() => selectShot(i)} disabled={cmpSending} aria-label={`Foto ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt="" />
                  </button>
                  <button type="button" className="cmp-thumb-x" onClick={() => removeShot(i)} disabled={cmpSending} aria-label="Remover">✕</button>
                </div>
              ))}
              <button type="button" className="cmp-thumb add" onClick={openMore} disabled={cmpSending} title="Adicionar mais fotos" aria-label="Adicionar mais fotos">＋</button>
            </div>
          )}
          <div className="cmp-caprow">
            <div className="cmp-capbar">
              <button type="button" className="cmp-icon" onClick={openMore} disabled={cmpSending} title="Adicionar mais fotos" aria-label="Adicionar mais fotos">{IcAddPhoto}</button>
              <textarea
                ref={capRef}
                className="cmp-cap-input"
                rows={1}
                placeholder="Adicione uma legenda…"
                value={activeShot.caption}
                readOnly={cmpSending}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
                    e.preventDefault();
                    sendComposer();
                  }
                }}
              />
              <button type="button" className="cmp-icon" onClick={() => setEmojiOpen((o) => !o)} disabled={cmpSending} title="Emoji" aria-label="Emoji" aria-haspopup="true" aria-expanded={emojiOpen}>{IcSmile}</button>
              {emojiOpen && (
                <div className="cmp-emoji">
                  {EMOJIS.map((emo, i) => (
                    <button key={emo + i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertEmoji(emo)}>{emo}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="cmp-send" onClick={sendComposer} disabled={cmpSending} title="Enviar" aria-label="Enviar">{IcSend}</button>
          </div>
        </div>

        {cmpToast && <div className="cmp-toast">{cmpToast}</div>}
        <input ref={moreRef} type="file" accept="image/*" multiple hidden onChange={onMoreFiles} />
      </div>
    )}

    {importGroup && <GroupImportModal preset={importGroup} onClose={() => setImportGroup(null)} />}

    {infoOpen && sel && (
      <ChatInfoModal
        account={account}
        chat={{ id: sel.id, name: sel.name, image: sel.image, phone: sel.phone, isGroup: sel.isGroup, pinned: chats.find((x) => x.id === sel.id)?.pinned }}
        onClose={() => setInfoOpen(false)}
        onTogglePin={(pin) => fixarChat(sel.id, pin)}
        onLeft={() => {
          // Saiu do grupo: fecha tudo e tira a conversa da lista na hora (o loadChats confirma).
          setInfoOpen(false);
          setChats((prev) => prev.filter((x) => x.id !== sel.id));
          setSel(null);
          void loadChats();
        }}
        onOpenChat={(phone, nome) => { setInfoOpen(false); abrirConversaComNumero(phone, nome); }}
        onNome={(nome) => {
          // Nome vazio = volta ao do WhatsApp (o próximo loadChats traz).
          if (!nome) { void loadChats(); return; }
          setSel((s) => (s && s.id === sel.id ? { ...s, name: nome } : s));
          setChats((prev) => prev.map((x) => (x.id === sel.id ? { ...x, name: nome } : x)));
        }}
      />
    )}
    </>
  );
}
