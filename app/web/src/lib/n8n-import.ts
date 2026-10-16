// ══ IMPORTAR FLUXO DO n8n ════════════════════════════════════════════════════════════════════
// Quem já roda a operação no n8n exporta o JSON de lá e importa aqui — sem remontar nada na mão.
// (Pedido do dono, 25/08: um cliente tem 6 fluxos de alerta de rastreador rodando em n8n e traz os
// clientes dele se conseguir migrar por importação.)
//
// NÃO é tradução nó-a-nó: o n8n tem muito ENCANAMENTO que aqui não existe (nós "Set" que só
// recopiam o mesmo campo, "Set" que guarda credencial da Evolution, "extractFromFile"…). Traduzir
// tudo literalmente produziria um fluxo ilegível cheio de nós que não fazem nada. Então o
// importador RECONHECE PADRÕES: descarta o encanamento, colapsa a sequência
// "baixar mp3 → extrair → enviar áudio" num passo de áudio só, e RELIGA as pontas por cima do que
// tirou — senão o grafo quebraria no meio.
//
// O que não tem equivalente vira AVISO, nunca sumiço silencioso: a pessoa precisa saber o que não
// veio junto antes de publicar.
import type { Automation, Step, StepBody, FlowEdge } from "./client";

export interface ResultadoN8n {
  auto: Omit<Automation, "id">;
  avisos: string[];
  convertidos: number;
  descartados: number;
}

export function ehFluxoN8n(j: unknown): boolean {
  const o = j as { nodes?: unknown; connections?: unknown };
  return !!o && Array.isArray(o.nodes) && !!o.connections && typeof o.connections === "object";
}

type NoN8n = { name: string; type: string; parameters?: Record<string, any>; position?: number[]; disabled?: boolean };
type Conexoes = Record<string, { main?: Array<Array<{ node: string }>> }>;

// ── Tradução de expressão do n8n → variável do ZapConverte ───────────────────────────────────
// O n8n referencia o payload por caminho completo, de três jeitos diferentes:
//   {{ $('Webhook1').item.json.body.device.vin }}
//   {{ $item("0").$node["Webhook1"].json["body"]["device"]["object_owner"] }}
//   {{ $json.body.message }}
// Aqui tudo isso vira o nome achatado que o gatilho de webhook produz: {{device_vin}}, {{message}}.
export function traduzExpressao(valor: unknown): string {
  let s = String(valor ?? "");
  if (s.startsWith("=")) s = s.slice(1); // "=" marca expressão no n8n
  return s.replace(/\{\{([\s\S]*?)\}\}/g, (todo, dentro: string) => {
    const nome = variavelDoCaminho(dentro);
    return nome ? `{{${nome}}}` : todo;
  });
}

function variavelDoCaminho(expr: string): string | null {
  // ["body"]["device"] → .body.device. Nome com espaço/hífen vira underscore: ["URL Evolution"]
  // → .URL_Evolution, senão a captura pararia na primeira palavra e devolveria "URL".
  const norm = String(expr).replace(/\[\s*["']([^"']+)["']\s*\]/g, (_t, k: string) => "." + String(k).replace(/\W/g, "_"));
  // Três origens, nesta ordem:
  //  1. payload do webhook — $('Webhook1').item.json.body.device.vin → device_vin
  //  2. campo criado por um nó ANTERIOR (Set/Code) — $('informaçoes').item.json.apikey → apikey
  //  3. o item corrente — $json.mensagem → mensagem
  // Sem a 2 e a 3, texto que referencia um Set anterior era importado LITERAL
  // ("{{ $json.mensagem }}" ia parar na mensagem do cliente final).
  const m = norm.match(/\.body((?:\.\w+)+)/)
    ?? norm.match(/\.json((?:\.\w+)+)/)
    ?? norm.match(/\$json((?:\.\w+)+)/);
  if (!m) return null;
  const partes = m[1].slice(1).split(".");
  // ".body.address.replace(…)" — o último pedaço é chamada de método, não campo.
  if (norm[(m.index ?? 0) + m[0].length] === "(") partes.pop();
  // "item" e "first" são navegação do n8n, não campo.
  while (partes.length && ["item", "first", "last", "all"].includes(partes[0])) partes.shift();
  return partes.length ? partes.join("_") : null;
}

// Campos de um nó httpRequest do n8n, como mapa chave→valor já traduzido.
function corpoHttp(p: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of p?.bodyParameters?.parameters ?? []) {
    if (c?.name) out[String(c.name)] = traduzExpressao(c.value);
  }
  return out;
}

