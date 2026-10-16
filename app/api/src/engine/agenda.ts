// 📅 AGENDA — a conta pura do nó "Agenda Google": dado o que já está ocupado, quais horários
// sobram nos próximos dias, e como ler o horário que o lead escolheu ("2", "16/09 14:00", ISO).
// Sem rede e sem banco de propósito: dá pra testar na mão e não depende do fuso do contêiner
// (que roda em UTC). Todo cálculo de "que dia é / que hora é" passa pelo Intl no fuso do Brasil.

export const FUSO_AGENDA = "America/Sao_Paulo";

export interface Ocupado { inicio: Date; fim: Date }
export interface Opcao { iso: string; rotulo: string }

export interface RegrasAgenda {
  agora: Date;
  dias: number;            // quantos dias à frente olhar (1..30)
  inicio: string;          // "09:00" — começo do expediente
  fim: string;             // "18:00" — fim do expediente (último slot termina até aqui)
  duracaoMin: number;      // tamanho da reunião e passo entre opções
  diasSemana: number[];    // 0=dom … 6=sáb
  antecedenciaMin: number; // não oferecer antes de agora + isto
  maxOpcoes: number;
  fuso?: string;
  umPorDia?: boolean;      // true = no máximo UMA opção por dia (a primeira livre) — "hoje X ou amanhã Y"
}

// Partes de uma data NO FUSO (ano, mês, dia, hora, minuto, dia da semana).
export function partesNoFuso(d: Date, fuso = FUSO_AGENDA) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d).reduce<Record<string, string>>((o, x) => (o[x.type] = x.value, o), {});
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour % 24, minuto: +p.minute, semana };
}

