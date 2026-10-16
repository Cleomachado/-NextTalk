// Helpers do lado do NAVEGADOR (client components). Falam com as rotas /api/* do próprio painel.
export async function jget(path: string) {
  const r = await fetch(path, { cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ${r.status}`);
  return data;
}
export async function jsend(path: string, method: string, body: unknown) {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Erro ${r.status}`);
  return data;
}

// ══ O ENVIO "FALHOU", MAS A MENSAGEM CHEGOU? ════════════════════════════════════════════════
// Texto com LINK: a UazAPI/Meta monta a prévia (baixa a página) antes de responder, e a volta
// pode estourar em timeout/502 depois que a mensagem JÁ foi entregue. O painel tratava isso como
// falha e DEVOLVIA o texto pra caixa — a pessoa via o ✓✓ na conversa e o mesmo link parado no
// campo (print do dono, 10/09). Antes de devolver, conferimos no servidor: se existe uma
// mensagem MINHA com o mesmo texto nos últimos minutos, o envio deu certo.
type MsgQualquer = { fromMe?: boolean; from_me?: boolean; text?: string; body?: string; timestamp?: number; ts?: number };
export function envioConfirmado(msgs: MsgQualquer[] | undefined, textos: string[], janelaSeg = 180): boolean {
  const alvos = textos.map((t) => t.trim()).filter(Boolean);
  if (!alvos.length) return false;
  const agora = Date.now() / 1000;
  return (msgs ?? []).some((m) => {
    if (!(m.fromMe ?? m.from_me)) return false;
    const corpo = String(m.text ?? m.body ?? "").trim();
    if (!alvos.includes(corpo)) return false;
    let ts = Number(m.timestamp ?? m.ts ?? 0);
    if (ts > 1e12) ts = ts / 1000; // milissegundos → segundos
    return !ts || agora - ts <= janelaSeg;
  });
}
export async function conferirEnvio(urlMensagens: string, textos: string[]): Promise<boolean> {
  try {
    const d = await jget(urlMensagens);
    return envioConfirmado(d?.messages, textos);
  } catch {
    return false;
  }
}

// ══ SUBIR ARQUIVO (binário, não base64) ═════════════════════════════════════════════════════
// O corpo JSON das rotas do painel trava em 10MB — medido em produção (20/08): 9MB passa, 10MB
// não. Base64 infla 33%, então um vídeo de 7,5MB já estourava e o erro culpava a rede.
// Mandando os bytes crus, o teto deixa de valer: 12,9MB testado e aprovado.
export async function subirArquivo(file: File | Blob, nomeMime?: string): Promise<string> {
  const mime = nomeMime || (file as File).type || "application/octet-stream";
  const r = await fetch("/api/media?mime=" + encodeURIComponent(mime), {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d?.url) throw new Error(d?.error || `falha ao subir o arquivo (erro ${r.status})`);
  return d.url as string;
}
// Mesmo caminho quando só existe um dataURI em mãos (gravação de áudio, colagem, screenshot).
export async function subirDataUri(dataUri: string): Promise<string> {
  const m = String(dataUri).match(/^data:([^,]*?);base64,(.+)$/s);
  if (!m) throw new Error("arquivo inválido");
  const mime = m[1].split(";")[0] || "application/octet-stream";
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return subirArquivo(new Blob([bytes], { type: mime }), mime);
}

export const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const initials = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export const EV: Record<string, { t: string; c: string }> = {
  purchase_approved: { t: "Compra aprovada", c: "b-green" },
  purchase_refused: { t: "Compra recusada", c: "b-crit" },
  pix_generated: { t: "PIX gerado", c: "b-amber" },
  boleto_generated: { t: "Boleto gerado", c: "b-amber" },
  cart_abandoned: { t: "Carrinho abandonado", c: "b-blue" },
  checkout_started: { t: "Checkout iniciado", c: "b-blue" },
  refund: { t: "Reembolso", c: "b-crit" },
  chargeback: { t: "Chargeback", c: "b-crit" },
  subscription_canceled: { t: "Assinatura cancelada", c: "b-crit" },
  subscription_renewed: { t: "Assinatura renovada", c: "b-green" },
  payment_delayed: { t: "Pagamento atrasado", c: "b-amber" },
  unknown: { t: "Evento", c: "b-teal" },
};
export const evLabel = (e: string) => EV[e] ?? { t: e, c: "b-teal" };

/* ── tipos compartilhados ─────────────────────────────────────────────────── */
export interface Stats {
  today: { events: number; revenue: number; sales: number };
  last7d: { events: number; revenue: number };
  contacts: number;
  optedOut: number;
  byEventToday: Array<{ event: string; count: number }>;
}
export interface EventRow {
  event: string;
  platform: string;
  product: string | null;
  amount: string | null;
  phone: string | null;
  name: string | null;
  created_at: string;
}
export interface WelcomeCfg {
  enabled: boolean;
  message: string;
  groups: string[];
  delayMs?: number;
}
export interface SummaryGroup {
  jid: string;
  name?: string;
  time: string;
  deliverTo?: string; // vazio = próprio grupo; senão um @g.us ou número
}
export interface SummaryCfg {
  enabled: boolean;
  timezone: string;
  model?: string;
  maxMessages?: number;
  minMessages?: number;
  groups: SummaryGroup[];
}
export interface GroupListItem {
  jid: string;
  name: string;
  participantCount?: number;
  isAnnounce?: boolean;
}
export interface QuickReply {
  shortcut: string; // atalho digitado depois de "/" (ex.: "saudacao")
  text: string; // o texto que vai pro campo de mensagem
}

export interface ContactFlowRef {
  id: string;
  name: string;
  exists: boolean; // false = fluxo removido (chip não vira link)
}
export interface ContactRow {
  phone: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  platform: string | null;
  opted_out: boolean;
  first_seen: string;
  last_seen: string;
  last_event: string | null;
  last_event_at: string | null;
  purchases: number;
  total_events: number;
  flows: ContactFlowRef[]; // fluxos por onde o contato passou (clicáveis)
  tags: string[] | null; // etiquetas (ex.: importação de grupo)
}
export interface ContactDetailData {
  contact: {
    phone: string;
    name: string | null;
    email?: string | null;
    notes?: string | null;
    tags?: string[];
    platform: string | null;
    opted_out: boolean;
    first_seen: string;
    last_seen: string;
  };
  events: Array<{ event: string; platform: string; product: string | null; amount: string | null; created_at: string }>;
}

/* ── Builder de fluxos ────────────────────────────────────────────────────── */
export type StepBody =
  | { type: "text"; text: string }
  | { type: "ptt"; file: string }
  | { type: "ptv"; file: string }
  | { type: "media"; mediaType: string; file: string; caption?: string }
  | { type: "buttons"; text: string; buttons: string[] }
  // Carrossel: cards com imagem + botões que o lead desliza pro lado (só WhatsApp Lite).
  | { type: "carousel"; text: string; cards: Array<{ image: string; text: string; buttons?: string[] }> }
  | { type: "ask"; text: string; variable: string; hint?: string }
  // Consulta de pagamento: NÃO envia nada — olha no banco se a pessoa pagou e escolhe o caminho
  // (saídas "pago" e "nao_pago"). É o nó que fecha a recuperação de PIX.
  | { type: "payment_check"; produto?: string; porCodigo?: boolean; horas?: number }
  // Bloquear contato: entra na lista de bloqueio (nenhum fluxo fala com ele de novo) + etiqueta.
  | { type: "bloquear"; tags?: string[] }
  | { type: "ai_agent"; systemPrompt: string; maxTurns?: number; keepAlive?: boolean; acumularSeg?: number; paths: Array<{ name: string; description: string; reply: string; guardar?: Array<{ variable: string; hint?: string }>; repetir?: boolean; midia?: string }> }
  | { type: "presence"; presence: string; ms?: number }
  | { type: "call"; callDuration?: number }
  // >= 2min vira FOLLOW-UP AGENDADO no motor (persistente, não segura a conversa).
  | { type: "wait"; ms: number; cancelOnReply?: boolean; modo?: "intervalo" | "data"; quando?: string }
  | { type: "edit_fields"; campos: Array<{ campo: string; valor: string }>; salvarNaFicha?: boolean }
  | { type: "loop"; lista: string; campoTelefone?: string; limite?: number; intervaloMs?: number }
  | { type: "split_out"; campo: string; salvarEm?: string }
  | { type: "filter"; condicoes: Array<{ campo: string; tipo?: "texto" | "numero" | "data" | "booleano" | "lista"; op: string; valor?: string }>; combinador?: "e" | "ou" }
  | { type: "add_to_group"; groupJid: string; account?: string; convite?: boolean; textoConvite?: string }
  | { type: "mention_all"; groupJid: string; text: string; hidden?: boolean; account?: string }
  | { type: "gsheet_append"; sheetUrl: string; colunas: string[]; cabecalhos?: string[]; chave?: number | null }
  | { type: "gsheet_read"; sheetUrl: string; aba?: string; salvarEm?: string; pularSe?: string; limite?: number; ab?: boolean; colunaData?: string; ultimasHoras?: number }
  | { type: "email"; para: string; assunto: string; corpo: string; nomeRemetente?: string; responderPara?: string }
  // Chamada HTTP a outro sistema. `authValor` só existe na ida (o servidor cifra e devolve
  // apenas `authConfigurado`) — o segredo nunca volta pra tela.
  | {
      type: "webhook_out"; url: string; campos: Array<{ chave: string; valor: string }>;
      metodo?: "GET" | "POST" | "PUT";
      authTipo?: "nenhuma" | "header" | "bearer" | "basic" | "query";
      authNome?: string; authValor?: string; authConfigurado?: boolean;
      salvarEm?: string;
    }
  | { type: "notify"; targets: string[]; text: string; account?: string }
  | { type: "note"; text: string; w?: number; h?: number }
  | { type: "tag"; tags: string[] }
  | { type: "utm" }
  | { type: "window"; horas?: number }
  | { type: "condition"; checa?: "campo" | "tag"; campo?: string; op?: "igual" | "contem" | "existe"; valor?: string }
  | { type: "switch"; campo?: string; casos?: Array<{ rotulo: string; valor: string; op?: "igual" | "contem" }> }
  | { type: "location"; lat: string; lng: string; nome?: string; endereco?: string }
  | { type: "code"; codigo: string }
  | { type: "set_variable"; campo: string; valor: string }
  | { type: "google_contact"; nome?: string; telefone?: string; email?: string; notas?: string }
  | { type: "google_doc"; modo?: "criar" | "anexar" | "preencher"; titulo?: string; corpo?: string; docUrl?: string }
  | { type: "google_calendar"; acao?: "horarios" | "criar" | "calls_do_dia" | "convidar"; busca?: string; email?: string; dias?: number; inicio?: string; fim?: string; duracaoMin?: number;
      diasSemana?: number[]; antecedenciaMin?: number; maxOpcoes?: number; porPeriodo?: boolean; titulo?: string; descricao?: string; quando?: string; calendarId?: string; diaOffset?: number; salvarEm?: string; umPorDia?: boolean }
  | { type: "reminder"; text?: string }
  // ✍️ ZAPSIGN: assinaturas pendentes (token em Integrações → ZapSign).
  | { type: "zapsign"; acao?: "pendentes"; diasMin?: number; telefones?: boolean; salvarEm?: string }
  | { type: "meta_ads"; periodo?: "hoje" | "ontem"; actId?: string; token?: string; salvarEm?: string }
  | { type: "metricas_dia"; periodo?: "hoje" | "ontem"; salvarEm?: string }
  // 💳 ASAAS: um nó, várias ações — a chave da API fica em Integrações (nunca no fluxo).
  | { type: "asaas";
      acao: "checar_pagamento" | "enviar_comprovante" | "criar_cobranca" | "pix_copia_cola" | "listar_cobrancas" | "buscar_cliente";
      buscarPor?: "cobranca" | "cliente" | "cpf" | "email";
      valorBusca?: string;
      mensagem?: string;
      cobrancaTipo?: "PIX" | "BOLETO" | "UNDEFINED";
      cobrancaValor?: string;
      cobrancaVencimentoDias?: number;
      cobrancaDescricao?: string;
      filtroStatus?: string;
      filtroVencidoDias?: number;
      salvarEm?: string;
    }
  | {
      type: "template"; templateName: string; language?: string; params?: string[];
      // Arquivo do CABEÇALHO deste envio (template com imagem/vídeo/documento). Sem ele vai a mídia
      // de EXEMPLO da aprovação — que serve pra teste, mas expira e não dá pra personalizar.
      headerUrl?: string;
      // Rótulos das RESPOSTAS RÁPIDAS (o editor salva ao escolher o template) — o motor usa pra
      // rotear o clique pelo ramo "b<i>". Botão de URL/ligar não gera resposta, fica de fora.
      botoes?: string[];
      // Retrato do template pro NÓ virar um mockup de celular no canvas (corpo, mídia do topo,
      // rodapé, TODOS os botões com tipo, e a conta dona). Só visual — o motor ignora.
      mock?: {
        body?: string; footer?: string;
        header?: { formato: string; url?: string };
        botoes?: Array<{ texto: string; tipo: "resposta" | "url" | "telefone" | "copiar" }>;
        waba?: { rotulo?: string; foto?: string };
      };
    };
// `_id` = id estável do passo (o motor ignora); usado pelo builder p/ posição livre, arestas e seleção.
export type Step = StepBody & { _id?: string };

// Conexão entre nós (grafo). Ausente = fluxo linear (trigger → s0 → s1 → …).
export interface FlowEdge {
  id: string;
  source: string; // id do nó de origem ("trigger" ou o _id do passo)
  sourceHandle?: string | null; // saída específica: "b0"/"b1" (botão), "p:<nome>" (caminho), "ended", "yes"/"no"
  target: string; // _id do passo de destino
}
export interface Automation {
  id: string;
  name?: string; // rótulo amigável (o motor ignora; só pro painel)
  trigger: string;
  keyword?: string; // só quando trigger === "keyword"
  keywordMatch?: "exact" | "contains"; // "exact" (msg = palavra) ou "contains" (palavra aparece na msg)
  // 🎤 COMANDO POR VOZ: transcreve o ÁUDIO do lead e testa a palavra-chave no que ele falou.
  // Desligado por padrão — transcrever custa por minuto e só faz sentido em fluxo de comando
  // ("bloqueia meu carro", "quero o boleto"), não em atendimento comum.
  audioComoTexto?: boolean;
  templateName?: string;    // gatilho "template_reply": qual template arma o gatilho (vazio = qualquer)
  botoesGatilho?: string[];
  // Retrato do template do GATILHO (o nó vira mockup de celular, igual ao passo). Só visual — o
  // motor ignora; os handles continuam por rótulo ("b:<texto>").
  mockGatilho?: { body?: string; footer?: string; header?: { formato: string; url?: string }; botoes?: Array<{ texto: string; tipo: "resposta" | "url" | "telefone" | "copiar" }>; waba?: { rotulo?: string; foto?: string } };
  // Valores de {{1}},{{2}}… e imagem do gatilho: alimentam a PRÉVIA do nó e o "enviar teste" dali
  // (o gatilho não envia nada sozinho — quem envia é o Disparador/outro fluxo).
  paramsGatilho?: string[];
  headerUrlGatilho?: string; // rótulos das respostas rápidas — cada um é uma porta "b:<rótulo>" no nó
  grupos?: string[];      // gatilhos de GRUPO: em quais grupos escutar (vazio = todos)
  plataforma?: string;    // gatilhos de CHECKOUT: de qual integração aceitar (vazio = qualquer uma)
  eventos?: string[];
  // Filtro de PRODUTO do gatilho de checkout: só dispara com evento DESSES produtos (id exato ou
  // nome que contenha). Vazio = todos. Serve pra recuperação de carrinho de UM produto só — e pra
  // decidir se order bump entra ou não (adiciona o produto do bump à lista quando quiser).
  produtos?: Array<{ id?: string; nome?: string }>;     // gatilho SWITCH de checkout: eventos marcados (cada um vira uma saída)
  webhookDe?: string;    // recebe pelo webhook de OUTRO fluxo (id do dono): uma URL na Kiwify, vários fluxos
  platforms?: string[];
  // Gatilho WEBHOOK: caminho pontuado até o telefone quando ele vem ANINHADO no JSON
  // (ex.: "device.vin"). Checado ANTES dos nomes padrão (telefone/phone/whatsapp/celular/numero).
  campoTelefone?: string;
  // GATILHO POR HORÁRIO (trigger "schedule"): dispara sozinho, sem evento de fora, pro destino
  // fixo configurado aqui — equivalente ao Schedule Trigger do n8n.
  scheduleCron?: string;    // "min hora dia mês dow" (5 campos)
  scheduleTarget?: string;  // telefone (DDI+DDD+número) ou grupo @g.us
  scheduleAccount?: string; // conta que envia; vazio = conta padrão
  // 📱 Número do fluxo (topo do gatilho): id da conta ("lite-xxxx", "lite", "api"). Vazio = todos.
  conta?: string;
  // Exemplo de payload do gatilho, guardado NO FLUXO: é em cima dele que a pessoa monta e testa
  // o fluxo por dias, então não pode viver só na memória do motor (reinício apagava).
  // `resumo`/`evento`/`produto` só existem no gatilho de CHECKOUT: é o evento mastigado (Nome,
  // Produto, Valor…) que o nó mostra na escuta, e ele também precisa sobreviver ao recarregar.
  exemploWebhook?: {
    at: number; status: string; telefone?: string; fields?: Record<string, string>; raw?: string; simulado?: boolean;
    resumo?: Array<{ rotulo: string; variavel?: string; valor: string }>; evento?: string; produto?: string;
  };
  // 📌 DADOS FIXADOS que vieram do n8n (pinData): id do nó daqui ("trigger" ou o _id do passo) →
  // o JSON que estava travado lá. No n8n isso significa "este nó roda com um exemplo fixo, não
  // com dado real" — quem migra precisa VER isso, senão testa o fluxo achando que o dado é de
  // verdade. Aqui é só sinalização (o motor ignora): o nó ganha o pino, com o JSON no tooltip.
  pinData?: Record<string, string>;
  steps: Step[]; // os NÓS do fluxo
  edges?: FlowEdge[]; // as CONEXÕES (quando ramificado); ausente = linear
  layout?: Record<string, { x: number; y: number }>; // posições livres dos nós no builder (id → x/y)
  enabled?: boolean; // false = RASCUNHO (não dispara). ausente/true = ativo.
  updatedAt?: string; // ISO da última edição (mostrado na lista)
}

// ── Lembretes agendados ──────────────────────────────────────────────────────
export interface Reminder {
  id: string;
  name?: string;
  enabled: boolean;
  schedule: { type: "once" | "daily" | "weekly"; time: string; days?: number[]; date?: string };
  target: string; // número (com DDD) ou grupo @g.us
  message: string;
  mediaType?: string;
  mediaFile?: string;
  flowId?: string; // se setado, INICIA esse fluxo em vez de mandar a mensagem
  account?: string; // conta (número) à qual o lembrete está atrelado — envia por ela
}
export const WEEKDAYS = [
  { n: 1, label: "Seg" }, { n: 2, label: "Ter" }, { n: 3, label: "Qua" },
  { n: 4, label: "Qui" }, { n: 5, label: "Sex" }, { n: 6, label: "Sáb" }, { n: 0, label: "Dom" },
];

// ── Funil por nó (stats) ─────────────────────────────────────────────────────
export interface FlowStats {
  total: number; // PASSAGENS pelo fluxo no período (teste do próprio dono conta também)
  byNode: Record<string, { count: number; pessoas?: number; pct: number }>; // passagens, gente distinta e %
}
export const STATS_PERIODS: Array<{ id: string; label: string }> = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Mês atual" },
  { id: "ano", label: "Ano atual" },
  { id: "max", label: "Máximo" },
  { id: "custom", label: "Personalizado" },
];
// Traduz o período escolhido numa janela {since, until} em ISO (null = sem limite).
export function periodRange(period: string, custom?: { since?: string; until?: string }): { since: string | null; until: string | null } {
  const now = new Date();
  const DAY = 86400000;
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  switch (period) {
    case "hoje": return { since: startOfDay(now).toISOString(), until: null };
    case "ontem": return { since: startOfDay(new Date(now.getTime() - DAY)).toISOString(), until: new Date(startOfDay(now).getTime() - 1).toISOString() };
    case "7d": return { since: new Date(now.getTime() - 7 * DAY).toISOString(), until: null };
    case "30d": return { since: new Date(now.getTime() - 30 * DAY).toISOString(), until: null };
    case "mes": return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), until: null };
    case "ano": return { since: new Date(now.getFullYear(), 0, 1).toISOString(), until: null };
    case "custom": return {
      since: custom?.since ? new Date(custom.since + "T00:00:00").toISOString() : null,
      until: custom?.until ? new Date(custom.until + "T23:59:59.999").toISOString() : null,
    };
    default: return { since: null, until: null };
  }
}

