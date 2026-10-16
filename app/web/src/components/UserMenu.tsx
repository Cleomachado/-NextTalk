"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { jsend } from "@/lib/client";
import { useT } from "@/lib/i18n";
import { Pfp } from "@/components/ui";
import { Icon } from "@/components/icons";
import PasswordInput from "@/components/PasswordInput";

// Menu da FOTO, no canto do cabeçalho. Antes a foto era enfeite (não clicava) e ao lado dela
// morava um "?" solto — o tour virou item do menu e o ponto de interrogação saiu da barra.
// "Alterar senha" abre aqui mesmo, de qualquer página, batendo no MESMO endpoint das
// Configurações (que revoga as outras sessões e mantém esta).
export function UserMenu({
  nome, email, foto, podeVerTour, onTour,
}: {
  nome?: string; email?: string; foto?: string;
  podeVerTour: boolean; onTour: () => void;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora e no Esc — sem isto o menu fica presa na tela ao navegar.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  return (
    <div className="umenu" ref={caixa}>
      <button className="umenu-btn" onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu" aria-expanded={aberto} title={nome || email || "Sua conta"}>
        <Pfp size={36} ring={false} src={foto} />
      </button>

      {aberto && (
        <div className="umenu-pop" role="menu">
          <div className="umenu-quem">
            <b>{nome || "Sua conta"}</b>
            {email && <span className="muted">{email}</span>}
          </div>
          <Link href="/configuracoes" className="umenu-item" role="menuitem" onClick={() => setAberto(false)}>
            <Icon name="settings" size={14} /> {t("nav.configuracoes")}
          </Link>
          <button className="umenu-item" role="menuitem" onClick={() => { setAberto(false); setSenhaAberta(true); }}>
            <Icon name="lock" size={14} /> {t("config.trocarSenha")}
          </button>
          {podeVerTour && (
            <button className="umenu-item" role="menuitem" onClick={() => { setAberto(false); onTour(); }}>
              <Icon name="info" size={14} /> Rever o tour de boas-vindas
            </button>
          )}
          <div className="umenu-sep" />
          <button className="umenu-item perigo" role="menuitem"
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/entrar"; }}>
            <Icon name="logout" size={14} /> Sair
          </button>
        </div>
      )}

      {senhaAberta && <ModalSenha onClose={() => setSenhaAberta(false)} />}
    </div>
  );
}

function ModalSenha({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repete, setRepete] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function salvar() {
    if (busy) return;
    if (nova !== repete) { setErro("A nova senha e a confirmação estão diferentes."); return; }
    if (nova.length < 6) { setErro("Use pelo menos 6 caracteres na nova senha."); return; }
    setBusy(true); setErro("");
    try {
      await jsend("/api/app/me/password", "POST", { current: atual, next: nova });
      setOk(true);
    } catch (e: any) { setErro(e?.message || "não consegui trocar a senha"); }
    setBusy(false);
  }

  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;

  // PORTAL obrigatório: `.topbar` usa backdrop-filter, e isso cria bloco de contenção para
  // descendentes `position: fixed`. Sem o portal, o overlay se ancorava na faixa de 62px do
  // cabeçalho e a janela nascia colada no topo, cortada (Admin, 23/09).
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-head">
          <h2>{t("config.trocarSenha")}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Trocar a senha desconecta os outros aparelhos. Este continua conectado.
          </div>
        </div>

        {ok ? (
          <>
            <div style={{ fontSize: 14, color: "var(--accent-deep)", fontWeight: 600 }}>Senha alterada.</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Se você estava conectado em outro computador ou celular, precisará entrar de novo lá.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">{t("config.senhaAtual")}</span>
              <PasswordInput value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">{t("config.novaSenha")}</span>
              <PasswordInput value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" placeholder="pelo menos 6 caracteres" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <span className="muted">Repita a nova senha</span>
              <PasswordInput value={repete} onChange={(e) => setRepete(e.target.value)} autoComplete="new-password" />
            </label>
            {erro && <div style={{ fontSize: 13, color: "var(--crit)" }}>{erro}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn primary" onClick={salvar} disabled={busy || !atual || !nova || !repete}>
                {busy ? t("config.trocandoSenha") : t("config.trocarSenha")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