// Offset ("-03:00") do fuso numa data — pelo Intl, sem chutar, pra seguir certo se a regra mudar.
export function offsetDoFuso(d: Date, fuso = FUSO_AGENDA): string {
  const p = partesNoFuso(d, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  const min = Math.round((comoUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  const sinal = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sinal}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

// "2026-09-15" + "10:00" no fuso → Date certo (resolve o offset daquele dia).
export function dataNoFuso(ymd: string, hhmm: string, fuso = FUSO_AGENDA): Date | null {
  const chute = new Date(`${ymd}T${hhmm}:00Z`);
  if (isNaN(chute.getTime())) return null;
  const d = new Date(`${ymd}T${hhmm}:00${offsetDoFuso(chute, fuso)}`);
  return isNaN(d.getTime()) ? null : d;
}

const DIAS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function rotuloDe(d: Date, fuso = FUSO_AGENDA): string {
  const p = partesNoFuso(d, fuso);
  const dd = String(p.dia).padStart(2, "0"), mm = String(p.mes).padStart(2, "0");
  return `${DIAS_PT[p.semana]} ${dd}/${mm} às ${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

const hhmmOk = (s: string) => /^\d{1,2}:\d{2}$/.test(s);
const minutosDe = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Os horários livres: varre dia a dia, slot a slot, e descarta o que bate em algo ocupado ou
// cai antes da antecedência mínima. Slots de dia inteiro ocupado vêm do chamador como Ocupado
// cobrindo o dia todo.
export function horariosLivres(ocupados: Ocupado[], r: RegrasAgenda): Opcao[] {
  const fuso = r.fuso ?? FUSO_AGENDA;
  const dias = Math.min(30, Math.max(1, Math.floor(r.dias) || 5));
  const dur = Math.min(480, Math.max(5, Math.floor(r.duracaoMin) || 30));
  const ini = hhmmOk(r.inicio) ? minutosDe(r.inicio) : 9 * 60;
  const fim = hhmmOk(r.fim) ? minutosDe(r.fim) : 18 * 60;
  const semana = new Set((r.diasSemana?.length ? r.diasSemana : [1, 2, 3, 4, 5]).map(Number));
  const maxOpc = Math.min(20, Math.max(1, Math.floor(r.maxOpcoes) || 5));
  const naoAntesDe = r.agora.getTime() + Math.max(0, r.antecedenciaMin || 0) * 60000;
  const out: Opcao[] = [];
  const hoje = partesNoFuso(r.agora, fuso);
  for (let i = 0; i < dias && out.length < maxOpc; i++) {
    // dia i à frente, no fuso: pega meio-dia UTC do "hoje" e soma dias (evita pular dia no DST)
    const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia, 12) + i * 86400000);
    const pd = partesNoFuso(base, fuso);
    if (!semana.has(pd.semana)) continue;
    const ymd = `${pd.ano}-${String(pd.mes).padStart(2, "0")}-${String(pd.dia).padStart(2, "0")}`;
    const antesDoDia = out.length;
    for (let m = ini; m + dur <= fim && out.length < maxOpc; m += dur) {
      if (r.umPorDia && out.length > antesDoDia) break;
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const s = dataNoFuso(ymd, hhmm, fuso);
      if (!s) continue;
      const e = new Date(s.getTime() + dur * 60000);
      if (s.getTime() < naoAntesDe) continue;
      const bate = ocupados.some((o) => o.inicio.getTime() < e.getTime() && o.fim.getTime() > s.getTime());
      if (bate) continue;
      out.push({ iso: s.toISOString(), rotulo: rotuloDe(s, fuso) });
    }
  }
  return out;
}

// Texto numerado pra colar no prompt da IA / na mensagem: "1) seg 15/09 às 10:00\n2) …"
export const listaNumerada = (ops: Opcao[]) => ops.map((o, i) => `${i + 1}) ${o.rotulo}`).join("\n");

// Lê o que o lead escolheu. Aceita: o NÚMERO da opção ("2", "opção 2"), um ISO, "16/09 14:00",
// "16/09/2026 14h", "16/09 às 14:30". Devolve o Date ou null se não deu pra entender.
export function lerHorarioEscolhido(texto: string, opcoes: Opcao[], agora: Date, fuso = FUSO_AGENDA): Date | null {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t) return null;
  const num = t.match(/^(?:op[cç][aã]o\s*)?(\d{1,2})\)?$/);
  if (num) {
    const o = opcoes[Number(num[1]) - 1];
    return o ? new Date(o.iso) : null;
  }
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(t)) {
    const d = new Date(texto.trim());
    return isNaN(d.getTime()) ? null : d;
  }
  // Escolha "por nome" entre as OPÇÕES OFERECIDAS: "sexta", "a de sexta de tarde", "amanhã",
  // "a primeira", "manhã". Só vale quando o texto NÃO traz uma hora explícita (aí cai nas regras
  // de baixo, que montam a data). É como o lead responde quando a IA ofereceu "quinta 10h ou sexta 14h".
  if (opcoes.length && !/\d{1,2}\s*(?::\d{2}|h)/.test(t)) {
    const hoje = partesNoFuso(agora, fuso);
    const L2 = "a-zà-ú";
    const semana: Record<string, number> = { domingo: 0, dom: 0, segunda: 1, seg: 1, terca: 2, terça: 2, ter: 2, quarta: 3, qua: 3, quinta: 4, qui: 4, sexta: 5, sex: 5, sabado: 6, sábado: 6, sab: 6, sáb: 6 };
    const mDia = t.match(new RegExp(`(?<![${L2}])(hoje|amanh[aã]|domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(?![${L2}])`));
    const mTurno = t.match(new RegExp(`(?<![${L2}])(manh[aã]|tarde|noite|cedo)(?![${L2}])`));
    const mOrd = t.match(/\b(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|últim[ao]|ultim[ao])\b/);
    if (mDia || mTurno || mOrd) {
      let cands = opcoes.map((o, i) => ({ o, i, d: new Date(o.iso) })).filter((c) => !isNaN(c.d.getTime()));
      if (mDia) {
        const chave = mDia[1].replace("ç", "c").replace("ã", "a").replace("á", "a");
        const alvoSemana = chave === "hoje" ? hoje.semana : chave === "amanha" ? (hoje.semana + 1) % 7 : semana[chave];
        cands = cands.filter((c) => partesNoFuso(c.d, fuso).semana === alvoSemana);
      }
      if (mTurno) {
        const tr = mTurno[1];
        cands = cands.filter((c) => { const h = partesNoFuso(c.d, fuso).hora; return tr === "tarde" ? h >= 12 && h < 18 : tr === "noite" ? h >= 18 : h < 12; });
      }
      if (mOrd && !mDia && !mTurno) {
        const k = /primeir/.test(mOrd[1]) ? 0 : /segund/.test(mOrd[1]) ? 1 : /terceir/.test(mOrd[1]) ? 2 : /quart/.test(mOrd[1]) ? 3 : opcoes.length - 1;
        cands = cands.filter((c) => c.i === k);
      }
      if (cands.length) return cands[0].d;
      if (mOrd || mTurno && !mDia) return null; // pediu algo que não estava nas opções
    }
  }
  // "terça 10h", "quinta às 15:30", "segunda-feira 9h", "amanhã 14h", "hoje às 16h", "sexta de manhã"
  // → a PRÓXIMA ocorrência daquele dia (hoje só se a hora ainda não passou). É o formato que o
  // fluxo do quiz pede ao lead ("responda tipo: quinta às 15h").
  // (\b não enxerga acento: "amanhã " não tem "boundary" depois do ã — por isso os lookarounds)
  const L = "a-zà-ú";
  const dia = t.match(new RegExp(`(?<![${L}])(hoje|amanh[aã]|domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|dom|seg|ter|qua|qui|sex|s[aá]b)(?![${L}])`));
  if (dia) {
    const hoje = partesNoFuso(agora, fuso);
    const nomes: Record<string, number> = { domingo: 0, dom: 0, segunda: 1, seg: 1, terca: 2, terça: 2, ter: 2, quarta: 3, qua: 3, quinta: 4, qui: 4, sexta: 5, sex: 5, sabado: 6, sábado: 6, sab: 6, sáb: 6 };
    const chave = dia[1].replace("ç", "c").replace("ã", "a").replace("á", "a");
    let delta: number;
    if (chave === "hoje") delta = 0;
    else if (chave === "amanha") delta = 1;
    else { const alvo = nomes[dia[1]] ?? nomes[chave]; delta = ((alvo - hoje.semana) + 7) % 7; }
    const hm = t.match(/(\d{1,2})(?::(\d{2}))?\s*h?(?:\s*(?:da\s+)?(manh[aã]|tarde|noite))?/);
    let hora = hm ? Number(hm[1]) : NaN;
    const min = hm && hm[2] ? Number(hm[2]) : 0;
    const turno = hm?.[3] ?? (t.match(new RegExp(`(?<![${L}])(manh[aã]|tarde|noite)(?![${L}])`))?.[1]);
    if (!hm && turno) hora = turno.startsWith("manh") ? 9 : turno === "tarde" ? 14 : 19;
    if (hm && turno && (turno === "tarde" || turno === "noite") && hora < 12) hora += 12;
    if (!Number.isFinite(hora) || hora > 23 || min > 59) return null;
    const monta = (d: number) => {
      const base = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia, 12) + d * 86400000);
      const p = partesNoFuso(base, fuso);
      return dataNoFuso(`${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`, `${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}`, fuso);
    };
    let d = monta(delta);
    if (d && delta === 0 && chave !== "hoje" && chave !== "amanha" && d.getTime() <= agora.getTime()) d = monta(7); // "terça" numa terça já passada → semana que vem
    return d;
  }
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\D+(\d{1,2})(?:[:h](\d{2}))?/);
  if (m) {
    const hoje = partesNoFuso(agora, fuso);
    let ano = m[3] ? Number(m[3]) : hoje.ano;
    if (ano < 100) ano += 2000;
    const ymd = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const hhmm = `${m[4].padStart(2, "0")}:${(m[5] ?? "00").padStart(2, "0")}`;
    const d = dataNoFuso(ymd, hhmm, fuso);
    // sem ano e já passou → é do ano que vem
    if (d && !m[3] && d.getTime() < agora.getTime() - 86400000) return dataNoFuso(`${ano + 1}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, hhmm, fuso);
    return d;
  }
  return null;
}

// Rótulo AMIGÁVEL pro lead: "hoje às 14:30" / "amanhã às 10:30" / "seg 22/09 às 10:30".
// É o que faz a proposta soar natural: quando é o mesmo dia, "hoje" convence muito mais que
// "terça 15/09" (pedido do dono, 15/09 — a IA dizia "terça 15/09" sendo que terça era hoje).
export function rotuloRelativo(d: Date, agora: Date, fuso = FUSO_AGENDA): string {
  const a = partesNoFuso(agora, fuso), p = partesNoFuso(d, fuso);
  const hh = `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  const diffDias = Math.round((Date.UTC(p.ano, p.mes - 1, p.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86400000);
  if (diffDias === 0) return `hoje às ${hh}`;
  if (diffDias === 1) return `amanhã às ${hh}`;
  return `${DIAS_PT[p.semana]} ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")} às ${hh}`;
}

// 📅 DOIS HORÁRIOS "sim ou sim", escolhidos pela HORA em que o lead chega (pedido do dono, 15/09):
//   • de manhã           → duas vagas à TARDE do mesmo dia (ex.: hoje 14:30 e hoje 16:30)
//   • perto do meio-dia  → tarde + fim de tarde do mesmo dia
//   • início da tarde    → uma HOJE mais tarde + uma AMANHÃ de manhã
//   • fim da tarde       → amanhã de manhã + amanhã à tarde
//   • fora do expediente/fim de semana → próximo dia útil de manhã + à tarde
// Sempre confere a agenda (ocupados/dias úteis/antecedência) e, se a faixa preferida estiver
// cheia, anda pra frente mantendo a intenção. Devolve no máximo 2 opções distintas.
export function sugereDoisHorarios(ocupados: Ocupado[], r: RegrasAgenda): Opcao[] {
  const fuso = r.fuso ?? FUSO_AGENDA;
  const dur = Math.min(480, Math.max(5, Math.floor(r.duracaoMin) || 30));
  const expIni = hhmmOk(r.inicio) ? minutosDe(r.inicio) : 9 * 60;
  const expFim = hhmmOk(r.fim) ? minutosDe(r.fim) : 18 * 60;
  const semana = new Set((r.diasSemana?.length ? r.diasSemana : [1, 2, 3, 4, 5]).map(Number));
  const naoAntesDe = r.agora.getTime() + Math.max(0, r.antecedenciaMin || 0) * 60000;
  const hojeP = partesNoFuso(r.agora, fuso);
  const horaAgora = hojeP.hora + hojeP.minuto / 60;
  const ehUtilHoje = semana.has(hojeP.semana);

  // Faixas-alvo (offset de dias + janela de minutos), na ordem de preferência. Cada faixa vira,
  // no máximo, UMA opção. A regra copia o que o dono descreveu.
  type Faixa = { d: number; ini: number; fim: number };
  const MEIODIA = 12 * 60, TARDE = 14 * 60, MEIOTARDE = 15 * 60 + 30, FIMTARDE = 16 * 60 + 30;
  let faixas: Faixa[];
  if (!ehUtilHoje) {
    // Fim de semana / folga: próximo dia útil (d:0 já resolve pro próximo útil), manhã + tarde.
    faixas = [{ d: 0, ini: expIni, fim: MEIODIA }, { d: 0, ini: TARDE, fim: expFim }];
  } else if (horaAgora >= 17) {
    // Depois do expediente num dia útil: amanhã de manhã + amanhã à tarde.
    faixas = [{ d: 1, ini: expIni, fim: MEIODIA }, { d: 1, ini: TARDE, fim: expFim }];
  } else if (horaAgora < 11) {
    faixas = [{ d: 0, ini: Math.max(TARDE, Math.ceil(naoAntesDeMin() / 30) * 30), fim: FIMTARDE }, { d: 0, ini: FIMTARDE, fim: expFim }];
  } else if (horaAgora < 13) {
    faixas = [{ d: 0, ini: Math.max(14 * 60 + 30, proxSlotMin()), fim: FIMTARDE }, { d: 0, ini: FIMTARDE, fim: expFim }];
  } else if (horaAgora < 16) {
    faixas = [{ d: 0, ini: proxSlotMin(), fim: expFim }, { d: 1, ini: expIni, fim: MEIODIA }];
  } else {
    faixas = [{ d: 0, ini: proxSlotMin(), fim: expFim }, { d: 1, ini: expIni, fim: MEIODIA }];
  }

  function naoAntesDeMin(): number { const p = partesNoFuso(new Date(naoAntesDe), fuso); return p.dia === hojeP.dia ? p.hora * 60 + p.minuto : 0; }
  function proxSlotMin(): number { const base = Math.ceil((horaAgora * 60 + Math.max(60, r.antecedenciaMin || 0)) / 30) * 30; return Math.min(base, expFim - dur); }

  const dataDeFaixa = (f: Faixa): { ymd: string; util: boolean } => {
    // acha o d-ésimo DIA ÚTIL a partir de hoje (offset 0 = hoje se útil, senão o próximo)
    let restam = f.d, base = new Date(Date.UTC(hojeP.ano, hojeP.mes - 1, hojeP.dia, 12));
    // primeiro, garante que "hoje" só conta se útil
    for (let i = 0; i < 14; i++) {
      const p = partesNoFuso(base, fuso);
      if (semana.has(p.semana)) { if (restam === 0) { return { ymd: `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`, util: true }; } restam--; }
      base = new Date(base.getTime() + 86400000);
    }
    return { ymd: "", util: false };
  };

  const livre = (s: Date): boolean => {
    if (s.getTime() < naoAntesDe) return false;
    const e = new Date(s.getTime() + dur * 60000);
    return !ocupados.some((o) => o.inicio.getTime() < e.getTime() && o.fim.getTime() > s.getTime());
  };
  const primeiroLivre = (ymd: string, ini: number, fim: number, evitar: Set<number>): Date | null => {
    for (let m = Math.max(expIni, ini); m + dur <= Math.min(expFim, fim); m += 30) {
      const s = dataNoFuso(ymd, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, fuso);
      if (s && !evitar.has(s.getTime()) && livre(s)) return s;
    }
    return null;
  };

  const out: Opcao[] = [];
  const usados = new Set<number>();
  for (const f of faixas) {
    if (out.length >= 2) break;
    const { ymd } = dataDeFaixa(f);
    if (!ymd) continue;
    let s = primeiroLivre(ymd, f.ini, f.fim, usados);
    // faixa cheia → varre o resto do dia; ainda cheio → próximos dias úteis, expediente inteiro
    if (!s) s = primeiroLivre(ymd, expIni, expFim, usados);
    if (!s) {
      for (let extra = 1; extra <= 10 && !s; extra++) {
        const { ymd: y2 } = dataDeFaixa({ d: f.d + extra, ini: expIni, fim: expFim });
        if (y2) s = primeiroLivre(y2, expIni, expFim, usados);
      }
    }
    if (s) { usados.add(s.getTime()); out.push({ iso: s.toISOString(), rotulo: rotuloRelativo(s, r.agora, fuso) }); }
  }
  return out;
}
