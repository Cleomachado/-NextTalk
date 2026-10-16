"use client";

import { useState } from "react";
import Link from "next/link";

export default function Esqueci() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) { setSent(true); return; }
      const d = await r.json().catch(() => ({}));
      setErr(d?.error || "Não deu agora — tente de novo em instantes.");
    } catch {
      setErr("Falha de rede — tente de novo.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">Zap<span>Converte</span></div>
          <h1>Confira seu e-mail 📬</h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Se existe uma conta com <b>{email}</b>, enviamos um link pra redefinir a senha. Confira sua caixa de entrada (e o spam). O link vale por 1 hora.
          </p>
          <Link className="btn auth-cta" href="/entrar" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Voltar pro login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">Zap<span>Converte</span></div>
        <h1>Esqueci minha senha</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Digite o e-mail da sua conta que a gente te manda um link pra criar uma nova senha.
        </p>
        <label>E-mail</label>
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        {err && <div className="auth-err">{err}</div>}
        <button className="btn auth-cta" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar link de redefinição"}</button>
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          Lembrou? <Link href="/entrar">Voltar pro login</Link>
        </div>
      </form>
    </div>
  );
}
