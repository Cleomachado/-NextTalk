"use client";

// Calendário de PERÍODO, do jeito da Meta Ads (pedido do dono, 30/09): clica numa data, clica em
// outra e vira um período; dois cliques na MESMA data = aquele dia só (início = fim). O segundo
// clique já aplica — sem botão "ok" pra esquecer de apertar. Datas no formato AAAA-MM-DD, que é o
// que o motor lê (?de=&ate=). Futuro fica desabilitado: métrica de amanhã não existe.
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";

export interface PeriodoDatas { de: string; ate: string }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

// Monta/lê AAAA-MM-DD SEM passar por UTC: `new Date("2026-09-30")` vira 29/09 às 21h no Brasil.
export const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const fmtDiaBr = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
export const rotuloPeriodo = (p: PeriodoDatas) => (p.de === p.ate ? fmtDiaBr(p.de) : `${fmtDiaBr(p.de)} – ${fmtDiaBr(p.ate)}`);

// Atalhos iguais aos da Meta Ads. Todos terminam HOJE (menos "ontem" e "mês passado").
export function atalhoPeriodo(id: string): PeriodoDatas {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mais = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return x; };
  switch (id) {
    case "hoje": return { de: isoDia(hoje), ate: isoDia(hoje) };
    case "ontem": { const o = mais(-1); return { de: isoDia(o), ate: isoDia(o) }; }
    case "7d": return { de: isoDia(mais(-6)), ate: isoDia(hoje) };
    case "30d": return { de: isoDia(mais(-29)), ate: isoDia(hoje) };
    case "mes": return { de: isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: isoDia(hoje) };
    case "mes-passado": {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { de: isoDia(ini), ate: isoDia(fim) };
    }
    default: return { de: isoDia(mais(-29)), ate: isoDia(hoje) };
  }
}

export function CalendarioPeriodo({ valor, onChange, onFechar }: { valor: PeriodoDatas; onChange: (p: PeriodoDatas) => void; onFechar?: () => void }) {
  const hoje = useMemo(() => { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }, []);
  const [mesVisto, setMesVisto] = useState(() => { const d = deIso(valor.ate || isoDia(hoje)); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // 1º clique fica "pendente" até o 2º; enquanto isso o hover desenha a faixa que VAI ficar.
  const [pendente, setPendente] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const dias = useMemo(() => {
    const y = mesVisto.getFullYear(), m = mesVisto.getMonth();
    const primeiro = new Date(y, m, 1);
    const inicioGrade = new Date(primeiro); inicioGrade.setDate(1 - primeiro.getDay());
    const out: Array<{ iso: string; dia: number; fora: boolean; futuro: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrade); d.setDate(inicioGrade.getDate() + i);
      out.push({ iso: isoDia(d), dia: d.getDate(), fora: d.getMonth() !== m, futuro: d.getTime() > hoje.getTime() });
    }
    return out;
  }, [mesVisto, hoje]);

  // Faixa desenhada: a escolhida, ou a prévia (pendente → hover) enquanto o 2º clique não vem.
  const faixa: PeriodoDatas = pendente
    ? { de: hover && hover < pendente ? hover : pendente, ate: hover && hover > pendente ? hover : pendente }
    : valor;

  function clica(iso: string, futuro: boolean) {
    if (futuro) return;
    if (!pendente) { setPendente(iso); return; }
    // 2º clique: mesma data = 1 dia só; outra = período ordenado. Aplica na hora.
    const de = iso < pendente ? iso : pendente;
    const ate = iso > pendente ? iso : pendente;
    setPendente(null); setHover(null);
    onChange({ de, ate });
  }

  const atalhos: Array<{ id: string; rot: string }> = [
    { id: "hoje", rot: "Hoje" }, { id: "ontem", rot: "Ontem" }, { id: "7d", rot: "7 dias" },
    { id: "30d", rot: "30 dias" }, { id: "mes", rot: "Este mês" }, { id: "mes-passado", rot: "Mês passado" },
  ];

  return (
    <div className="cal" role="dialog" aria-label="Escolher período">
      <div className="cal-atalhos">
        {atalhos.map((a) => {
          const p = atalhoPeriodo(a.id);
          const on = p.de === valor.de && p.ate === valor.ate && !pendente;
          return <button key={a.id} type="button" className={"cal-atalho" + (on ? " on" : "")} onClick={() => { setPendente(null); onChange(p); }}>{a.rot}</button>;
        })}
      </div>
      <div className="cal-corpo">
        <div className="cal-cab">
          <button type="button" className="btn ic" aria-label="Mês anterior" onClick={() => setMesVisto(new Date(mesVisto.getFullYear(), mesVisto.getMonth() - 1, 1))}><Icon name="chevron-left" size={14} /></button>
          <b>{MESES[mesVisto.getMonth()]} de {mesVisto.getFullYear()}</b>
          <button type="button" className="btn ic" aria-label="Próximo mês" disabled={mesVisto.getFullYear() === hoje.getFullYear() && mesVisto.getMonth() >= hoje.getMonth()}
            onClick={() => setMesVisto(new Date(mesVisto.getFullYear(), mesVisto.getMonth() + 1, 1))}><Icon name="chevron-right" size={14} /></button>
        </div>
        <div className="cal-grade">
          {DIAS_SEMANA.map((d, i) => <div key={i} className="cal-sem">{d}</div>)}
          {dias.map((d) => {
            const naFaixa = d.iso >= faixa.de && d.iso <= faixa.ate;
            const ponta = d.iso === faixa.de || d.iso === faixa.ate;
            return (
              <button
                key={d.iso} type="button"
                className={"cal-dia" + (d.fora ? " fora" : "") + (d.futuro ? " futuro" : "") + (naFaixa ? " faixa" : "") + (ponta ? " ponta" : "") + (d.iso === isoDia(hoje) ? " hoje" : "") + (pendente === d.iso ? " pendente" : "")}
                disabled={d.futuro}
                onClick={() => clica(d.iso, d.futuro)}
                onMouseEnter={() => pendente && setHover(d.iso)}
                onMouseLeave={() => pendente && setHover(null)}
                title={fmtDiaBr(d.iso)}
              >{d.dia}</button>
            );
          })}
        </div>
        <div className="cal-rodape">
          <span className="muted" style={{ fontSize: 12 }}>
            {pendente ? `Início: ${fmtDiaBr(pendente)} — agora clique no fim (ou na mesma data pra 1 dia)` : rotuloPeriodo(valor)}
          </span>
          {onFechar && <button type="button" className="btn" style={{ padding: "4px 12px", fontSize: 12.5 }} onClick={onFechar}>Fechar</button>}
        </div>
      </div>
    </div>
  );
}
