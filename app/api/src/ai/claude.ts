// Chamada à Claude Messages API via fetch puro (sem SDK) — para gerar o resumo do grupo.
// Endpoint/headers/formato conforme a doc oficial (Messages API, anthropic-version 2023-06-01).
import { config } from "../config.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface SummaryMessage {
  name: string; // nome de quem falou (nunca o telefone)
  text: string;
}

// Limita o transcript pra não estourar contexto/custo em grupos muito ativos.
const MAX_CHARS_PER_MSG = 500;
const MAX_TRANSCRIPT_CHARS = 40_000;

function buildTranscript(messages: SummaryMessage[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const m of messages) {
    const who = (m.name || "Alguém").slice(0, 40);
    const txt = (m.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_PER_MSG);
    if (!txt) continue;
    const line = `${who}: ${txt}`;
    if (total + line.length > MAX_TRANSCRIPT_CHARS) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

const SYSTEM = `Você resume conversas de grupos de WhatsApp em português do Brasil.
Gere um resumo CURTO e ÚTIL do que rolou no dia, em tópicos (bullets), cobrindo quando houver:
- Principais assuntos discutidos
- Decisões, combinados e datas/horários importantes
- Perguntas em aberto (que ninguém respondeu)
- Links, arquivos ou avisos relevantes

Regras:
- No máximo ~10 tópicos. Seja objetivo e direto.
- NUNCA invente nada que não esteja nas mensagens.
- NUNCA cite números de telefone.
- Se o dia teve pouca conversa, faça um resumo de 1 a 3 linhas.
- Comece com uma linha de título com emoji, ex: "📋 *Resumo do dia*".
- Use a formatação do WhatsApp: *negrito* com asteriscos, e "• " no início de cada tópico.`;

// Chamada genérica (texto → texto) reutilizada pelas features de IA fora do resumo.
async function chamaClaude(system: string, user: string, maxTokens = 1500, timeoutMs = 60_000, model?: string): Promise<string> {
  const apiKey = config.anthropic.apiKey;
  if (!apiKey) throw new Error("IA não configurada no servidor (ANTHROPIC_API_KEY)");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model: model ?? config.anthropic.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let json: any;
    try { json = raw ? JSON.parse(raw) : {}; } catch { json = { _raw: raw }; }
    if (!res.ok) throw new Error(`Claude API falhou (HTTP ${res.status}): ${json?.error?.message || raw || res.statusText}`);
    if (json?.stop_reason === "refusal") throw new Error("a IA recusou o pedido");
    const text = Array.isArray(json?.content)
      ? json.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim()
      : "";
    if (!text) throw new Error("a IA retornou resposta vazia");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ── Sugestão de template (a "IA do Utility") ─────────────────────────────────
// O cliente descreve em linguagem livre o que quer mandar; a IA devolve o template PRONTO no
// formato da Meta e, principalmente, tenta o encaixe como UTILITY (mais barato e menos sujeito a
// bloqueio) — quando não dá, explica por quê e entrega como MARKETING. As regras e famílias vêm
// da biblioteca oficial de modelos da Meta (catalogada em 15/08).
const SYSTEM_TEMPLATE = `Você é especialista em templates da WhatsApp Cloud API (Meta) para negócios brasileiros.
O usuário descreve a mensagem que quer mandar; você devolve UM template pronto pra submeter à aprovação da Meta.

REGRA DE CATEGORIA (a mais importante):
- UTILITY: decorre de uma transação/relacionamento JÁ existente + informação específica do cliente + SEM promoção, desconto, upsell ou novidade. Famílias aceitas: pagamento (lembrete/atraso/falha/confirmação), pedido (confirmado/cancelado/atrasado/pronto pra retirar), entrega, agendamento (lembrete/confirmação/reagendamento), conta (criação/atualização), feedback pós-atendimento, evento (lembrete/RSVP), aviso de serviço.
- MARKETING: qualquer oferta, cupom, novidade, reativação fria, convite de compra. NÃO tente disfarçar marketing como utility — a Meta reclassifica e rejeita.

FORMATO DO TEMPLATE (regras da Meta):
- Corpo curto e transacional, em português do Brasil, com variáveis {{1}}, {{2}}… SEQUENCIAIS (nunca pule números) pros dados que mudam por cliente (nome, valor, data, número do pedido).
- Em cobrança/lembrete de pagamento, incluir a frase de escape "Se você já pagou, ignore esta mensagem." (reduz denúncia).
- Sugira no máximo 3 botões quando fizer sentido: resposta rápida (confirmar/reagendar), url (pagar/ver detalhes) ou telefone (falar com a gente).
- Nome do template: minúsculas, números e _ (ex.: lembrete_pagamento_1).
- Um exemplo REALISTA pra cada variável (a Meta exige pra aprovar).

RESPONDA APENAS com JSON válido, sem markdown, neste formato:
{"categoria":"UTILITY"|"MARKETING","motivo":"1 frase explicando a categoria","nome":"...","corpo":"...","exemplos":["..."],"rodape":"" ou string curta,"botoes":[{"tipo":"resposta"|"url"|"telefone","texto":"...","url":"","telefone":""}],"dica":"" ou 1 frase útil (ex.: o que mudar pra virar UTILITY)}`;

export interface SugestaoTemplate {
  categoria: string;
  motivo: string;
  nome: string;
  corpo: string;
  exemplos: string[];
  rodape?: string;
  botoes: Array<{ tipo: string; texto: string; url?: string; telefone?: string }>;
  dica?: string;
}

export async function sugereTemplateMeta(pedido: string): Promise<SugestaoTemplate> {
  const texto = await chamaClaude(SYSTEM_TEMPLATE, pedido.slice(0, 2000), 1200);
  // A IA às vezes embrulha em ```json — desembrulha antes de parsear.
  const semCerca = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let j: any;
  try { j = JSON.parse(semCerca); } catch { throw new Error("a IA respondeu num formato inesperado — tente de novo"); }
  return {
    categoria: String(j?.categoria ?? "MARKETING").toUpperCase() === "UTILITY" ? "UTILITY" : "MARKETING",
    motivo: String(j?.motivo ?? ""),
    nome: String(j?.nome ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60),
    corpo: String(j?.corpo ?? ""),
    exemplos: Array.isArray(j?.exemplos) ? j.exemplos.map((x: any) => String(x ?? "")) : [],
    rodape: j?.rodape ? String(j.rodape).slice(0, 60) : undefined,
    botoes: (Array.isArray(j?.botoes) ? j.botoes : []).slice(0, 3).map((b: any) => ({
      tipo: ["resposta", "url", "telefone"].includes(String(b?.tipo)) ? String(b.tipo) : "resposta",
      texto: String(b?.texto ?? "").slice(0, 25),
      url: b?.url ? String(b.url) : undefined,
      telefone: b?.telefone ? String(b.telefone) : undefined,
    })).filter((b: any) => b.texto),
    dica: j?.dica ? String(j.dica) : undefined,
  };
}

// ── Fluxo completo por IA (texto livre → automação pronta no builder) ────────
// O usuário descreve a automação em português; a IA devolve os NÓS já no formato do motor. O que
// a IA NÃO tem como saber (arquivo de mídia, JID de grupo, planilha, número pra avisar) NUNCA é
// inventado: vira um bloco de Nota no canvas + um aviso na tela. O fluxo nasce como RASCUNHO.
const SYSTEM_FLUXO = `Você monta automações de WhatsApp para o ZapConverte (motor de fluxos brasileiro).
O usuário descreve em português o que quer automatizar; você devolve o fluxo PRONTO em JSON.

GATILHOS (escolha exatamente UM em "trigger"):
- "keyword": a pessoa manda uma palavra no WhatsApp. Exige "keyword" (a palavra) e "keywordMatch": "exact" (mensagem igual) ou "contains" (palavra aparece na frase — prefira este).
- "primeiro_contato": a primeira vez que aquela pessoa fala com o número (lead novo, anúncio, indicação).
- "checkout": eventos de venda. Exige "eventos" (lista) com um ou mais de: purchase_approved (compra aprovada), pix_generated (PIX gerado), boleto_generated, cart_abandoned (carrinho abandonado), checkout_started, purchase_refused (recusada), refund, chargeback, subscription_canceled, subscription_renewed, payment_delayed.
- "group_keyword": palavra dita dentro de um grupo (exige "keyword").
- "group_mention": mencionaram o número num grupo.
- "webhook": um sistema de fora chama o ZapConverte.

PASSOS DISPONÍVEIS (campo "passos", na ordem de execução):
- {"tipo":"text","text":"..."} — envia uma mensagem. É o passo mais usado.
- {"tipo":"presence","presence":"composing","ms":2500} — mostra "digitando…" antes de uma mensagem (deixa humano). presence pode ser "composing" (digitando) ou "recording" (gravando áudio).
- {"tipo":"wait","ms":60000,"cancelOnReply":true} — espera. Abaixo de 2 minutos segura a conversa; 2 minutos ou mais vira FOLLOW-UP AGENDADO (não trava nada). cancelOnReply:true cancela o follow-up se a pessoa responder — use SEMPRE true em follow-up de vácuo ("sumiu"), e false só em lembrete programado que deve ir de qualquer jeito.
- {"tipo":"buttons","text":"...","buttons":["Sim","Não"]} — até 3 botões de resposta rápida. Só funciona no WhatsApp Lite (não na API Oficial).
- {"tipo":"ask","text":"Qual seu e-mail?","variable":"email","hint":"e-mail da pessoa"} — pergunta e PAUSA o fluxo; a IA extrai a resposta e salva no contato. Depois dá pra usar {{email}} nos textos seguintes. variable em minúsculas com _ (sem espaço/acento).
- {"tipo":"ai_agent","systemPrompt":"...","maxTurns":6,"keepAlive":true,"paths":[{"name":"quer_comprar","description":"quando a pessoa demonstra interesse em comprar","reply":"texto que é enviado quando este caminho é escolhido"}]} — atendente de IA que conversa e escolhe um caminho. Use quando o pedido envolve "atender", "tirar dúvidas", "qualificar lead", "vender conversando". O systemPrompt deve descrever quem é a atendente, o que ela vende, o tom, e o que NÃO fazer. Sempre inclua um caminho "falar_com_humano" quando fizer sentido.
- {"tipo":"tag","tags":["Lead do anúncio"]} — etiqueta o contato no CRM (não envia nada).
- {"tipo":"note","text":"..."} — anotação no canvas (não é enviada à pessoa). Use pra deixar instruções.
- {"tipo":"notify","targets":[],"text":"🔔 Aviso: ..."} — avisa a equipe. SEMPRE deixe "targets" como lista VAZIA (quem preenche o número é o usuário depois).
- {"tipo":"media","descricao":"vídeo curto mostrando o produto"} — quando o fluxo pede áudio, imagem ou vídeo. Descreva o arquivo em "descricao"; NÃO invente URL.
- {"tipo":"template","templateName":"nome_do_template"} — só na API Oficial, pra falar fora da janela de 24h.

REGRAS DE OURO:
1. Escreva as mensagens em português do Brasil, no tom de conversa de WhatsApp: frases curtas, quebras de linha, no máximo 1 ou 2 emojis por mensagem. Nada de texto corporativo comprido.
2. Use as variáveis do motor quando couber: {{primeiro_nome}}, {{nome}}, {{telefone}}, {{saudacao}} (Bom dia/Boa tarde/Boa noite), {{produto}}, {{valor}}, {{link}} (em eventos de venda). Não invente outras variáveis além das que você criar com "ask".
3. Coloque um "presence" antes de mensagens importantes e um "wait" curto (2 a 5 segundos) entre mensagens seguidas — parece gente, não robô.
4. Follow-up de quem sumiu: use "wait" com ms grande (20 min = 1200000, 3h = 10800000, 8h = 28800000, 24h = 86400000) e cancelOnReply:true. No máximo 4 follow-ups, e o último deve se despedir com elegância.
5. NUNCA invente link, preço, prazo, número de telefone, nome de grupo ou URL de arquivo. Se o usuário não deu, escreva um marcador claro tipo [COLOQUE SEU LINK AQUI] no texto.
6. Entre 4 e 14 passos. Fluxo bom é curto e direto.

RESPONDA APENAS com JSON válido, sem markdown, neste formato:
{"nome":"nome curto do fluxo","trigger":"...","keyword":"","keywordMatch":"contains","eventos":[],"resumo":"1 frase dizendo o que o fluxo faz","passos":[...]}`;

export interface FluxoIAPasso { [k: string]: any }
export interface FluxoIA {
  nome: string;
  trigger: string;
  keyword?: string;
  keywordMatch?: "exact" | "contains";
  eventos?: string[];
  resumo: string;
  passos: FluxoIAPasso[];
  avisos: string[];
}

const TRIGGERS_IA = [
  "keyword", "primeiro_contato", "checkout", "group_keyword", "group_mention", "webhook",
];
const EVENTOS_IA = [
  "purchase_approved", "purchase_refused", "pix_generated", "boleto_generated", "cart_abandoned",
  "checkout_started", "refund", "chargeback", "subscription_canceled", "subscription_renewed", "payment_delayed",
];
const slugVar = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
const txt = (v: any, max = 4000) => String(v ?? "").slice(0, max);

// Converte o JSON da IA nos passos REAIS do motor. Tudo que depende de um arquivo/ID que a IA não
// pode conhecer vira Nota (visível no canvas) + aviso — em vez de um passo quebrado ou inventado.
function sanitizaPassos(brutos: any[], avisos: string[]): any[] {
  const out: any[] = [];
  let n = 0;
  const novoId = (pref: string) => `${pref}_${++n}`;
  for (const p of Array.isArray(brutos) ? brutos.slice(0, 24) : []) {
    const tipo = String(p?.tipo ?? p?.type ?? "").toLowerCase();
    switch (tipo) {
      case "text": {
        const text = txt(p.text);
        if (text.trim()) out.push({ _id: novoId("msg"), type: "text", text });
        break;
      }
      case "presence": {
        const presence = ["composing", "recording"].includes(String(p.presence)) ? String(p.presence) : "composing";
        const ms = Math.max(500, Math.min(Number(p.ms) || 2500, 15000));
        out.push({ _id: novoId("digitando"), type: "presence", presence, ms });
        break;
      }
      case "wait": {
        const ms = Math.max(1000, Math.min(Number(p.ms) || 3000, 7 * 24 * 3600 * 1000));
        out.push({ _id: novoId("espera"), type: "wait", ms, cancelOnReply: p.cancelOnReply !== false });
        break;
      }
      case "buttons": {
        const buttons = (Array.isArray(p.buttons) ? p.buttons : []).map((b: any) => txt(b, 24)).filter(Boolean).slice(0, 3);
        if (!txt(p.text).trim() || !buttons.length) break;
        out.push({ _id: novoId("botoes"), type: "buttons", text: txt(p.text), buttons });
        break;
      }
      case "ask": {
        const variable = slugVar(p.variable ?? "");
        if (!txt(p.text).trim() || !variable) break;
        out.push({ _id: novoId("pergunta"), type: "ask", text: txt(p.text), variable, ...(p.hint ? { hint: txt(p.hint, 200) } : {}) });
        break;
      }
      case "ai_agent": {
        const paths = (Array.isArray(p.paths) ? p.paths : []).slice(0, 8).map((c: any) => ({
          name: slugVar(c?.name ?? "") || "caminho",
          description: txt(c?.description, 400),
          reply: txt(c?.reply, 2000),
        })).filter((c: any) => c.description || c.reply);
        out.push({
          _id: novoId("agente"), type: "ai_agent",
          systemPrompt: txt(p.systemPrompt, 6000),
          maxTurns: Math.max(1, Math.min(Number(p.maxTurns) || 6, 20)),
          keepAlive: p.keepAlive !== false,
          paths,
        });
        break;
      }
      case "tag": {
        const tags = (Array.isArray(p.tags) ? p.tags : []).map((t: any) => txt(t, 40)).filter(Boolean).slice(0, 6);
        if (tags.length) out.push({ _id: novoId("etiqueta"), type: "tag", tags });
        break;
      }
      case "note": {
        if (txt(p.text).trim()) out.push({ _id: novoId("nota"), type: "note", text: txt(p.text, 1000) });
        break;
      }
      case "notify": {
        out.push({ _id: novoId("avisar"), type: "notify", targets: [], text: txt(p.text, 1000) });
        avisos.push("O passo “Avisar equipe” ficou sem destinatário — abra o bloco e coloque o número (ou grupo) que deve receber o aviso.");
        break;
      }
      // Mídia: a IA não tem o arquivo. Vira nota com a descrição, pro dono trocar por um passo real.
      case "media": case "ptt": case "ptv": case "carousel": {
        const desc = txt(p.descricao ?? p.caption ?? p.text, 400) || "arquivo a definir";
        out.push({ _id: novoId("nota"), type: "note", text: `📎 AQUI ENTRA UMA MÍDIA: ${desc}\n\nTroque este bloco por um passo de Mídia/Áudio/Vídeo e suba o arquivo.` });
        avisos.push(`Deixei uma nota no lugar da mídia (“${desc.slice(0, 60)}”) — a IA não sobe arquivo, você troca pelo passo de mídia com o seu vídeo/áudio.`);
        break;
      }
      case "template": {
        const templateName = slugVar(p.templateName ?? "");
        if (!templateName) break;
        out.push({ _id: novoId("modelo"), type: "template", templateName, language: "pt_BR", params: [] });
        avisos.push(`O passo de template usa o modelo “${templateName}” — confirme que ele existe e está aprovado em Templates Meta (senão o envio falha).`);
        break;
      }
      // Passos que precisam de um destino que só o dono sabe (grupo, planilha, sistema externo).
      case "add_to_group": case "mention_all": case "gsheet_append": case "webhook_out": {
        avisos.push(`Pulei um passo de “${tipo}” — ele precisa de um destino (grupo, planilha ou endereço) que eu não posso adivinhar. Adicione manualmente no builder se quiser.`);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// Monta o GRAFO (conexões + posições no canvas) a partir dos passos.
// Regra que a linha reta não expressa: um "avisar equipe" logo depois de um agente de IA NÃO é pra
// todo mundo — é pro caminho "falar com humano". Esse passo sai da linha e vira um RAMO do agente
// (handle "p:<caminho>"), igual ao que foi montado à mão no fluxo da Ana.
export function montaGrafo(
  passos: any[],
  avisos: string[],
): { edges: Array<{ id: string; source: string; sourceHandle?: string; target: string }>; layout: Record<string, { x: number; y: number }> } {
  // Achar o caminho de "quero falar com gente" é pelo NOME do caminho (é um slug curto e explícito,
  // tipo falar_com_humano). Casar pela descrição é armadilha: em português TODA descrição tem a
  // palavra "pessoa" ("quando a pessoa quer comprar") — testado, e o aviso foi parar no ramo errado.
  const humanoNoNome = /humano|human|atendente|suporte|equipe|vendedor/i;
  const humanoNaFrase = /(falar|conversar|atendimento|contato).{0,20}(humano|atendente|vendedor|equipe|consultor)/i;
  const achaCaminhoHumano = (paths: any[]) =>
    paths.find((c) => humanoNoNome.test(String(c?.name ?? ""))) ??
    paths.find((c) => humanoNaFrase.test(String(c?.description ?? ""))) ?? null;

  const linear: any[] = [];
  const ramos: Array<{ source: string; handle: string; alvo: any }> = [];
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i];
    const ant = passos[i - 1];
    const caminho = ant?.type === "ai_agent" ? achaCaminhoHumano(ant.paths ?? []) : null;
    if (p.type === "notify" && ant?.type === "ai_agent" && !caminho) {
      avisos.push("O “Avisar equipe” ficou na sequência do fluxo (avisa em toda conversa). Se ele deveria disparar só em “falar com humano”, arraste a ligação dele pra essa saída do agente no builder.");
    }
    if (p.type === "notify" && caminho) {
      ramos.push({ source: String(ant._id), handle: "p:" + caminho.name, alvo: p });
      avisos.push(`O “Avisar equipe” foi ligado no caminho “${caminho.name}” do agente — só dispara quando a pessoa pedir atendimento humano, não pra todo mundo.`);
      continue;
    }
    linear.push(p);
  }

  const edges: Array<{ id: string; source: string; sourceHandle?: string; target: string }> = [];
  const layout: Record<string, { x: number; y: number }> = { trigger: { x: 0, y: 0 } };
  linear.forEach((p, i) => {
    const id = String(p._id);
    edges.push({ id: `e_${i}`, source: i === 0 ? "trigger" : String(linear[i - 1]._id), target: id });
    layout[id] = { x: 0, y: (i + 1) * 140 };
  });
  ramos.forEach((r, i) => {
    const id = String(r.alvo._id);
    edges.push({ id: `e_ramo_${i}`, source: r.source, sourceHandle: r.handle, target: id });
    layout[id] = { x: 360, y: (layout[r.source]?.y ?? 0) + 60 }; // ao lado do agente, não embaixo
  });
  return { edges, layout };
}

export async function geraFluxoIA(pedido: string): Promise<FluxoIA> {
  let texto: string;
  try {
    texto = await chamaClaude(SYSTEM_FLUXO, pedido.slice(0, 4000), 4000, 90_000, config.anthropic.flowModel);
  } catch (e: any) {
    // Modelo forte indisponível nesta conta → tenta o mesmo modelo do resumo (que já roda aqui).
    if (!/model|404|400/i.test(String(e?.message ?? ""))) throw e;
    texto = await chamaClaude(SYSTEM_FLUXO, pedido.slice(0, 4000), 4000, 90_000);
  }
  const semCerca = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let j: any;
  try { j = JSON.parse(semCerca); } catch { throw new Error("a IA respondeu num formato inesperado — tente de novo, de preferência descrevendo com mais detalhe"); }

  const avisos: string[] = [];
  const passos = sanitizaPassos(j?.passos ?? j?.steps, avisos);
  if (!passos.length) throw new Error("a IA não conseguiu montar passos válidos — descreva de novo com mais detalhes (o que dispara, o que mandar, quando)");

  let trigger = TRIGGERS_IA.includes(String(j?.trigger)) ? String(j.trigger) : "keyword";
  let keyword = txt(j?.keyword, 60).trim();
  const keywordMatch = j?.keywordMatch === "exact" ? "exact" : "contains";
  let eventos = (Array.isArray(j?.eventos) ? j.eventos : []).map((e: any) => String(e)).filter((e: string) => EVENTOS_IA.includes(e));
  // Coerência do gatilho: keyword sem palavra e checkout sem evento não passam na validação do motor.
  if ((trigger === "keyword" || trigger === "group_keyword") && !keyword) {
    trigger = "primeiro_contato";
    avisos.push("A IA escolheu gatilho de palavra-chave mas não definiu a palavra — deixei como “Primeiro contato”. Troque o gatilho no topo do fluxo se quiser outra coisa.");
  }
  if (trigger === "checkout" && !eventos.length) {
    eventos = ["purchase_approved"];
    avisos.push("O gatilho de venda ficou sem evento — marquei “compra aprovada”. Ajuste no bloco do gatilho.");
  }
  if (trigger !== "keyword" && trigger !== "group_keyword") keyword = "";
  if (passos.some((p) => p.type === "buttons")) {
    avisos.push("Este fluxo usa botões — eles funcionam no WhatsApp Lite; na API Oficial os botões só existem dentro de um template aprovado.");
  }

  return {
    nome: txt(j?.nome ?? j?.name, 60).trim() || "Fluxo criado com IA",
    trigger,
    ...(keyword ? { keyword, keywordMatch } : {}),
    ...(eventos.length ? { eventos } : {}),
    resumo: txt(j?.resumo, 400),
    passos,
    avisos,
  };
}

// Gera o resumo. Lança erro (chamador decide o que fazer) em falha de API/refusal/vazio.
export async function summarizeGroupDay(
  groupName: string,
  messages: SummaryMessage[],
  opts?: { model?: string; timeoutMs?: number },
): Promise<string> {
  const apiKey = config.anthropic.apiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

  const model = opts?.model ?? config.anthropic.model;
  const transcript = buildTranscript(messages);
  const userContent = `Grupo: ${groupName}\n\nConversas de hoje (uma linha por mensagem):\n\n${transcript}`;

  // Timeout de rede (o resumo é curto, mas nunca deixamos a requisição pendurada).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 60_000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });

    const raw = await res.text();
    let json: any;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { _raw: raw };
    }

    if (!res.ok) {
      const msg = json?.error?.message || json?.message || raw || res.statusText;
      throw new Error(`Claude API falhou (HTTP ${res.status}): ${msg}`);
    }
    // A Claude pode recusar (stop_reason "refusal") — checar ANTES de ler content.
    if (json?.stop_reason === "refusal") {
      throw new Error("Claude recusou gerar o resumo (stop_reason: refusal).");
    }
    const text = Array.isArray(json?.content)
      ? json.content
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text)
          .join("\n")
          .trim()
      : "";
    if (!text) throw new Error("Claude retornou resposta vazia.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
