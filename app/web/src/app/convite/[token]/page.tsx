"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

// Tela de ACEITE do convite de Equipe (pública — quem foi convidado pode nem ter conta ainda).
// Dois caminhos: conta nova (nome + senha) ou conta existente (a senha dela, como prova de posse).
interface Invite { email: string; role: string; wsName: string; needsAccount: boolean }

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", atendente: "Atendente" };

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<Invite | null>(null);
  const [erro, setErro] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d?.error ? setErro(d.error) : setInv(d)))
      .catch(() => setErro("Não consegui carregar o convite — tente de novo"));
  }, [token]);

  async function aceitar(e: React.FormEvent) {
    e.preventDefault();
    if (busy || pw.length < 6) return;
    setBusy(true); setErro("");
    try {
      const r = await fetch("/api/invite/accept", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      // Conta com 2FA: já entrou na equipe, mas o login pede o código do app.
      if (r.ok && d?.needLogin) { window.location.href = "/entrar?equipe=1"; return; }
      if (r.ok) { window.location.href = "/"; return; }
      setErro(d?.error || "Não consegui aceitar o convite");
    } catch { setErro("Falha de rede — tente de novo"); }
    setBusy(false);
  }

  if (erro && !inv) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">Zap<span>Converte</span></div>
          <h1>Convite indisponível</h1>
          <div className="auth-err">{erro}</div>
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>Peça um novo convite pra quem te chamou.</p>
          <a className="btn auth-cta" href="/entrar" style={{ textAlign: "center" }}>Ir pro login</a>
        </div>
      </div>
    );
  }
  if (!inv) return <div className="auth-wrap"><div className="auth-card"><div className="muted">Carregando convite…</div></div></div>;

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={aceitar}>
        <div className="auth-logo">Zap<span>Converte</span></div>
        <h1>Você foi convidado 🎉</h1>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.6 }}>
          Entrar na conta <b>{inv.wsName}</b> como <b>{ROLE_LABEL[inv.role] || inv.role}</b>.<br />
          E-mail do convite: <b>{inv.email}</b>
        </p>

        {inv.needsAccount ? (
          <>
            <label>Seu nome</label>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            <label>Crie uma senha (mín. 6)</label>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
          </>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              Já existe uma conta com esse e-mail — digite a <b>senha dela</b> pra confirmar que é você.
            </div>
            <label>Sua senha</label>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          </>
        )}

        {erro && <div className="auth-err">{erro}</div>}
        <button className="btn auth-cta" type="submit" disabled={busy || pw.length < 6 || (inv.needsAccount && !name.trim())}>
          {busy ? "Entrando…" : "Aceitar convite e entrar"}
        </button>
        <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          O atendimento, os contatos e os fluxos são da conta <b>{inv.wsName}</b> — você vai trabalhar junto com a equipe dela.
        </div>
      </form>
    </div>
  );
}