// ── EVOLUTION API → nós nativos ──────────────────────────────────────────────────────────────
// A Evolution é uma API de WhatsApp que muita gente usa junto com o n8n. Quem importa um fluxo
// desses está MIGRANDO pra cá — então manter as chamadas apontando pra Evolution seria trazer o
// problema junto: o cliente continuaria pagando/mantendo aquele servidor, e a mensagem sairia por
// um número que não é o que ele conectou aqui.
//
// Por isso todo endpoint de ENVIO da Evolution vira o passo nativo equivalente: o fluxo importado
// já sai pelo WhatsApp conectado no ZapConverte, sem reconfigurar nada. O destinatário (`number`)
// é ignorado de propósito — aqui quem recebe é o lead da conversa (ou o item do Loop).
function passoDaEvolution(url: string, p: Record<string, any>): StepBody | null {
  const m = url.match(/\/message\/(\w+)/i) ?? url.match(/\/chat\/(\w+)/i);
  if (!m) return null;
  const b = corpoHttp(p);
  switch (m[1].toLowerCase()) {
    case "sendtext":
      return { type: "text", text: b.text || b.message || "" };
    case "sendlocation":
      return {
        type: "location",
        lat: b.latitude || "{{latitude}}", lng: b.longitude || "{{longitude}}",
        nome: b.name || "", endereco: b.address || "",
      };
    case "sendwhatsappaudio":
    case "sendaudio":
      return { type: "ptt", file: b.audio || b.media || "" };
    case "sendmedia":
      return {
        type: "media",
        mediaType: (b.mediatype || b.mediaType || "image") as any,
        file: b.media || "", caption: b.caption || undefined,
      };
    case "sendsticker":
      return { type: "media", mediaType: "image", file: b.sticker || b.media || "" };
    case "sendbuttons": {
      // O formato dos botões varia entre versões da Evolution; o texto sempre vem, os rótulos nem
      // sempre. Traz o que der e deixa a pessoa completar em vez de perder o passo inteiro.
      const rotulos = Object.entries(b).filter(([k]) => /^button/i.test(k)).map(([, v]) => String(v)).filter(Boolean);
      return { type: "buttons", text: b.text || b.description || b.title || "", buttons: rotulos.slice(0, 3) };
    }
    default:
      return null; // endpoint da Evolution que não é envio (ex.: getBase64FromMediaMessage)
  }
}

const SETS_DE_CREDENCIAL = new Set(["url", "instace", "instancia", "apykey", "apikey", "url evolution"]);

