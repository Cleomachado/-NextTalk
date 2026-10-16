"use client";

// Tela de Clientes (admin): todas as contas pagantes com o STATUS da assinatura derivado
// (ativo/trial/atrasado/cancelado/sem acesso) + ações (resetar senha, liberar dias).
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

interface Client {
  email: string;
  name: string;
  created_at: string;
  plan: string | null;
  status: string;
  paid_until: string | null;
  trial_ends_at: string | null;
  sales_count: number;
  last_sale: string | null;
  total_paid: string | number;
  sub_status: "ativo" | "trial" | "atrasado" | "cancelado" | "sem_acesso";
  // números conectados / instâncias (vem do /admin/clients enriquecido)
  lite_connected?: number;   // LITE (WhatsApp Business) online agora
  lite_total?: number;       // LITE provisionados (ocupam slot na UazAPI)
  api_connected?: boolean;   // API Oficial (Meta) conectada
  numbers_connected?: number;
  number_limit?: number;     // quantos números o plano dele permite
  numbers_used?: number;     // slots ocupados (provisionados)
  numbers_available?: number; // livres pra ele conectar
  phone?: string | null;     // telefone p/ chamar no WhatsApp (cadastro de trial ou número conectado)
  perfil?: string | null;    // perfil do negócio (ex.: "advocacia") — liga recursos do segmento
}

// Perfis de negócio que o super admin pode marcar. Cada um liga recursos do segmento no painel do
// cliente (advocacia → botão "Contrato e procuração" no chat + configuração da API de contratos).
const PERFIS: Array<{ id: string; label: string }> = [
  { id: "", label: "Geral" },
  { id: "advocacia", label: "Advocacia" },
];

const brl = (n: unknown) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

const STATUS: Record<Client["sub_status"], { label: string; cls: string }> = {
  ativo: { label: "Ativo", cls: "on" },
  trial: { label: "Teste", cls: "warn" },
  atrasado: { label: "Em atraso", cls: "crit" },
  cancelado: { label: "Cancelado", cls: "muted" },
  sem_acesso: { label: "Sem acesso", cls: "muted" },
};