// Gatilhos (eventos canônicos) → rótulo + emoji.
export const TRIGGERS: Record<string, { label: string; emoji: string }> = {
  keyword: { label: "Palavra-chave (teste)", emoji: "🔑" },
  primeiro_contato: { label: "1º contato (lead novo)", emoji: "🆕" },
  group_mention: { label: "Me marcaram num grupo", emoji: "📣" },
  group_keyword: { label: "Palavra-chave num grupo", emoji: "👥" },
  lead_trial: { label: "Lead pediu teste grátis (avisa o afiliado)", emoji: "🎟️" },
  novo_afiliado: { label: "Novo afiliado (boas-vindas + 30 dias grátis)", emoji: "🤝" },
  webhook: { label: "Webhook (formulário / outro sistema)", emoji: "🔗" },
  schedule: { label: "Agendamento (horário/recorrência)", emoji: "⏰" },
  template_reply: { label: "Respondeu o template (disparo)", emoji: "📋" },
  purchase_approved: { label: "Compra aprovada", emoji: "✅" },
  pix_generated: { label: "PIX gerado", emoji: "💠" },
  boleto_generated: { label: "Boleto gerado", emoji: "🧾" },
  cart_abandoned: { label: "Carrinho abandonado", emoji: "🛒" },
  checkout_started: { label: "Checkout iniciado", emoji: "🛍️" },
  purchase_refused: { label: "Compra recusada", emoji: "❌" },
  refund: { label: "Reembolso", emoji: "↩️" },
  chargeback: { label: "Chargeback", emoji: "⚠️" },
  subscription_canceled: { label: "Assinatura cancelada", emoji: "🚫" },
  subscription_renewed: { label: "Assinatura renovada", emoji: "🔁" },
  payment_delayed: { label: "Pagamento atrasado", emoji: "⏰" },
  unknown: { label: "Outro", emoji: "•" },
};

