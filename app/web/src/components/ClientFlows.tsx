"use client";

import { useEffect, useState } from "react";
import { jget, jsend, type Automation } from "@/lib/client";

// Respostas automáticas do CLIENTE (escopadas por sessão via /api/app/automations).
// Modelo simples pra dono de negócio: "quando alguém mandar PALAVRA, responder TEXTO". Cada regra é um
// fluxo de gatilho keyword com um passo de texto — casa com o motor de keyword (dispara no inbound LITE).
// O canvas visual completo (mídia, ramificação, agente IA) é um passo futuro escopado pro cliente.

interface Rule { id: string; keyword: string; text: string; enabled: boolean }

function toRule(a: Automation): Rule | null {
  if (a.trigger !== "keyword") return null;
  const step = a.steps.find((s) => s.type === "text") as { type: "text"; text: string } | undefined;
  return { id: a.id, keyword: a.keyword ?? "", text: step?.text ?? "", enabled: a.enabled !== false };
}
function toAutomation(r: Rule, prev?: Automation): Automation {
  return {
    id: r.id,
    name: r.keyword ? `Resposta: ${r.keyword}` : "Resposta automática",
    trigger: "keyword",
    keyword: r.keyword.trim(),
    keywordMatch: "contains", // dispara quando a palavra APARECE na mensagem (ex.: "preciso de guincho")
    platforms: ["*"],
    steps: [{ type: "text", text: r.text }],
    enabled: r.enabled,
    updatedAt: new Date().toISOString(),
    ...(prev?.layout ? { layout: prev.layout } : {}),
  };
}

export function ClientFlows() {
  const [autos, setAutos] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const load = () => jget("/api/app/automations").then((d) => setAutos(d.automations ?? [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  // Só as regras simples (keyword+texto) aparecem aqui. Fluxos complexos (se houver) ficam preservados no PUT.
  const rules: Rule[] = (autos ?? []).map(toRule).filter((r): r is Rule => r !== null);

  async function persist(nextAutos: Automation[]) {
    setStatus("salvando…"); setErr("");
    try {
      const r = await jsend("/api/app/automations", "PUT", { automations: nextAutos });
      setAutos(r.automations ?? nextAutos);
      setStatus("salvo!"); setTimeout(() => setStatus(""), 2000);
    } catch (e: any) { setErr(e.message); setStatus(""); }
  }

  async function saveRule(r: Rule) {
    if (!r.keyword.trim()) { setErr("Escreva a palavra que dispara a resposta."); return; }
    if (!r.text.trim()) { setErr("Escreva a resposta."); return; }
    const list = autos ?? [];
    const prev = list.find((a) => a.id === r.id);
    const next = prev ? list.map((a) => (a.id === r.id ? toAutomation(r, a) : a)) : [...list, toAutomation(r)];
    setEditing(null);
    await persist(next);
  }
  async function toggle(id: string, enabled: boolean) {
    await persist((autos ?? []).map((a) => (a.id === id ? { ...a, enabled } : a)));
  }
  async function remove(id: string) {
    if (!window.confirm("Apagar esta resposta automática?")) return;
    await persist((autos ?? []).filter((a) => a.id !== id));
  }

  if (autos === null) return <div className="muted" style={{ textAlign: "center", padding: 30 }}>Carregando…</div>;

  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Respostas automáticas</h1>
          <div className="muted" style={{ fontSize: 13 }}>Quando alguém te mandar uma palavra, o WhatsApp responde sozinho.</div>
        </div>
        <button className="btn primary" onClick={() => { setErr(""); setEditing({ id: "regra-" + Date.now(), keyword: "", text: "", enabled: true }); }}>+ Nova</button>
      </div>
      {status && <div style={{ fontSize: 12.5, color: "var(--accent-deep)", fontWeight: 600, margin: "4px 0" }}>{status}</div>}
      {err && <div style={{ fontSize: 12.5, color: "var(--crit)", margin: "4px 0" }}>{err}</div>}

      {rules.length === 0 && !editing && (
        <div className="client-card" style={{ textAlign: "center", padding: 26, marginTop: 10 }}>
          <div style={{ fontSize: 32 }}>⚡</div>
          <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            Nenhuma resposta ainda. Crie a primeira — ex.: quando mandarem <b>“preço”</b>, responder sua tabela.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {rules.map((r) => (
          <div key={r.id} className="client-card" style={{ padding: 14, opacity: r.enabled ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Palavra: <span style={{ color: "var(--accent)" }}>{r.keyword}</span></div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>→ {r.text}</div>
              </div>
              <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={r.enabled} onChange={(e) => toggle(r.id, e.target.checked)} />
                {r.enabled ? "ativa" : "off"}
              </label>
              <button className="btn" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => { setErr(""); setEditing(r); }}>Editar</button>
              <button className="btn" style={{ padding: "5px 10px", fontSize: 12.5, color: "var(--crit)" }} onClick={() => remove(r.id)}>Apagar</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Resposta automática</h3>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Quando alguém mandar esta palavra:</label>
            <input className="inp" placeholder="ex.: preço, orçamento, horário…" value={editing.keyword} onChange={(e) => setEditing({ ...editing, keyword: e.target.value })} />
            <label style={{ fontSize: 13, fontWeight: 600, marginTop: 10, display: "block" }}>Responder com:</label>
            <textarea className="inp" rows={4} placeholder="Escreva a resposta que o cliente vai receber…" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" onClick={() => saveRule(editing)}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