export function converteN8n(j: any): ResultadoN8n {
  const nos: NoN8n[] = (j.nodes ?? []).filter((n: NoN8n) => n && n.name && n.type);
  const conexoes: Conexoes = j.connections ?? {};
  const avisos: string[] = [];
  const naoSuportados = new Map<string, number>();
  const anota = (rotulo: string) => naoSuportados.set(rotulo, (naoSuportados.get(rotulo) ?? 0) + 1);

  // O mp3 do áudio é baixado num nó separado — guardo a URL pra colar no passo de áudio.
  const urlsAudio = new Set<string>();
  for (const n of nos) {
    const u = String(n.parameters?.url ?? "");
    if (n.type.endsWith("httpRequest") && /\.(mp3|ogg|m4a|wav)(\?|$)/i.test(u)) urlsAudio.add(u);
  }

  // ── 1. Classificar cada nó ─────────────────────────────────────────────────────────────────
  const passoDe = new Map<string, StepBody>();   // nós que viram passo aqui
  let ehGatilhoWebhook = false;
  let ehGatilhoSchedule = false;
  let listaDoSplit = ""; // campo que o Split Out produziu — o Loop seguinte herda
  let precisaChave = 0;   // passos de HTTP que esperam uma chave que o n8n não exporta
  let credenciaisTiradas = 0; // chave de API que vinha em claro no arquivo e não vai pro fluxo
  let daEvolution = 0; // quantos envios saíam pela Evolution e agora usam o WhatsApp daqui
  let cronDoN8n = "";
  let semTempo = 0;

  for (const n of nos) {
    const p = n.parameters ?? {};
    const t = n.type;

    if (t.endsWith("stickyNote")) {
      const txt = String(p.content ?? "").replace(/^#+\s*/gm, "").trim();
      if (txt) passoDe.set(n.name, { type: "note", text: txt });
      continue;
    }
    if (t.endsWith(".webhook")) { ehGatilhoWebhook = true; continue; } // vira o gatilho, não um passo
    // Schedule Trigger do n8n → gatilho por horário daqui. O n8n guarda a recorrência de dois
    // jeitos: cronExpression (custom) ou intervalo montado nos campos (triggerAtHour/Minute…).
    if (t.endsWith("scheduleTrigger")) {
      ehGatilhoSchedule = true;
      cronDoN8n = cronDoScheduleTrigger(p) || cronDoN8n;
      continue;
    }
    if (t.endsWith("manualTrigger") || t.endsWith("errorTrigger") || t.endsWith("chatTrigger")) {
      anota("outro gatilho do n8n");
      continue;
    }

    if (t.includes("evolutionApi")) {
      daEvolution++;
      if (String(p.operation ?? "") === "send-audio") {
        const url = [...urlsAudio][0] ?? "";
        if (!url) anota("áudio sem arquivo identificado");
        passoDe.set(n.name, { type: "ptt", file: url });
      } else {
        passoDe.set(n.name, { type: "text", text: traduzExpressao(p.messageText) });
      }
      continue;
    }

    if (t.endsWith("httpRequest")) {
      const url = String(p.url ?? "");
      // Evolution primeiro: envio dela vira passo NATIVO (o fluxo passa a usar o WhatsApp daqui).
      const nativo = passoDaEvolution(url, p);
      if (nativo) { passoDe.set(n.name, nativo); daEvolution++; continue; }
      if (/sendLocation/i.test(url)) {
        const b = corpoHttp(p);
        passoDe.set(n.name, {
          type: "location",
          lat: b.latitude || "{{latitude}}",
          lng: b.longitude || "{{longitude}}",
          nome: b.name || "",
          endereco: b.address || "",
        });
        continue;
      }
      if (/sendText/i.test(url)) {
        const b = corpoHttp(p);
        passoDe.set(n.name, { type: "text", text: b.text || "" });
        continue;
      }
      if (/\.(mp3|ogg|m4a|wav)(\?|$)/i.test(url)) continue; // já colapsado no passo de áudio
      // ASAAS → nó NATIVO. Os dois padrões dos fluxos de cobrança de um cliente: listar cobranças
      // (GET /v3/payments com filtros) e buscar o cliente da cobrança (GET /v3/customers/{id}).
      // A chave sai de Integrações → Asaas (uma vez só) em vez de ser colada em cada passo HTTP.
      if (/api(-sandbox)?\.asaas\.com/i.test(url)) {
        const metodo = String(p.method ?? "GET").toUpperCase();
        const deQuery = ((p.queryParameters?.parameters ?? []) as any[]).filter((c: any) => c?.name);
        const q = new Map(deQuery.map((c: any) => [String(c.name), String(c.value ?? "")]));
        if (metodo === "GET" && /\/v3\/payments(\?|$)/i.test(url)) {
          const status = String(q.get("status") ?? "").trim();
          // dueDate[ge]/[le] no n8n costuma ser expressão (data calculada num nó de código) — o
          // recorte "venceu há N dias" sai do PRÓPRIO código quando dá ("getDate() - 3"), senão
          // fica sem filtro de data e o aviso manda conferir.
          const temFiltroData = q.has("dueDate[ge]") || q.has("dueDate[le]");
          let dias: number | undefined;
          if (temFiltroData) {
            for (const outro of nos) {
              if (!outro.type.endsWith(".code")) continue;
              const m = String(outro.parameters?.jsCode ?? "").match(/getDate\(\)\s*-\s*(\d+)/);
              if (m) { dias = Number(m[1]); break; }
            }
            if (dias === undefined && /hoje|today/i.test(String(j.name ?? ""))) dias = 0;
          }
          passoDe.set(n.name, {
            type: "asaas", acao: "listar_cobrancas",
            filtroStatus: /^[A-Z_]+$/.test(status) ? status : "",
            ...(dias !== undefined ? { filtroVencidoDias: dias } : {}),
            salvarEm: "resposta",
          });
          if (temFiltroData) {
            avisos.push(dias !== undefined
              ? `O passo do Asaas ficou como "venceu há ${dias} dia(s)" (deduzi do código que calculava a data) — abra o nó e confira.`
              : "O filtro de vencimento do Asaas vinha de uma expressão — abra o nó de listar cobranças e escolha o recorte de data.");
          }
          continue;
        }
        if (metodo === "GET" && /\/v3\/customers\//i.test(url)) {
          passoDe.set(n.name, {
            type: "asaas", acao: "buscar_cliente", buscarPor: "cliente",
            valorBusca: traduzExpressao(p.url).replace(/^.*\/customers\//i, ""),
            salvarEm: "resposta",
          });
          continue;
        }
        // Outros endpoints do Asaas caem no HTTP genérico logo abaixo (com o aviso da chave).
      }
      // HTTP genérico (API de fora) → nosso nó de HTTP, que agora tem método, autenticação e
      // leitura da resposta. A CREDENCIAL não vem: no n8n ela mora fora do workflow, então o
      // arquivo exportado não a contém — quem importa precisa colar a chave aqui.
      {
        const metodo = String(p.method ?? "GET").toUpperCase();
        const suportado = metodo === "GET" || metodo === "POST" || metodo === "PUT";
        const deQuery = (p.queryParameters?.parameters ?? []) as any[];
        const deBody = (p.bodyParameters?.parameters ?? []) as any[];
        const origem = metodo === "GET" ? deQuery : (deBody.length ? deBody : deQuery);
        passoDe.set(n.name, {
          type: "webhook_out",
          url: traduzExpressao(p.url),
          metodo: (suportado ? metodo : "GET") as "GET" | "POST" | "PUT",
          campos: origem.map((c: any) => ({ chave: String(c?.name ?? ""), valor: traduzExpressao(c?.value) })).filter((c: any) => c.chave),
          authTipo: p.authentication ? "header" : "nenhuma",
          salvarEm: "resposta",
        });
        if (!suportado) anota(`método ${metodo} ainda não disponível — o passo veio como GET`);
        if (p.authentication) precisaChave++;
      }
      continue;
    }

    if (t.endsWith(".switch")) {
      const regras = p.rules?.values ?? [];
      passoDe.set(n.name, {
        type: "switch",
        campo: campoDoSwitch(regras) || "message",
        casos: regras.map((r: any, i: number) => {
          const c = r?.conditions?.conditions?.[0] ?? {};
          const op = String(c?.operator?.operation ?? "contains");
          return {
            rotulo: String(r?.outputKey ?? `Caso ${i + 1}`).replace(/^=/, "").trim() || `Caso ${i + 1}`,
            valor: String(c?.rightValue ?? "").replace(/^=/, "").trim(),
            op: op === "equals" ? ("igual" as const) : ("contem" as const),
          };
        }),
      });
      continue;
    }

    // Filter do n8n → nosso Filtro (uma saída, com tipos e operadores). O If continua virando
    // Condição, que é o que ele é: bifurca em Sim/Não.
    if (t.endsWith(".filter")) {
      const lista = (p.conditions?.conditions ?? []) as any[];
      passoDe.set(n.name, {
        type: "filter",
        combinador: String(p.conditions?.combinator ?? "and") === "or" ? "ou" : "e",
        condicoes: lista.map((c: any) => {
          const { tipo, op } = opDoN8n(c?.operator);
          return {
            campo: variavelDoCaminho(String(c?.leftValue ?? "")) ?? "message",
            tipo, op,
            valor: String(c?.rightValue ?? "").replace(/^=/, "").trim(),
          };
        }).filter((c: any) => c.campo),
      });
      continue;
    }
    if (t.endsWith(".if")) {
      const c = p.conditions?.conditions?.[0] ?? {};
      const campo = variavelDoCaminho(String(c?.leftValue ?? "")) ?? "message";
      const op = String(c?.operator?.operation ?? "contains");
      passoDe.set(n.name, {
        type: "condition", checa: "campo", campo,
        op: op === "equals" ? "igual" : op === "exists" ? "existe" : "contem",
        valor: String(c?.rightValue ?? "").replace(/^=/, "").trim(),
      });
      continue;
    }

    if (t.endsWith(".set")) {
      const atrib = p.assignments?.assignments ?? [];
      const nomes = atrib.map((a: any) => String(a?.name ?? "").toLowerCase());
      if (nomes.length && nomes.every((x: string) => SETS_DE_CREDENCIAL.has(x) || x.startsWith("body."))) {
        // Só credencial da Evolution e/ou recópia do mesmo campo — encanamento do n8n.
        continue;
      }
      // Set com dados de verdade → "Editar campos", que guarda TODOS. Antes só o primeiro vinha
      // e os outros sumiam calados.
      const lista = atrib
        .map((a: any) => ({ campo: String(a?.name ?? "").replace(/^body\./, "").replace(/[^\w]/g, "_"), valor: traduzExpressao(a?.value) }))
        .filter((c: any) => c.campo);
      // Set MISTO (mensagem + credencial da Evolution) é o caso comum: a chave da API vem em
      // TEXTO CLARO no arquivo exportado. Como os envios já migraram pro WhatsApp daqui, esses
      // campos não servem pra nada — e guardar chave de terceiro dentro do fluxo do cliente é
      // criar um vazamento novo na importação. Ficam de fora.
      const uteis = lista.filter((c: any) => !SETS_DE_CREDENCIAL.has(c.campo.toLowerCase().replace(/_/g, " ")));
      if (uteis.length < lista.length) credenciaisTiradas += lista.length - uteis.length;
      if (uteis.length) passoDe.set(n.name, { type: "edit_fields", campos: uteis, salvarNaFicha: false });
      continue;
    }

    if (t.endsWith(".wait")) {
      // No n8n o tempo pode ser uma EXPRESSÃO (ex.: aleatório entre 5 e 25s). Number() disso dá
      // NaN e cairia no padrão sem ninguém saber — então conta como "sem tempo" e avisa.
      const qtd = Number(p.amount);
      const un = String(p.unit ?? "seconds");
      if (!Number.isFinite(qtd) || qtd <= 0) { semTempo++; passoDe.set(n.name, { type: "wait", ms: 3000 }); continue; }
      const mult = un === "minutes" ? 60_000 : un === "hours" ? 3_600_000 : un === "days" ? 86_400_000 : 1000;
      passoDe.set(n.name, { type: "wait", ms: Math.round(qtd * mult) });
      continue;
    }

    // Loop Over Items (splitInBatches) → nó de Loop daqui. O n8n usa pra percorrer a lista que
    // veio de uma API; aqui cada item vira um disparo pra aquela pessoa.
    if (t.endsWith(".code")) {
      const js = String(p.jsCode ?? p.pythonCode ?? "").trim();
      if (p.pythonCode && !p.jsCode) { anota("código em Python — aqui o nó roda JavaScript, traduza antes de publicar"); }
      // O n8n usa $json / $('Nó').item.json; aqui é $campos (o prelúdio do sandbox também expõe
      // $json, então a maioria do código funciona sem tocar).
      passoDe.set(n.name, { type: "code", codigo: js || "// cole aqui o código\nreturn {};" });
      continue;
    }
    // Split Out do n8n: lá ele "explode" 1 item em N; aqui quem cria N execuções é o Loop, então
    // este nó faz a metade que falta — achar e normalizar a lista.
    if (t.endsWith("splitOut")) {
      const campo = String(p.fieldToSplitOut ?? "data").trim().replace(/[^\w.]/g, "");
      const saida = (campo.replace(/[^\w]/g, "_") || "lista") + "_itens";
      passoDe.set(n.name, { type: "split_out", campo: `resposta_${campo}`, salvarEm: saida });
      listaDoSplit = saida; // o Loop seguinte já nasce apontando pra ela
      continue;
    }
    if (t.endsWith("splitInBatches")) {
      // Se um Split Out veio antes, o Loop já sabe qual campo percorrer — sem isso ele nascia
      // vazio e a pessoa tinha que adivinhar o nome.
      passoDe.set(n.name, { type: "loop", lista: listaDoSplit, campoTelefone: "telefone", limite: 50, intervaloMs: 8000 });
      // `avisos` direto, não `anota()`: o laço FOI importado. Passar por "não suportados" faria a
      // mensagem sair com "ficou de fora" e a pessoa procuraria um nó que está ali.
      avisos.push(listaDoSplit
        ? `O laço vai percorrer {{${listaDoSplit}}} — confira o campo do telefone dentro de cada item antes de publicar.`
        : "O laço precisa saber QUAL campo tem a lista e onde está o telefone de cada item — abra o nó antes de publicar.");
      continue;
    }
    if (t.endsWith("extractFromFile") || t.endsWith("convertToFile") || t.endsWith(".noOp")) continue; // encanamento

    anota(nomeAmigavel(t));
  }

  if (semTempo) avisos.push(`${semTempo} nó(s) de espera vieram do n8n sem tempo configurado — coloquei 3 segundos. Confira se era isso que você queria.`);

  // ── 2. Arestas, religando por cima do que foi descartado ───────────────────────────────────
  // Sem isto o grafo quebraria: metade das ligações do n8n passa por nós de encanamento.
  const mantido = (nome: string) => passoDe.has(nome);
  function primeirosMantidos(nome: string, vistos = new Set<string>()): string[] {
    if (mantido(nome)) return [nome];
    if (vistos.has(nome)) return [];
    vistos.add(nome);
    return (conexoes[nome]?.main ?? []).flat().flatMap((s) => primeirosMantidos(s?.node ?? "", vistos));
  }

  const idDe = new Map<string, string>();
  [...passoDe.keys()].forEach((nome, i) => idDe.set(nome, "s" + i));

  const steps: Step[] = [...passoDe.entries()].map(([nome, corpo]) => ({ ...corpo, _id: idDe.get(nome)! } as Step));
  const edges: FlowEdge[] = [];
  const jaLigado = new Set<string>();
  const liga = (de: string, para: string, handle?: string) => {
    const id = `${de}->${para}:${handle ?? ""}`;
    if (jaLigado.has(id)) return;
    jaLigado.add(id);
    edges.push({ id: "e" + edges.length, source: de, target: para, ...(handle ? { sourceHandle: handle } : {}) });
  };

  for (const [nome, corpo] of passoDe) {
    const saidas = conexoes[nome]?.main ?? [];
    saidas.forEach((lista, i) => {
      const handle = corpo.type === "switch" ? "c" + i
        : corpo.type === "condition" ? (i === 0 ? "sim" : "nao")
        // No n8n o Loop tem saída 0 = "done" e 1 = "loop"; aqui são "done" e "item".
        : corpo.type === "loop" ? (i === 0 ? "done" : "item")
        : undefined;
      for (const alvo of lista ?? []) {
        for (const destino of primeirosMantidos(alvo?.node ?? "")) {
          if (destino !== nome) liga(idDe.get(nome)!, idDe.get(destino)!, handle);
        }
      }
    });
  }

  // Gatilho → primeiro(s) nó(s) reais depois do webhook
  const noWebhook = nos.find((n) => n.type.endsWith(".webhook"));
  if (noWebhook) {
    for (const alvo of (conexoes[noWebhook.name]?.main ?? []).flat()) {
      for (const destino of primeirosMantidos(alvo?.node ?? "")) liga("trigger", idDe.get(destino)!);
    }
  } else if (steps.length) {
    // Sem gatilho de webhook (ex.: fluxo por horário): liga no primeiro passo pra não nascer solto.
    liga("trigger", steps[0]._id!);
  }

  // ── 3. Onde está o telefone: sai do próprio remoteJid usado nos envios ─────────────────────
  const caminhos = nos
    .filter((n) => n.type.includes("evolutionApi") && n.parameters?.remoteJid)
    .map((n) => (variavelDoCaminho(String(n.parameters!.remoteJid)) ?? "").replace(/_/g, "."))
    .filter(Boolean);
  const campoTelefone = maisComum(caminhos);

  // ── 4. Posições: desenho PRÓPRIO, não as coordenadas do n8n ────────────────────────────────
  // Copiar a posição do n8n parecia o caminho óbvio e estava errado: lá os nós ficam de 224 em
  // 224px e o NOSSO nó tem 230px de largura — ou seja, um sempre encostava/cobria o outro, e os
  // ramos (Loop, Switch) empilhavam por cima porque lá o desvio vertical é de 64px e aqui o nó
  // mais baixo tem mais que isso. Além disso, o desenho do n8n vem do que a pessoa arrastou lá,
  // com nós de encanamento que aqui foram descartados — sobravam buracos no meio da linha.
  // Então o desenho é RECALCULADO a partir do grafo: uma coluna por profundidade, e dentro da
  // coluna os ramos empilhados com folga.
  const PASSO_X = 330;   // 230 do nó + 100 de respiro
  const RESPIRO_Y = 44;
  const TOPO = 40;
  const ENTRE_FAIXAS = 180;
  const ALTURA_GATILHO = 74;
  // Altura APROXIMADA de cada nó — o que decide o respiro. Errar pra mais só afasta; errar pra
  // menos volta a sobrepor, então os nós com saídas listadas (Switch, Loop, Condição) contam alto.
  const alturaDo = (st: Step): number =>
    st.type === "switch" ? 78 + 26 * (((st as { casos?: unknown[] }).casos?.length ?? 1) + 1)
    : st.type === "loop" ? 130
    : st.type === "condition" ? 112
    : st.type === "note" ? 100
    : 70;

  const filhos = new Map<string, string[]>();
  for (const e of edges) filhos.set(e.source, [...(filhos.get(e.source) ?? []), e.target]);

  // Profundidade = caminho MAIS LONGO desde a semente (assim ninguém fica à esquerda de quem o
  // alimenta). `naPilha` corta a aresta de volta — o Loop fecha ciclo de propósito e sem isso a
  // conta não terminaria. `orcamento` é só cinto de segurança pra grafo muito ramificado.
  function profundidades(sementes: string[], vale: (id: string) => boolean): Map<string, number> {
    const nivel = new Map<string, number>();
    const naPilha = new Set<string>();
    let orcamento = 20000;
    const anda = (id: string, d: number) => {
      if (orcamento-- < 0 || naPilha.has(id) || !vale(id)) return;
      if ((nivel.get(id) ?? -1) >= d) return;
      nivel.set(id, d);
      naPilha.add(id);
      for (const f of filhos.get(id) ?? []) anda(f, d + 1);
      naPilha.delete(id);
    };
    for (const s of sementes) anda(s, 0);
    return nivel;
  }

  // Ordem dentro da coluna: mantém em cima quem estava em cima no n8n (o ramo "de cima" continua
  // sendo o de cima), com o id como desempate pra o resultado não variar entre importações.
  const yDoN8n = new Map<string, number>();
  for (const n of nos) {
    const id = idDe.get(n.name);
    if (id && Array.isArray(n.position)) yDoN8n.set(id, Number(n.position[1]) || 0);
  }
  const alturaPorId = new Map<string, number>([["trigger", ALTURA_GATILHO]]);
  for (const st of steps) alturaPorId.set(st._id!, alturaDo(st));

  const layout: Record<string, { x: number; y: number }> = {};
  // Desenha uma FAIXA (o grafo alcançável a partir das sementes) começando em `topo`; devolve
  // onde ela terminou, pra próxima faixa começar abaixo sem encostar.
  function desenhaFaixa(nivel: Map<string, number>, topo: number): number {
    const colunas = new Map<number, string[]>();
    for (const [id, d] of nivel) colunas.set(d, [...(colunas.get(d) ?? []), id]);
    const alturaDaColuna = new Map<number, number>();
    let alturaDaFaixa = 0;
    for (const [d, ids] of colunas) {
      const total = ids.reduce((s, id) => s + (alturaPorId.get(id) ?? 70), 0) + RESPIRO_Y * (ids.length - 1);
      alturaDaColuna.set(d, total);
      alturaDaFaixa = Math.max(alturaDaFaixa, total);
    }
    const meio = topo + alturaDaFaixa / 2; // colunas curtas ficam centradas na faixa
    for (const [d, ids] of colunas) {
      ids.sort((a, b) => (yDoN8n.get(a) ?? 0) - (yDoN8n.get(b) ?? 0) || a.localeCompare(b));
      let y = meio - alturaDaColuna.get(d)! / 2;
      for (const id of ids) {
        layout[id] = { x: 40 + d * PASSO_X, y: Math.round(y) };
        y += (alturaPorId.get(id) ?? 70) + RESPIRO_Y;
      }
    }
    return topo + alturaDaFaixa;
  }

  let topo = desenhaFaixa(profundidades(["trigger"], () => true), TOPO) + ENTRE_FAIXAS;

  // Passo que o gatilho não alcança (já estava solto no n8n, ou perdeu a entrada quando o
  // encanamento foi descartado) não tem coluna. Em vez de largar num canto — ou pior, empilhar
  // todos numa fileira onde as setas voltam pra trás —, cada pedaço solto vira uma faixa embaixo,
  // desenhada pela mesma regra. O aviso "ficaram soltos" diz o que fazer com eles.
  const sobrando = new Set(steps.map((st) => st._id!).filter((id) => !layout[id]));
  while (sobrando.size) {
    const restantes = steps.map((st) => st._id!).filter((id) => sobrando.has(id)); // ordem estável
    const alimentado = new Set(edges.filter((e) => sobrando.has(e.source) && sobrando.has(e.target)).map((e) => e.target));
    const sementes = restantes.filter((id) => !alimentado.has(id));
    const nivel = profundidades(sementes.length ? sementes : [restantes[0]], (id) => sobrando.has(id));
    if (!nivel.size) { for (const id of restantes) layout[id] = { x: 40, y: topo }; break; } // trava impossível: não deixa nó sem posição
    topo = desenhaFaixa(nivel, topo) + ENTRE_FAIXAS;
    for (const id of nivel.keys()) sobrando.delete(id);
  }
  if (!layout.trigger) layout.trigger = { x: 40, y: TOPO };

  // ── 4b. DADOS FIXADOS (pinData) ────────────────────────────────────────────────────────────
  // No n8n dá pra "pinar" a saída de um nó: ele para de rodar de verdade e devolve sempre aquele
  // exemplo. Muita gente esquece o pino ligado e o fluxo em produção fica alimentado por um dado
  // de teste — foi assim que o gatilho por horário de um cliente saía com
  // [{"isArtificialRecoveredEventItem": true}]. Não dá pra trazer o pino como comportamento (aqui
  // o nó sempre roda de verdade), mas SUMIR com a informação seria pior: o pino fica desenhado no
  // nó com o JSON no tooltip, pra pessoa saber o que estava travado lá.
  const pinData: Record<string, string> = {};
  for (const [nome, valor] of Object.entries((j.pinData ?? {}) as Record<string, unknown>)) {
    const alvo = idDe.get(nome) ?? ((noWebhook?.name === nome || nos.find((n) => n.name === nome && n.type.endsWith("scheduleTrigger"))) ? "trigger" : "");
    if (!alvo) continue;
    try { pinData[alvo] = JSON.stringify(valor).slice(0, 2000); } catch { /* dado impossível de serializar */ }
  }
  if (Object.keys(pinData).length) {
    avisos.push(`${Object.keys(pinData).length} nó(s) estavam com DADOS FIXADOS no n8n (o pino) — aqui eles rodam de verdade. O nó ficou marcado com um pino e o dado antigo está no tooltip; confira antes de publicar.`);
  }

  // ── 5. Avisos ──────────────────────────────────────────────────────────────────────────────
  for (const [rotulo, n] of naoSuportados) avisos.push(`${n}× ${rotulo} — não tem equivalente aqui, ficou de fora.`);
  // Nó que ninguém alimenta: ou já estava solto no canvas do n8n, ou perdeu a entrada quando o
  // encanamento foi removido. Nos dois casos ele NUNCA roda — melhor dizer do que deixar a pessoa
  // achar que está tudo ligado.
  const semEntrada = steps.filter((st) => st.type !== "note" && !edges.some((e) => e.target === st._id));
  if (semEntrada.length) avisos.push(`${semEntrada.length} passo(s) ficaram soltos, sem nada apontando pra eles — no n8n também estavam assim. Ligue ou apague antes de publicar.`);
  if (precisaChave) {
    avisos.push(`${precisaChave} passo(s) de HTTP usam uma chave de API que o n8n guarda FORA do arquivo — abra cada um e cole a chave em "Autenticação" antes de publicar.`);
  }
  const passosAsaas = [...passoDe.values()].filter((c) => c.type === "asaas").length;
  if (passosAsaas) {
    avisos.push(`${passosAsaas} passo(s) viraram o nó Asaas nativo — cole sua chave do Asaas UMA vez em Integrações → Asaas e todos funcionam (nada de chave dentro do fluxo).`);
  }
  // Função da Evolution SEM equivalente aqui (ex.: baixar a mídia de uma mensagem) fica como HTTP
  // apontando pro servidor antigo — funciona, mas só enquanto aquele servidor existir. Melhor
  // dizer isso na cara do que a pessoa descobrir quando desligar a Evolution.
  const aindaEvolution = [...passoDe.values()]
    .filter((c) => c.type === "webhook_out" && /evolution|apiv2\.smartgestao/i.test(String((c as any).url ?? ""))).length;
  if (aindaEvolution) {
    avisos.push(`${aindaEvolution} passo(s) usam funções da Evolution que ainda não têm equivalente aqui (ex.: baixar mídia de mensagem) — ficaram como HTTP pro seu servidor antigo e só funcionam enquanto ele existir.`);
  }
  if (credenciaisTiradas) {
    avisos.push(`${credenciaisTiradas} campo(s) com chave/endereço da Evolution não vieram junto: o arquivo do n8n traz essa chave em texto claro e ela não é mais necessária aqui.`);
  }
  if (daEvolution) {
    avisos.push(`${daEvolution} envio(s) que saíam pela Evolution API agora usam o SEU WhatsApp conectado aqui — não precisa mais daquele servidor nem da apikey dela.`);
  }
  if (ehGatilhoSchedule && !ehGatilhoWebhook) {
    avisos.push(`Gatilho por HORÁRIO importado (${cronDoN8n || "0 9 * * *"}) — igual ao Schedule Trigger de lá: ele só marca a hora. Quem recebe sai dos passos seguintes (buscar a lista → Loop). Se este fluxo manda mensagem sempre pro MESMO número ou grupo, escolha o destino no nó do topo.`);
  } else if (!ehGatilhoWebhook) {
    avisos.push("Este fluxo do n8n não começa por webhook. Escolhi o gatilho de webhook mesmo assim — troque no nó do topo se o disparo for outro.");
  }
  if (urlsAudio.size > 1) avisos.push(`O fluxo baixava ${urlsAudio.size} áudios diferentes; usei o primeiro em todos os passos de áudio.`);

  return {
    auto: {
      name: String(j.name || "Fluxo importado do n8n").slice(0, 80),
      trigger: ehGatilhoSchedule && !ehGatilhoWebhook ? "schedule" : "webhook",
      ...(ehGatilhoSchedule && !ehGatilhoWebhook ? { scheduleCron: cronDoN8n || "0 9 * * *", scheduleTarget: "" } : {}),
      ...(campoTelefone ? { campoTelefone } : {}),
      ...(Object.keys(pinData).length ? { pinData } : {}),
      steps, edges, layout,
      enabled: false,
      platforms: ["*"],
    },
    avisos,
    convertidos: steps.length,
    descartados: nos.length - steps.length,
  };
}

// Recorrência do Schedule Trigger do n8n → cron de 5 campos. O n8n tem duas formas: expressão
// cron crua (Custom) ou um intervalo montado em campos (a cada X horas, no minuto Y…).
function cronDoScheduleTrigger(p: Record<string, any>): string {
  const regras = p?.rule?.interval ?? [];
  for (const r of regras) {
    const cron = String(r?.expression ?? "").trim();
    if (cron) {
      const partes = cron.split(/\s+/);
      return partes.length === 6 ? partes.slice(1).join(" ") : cron; // n8n às vezes inclui segundos
    }
    const campo = String(r?.field ?? "");
    const hora = Number(r?.triggerAtHour ?? 0);
    const min = Number(r?.triggerAtMinute ?? 0);
    const dia = Number(r?.triggerAtDay ?? 1);
    if (campo === "days") return `${min} ${hora} * * *`;
    if (campo === "weeks") return `${min} ${hora} * * ${Number(r?.triggerAtDay ?? 1)}`;
    if (campo === "months") return `${min} ${hora} ${dia} * *`;
    if (campo === "hours") { const cada = Number(r?.hoursInterval ?? 1); return `${min} */${cada > 0 ? cada : 1} * * *`; }
    if (campo === "minutes") { const cada = Number(r?.minutesInterval ?? 5); return `*/${cada > 0 ? cada : 5} * * * *`; }
  }
  return "";
}

// Operador do n8n → tipo + operador daqui. O n8n guarda { type: "string"|"number"|…,
// operation: "equals"|"gt"|… }; o mapa cobre o que ele exporta de fato.
function opDoN8n(operador: any): { tipo: "texto" | "numero" | "data" | "booleano" | "lista"; op: string } {
  const tipoN8n = String(operador?.type ?? "string").toLowerCase();
  const opN8n = String(operador?.operation ?? "equals").toLowerCase();
  const tipo = tipoN8n === "number" ? "numero" : tipoN8n === "datetime" ? "data"
    : tipoN8n === "boolean" ? "booleano" : tipoN8n === "array" ? "lista" : "texto";
  const comuns: Record<string, string> = {
    exists: "existe", notexists: "nao_existe", empty: "vazio", notempty: "nao_vazio",
    equals: "igual", notequals: "diferente",
  };
  const porTipo: Record<string, Record<string, string>> = {
    texto: { contains: "contem", notcontains: "nao_contem", startswith: "comeca", notstartswith: "nao_comeca",
             endswith: "termina", notendswith: "nao_termina", regex: "regex", notregex: "nao_regex" },
    numero: { gt: "maior", lt: "menor", gte: "maior_igual", lte: "menor_igual" },
    data: { after: "depois", before: "antes", afterorequals: "depois_igual", beforeorequals: "antes_igual" },
    booleano: { true: "verdadeiro", false: "falso" },
    lista: { contains: "contem", notcontains: "nao_contem", lengthequals: "tam_igual",
             lengthnotequals: "tam_diferente", lengthgt: "tam_maior", lengthlt: "tam_menor",
             lengthgte: "tam_maior_igual", lengthlte: "tam_menor_igual" },
  };
  return { tipo, op: porTipo[tipo]?.[opN8n] ?? comuns[opN8n] ?? "igual" };
}

// O switch do n8n compara sempre o mesmo campo nas regras — pega o que mais aparece.
function campoDoSwitch(regras: any[]): string {
  const campos = regras
    .map((r) => variavelDoCaminho(String(r?.conditions?.conditions?.[0]?.leftValue ?? "")))
    .filter((x): x is string => !!x);
  return maisComum(campos) ?? "";
}

function maisComum(lista: string[]): string | undefined {
  if (!lista.length) return undefined;
  const c = new Map<string, number>();
  for (const v of lista) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function nomeAmigavel(tipo: string): string {
  const t = tipo.split(".").pop() ?? tipo;
  const dic: Record<string, string> = {

    limit: "limitar quantidade", merge: "juntar caminhos", baserow: "Baserow",
    facebookGraphApi: "Facebook/Instagram", uploadPost: "publicar em rede social",
    youTube: "YouTube", googleDrive: "Google Drive", linkedIn: "LinkedIn",
    twitter: "X/Twitter", telegram: "Telegram", openAi: "OpenAI (nó do n8n)",
  };
  return dic[t] ?? t;
}