// PALETA DE GATILHOS: a coluna da esquerda mostra UM nó por assunto (Grupos, Checkout…), e o
// evento exato vira CONFIGURAÇÃO no painel da direita — igual aos passos. Antes eram 17 opções
// soltas num select; e listar os 11 eventos de venda na paleta deixava a coluna impossível de ler.
// `itens[0]` é o que o nó assume ao ser escolhido; `admin: true` só o super admin vê.
export const TRIGGER_PALETTE: Array<{ id: string; label: string; grupo: string; itens: string[]; admin?: boolean; oculto?: boolean }> = [
  { id: "primeiro_contato", label: "1º contato", grupo: "Conversa", itens: ["primeiro_contato"] },
  { id: "keyword", label: "Palavra-chave", grupo: "Conversa", itens: ["keyword"] },
  { id: "grupos", label: "Grupos", grupo: "Grupos", itens: ["group_mention", "group_keyword"] },
  // Checkout é SWITCH: o nó é um só (trigger "checkout") e cada evento marcado vira uma SAÍDA no
  // canvas. `itens` aqui é o cardápio de eventos que aparece como caixinhas nas configurações.
  { id: "checkout", label: "Checkout", grupo: "Venda", itens: [
    "purchase_approved", "pix_generated", "boleto_generated", "cart_abandoned", "checkout_started",
    "purchase_refused", "refund", "chargeback", "subscription_canceled", "subscription_renewed", "payment_delayed",
  ] },
  // Resposta de template: o Disparador manda o template em massa; quem responder/clicar em até
  // 7 dias cai neste fluxo. Cada botão do template vira uma PORTA de saída do gatilho.
  { id: "template_reply", label: "Template", grupo: "Disparo em massa", itens: ["template_reply"] },
  { id: "webhook", label: "Webhook", grupo: "Integrações", itens: ["webhook"] },
  { id: "schedule", label: "Agendamento", grupo: "Integrações", itens: ["schedule"] },
  { id: "afiliado", label: "Afiliado", grupo: "Afiliados", itens: ["novo_afiliado", "lead_trial"], admin: true },
  // "Outro" saiu da paleta (12/08, pedido do dono: não serve pra nada como gatilho — nenhum
  // evento real chega como "unknown" pra iniciar fluxo). Fica OCULTO, não removido: fluxo salvo
  // com esse gatilho ainda é reconhecido pelo editor em vez de virar tela quebrada.
  { id: "unknown", label: "Outro (não use)", grupo: "Outro", itens: ["unknown"], oculto: true },
];
// De qual nó da paleta um gatilho veio (pra destacar o nó certo e achar os irmãos dele).
export const paletaDoGatilho = (trigger: string) =>
  // "checkout" é o id do nó switch (não está em `itens`, que lista os eventos dele).
  TRIGGER_PALETTE.find((p) => p.id === trigger || p.itens.includes(trigger)) ?? TRIGGER_PALETTE[TRIGGER_PALETTE.length - 1];
