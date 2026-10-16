"use client";

import { useState } from "react";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

export default function Entrar() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // 2FA: quando a senha confere mas a conta tem verificação em 2 fatores, o motor devolve um
  // ticket (tfa) e a gente pede o código de 6 dígitos do app autenticador.
  const [tfa, setTfa] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.need2fa && d?.tfa) { setTfa(d.tfa); setCode(""); setBusy(false); return; }
      if (r.ok) { window.location.href = "/"; return; }
      setErr(d?.error || "Falha no login");
    } catch { setErr("Falha de rede — tente de novo"); }
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login/2fa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tfa, code }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { window.location.href = "/"; return; }
      setErr(d?.error || "Código incorreto");
      // ticket expirado/estourou tentativas → volta pro passo da senha
      if (String(d?.error || "").includes("faça login de novo")) { setTfa(null); setCode(""); }
    } catch { setErr("Falha de rede — tente de novo"); }
    setBusy(false);
  }

  if (tfa) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={submitCode}>
          <div className="auth-logo">Zap<span>Converte</span></div>
          <h1>Verificação em 2 fatores</h1>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            Abra o seu app autenticador (Google Authenticator, Authy) e digite o código de 6 dígitos.
          </p>
          <label>Código</label>
          <input
            className="inp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            style={{ fontSize: 22, letterSpacing: "0.35em", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
          />
          {err && <div className="auth-err">{err}</div>}
          <button className="btn auth-cta" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verificando…" : "Entrar"}</button>
          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            <button type="button" onClick={() => { setTfa(null); setCode(""); setErr(""); }} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", textDecoration: "underline", font: "inherit" }}>
              ← Voltar pro login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">Zap<span>Converte</span></div>
        <h1>Entrar</h1>
        <label>E-mail</label>
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label>Senha</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {err && <div className="auth-err">{err}</div>}
        <button className="btn auth-cta" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          <Link href="/esqueci">Esqueci minha senha</Link>
        </div>
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
        </div>
      </form>
    </div>
  );
}
