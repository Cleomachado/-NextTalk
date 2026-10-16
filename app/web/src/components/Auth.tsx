"use client";

// Sessão do usuário no cliente: quem está logado, trial restante e o PAYWALL.
// Quando o teste acaba (e não há assinatura), abre o popup com os 3 planos + checkout Kiwify.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export interface AuthSession {
  // wsRole = papel DENTRO do workspace (Equipe): dono | admin | atendente.
  user: { id: string; email: string; name: string; role: string; avatar?: string | null; wsRole?: "dono" | "admin" | "atendente"; idioma?: "pt" | "en" | "es" | null;
          // Permissões finas do membro (null/ausente = sem restrição). O servidor manda e também aplica.
          permissoes?: { paginas?: string[] | null; contas?: string[] | null } | null };
  workspace: { id: string; name: string; plan: string | null; status: string; trial_ends_at: string | null; paid_until: string | null; days_left: number | null };
  paywall: boolean;
  orphan?: boolean; // conta sem workspace (removida da equipe) → tela explicativa, não checkout
}

const Ctx = createContext<{ session: AuthSession | null; loading: boolean; refresh: () => void }>({ session: null, loading: true, refresh: () => {} });
export const useAuth = () => useContext(Ctx);

const AUTH_PAGES = ["/entrar", "/cadastro"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((s) => setSession(s))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isAuthPage) { setLoading(false); return; }
    refresh();
  }, [isAuthPage, refresh]);

  return (
    <Ctx.Provider value={{ session, loading, refresh }}>
      {children}
      {/* órfão (sem workspace) NÃO vê checkout: a assinatura é do dono da equipe, não dele. */}
      {!isAuthPage && session?.paywall && !session?.orphan && <PaywallModal onRefresh={refresh} hadTrial={!!session.workspace.trial_ends_at} />}
    </Ctx.Provider>
  );
}

// Planos (checkout Kiwify — links do dono, 25/07/2026).
export const PLANS = [
  {
    key: "start", name: "Start", price: "R$ 97/mês", url: "https://pay.kiwify.com.br/SEU-CHECKOUT", popular: false,
    desc: "Pra começar a vender no automático",
    perks: ["1 número no WhatsApp API Oficial", "Recuperação de PIX e carrinho", "Entrega automática pós-compra", "Suporte no WhatsApp"],
  },
  {
    key: "pro", name: "Profissional", price: "R$ 147/mês", url: "https://pay.kiwify.com.br/SEU-CHECKOUT", popular: true,
    desc: "O completo, pra quem vive de vender",
    perks: ["Tudo do Start, e mais:", "Disparos com modelos aprovados pela Meta", "Automações de grupo + resumo com IA", "Áudio e vídeo nas sequências", "Suporte prioritário"],
  },
  {
    key: "escala", name: "Escala", price: "R$ 297/mês", url: "https://pay.kiwify.com.br/SEU-CHECKOUT", popular: false,
    desc: "Pra operações maiores e agências",
    perks: ["Tudo do Profissional, e mais:", "Sequências sob medida — a gente monta", "Prioridade máxima no suporte", "Acesso antecipado aos recursos novos"],
  },
];

// Popup BLOQUEANTE quando o período de teste acabou: mostra os planos + cupom + sair.
function PaywallModal({ onRefresh, hadTrial }: { onRefresh: () => void; hadTrial: boolean }) {
  const [coupon, setCoupon] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    if (!coupon.trim() || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coupon }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setMsg(`✅ Acesso liberado por ${d.trial_days} dia(s)! Entrando…`); setTimeout(onRefresh, 900); }
      else setMsg(d?.error || "Cupom inválido");
    } catch { setMsg("Falha de rede — tente de novo"); }
    setBusy(false);
  }
  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/entrar";
  }
  // "Já assinei": re-checa a compra na Kiwify (libera o plano se já pagou) e atualiza a sessão.
  async function jaAssinei() {
    setMsg("Verificando sua compra…");
    try { await fetch("/api/auth/sync-access", { method: "POST" }); } catch {}
    onRefresh();
  }

  return (
    <div className="paywall-overlay">
      <div className="paywall-card">
        <h2 style={{ margin: 0 }}>{hadTrial ? "Seu período de teste acabou 😢" : "Ative seu acesso 🚀"}</h2>
        <p className="muted" style={{ margin: "6px 0 16px", fontSize: 14 }}>
          {hadTrial
            ? "Pra continuar vendendo no automático, escolha um plano — ou use um cupom."
            : "Escolha um plano pra começar — ou, se você recebeu um cupom de teste, ative ele aqui embaixo."}
        </p>
        <div className="paywall-plans">
          {PLANS.map((p) => (
            <div key={p.key} className={"pw-plan" + (p.popular ? " popular" : "")}>
              {p.popular && <div className="pw-pop">MAIS POPULAR</div>}
              <div className="pw-name">{p.name}</div>
              <div className="pw-desc muted">{p.desc}</div>
              <div className="pw-price">{p.price}</div>
              <ul className="pw-perks">
                {p.perks.map((x, i) => <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}><Icon name="check" size={14} style={{ flexShrink: 0, marginTop: 3 }} />{x}</li>)}
              </ul>
              <a className={"btn pw-cta" + (p.popular ? " primary" : "")} href={p.url} target="_blank" rel="noreferrer">
                Quero o {p.name}
              </a>
            </div>
          ))}
        </div>
        <div className="pw-foot">
          <div style={{ display: "flex", gap: 6, flex: "1 1 260px" }}>
            <input className="inp" placeholder="Tenho um cupom…" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && redeem()} />
            <button className="btn" onClick={redeem} disabled={busy}>{busy ? "…" : "Ativar"}</button>
          </div>
          <button className="btn" onClick={jaAssinei} title="Se você acabou de pagar, clique pra liberar seu acesso">Já assinei — atualizar</button>
          <button className="btn" style={{ color: "var(--muted)" }} onClick={sair}>Sair</button>
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("✅") ? "var(--accent)" : "var(--crit)" }}>{msg}</div>}
        <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
          Pagamento seguro via Kiwify · PIX, cartão ou boleto · Depois de pagar, clique em &quot;Já assinei&quot; (a liberação é automática pelo e-mail da compra — use o MESMO e-mail da sua conta).
        </div>
      </div>
    </div>
  );
}

// Faixa discreta com os dias restantes do teste.
export function TrialBanner() {
  const { session } = useAuth();
  if (!session || session.paywall) return null;
  const d = session.workspace.days_left;
  if (d == null || session.workspace.paid_until) return null;
  return (
    <div className="trial-banner">
      <Icon name="wait" size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Teste: <b>{d} dia{d === 1 ? "" : "s"} restante{d === 1 ? "" : "s"}</b> · Gostou?{" "}
      <a href={PLANS[1].url} target="_blank" rel="noreferrer">Assine o Profissional</a>
    </div>
  );
}
