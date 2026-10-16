// RESUMOS (pedido do dono, 03/10/2026): resumo de UMA conversa, de UM grupo e o RELATÓRIO do
// período (quantos chamaram, quantos fecharam, quantos ficaram pelo caminho), com um campo livre
// "o que você quer saber" pra extrair informação das conversas.
//
// Números vêm do BANCO (contatos novos, etiquetas, eventos de venda, passagem pelos fluxos e pelos
// caminhos do agente) — a IA não inventa contagem. A IA entra em dois lugares: ler as conversas e
// classificar cada uma (fechou / em andamento / ficou pelo caminho / não é lead) e escrever o texto.
// Usa a chave OpenAI DO WORKSPACE (getOpenAIKey): cliente sem chave não gasta a do dono.
import { query, dbEnabled } from "./db.js";
import { getOpenAIKey } from "./engine/ai.js";

export type TipoResumo = "conversa" | "grupo" | "periodo";
export interface MsgResumo { quem: string; texto: string; ts: number; fromMe: boolean }
export interface Periodo { de: Date; ate: Date }

const TZ = "America/Sao_Paulo";
const fmtHora = (ms: number) => new Date(ms).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const msDe = (t?: number) => (!t ? 0 : t > 1e12 ? t : t * 1000);

// Mídia sem texto vira um rótulo legível — a IA precisa saber que "mandou um áudio".
const ROTULO_TIPO: Record<string, string> = {
  AudioMessage: "[áudio]", PttMessage: "[áudio]", ImageMessage: "[imagem]", VideoMessage: "[vídeo]",
  DocumentMessage: "[documento]", StickerMessage: "[figurinha]", LocationMessage: "[localização]",
  ContactMessage: "[contato]", call: "[ligação]", ReactionMessage: "",
};
export function textoDaMsg(m: { text?: string; type?: string; local?: any }): string {
  const t = String(m.text ?? "").trim();
  if (t) return t;
  if (m.local?.lat != null) return `[localização: https://www.google.com/maps?q=${m.local.lat},${m.local.lng}]`;
  return ROTULO_TIPO[String(m.type ?? "")] ?? (m.type ? `[${m.type}]` : "");
}

// Transcrição compacta, do MAIS ANTIGO pro mais novo, cortada pelo FIM (o recente é o que importa).
export function transcricao(msgs: MsgResumo[], maxChars: number): string {
  const linhas = msgs
    .filter((m) => m.texto)
    .sort((a, b) => a.ts - b.ts)
    .map((m) => `[${fmtHora(m.ts)}] ${m.quem}: ${m.texto.replace(/\s+/g, " ").slice(0, 600)}`);
  let total = 0;
  const out: string[] = [];
  for (let i = linhas.length - 1; i >= 0; i--) {
    total += linhas[i].length + 1;
    if (total > maxChars) { out.unshift("[… mensagens mais antigas omitidas …]"); break; }
    out.unshift(linhas[i]);
  }
  return out.join("\n");
}

export class SemChaveIa extends Error {
  constructor() { super("Configure a sua chave da OpenAI em Integrações para gerar resumos com IA."); }
}

async function chamaIa(system: string, user: string, opts: { maxTokens?: number; json?: boolean } = {}): Promise<string> {
  const key = getOpenAIKey();
  if (!key) throw new SemChaveIa();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_RESUMO_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(r.status === 401 ? "A chave da OpenAI foi recusada — confira em Integrações." : `IA indisponível (${r.status}): ${t.slice(0, 160)}`);
  }
  const j: any = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

const REGRAS_TEXTO =
  "Escreva em português do Brasil, direto e objetivo, para o dono do negócio ler no celular. " +
  "Use títulos curtos em linhas próprias e tópicos com '- '. Não use tabelas nem negrito com asteriscos duplos. " +
  "Nunca invente fatos que não estão nas mensagens. Se a informação não aparece, diga que não aparece.";

