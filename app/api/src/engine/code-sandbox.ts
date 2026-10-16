// ══ EXECUTOR DO NÓ DE CÓDIGO ═════════════════════════════════════════════════════════════════
// Roda JavaScript escrito pelo CLIENTE. É o recurso mais sensível do produto, então a decisão de
// arquitetura é: nunca no mesmo interpretador do motor.
//
// O código roda no QuickJS compilado pra WebAssembly — um interpretador SEPARADO, que por
// construção não tem `process`, `require`, `fetch`, `import`, timers nem qualquer objeto do Node.
// Confirmado na prática: `({}).constructor.constructor('return process')()` (o escape clássico de
// sandbox feito com `vm` do Node) devolve `undefined` aqui, porque não existe host pra alcançar.
//
// As três defesas, além do isolamento:
//   1. TEMPO — interrompe em 1s (laço infinito não segura a conversa nem o motor).
//   2. MEMÓRIA — teto de 16MB (não dá pra estourar a RAM do servidor alocando array gigante).
//   3. FRONTEIRA DE DADOS — entra e sai JSON serializado. Nenhum objeto do host atravessa, que é
//      justamente por onde escapes de sandbox costumam passar.
//
// Erro do código NÃO derruba a conversa: loga e o fluxo segue — mesma regra dos conectores.
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";

const LIMITE_MS = 1000;
const LIMITE_MEMORIA = 16 * 1024 * 1024;
const LIMITE_SAIDA = 100; // chaves devolvidas
const LIMITE_VALOR = 2000; // caracteres por valor

let qjs: QuickJSWASMModule | null = null;
async function motorQuickJs(): Promise<QuickJSWASMModule> {
  if (!qjs) qjs = await getQuickJS();
  return qjs;
}

// ── pt-BR dentro do sandbox ──────────────────────────────────────────────────────────────────
// O QuickJS vem SEM Intl (é build enxuto). Sem isto, `(1234.5).toLocaleString("pt-BR", {style:
// "currency", currency:"BRL"})` devolve "1234.5" e `toLocaleDateString("pt-BR")` devolve
// "08/24/2026" — formato americano — e o cliente final recebe a mensagem errada SEM ninguém
// perceber. É exatamente o que o código dos fluxos de cobrança usa, então o erro seria silencioso
// e diário. Os formatos abaixo espelham o que o Node produz de verdade (inclusive o espaço
// NÃO-QUEBRÁVEL depois de "R$", que é U+00A0, não espaço comum).
const PRELUDIO_PTBR = `
(function () {
  var agrupa = function (i) { return i.replace(/\\B(?=(\\d{3})+(?!\\d))/g, "."); };
  var num = function (n, min, max) {
    if (typeof n !== "number" || !isFinite(n)) return String(n);
    var neg = n < 0 || Object.is(n, -0); n = Math.abs(n);
    var s = max == null ? String(Math.round(n * 1000) / 1000) : n.toFixed(max);
    var p = s.split("."), i = p[0], d = p[1] || "";
    if (min != null) while (d.length < min) d += "0";
    return (neg ? "-" : "") + agrupa(i) + (d ? "," + d : "");
  };
  var ehPt = function (loc) {
    if (loc == null) return false;
    var l = Array.isArray(loc) ? loc[0] : loc;
    return typeof l === "string" && l.toLowerCase().indexOf("pt") === 0;
  };
  var moeda = function (n, o) {
    var simbolo = (o && o.currency === "BRL") ? "R$\\u00a0" : ((o && o.currency ? o.currency : "") + "\\u00a0");
    var neg = n < 0;
    return (neg ? "-" : "") + simbolo + num(Math.abs(n), 2, 2);
  };
  var pad = function (v) { return String(v).length < 2 ? "0" + v : String(v); };
  var dataBr = function (d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  var horaBr = function (d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };

  var numOrig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, o) {
    if (!ehPt(loc)) return numOrig.call(this, loc, o);
    var v = Number(this);
    if (o && o.style === "currency") return moeda(v, o);
    if (o && o.style === "percent") return num(v * 100, o.minimumFractionDigits, o.maximumFractionDigits) + "%";
    return num(v, o && o.minimumFractionDigits, o && o.maximumFractionDigits);
  };
  var dOrig = Date.prototype.toLocaleDateString, dtOrig = Date.prototype.toLocaleString, tOrig = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleDateString = function (loc, o) { return ehPt(loc) ? dataBr(this) : dOrig.call(this, loc, o); };
  Date.prototype.toLocaleTimeString = function (loc, o) { return ehPt(loc) ? horaBr(this) : tOrig.call(this, loc, o); };
  Date.prototype.toLocaleString = function (loc, o) { return ehPt(loc) ? dataBr(this) + ", " + horaBr(this) : dtOrig.call(this, loc, o); };

  // Intl mínimo: NumberFormat e DateTimeFormat são o que o código de cobrança usa.
  globalThis.Intl = {
    NumberFormat: function (loc, o) {
      return { format: function (n) { return Number(n).toLocaleString(ehPt(loc) ? "pt-BR" : loc, o); } };
    },
    DateTimeFormat: function (loc, o) {
      return { format: function (d) { return new Date(d).toLocaleDateString(ehPt(loc) ? "pt-BR" : loc, o); } };
    },
  };
})();
`;

