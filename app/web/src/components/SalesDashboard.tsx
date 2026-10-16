"use client";

// Dashboard de vendas & ganhos (admin). Alimentado pelo webhook da Kiwify (tabela sales):
// bruto, taxa Kiwify, SEUS ganhos (my_commission) e quanto foi pago aos afiliados — por período.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";

const brl = (n: unknown) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: "hoje", label: "Hoje", days: 0 },
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "tudo", label: "Tudo", days: null },
];

interface Summary {
  totals: { vendas: number; bruto: number; taxa_kiwify: number; meus_ganhos: number; pago_afiliados: number; vendas_afiliado: number };
  byPlan: { plan: string; vendas: number; bruto: number; meus_ganhos: number; pago_afiliados: number }[];
  recent: { order_id: string; plan: string | null; plan_name: string | null; gross: number; kiwify_fee: number; producer_net: number; affiliate_name: string | null; affiliate_commission: number; buyer_email: string | null; status: string; created_at: string; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null }[];
}

const PLAN_LABEL: Record<string, string> = { start: "Start", pro: "Profissional", escala: "Escala", "—": "—" };

export function SalesDashboard() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null);

  // Reseta a senha do cliente e mostra a nova (pro dono repassar). Rede de segurança do onboarding.
  async function resetAccess(email: string | null) {
    if (!email || resetting) return;
    if (!confirm(`Gerar uma NOVA senha para ${email}? A senha atual dele deixa de valer.`)) return;
    setResetting(email); setResetInfo(null);
    try {
      const r = await fetch("/api/accounts/set-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.password) setResetInfo({ email, password: d.password });
      else setErr(d.error || "Falha ao resetar (o cliente tem conta?)");
    } catch { setErr("Falha de rede ao resetar"); }
    finally { setResetting(null); }
  }

  const since = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period)!;
    if (p.days == null) return "";
    const d = new Date();
    if (p.days === 0) d.setHours(0, 0, 0, 0);
    else d.setDate(d.getDate() - p.days);
    return d.toISOString();
  }, [period]);

  useEffect(() => {
    setLoading(true); setErr("");
    fetch("/api/saas/sales-summary" + (since ? `?since=${encodeURIComponent(since)}` : ""))
      .then((r) => r.json())
      .then((d) => { if (d?.error) setErr(d.error); else setData(d); })
      .catch(() => setErr("Falha ao carregar"))
      .finally(() => setLoading(false));
  }, [since]);

  const t = data?.totals;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div className="card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}><Icon name="money" size={20} className="ico-txt-i" /> Vendas & Ganhos</h2>
            <div className="muted" style={{ fontSize: 13 }}>Seus ganhos líquidos e o que foi pago aos afiliados — direto do webhook da Kiwify.</div>
          </div>
          <div className="seg" style={{ marginLeft: "auto" }}>
            {PERIODS.map((p) => (
              <button key={p.key} className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {err && <div className="card"><div className="card-pad" style={{ color: "var(--crit)" }}>{err}</div></div>}
      {loading && !data && <div className="card"><div className="card-pad muted">Carregando…</div></div>}

      {t && (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Bruto vendido</div>
              <div className="kpi-value">{brl(t.bruto)}</div>
              <div className="kpi-sub">{t.vendas} venda{t.vendas === 1 ? "" : "s"}</div>
            </div>
            <div className="kpi accent">
              <div className="kpi-label">Seus ganhos (líquido)</div>
              <div className="kpi-value">{brl(t.meus_ganhos)}</div>
              <div className="kpi-sub">o que cai pra você</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Pago aos afiliados</div>
              <div className="kpi-value">{brl(t.pago_afiliados)}</div>
              <div className="kpi-sub">{t.vendas_afiliado} venda{t.vendas_afiliado === 1 ? "" : "s"} por afiliado</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Taxa Kiwify</div>
              <div className="kpi-value">{brl(t.taxa_kiwify)}</div>
              <div className="kpi-sub">retido pela plataforma</div>
            </div>
          </div>

          {data!.byPlan.length > 0 && (
            <div className="card">
              <div className="card-pad">
                <h3 style={{ marginTop: 0 }}>Por plano</h3>
                <table className="aff-table">
                  <thead><tr><th>Plano</th><th>Vendas</th><th>Bruto</th><th>Seus ganhos</th><th>Pago afiliados</th></tr></thead>
                  <tbody>
                    {data!.byPlan.map((p) => (
                      <tr key={p.plan}>
                        <td>{PLAN_LABEL[p.plan] ?? p.plan}</td>
                        <td>{p.vendas}</td>
                        <td>{brl(p.bruto)}</td>
                        <td style={{ fontWeight: 700, color: "var(--accent)" }}>{brl(p.meus_ganhos)}</td>
                        <td>{brl(p.pago_afiliados)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-pad">
              <h3 style={{ marginTop: 0 }}>Últimas vendas</h3>
              {resetInfo && (
                <div className="reset-banner">
                  🔑 Nova senha de <b>{resetInfo.email}</b>: <code>{resetInfo.password}</code> — copie e repasse ao cliente (o link é <b>painel.seudominio.com.br/entrar</b>).
                  <button className="btn" style={{ marginLeft: 10, padding: "2px 9px", fontSize: 12 }} onClick={() => setResetInfo(null)}>OK</button>
                </div>
              )}
              {data!.recent.length === 0 ? (
                <div className="muted">Nenhuma venda aprovada ainda. Quando uma compra for aprovada na Kiwify, aparece aqui com o detalhamento. <br />(PIX gerado ainda não é venda — só entra quando o pagamento é aprovado.)</div>
              ) : (
                <table className="aff-table">
                  <thead><tr><th>Quando</th><th>Plano</th><th>Bruto</th><th>Seus ganhos</th><th>Afiliado</th><th>Comissão</th><th>Origem</th><th /></tr></thead>
                  <tbody>
                    {data!.recent.map((s) => {
                      const utm = [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" · ");
                      const utmFull = [
                        s.utm_source && `source: ${s.utm_source}`, s.utm_medium && `medium: ${s.utm_medium}`,
                        s.utm_campaign && `campaign: ${s.utm_campaign}`, s.utm_content && `content: ${s.utm_content}`,
                      ].filter(Boolean).join("\n");
                      return (
                      <tr key={s.order_id} style={{ opacity: s.status === "estornada" ? 0.5 : 1 }}>
                        <td>{dt(s.created_at)}</td>
                        <td>{s.plan_name || PLAN_LABEL[s.plan ?? "—"] || "—"}</td>
                        <td>{brl(s.gross)}</td>
                        <td style={{ fontWeight: 700 }}>{brl(s.producer_net)}</td>
                        <td>{s.affiliate_name || <span className="muted">direto</span>}</td>
                        <td>{s.affiliate_commission > 0 ? brl(s.affiliate_commission) : "—"}</td>
                        <td>{utm ? <span className="utm-chip" title={utmFull}>{utm}</span> : <span className="muted">—</span>}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {s.status === "estornada" && <span className="aff-badge pendente">estornada</span>}
                          {s.buyer_email && s.status !== "estornada" && (
                            <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={resetting === s.buyer_email}
                              onClick={() => resetAccess(s.buyer_email)} title={`Gerar nova senha para ${s.buyer_email}`}>
                              {resetting === s.buyer_email ? "…" : "🔑 acesso"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
