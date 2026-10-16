"use client";

// Botão "Etiquetas" do chat (WPP ao Vivo e WPP Api). Pedido do dono, 05/10: ver na hora as
// etiquetas do lead (as que os fluxos puseram, como "trabalhista" ou "contrato-pendente") e pôr ou
// tirar sem sair da conversa. O botão já mostra as primeiras; o menu lista todas, com × pra tirar,
// e um campo que sugere as etiquetas da conta (Enter cria uma nova).
import { LogoMeta } from "@/components/LogoMeta";
import { useEffect, useMemo, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import { Icon } from "@/components/icons";
import { ETIQUETAS_META, ehEtiquetaMeta } from "@/lib/etiquetas-meta";

export function EtiquetasChat({ phone, style }: { phone: string; style?: React.CSSProperties }) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [daConta, setDaConta] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [capiMsg, setCapiMsg] = useState(""); // resposta da Meta ao marcar etiqueta azul
  const [valorDe, setValorDe] = useState<string | null>(null); // etiqueta da Meta esperando o valor (Compra aprovada)
  const [valor, setValor] = useState("");
  const caixa = useRef<HTMLDivElement | null>(null);

  // Etiqueta muda fora daqui também (o fluxo põe enquanto a conversa está aberta): relê de tempos em tempos.
  useEffect(() => {
    let vivo = true;
    setTags(null); setAberto(false); setErro("");
    const ler = () => jget("/api/inbox/tags?phone=" + encodeURIComponent(phone)).then((d) => { if (vivo) setTags(d.tags ?? []); }).catch(() => { if (vivo) setTags((t) => t ?? []); });
    ler();
    const t = setInterval(ler, 30_000);
    return () => { vivo = false; clearInterval(t); };
  }, [phone]);
  useEffect(() => {
    if (!aberto) return;
    jget("/api/app/tags").then((d) => setDaConta((d.tags ?? []).map((x: any) => String(x.tag ?? x)))).catch(() => {});
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const sugestoes = useMemo(() => {
    const q = novo.trim().toLowerCase();
    const tem = new Set((tags ?? []).map((t) => t.toLowerCase()));
    return daConta.filter((t) => !tem.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, 8);
  }, [daConta, tags, novo]);

  async function muda(add: string[], remove: string[], extra?: { valor?: number; forcar?: boolean }) {
    setOcupado(true); setErro(""); setCapiMsg("");
    try {
      const r = await jsend("/api/inbox/tags", "POST", { phone, add, remove, ...(extra ?? {}) });
      setTags(r.tags ?? []);
      setNovo(""); setValorDe(null); setValor("");
      // Etiqueta da Meta: mostra na hora o que a Meta respondeu (enviado, sem clique, duplicado…).
      const c = (r.capi ?? [])[0];
      if (c) setCapiMsg(
        c.status === "ok" ? `Evento ${c.evento} enviado à Meta.`
        : c.status === "teste" ? `TESTE: evento ${c.evento} enviado à aba Testar eventos (não conta como conversão).`
        : c.status === "local" ? "Etiqueta marcada (essa não envia nada à Meta)."
        : c.detalhe || c.status,
      );
    } catch (e: any) {
      setErro(e?.message || "não consegui salvar");
    } finally { setOcupado(false); }
  }
  // Clique numa etiqueta da Meta: Compra aprovada pergunta o valor; as outras vão direto.
  function marcaMeta(tag: string) {
    if (tag === "Compra aprovada") { setValorDe(tag); setValor(""); setCapiMsg(""); return; }
    void muda([tag], []);
  }

  if (tags == null) return null;
  const visiveis = tags.slice(0, 2);
  return (
    <div className="pausa-ia" ref={caixa} style={style}>
      <button type="button" className="btn ic pausa-ia-btn" onClick={() => setAberto((v) => !v)}
        title={tags.length ? "Etiquetas deste contato: " + tags.join(", ") : "Pôr etiquetas neste contato"}>
        <Icon name="tag" size={14} />
        {tags.length === 0 ? <span className="rot">Etiquetas</span> : (
          <>
            {visiveis.map((t) => <span key={t} className={"etq-chip rot" + (ehEtiquetaMeta(t) ? " etq-meta" : "")}>{ehEtiquetaMeta(t) && <LogoMeta size={12} />}{t}</span>)}
            {tags.length > 2 && <small className="rot">+{tags.length - 2}</small>}
            <small className="etq-num">{tags.length}</small>
          </>
        )}
      </button>
      {aberto && (
        <div className="pausa-ia-menu etq-menu" role="dialog" aria-label="Etiquetas do contato">
          <div className="etq-lista">
            {tags.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Nenhuma etiqueta ainda.</span>}
            {tags.map((t) => (
              <span key={t} className={"etq-chip" + (ehEtiquetaMeta(t) ? " etq-meta" : "")}>
                {ehEtiquetaMeta(t) && <LogoMeta size={12} />}{t}
                <button type="button" aria-label={"Tirar " + t} disabled={ocupado} onClick={() => muda([], [t])}>×</button>
              </span>
            ))}
          </div>
          <input
            className="inp" style={{ fontSize: 13 }} placeholder="Adicionar etiqueta…" value={novo} disabled={ocupado} autoFocus
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && novo.trim()) {
                e.preventDefault();
                const alvo = sugestoes.find((s) => s.toLowerCase() === novo.trim().toLowerCase()) ?? novo.trim();
                if (ehEtiquetaMeta(alvo)) { marcaMeta(ETIQUETAS_META.find((x) => x.tag.toLowerCase() === alvo.toLowerCase())!.tag); setNovo(""); }
                else muda([alvo], []);
              }
              if (e.key === "Escape") setAberto(false);
            }}
          />
          {sugestoes.length > 0 && (
            <div className="etq-sug">
              {sugestoes.map((s) => <button key={s} type="button" disabled={ocupado} onClick={() => muda([s], [])}>+ {s}</button>)}
            </div>
          )}
          {novo.trim() && !sugestoes.some((s) => s.toLowerCase() === novo.trim().toLowerCase()) && (
            <div className="pausa-ia-nota">Enter cria a etiqueta &quot;{novo.trim()}&quot;.</div>
          )}
          {/* 🔵 Etiquetas da Meta: fixas, azuis — marcar dispara o evento de conversão da conversa */}
          <div className="etq-meta-sec">
            <div className="etq-meta-titulo"><LogoMeta size={14} /> Etiquetas da Meta <small>enviam conversão do anúncio</small></div>
            <div className="etq-lista">
              {ETIQUETAS_META.filter((e) => !(tags ?? []).some((t) => t.toLowerCase() === e.tag.toLowerCase())).map((e) => (
                <button key={e.tag} type="button" className="etq-chip etq-meta etq-meta-btn" disabled={ocupado}
                  title={e.dica} onClick={() => marcaMeta(e.tag)}>
                  <LogoMeta size={12} />{e.tag}
                </button>
              ))}
            </div>
            {valorDe && (
              <div className="etq-meta-valor">
                <input className="inp" style={{ fontSize: 13, width: 110 }} placeholder="Valor (R$)" autoFocus inputMode="decimal"
                  value={valor} onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void muda([valorDe], [], { valor: Number(valor.replace(",", ".")) || undefined }); } if (e.key === "Escape") setValorDe(null); }} />
                <button type="button" className="btn primary" style={{ fontSize: 12.5, padding: "5px 10px" }} disabled={ocupado}
                  onClick={() => void muda([valorDe], [], { valor: Number(valor.replace(",", ".")) || undefined })}>Marcar e enviar</button>
                <button type="button" className="btn" style={{ fontSize: 12.5, padding: "5px 10px" }} onClick={() => setValorDe(null)}>Cancelar</button>
              </div>
            )}
            {capiMsg && <div className="pausa-ia-nota etq-capi-msg">{capiMsg}</div>}
          </div>
          {erro && <div className="pausa-ia-nota" style={{ color: "var(--crit)" }}>{erro}</div>}
        </div>
      )}
    </div>
  );
}