export function Clients() {
  const [list, setList] = useState<Client[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Vincular um WhatsApp que está no painel do SUPER-ADMIN a este cliente (sequela do incidente
  // 16/08: cliente escaneava e a instância caía na conta do dono — caso de um cliente "0/1").
  const [vincularFor, setVincularFor] = useState<Client | null>(null);
  const [contasAdmin, setContasAdmin] = useState<Array<{ id: string; name: string; number?: string; alheia?: boolean; connected?: boolean }>>([]);
  const carregaContasAdmin = () =>
    fetch("/api/accounts", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setContasAdmin(((d.accounts ?? []) as any[]).filter((a) => a.type === "LITE" && String(a.id).startsWith("lite-"))))
      .catch(() => {});
  useEffect(() => { carregaContasAdmin(); }, []);
  // Recarrega a lista AO ABRIR o modal: no caso de um cliente (17/08), a lista carregada junto com a
  // página estava velha e o número da cliente não aparecia — o dono quase transferiu o errado.
  function abreVincular(c: Client) { carregaContasAdmin(); setVincularFor(c); }
  async function vincular(email: string, account: string) {
    setBusy(email); setNotice(null); setErr("");
    try {
      const r = await fetch("/api/clients/vincular-whats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, account }) });
      const dta = await r.json();
      if (r.ok) { setNotice(`WhatsApp vinculado a ${email} — a conta já aparece no painel do cliente.`); setVincularFor(null); load(); }
      else setErr(dta.error || "falha ao vincular");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  async function load() {
    try {
      const r = await fetch("/api/clients", { cache: "no-store" });
      const dta = await r.json();
      if (dta?.error) setErr(dta.error);
      else setList(dta.clients ?? []);
    } catch {
      setErr("Falha ao carregar");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function resetPass(email: string) {
    if (busy || !confirm(`Gerar uma NOVA senha para ${email}?`)) return;
    setBusy(email); setNotice(null);
    try {
      const r = await fetch("/api/accounts/set-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const dta = await r.json();
      if (r.ok && dta.password) setNotice(`🔑 Nova senha de ${email}: ${dta.password} — copie e repasse (link: painel.seudominio.com.br/entrar).`);
      else setErr(dta.error || "falha");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  async function grant(email: string) {
    const dias = Number(prompt(`Liberar quantos dias de cortesia para ${email}?`, "30"));
    if (!dias || dias < 1 || busy) return;
    setBusy(email); setNotice(null);
    try {
      const r = await fetch("/api/trial/grant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, days: dias }) });
      const dta = await r.json();
      if (r.ok) { setNotice(`✅ ${dias} dia(s) liberados para ${email}.`); load(); }
      else setErr(dta.error || "falha");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  async function disable2fa(email: string) {
    if (busy || !confirm(`Desligar a verificação em 2 fatores de ${email}? (use quando o cliente perdeu o celular)`)) return;
    setBusy(email); setNotice(null);
    try {
      const r = await fetch("/api/clients/disable-2fa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const dta = await r.json();
      if (r.ok) setNotice(`✅ 2FA desligado pra ${email} — ele já consegue entrar só com a senha (e pode reativar em Configurações).`);
      else setErr(dta.error || "falha");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  // 💳 Plano na mão — modal com plano + período + números + venda (PIX/transferência).
  const [planoFor, setPlanoFor] = useState<Client | null>(null);
  const [featuresFor, setFeaturesFor] = useState<Client | null>(null);

  async function setPerfil(c: Client, perfil: string) {
    if (busy) return;
    setBusy(c.email); setNotice(null);
    try {
      const r = await fetch("/api/clients/perfil", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: c.email, perfil: perfil || null }) });
      const dta = await r.json();
      if (r.ok) {
        setList((l) => l?.map((x) => (x.email === c.email ? { ...x, perfil: dta.perfil } : x)) ?? l);
        setNotice(dta.perfil === "advocacia"
          ? `${c.name || c.email} agora tem o perfil Advocacia: o botão "Contrato e procuração" aparece no chat depois que o endereço e o token da API de contratos forem salvos em Configurações.`
          : `${c.name || c.email} voltou ao perfil Geral.`);
      } else setErr(dta.error || "falha");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  async function setNumbers(email: string) {
    const n = Number(prompt(`Quantos números de WhatsApp ${email} pode conectar?`, "2"));
    if (!n || n < 1 || busy) return;
    setBusy(email); setNotice(null);
    try {
      const r = await fetch("/api/clients/number-limit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, limit: n }) });
      const dta = await r.json();
      if (r.ok) setNotice(`✅ ${email} agora pode conectar até ${dta.limit} número(s) — ele adiciona pelo "+" no painel dele.`);
      else setErr(dta.error || "falha");
    } catch { setErr("falha de rede"); } finally { setBusy(null); }
  }

  if (err) return <div className="card"><div className="card-pad"><b style={{ color: "var(--crit)" }}>{err}</b></div></div>;
  if (!list) return <div className="card"><div className="card-pad muted">Carregando…</div></div>;

  const totalConnected = list.reduce((s, c) => s + (c.numbers_connected ?? 0), 0);

  return (
    <div className="card">
      <div className="card-head"><h3>Clientes</h3><span className="page-hint">{list.length} conta(s){totalConnected > 0 && ` · ${totalConnected} WhatsApp${totalConnected > 1 ? "s" : ""} conectado${totalConnected > 1 ? "s" : ""}`}</span></div>
      {notice && <div className="reset-banner" style={{ margin: "0 16px 12px" }}>{notice} <button className="btn" style={{ marginLeft: 8, padding: "2px 9px", fontSize: 12 }} onClick={() => setNotice(null)}>OK</button></div>}
      {list.length === 0 ? (
        <div className="card-pad muted">Nenhum cliente ainda. Quando alguém comprar na Kiwify e criar a conta, aparece aqui.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="aff-table">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>WhatsApps conectados</th><th>Instâncias</th><th>Acesso até</th><th>Total pago</th><th>Ações</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const st = STATUS[c.sub_status];
                const until = c.paid_until || c.trial_ends_at;
                const dl = daysLeft(until);
                return (
                  <tr key={c.email}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name || "—"}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.email}</div>
                      <label className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3 }} title="Perfil do negócio: liga recursos do segmento (Advocacia = contrato e procuração no chat)">
                        Perfil
                        <select value={c.perfil ?? ""} disabled={busy === c.email} onChange={(e) => setPerfil(c, e.target.value)}
                          style={{ fontSize: 11, padding: "1px 4px", borderRadius: 6, border: "1px solid var(--line)", background: c.perfil ? "rgba(37,211,102,.12)" : "transparent", color: "inherit", fontWeight: c.perfil ? 600 : 400 }}>
                          {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </label>
                    </td>
                    <td>{c.plan || <span className="muted">—</span>}</td>
                    <td><span className={"tpl-status " + st.cls}>{st.label}</span>{c.sub_status === "atrasado" && <div className="muted" style={{ fontSize: 11 }}>não renovou</div>}</td>
                    <td>
                      {(() => {
                        const liteOn = c.lite_connected ?? 0, liteTotal = c.lite_total ?? 0, api = !!c.api_connected;
                        const pending = Math.max(0, liteTotal - liteOn);
                        if (!liteTotal && !api) return <span className="muted">—</span>;
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                            {liteOn > 0 && <span className="tpl-status on">💬 {liteOn} Business</span>}
                            {api && <span className="tpl-status" style={{ background: "rgba(42,169,224,.14)", color: "var(--info)" }}>◆ API Oficial</span>}
                            {pending > 0 && <span className="muted" style={{ fontSize: 11 }}>{pending} aguardando QR</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.numbers_used ?? 0}<span className="muted" style={{ fontWeight: 500 }}>/{c.number_limit ?? 1}</span></div>
                      {(c.numbers_available ?? 0) > 0
                        ? <div style={{ fontSize: 11, color: "var(--accent-deep)", fontWeight: 600 }}>{c.numbers_available} livre{(c.numbers_available ?? 0) > 1 ? "s" : ""}</div>
                        : <div className="muted" style={{ fontSize: 11 }}>cheio</div>}
                    </td>
                    <td>{d(until)}{dl != null && dl >= 0 && <div className="muted" style={{ fontSize: 11 }}>{dl} dia(s)</div>}{dl != null && dl < 0 && <div style={{ fontSize: 11, color: "var(--crit)" }}>venceu há {-dl}d</div>}</td>
                    <td>{brl(c.total_paid)}<div className="muted" style={{ fontSize: 11 }}>{c.sales_count} compra(s)</div></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {c.phone
                        ? <a className="btn" style={{ padding: "3px 9px", fontSize: 12, color: "#0A8F3C", borderColor: "rgba(37,211,102,.55)", textDecoration: "none" }}
                            href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá${c.name ? " " + c.name.split(" ")[0] : ""}! Aqui é da ZapConverte 👋`)}`}
                            target="_blank" rel="noopener" title={`Chamar ${c.name || "cliente"} no WhatsApp`}>💬</a>
                        : <button className="btn" style={{ padding: "3px 9px", fontSize: 12, opacity: .4 }} disabled title="Sem WhatsApp conectado nem telefone de cadastro pra este cliente">💬</button>}
                      {" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => resetPass(c.email)} title="Gerar nova senha">🔑</button>{" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => setPlanoFor(c)} title="Alterar plano / liberar assinatura paga">💳</button>{" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => grant(c.email)} title="Liberar dias de cortesia"><Icon name="wait" size={13} /></button>{" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => setNumbers(c.email)} title="Liberar mais números de WhatsApp">📱</button>{" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => disable2fa(c.email)} title="Desligar 2FA (cliente perdeu o celular)">🛡️✕</button>{" "}
                      <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => setFeaturesFor(c)}
                        title="Liberar recursos que precisam da sua aprovação (ex.: nó de código)"><Icon name="code" size={13} /></button>{" "}
                      {contasAdmin.length > 0 && (
                        <button className="btn" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy === c.email} onClick={() => abreVincular(c)}
                          title="Vincular a este cliente um WhatsApp que está no SEU painel (conserta conexão que caiu na conta errada)">
                          <Icon name="link" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {featuresFor && (
        <FeaturesModal
          cliente={featuresFor}
          onClose={() => setFeaturesFor(null)}
          onOk={(msg) => { setFeaturesFor(null); setNotice(msg); }}
        />
      )}
      {planoFor && (
        <PlanoModal
          cliente={planoFor}
          onClose={() => setPlanoFor(null)}
          onOk={(msg) => { setPlanoFor(null); setNotice(msg); load(); }}
        />
      )}

      {vincularFor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Vincular WhatsApp a {vincularFor.name || vincularFor.email}</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
              Escolha o número que está no SEU painel e pertence a este cliente. A sessão do WhatsApp
              continua conectada — muda só a conta dona (some daqui, aparece pra ele).
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {contasAdmin.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Nenhum WhatsApp extra no seu painel agora.</div>}
              {contasAdmin.map((a) => (
                <button key={a.id} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", padding: "10px 12px" }}
                  disabled={busy === vincularFor.email} onClick={() => vincular(vincularFor.email, a.id)}>
                  <b>{a.name}</b>{a.number ? <span className="muted" style={{ marginLeft: 8 }}>+{a.number.replace(/\D/g, "")}</span> : null}
                  {a.alheia && <span className="pill" style={{ marginLeft: "auto", color: "var(--crit)", borderColor: "var(--crit)" }}>de cliente</span>}
                  {a.connected === false && <span className="muted" style={{ marginLeft: a.alheia ? 6 : "auto", fontSize: 11.5 }}>offline</span>}
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              O nome mostrado é o do PERFIL do WhatsApp espelhado. Confira pelo NÚMERO antes de
              transferir — transferir o seu próprio número pra um cliente daria a ele acesso às suas conversas.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={() => setVincularFor(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal de PLANO: sai do teste e vira assinatura paga — plano + período + números + venda.
// Substituiu a corrente de prompt() (ninguém achava onde clicar pra "mudar o plano").
const PLANOS = [
  { id: "start", nome: "Start", numeros: 1 },
  { id: "pro", nome: "Pro", numeros: 3 },
  { id: "escala", nome: "Escala", numeros: 10 },
];
const PERIODOS = [
  { dias: 30, label: "1 mês" },
  { dias: 90, label: "3 meses" },
  { dias: 180, label: "6 meses" },
  { dias: 365, label: "1 ano" },
];

// ══ LIBERAR FEATURES PRO CLIENTE ═════════════════════════════════════════════════════════════
// Recurso sensível nasce só pro super admin e é liberado cliente a cliente aqui. A tela mostra o
// RISCO de cada um — a decisão é do dono, então ele precisa ver o que está autorizando.
// ⚠️ Isto é a UI. Quem realmente barra é o motor (features.ts), na hora de rodar e de salvar.
function FeaturesModal({ cliente, onClose, onOk }: { cliente: Client; onClose: () => void; onOk: (msg: string) => void }) {
  const [catalogo, setCatalogo] = useState<Array<{ id: string; nome: string; descricao: string; risco?: string }> | null>(null);
  const [liberadas, setLiberadas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/features?email=" + encodeURIComponent(cliente.email), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setCatalogo(d.catalogo ?? []); setLiberadas(d.liberadas ?? []); })
      .catch((e) => setErro(String(e.message ?? e)));
  }, [cliente.email]);

  async function salvar() {
    setBusy(true); setErro("");
    try {
      const r = await fetch("/api/features", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cliente.email, liberadas }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "falha ao salvar");
      onOk(liberadas.length
        ? `${cliente.name || cliente.email}: ${liberadas.length} recurso(s) liberado(s).`
        : `${cliente.name || cliente.email}: nenhum recurso liberado.`);
    } catch (e: any) { setErro(e.message); setBusy(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="card" style={{ maxWidth: 560, width: "calc(100% - 32px)", maxHeight: "82vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>Recursos liberados</h3></div>
        <div className="card-pad">
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
            Cliente: <b>{cliente.name || "—"}</b> · {cliente.email}
            <br />Estes recursos <b>não vêm ligados</b>. Você libera um a um, pra quem já tem
            maturidade de usar.
          </div>

          {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginBottom: 10 }}>{erro}</div>}
          {!catalogo && <div className="muted" style={{ fontSize: 13 }}>Carregando…</div>}

          {catalogo?.map((f) => {
            const on = liberadas.includes(f.id);
            return (
              <label key={f.id} className={"feat-item" + (on ? " on" : "")}>
                <input type="checkbox" checked={on} disabled={busy}
                  onChange={(e) => setLiberadas((l) => (e.target.checked ? [...l, f.id] : l.filter((x) => x !== f.id)))} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.nome}</div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{f.descricao}</div>
                  {f.risco && <div className="feat-risco">{f.risco}</div>}
                </div>
              </label>
            );
          })}

          {catalogo?.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nenhum recurso com liberação manual por enquanto.</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn primary" onClick={salvar} disabled={busy || !catalogo}>{busy ? "Salvando…" : "Salvar liberação"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanoModal({ cliente, onClose, onOk }: { cliente: Client; onClose: () => void; onOk: (msg: string) => void }) {
  const [plan, setPlan] = useState(cliente.plan || "start");
  const [dias, setDias] = useState(180);
  const [numeros, setNumeros] = useState(cliente.number_limit ?? 1);
  const [valor, setValor] = useState("");
  const [tel, setTel] = useState("");
  const [nota, setNota] = useState("PIX direto");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const ate = new Date(Date.now() + dias * 86_400_000).toLocaleDateString("pt-BR");

  async function salvar() {
    if (busy) return;
    setBusy(true); setErro("");
    try {
      const r = await fetch("/api/clients/grant-plan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: cliente.email, dias, plan, numeros,
          valor: Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0,
          nota, telefone: tel, nome: cliente.name,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d?.error || "falha"); setBusy(false); return; }
      onOk(`✅ ${cliente.name || cliente.email} agora é ${plan.toUpperCase()} até ${new Date(d.paidUntil).toLocaleDateString("pt-BR")} · ${numeros} número(s)${d.venda ? " · venda registrada em Vendas & Ganhos" : ""}.`);
    } catch { setErro("falha de rede"); setBusy(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, marginBottom: 3 }}>Plano de {cliente.name || cliente.email}</h3>
        <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          Tira do teste e marca como <b>assinatura paga</b>. Use pra venda fechada por fora (PIX, transferência).
        </p>

        <div className="pl-campo">
          <label>Plano</label>
          <div className="pl-opcoes">
            {PLANOS.map((p) => (
              <button key={p.id} className={"pl-op" + (plan === p.id ? " on" : "")}
                onClick={() => { setPlan(p.id); setNumeros(p.numeros); }} disabled={busy}>
                {p.nome}<em>{p.numeros} número{p.numeros > 1 ? "s" : ""}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="pl-campo">
          <label>Período pago</label>
          <div className="pl-opcoes">
            {PERIODOS.map((p) => (
              <button key={p.dias} className={"pl-op" + (dias === p.dias ? " on" : "")} onClick={() => setDias(p.dias)} disabled={busy}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Acesso ativo até <b>{ate}</b> (soma no que ele já tem).</div>
        </div>

        <div className="pl-campo">
          <label>Números de WhatsApp (o bônus entra aqui)</label>
          <input className="inp" type="number" min={1} max={50} value={numeros}
            onChange={(e) => setNumeros(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={busy} />
        </div>

        <div className="pl-campo">
          <label>WhatsApp do cliente (opcional — marca ele como <b>comprador</b> no CRM)</label>
          <input className="inp" inputMode="tel" placeholder="5511988887777" value={tel} onChange={(e) => setTel(e.target.value)} disabled={busy} />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>As vendas são por e-mail; o CRM é por telefone. Com o número aqui, ele aparece na aba <b>Contatos → Compradores</b>.</div>
        </div>

        <div className="pl-campo">
          <label>Valor recebido (opcional — entra em Vendas &amp; Ganhos)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" style={{ flex: 1 }} inputMode="decimal" placeholder="582,00" value={valor} onChange={(e) => setValor(e.target.value)} disabled={busy} />
            <input className="inp" style={{ flex: 1 }} placeholder="PIX direto" value={nota} onChange={(e) => setNota(e.target.value)} disabled={busy} />
          </div>
        </div>

        {erro && <div style={{ color: "var(--crit)", fontSize: 12.5, marginBottom: 10 }}>{erro}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Salvar plano"}</button>
        </div>
      </div>
    </div>
  );
}
