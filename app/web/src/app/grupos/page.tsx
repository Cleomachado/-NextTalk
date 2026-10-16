"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { jget, WelcomeCfg, SummaryCfg } from "@/lib/client";
import { Icon } from "@/components/icons";
import { GroupImportModal } from "@/components/groups/GroupImportModal";

type Auto = { href: string; icon: string; title: string; desc: string; tone: string; live: boolean };

const AUTOS: Auto[] = [
  {
    href: "/grupos/boas-vindas",
    icon: "handshake",
    title: "Boas-vindas no grupo",
    desc: "Escolha um grupo: quem entrar nele recebe uma mensagem de boas-vindas no privado (PV). Você escreve a mensagem.",
    tone: "b-green",
    live: true,
  },
  {
    href: "/grupos/resumo-ia",
    icon: "ai_agent",
    title: "Resumo do dia (IA)",
    desc: "A IA acompanha o grupo o dia todo e, no horário que você definir, envia o resumo — no próprio grupo, pra você ou pra outro grupo.",
    tone: "b-violet",
    live: true,
  },
  {
    href: "/grupos/marcar-todos",
    icon: "mention_all",
    title: "Marcar todos",
    desc: "Mencione todos os membros de um grupo de uma vez — visível ou oculto (todos recebem a notificação).",
    tone: "b-blue",
    live: true,
  },
  {
    href: "/grupos/criar-massa",
    icon: "add_to_group",
    title: "Criar grupos em massa",
    desc: "Crie vários grupos de uma vez, com foto, descrição e admins — com delay entre cada pra evitar bloqueio.",
    tone: "b-amber",
    live: true,
  },
];

export default function GruposPage() {
  const [welcome, setWelcome] = useState<WelcomeCfg | null>(null);
  const [summary, setSummary] = useState<SummaryCfg | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    jget("/api/config/welcome").then(setWelcome).catch(() => {});
    jget("/api/config/summary").then(setSummary).catch(() => {});
  }, []);

  function statusFor(href: string): { on: boolean; label: string } | null {
    if (href === "/grupos/boas-vindas" && welcome)
      return { on: !!welcome.enabled, label: welcome.enabled ? `Ativa · ${welcome.groups.length} grupo(s)` : "Desligada" };
    if (href === "/grupos/resumo-ia" && summary)
      return { on: !!summary.enabled, label: summary.enabled ? `Ativa · ${summary.groups.length} grupo(s)` : "Desligada" };
    return null;
  }

  return (
    <>
    <div className="auto-grid">
      {AUTOS.map((a) => {
        const st = a.live ? statusFor(a.href) : null;
        const inner = (
          <div className="card auto-card">
            <div className="auto-top">
              <div className={"auto-ico " + a.tone}><Icon name={a.icon} size={22} /></div>
              {a.live ? (
                st ? <span className={"pill " + (st.on ? "on" : "off")}>{st.label}</span> : null
              ) : (
                <span className="pill soon">em breve</span>
              )}
            </div>
            <div className="auto-title">{a.title}</div>
            <div className="auto-desc">{a.desc}</div>
            <div className="auto-cta">{a.live ? "Configurar →" : "Em breve"}</div>
          </div>
        );
        return a.live ? (
          <Link key={a.title} href={a.href} className="auto-link">{inner}</Link>
        ) : (
          <div key={a.title} className="auto-link disabled">{inner}</div>
        );
      })}

      {/* Card que abre o popup de importação (não navega — abre modal) */}
      <button
        className="auto-link"
        onClick={() => setShowImport(true)}
        style={{ border: 0, background: "none", padding: 0, font: "inherit", textAlign: "left", cursor: "pointer", width: "100%" }}
      >
        <div className="card auto-card">
          <div className="auto-top"><div className="auto-ico b-teal"><Icon name="download" size={22} /></div></div>
          <div className="auto-title">Importar contatos de grupo</div>
          <div className="auto-desc">Traga os participantes de um grupo pro seu CRM de uma vez, com uma tag pra identificar de qual grupo vieram.</div>
          <div className="auto-cta">Importar →</div>
        </div>
      </button>
    </div>

    {showImport && <GroupImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}