export async function resumeConversa(nome: string, msgs: MsgResumo[], pergunta: string, ehGrupo: boolean): Promise<string> {
  const tx = transcricao(msgs, ehGrupo ? 24_000 : 16_000);
  if (!tx) return "Não há mensagens de texto nesse intervalo para resumir.";
  const sys = ehGrupo
    ? `Você resume conversas de GRUPO de WhatsApp. ${REGRAS_TEXTO} Estruture: Resumo geral; Principais assuntos; Decisões e combinados; Pendências e quem ficou de fazer; Perguntas sem resposta; Quem mais participou.`
    : `Você resume uma conversa de WhatsApp entre uma empresa ("Nós") e um contato. ${REGRAS_TEXTO} Estruture: Quem é e o que quer; O que aconteceu; Situação atual (fechou, em andamento, perdido ou indefinido, com o motivo); Próximo passo recomendado; Dados importantes citados (valores, datas, endereços, documentos).`;
  const user = `${ehGrupo ? "Grupo" : "Contato"}: ${nome}\n` +
    (pergunta ? `PERGUNTA DO DONO (responda primeiro, numa seção "Resposta à sua pergunta"): ${pergunta}\n` : "") +
    `\nMENSAGENS:\n${tx}`;
  return chamaIa(sys, user, { maxTokens: 1400 });
}

// ── RELATÓRIO DO PERÍODO ────────────────────────────────────────────────────────────────────
export interface Metricas {
  contatosNovos: number;
  conversasAtivas: number;
  etiquetas: Array<{ tag: string; n: number }>;
  eventos: Array<{ evento: string; n: number; valor: number }>;
  fluxos: Array<{ fluxo: string; entraram: number; caminhos: Array<{ caminho: string; n: number }> }>;
}

export async function metricasDoPeriodo(ws: string, p: Periodo, nomeDoFluxo: (id: string) => string): Promise<Metricas> {
  if (!dbEnabled) return { contatosNovos: 0, conversasAtivas: 0, etiquetas: [], eventos: [], fluxos: [] };
  const [novos, ativos, tags, evs, hits] = await Promise.all([
    query<{ n: string }>("SELECT count(*) n FROM contacts WHERE workspace_id=$1 AND first_seen BETWEEN $2 AND $3", [ws, p.de, p.ate]),
    query<{ n: string }>("SELECT count(*) n FROM contacts WHERE workspace_id=$1 AND last_seen BETWEEN $2 AND $3", [ws, p.de, p.ate]),
    query<{ tag: string; n: string }>("SELECT tag, count(DISTINCT phone) n FROM contact_tags WHERE workspace_id=$1 AND created_at BETWEEN $2 AND $3 GROUP BY tag ORDER BY 2 DESC LIMIT 25", [ws, p.de, p.ate]),
    query<{ event: string; n: string; v: string }>("SELECT event, count(*) n, COALESCE(sum(amount),0) v FROM events WHERE workspace_id=$1 AND created_at BETWEEN $2 AND $3 GROUP BY event ORDER BY 2 DESC", [ws, p.de, p.ate]),
    query<{ automation_id: string; node_id: string; n: string }>("SELECT automation_id, node_id, count(DISTINCT phone) n FROM flow_node_hits WHERE workspace_id=$1 AND ran_at BETWEEN $2 AND $3 AND (node_id='trigger' OR node_id LIKE '%:%') GROUP BY 1,2", [ws, p.de, p.ate]),
  ]);
  const porFluxo = new Map<string, { entraram: number; caminhos: Array<{ caminho: string; n: number }> }>();
  for (const h of hits) {
    const f = porFluxo.get(h.automation_id) ?? { entraram: 0, caminhos: [] };
    if (h.node_id === "trigger") f.entraram = Number(h.n);
    else f.caminhos.push({ caminho: h.node_id.split(":").slice(1).join(":"), n: Number(h.n) });
    porFluxo.set(h.automation_id, f);
  }
  return {
    contatosNovos: Number(novos[0]?.n ?? 0),
    conversasAtivas: Number(ativos[0]?.n ?? 0),
    etiquetas: tags.map((t) => ({ tag: t.tag, n: Number(t.n) })),
    eventos: evs.map((e) => ({ evento: e.event, n: Number(e.n), valor: Number(e.v) })),
    fluxos: [...porFluxo.entries()]
      .map(([id, f]) => ({ fluxo: nomeDoFluxo(id), entraram: f.entraram, caminhos: f.caminhos.sort((a, b) => b.n - a.n) }))
      .filter((f) => f.entraram || f.caminhos.length)
      .sort((a, b) => b.entraram - a.entraram),
  };
}

export type StatusConversa = "fechou" | "em_andamento" | "perdido" | "nao_lead";
export interface ConversaClassificada { nome: string; telefone: string; status: StatusConversa; motivo: string; resposta?: string }