export const ehGatilhoDeGrupo = (t: string) => t === "group_mention" || t === "group_keyword";
export const EVENTOS_CHECKOUT = TRIGGER_PALETTE.find((p) => p.id === "checkout")!.itens;
// O que CADA integração realmente entrega (conferido no leitor do motor, webhooks/kiwify.ts).
// Serve pra não deixar o usuário marcar uma saída que nunca vai disparar — foi o caso do
// "checkout iniciado", que a Kiwify não manda (12/08).
export const EVENTOS_POR_PLATAFORMA: Record<string, string[]> = {
  kiwify: [
    "purchase_approved", "purchase_refused", "refund", "chargeback",
    "pix_generated", "boleto_generated", "cart_abandoned",
    "subscription_canceled", "subscription_renewed", "payment_delayed",
  ],
};
// `plataforma` vazia = hoje só existe leitor da Kiwify, então vale a lista dela.
export const eventoDisponivel = (ev: string, plataforma?: string) =>
  (EVENTOS_POR_PLATAFORMA[plataforma || "kiwify"] ?? EVENTOS_CHECKOUT).includes(ev);
export const ehGatilhoDeCheckout = (t: string) => t === "checkout" || EVENTOS_CHECKOUT.includes(t);

// Plataforma de checkout do gatilho de venda. Só a Kiwify tem leitor pronto no motor; as outras
// ficam visíveis como "em breve" pra deixar claro o caminho, sem prometer o que não existe.
export const PLATAFORMAS_CHECKOUT: Array<{ id: string; label: string; pronta: boolean }> = [
  { id: "kiwify", label: "Kiwify", pronta: true },
  { id: "hotmart", label: "Hotmart", pronta: false },
  { id: "eduzz", label: "Eduzz", pronta: false },
  { id: "monetizze", label: "Monetizze", pronta: false },
  { id: "perfectpay", label: "Perfect Pay", pronta: false },
];

