"use client";

// Cupons de teste: crie um código, mande pro lead e ele libera X dias de teste
// (no cadastro ou no popup do paywall). Link direto: /cadastro?cupom=CODIGO
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

interface Coupon {
  code: string; trial_days: number; max_uses: number | null; uses: number;
  expires_at: string | null; active: boolean; created_at: string;
}

export function CouponsView() {
  const [list, setList] = useState<Coupon[] | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [code, setCode] = useState("");
  const [days, setDays] = useState(3);
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");

  const load = () => fetch("/api/saas/coupons").then((r) => r.json()).then((d) => setList(d.coupons ?? [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create() {
    setErr(""); setOk("");
    try {
      const r = await fetch("/api/saas/coupons", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, trial_days: days, max_uses: maxUses || null, expires_at: expires || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d?.error || "Falha ao criar"); return; }
      setOk(`Cupom ${code.toUpperCase()} criado! Link: painel.seudominio.com.br/cadastro?cupom=${code.toUpperCase()}`);
      setCode(""); setMaxUses(""); setExpires("");
      load();
    } catch { setErr("Falha de rede"); }
  }

  if (!list) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div className="card-pad">
          <h2 style={{ margin: 0 }}><Icon name="ticket" size={20} className="ico-txt-i" /> Cupons de teste</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Crie um código, mande pro lead e ele libera dias de teste na hora — no cadastro ou dentro do painel.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>Código</label>
            <input className="inp" placeholder="TESTE3" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label>Dias de teste</label>
            <input className="inp" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 3)} />
          </div>
          <div>
            <label>Limite de usos (vazio = ilimitado)</label>
            <input className="inp" placeholder="ex.: 100" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label>Validade (vazio = sem validade)</label>
            <input className="inp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn ic" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={create} disabled={!code.trim()}><Icon name="plus" size={15} /> Criar cupom</button>
            {ok && <span style={{ color: "var(--accent)", fontSize: 13 }}>{ok}</span>}
            {err && <span style={{ color: "var(--crit)", fontSize: 13 }}>{err}</span>}
          </div>
        </div>
      </div>

      {list.length === 0 && <div className="card"><div className="card-pad muted">Nenhum cupom ainda.</div></div>}
      {list.map((c) => {
        const vencido = c.expires_at && new Date(c.expires_at) < new Date();
        const esgotado = c.max_uses != null && c.uses >= c.max_uses;
        return (
          <div key={c.code} className="card" style={{ opacity: c.active ? 1 : 0.55 }}>
            <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ fontFamily: "monospace", fontSize: 16 }}>{c.code}</b>
                  <span className="aff-badge">{c.trial_days} dia{c.trial_days === 1 ? "" : "s"}</span>
                  {vencido && <span className="aff-badge pendente">vencido</span>}
                  {esgotado && <span className="aff-badge pendente">esgotado</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {c.uses}{c.max_uses != null ? `/${c.max_uses}` : ""} uso(s)
                  {" · "}{c.expires_at ? `vale até ${new Date(c.expires_at).toLocaleDateString("pt-BR")}` : "sem validade"}
                  {" · "}criado {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <button
                className="btn ic"
                title="Copiar link de cadastro com o cupom"
                onClick={() => navigator.clipboard.writeText(`https://painel.seudominio.com.br/cadastro?cupom=${c.code}`).catch(() => {})}
              ><Icon name="link" size={15} /> Copiar link</button>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={c.active}
                  onChange={(e) => fetch("/api/saas/coupons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c.code, active: e.target.checked }) }).then(load)}
                />
                {c.active ? "Ativo" : "Inativo"}
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
