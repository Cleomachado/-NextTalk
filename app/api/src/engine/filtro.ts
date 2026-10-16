// ══ FILTRO (o "Filter" do n8n) ═══════════════════════════════════════════════════════════════
// Diferente da Condição, que bifurca em Sim/Não, o Filtro tem UMA saída: o que passa segue, o
// que não passa PARA ali. É o "só continue se…" — útil pra descartar item que não interessa
// (cobrança já paga, lead sem telefone) sem desenhar um ramo morto no canvas.
//
// Os operadores são por TIPO de dado, como no n8n: comparar "10" e "9" como texto dá "10 < 9"
// (ordem alfabética), o que estaria errado numa comparação de valor. Escolher o tipo é o que
// evita esse erro silencioso.
export type TipoFiltro = "texto" | "numero" | "data" | "booleano" | "lista";
export interface CondicaoFiltro { campo: string; tipo?: TipoFiltro; op: string; valor?: string }

const vazio = (v: string) => v.trim() === "";

// 🛡️ A regex do cliente roda NO NOSSO processo, e o processo é único e single-thread. Um padrão
// com quantificador dentro de quantificador — (a+)+, (a|a)*, (\d+)*$ — leva o motor de regex a
// backtracking exponencial: segundos, minutos ou horas de CPU travada numa entrada de 30 letras.
// Não é interrompível e não lança erro. Enquanto gira, NADA anda: nem webhook, nem fluxo de outro
// cliente, nem o painel. Um nó de filtro derrubaria a plataforma toda (auditoria 07/09).
//
// Aqui recusamos os padrões dessa família ANTES de compilar. É uma heurística — cobre os casos
// clássicos, não todos os possíveis. A defesa completa seria um motor de regex linear (RE2) ou
// rodar num worker que dá pra matar; ficou registrado no relatório como melhoria.
const QUANT = "[*+]|\\{\\d+(?:,\\d*)?\\}";
const ANINHADO = new RegExp(`\\((?:[^()\\\\]|\\\\.)*(?:${QUANT})(?:[^()\\\\]|\\\\.)*\\)\\s*(?:${QUANT})`);
const ALTERNANCIA_REPETIDA = new RegExp(`\\((?:[^()\\\\]|\\\\.)*\\|(?:[^()\\\\]|\\\\.)*\\)\\s*(?:${QUANT})`);
export function regexSegura(padrao: string): boolean {
  if (padrao.length > 200) return false;
  return !ANINHADO.test(padrao) && !ALTERNANCIA_REPETIDA.test(padrao);
}

function comoLista(v: string): unknown[] | null {
  try { const j = JSON.parse(v); return Array.isArray(j) ? j : null; } catch { return null; }
}

