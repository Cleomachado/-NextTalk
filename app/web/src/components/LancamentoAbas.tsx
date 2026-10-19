"use client";

// Abas do Dashboard de Lançamento: visão geral, métricas da live e ranking de criativos.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/lancamento", rot: "Visão geral" },
  { href: "/lancamento/live-metricas", rot: "Métricas da live" },
  { href: "/lancamento/ranking-criativos", rot: "Ranking de criativos" },
  { href: "/lancamento/kanban", rot: "Kanban de vendas" },
];

export default function LancamentoAbas() {
  const atual = usePathname();
  return (
    <nav className="lx-abas" aria-label="Seções do dashboard de lançamento">
      {ABAS.map((a) => <Link key={a.href} href={a.href} className={"lx-aba" + (atual === a.href ? " on" : "")} aria-current={atual === a.href ? "page" : undefined}>{a.rot}</Link>)}
    </nav>
  );
}
