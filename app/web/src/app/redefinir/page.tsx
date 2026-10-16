"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";

export default function Redefinir() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Lê o token da URL no cliente (evita a fronteira de Suspense do useSearchParams).
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("t") || "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) { setErr("A senha precisa de pelo menos 6 caracteres."); return; }
    if (password !== password2) { setErr("As senhas não conferem."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setDone(true); return; }
      setErr(d?.error || "Link inválido ou expirado — peça um novo.");
    } catch {
      setErr("Falha de rede — tente de novo.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">Zap<span>Converte</span></div>
          <h1>Senha redefinida! ✅</h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Pronto — sua nova senha já está valendo. Por segurança, todas as outras sessões foram desconectadas.
          </p>
          <Link className="btn auth-cta" href="/entrar" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Entrar com a nova senha</Link>
        </div>
      </div>
    );
  }

  if (token === "") {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">Zap<span>Converte</span></div>
          <h1>Link inválido</h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Este link de redefinição não é válido ou já foi usado. Peça um novo.
          </p>
          <Link className="btn auth-cta" href="/esqueci" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Pedir novo link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">Zap<span>Converte</span></div>
        <h1>Criar nova senha</h1>
        <label>Nova senha</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required autoFocus />
        <label>Repita a nova senha</label>
        <PasswordInput value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" minLength={6} required />
        {err && <div className="auth-err">{err}</div>}
        <button className="btn auth-cta" type="submit" disabled={busy || token === null}>{busy ? "Salvando…" : "Redefinir senha"}</button>
        <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          <Link href="/entrar">Voltar pro login</Link>
        </div>
      </form>
    </div>
  );
}