// Tipos de passo → rótulo + emoji.
export const STEP_META: Record<string, { label: string; emoji: string }> = {
  text: { label: "Enviar texto", emoji: "💬" },
  presence: { label: "Digitando…", emoji: "⌨️" },
  call: { label: "Ligar (toca)", emoji: "📞" },
  wait: { label: "Esperar (atraso / follow-up)", emoji: "⏱️" },
  ptt: { label: "Áudio (voz)", emoji: "🎤" },
  ptv: { label: "Vídeo bolinha", emoji: "🎥" },
  media: { label: "Mídia", emoji: "🖼️" },
  location: { label: "Localização (mapa)", emoji: "📍" },
  code: { label: "Código (JavaScript)", emoji: "🧩" },
  edit_fields: { label: "Editar campos (Set)", emoji: "📝" },
  loop: { label: "Loop (para cada item)", emoji: "🔁" },
  filter: { label: "Filtro (só continua se…)", emoji: "🚦" },
  split_out: { label: "Separar lista (Split Out)", emoji: "📤" },
  // ALIAS de paleta: cria um passo `wait`, mas entra pela porta "dev" (com os modos do n8n).
  // Mesmo motor, duas portas — o leigo clica em "Esperar", quem vem do n8n acha o "Wait".
  wait_n8n: { label: "Wait (avançado)", emoji: "⏳" },
  buttons: { label: "Botões", emoji: "🔘" },
  carousel: { label: "Carrossel", emoji: "🎠" },
  ask: { label: "Perguntar (IA)", emoji: "❓" },
  ai_agent: { label: "Agente IA", emoji: "🤖" },
  notify: { label: "Avisar alguém", emoji: "🔔" },
  add_to_group: { label: "Adicionar ao grupo", emoji: "➕" },
  mention_all: { label: "Marcar todos", emoji: "📣" },
  gsheet_append: { label: "Planilha Google", emoji: "📊" },
  gsheet_read: { label: "Ler planilha", emoji: "📗" },
  email: { label: "Enviar e-mail", emoji: "✉️" },
  webhook_out: { label: "Enviar webhook", emoji: "🔗" },
  note: { label: "Nota", emoji: "📝" },
  tag: { label: "Etiqueta (CRM)", emoji: "🏷️" },
  utm: { label: "Coletar UTMs", emoji: "🎯" },
  window: { label: "Janela de conversa", emoji: "🕐" },
  condition: { label: "Condição", emoji: "🔀" },
  switch: { label: "Switch (roteamento múltiplo)", emoji: "🔀" },
  set_variable: { label: "Definir variável", emoji: "📝" },
  google_contact: { label: "Google Contatos", emoji: "👤" },
  google_doc: { label: "Google Docs", emoji: "📄" },
  google_calendar: { label: "Agenda Google", emoji: "📅" },
  // Atalho de paleta: vira um passo "media" com tipo documento já escolhido (funciona LITE e Oficial).
  documento: { label: "Documento (arquivo)", emoji: "📎" },
  reminder: { label: "Lembrete (escuta)", emoji: "⏰" },
  template: { label: "Template (API Oficial)", emoji: "📋" },
  payment_check: { label: "Consulta pagamento", emoji: "💳" },
  asaas: { label: "Asaas (cobranças)", emoji: "💳" },
  zapsign: { label: "ZapSign (assinaturas)", emoji: "✍️" },
  meta_ads: { label: "Métricas Meta Ads", emoji: "📈" },
  metricas_dia: { label: "Métricas do dia (vendas e conversas)", emoji: "📊" },
  bloquear: { label: "Bloquear contato", emoji: "🚫" },
};

