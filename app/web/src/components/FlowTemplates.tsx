"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { jget, jsend, TRIGGERS, type Automation, type Step } from "@/lib/client";
import { FLOW_TEMPLATES, TEMPLATE_CATEGORIES, type FlowTemplate } from "@/lib/flow-templates";

// Valores de exemplo pra a prévia ficar realista (sem variável crua).
const SAMPLE: Record<string, string> = {
  "{{nome}}": "Ana Souza",
  "{{primeiro_nome}}": "Ana",
  "{{produto}}": "seu produto",
  "{{valor}}": "R$ 97,00",
  "{{link}}": "seu-link.com/oferta",
  "{{pix}}": "00020126…PIX",
};
function sample(text: string): string {
  let s = text;
  for (const [k, v] of Object.entries(SAMPLE)) s = s.split(k).join(v);
  return s;
}

// Um passo vira um "balão" de conversa (prévia visual do fluxo). Reusado no simulador.
export function StepBubble({ s }: { s: Step }) {
  switch (s.type) {
    case "presence":
      return null; // "digitando…" não é mensagem
    case "wait":
      return <div className="tpl-wait">⏳ espera {Math.round((s.ms || 0) / 1000)}s</div>;
    case "text":
      return <div className="tpl-bubble">{sample(s.text)}</div>;
    case "ptt":
      return <div className="tpl-bubble media">🎤 <span>Áudio de voz</span></div>;
    case "ptv":
      return <div className="tpl-ptv" title="Vídeo bolinha">🎥</div>;
    case "media":
      return (
        <div className="tpl-bubble" style={{ padding: 6 }}>
          <div className="tpl-imgph">
            {s.mediaType === "image" ? "🖼️ Imagem" : "📎 " + s.mediaType}
            {s.file.includes("{{") ? " · com o nome do lead" : ""}
          </div>
          {s.caption && <div style={{ marginTop: 5, padding: "0 4px" }}>{sample(s.caption)}</div>}
        </div>
      );
    case "add_to_group":
      return <div className="tpl-sys">➕ adiciona a pessoa ao grupo</div>;
    case "payment_check":
      return (
        <div className="tpl-sys">
          💳 consulta se pagou {s.produto ? <b>{s.produto}</b> : "qualquer produto"} — segue por <b>Pagou</b> ou <b>Não pagou</b>
        </div>
      );
    case "bloquear":
      return <div className="tpl-sys">🚫 bloqueia o contato (nenhum fluxo fala com ele de novo) · {(s.tags || []).filter(Boolean).join(", ") || "Contato bloqueado"}</div>;
    case "notify":
      return <div className="tpl-sys">🔔 avisa {s.targets.filter(Boolean).length} destino(s) (equipe) — segue o fluxo</div>;
    case "tag":
      return <div className="tpl-sys">🏷️ etiqueta o contato: {(s.tags || []).filter(Boolean).join(", ") || "(sem etiqueta)"} — segue o fluxo</div>;
    case "buttons":
      return (
        <div className="tpl-bubble" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "8px 11px" }}>{sample(s.text)}</div>
          <div className="tpl-btns">
            {s.buttons.filter(Boolean).map((b, i) => <span key={i} className="tpl-btn">{sample(b)}</span>)}
          </div>
        </div>
      );
    case "mention_all":
      return <div className="tpl-bubble">{sample(s.text)} <span className="muted">· marca todos</span></div>;
    case "ask":
      return (
        <div className="tpl-bubble">
          {sample(s.text)} <span className="muted">· ⏸️ espera a resposta e a IA salva em {`{{${s.variable || "?"}}}`}</span>
        </div>
      );
    case "ai_agent":
      return (
        <div className="tpl-bubble">
          🤖 <b>Agente IA</b> conversa com o lead (até {s.maxTurns ?? 6} turnos) e escolhe o caminho:
          <span className="muted"> {s.paths.filter((p) => p.name.trim()).map((p) => p.name).join(" · ") || "(sem caminhos)"}</span>
        </div>
      );
    case "reminder":
      return (
        <div className="tpl-bubble">
          {sample(s.text || "Ok! Estou na escuta do lembrete. Manda em áudio ou texto.")} <span className="muted">· ⏸️ fica na escuta e a IA agenda um Lembrete (dia, hora e pra quem)</span>
        </div>
      );
    case "template": {
      // O simulador mostra o TEMPLATE DE VERDADE (o retrato salvo pelo editor): mídia do topo,
      // corpo com as variáveis {{n}} preenchidas pelos valores do passo (e {{nome}}/{{pix}}… de
      // exemplo), rodapé e botões. Sem retrato (passo antigo, salvo antes do mock) → cartão de nome.
      const mk = (s as any).mock as { body?: string; footer?: string; header?: { formato: string; url?: string }; botoes?: Array<{ texto: string; tipo: string }> } | undefined;
      if (!mk?.body && !mk?.header) {
        return (
          <div className="tpl-bubble">
            📋 <b>Template</b> {s.templateName ? <code>{s.templateName}</code> : <span className="muted">(não escolhido)</span>} <span className="muted">· API Oficial, fora da janela de 24h</span>
          </div>
        );
      }
      const params = s.params ?? [];
      // Igual ao nó: o arquivo escolhido no passo vence a mídia de exemplo do template.
      const midiaUrl = String((s as any).headerUrl || mk.header?.url || "");
      const corpo = sample(String(mk.body ?? "").replace(/\{\{(\d+)\}\}/g, (_m, i) => (params[Number(i) - 1] || "").trim() || `{{${i}}}`));
      return (
        <div className="tpl-bubble" style={{ padding: 0, overflow: "hidden" }}>
          {mk.header?.formato === "IMAGE" && midiaUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={midiaUrl} alt="" style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, objectFit: "contain" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
          {mk.header?.formato === "VIDEO" && (
            midiaUrl
              ? <video src={midiaUrl + "#t=0.1"} controls muted playsInline preload="metadata" style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, background: "#000" }} />
              : <div className="tpl-imgph">🎥 Vídeo do topo</div>
          )}
          {mk.header?.formato === "DOCUMENT" && <div className="tpl-imgph">📎 Documento</div>}
          <div style={{ padding: "8px 11px", whiteSpace: "pre-wrap" }}>{corpo}</div>
          {mk.footer && <div className="muted" style={{ padding: "0 11px 7px", fontSize: 11.5 }}>{mk.footer}</div>}
          {(mk.botoes ?? []).length > 0 && (
            <div className="tpl-btns">
              {(mk.botoes ?? []).map((b, i) => (
                <span key={i} className="tpl-btn">
                  {b.tipo === "url" ? "↗ " : b.tipo === "telefone" ? "☎ " : b.tipo === "copiar" ? "⧉ " : ""}{b.texto}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function download(t: FlowTemplate) {
  const data = { name: t.name, trigger: t.trigger, steps: t.steps };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.id}.template.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FlowTemplates({ onUse, busy }: { onUse: (t: FlowTemplate) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [preview, setPreview] = useState<FlowTemplate | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FLOW_TEMPLATES.filter((t) => {
      if (chip && !t.tags.includes(chip)) return false;
      if (!needle) return true;
      return (t.name + " " + t.desc + " " + t.tags.join(" ")).toLowerCase().includes(needle);
    });
  }, [q, chip]);

  const ptr = preview ? TRIGGERS[preview.trigger] ?? { emoji: "•", label: preview.trigger } : null;

  return (
    <>
      <input
        className="inp"
        style={{ marginBottom: 12 }}
        placeholder="Buscar modelo (ex.: PIX, PTV, nome, carrinho)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tpl-chips">
        <button className={"tpl-chip" + (chip === null ? " on" : "")} onClick={() => setChip(null)}>Todos</button>
        {TEMPLATE_CATEGORIES.map((c) => (
          <button key={c} className={"tpl-chip" + (chip === c ? " on" : "")} onClick={() => setChip(chip === c ? null : c)}>{c}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card"><div className="card-pad muted">Nenhum modelo pra esse filtro.</div></div>
      ) : (
        <div className="auto-grid">
          {list.map((t) => {
            const tr = TRIGGERS[t.trigger] ?? { label: t.trigger, emoji: "•" };
            return (
              <div key={t.id} className="card auto-card">
                <div className="auto-top">
                  <div className="auto-ico b-violet">{t.emoji}</div>
                  <span className="pill">{t.steps.length} passo(s)</span>
                </div>
                <div className="auto-title">{t.name}</div>
                <div className="auto-desc">{t.desc}</div>
                <div className="tpl-tags" style={{ marginTop: 8 }}>
                  <span className="tpl-tag">{tr.emoji} {tr.label}</span>
                  {t.tags.map((tag) => <span key={tag} className="tpl-tag">{tag}</span>)}
                </div>
                <div className="tpl-actions">
                  <button className="btn primary" onClick={() => onUse(t)} disabled={busy}>Usar este modelo</button>
                  <button className="btn" onClick={() => setPreview(t)}>Ver prévia</button>
                  <button className="btn" onClick={() => download(t)} title="Baixar .json">Baixar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preview && ptr && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div className="auto-ico b-violet" style={{ width: 34, height: 34, fontSize: 18 }}>{preview.emoji}</div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 15.5 }}>{preview.name}</h3>
                <div className="muted" style={{ fontSize: 12 }}>{preview.desc}</div>
              </div>
            </div>

            {/* prévia visual: como a conversa chega pro lead */}
            <div className="tpl-chat">
              <div className="tpl-chat-head">Quando: <b>{ptr.emoji} {ptr.label}</b> → a pessoa recebe:</div>
              <div className="tpl-chat-body">
                {preview.steps.map((s, i) => <StepBubble key={i} s={s} />)}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>Prévia ilustrativa (nomes/valores são exemplo). Vídeo/áudio você anexa no builder.</div>

            {/* Este pop-up não tinha NENHUMA saída além de clicar fora. Como clicar fora deixou de
                fechar (pra não perder trabalho em edição), sem este "Fechar" ele viraria uma
                armadilha sem porta. */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setPreview(null)}>Fechar</button>
              <button className="btn" onClick={() => download(preview)}>Baixar</button>
              <button className="btn primary" onClick={() => { const t = preview; setPreview(null); onUse(t); }} disabled={busy}>Usar este modelo</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Página de Templates (sub-aba): carrega os fluxos atuais e cria um novo a partir do modelo.
export function FlowTemplatesView() {
  const router = useRouter();
  const [autos, setAutos] = useState<Automation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    jget("/api/automations").then((d) => setAutos(d.automations ?? [])).catch((e) => setErr(e.message));
  }, []);

  async function usar(t: FlowTemplate) {
    if (!autos || busy) return;
    setBusy(true);
    const id = "fluxo-" + Date.now();
    const nova: Automation = { id, name: t.name, trigger: t.trigger, ...(t.keyword ? { keyword: t.keyword } : {}), platforms: ["*"], steps: t.steps, ...(t.edges ? { edges: t.edges } : {}), ...(t.layout ? { layout: t.layout } : {}), enabled: false, updatedAt: new Date().toISOString() };
    try {
      await jsend("/api/automations", "PUT", { automations: [...autos, nova] });
      router.push(`/fluxos/${encodeURIComponent(id)}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  return <FlowTemplates onUse={usar} busy={busy || !autos} />;
}