export interface ResultadoCodigo {
  ok: boolean;
  campos: Record<string, string>; // o que o código devolveu (vira variável do fluxo)
  logs: string[];                 // console.log do código, pra mostrar no painel
  erro?: string;
}

// `campos` entram como $campos (e $json, pra quem vem do n8n). O `return` de um objeto vira
// variável nova do fluxo. Retornar outra coisa (ou nada) não quebra: só não gera campo.
export async function rodaCodigo(codigo: string, campos: Record<string, string>): Promise<ResultadoCodigo> {
  const logs: string[] = [];
  if (!String(codigo ?? "").trim()) return { ok: true, campos: {}, logs };

  let vm: ReturnType<QuickJSWASMModule["newContext"]> | null = null;
  // O RUNTIME precisa ser liberado junto com o contexto. Liberar só o `vm` deixava um runtime
  // WASM órfão por execução — cada passagem por um nó de código vazava memória do motor até o
  // contêiner ser reiniciado. (Ordem obrigatória no dispose: contexto primeiro, runtime depois.)
  let runtime: ReturnType<QuickJSWASMModule["newRuntime"]> | null = null;
  try {
    const QuickJS = await motorQuickJs();
    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(LIMITE_MEMORIA);
    const limite = Date.now() + LIMITE_MS;
    runtime.setInterruptHandler(() => Date.now() > limite);
    vm = runtime.newContext();

    // console.log do cliente → array de strings (o painel mostra). Não escreve no log do servidor:
    // um laço com console.log inundaria o log de produção de todos os workspaces.
    const consoleObj = vm.newObject();
    const fnLog = vm.newFunction("log", (...args) => {
      if (logs.length < 50) logs.push(args.map((a) => { try { return String(vm!.dump(a)); } catch { return "?"; } }).join(" ").slice(0, 500));
    });
    vm.setProp(consoleObj, "log", fnLog);
    vm.setProp(vm.global, "console", consoleObj);
    fnLog.dispose(); consoleObj.dispose();

    // FRONTEIRA: os dados entram como texto JSON e são parseados DENTRO do sandbox. Nenhum objeto
    // do host cruza — é o que fecha a porta que os escapes de sandbox costumam usar.
    const entradaJson = JSON.stringify(campos ?? {});
    const preparo = vm.evalCode(
      PRELUDIO_PTBR
      + `globalThis.$campos = ${entradaJson}; globalThis.$json = globalThis.$campos;`
      // `import()` existe na sintaxe mas não carrega nada (não há loader de módulo). Deixar solto
      // devolveria uma Promise eternamente pendente e o cliente acharia que "quase funciona".
      + `globalThis.require = undefined;`
      + `undefined`,
    );
    if (preparo.error) preparo.error.dispose(); else preparo.value.dispose();

    // O código do cliente vira corpo de função: `return {...}` funciona como no n8n.
    const r = vm.evalCode(`(function(){\n${codigo}\n})()`);
    if (r.error) {
      const e = vm.dump(r.error);
      r.error.dispose();
      const msg = (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e)).slice(0, 300);
      return { ok: false, campos: {}, logs, erro: msg || "erro no código" };
    }

    const devolvido = vm.dump(r.value);
    r.value.dispose();

    const saida: Record<string, string> = {};
    if (devolvido && typeof devolvido === "object" && !Array.isArray(devolvido)) {
      for (const [k, v] of Object.entries(devolvido).slice(0, LIMITE_SAIDA)) {
        if (v == null) continue;
        saida[String(k).replace(/[^\w]/g, "_").slice(0, 60)] =
          (typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, LIMITE_VALOR);
      }
    }
    return { ok: true, campos: saida, logs };
  } catch (e: any) {
    // Interrupção por tempo/memória cai aqui — a mensagem crua ("interrupted") não diz nada
    // pro cliente, então traduz.
    const cru = String(e?.message ?? e);
    const amigavel = /interrupt/i.test(cru) ? `o código passou de ${LIMITE_MS}ms e foi interrompido (laço infinito?)`
      : /memory|out of memory/i.test(cru) ? "o código estourou o limite de memória"
      : cru.slice(0, 300);
    return { ok: false, campos: {}, logs, erro: amigavel };
  } finally {
    try { vm?.dispose(); } catch { /* já liberado */ }
    try { runtime?.dispose(); } catch { /* já liberado */ }
  }
}