// Paleta agrupada: a lista corrida de 16 itens era difícil de varrer. Aqui os passos ficam
// separados por PARA QUE SERVEM. (O GATILHO não entra: ele é um só, e se escolhe no nó de cima.)
export const STEP_GROUPS: Array<{ titulo: string; itens: string[] }> = [
  { titulo: "Conversa",   itens: ["text", "presence", "wait", "call", "ask", "ai_agent", "reminder"] },
  { titulo: "Mídia",      itens: ["ptt", "ptv", "media", "documento", "location"] },
  { titulo: "Interação",  itens: ["buttons", "carousel", "template"] },
  { titulo: "Grupos",     itens: ["add_to_group", "mention_all"] },
  { titulo: "Conectores", itens: ["email", "asaas", "zapsign", "meta_ads", "metricas_dia", "gsheet_append", "gsheet_read", "google_doc", "google_contact", "google_calendar", "webhook_out"] },
  { titulo: "Decisão",    itens: ["payment_check", "condition", "switch", "window"] },
  { titulo: "Organizar",  itens: ["tag", "utm", "set_variable", "bloquear", "notify", "note"] },
  // ── DEV: os nós equivalentes aos do n8n, pra quem já monta automação e importa de lá. Só
  // coisa que roda NO MEIO do fluxo — gatilho (webhook, agendamento) fica na paleta de cima.
  { titulo: "Dev (n8n)",  itens: ["edit_fields", "filter", "split_out", "wait_n8n", "code", "webhook_out", "loop"] },
];

