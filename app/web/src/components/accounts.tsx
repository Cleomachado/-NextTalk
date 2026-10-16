"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { jget } from "@/lib/client";

// Uma conta = um número conectado. API = WhatsApp Cloud API (Meta oficial);
// LITE = WhatsApp normal espelhado por QR/código (não-oficial, via UazAPI).
export interface Acct {
  id: string;
  type: "API" | "LITE";
  name: string;
  number?: string;
  avatar?: string;
  connected: boolean;
  noAuto?: boolean; // número dormente: conectado mas não roda automação
  alheia?: boolean; // super-admin: este WhatsApp é de um CLIENTE que caiu na conta do dono (incidente 16/08)
}

// Cada tipo de conta tem sua tela de conversas. Mapa ÚNICO (menu, redirects e botões usam daqui —
// renomear rota é mexer num lugar só).
export const TELA_AO_VIVO: Record<Acct["type"], string> = { LITE: "/ao-vivo", API: "/oficial/inbox" };
// Onde ficam os MODELOS de cada tipo de conta. Um fluxo com nó de Template só roda na API Oficial:
// ao trocar de conta com um fluxo desses aberto, o painel leva pra tela de modelos da conta nova.
export const TELA_TEMPLATES: Record<Acct["type"], string> = { LITE: "/modelos", API: "/oficial/templates" };

// ── GUARDA DE TROCA DE CONTA ────────────────────────────────────────────────────────────────
// O aviso de "trabalho não salvo" (useAvisoNaoSalvo) intercepta clique em LINK — e o seletor de
// contas é um BOTÃO, então passava direto: dava pra trocar de conta no meio de um fluxo editado e
// perder tudo, sem pergunta nenhuma. Aqui a tela que tem trabalho aberto registra uma função; o
// seletor pergunta a ela antes de trocar. Devolver false = a troca não acontece.
export type GuardaTroca = (destino: Acct["type"]) => boolean | Promise<boolean>;
let guardaTroca: GuardaTroca | null = null;
export function registraGuardaDeTroca(g: GuardaTroca | null): void { guardaTroca = g; }
export async function podeTrocarConta(destino: Acct["type"]): Promise<boolean> {
  if (!guardaTroca) return true;
  try { return await guardaTroca(destino); } catch { return true; } // guarda quebrada nunca trava o painel
}

// Formata número BR (5511999999999 → +55 11 93224-5742); mantém outros formatos legíveis.
// 📱 Rótulo do NÚMERO de um fluxo (lista de fluxos, nó do gatilho). Fluxo sem número escolhido
// vale pra todos; com um número só na conta, mostra esse número pra não deixar dúvida.
export function numeroDoFluxo(conta: string | undefined, accounts: Acct[]): { texto: string; aviso?: string } {
  const lista = accounts.filter((a) => !a.alheia);
  const c = String(conta ?? "").trim();
  if (!c) {
    if (lista.length === 1) return { texto: lista[0].number ? fmtNumber(lista[0].number) : lista[0].name };
    return { texto: "Todos os números" };
  }
  const a = lista.find((x) => x.id === c);
  if (!a) return { texto: "Número removido", aviso: "O número escolhido neste fluxo não está mais na conta — o fluxo não dispara." };
  return { texto: a.number ? fmtNumber(a.number) : a.name, aviso: a.connected ? undefined : "Este número está desconectado — o fluxo não dispara até reconectar." };
}

export function fmtNumber(n?: string): string {
  if (!n) return "";
  const d = n.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const p = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 ${ddd} ${p}`;
  }
  return n.startsWith("+") ? n : "+" + d;
}

interface Ctx {
  accounts: Acct[];
  activeId: string;
  activeAcct: Acct | null;
  setActive: (id: string) => void;
  loading: boolean;
}
const AccountsContext = createContext<Ctx>({
  accounts: [],
  activeId: "",
  activeAcct: null,
  setActive: () => {},
  loading: true,
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let list: Acct[] = [];
      try {
        const d = await jget("/api/accounts");
        list = (d.accounts ?? []) as Acct[];
      } catch {
        /* motor indisponível */
      }
      setAccounts(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("zc-active-acct");
      } catch {
        /* ignore */
      }
      setActiveId(saved && list.some((a) => a.id === saved) ? saved : list[0]?.id ?? "");
      setLoading(false);
    }
    load();
  }, []);

  function setActive(id: string) {
    setActiveId(id);
    try {
      localStorage.setItem("zc-active-acct", id);
    } catch {
      /* ignore */
    }
  }

  const activeAcct = accounts.find((a) => a.id === activeId) ?? null;

  return (
    <AccountsContext.Provider value={{ accounts, activeId, activeAcct, setActive, loading }}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  return useContext(AccountsContext);
}
