"use client";

import { useEffect, useRef, useState } from "react";
import { jget, jsend, conferirEnvio } from "@/lib/client";
import { fmtNumber } from "@/components/accounts";

interface Chat { id: string; name: string; phone?: string; image?: string; lastMessage?: string; timestamp?: number; unread: number; isGroup: boolean }
interface Msg { id: string; mid?: string; text: string; fromMe: boolean; timestamp?: number; type?: string; fileURL?: string }

function hhmm(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
// Mídia sem texto vira um rótulo curto (MVP — o cliente vê que veio algo; render completo é passo futuro).
function preview(m: Msg): string {
  if (m.text) return m.text;
  const t = (m.type || "").toLowerCase();
  if (t.includes("image")) return "📷 Imagem";
  if (t.includes("audio") || t.includes("ptt")) return "🎤 Áudio";
  if (t.includes("video")) return "🎥 Vídeo";
  if (t.includes("document")) return "📎 Documento";
  if (t.includes("sticker")) return "🇸 Figurinha";
  if (t.includes("contact")) return "👤 Contato";
  return "•";
}

export function ClientInbox() {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [active, setActive] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [media, setMedia] = useState<Record<string, string>>({}); // mid → URL baixada (lazy)
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Só desce sozinho se o usuário JÁ estava no rodapé. Sem isto, o recarregamento de 6s puxava a
  // tela pro fim e era impossível subir pra ler conversa antiga.
  const grudadoRef = useRef(true);
  const noRodape = () => {
    const el = bodyRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const irAoFim = (forcar = false) => {
    if (!forcar && !grudadoRef.current) return;
    setTimeout(() => bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight), 30);
  };

  function loadChats() {
    jget("/api/app/inbox/chats").then((d) => setChats((d.chats ?? []).filter((c: Chat) => !c.isGroup))).catch((e) => { setErr(e.message); setChats([]); });
  }
  useEffect(() => { loadChats(); const t = setInterval(loadChats, 12000); return () => clearInterval(t); }, []);

  function openChat(c: Chat) {
    setActive(c); setMsgs([]); setErr(""); grudadoRef.current = true;
    const load = () => jget("/api/app/inbox/messages?chatid=" + encodeURIComponent(c.id))
      .then((d) => { setMsgs(d.messages ?? []); irAoFim(); })
      .catch(() => {});
    load();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(load, 6000);
  }
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function send() {
    if (!active || !draft.trim() || sending) return;
    const text = draft.trim();
    setSending(true); setErr("");
    try {
      await jsend("/api/app/inbox/send", "POST", { to: active.id, text });
      setDraft("");
      setMsgs((m) => [...m, { id: "local-" + Date.now(), text, fromMe: true, timestamp: Date.now() / 1000 }]);
      irAoFim(true);
    } catch (e: any) {
      // Timeout/502 na volta com a mensagem já entregue (texto com link gera prévia e demora):
      // confere no servidor antes de manter o rascunho — senão a pessoa manda em dobro.
      if (await conferirEnvio("/api/app/inbox/messages?chatid=" + encodeURIComponent(active.id), [text])) {
        setDraft("");
        setMsgs((m) => [...m, { id: "local-" + Date.now(), text, fromMe: true, timestamp: Date.now() / 1000 }]);
        irAoFim(true);
      } else setErr(e.message);
    }
    setSending(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !active) return;
    if (f.size > 4 * 1024 * 1024) { setErr(`Arquivo muito grande (${(f.size / 1048576).toFixed(0)}MB) — o painel envia até 4MB. Comprima ou mande do celular.`); return; }
    const mime = f.type || "";
    const type = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document";
    setSending(true); setErr("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await jsend("/api/app/inbox/send-media", "POST", { to: active.id, type, file: String(reader.result), caption: draft.trim() || undefined });
        setDraft("");
        setMsgs((m) => [...m, { id: "local-" + Date.now(), text: draft.trim(), fromMe: true, type, timestamp: Date.now() / 1000 }]);
        irAoFim(true);
      } catch (e: any) { setErr(e.message); }
      setSending(false);
    };
    reader.onerror = () => { setErr("Falha ao ler o arquivo."); setSending(false); };
    reader.readAsDataURL(f);
  }

  async function loadMedia(m: Msg) {
    const id = m.mid || m.id;
    if (!id || media[id]) return;
    try {
      const d = await jget("/api/app/inbox/download?id=" + encodeURIComponent(id));
      if (d.fileURL) setMedia((prev) => ({ ...prev, [id]: d.fileURL }));
    } catch { /* ignora */ }
  }

  function Bubble({ m }: { m: Msg }) {
    const t = (m.type || "").toLowerCase();
    const url = m.fileURL || media[m.mid || m.id];
    const isImg = t.includes("image") || t.includes("sticker");
    const isAud = t.includes("audio") || t.includes("ptt");
    const isVid = t.includes("video");
    if (isImg) {
      return url
        // eslint-disable-next-line @next/next/no-img-element
        ? <div><img src={url} alt="" style={{ maxWidth: 220, borderRadius: 8, display: "block" }} />{m.text && <div style={{ marginTop: 4 }}>{m.text}</div>}</div>
        : <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => loadMedia(m)}>📷 ver foto</button>;
    }
    if (isAud) {
      return url
        // eslint-disable-next-line jsx-a11y/media-has-caption
        ? <audio controls src={url} style={{ height: 34, maxWidth: 220 }} />
        : <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => loadMedia(m)}>🎤 ouvir áudio</button>;
    }
    if (isVid) {
      return url
        ? <video controls src={url} style={{ maxWidth: 240, borderRadius: 8 }} />
        : <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => loadMedia(m)}>🎥 ver vídeo</button>;
    }
    return <>{preview(m)}</>;
  }

  if (chats === null) return <div className="muted" style={{ textAlign: "center", padding: 30 }}>Carregando conversas…</div>;

  return (
    <div className="cin-wrap">
      <div className="cin-list">
        <div className="cin-list-head">Conversas</div>
        {chats.length === 0 ? (
          <div className="muted" style={{ padding: 16, fontSize: 13 }}>Nenhuma conversa ainda. Quando alguém te mandar mensagem, aparece aqui.</div>
        ) : chats.map((c) => (
          <button key={c.id} className={"cin-chat" + (active?.id === c.id ? " on" : "")} onClick={() => openChat(c)}>
            <div className="cin-ava">{c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            ) : (c.name || "?").slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cin-name">{c.name}{c.phone ? "" : ""}</div>
              <div className="cin-last">{c.lastMessage || ""}</div>
            </div>
            {c.unread > 0 && <span className="cin-unread">{c.unread}</span>}
          </button>
        ))}
      </div>

      <div className="cin-thread">
        {!active ? (
          <div className="cin-empty">Escolha uma conversa pra ver e responder.</div>
        ) : (
          <>
            <div className="cin-thread-head">
              <b>{active.name}</b>
              {active.phone && <span className="muted" style={{ fontSize: 12 }}>{fmtNumber(active.phone)}</span>}
            </div>
            <div className="cin-body" ref={bodyRef} onScroll={() => { grudadoRef.current = noRodape(); }}>
              {msgs.map((m) => (
                <div key={m.id} className={"cin-msg" + (m.fromMe ? " me" : "")}>
                  <div className="cin-bubble"><Bubble m={m} /><span className="cin-time">{hhmm(m.timestamp)}</span></div>
                </div>
              ))}
            </div>
            {err && <div style={{ color: "var(--crit)", fontSize: 12, padding: "4px 12px" }}>{err}</div>}
            <div className="cin-compose">
              <button className="btn" type="button" title="Enviar foto/áudio/documento" onClick={() => fileRef.current?.click()} disabled={sending}>📎</button>
              <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,application/pdf" hidden onChange={onFile} />
              <input className="inp" placeholder="Escreva uma mensagem…" value={draft}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
              <button className="btn primary" onClick={send} disabled={sending || !draft.trim()}>{sending ? "…" : "Enviar"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