// Resumo curto de um passo, pra mostrar dentro do nó.
export function stepSummary(s: Step): string {
  switch (s.type) {
    case "text": return (s.text || "").slice(0, 46) || "(vazio)";
    case "presence": return s.presence === "recording" ? "gravando áudio" : "digitando";
    case "call": return `liga e desliga em ${s.callDuration || 5}s`;
    case "wait": {
      // Mesma regra do editor: a MAIOR unidade que representa o valor sem quebrar. "1209600s" no
      // canvas não diz nada; "14 dias" diz (print do dono, 14/09).
      if (s.modo === "data" && s.quando) {
        const q = String(s.quando).replace("T", " ");
        const m = q.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/);
        return m ? `até ${m[3]}/${m[2]} ${m[4]}` : `até ${q.slice(0, 16)}`;
      }
      const ms = Math.max(0, Number(s.ms) || 0);
      const und = [
        { ms: 86_400_000, um: "dia", varios: "dias" }, { ms: 3_600_000, um: "hora", varios: "horas" },
        { ms: 60_000, um: "min", varios: "min" }, { ms: 1000, um: "s", varios: "s" },
      ].find((u) => ms >= u.ms && ms % u.ms === 0) ?? { ms: 1000, um: "s", varios: "s" };
      const n = Math.round((ms / und.ms) * 10) / 10;
      const rot = n === 1 ? und.um : und.varios;
      return und.um === "s" || und.um === "min" ? `${n}${rot === "s" ? "s" : " min"}` : `${n} ${rot}`;
    }
    case "ptt": return s.file ? "áudio" : "(sem arquivo)";
    case "ptv": return s.file ? "vídeo bolinha" : "(sem arquivo)";
    case "media": return `${s.mediaType}${s.file ? "" : " (sem arquivo)"}`;
    case "carousel": return `${(s.cards ?? []).length} card(s)`;
    case "buttons": return `${(s.text || "").slice(0, 30) || "(sem texto)"} · ${s.buttons.filter(Boolean).length} botão(ões)`;
    case "ask": return `${(s.text || "").slice(0, 22) || "(pergunta)"} → {{${s.variable || "?"}}}`;
    case "ai_agent": return (s.systemPrompt || "").slice(0, 60) || "sem instruções";
    case "notify": return `${s.targets.filter(Boolean).length} destino(s) · ${(s.text || "").slice(0, 24) || "(sem texto)"}`;
    case "add_to_group": return s.groupJid || "(sem grupo)";
    case "mention_all": return (s.text || "").slice(0, 40) || "(sem texto)";
    case "gsheet_append": return `${(s.colunas || []).length} coluna(s) → planilha` + (typeof s.chave === "number" ? " · atualiza a linha" : "");
    case "webhook_out": {
      try { return `${(s.campos || []).length} campo(s) → ${new URL(s.url).hostname}`; }
      catch { return s.url ? `${(s.campos || []).length} campo(s)` : "falta o endereço"; }
    }
    case "note": return (s.text || "").slice(0, 60) || "(nota vazia)";
    case "tag": return (s.tags || []).filter(Boolean).join(", ").slice(0, 50) || "(sem etiqueta)";
    case "utm": return "coleta a origem do lead (UTMs)";
    case "window": return s.horas ? `janela de ${s.horas}h` : "24h (72h se veio de anúncio)";
    case "condition": return s.checa === "tag" ? `tem a etiqueta "${s.valor || "?"}"` : `${s.campo || "campo"} ${s.op || "existe"}${s.op && s.op !== "existe" ? ` "${s.valor || ""}"` : ""}`;
    case "location": return s.nome?.trim() || `${s.lat || "lat"}, ${s.lng || "lng"}`;
    case "split_out": return `${s.campo || "campo"} → {{${s.salvarEm || (s.campo || "campo").replace(/[^\w]/g, "_") + "_itens"}}}`;
    case "filter": return `${(s.condicoes ?? []).filter((c) => c.campo?.trim()).length} condição(ões)`;
    case "loop": return `cada item de {{${s.lista || "lista"}}}`;
    case "edit_fields": return `${(s.campos ?? []).filter((c) => c.campo?.trim()).length} campo(s)`;
    case "code": return (s.codigo || "").split("\n").find((l) => l.trim() && !l.trim().startsWith("//"))?.trim().slice(0, 40) || "sem código";
    case "switch": return `${s.campo || "campo"} → ${(s.casos ?? []).filter((c) => c.rotulo?.trim()).length} caso(s)`;
    case "set_variable": return `${s.campo || "campo"} = ${(s.valor || "").slice(0, 24) || "(vazio)"}`;
    case "google_contact": return "salva o lead no Google Contatos";
    case "google_calendar": return s.acao === "criar" ? `marca reunião em ${(s.quando || "{{horario_escolhido}}").slice(0, 24)}` : s.acao === "calls_do_dia" ? `lista as calls de ${Number(s.diaOffset) === 1 ? "amanhã" : "hoje"} → {{${s.salvarEm || "calls_hoje"}}}` : `busca horários livres (${s.dias || 5} dias)`;
    case "google_doc": return s.modo === "anexar" ? "anexa um parágrafo num documento" : s.modo === "preencher" ? "preenche <<campos>> num documento" : `cria "${(s.titulo || "documento").slice(0, 26)}"`;
    case "reminder": return (s.text || "").slice(0, 40) || "escuta e agenda um lembrete";
    case "template": return s.templateName ? `template: ${s.templateName}` : "(escolha um template)";
    case "payment_check": return s.produto ? `${s.porCodigo ? "código" : "produto"}: ${s.produto}` : "qualquer produto";
    case "asaas": {
      const r: Record<string, string> = {
        checar_pagamento: "checar pagamento", enviar_comprovante: "enviar comprovante",
        criar_cobranca: "criar cobrança", pix_copia_cola: "PIX copia-e-cola",
        listar_cobrancas: "listar cobranças", buscar_cliente: "buscar cliente",
      };
      return r[s.acao] ?? s.acao;
    }
    case "email": return (s.assunto || "sem assunto") + (s.para ? ` → ${s.para}` : "");
    case "gsheet_read": return s.sheetUrl ? `lista → {{${(s.salvarEm || "planilha").replace(/[^\w]/g, "_")}_data}}` : "sem planilha";
    case "zapsign": return "assinaturas pendentes" + (s.diasMin ? ` há ${s.diasMin}+ dia(s)` : "");
    case "meta_ads": return (s.periodo === "ontem" ? "ontem" : "hoje") + " → {{" + ((s.salvarEm || "ads").replace(/[^\w]/g, "_")) + "_resumo}}";
    case "metricas_dia": return (s.periodo === "ontem" ? "ontem" : "hoje") + " → {{" + ((s.salvarEm || "dia").replace(/[^\w]/g, "_")) + "_resumo}}";
    case "bloquear": return (s.tags || []).filter(Boolean).join(", ") || "Contato bloqueado";
    default: return "";
  }
}

