"use client";

// Afiliados do ZapConverte: Gestão / Remunerações / Ranking & Premiação.
// Modelo: afiliado tem link de indicação (?ref=CODIGO no /cadastro); venda na Kiwify de um
// indicado gera comissão automática (% configurável). "Liberar trial" estende o teste por e-mail.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

interface Affiliate {
  id: string; name: string; email: string | null; phone: string | null; instagram: string | null;
  kind: string; ref_code: string; commission_pct: string | number; active: boolean; created_at: string;
  accumulated: string | number; pending: string | number;
  sales_count?: string | number; canceled_count?: string | number;
  promo_slug?: string | null; trial_leads?: string | number; // página de afiliado dele + leads de teste
  // Carteira que ele trouxe (workspaces.referred_by) — mrr = soma dos planos ativos (preço mensal)
  clientes_ativos?: number; clientes_inadimplentes?: number; clientes_inativos?: number; mrr?: number;
}
interface Commission {
  id: string; affiliate_id: string; affiliate_name: string | null; amount: string | number;
  sale_amount: string | number | null; plan: string | null; status: string; created_at: string; paid_at: string | null;
}

const brl = (n: unknown) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

// Recrutamento é 100% pela Kiwify: o afiliado se cadastra por este link e a Kiwify paga a comissão.
// Nosso painel só METRIFICA as vendas (alimentado pelo webhook) pra ranking e premiação.
const KIWIFY_AFFILIATE_JOIN = "https://dashboard.kiwify.com/join/affiliate/51lFnv0D";
const LANDING_AFILIADOS = "https://seudominio.com.br/afiliados.html";

