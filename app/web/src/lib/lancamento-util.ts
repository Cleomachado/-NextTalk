import { useEffect } from "react";

// Formatadores e datas do Dashboard de Lançamento (visão geral, métricas da live, ranking de criativos).
export const brl = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brlOu = (v: number) => (Number.isFinite(v) && v !== 0 ? brl(v) : "R$ 0,00");
export const int = (v: number) => Math.round(Number.isFinite(v) ? v : 0).toLocaleString("pt-BR");
export const pct = (v: number, casas = 1) => (Number.isFinite(v) ? (v * 100).toFixed(casas).replace(".", ",") + "%" : "0,0%");
export const xR = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace(".", ",") + "x" : "0,00x");
export const diaBR = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
export const div = (a: number, b: number) => (b ? a / b : NaN);
export const soma = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const horaSP = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
// Data (AAAA-MM-DD) e hora (HH:MM) de um instante, no fuso de São Paulo.
export const diaDe = (iso: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
export const horaDe = (iso: string | number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}min` : `${Math.max(0, Math.round(min))}min`);
// Instante de um HH:MM num dia de São Paulo (Brasil sem horário de verão: -03:00).
export const instanteSP = (dia: string, hhmm: string) => Date.parse(`${dia}T${hhmm}:00-03:00`);

// Atualiza a Meta sozinho (últimos 3 dias) ao abrir uma aba do dashboard e ao voltar pra aba do
// navegador; o motor segura repetição em 2 min. Chama `depois` só se veio linha nova.
export function useMetaAuto(depois: () => void) {
  useEffect(() => {
    let vivo = true;
    const roda = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/lancamento/sincronizar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dias: 3 }) })
        .then((r) => r.json()).then((j) => { if (vivo && j?.ok && !j?.pulou) depois(); }).catch(() => {});
    };
    roda();
    document.addEventListener("visibilitychange", roda);
    return () => { vivo = false; document.removeEventListener("visibilitychange", roda); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