// ══ O QUE FUNCIONA NA API OFICIAL (Cloud API da Meta) ═══════════════════════════════════════
// Conferido na documentação da Meta em 19/08/2026 (não é chute):
//  · reference/messages  → tipos livres aceitos dentro da janela de 24h
//  · cloud-api/typing-indicators → o "digitando" existe, MAS exige o message_id de uma mensagem
//    RECEBIDA e some em 25s
//  · business-management-api/message-templates/carousel-templates → carrossel é SÓ template
//    aprovado (marketing), 2 a 10 cards — não existe como mensagem livre
// Quando o fluxo tem um passo de TEMPLATE (ou o gatilho é de template), ele roda pela API
// Oficial — e aí os passos abaixo não têm como funcionar.
export type CompatOficial = { nivel: "ok" | "atencao" | "nao"; aviso?: string };
export const COMPAT_OFICIAL: Record<string, CompatOficial> = {
  ptv: { nivel: "nao", aviso: "A API Oficial da Meta NÃO tem vídeo de bolinha (PTV) — esse formato só existe no WhatsApp Lite. Num fluxo com template, este passo não envia nada." },
  call: { nivel: "nao", aviso: "Ligação por WhatsApp só existe no WhatsApp Lite — a API Oficial da Meta não origina chamadas. Num fluxo de API este passo é ignorado." },
  carousel: { nivel: "nao", aviso: "Na API Oficial o carrossel só existe como TEMPLATE aprovado pela Meta (2 a 10 cards, categoria Marketing) — não dá pra montar um carrossel livre no meio da conversa. Este passo só funciona no WhatsApp Lite." },
  presence: { nivel: "ok", aviso: "Funciona na API Oficial DEPOIS que a pessoa falar (a Meta atrela o \"digitando\" à mensagem que ela acabou de mandar, e ele some em 25s). Num fluxo de template, o clique no botão já conta como fala — então o digitando aparece. Antes da primeira fala dela, o passo só faz a pausa." },
  buttons: { nivel: "ok", aviso: "Funciona na API Oficial (até 3 botões, sem precisar de template), mas SÓ dentro da janela de 24h — fora dela a Meta recusa. Depois de um template, use os botões do próprio template." },
  add_to_group: { nivel: "atencao", aviso: "Grupo é do WhatsApp Lite: a API Oficial não tem grupos. Escolha aqui embaixo POR QUAL NÚMERO Lite a ação vai rodar — aí funciona mesmo dentro de um fluxo de API." },
  mention_all: { nivel: "atencao", aviso: "Grupo é do WhatsApp Lite: a API Oficial não tem grupos. Escolha aqui embaixo POR QUAL NÚMERO Lite a ação vai rodar — aí funciona mesmo dentro de um fluxo de API." },
  notify: { nivel: "atencao", aviso: "Se o aviso for pra um grupo, ele precisa sair por um número Lite (a API Oficial não tem grupos). Escolha o número aqui embaixo." },
  media: { nivel: "ok", aviso: "Funciona na API Oficial (imagem, vídeo, áudio e documento), dentro da janela de 24h." },
  ptt: { nivel: "ok", aviso: "Áudio de voz funciona na API Oficial, dentro da janela de 24h." },
  location: { nivel: "ok", aviso: "Pino no mapa funciona nas duas contas (na API Oficial, dentro da janela de 24h)." },
  loop: { nivel: "ok", aviso: "Cada item vira um disparo pra uma pessoa diferente. Na API Oficial, quem não falou nas últimas 24h só recebe TEMPLATE." },
  window: { nivel: "ok", aviso: "Feito pra API Oficial: é a regra da Meta de 24h (72h quando o lead veio de anúncio Click-to-WhatsApp). No WhatsApp Lite não existe janela — lá o nó sempre sai por \"aberta\"." },
};
// O fluxo fala pela API Oficial? (tem passo de template, ou o gatilho é resposta de template)
export function fluxoEhOficial(a: { trigger?: string; steps?: Array<{ type: string }> }): boolean {
  if (a?.trigger === "template_reply") return true;
  return (a?.steps ?? []).some((x) => x.type === "template");
}
// EM QUAL NÚMERO este fluxo roda: "oficial" (tem template — só a API Oficial entrega isso),
// "lite" (gatilho de grupo, ou passo que COMPAT_OFICIAL marca como "nao" — carrossel livre,
// PTV, ligação — a API Oficial não tem) ou "ambos" (texto/mídia/botão comuns, que valem nos dois).
// Pedido do dono (24/08): "como eu distingo se um fluxo é de API oficial ou Lite?"
export type OrigemFluxo = "oficial" | "lite" | "ambos";
export function origemDoFluxo(a: { trigger?: string; steps?: Array<{ type: string }> }): OrigemFluxo {
  if (fluxoEhOficial(a)) return "oficial";
  if (ehGatilhoDeGrupo(a.trigger ?? "")) return "lite"; // grupo não existe na API Oficial
  if ((a.steps ?? []).some((s) => COMPAT_OFICIAL[s.type]?.nivel === "nao")) return "lite";
  return "ambos";
}

// ── 📞 MÁSCARA DE TELEFONE ────────────────────────────────────────────────────────────────────
// Pedido do dono (23/08): o campo já nasce com "+55" e os parênteses/traço aparecem SOZINHOS
// enquanto ele digita — "fica bem mais profissional". Quem precisa de outro país apaga o 55 e
// digita o DDI dele (aí a máscara só agrupa em blocos legíveis, sem inventar formato de BR).
export const DDI_PADRAO = "55";

/** Dígitos crus (sem +, espaço, parêntese) — é o que vai pra API. */
export const soDigitosFone = (v: string) => String(v ?? "").replace(/\D/g, "").slice(0, 15);

/** "5511999999999" → "+55 (11) 99999-9999". Formata parcial enquanto digita. */
export function mascaraFone(bruto: string): string {
  const d = soDigitosFone(bruto);
  if (!d) return "";
  if (!d.startsWith(DDI_PADRAO)) {
    // Outro país: não dá pra adivinhar o formato — agrupa de 3 em 3 pra ficar legível.
    const g = d.slice(0, 15).replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ");
    return "+" + g;
  }
  const ddd = d.slice(2, 4);
  const resto = d.slice(4, 15);
  let out = "+55";
  if (ddd) out += " (" + ddd + (ddd.length === 2 ? ")" : "");
  if (resto) {
    // 9 dígitos = celular (5 antes do traço); 8 = fixo (4 antes).
    const corte = resto.length > 8 ? 5 : 4;
    out += " " + resto.slice(0, corte);
    if (resto.length > corte) out += "-" + resto.slice(corte, corte + 4);
  }
  return out;
}

/** Valor inicial do campo: já vem com o +55 digitado. */
export const FONE_INICIAL = "+55 ";
