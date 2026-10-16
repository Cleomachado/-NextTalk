"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Confirmar() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    if (!t) { setState("error"); setErr("Link de confirmação inválido."); return; }
    fetch("/api/auth/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) { setState("ok"); setTimeout(() => { window.location.href = "/"; }, 1300); }
        else { setState("error"); setErr(d?.error || "Link inválido ou expirado — peça um novo."); }
      })
      .catch(() => { setState("error"); setErr("Falha de rede — tente de novo."); });
  }, []);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">Zap<span>Converte</span></div>
        {state === "loading" && (
          <>
            <h1>Confirmando…</h1>
            <p className="muted" style={{ fontSize: 14 }}>Só um instante enquanto ativamos sua conta.</p>
          </>
        )}
        {state === "ok" && (
          <>
            <h1>E-mail confirmado! ✅</h1>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>Sua conta está ativa. Entrando no seu painel…</p>
          </>
        )}
        {state === "error" && (
          <>
            <h1>Link inválido</h1>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{err}</p>
            <Link className="btn auth-cta" href="/entrar" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>Ir pro login</Link>
          </>
        )}
      </div>
    </div>
  );
}
