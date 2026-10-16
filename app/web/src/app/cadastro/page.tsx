"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

function CadastroForm() {
  const params = useSearchParams();
  // Vindo do link de boas-vindas (após a compra): nome e e-mail JÁ pré-preenchidos — o cliente só
  // define a senha. Ao cadastrar, o sistema cruza o e-mail com a venda e libera o acesso na hora.
  const fromPurchase = !!params.get("email");
  const [name, setName] = useState(params.get("nome") ?? "");
  const [email, setEmail] = useState(params.get("email")?.trim().toLowerCase() ?? "");
  const [password, setPassword] = useState("");
  const [coupon, setCoupon] = useState(params.get("cupom")?.toUpperCase() ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false); // cadastro direto → precisa confirmar o e-mail

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, coupon: coupon || undefined, ref: params.get("ref") || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // Cadastro direto (sem prova de posse) → confirma o e-mail antes de entrar.
        if (d?.needConfirm) { setSent(true); return; }
        // Cupom não aplicado: avisa antes de entrar (senão cai no paywall sem entender o porquê).
        if (d?.couponWarning) alert(d.couponWarning + "\n\nSua conta foi criada — você pode escolher um plano ao entrar.");
        window.location.href = "/";
        return;
      }
      setErr(d?.error || "Falha no cadastro");
    } catch { setErr("Falha de rede — tente de novo"); }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="auth-card">
        <div className="auth-logo">Zap<span>Converte</span></div>
        <h1>Confirme seu e-mail 📬</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Enviamos um link de confirmação para <b>{email}</b>. Clique nele pra ativar sua conta e entrar. (Confira também o spam.)
        </p>
        <Link className="btn auth-cta" href="/entrar" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Já confirmei — ir pro login</Link>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-logo">Zap<span>Converte</span></div>
      <h1>Criar conta</h1>
      {fromPurchase && (
        <div className="auth-note">✅ Sua compra foi identificada! É só definir uma senha — seu acesso é liberado na hora. <b>Mantenha o e-mail da compra.</b></div>
      )}
      <label>Seu nome</label>
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      <label>E-mail</label>
      <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <label>Senha (mín. 6)</label>
      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
      <label>Cupom de teste (opcional)</label>
      <input className="inp" placeholder="ex.: TESTE3" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
      {err && <div className="auth-err">{err}</div>}
      <button className="btn auth-cta" type="submit" disabled={busy}>{busy ? "Criando…" : "Criar conta"}</button>
      <div className="muted" style={{ fontSize: 12.5, textAlign: "center" }}>
        Com cupom, seu teste começa na hora. Sem cupom, você escolhe um plano ao entrar.
      </div>
      <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
        Já tem conta? <Link href="/entrar">Entrar</Link>
      </div>
    </form>
  );
}

export default function Cadastro() {
  return (
    <div className="auth-wrap">
      <Suspense fallback={null}>
        <CadastroForm />
      </Suspense>
    </div>
  );
}