async function api(method: string, body?: unknown) {
  const r = await fetch("/api/saas/affiliates", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d;
}

export function AffiliatesView() {
  const [tab, setTab] = useState<"gestao" | "remuneracoes" | "ranking">("gestao");
  const [list, setList] = useState<Affiliate[] | null>(null);
  const [comms, setComms] = useState<Commission[] | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<Partial<Affiliate> | null>(null);
  const [granting, setGranting] = useState<Affiliate | null>(null);
  const [q, setQ] = useState("");
  const [openSales, setOpenSales] = useState<string | null>(null); // id do afiliado com as vendas abertas

  const load = () => {
    api("GET").then((d) => setList(d.affiliates ?? [])).catch((e) => setErr(e.message));
    fetch("/api/saas/commissions").then((r) => r.json()).then((d) => setComms(d.commissions ?? [])).catch(() => {});
  };
  useEffect(load, []);

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!list) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  const term = q.trim().toLowerCase();
  const filtered = list.filter((a) => (a.name + " " + (a.email ?? "") + " " + (a.instagram ?? "")).toLowerCase().includes(term));
  const ranked = [...list].sort((a, b) => Number(b.accumulated) - Number(a.accumulated));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div className="card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}><Icon name="handshake" size={20} className="ico-txt-i" /> Afiliados</h2>
            <div className="muted" style={{ fontSize: 13 }}>Quem vende a assinatura por você: gestão, remunerações e ranking.</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            {tab === "gestao" && (
              <button className="btn ic" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => setEditing({ kind: "afiliado", commission_pct: 30 })}><Icon name="plus" size={15} /> Novo afiliado</button>
            )}
          </div>
        </div>
        <div className="card-pad" style={{ borderTop: "1px solid var(--line-2)", paddingTop: 10, paddingBottom: 10 }}>
          <div className="aff-tabs">
            {([["gestao", "group", "Gestão"], ["remuneracoes", "file", "Remunerações"], ["ranking", "trophy", "Ranking & Premiação"]] as const).map(([k, icon, label]) => (
              <button key={k} className={"aff-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name={icon} size={14} /> {label}</button>
            ))}
          </div>
        </div>
      </div>

      {tab === "gestao" && (
        <>
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <b className="ico-txt"><Icon name="link" size={15} /> Link de recrutamento (Kiwify)</b>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  O afiliado se cadastra pela Kiwify e recebe a comissão por lá; aqui a gente mede as vendas pra ranking e premiação. Quem gera a página de vendas no nosso site (ou pede os 30 dias pelo popup) entra nesta lista na hora — quem se cadastra SÓ na Kiwify aparece na primeira venda, que é quando ela nos avisa.
                </div>
                <code style={{ fontSize: 12, wordBreak: "break-all" }}>{KIWIFY_AFFILIATE_JOIN}</code>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => navigator.clipboard.writeText(KIWIFY_AFFILIATE_JOIN).catch(() => {})}>Copiar link Kiwify</button>
                <a className="btn" href={LANDING_AFILIADOS} target="_blank" rel="noreferrer">Abrir página de vendas</a>
              </div>
            </div>
          </div>
          <input className="inp" placeholder="Buscar por nome, e-mail ou @…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length === 0 && (
            <div className="card"><div className="card-pad muted">Nenhum afiliado ainda. Cadastre o primeiro — o link dele é <code>painel.seudominio.com.br/cadastro?ref=CODIGO</code>.</div></div>
          )}
          {filtered.map((a) => (
            <div key={a.id} className="card" style={{ opacity: a.active ? 1 : 0.55 }}>
              <div className="card-pad" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div className="aff-ava">{(a.name || "?").slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{a.name}</b>
                    <span className={"aff-badge" + (a.kind === "parceiro" ? " parceiro" : "")}>{a.kind === "parceiro" ? "Parceiro" : "Afiliado"}</span>
                    <span className="aff-badge ref" title="Código de indicação">ref: {a.ref_code}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{a.email || "—"}</div>
                  <div className="muted" style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
                    {a.phone && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="phone" size={12} /> {a.phone}</span>}
                    {a.instagram && <a href={`https://instagram.com/${a.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">📷 @{a.instagram.replace(/^@/, "")}</a>}
                    <span>{Number(a.commission_pct)}% de comissão</span>
                    {a.promo_slug && (
                      <a href={`https://seudominio.com.br/promo/${a.promo_slug}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="link" size={12} /> Página do afiliado
                      </a>
                    )}
                    {Number(a.trial_leads) > 0 && <span>{Number(a.trial_leads)} lead(s) de teste</span>}
                    {Number(a.accumulated) > 0 && <span style={{ color: "var(--accent)", fontWeight: 700 }}>{brl(a.accumulated)} acumulado</span>}
                    {!Number(a.sales_count) && <span className="aff-badge">sem venda ainda</span>}
                    <span>desde {dt(a.created_at)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" checked={a.active} onChange={(e) => api("POST", { action: "toggle", id: a.id, active: e.target.checked }).then(load)} />
                    {a.active ? "Ativo" : "Inativo"}
                  </label>
                  <button className="btn ic" onClick={() => setEditing(a)}><Icon name="edit" size={15} /> Editar</button>
                  <button className="btn ic" onClick={() => setGranting(a)}><Icon name="ticket" size={15} /> Liberar trial</button>
                  <button className="btn" style={{ color: "var(--crit)" }} onClick={() => { if (confirm(`Remover ${a.name}?`)) api("POST", { action: "remove", id: a.id }).then(load); }}>Remover</button>
                </div>
              </div>
              {/* Placar da carteira dele: quem ele trouxe e quanto isso rende por mês */}
              <div className="card-pad" style={{ paddingTop: 0 }}>
                <div className="aff-stats">
                  <div className="aff-stat"><b style={{ color: "var(--accent)" }}>{Number(a.clientes_ativos ?? 0)}</b><span>ativos</span></div>
                  <div className="aff-stat"><b style={{ color: Number(a.clientes_inadimplentes) ? "var(--warn)" : undefined }}>{Number(a.clientes_inadimplentes ?? 0)}</b><span>inadimpl.</span></div>
                  <div className="aff-stat wide">
                    <span className="aff-stat-cap">recorrência/mês</span>
                    <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
                      <span><small>casa</small><br /><b>{brl(Number(a.mrr ?? 0) * (1 - Number(a.commission_pct) / 100))}</b></span>
                      <span><small>afiliado</small><br /><b style={{ color: "var(--accent)" }}>{brl(Number(a.mrr ?? 0) * (Number(a.commission_pct) / 100))}</b></span>
                    </div>
                  </div>
                  <div className="aff-stat"><b style={{ color: Number(a.trial_leads) ? "var(--violet)" : undefined }}>{Number(a.trial_leads ?? 0)}</b><span>leads teste</span></div>
                  <div className="aff-stat"><b>{Number(a.clientes_inativos ?? 0)}</b><span>inativos</span></div>
                </div>
                {Number(a.sales_count) > 0 && (
                  <button className="aff-vendas-toggle" onClick={() => setOpenSales(openSales === a.id ? null : a.id)}>
                    <Icon name="menu" size={14} />
                    {Number(a.sales_count)} venda{Number(a.sales_count) === 1 ? "" : "s"} · {brl(a.accumulated)} em comissão
                    <span className="muted">({openSales === a.id ? "fechar" : "ver"})</span>
                  </button>
                )}
                {openSales === a.id && (
                  <div className="aff-vendas">
                    {(comms ?? []).filter((c) => c.affiliate_id === a.id).length === 0 ? (
                      <div className="muted" style={{ fontSize: 12.5 }}>Carregando as vendas…</div>
                    ) : (comms ?? []).filter((c) => c.affiliate_id === a.id).map((c) => (
                      <div key={c.id} className="aff-venda">
                        <span>{dt(c.created_at)}</span>
                        <span>{c.plan || "—"}</span>
                        <span className="muted">venda {c.sale_amount ? brl(c.sale_amount) : "—"}</span>
                        <b style={{ color: c.status === "estornado" ? "var(--crit)" : "var(--accent)" }}>{brl(c.amount)}</b>
                        <span className={"tpl-status" + (c.status === "pago" ? " on" : "")}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "remuneracoes" && (
        <div className="card">
          <div className="card-pad">
            {!comms || comms.length === 0 ? (
              <div className="muted">Nenhuma comissão ainda. Quando uma venda de afiliado cair na Kiwify, o webhook registra aqui automaticamente (afiliado, valor e pedido).</div>
            ) : (
              <table className="aff-table">
                <thead><tr><th>Quando</th><th>Afiliado</th><th>Plano</th><th>Venda</th><th>Comissão</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {comms.map((c) => (
                    <tr key={c.id}>
                      <td>{dt(c.created_at)}</td>
                      <td>{c.affiliate_name ?? "—"}</td>
                      <td>{c.plan ?? "—"}</td>
                      <td>{c.sale_amount != null ? brl(c.sale_amount) : "—"}</td>
                      <td style={{ fontWeight: 700 }}>{brl(c.amount)}</td>
                      <td><span className={"aff-badge" + (c.status === "pago" ? " pago" : " pendente")}>{c.status}</span></td>
                      <td>{c.status === "pendente" && (
                        <button className="btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => fetch("/api/saas/commissions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id }) }).then(load)}>Marcar pago</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "ranking" && <RankingTab ranked={ranked} />}

      {editing && (
        <AffiliateModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => { await api("PUT", data); setEditing(null); load(); }}
        />
      )}
      {granting && (
        <GrantTrialModal
          affiliate={granting}
          onClose={() => setGranting(null)}
          onGrant={async (email, days) => {
            await api("POST", { action: "grant-trial", email, days, affiliateId: granting.id });
            setGranting(null);
            alert(`Teste liberado por ${days} dia(s) pra ${email} ✅`);
          }}
        />
      )}
    </div>
  );
}

// ── Ranking & Premiação (visual de pódio) ────────────────────────────────────
const initials = (s: string) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const cancelPct = (a: Affiliate) => {
  const sc = Number(a.sales_count || 0), cc = Number(a.canceled_count || 0);
  return sc > 0 ? (cc / sc) * 100 : 0;
};
// Ordem visual do pódio: 4º, 2º, 1º (centro), 3º, 5º — o campeão no meio e elevado.
const PODIUM_ORDER = [3, 1, 0, 2, 4];

function PodiumSpot({ a, rank }: { a: Affiliate; rank: number }) {
  const ig = a.instagram?.replace(/^@/, "");
  return (
    <div className={"pod-spot pod-r" + rank}>
      <div className="pod-person">
        <div className={"pod-ava" + (rank === 1 ? " champ" : "")}>
          {rank === 1 && <span className="pod-crown">👑</span>}
          {initials(a.name)}
        </div>
        <div className="pod-name" title={a.name}>{a.name}</div>
        {ig && <a className="pod-ig" href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer">@{ig}</a>}
        <div className="pod-subs"><b>{Number(a.sales_count || 0)}</b> assinaturas</div>
        <div className="pod-rev">{brl(a.accumulated)}</div>
        <div className="pod-canc">{cancelPct(a).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% canc.</div>
      </div>
      <div className={"pod-base" + (rank === 1 ? " champ" : "")}><span>{rank}º</span></div>
    </div>
  );
}

function RankingTab({ ranked }: { ranked: Affiliate[] }) {
  const [prizes, setPrizes] = useState<number[]>([]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ranking-prizes").then((r) => r.json()).then((d) => setPrizes(Array.isArray(d.prizes) ? d.prizes : [])).catch(() => {});
  }, []);

  const top = ranked.filter((a) => Number(a.accumulated) > 0 || Number(a.sales_count || 0) > 0).slice(0, 5);
  const podium = PODIUM_ORDER.filter((i) => i < top.length).map((i) => ({ a: top[i], rank: i + 1 }));

  async function savePrizes() {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await fetch("/api/ranking-prizes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ prizes: draft }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setPrizes(d.prizes ?? draft); setDraft(null); }
    } finally { setSaving(false); }
  }

  if (top.length === 0) {
    return (
      <div className="card"><div className="card-pad muted" style={{ textAlign: "center", padding: "28px 16px" }}>
        🏆 O ranking nasce com a primeira venda de afiliado. Assim que uma comissão cair, o pódio aparece aqui.
      </div></div>
    );
  }

  return (
    <div className="card">
      <div className="card-pad">
        <div className="pod-stage">
          {podium.map(({ a, rank }) => <PodiumSpot key={a.id} a={a} rank={rank} />)}
        </div>

        <div className="prizes-head">
          <b className="ico-txt"><Icon name="trophy" size={16} /> Premiação</b>
          {draft ? (
            <span style={{ display: "inline-flex", gap: 8 }}>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5, borderColor: "var(--accent)", color: "var(--accent)" }} disabled={saving} onClick={savePrizes}>{saving ? "…" : "Salvar"}</button>
            </span>
          ) : (
            <button className="btn ic" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => setDraft(prizes.length ? [...prizes] : [1000, 500, 200, 100, 100])}><Icon name="edit" size={13} /> Editar valores</button>
          )}
        </div>

        <div className="prizes-grid">
          {(draft ?? prizes).map((val, i) => {
            const winner = top[i];
            return (
              <div key={i} className={"prize-card" + (i === 0 ? " champ" : "")}>
                <div className="prize-medal">{i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎖️"}</div>
                <div className="prize-pos">{i + 1}º lugar</div>
                {draft ? (
                  <input className="inp prize-inp" type="number" min={0} value={draft[i]}
                    onChange={(e) => setDraft(draft.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
                ) : (
                  <div className="prize-val">{brl(val)}</div>
                )}
                <div className="prize-winner">{winner ? winner.name : "—"}</div>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Pódio por comissão acumulada (líquida de estornos). “% canc.” = assinaturas estornadas ÷ total do afiliado.
        </div>
      </div>
    </div>
  );
}

function AffiliateModal({ initial, onClose, onSave }: { initial: Partial<Affiliate>; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [d, setD] = useState<any>({ name: "", email: "", phone: "", instagram: "", kind: "afiliado", commission_pct: 30, ref_code: "", ...initial });
  const [err, setErr] = useState("");
  return (
    <div className="modal-overlay">
      <div className="aff-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial.id ? "Editar afiliado" : "Novo afiliado"}</h3>
        <label>Nome</label>
        <input className="inp" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <label>E-mail</label>
        <input className="inp" value={d.email ?? ""} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label>Telefone</label>
            <input className="inp" value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Instagram</label>
            <input className="inp" placeholder="@usuario" value={d.instagram ?? ""} onChange={(e) => setD({ ...d, instagram: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label>Tipo</label>
            <select className="inp" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>
              <option value="afiliado">Afiliado</option>
              <option value="parceiro">Parceiro</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Comissão (%)</label>
            <input className="inp" type="number" min={0} max={90} value={d.commission_pct} onChange={(e) => setD({ ...d, commission_pct: Number(e.target.value) })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Código ref (vazio = gera)</label>
            <input className="inp" value={d.ref_code ?? ""} onChange={(e) => setD({ ...d, ref_code: e.target.value.toUpperCase() })} />
          </div>
        </div>
        {err && <div style={{ color: "var(--crit)", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => onSave(d).catch((e) => setErr(e.message))}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function GrantTrialModal({ affiliate, onClose, onGrant }: { affiliate: Affiliate; onClose: () => void; onGrant: (email: string, days: number) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [dias, setDias] = useState(3);
  const [err, setErr] = useState("");
  return (
    <div className="modal-overlay">
      <div className="aff-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}><Icon name="ticket" size={18} className="ico-txt-i" /> Liberar teste (indicado de {affiliate.name})</h3>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          A pessoa precisa TER CONTA (cadastro em painel.seudominio.com.br/cadastro). O teste é estendido pelo e-mail — e a venda futura fica atribuída a {affiliate.name}.
        </div>
        <label>E-mail da conta</label>
        <input className="inp" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Dias de teste</label>
        <input className="inp" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value) || 3)} />
        {err && <div style={{ color: "var(--crit)", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} onClick={() => onGrant(email.trim(), dias).catch((e) => setErr(e.message))}>Liberar</button>
        </div>
      </div>
    </div>
  );
}