// Uma condição isolada. `bruto` é o valor do campo (sempre string — é assim que os campos do
// fluxo vivem); `existe` diz se o campo estava presente, que é diferente de estar vazio.
export function avaliaCondicao(c: CondicaoFiltro, bruto: string | undefined): boolean {
  const existe = bruto !== undefined;
  const v = String(bruto ?? "");
  const alvo = String(c.valor ?? "");
  const tipo = c.tipo ?? "texto";

  // Operadores comuns a todos os tipos.
  switch (c.op) {
    case "existe": return existe;
    case "nao_existe": return !existe;
    case "vazio": return vazio(v);
    case "nao_vazio": return !vazio(v);
  }

  if (tipo === "numero") {
    const a = Number(String(v).replace(",", "."));
    const b = Number(String(alvo).replace(",", "."));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false; // não dá pra comparar: não passa
    switch (c.op) {
      case "igual": return a === b;
      case "diferente": return a !== b;
      case "maior": return a > b;
      case "menor": return a < b;
      case "maior_igual": return a >= b;
      case "menor_igual": return a <= b;
      default: return false;
    }
  }

  if (tipo === "data") {
    const a = new Date(v.trim().replace(" ", "T")).getTime();
    const b = new Date(alvo.trim().replace(" ", "T")).getTime();
    if (isNaN(a) || isNaN(b)) return false;
    switch (c.op) {
      case "igual": return a === b;
      case "diferente": return a !== b;
      case "depois": return a > b;
      case "antes": return a < b;
      case "depois_igual": return a >= b;
      case "antes_igual": return a <= b;
      default: return false;
    }
  }

  if (tipo === "booleano") {
    const verdade = (x: string) => ["true", "1", "sim", "yes"].includes(x.trim().toLowerCase());
    switch (c.op) {
      case "verdadeiro": return verdade(v);
      case "falso": return !verdade(v);
      case "igual": return verdade(v) === verdade(alvo);
      case "diferente": return verdade(v) !== verdade(alvo);
      default: return false;
    }
  }

  if (tipo === "lista") {
    const arr = comoLista(v);
    if (!arr) return false;
    const n = arr.length;
    switch (c.op) {
      case "contem": return arr.some((x) => String(x) === alvo);
      case "nao_contem": return !arr.some((x) => String(x) === alvo);
      case "tam_igual": return n === Number(alvo);
      case "tam_diferente": return n !== Number(alvo);
      case "tam_maior": return n > Number(alvo);
      case "tam_menor": return n < Number(alvo);
      case "tam_maior_igual": return n >= Number(alvo);
      case "tam_menor_igual": return n <= Number(alvo);
      default: return false;
    }
  }

  // TEXTO: comparação sem caixa e sem acento — "João" e "joao" são a mesma pessoa pro filtro.
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const a = norm(v), b = norm(alvo);
  switch (c.op) {
    case "igual": return a === b;
    case "diferente": return a !== b;
    case "contem": return !!b && a.includes(b);
    case "nao_contem": return !b || !a.includes(b);
    case "comeca": return !!b && a.startsWith(b);
    case "nao_comeca": return !b || !a.startsWith(b);
    case "termina": return !!b && a.endsWith(b);
    case "nao_termina": return !b || !a.endsWith(b);
    // ⚠️ ReDoS. O try/catch aqui embaixo NUNCA protegeu contra backtracking catastrófico: uma
    // regex como ^(a+)+$ não lança exceção nenhuma — ela GIRA. E como o motor é single-thread e
    // RegExp.test é síncrono e não interrompível, o event loop congela pra TODOS os workspaces até
    // alguém reiniciar o contêiner. O teto de 200 caracteres não ajuda: ^(a|a)+$ tem 9.
    // Um cliente derruba a plataforma inteira com um nó de filtro — de propósito ou sem querer.
    // (auditoria 07/09)
    case "regex":
    case "nao_regex": {
      if (alvo.length > 200) return false;
      let bate = false;
      if (regexSegura(alvo)) {
        // Assunto curto também limita o custo: o pior caso do backtracking cresce com o tamanho
        // da entrada, e filtro de fluxo compara nome, telefone, status — não texto longo.
        try { bate = new RegExp(alvo, "i").test(v.slice(0, 500)); } catch { bate = false; }
      } else {
        console.warn(`🛡️ filtro: regex recusada por risco de travar o motor (padrão com quantificador aninhado): ${alvo.slice(0, 60)}`);
      }
      return c.op === "regex" ? bate : !bate;
    }
    default: return false;
  }
}

export function filtroPassa(condicoes: CondicaoFiltro[], fields: Record<string, string>, combinador: "e" | "ou" = "e"): boolean {
  const uteis = (condicoes ?? []).filter((c) => c?.campo?.trim());
  if (!uteis.length) return true; // filtro sem condição não segura ninguém
  const testa = (c: CondicaoFiltro) => avaliaCondicao(c, fields[c.campo.trim()]);
  return combinador === "ou" ? uteis.some(testa) : uteis.every(testa);
}