// Lê as conversas em lotes e classifica cada uma. O dono decide o que é "fechamento" no negócio
// dele pela pergunta; sem pergunta, vale o sentido comum (contratou/comprou/agendou o serviço).
export async function classificaConversas(
  conversas: Array<{ nome: string; telefone: string; msgs: MsgResumo[] }>,
  pergunta: string,
): Promise<ConversaClassificada[]> {
  const out: ConversaClassificada[] = [];
  const LOTE = 8;
  for (let i = 0; i < conversas.length; i += LOTE) {
    const lote = conversas.slice(i, i + LOTE);
    const blocos = lote.map((c, k) => `### CONVERSA ${k}\nContato: ${c.nome} (${c.telefone})\n${transcricao(c.msgs, 3_500)}`).join("\n\n");
    const sys =
      "Você analisa conversas de WhatsApp de uma empresa com contatos e classifica cada uma. Responda SÓ em JSON: " +
      '{"conversas":[{"i":0,"status":"fechou|em_andamento|perdido|nao_lead","motivo":"até 15 palavras","resposta":"..."}]}. ' +
      "fechou = o contato comprou, contratou, agendou ou aceitou o serviço. em_andamento = ainda negociando ou aguardando alguém. " +
      "perdido = desistiu, pediu para parar de receber mensagens, sumiu sem retorno depois de receber proposta, achou caro ou foi para outro. " +
      "nao_lead = SÓ quem claramente não é cliente nem potencial cliente (equipe, fornecedor, família, spam). Quem recebeu uma oferta e recusou ou pediu para sair é perdido, não nao_lead. " +
      (pergunta ? `"resposta" = resposta curta, só com o que aparece na conversa, para a pergunta do dono: "${pergunta}". Se não aparece, "não aparece".` : '"resposta" = string vazia.');
    let arr: any[] = [];
    try {
      const j = JSON.parse(await chamaIa(sys, blocos, { maxTokens: 1500, json: true }));
      arr = Array.isArray(j?.conversas) ? j.conversas : [];
    } catch (e) {
      if (e instanceof SemChaveIa) throw e;
      arr = [];
    }
    lote.forEach((c, k) => {
      const r = arr.find((x) => Number(x?.i) === k) ?? {};
      const st = ["fechou", "em_andamento", "perdido", "nao_lead"].includes(r.status) ? r.status : "em_andamento";
      out.push({ nome: c.nome, telefone: c.telefone, status: st, motivo: String(r.motivo ?? "").slice(0, 160), ...(pergunta ? { resposta: String(r.resposta ?? "").slice(0, 300) } : {}) });
    });
  }
  return out;
}

export async function textoDoRelatorio(p: Periodo, m: Metricas, conv: ConversaClassificada[], pergunta: string): Promise<string> {
  const cont = (s: StatusConversa) => conv.filter((c) => c.status === s).length;
  const dados = {
    periodo: `${p.de.toLocaleDateString("pt-BR", { timeZone: TZ })} a ${p.ate.toLocaleDateString("pt-BR", { timeZone: TZ })}`,
    metricas_do_sistema: m,
    conversas_analisadas: conv.length,
    fecharam: cont("fechou"), em_andamento: cont("em_andamento"), ficaram_pelo_caminho: cont("perdido"), nao_eram_leads: cont("nao_lead"),
    motivos_de_perda: conv.filter((c) => c.status === "perdido").map((c) => c.motivo).slice(0, 30),
    respostas_a_pergunta: pergunta ? conv.map((c) => `${c.nome}: ${c.resposta}`).slice(0, 40) : undefined,
  };
  const sys = `Você escreve o relatório de atendimento do período para o dono de uma empresa. ${REGRAS_TEXTO} ` +
    "Use SOMENTE os números recebidos — não recalcule nem invente, e não afirme relação de causa (ex.: \"o fluxo gerou as vendas\") que não esteja nos dados. Compras aprovadas e renovações em metricas_do_sistema.eventos são VENDAS CONFIRMADAS: conte-as como fechamentos mesmo que nenhuma conversa tenha sido analisada. " +
    "Se conversas_analisadas for 0, diga claramente que não houve conversas individuais no período para a IA ler (só grupos ou nenhuma) e não conclua nada sobre perdas. Estruture: Visão geral (3 a 5 linhas); Funil (contatos, conversas, fechamentos, em andamento, perdidos); " +
    "Por que os leads ficaram pelo caminho; O que funcionou; Recomendações práticas para a próxima semana (no máximo 5)." +
    (pergunta ? ' Comece com a seção "Resposta à sua pergunta".' : "");
  return chamaIa(sys, (pergunta ? `PERGUNTA DO DONO: ${pergunta}\n\n` : "") + JSON.stringify(dados), { maxTokens: 1600 });
}
