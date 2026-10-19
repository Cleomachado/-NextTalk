import { comoIa } from "./origem-envio.js";
import { jitterDelay } from "../config.js";
import {
  recordNodeHit, setPending, getPending, clearPending, setContactField, getContactFields, getContactFirstSeen,
  saveAgentSession, getAgentSession, clearAgentSession, isOptedOut, addContactTag, getContactName,
  setOptedOut, achaPagamento, getContactTags, ultimaFalaDoLead, resumoCompraRecente, registraDisparoFluxo,
  type Pending, type AgentSession,
} from "../repo.js";
import { extractValue, extractFields, agentDecide } from "./ai.js";
import { REMINDER_VAR, resetReminderFails } from "./reminder-capture.js";
import { toGraph, getNode, nextNodeId, saidaPadrao, saidaDoAgente, hasHandleEdge, type FlowGraph, type FlowEdge } from "./graph.js";
import { scheduleResume, SLEEP_MAX_MS } from "./flow-jobs.js";
import { getCurrentWorkspace, getCurrentInstanceToken } from "../workspace-context.js";
import { getCachedFor } from "../config-store.js";
import { decryptSecret } from "../crypto.js";
import { parseServiceAccount, sheetIdFromUrl, appendSheetRow, explicaErroGoogle, refreshGoogleAccessToken, createGoogleContact, createGoogleDoc, appendGoogleDoc, replaceInGoogleDoc, docIdFromUrl, appendSheetRowOAuth, faltaEscopo, listCalendarEventsOAuth, createCalendarEventOAuth, convidarParaEventoOAuth, upsertSheetRow, upsertSheetRowOAuth, findGoogleContactByPhone, updateGoogleContact, readSheetRowsOAuth } from "../google.js";
import { horariosLivres, sugereDoisHorarios, rotuloRelativo, listaNumerada, lerHorarioEscolhido, rotuloDe, dataNoFuso, partesNoFuso, type Ocupado, type Opcao } from "./agenda.js";
import { MetaGateway } from "../gateway/meta.js";
import { UazapiGateway } from "../gateway/uazapi.js";
import { rodaCodigo } from "./code-sandbox.js";
import { workspacePodeUsar } from "../features.js";
import { destinoPublicoOk, destinoResolveParaPublico, fetchSeguro } from "../lib/rede-segura.js";
import { filtroPassa, type CondicaoFiltro } from "./filtro.js";
import {
  configAsaasDoWorkspace, camposDaCobranca, cobrancaPaga, buscarClienteAsaas, pegarCobranca,
  cobrancaMaisRecente, listarCobrancas, pixCopiaCola, linhaDigitavel, criarCobranca, type CfgAsaas,
} from "./asaas.js";
import { configResendDoWorkspace, enviarEmailResend, textoParaHtml } from "./resend-email.js";
import { configZapSignDoWorkspace, listarPendentes, resumoPendentes } from "./zapsign.js";
import { configMetaAdsDoWorkspace, buscaInsightsMetaAds, normalizaActId } from "./meta-ads.js";
import { metricasDoDia, limitesDoPeriodo } from "./metricas-dia.js";
import { config } from "../config.js";
import type { MediaType, Presence, WhatsAppGateway } from "../gateway/types.js";
import type { CanonicalEvent, NormalizedEvent } from "../webhooks/canonical.js";

// Um passo de automação. Simples de propósito na Fase 1 — cresce depois.
// `_id` = id estável do nó (vem do builder; usado pro funil por nó). O motor não depende dele pra executar.
export type Step = (
  | { type: "text"; text: string }
  | { type: "ptt"; file: string }
  | { type: "ptv"; file: string }
  | { type: "media"; mediaType: MediaType; file: string; caption?: string }
  | { type: "buttons"; text: string; buttons: string[] }
  // Carrossel: cards com imagem + botões que o lead desliza pro lado (só WhatsApp Lite).
  | { type: "carousel"; text: string; cards: Array<{ image: string; text: string; buttons?: string[] }> }
  // Template aprovado da Meta (só API Oficial) — envia FORA da janela de 24h. params = {{1}},{{2}}…
  // `botoes` = rótulos das RESPOSTAS RÁPIDAS do template (o editor salva ao escolher): é o que
  // permite ramificar o fluxo pelo clique — botão de URL/ligar/copiar não gera resposta, não entra.
  | { type: "template"; templateName: string; language?: string; params?: string[]; botoes?: string[]; headerUrl?: string }
  | { type: "presence"; presence: Presence; ms?: number }
  | { type: "call"; callDuration?: number }
  // ms >= 2min → vira FOLLOW-UP AGENDADO (persistente, não segura a conversa). cancelOnReply=false
  // mantém o disparo mesmo se o lead responder (ex.: lembrete programado, não follow-up de vácuo).
  // Espera. `modo:"data"` = esperar ATÉ um momento (o "At Specified Time" do n8n); sem modo é o
  // intervalo de sempre. Os dois caem no mesmo mecanismo: acima de 2min vira follow-up agendado.
  | { type: "wait"; ms: number; cancelOnReply?: boolean; modo?: "intervalo" | "data"; quando?: string }
  // 📝 Define VÁRIOS campos de uma vez (o "Edit Fields"/Set do n8n). O set_variable continua pro
  // uso simples de um campo só — este é a porta de quem vem do n8n e mexe em vários.
  | { type: "edit_fields"; campos: Array<{ campo: string; valor: string }>; salvarNaFicha?: boolean }
  // 🔁 LOOP: pega uma LISTA (normalmente a resposta de um HTTP) e roda o ramo "cada item" uma vez
  // por item. Como cada item costuma ser uma PESSOA diferente (100 cobranças = 100 clientes),
  // cada volta vira um disparo próprio, espaçado — é disparo em massa, e por isso tem teto.
  | { type: "loop"; lista: string; campoTelefone?: string; limite?: number; intervaloMs?: number }
  // 🚦 FILTRO (o "Filter" do n8n): uma saída só — passou segue, não passou PARA. Diferente da
  // Condição, que bifurca. Serve pra descartar quem não interessa sem desenhar ramo morto.
  | { type: "filter"; condicoes: CondicaoFiltro[]; combinador?: "e" | "ou" }
  // 📤 SEPARAR LISTA (o "Split Out" do n8n): tira a lista de dentro da resposta e deixa pronta
  // num campo. No n8n ele "explode" em N itens; aqui quem cria N execuções é o Loop, então este
  // nó faz a metade que falta — achar e normalizar a lista, incluindo quando ela vem aninhada.
  | { type: "split_out"; campo: string; salvarEm?: string }
  // 💳 ASAAS: um nó só, a AÇÃO é escolhida na configuração (pedido do dono e de um cliente, 27/08).
  // A chave da API fica em Integrações → Asaas (cifrada, por workspace) — nunca no fluxo.
  //   checar_pagamento   → acha a cobrança e vira variáveis ({{asaas_pago}}, {{asaas_valor}}…)
  //   enviar_comprovante → checa e, SE paga, envia a mensagem com o comprovante pelo WhatsApp
  //   criar_cobranca     → cria PIX/boleto pro cliente e devolve link + copia-e-cola
  //   pix_copia_cola     → o código PIX de uma cobrança existente
  //   listar_cobrancas   → lista (status/vencimento) no formato que o Separar lista + Loop consomem
  //   buscar_cliente     → acha o cliente no Asaas (id/CPF/e-mail; a API NÃO busca por telefone)
  | { type: "asaas";
      acao: "checar_pagamento" | "enviar_comprovante" | "criar_cobranca" | "pix_copia_cola" | "listar_cobrancas" | "buscar_cliente";
      buscarPor?: "cobranca" | "cliente" | "cpf" | "email";
      valorBusca?: string;               // aceita variável; vazio usa o padrão da busca escolhida
      mensagem?: string;                 // enviar_comprovante: texto (tem padrão pronto)
      cobrancaTipo?: "PIX" | "BOLETO" | "UNDEFINED";
      cobrancaValor?: string;            // aceita variável (ex.: {{valor}})
      cobrancaVencimentoDias?: number;   // vence em N dias (padrão 3)
      cobrancaDescricao?: string;
      filtroStatus?: string;             // listar: PENDING/OVERDUE/… ("" = todas)
      filtroVencidoDias?: number;        // listar: venceu há N dias exatos (0 = vence hoje)
      salvarEm?: string;                 // listar/buscar_cliente: prefixo da resposta (padrão "resposta")
    }
  | { type: "add_to_group"; groupJid: string; account?: string; convite?: boolean; textoConvite?: string }
  | { type: "mention_all"; groupJid: string; text: string; hidden?: boolean; account?: string }
  // `chave` (índice da coluna, 0 = A): ATUALIZA a linha cuja coluna-chave bate (telefone compara
  // pelos dígitos) em vez de acrescentar outra; célula vazia mantém o que já estava. Sem `chave`
  // é o acrescentar de sempre. Pedido do dono (06/10): uma linha por lead, que vai sendo atualizada.
  | { type: "gsheet_append"; sheetUrl: string; colunas: string[]; cabecalhos?: string[]; chave?: number | null }
  // LER PLANILHA: puxa a planilha inteira (linha 1 = nomes das colunas) e entrega a lista pro Loop
  // em {{<prefixo>_data}} — cada linha vira um item com {{nome}}, {{telefone}}, {{primeiro_nome}}…
  // Passo de máquina: roda sem destinatário (gatilho por horário). Pedido do dono, 09/10/2026.
  | { type: "gsheet_read"; sheetUrl: string; aba?: string; salvarEm?: string;
      // DISPARO POR LOTES (13/10): pula linhas com valor nesta coluna (ex.: "status" já preenchido =
      // já recebeu), pega só as N primeiras que sobrarem e, com `ab`, marca {{variante}} A/B alternado.
      pularSe?: string; limite?: number; ab?: boolean;
      // Só linhas cuja coluna de data (ex.: "Data da compra") caiu nas últimas N horas.
      colunaData?: string; ultimasHoras?: number }
  // ENVIAR E-MAIL pela conta Resend do workspace (Integrações → Resend). `corpo` é texto com
  // variáveis; vira HTML simples (quebras de linha, *negrito*, links). Passo de passagem: sem
  // e-mail válido ou sem Resend configurada, loga e segue. Pedido do dono, 09/10/2026.
  | { type: "email"; para: string; assunto: string; corpo: string; nomeRemetente?: string; responderPara?: string }
  // Webhook de SAÍDA: manda os dados do lead pra um sistema de fora (CRM, n8n, outro app).
  // É o par do gatilho "webhook" (que RECEBE). `campos` vira o JSON do corpo, com variáveis.
  // 🔗 Chamada HTTP a outro sistema. Nasceu só como "manda POST"; virou nó de integração de
  // verdade (método, autenticação no próprio nó, e a RESPOSTA virando variável do fluxo). Passo
  // salvo antigo continua valendo: sem `metodo` é POST, como sempre foi.
  | {
      type: "webhook_out"; url: string; campos: Array<{ chave: string; valor: string }>;
      metodo?: "GET" | "POST" | "PUT";
      // Autenticação MORA NO NÓ (não há tela de credenciais). O segredo é guardado cifrado —
      // `authValorEnc` — e nunca volta em claro pro painel nem entra no "baixar fluxo".
      authTipo?: "nenhuma" | "header" | "bearer" | "basic" | "query";
      authNome?: string;      // nome do header/parâmetro (ex.: "apikey", "access_token")
      authValorEnc?: string;  // cifrado no servidor
      // Onde guardar o que o outro sistema respondeu. Vazio = não guarda (comportamento antigo).
      salvarEm?: string;
    }
  // Avisar alguém: manda um aviso pra grupos/números (passo de passagem — segue o fluxo).
  | { type: "notify"; targets: string[]; text: string; account?: string }
  // Nota: bloco de anotação no canvas (lembrete do dono). NÃO é enviado ao lead — o motor ignora.
  | { type: "note"; text: string; w?: number; h?: number }
  // ZAPSIGN: consulta a ZapSign (token em Integrações → ZapSign). "pendentes" = quantos documentos
  // ainda não foram assinados e por quem → {{zapsign_total}}, {{zapsign_resumo}} (texto pronto pro
  // Avisar) e {{zapsign_data}} (lista pro Loop). Passo de passagem; roda sem destinatário (horário).
  | { type: "zapsign"; acao?: "pendentes"; diasMin?: number; telefones?: boolean; salvarEm?: string }
  // 📈 Métricas Meta Ads: gasto/resultados da conta de anúncio viram variáveis ({{ads_*}}).
  // Credencial do nó vence; sem ela vale a de Integrações → Meta Ads (meta-ads-config).
  | { type: "meta_ads"; periodo?: "hoje" | "ontem"; actId?: string; token?: string; salvarEm?: string }
  // 📊 Métricas do dia: conversas novas (anúncio × orgânico) + pedidos da Kiwify ({{dia_*}}).
  | { type: "metricas_dia"; periodo?: "hoje" | "ontem"; salvarEm?: string }
  // Etiqueta: adiciona tag(s) ao contato (alimenta o CRM). Passo de passagem — não envia nada, segue o fluxo.
  | { type: "tag"; tags: string[] }
  // JANELA DE CONVERSA: a Meta só deixa falar livre dentro da janela aberta pela ÚLTIMA fala do
  // lead — 24h normal, ou 72h quando ele veio de anúncio Click-to-WhatsApp (Free Entry Point).
  // Nó de DECISÃO: saídas "aberta" e "fechada". Não envia nada.
  | { type: "window"; horas?: number }
  // CONDIÇÃO: olha um campo da ficha (ou uma etiqueta) e escolhe o caminho. Saídas "sim"/"nao".
  | { type: "condition"; checa?: "campo" | "tag"; campo?: string; op?: "igual" | "contem" | "existe"; valor?: string }
  // SWITCH: uma variável, várias saídas por VALOR (ex.: status do webhook → chave_ligada,
  // fio_desconectado, veiculo_bloqueado…). Cada caso é uma porta; sem casar, cai na saída padrão.
  | { type: "switch"; campo?: string; casos?: Array<{ rotulo: string; valor: string; op?: "igual" | "contem" }> }
  // 📍 Pino no mapa. lat/lng aceitam variável ({{latitude}}) — é assim que alerta de rastreador
  // manda "onde o veículo está agora" logo depois do texto do alerta.
  | { type: "location"; lat: string; lng: string; nome?: string; endereco?: string }
  // 🧩 CÓDIGO: JavaScript do cliente pra tratar dados. Roda em interpretador ISOLADO (QuickJS/WASM)
  // e só existe pra workspace com a feature "code_node" liberada pelo super admin.
  | { type: "code"; codigo: string }
  // DEFINIR VARIÁVEL: grava um valor na ficha do contato (aceita variáveis no valor). Passagem.
  | { type: "set_variable"; campo: string; valor: string }
  // Coletar UTMs: guarda na ficha de onde o lead veio (origem/mídia/campanha/criativo/termo/anúncio),
  // o que vier no evento do gatilho. Passo de passagem — sem UTM, não faz nada e segue.
  | { type: "utm" }
  // Google Docs pelo login do dono: cria um documento por lead (proposta/contrato) OU acrescenta
  // um parágrafo num documento que já existe. Passo de passagem.
  | { type: "google_doc"; modo?: "criar" | "anexar" | "preencher"; titulo?: string; corpo?: string; docUrl?: string }
  // 📅 AGENDA GOOGLE. "horarios": lê a agenda e deixa {{horarios_livres}} (lista numerada) pronto pra
  // IA oferecer; "criar": marca a reunião no horário que o lead escolheu ({{horario_escolhido}} =
  // número da opção, "16/09 14:30" ou ISO). Passo de passagem nos dois casos.
  // "calls_do_dia": lista as reuniões do dia (hoje ou amanhã) que o nó "criar" marcou — o telefone
  // vem da descrição ("WhatsApp: 55…") — e deixa {{calls_hoje}} (lista pro Loop) + resumo em texto.
  // "convidar": põe o e-mail do lead como convidado na PRÓXIMA ocorrência do evento achado pelo link
  // do Meet (`busca`) — o Google manda o convite e lembra a pessoa no dia. {{agenda_convite}} = ok/ja_estava/erro.
  | { type: "google_calendar"; acao?: "horarios" | "criar" | "calls_do_dia" | "convidar"; busca?: string; email?: string; dias?: number; inicio?: string; fim?: string; duracaoMin?: number;
      diasSemana?: number[]; antecedenciaMin?: number; maxOpcoes?: number; porPeriodo?: boolean;
      titulo?: string; descricao?: string; quando?: string; calendarId?: string; diaOffset?: number; salvarEm?: string; umPorDia?: boolean }
  // Salvar no Google Contatos PESSOAL do dono (People API via OAuth). `campos` opcional muda o que
  // grava; por padrão nome+telefone+e-mail. Passo de passagem — sem conexão OAuth, loga e segue.
  // `notas` = "Observações" do contato no Google (aceita variáveis). Se o contato já existe, o nó
  // ATUALIZA nome/notas quando o passo define um nome próprio (ex.: "{{nome}} | {{status}}").
  | { type: "google_contact"; nome?: string; telefone?: string; email?: string; notas?: string }
  // Lembrete por mensagem: responde o prompt e fica na ESCUTA (pendência __lembrete__, aceita
  // fromMe); a próxima msg (texto/áudio) vira um Lembrete agendado via IA (reminder-capture.ts).
  | { type: "reminder"; text?: string }
  // "perguntar e capturar": manda a pergunta, PAUSA o fluxo, e ao receber a resposta a IA extrai
  // o valor de `variable` e salva no contato. `hint` = dica de extração (opcional).
  | { type: "ask"; text: string; variable: string; hint?: string }
  // CONSULTA DE PAGAMENTO: olha no banco se esta pessoa já pagou e ESCOLHE O CAMINHO — saídas
  // "pago" e "nao_pago". É o nó que fecha a recuperação de PIX: espera 1h e só cobra quem NÃO pagou.
  // `porCodigo` = casar pelo código do produto (exato) em vez do nome (parcial).
  | { type: "payment_check"; produto?: string; porCodigo?: boolean; horas?: number }
  // BLOQUEAR CONTATO: quem pediu pra parar entra na lista de bloqueio (nenhum fluxo fala com ele de
  // novo) e recebe etiqueta pro CRM. Passo de passagem — segue o fluxo (dá pra encadear a Planilha).
  | { type: "bloquear"; tags?: string[] }
  // Agente IA: conversa com o lead (OpenAI) e ESCOLHE um caminho. Cada caminho tem a resposta
  // que é entregue quando escolhido. Quando a conversa acaba (encerrou/estourou turnos), o fluxo
  // segue nos passos seguintes. keepAlive: depois de entregar um caminho, volta a atender.
  | {
      type: "ai_agent";
      systemPrompt: string;
      maxTurns?: number; // default 6, clamp 1..20
      keepAlive?: boolean; // default true
      // Quantos segundos de SILÊNCIO do lead esperar antes de responder, acumulando as mensagens
      // num turno só (0/ausente = padrão de 6 s). Ver engine/acumulo.ts.
      acumularSeg?: number;
      paths: Array<{
        name: string; description: string; reply: string;
        // GUARDAR DADOS: ao escolher este caminho, antes do ramo rodar, o motor tira das falas do
        // lead (histórico da conversa com a agente) os dados desta lista e grava na ficha e nas
        // variáveis do disparo — {{cpf}}, {{endereco}}… pra Chamada HTTP do ramo enviar. Dado que
        // o lead não deu fica vazio. Mesmo formato do "perguntar" (variável + dica).
        guardar?: Array<{ variable: string; hint?: string }>;
        // PODE REPETIR: o caminho continua disponível depois de entregue (o padrão é não repetir).
        // Caso do contrato: o escritório recusa por CPF errado, o lead corrige, a agente manda de novo.
        repetir?: boolean;
        // MÍDIA DO CAMINHO (14/10/2026): URL de vídeo/imagem/documento. Com ela, a resposta do caminho
        // vai como LEGENDA da mídia (ex.: o vídeo do que se aprende no workshop + o link de compra).
        midia?: string;
      }>;
    }
) & { _id?: string };

// Entrega a resposta de um caminho do agente: com mídia, vai como legenda dela; sem, texto puro.
async function entregaCaminho(gw: WhatsAppGateway, phone: string, chosen: { name: string; reply: string; midia?: string }, ev: NormalizedEvent, fields: Record<string, string>, log: (m: string) => void): Promise<void> {
  const resp = render(chosen.reply, ev, fields);
  const midia = String(chosen.midia ?? "").trim();
  if (midia) {
    const ext = midia.split("?")[0].toLowerCase();
    const type: any = /\.(mp4|mov|3gp|webm)$/.test(ext) ? "video" : /\.(png|jpe?g|webp|gif)$/.test(ext) ? "image" : /\.(mp3|ogg|opus|m4a|aac)$/.test(ext) ? "audio" : "document";
    try {
      await gw.sendMedia({ to: phone, type, file: render(midia, ev, fields), caption: type === "audio" ? undefined : resp || undefined });
      if (type === "audio" && resp.trim()) await gw.sendText(phone, resp);
      return;
    } catch (e: any) {
      log(`⚠️ mídia do caminho "${chosen.name}" falhou (${e?.message ?? e}) — mando só o texto`);
    }
  }
  if (resp.trim()) await gw.sendText(phone, resp);
  else log(`👻 FANTASMA: caminho "${chosen.name}" sem resposta escrita — nada enviado`);
}

export interface Automation {
  id: string;
  name?: string; // rótulo do fluxo (do builder); usado no painel (ex.: chips de "passou por")
  trigger: CanonicalEvent;
  keyword?: string; // só quando trigger === "keyword": a palavra que dispara
  keywordMatch?: "exact" | "contains"; // como casar: "exact" (msg = palavra, default) ou "contains" (palavra aparece na msg)
  // Gatilho "template_reply" (resposta de disparo): qual template arma o gatilho (vazio = qualquer)
  // e os rótulos dos botões — cada um vira uma PORTA de saída do nó ("b:<rótulo>").
  templateName?: string;
  botoesGatilho?: string[];
  grupos?: string[];   // gatilhos de GRUPO (group_mention/group_keyword): JIDs onde escutar; vazio = todos
  plataforma?: string; // gatilhos de CHECKOUT: só aceita evento desta integração (vazio = qualquer)
  // FILTRO DE PRODUTO do gatilho de checkout: com a lista preenchida, só evento DESSE(S)
  // produto(s) dispara — recuperação de carrinho do Workshop não pode pegar venda de outro curso.
  // Casa por ID exato OU por nome (contém, sem caixa). Vazio = todos (como sempre foi).
  produtos?: Array<{ id?: string; nome?: string }>;
  // Segredo do webhook DA PLATAFORMA (o "Token" que a Kiwify mostra ao criar o webhook). Com ele
  // preenchido, o motor confere a ASSINATURA do corpo antes de aceitar — sem ele, qualquer um que
  // descubra a URL consegue forjar uma venda. Guardado por fluxo, criptografado no config.
  webhookSegredoEnc?: string;
  // 🪞 Receber pelo webhook de OUTRO fluxo (id do dono): o evento que chega no endereço dele roda
  // aqui também, com o número/eventos/filtro DESTE fluxo. Uma URL na Kiwify, vários fluxos.
  webhookDe?: string;
  // GATILHO SWITCH (trigger "checkout"): um só nó escuta VÁRIOS eventos de venda e cada um sai por
  // uma porta própria no canvas (`ev:<evento>`), como o Switch do n8n. Sem isso era preciso um
  // fluxo inteiro por evento (um pra compra aprovada, outro pra PIX, outro pra carrinho…).
  eventos?: string[];
  platforms?: string[]; // ["kiwify"] ou ["*"]; ausente = todas
  // GATILHO POR HORÁRIO (trigger "schedule"): dispara sozinho, sem evento de fora, pro destino
  // fixo configurado aqui — equivalente ao Schedule Trigger do n8n. Ver engine/schedule-trigger.ts.
  scheduleCron?: string;    // "min hora dia mês dow" (5 campos) — o mesmo formato que o n8n exporta
  scheduleTarget?: string;  // telefone (DDI+DDD+número) ou grupo @g.us que recebe o disparo
  scheduleAccount?: string; // conta que envia (id lite-xxxx, "lite" ou "api"); vazio = conta padrão
  // 📱 Número do fluxo (escolhido no topo do gatilho). Gatilhos de conversa só disparam quando a
  // mensagem chegou nesse número; gatilhos de evento (checkout, webhook, horário) enviam por ele.
  conta?: string;
  steps: Step[]; // os NÓS do fluxo (id = _id)
  edges?: FlowEdge[]; // as CONEXÕES (quando ramificado); ausente = linear
  enabled?: boolean; // false = RASCUNHO (não dispara). ausente/true = ativo.
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Quanto falta esperar. No modo "data" o alvo é um momento no calendário, então o tempo depende
// de QUANDO o fluxo chegou aqui — data que já passou não trava o fluxo, segue na hora.
// Offset do fuso do Brasil (America/Araguaina, o mesmo do gatilho por horário) NAQUELA data —
// calculado pelo Intl, sem chutar "-03:00" fixo, pra continuar certo se a regra mudar.
function fusoDoBrasil(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    if (isNaN(d.getTime())) return "-03:00";
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Araguaina", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(d).reduce<Record<string, string>>((o, x) => (o[x.type] = x.value, o), {});
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    const min = Math.round((comoUtc - d.getTime()) / 60000);
    const sinal = min < 0 ? "-" : "+";
    const a = Math.abs(min);
    return `${sinal}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  } catch { return "-03:00"; }
}

export function msDaEspera(step: Extract<Step, { type: "wait" }>): number {
  if (step.modo !== "data") return Math.max(0, Number(step.ms) || 0);
  // "2026-08-30T14:00" SEM fuso é lido como hora LOCAL DO PROCESSO — e o contêiner roda em UTC.
  // Ou seja: quem digitava 14:00 recebia às 11:00 (3h antes). O horário que a pessoa escreve é o
  // do Brasil, então o fuso entra explicitamente, igual ao gatilho por horário.
  const txt = String(step.quando ?? "").trim().replace(" ", "T");
  const semFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(txt);
  const alvo = new Date(semFuso ? txt + fusoDoBrasil(txt) : txt);
  if (isNaN(alvo.getTime())) return 0; // data inválida: não segura a conversa
  return Math.max(0, alvo.getTime() - Date.now());
}

// Gateway da conta OFICIAL do workspace atual. Usado pelo passo de template quando o fluxo está
// rodando pelo gateway do LITE (ex.: disparado por uma venda da Kiwify) — template é da Meta.
// Devolve null quando não há conta oficial conectada; o passo então avisa no log em vez de estourar.
function gatewayOficialDoWorkspace(): MetaGateway | null {
  const cfg = getCachedFor<any>(getCurrentWorkspace(), "meta-official");
  const enc = cfg?.accessTokenEnc;
  const token = enc ? decryptSecret(String(enc)) ?? "" : String(cfg?.accessToken ?? "");
  if (!cfg?.phoneNumberId || !token) return null;
  // O dono viaja junto: o passo de template pode rodar em job agendado, FORA do contexto —
  // e sem isto o arquivo cairia no workspace primário (o do dono).
  return new MetaGateway({ phoneNumberId: String(cfg.phoneNumberId), accessToken: token, wabaId: String(cfg.wabaId ?? ""), wsId: getCurrentWorkspace() });
}

// Gateway do WhatsApp LITE de uma instância ESPECÍFICA do workspace. Os passos de GRUPO
// (adicionar, marcar todos) e o de avisar são de mundo Lite: num fluxo disparado por template
// (API Oficial) o gateway da vez é a Meta, que não tem grupo nenhum — o passo morreria.
// Com `account` escolhido no editor, o passo roda pelo NÚMERO certo, mesmo dentro de um fluxo
// de API. Sem `account`, devolve null e o passo usa o gateway do fluxo (comportamento antigo).
function gatewayLiteDoWorkspace(account?: string): WhatsAppGateway | null {
  const alvo = String(account ?? "").trim();
  if (!alvo || alvo === "api") return null;
  const insts = (getCachedFor<Array<{ id?: string; token?: string }>>(getCurrentWorkspace(), "lite-instances") ?? []);
  // O id da conta é "lite-" + 8 primeiros do token (idDaInstancia no server) — o registro NÃO tem campo
  // `id`. Procurar só `x.id` nunca achava: o "Avisar pelo número X" caía calado no número do fluxo
  // (os avisos do workshop saíam pela API Oficial em vez do Lite escolhido; visto 13/10).
  const it = insts.find((x) => x.id === alvo || x.token === alvo || (x.token && "lite-" + x.token.slice(0, 8) === alvo));
  return it?.token ? new UazapiGateway(config.uazapi.url, it.token) : null;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Substitui as variáveis do texto pelos dados do evento + campos personalizados capturados.
// `fields` (campos do contato) tem prioridade sobre os dados do evento — assim o que a IA
// capturou (ex.: {{primeiro_nome}} = "José") aparece nos passos seguintes.
function render(tpl: string, ev: NormalizedEvent, fields: Record<string, string> = {}): string {
  // "primeiro nome" que é só dígitos = o telefone vazou pro lugar do nome (retomada agendada sem
  // nome capturado). Melhor ficar sem nome do que mandar "Oi, 5511999999999!".
  const pareceTelefone = (s: string) => /^\d{8,}$/.test(s.replace(/[\s()+-]/g, ""));
  // Só o PRIMEIRO nome, com inicial maiúscula e o resto minúsculo: "MICHEL COELHO" → "Admin",
  // "michel" → "Admin". Pedido do dono (14/09): nunca chamar pelo nome composto nem em caixa alta.
  const cruFirst = String(fields.primeiro_nome || ev.contact.firstName || ev.contact.name || "").trim().split(/\s+/)[0] || "";
  const firstName = pareceTelefone(cruFirst) ? "" : cruFirst.charAt(0).toLocaleUpperCase("pt-BR") + cruFirst.slice(1).toLocaleLowerCase("pt-BR");
  // Hora de BRASÍLIA (o motor roda em UTC na VPS): sem isto a agente cumprimentaria "boa noite"
  // às 3 da tarde. {{saudacao}} = "Bom dia/Boa tarde/Boa noite" · {{periodo}} = "manhã/tarde/noite".
  const horaBR = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  const periodo = horaBR < 12 ? "manhã" : horaBR < 18 ? "tarde" : "noite";
  const saudacao = horaBR < 12 ? "Bom dia" : horaBR < 18 ? "Boa tarde" : "Boa noite";
  // Data/hora do Brasil pra planilha e mensagem: {{data}} = 14/09/2026 · {{hora_min}} = 14:05 ·
  // {{data_hora}} = 14/09/2026 14:05. Nasceu do passo de planilha do quiz (14/09): a planilha do
  // Admin tem colunas Data e Hora e não havia variável pra preencher.
  const agoraBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).reduce<Record<string, string>>((o, x) => (o[x.type] = x.value, o), {});
  const dataBR = `${agoraBR.day}/${agoraBR.month}/${agoraBR.year}`;
  const horaMinBR = `${agoraBR.hour}:${agoraBR.minute}`;
  // {{dia_semana}} = "segunda-feira"… (Brasília). Nasceu da planilha de leads do Exemplo (06/10), que
  // tem a coluna "Dia da Semana".
  const diaSemanaBR = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(new Date());
  let out = tpl
    .replaceAll("{{saudacao}}", saudacao)
    .replaceAll("{{periodo}}", periodo)
    .replaceAll("{{data_hora}}", `${dataBR} ${horaMinBR}`)
    .replaceAll("{{data}}", dataBR)
    .replaceAll("{{hora_min}}", horaMinBR)
    .replaceAll("{{dia_semana}}", diaSemanaBR)
    .replaceAll("{{hora}}", String(horaBR).padStart(2, "0") + "h")
    .replaceAll("{{nome}}", fields.nome || ev.contact.name)
    .replaceAll("{{primeiro_nome}}", firstName)
    .replaceAll("{{telefone}}", fields.telefone || ev.contact.phone || "")
    .replaceAll("{{produto}}", fields.produto || ev.product?.name || "")
    .replaceAll("{{valor}}", fields.valor || (ev.amount != null ? formatBRL(ev.amount) : ""))
    // Líquido do PRODUTOR (Kiwify my_commission) e a origem da venda (UTM do pedido).
    .replaceAll("{{valor_liquido}}", fields.valor_liquido || (ev.fees?.producerNet != null ? formatBRL(ev.fees.producerNet) : ""))
    .replaceAll("{{utm_source}}", fields.utm_source || ev.tracking?.source || "")
    .replaceAll("{{utm_medium}}", fields.utm_medium || ev.tracking?.medium || "")
    .replaceAll("{{utm_campaign}}", fields.utm_campaign || ev.tracking?.campaign || "")
    .replaceAll("{{utm_content}}", fields.utm_content || ev.tracking?.content || "")
    .replaceAll("{{utm_term}}", fields.utm_term || ev.tracking?.term || "")
    .replaceAll("{{link}}", fields.link || ev.links?.checkout || ev.links?.boleto || "")
    .replaceAll("{{pix}}", fields.pix || ev.pixCode || "");
  // Campos personalizados arbitrários (ex.: {{email}}, {{cidade}}).
  for (const [k, v] of Object.entries(fields)) out = out.replaceAll(`{{${k}}}`, v ?? "");
  // Variável que NÃO existe na ficha (ex.: {{utm_term}} num lead que veio sem utm_term) ficava
  // escrita ao pé da letra na mensagem — o dono viu "{{utm_term}}" no aviso da call (14/09).
  // Placeholder sobrando é sempre erro de exibição: some, como em qualquer motor de template.
  out = out.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, "");
  // Uma variável que resolveu pra VAZIO deixa a linha dela em branco — e o lead recebe um buraco
  // no meio da mensagem. Junta 3+ quebras em 2 (o parágrafo continua, o buraco some) e limpa
  // espaço sobrando no fim de cada linha.
  return out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

// O produto do evento passa no filtro do fluxo? ID bate exato; nome basta CONTER (sem caixa) —
// "Workshop" casa "Seu Evento". Filtro vazio aceita tudo.
export function produtoCasa(filtros: Array<{ id?: string; nome?: string }> | undefined, produto?: { id?: string; name?: string }): boolean {
  if (!filtros?.length) return true;
  const idEv = String(produto?.id ?? "").trim();
  const nomeEv = String(produto?.name ?? "").trim().toLowerCase();
  return filtros.some((f) => {
    const fid = String(f?.id ?? "").trim();
    const fnome = String(f?.nome ?? "").trim().toLowerCase();
    if (fid && idEv && fid === idEv) return true;
    if (fnome && nomeEv && nomeEv.includes(fnome)) return true;
    return false;
  });
}

export function matchAutomations(ev: NormalizedEvent, all: Automation[]): Automation[] {
  return all.filter(
    (a) =>
      a.enabled !== false && // rascunho (enabled=false) NÃO dispara
      // Switch de checkout: casa se o evento estiver entre os marcados. Fluxo comum: 1 evento só.
      (a.trigger === "checkout" ? (a.eventos ?? []).includes(ev.event) : a.trigger === ev.event) &&
      // Agendamento não vem de plataforma nenhuma (é o nosso próprio cron): o filtro de origem,
      // que existe pra separar Kiwify de Hotmart, não se aplica — e barraria o disparo à toa.
      (a.trigger === "schedule" || !a.platforms || a.platforms.includes("*") || a.platforms.includes(ev.platform)) &&
      // Gatilho de checkout preso a UMA integração (ex.: só Kiwify): evento vindo de outra
      // plataforma de venda não dispara. Vazio/ausente = aceita de qualquer uma (como era antes).
      (!a.plataforma || a.plataforma === ev.platform) &&
      // Filtro de PRODUTO (só faz sentido em evento de venda; evento sem produto passa se não há filtro)
      (a.trigger !== "checkout" || produtoCasa(a.produtos, ev.product)),
  );
}

// Access token do login Google do workspace (o mesmo do Contatos/Docs/Planilha/Agenda).
// Campos salvos do contato + {{tags}} (etiquetas atuais, separadas por vírgula). A planilha de
// leads e o Avisar usam {{tags}}; antes não havia como pôr as etiquetas numa mensagem (06/10).
async function camposDoContato(phone: string): Promise<Record<string, string>> {
  // ⚠️ getContactFields, NUNCA camposDoContato: a troca global de 06/10 fez a função chamar a si
  // mesma e, por ser async, a promessa nunca resolvia — todo fluxo travava em silêncio por ~2h.
  const f = await getContactFields(phone);
  if (f.tags === undefined) f.tags = (await getContactTags(phone).catch(() => [] as string[])).join(", ");
  // {{data_entrada}} = "06/10" e {{data_entrada_completa}} = "06/10/2026": quando o lead apareceu
  // pela 1ª vez (não "hoje" — a atualização de status dias depois mantém a data certa).
  if (f.data_entrada === undefined) {
    const d = await getContactFirstSeen(phone).catch(() => null);
    if (d) {
      const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
        .formatToParts(d).reduce<Record<string, string>>((o, x) => (o[x.type] = x.value, o), {});
      f.data_entrada = `${p.day}/${p.month}`;
      f.data_entrada_completa = `${p.day}/${p.month}/${p.year}`;
    }
  }
  return f;
}

const pedMedio = (pedidos: number, ticket: number, brl: (v: number) => string) => (pedidos ? brl(ticket) : "—");

// "A | B |  | D" → "A | B | D": segmento vazio some (UTM que não veio não deixa " |  | " no nome).
const limpaSeparadores = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean).join(" | ");

// null = não conectado — quem chama loga e SEGUE o fluxo (conector nunca derruba conversa).
export async function tokenGoogleDoWorkspace(): Promise<string | null> {
  const g = getCachedFor<{ enc?: string }>(getCurrentWorkspace(), "google-contacts-oauth");
  const refresh = g?.enc ? decryptSecret(g.enc) : null;
  if (!refresh || !config.googleOAuth.clientId || !config.googleOAuth.clientSecret) return null;
  try {
    return await refreshGoogleAccessToken({
      clientId: config.googleOAuth.clientId, clientSecret: config.googleOAuth.clientSecret, refreshToken: refresh,
    });
  } catch {
    return null;
  }
}

// Passos que falam com UMA pessoa: sem telefone eles não têm o que fazer. Os de fora da lista
// (webhook_out, code, asaas, loop, split_out, edit_fields, tag, note, gsheet_append, notify e os
// de grupo, que trazem o próprio destino) rodam mesmo num disparo sem destinatário.
const PRECISA_DESTINATARIO = new Set<string>([
  "text", "ptt", "ptv", "media", "buttons", "carousel", "ask", "template",
  "location", "call", "presence", "reminder", "ai_agent", "wait", "window", "bloquear", "payment_check", "utm",
]);

// Achata um item de lista (2 níveis, mesma regra do webhook) pra virar variável: {cliente:{nome}}
// → cliente_nome. É o que o Loop usa pra cada disparo e o que o Filtrar usa pra peneirar a lista.
function achataItem(item: any): Record<string, string> {
  const campos: Record<string, string> = {};
  const achata = (v: any, pre: string, prof: number) => {
    if (v == null) return;
    if (typeof v === "object" && !Array.isArray(v) && prof < 2) {
      for (const [k, vv] of Object.entries(v)) achata(vv, pre ? `${pre}_${k.replace(/[^\w]/g, "_")}` : k.replace(/[^\w]/g, "_"), prof + 1);
      return;
    }
    if (pre) campos[pre.slice(0, 60)] = (typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 500);
  };
  if (item && typeof item === "object") for (const [k, v] of Object.entries(item)) achata(v, k.replace(/[^\w]/g, "_"), 0);
  return campos;
}

// Nome do campo que guarda a ÚLTIMA lista produzida no fluxo (Separar lista / Asaas listar).
// O Filtrar consulta isto pra saber que está no meio de "lista → filtro → loop" e peneirar a
// lista em vez de barrar a conversa. Chave com "_" na frente pra não colidir com variável de gente.
const LISTA_ATUAL = "_lista_atual";

async function runStep(
  step: Step,
  ev: NormalizedEvent,
  gw: WhatsAppGateway,
  fields: Record<string, string>,
  log: (m: string) => void,
): Promise<void> {
  const to = ev.contact.phone!;
  // 📮 FLUXO SEM DESTINATÁRIO (gatilho por horário sem destino fixo, o padrão do n8n). Os passos
  // de MÁQUINA (HTTP, código, Asaas, laço, etiqueta…) rodam normalmente — é justamente pra isso
  // que o fluxo existe: buscar a lista e o Loop falar com cada pessoa. Já os passos que MANDAM
  // mensagem não têm pra quem: `sendText("")` vira erro cru da API, ou pior, mensagem pro vazio.
  // Pula com aviso no log, que é o que a pessoa vai ler pra entender por que "não enviou".
  if (!String(to ?? "").trim() && PRECISA_DESTINATARIO.has(step.type)) {
    log(`📮 passo "${step.type}"${step._id ? ` (${step._id})` : ""} pulado: este disparo não tem destinatário — o agendamento não tem destino fixo e nenhum passo definiu quem recebe (use o Loop pra falar com cada item da lista).`);
    return;
  }
  switch (step.type) {
    case "text": {
      // 🕳️ MENSAGEM FANTASMA: um passo cujo texto é SÓ variável (ex.: {{origem}}, que é vazia de
      // propósito quando o lead não tem UTM) renderiza pra string vazia. O WhatsApp aceita, a
      // conversa PULA PRO TOPO e não aparece nada — foi o que o dono viu (17/08: chat subindo às
      // 10:32 com a última mensagem de quarta). Nunca enviar vazio; o log diz QUAL nó fez isso.
      const texto = render(step.text, ev, fields);
      if (!texto.trim()) { log(`👻 FANTASMA: passo de texto${step._id ? ` "${step._id}"` : ""} ficou VAZIO (variável sem valor) — não enviado`); break; }
      log(`texto → ${to}`);
      await gw.sendText(to, texto);
      break;
    }
    case "code": {
      // PORTÃO: a permissão é conferida AQUI, na hora de rodar — não só na tela. Sem isso bastava
      // importar um JSON com o nó dentro pra usar sem liberação (a lição do vazamento de 24/08).
      const ws = getCurrentWorkspace();
      if (!workspacePodeUsar(ws, "code_node")) {
        log(`🔒 passo de código pulado: o recurso não está liberado para este workspace`);
        break;
      }
      // ⚠️ O QUE O TEXTO ENXERGA, O CÓDIGO TAMBÉM. {{telefone}}, {{nome}} e {{primeiro_nome}} não
      // moram em `fields` — o render() os tira do CONTATO do evento. Sem juntá-los aqui,
      // `$campos.telefone` chegava vazio no sandbox e o código do cliente falhava calado (foi o
      // caso do fluxo de rastreador, que acha o veículo pelo telefone de quem mandou a mensagem).
      const r = await rodaCodigo(step.codigo ?? "", {
        telefone: ev.contact.phone ?? "",
        nome: ev.contact.name ?? "",
        primeiro_nome: ev.contact.firstName ?? "",
        ...fields, // o que o fluxo já produziu manda: um campo capturado sobrescreve o do contato
      });
      for (const l of r.logs) log(`   [código] ${l}`);
      if (!r.ok) { log(`❌ passo de código falhou: ${r.erro} — o fluxo segue sem os campos dele`); break; }
      // O que o código devolveu vira variável do fluxo daqui pra frente.
      Object.assign(fields, r.campos);
      const nomes = Object.keys(r.campos);
      log(`🧩 código rodou${nomes.length ? ` → ${nomes.map((n) => "{{" + n + "}}").join(" ")}` : " (não devolveu campo)"}`);
      break;
    }
    case "location": {
      // Coordenada inválida (variável vazia, campo que não veio no webhook) manda o pino pra
      // ilha nula em 0,0 — pior que não mandar. Melhor avisar no log e pular.
      const lat = Number(String(render(step.lat, ev, fields)).replace(",", ".").trim());
      const lng = Number(String(render(step.lng, ev, fields)).replace(",", ".").trim());
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        log(`📍 localização SEM COORDENADA válida (lat="${step.lat}" lng="${step.lng}") — não enviada`);
        break;
      }
      log(`localização (${lat}, ${lng}) → ${to}`);
      await gw.sendLocation(to, lat, lng, render(step.nome ?? "", ev, fields) || undefined, render(step.endereco ?? "", ev, fields) || undefined);
      break;
    }
    case "ptt":
      if (!render(step.file, ev, fields).trim()) { log(`🎙️ áudio${step._id ? ` (${step._id})` : ""} sem arquivo — passo pulado (suba o áudio no nó)`); break; }
      await gw.sendPresence(to, "recording", 1500);
      log(`áudio(ptt) → ${to}`);
      await gw.sendPtt(to, render(step.file, ev, fields));
      break;
    case "ptv":
      if (!render(step.file, ev, fields).trim()) { log(`📹 vídeo de bolinha${step._id ? ` (${step._id})` : ""} sem arquivo — passo pulado (suba o vídeo no nó)`); break; }
      log(`ptv → ${to}`);
      await gw.sendPtv(to, render(step.file, ev, fields));
      break;
    case "media":
      // render na URL também: permite imagem personalizada por link (ex.: nifty ?name={{nome}}).
      log(`mídia(${step.mediaType}) → ${to}`);
      await gw.sendMedia({ to, type: step.mediaType, file: render(step.file, ev, fields), caption: step.caption ? render(step.caption, ev, fields) : step.caption });
      break;
    case "buttons": {
      // Mesma regra do texto: sem enunciado (ou sem botão) o WhatsApp mostraria um balão oco.
      const txtBtn = render(step.text, ev, fields);
      const rotulos = step.buttons.map((b) => render(b, ev, fields).trim()).filter(Boolean);
      if (!txtBtn.trim() || !rotulos.length) { log(`👻 FANTASMA: passo de botões${step._id ? ` "${step._id}"` : ""} sem texto ou sem botão — não enviado`); break; }
      log(`botões → ${to}`);
      await gw.sendButtons(to, txtBtn, rotulos);
      break;
    }
    case "carousel": {
      // Cards sem imagem OU sem texto quebram o carrossel inteiro na UazAPI → filtra antes.
      const cards = (step.cards ?? [])
        .map((c) => ({
          image: render(c.image, ev, fields).trim(),
          text: render(c.text, ev, fields).trim(),
          buttons: (c.buttons ?? []).map((b) => render(b, ev, fields).trim()).filter(Boolean),
        }))
        .filter((c) => c.image && c.text);
      if (!cards.length) { log(`⚠️  carrossel sem card válido — pulado`); break; }
      log(`carrossel (${cards.length} cards) → ${to}`);
      await gw.sendCarousel(to, render(step.text, ev, fields), cards);
      break;
    }
    case "template": {
      // 🔴 O gateway do fluxo pode ser o do LITE (fluxo disparado por venda da Kiwify usa o gateway
      // padrão do workspace) — e no LITE `sendTemplate` LANÇA ERRO. O passo falhava calado e o funil
      // de recuperação simplesmente não mandava nada. Template é da API Oficial: quando o gateway
      // atual não fala template, o motor troca pelo da conta oficial DESTE workspace.
      const alvo = gw instanceof MetaGateway ? gw : gatewayOficialDoWorkspace();
      // LANÇA (não é `break`): o contador do funil só marca o nó DEPOIS que o passo dá certo, então
      // sair calado aqui pintaria "1 pessoa passou" pra uma mensagem que nunca saiu — justo o
      // número que a gente usa pra saber se o envio funcionou.
      if (!alvo) throw new Error(`template "${step.templateName}": nenhuma conta oficial conectada neste workspace (template só existe na API da Meta)`);
      log(`template "${step.templateName}" → ${to}`);
      const rTpl = await alvo.sendTemplate(to, step.templateName, step.language || "pt_BR", (step.params ?? []).map((p) => render(p, ev, fields)), 0, step.headerUrl);
      // Arma o gatilho "Resposta de template" (mesmo mecanismo do Disparador) — na chave REAL da
      // pessoa (waId): no Brasil a Meta mexe no 9º dígito, e a resposta chega por ela. Marcar o
      // número digitado deixava o gatilho armado num contato que nunca ia responder.
      const foneTpl = rTpl?.waId || to;
      void setContactField(foneTpl, "ultimo_template", step.templateName).catch(() => {});
      void setContactField(foneTpl, "ultimo_template_em", String(Math.floor(Date.now() / 1000))).catch(() => {});
      break;
    }
    case "presence":
      await gw.sendPresence(to, step.presence, step.ms ?? 2000);
      break;
    case "wait":
      await sleep(msDaEspera(step));
      break;
    case "split_out": {
      const origem = String(step.campo ?? "").trim();
      const destino = (String(step.salvarEm ?? "").trim() || (origem.replace(/[^\w]/g, "_") + "_itens")).replace(/[^\w]/g, "_").slice(0, 60);
      // A lista pode estar direto no campo, dentro de um objeto ({data:[…]}) ou num caminho
      // pontuado (resposta.data) — a resposta de API real chega das três formas.
      let achado: unknown[] | null = null;
      const tenta = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);
      const bruto = fields[origem] ?? fields[origem.replace(/\./g, "_")] ?? "";
      if (bruto) {
        try {
          const j = JSON.parse(bruto);
          achado = tenta(j);
          if (!achado && j && typeof j === "object") {
            const partes = origem.split(".").slice(1);
            let alvo: any = j;
            for (const k of partes) alvo = alvo?.[k];
            achado = tenta(alvo) ?? tenta((j as any).data) ?? tenta((j as any).items) ?? tenta((j as any).results);
          }
        } catch { achado = null; }
      }
      if (!achado) {
        log(`📤 separar lista: "${origem}" não tem uma lista dentro — {{${destino}}} ficou vazio`);
        fields[destino] = "[]";
        fields[destino + "_total"] = "0";
        break;
      }
      fields[destino] = JSON.stringify(achado).slice(0, 100_000);
      fields[destino + "_total"] = String(achado.length);
      fields[LISTA_ATUAL] = destino; // um Filtrar logo depois peneira ESTA lista
      log(`📤 separar lista: ${achado.length} item(ns) em {{${destino}}}`);
      break;
    }
    case "edit_fields": {
      // 📝 Vários campos de uma vez. Por padrão grava na ficha do contato (igual ao set_variable);
      // desmarcando, o valor vale só neste disparo — que é o comportamento do Set do n8n.
      const feitos: string[] = [];
      for (const c of step.campos ?? []) {
        const campo = String(c?.campo ?? "").trim().replace(/[^\w]/g, "_").slice(0, 40);
        if (!campo) continue;
        const valor = render(String(c?.valor ?? ""), ev, fields).slice(0, 500);
        fields[campo] = valor;
        if (step.salvarNaFicha !== false) void setContactField(to, campo, valor).catch(() => {});
        feitos.push(campo);
      }
      log(feitos.length ? `📝 definiu ${feitos.map((f) => "{{" + f + "}}").join(" ")} · ${to}` : "📝 editar campos: nenhum campo preenchido");
      break;
    }
    case "call":
      // Faz o WhatsApp da pessoa TOCAR. Sem áudio — a ligação fica muda pela duração escolhida
      // (a UazAPI não injeta stream; testado 22/08). É gatilho forte de banimento: usar com
      // parcimônia. Só no LITE; se o gateway não tiver makeCall (API Oficial), o nó é ignorado.
      if (gw.makeCall) await gw.makeCall(to, step.callDuration);
      break;
    case "note":
      // anotação no canvas — não faz nada em runtime (só lembrete visual pro dono).
      break;
    case "tag": {
      // Etiqueta: adiciona tag(s) ao contato (alimenta o CRM) e SEGUE o fluxo. Não envia nada.
      const tags = (step.tags ?? []).map((t) => render(t, ev, fields).trim()).filter(Boolean);
      if (tags.length) log(`etiqueta → ${to}: ${tags.join(", ")}`);
      for (const t of tags) {
        try { await addContactTag(to, t, "fluxo"); } catch (e: any) { log(`❌ etiqueta "${t}" falhou: ${e.message}`); }
      }
      // {{tags}} reflete a etiqueta recém-posta (a planilha logo depois já escreve a lista nova).
      if (tags.length) fields.tags = (await getContactTags(to).catch(() => [] as string[])).join(", ");
      break;
    }
    case "notify": {
      // Avisar alguém: manda o aviso pra cada destino (grupo @g.us ou número) e SEGUE o fluxo.
      const targets = step.targets.filter((t) => t && t.trim());
      // {{resumo_compra}}: tudo que a pessoa comprou nos últimos 30 min (ingresso + bumps), com o
      // líquido de cada um, o total e a UTM. Sem pedido gravado, cai no produto/valor deste evento.
      if (step.text.includes("{{resumo_compra}}")) {
        const r = await resumoCompraRecente(getCurrentWorkspace(), ev.contact.phone, (ev.contact as any).email).catch(() => "");
        fields.resumo_compra = r || [`• ${ev.product?.name ?? "Produto"} · ${ev.fees?.producerNet != null ? formatBRL(ev.fees.producerNet) + " líquido" : formatBRL(ev.amount ?? 0)}`,
          ev.tracking?.source ? `Origem: ${ev.tracking.source}${ev.tracking.campaign ? " · " + ev.tracking.campaign : ""}` : "Origem: sem UTM"].join("\n");
      }
      const aviso = render(step.text, ev, fields);
      // Aviso vazio é o pior caso da mensagem fantasma: quem recebe é o DONO, e a conversa dele
      // fica pulando pro topo sem nada escrito.
      if (!aviso.trim()) { log(`👻 FANTASMA: passo de avisar${step._id ? ` "${step._id}"` : ""} ficou VAZIO — não enviado`); break; }
      const gwN = gatewayLiteDoWorkspace(step.account) ?? gw;
      log(`avisar ${targets.length} destino(s)${step.account ? ` (pelo número ${step.account})` : ""}`);
      for (const dest of targets) {
        try {
          await gwN.sendText(dest.trim(), aviso);
        } catch (e: any) {
          log(`❌ avisar ${dest} falhou: ${e.message}`);
        }
        await sleep(400);
      }
      break;
    }
    case "bloquear": {
      // Lista de bloqueio = o MESMO opt-out do "PARAR": o motor já respeita em todo lugar (fluxo,
      // follow-up agendado, atendente IA e disparo). Não é uma lista nova pra manter sincronizada.
      const tags = (step.tags?.length ? step.tags : ["Contato bloqueado"]).map((t) => render(t, ev, fields).trim()).filter(Boolean);
      await setOptedOut(to, true);
      for (const t of tags) {
        try { await addContactTag(to, t, "bloqueio"); } catch (e: any) { log(`❌ etiqueta "${t}" falhou: ${e.message}`); }
      }
      log(`🚫 contato bloqueado: ${to}${tags.length ? " · " + tags.join(", ") : ""}`);
      break;
    }
    case "add_to_group": {
      // Grupo é coisa do WhatsApp Lite. Se o passo indica um número, usa ELE; senão, o do fluxo.
      const gwG = gatewayLiteDoWorkspace(step.account) ?? gw;
      log(`add ${to} → grupo ${step.groupJid}${step.account ? ` (pelo número ${step.account})` : ""}`);
      try {
        await gwG.updateParticipants(step.groupJid, "add", [to]);
        break;
      } catch (e: any) {
        // 🔗 A MAIORIA DAS PESSOAS NÃO PODE SER ADICIONADA. Na privacidade do WhatsApp, "quem pode
        // me adicionar em grupos" vem como "Meus contatos" pra muita gente — aí o add falha e,
        // antes, o comprador simplesmente nunca entrava no grupo e nunca ficava sabendo por quê.
        // O jeito certo de convidar é o LINK: manda por mensagem e a pessoa entra sozinha.
        if (step.convite === false) throw e;   // quem quiser o comportamento antigo desliga no nó
        log(`👥 não deu pra adicionar direto (${String(e?.message ?? e).slice(0, 80)}) — mandando o convite`);
        const info = await gwG.groupInfo(step.groupJid, { inviteLink: true });
        if (!info?.inviteLink) { log("👥 o grupo não devolveu link de convite — preciso ser ADMIN dele"); break; }
        const convite = render(step.textoConvite || "Te mandei o convite do nosso grupo 👇\n{{link_grupo}}", ev,
                               { ...fields, link_grupo: info.inviteLink, grupo: info.name ?? "" });
        await gw.sendText(to, convite.includes(info.inviteLink) ? convite : convite + "\n" + info.inviteLink);
        log(`👥 convite do grupo "${info.name ?? step.groupJid}" enviado pra ${to}`);
      }
      break;
    }
    case "gsheet_append": {
      // 📊 Planilha Google: escreve UMA linha (colunas com variáveis) na planilha do link.
      // Passo de passagem: erro NUNCA derruba o fluxo — o lead não pode ficar sem resposta
      // porque o Sheets recusou (loga e segue).
      try {
        const sheetId = sheetIdFromUrl(step.sheetUrl);
        if (!sheetId) { log("❌ planilha: link inválido no passo"); break; }
        const row = (step.colunas ?? []).map((c) => render(c, ev, fields));
        // 1º caminho: o LOGIN Google (o cliente só clicou e autorizou). 2º: a conta de serviço, que
        // é como funcionava antes — quem já configurou daquele jeito continua funcionando igual.
        const chaveCol = typeof step.chave === "number" && step.chave >= 0 ? Math.floor(step.chave) : null;
        const access = await tokenGoogleDoWorkspace();
        if (access) {
          try {
            if (chaveCol != null) {
              const r = await upsertSheetRowOAuth(access, sheetId, row, chaveCol);
              log(`📊 planilha: linha ${r} pelo login Google (chave: coluna ${String.fromCharCode(65 + (chaveCol % 26))} = "${String(row[chaveCol] ?? "").slice(0, 30)}")`);
            } else {
              await appendSheetRowOAuth(access, sheetId, row);
              log(`📊 planilha: linha escrita pelo login Google (${row.length} coluna(s))`);
            }
            break;
          } catch (e: any) {
            if (!faltaEscopo(e)) throw e;
            log("📊 planilha: o login Google ainda não tem permissão de Planilha — tentando pela conta de serviço");
          }
        }
        const g = getCachedFor<{ enc?: string; client_email?: string }>(getCurrentWorkspace(), "google-sa");
        const raw = g?.enc ? decryptSecret(g.enc) : null;
        const sa = raw ? parseServiceAccount(raw) : null;
        if (!sa) {
          log(access
            ? "❌ planilha: reconecte o Google em Integrações (o acesso a Planilha é novo) ou conecte uma conta de serviço"
            : "❌ planilha: Google não conectado neste workspace (Integrações)");
          break;
        }
        if (chaveCol != null) {
          const r = await upsertSheetRow(sa, sheetId, row, chaveCol);
          log(`📊 planilha: linha ${r} pela conta de serviço (chave: coluna ${String.fromCharCode(65 + (chaveCol % 26))})`);
        } else {
          await appendSheetRow(sa, sheetId, row);
          log(`📊 planilha: linha escrita pela conta de serviço (${row.length} coluna(s))`);
        }
      } catch (e: any) {
        log("❌ planilha falhou: " + explicaErroGoogle(e));
      }
      break;
    }
    case "set_variable": {
      // 📝 Grava um valor na ficha (aceita {{variaveis}} no valor). Passo de passagem.
      const campo = String(step.campo ?? "").trim().replace(/[^\w]/g, "_").slice(0, 40);
      if (!campo) { log("📝 definir variável: sem nome de campo — nada gravado"); break; }
      const valor = render(String(step.valor ?? ""), ev, fields).slice(0, 500);
      fields[campo] = valor; // vale JÁ nos próximos passos deste disparo
      void setContactField(to, campo, valor).catch(() => {});
      log(`📝 ${campo} = "${valor.slice(0, 40)}" · ${to}`);
      break;
    }
    case "utm": {
      // 🎯 COLETAR UTMs: guarda na ficha do contato de onde o lead veio (o que vier no evento que
      // disparou o fluxo). Passo de passagem: lead sem UTM → não faz nada e segue. Alimenta o selo
      // ADS e a lista de origem na conversa, e o "VEIO DE (UTM)" do funil.
      const tk = ev.tracking;
      const mapa: Record<string, string> = {};
      if (tk?.source) mapa.utm_source = tk.source;
      if (tk?.medium) mapa.utm_medium = tk.medium;
      if (tk?.campaign) mapa.utm_campaign = tk.campaign;
      if (tk?.content) mapa.utm_content = tk.content;
      if (tk?.term) mapa.utm_term = tk.term;
      if (tk?.sck) mapa.ad_id = tk.sck;
      const chaves = Object.keys(mapa);
      if (!chaves.length) { log(`🎯 UTM: lead sem UTMs — nada a coletar · ${to}`); break; }
      for (const [k, v] of Object.entries(mapa)) { fields[k] = v; void setContactField(to, k, v).catch(() => {}); }
      log(`🎯 UTM: coletei ${chaves.join(", ")} · ${to}`);
      break;
    }
    case "google_calendar": {
      // 📅 AGENDA GOOGLE. Passo de passagem: sem conexão ou com erro, loga e segue. As variáveis
      // ficam vazias e o passo seguinte (condição em {{agenda_link}} / {{horarios_livres}}) decide.
      try {
        const access = await tokenGoogleDoWorkspace();
        if (!access) { log("❌ Agenda Google: conta Google não conectada (Integrações → Conectar o Google)"); break; }
        const cal = String(step.calendarId ?? "").trim() || "primary";
        const agora = new Date();
        if (step.acao === "convidar") {
          const email = render(String(step.email ?? "{{email}}"), ev, fields).trim();
          const busca = render(String(step.busca ?? ""), ev, fields).trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fields.agenda_convite = "sem_email"; log(`📅 Agenda (convidar): lead sem e-mail válido ("${email.slice(0, 40)}") — pulado`); break; }
          if (!busca) { fields.agenda_convite = "erro"; log("❌ Agenda (convidar): informe o link do Meet (ou um trecho do título) do evento"); break; }
          const r = await convidarParaEventoOAuth(access, cal, busca, email, Math.min(60, Math.max(1, Number(step.dias) || 14)));
          fields.agenda_convite = r.status === "convidado" ? "ok" : "ja_estava";
          log(`📅 Agenda: ${email.replace(/(.{2}).*@/, "$1***@")} ${r.status === "convidado" ? "convidado(a)" : "já estava convidado(a)"} em "${r.titulo.slice(0, 50)}" (${r.inicio})`);
          break;
        }
        if ((step.acao ?? "horarios") === "horarios") {
          const dias = Math.min(30, Math.max(1, Number(step.dias) || 5));
          const ate = new Date(agora.getTime() + (dias + 1) * 86400000);
          const eventos = await listCalendarEventsOAuth(access, cal, agora.toISOString(), ate.toISOString());
          const ocupados: Ocupado[] = [];
          for (const e of eventos) {
            if (e.livre) continue;
            // dia inteiro vem como "2026-09-15" → ocupa o dia inteiro no fuso do Brasil
            const ini = e.diaInteiro ? dataNoFuso(e.inicio, "00:00") : new Date(e.inicio);
            const fim = e.diaInteiro ? dataNoFuso(e.fim, "00:00") : new Date(e.fim);
            if (ini && fim && !isNaN(ini.getTime()) && !isNaN(fim.getTime())) ocupados.push({ inicio: ini, fim });
          }
          const regras = {
            agora, dias, inicio: String(step.inicio ?? "09:00"), fim: String(step.fim ?? "18:00"),
            duracaoMin: Number(step.duracaoMin) || 30, diasSemana: Array.isArray(step.diasSemana) ? step.diasSemana.map(Number) : [1, 2, 3, 4, 5],
            antecedenciaMin: Number(step.antecedenciaMin) || 60, maxOpcoes: Number(step.maxOpcoes) || 5,
            umPorDia: !!step.umPorDia,
          };
          // porPeriodo: dois horários "sim ou sim" pela hora de entrada (manhã→2 à tarde etc.),
          // com rótulo relativo ("hoje às 14:30"). Senão, a varredura simples de sempre.
          const opcoes = step.porPeriodo ? sugereDoisHorarios(ocupados, regras) : horariosLivres(ocupados, regras);
          fields.horarios_livres = listaNumerada(opcoes);
          fields.horarios_qtd = String(opcoes.length);
          // horario_N também vai pra FICHA: o Agente IA relê a ficha a cada turno (não a memória
          // deste disparo) — sem isto {{horario_1}} sumia do prompt a partir da 2ª resposta do lead.
          opcoes.forEach((o, i) => { fields[`horario_${i + 1}`] = o.rotulo; void setContactField(to, `horario_${i + 1}`, o.rotulo).catch(() => {}); });
          for (let i = opcoes.length; i < 6; i++) { if (fields[`horario_${i + 1}`]) { fields[`horario_${i + 1}`] = ""; void setContactField(to, `horario_${i + 1}`, "").catch(() => {}); } }
          // As opções ficam na FICHA: o "criar" roda depois de uma pergunta (outro turno), e a
          // ficha é o que sobrevive entre turnos.
          void setContactField(to, "agenda_opcoes", JSON.stringify(opcoes)).catch(() => {});
          void setContactField(to, "horarios_livres", fields.horarios_livres).catch(() => {});
          log(opcoes.length
            ? `📅 Agenda: ${opcoes.length} horário(s) livre(s) nos próximos ${dias} dia(s) (${eventos.length} evento(s) lidos)`
            : `📅 Agenda: nenhum horário livre nos próximos ${dias} dia(s) — {{horarios_livres}} ficou vazio`);
        } else if (step.acao === "calls_do_dia") {
          // Dia alvo no fuso do Brasil: hoje (0) ou amanhã (1) — pra lembrar na véspera.
          const off = Math.max(0, Math.min(7, Number(step.diaOffset) || 0));
          const hojeSP = partesNoFuso(agora);
          const base = new Date(Date.UTC(hojeSP.ano, hojeSP.mes - 1, hojeSP.dia, 12) + off * 86400000);
          const pd = partesNoFuso(base);
          const ymd = `${pd.ano}-${String(pd.mes).padStart(2, "0")}-${String(pd.dia).padStart(2, "0")}`;
          const ini = dataNoFuso(ymd, "00:00")!, fim = new Date(ini.getTime() + 86400000);
          const eventos = await listCalendarEventsOAuth(access, cal, ini.toISOString(), fim.toISOString());
          const itens: Array<Record<string, string>> = [];
          for (const e of eventos) {
            if (e.diaInteiro) continue;
            const tel = (e.descricao.match(/WhatsApp:\s*\+?([\d\s()-]{10,})/i)?.[1] ?? "").replace(/\D/g, "");
            if (tel.length < 10) continue; // evento que não foi marcado pelo fluxo (sem telefone) — não é call de lead
            const d = new Date(e.inicio);
            const nome = (e.titulo.match(/^Call\s*[—-]\s*(.+?)(?:\s*\(.*)?$/)?.[1] ?? e.titulo).trim();
            const pt = partesNoFuso(d);
            itens.push({
              telefone: tel, nome, primeiro_nome: nome.split(/\s+/)[0] || "",
              call_hora: `${String(pt.hora).padStart(2, "0")}:${String(pt.minuto).padStart(2, "0")}`,
              call_quando: rotuloDe(d), call_titulo: e.titulo, call_link: e.link, call_iso: e.inicio,
            });
          }
          const campo = String(step.salvarEm ?? "").trim().replace(/[^\w]/g, "_") || "calls_hoje";
          fields[campo] = JSON.stringify(itens);
          fields.calls_qtd = String(itens.length);
          fields.calls_dia = `${String(pd.dia).padStart(2, "0")}/${String(pd.mes).padStart(2, "0")}`;
          fields.calls_hoje_texto = itens.length
            ? itens.map((c) => `• ${c.call_hora} — ${c.nome} · ${c.telefone}`).join("\n")
            : "Nenhuma call marcada.";
          log(`📅 Agenda: ${itens.length} call(s) em ${fields.calls_dia} (${eventos.length} evento(s) no dia) → {{${campo}}}`);
        } else {
          let opcoes: Opcao[] = [];
          try { opcoes = JSON.parse(fields.agenda_opcoes || "[]"); } catch { opcoes = []; }
          const texto = render(String(step.quando ?? "{{horario_escolhido}}"), ev, fields);
          const inicio = lerHorarioEscolhido(texto, opcoes, agora);
          if (!inicio) {
            fields.agenda_erro = "nao_entendi";
            // Limpa o link de uma rodada anterior: é o que deixa "Condição: agenda_link existe" confiável.
            fields.agenda_link = ""; fields.agenda_quando = "";
            void setContactField(to, "agenda_link", "").catch(() => {});
            log(`❌ Agenda: não entendi o horário "${texto.slice(0, 40)}" (opções na ficha: ${opcoes.length}) — {{agenda_link}} ficou vazio`);
            break;
          }
          const dur = Math.min(480, Math.max(5, Number(step.duracaoMin) || 30));
          const fim = new Date(inicio.getTime() + dur * 60000);
          const titulo = render(String(step.titulo ?? ""), ev, fields).trim() || `Reunião com ${ev.contact.name || to}`;
          const descricao = render(String(step.descricao ?? ""), ev, fields).trim() || `Lead: ${ev.contact.name || ""} · WhatsApp: ${to}`;
          const r = await createCalendarEventOAuth(access, cal, { titulo, descricao, inicioISO: inicio.toISOString(), fimISO: fim.toISOString() });
          fields.agenda_link = r.link;
          fields.agenda_quando = rotuloRelativo(inicio, agora);
          fields.agenda_erro = "";
          void setContactField(to, "agenda_link", r.link).catch(() => {});
          void setContactField(to, "agenda_quando", fields.agenda_quando).catch(() => {});
          log(`📅 Agenda: "${titulo.slice(0, 40)}" marcada para ${fields.agenda_quando} → ${r.link}`);
        }
      } catch (e: any) {
        fields.agenda_erro = "falha";
        if (step.acao === "criar") { fields.agenda_link = ""; fields.agenda_quando = ""; void setContactField(to, "agenda_link", "").catch(() => {}); }
        log("❌ Agenda Google falhou: " + (faltaEscopo(e)
          ? "falta permissão — reconecte o Google em Integrações"
          : String(e?.message ?? e).slice(0, 200)));
      }
      break;
    }
    case "google_doc": {
      // 📄 GOOGLE DOCS. Passo de passagem: sem conexão ou com erro, loga e segue — o lead não pode
      // ficar sem resposta porque o Google recusou.
      try {
        const access = await tokenGoogleDoWorkspace();
        if (!access) { log("❌ Google Docs: conta Google não conectada (Integrações → Google Contatos)"); break; }
        if (step.modo === "preencher") {
          // Troca <<campo>>/{{campo}} DENTRO do documento do link pelos dados do lead.
          const id = docIdFromUrl(render(String(step.docUrl ?? ""), ev, fields));
          if (!id) { log("❌ Google Docs: link do documento inválido no passo"); break; }
          // Tudo que o lead tem vira candidato a marcador: ficha + canônicos do evento.
          const valores: Record<string, string> = {
            ...fields,
            nome: ev.contact.name || fields.nome || "",
            primeiro_nome: ev.contact.firstName || fields.primeiro_nome || "",
            telefone: to,
          };
          const trocas = await replaceInGoogleDoc(access, id, valores);
          fields.doc_link = "https://docs.google.com/document/d/" + id + "/edit";
          log(`📄 Google Docs: ${trocas} marcador(es) preenchido(s) no documento ${id.slice(0, 12)}…`);
        } else if (step.modo === "anexar") {
          const id = docIdFromUrl(render(String(step.docUrl ?? ""), ev, fields));
          if (!id) { log("❌ Google Docs: link do documento inválido no passo"); break; }
          const texto = render(String(step.corpo ?? ""), ev, fields);
          if (!texto.trim()) { log("👻 FANTASMA: Google Docs (anexar) sem texto — nada escrito"); break; }
          await appendGoogleDoc(access, id, texto);
          fields.doc_link = "https://docs.google.com/document/d/" + id + "/edit";
          log(`📄 Google Docs: parágrafo anexado ao documento ${id.slice(0, 12)}…`);
        } else {
          const titulo = render(String(step.titulo ?? ""), ev, fields).trim() || `Documento — ${ev.contact.name || to}`;
          const corpo = render(String(step.corpo ?? ""), ev, fields);
          const r = await createGoogleDoc(access, { titulo, corpo });
          // {{doc_link}} fica pronto pros próximos passos (mandar o link pro lead no WhatsApp).
          fields.doc_link = r.link;
          void setContactField(to, "doc_link", r.link).catch(() => {});
          log(`📄 Google Docs: criado "${titulo.slice(0, 40)}" → ${r.link}`);
        }
      } catch (e: any) {
        log("❌ Google Docs falhou: " + (faltaEscopo(e)
          ? "falta permissão — reconecte o Google em Integrações (o acesso a Docs é novo)"
          : String(e?.message ?? e).slice(0, 160)));
      }
      break;
    }
    case "google_contact": {
      // 👤 GOOGLE CONTATOS: grava o lead no Google Contatos PESSOAL do dono (People API via OAuth).
      // Passo de passagem: SEM conexão OAuth (ou erro) NUNCA derruba o fluxo — loga e segue. O lead
      // não pode ficar sem resposta porque o Google recusou.
      try {
        const g = getCachedFor<{ enc?: string; email?: string }>(getCurrentWorkspace(), "google-contacts-oauth");
        const refresh = g?.enc ? decryptSecret(g.enc) : null;
        if (!refresh) { log("❌ Google Contatos não conectado neste workspace (Integrações → Google Contatos)"); break; }
        if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) { log("❌ Google Contatos: app OAuth não configurado no servidor"); break; }
        const nomeProprio = !!String(step.nome ?? "").trim() && String(step.nome).trim() !== "{{nome}}";
        const nome = limpaSeparadores(render(step.nome ?? "{{nome}}", ev, fields)) || ev.contact.name || to;
        const telefone = render(step.telefone ?? "{{telefone}}", ev, fields).trim() || to;
        const email = render(step.email ?? "{{email}}", ev, fields).trim();
        const notas = limpaSeparadores(render(step.notas ?? "", ev, fields)).slice(0, 2000);
        const access = await refreshGoogleAccessToken({
          clientId: config.googleOAuth.clientId, clientSecret: config.googleOAuth.clientSecret, refreshToken: refresh,
        });
        // NÃO DUPLICA (06/10): procura pelo telefone; se já existe, só completa nome (quando o novo
        // tem mais palavras — "Kariny" → "Kariny Oliveira Paizante") e e-mail (quando não tinha).
        const existente = await findGoogleContactByPhone(access, telefone).catch(() => null);
        if (existente) {
          // Nome próprio no passo ("{{nome}} | {{status}}…") → atualiza sempre que mudar (é assim que o
          // status do lead muda no Contatos). Nome padrão → só troca se o novo for mais completo.
          const nomeNovo = nome && nome !== existente.nome.trim()
            && (nomeProprio || nome.split(/\s+/).length > existente.nome.trim().split(/\s+/).filter(Boolean).length) ? nome : "";
          const emailNovo = email && !existente.emails.some((e) => e.toLowerCase() === email.toLowerCase()) ? email : "";
          const notasNovas = notas && notas !== existente.notas.trim() ? notas : "";
          if (nomeNovo || emailNovo || notasNovas) {
            await updateGoogleContact(access, existente, { name: nomeNovo || undefined, email: emailNovo || undefined, notes: notasNovas || undefined });
            log(`👤 Google Contatos: "${existente.nome || telefone}" já existia — atualizei ${[nomeNovo && `nome → "${nomeNovo}"`, emailNovo && "e-mail", notasNovas && "observações"].filter(Boolean).join(", ")}`);
          } else {
            log(`👤 Google Contatos: "${existente.nome || telefone}" já existe (${telefone}) — nada a mudar`);
          }
          break;
        }
        await createGoogleContact(access, { name: nome, phone: telefone, email: email || undefined, notes: notas || undefined });
        log(`👤 Google Contatos: salvo "${nome}" (${telefone})${notas ? " com observações" : ""}`);
      } catch (e: any) {
        log("❌ Google Contatos falhou: " + String(e?.message ?? e).slice(0, 160));
      }
      break;
    }
    case "webhook_out": {
      // 🔗 Chama um sistema de fora. Passo de PASSAGEM: falha nunca derruba o fluxo (o lead não
      // pode ficar sem resposta porque a API do outro lado caiu) — loga e segue.
      try {
        const urlBase = render(String(step.url ?? ""), ev, fields).trim();
        let alvo: URL;
        try { alvo = new URL(urlBase); } catch { log("❌ HTTP: endereço inválido no passo"); break; }
        // 🛡️ SSRF: a URL é escrita pelo cliente. Sem esta guarda o passo vira um procurador pra
        // rede interna (localhost, 10.x, 169.254.169.254 de metadados de nuvem). Confere a forma
        // E o que o DNS resolve — "meusite.com" apontando pra 10.0.0.5 passaria só na string.
        if (!destinoPublicoOk(alvo) || !(await destinoResolveParaPublico(alvo))) {
          log(`🛡️ HTTP recusado: "${alvo.hostname}" é endereço de rede interna — o passo não sai daqui`);
          break;
        }

        const metodo = step.metodo ?? "POST";
        const dados: Record<string, string> = {};
        for (const c of step.campos ?? []) {
          const chave = String(c?.chave ?? "").trim();
          if (chave) dados[chave] = render(String(c?.valor ?? ""), ev, fields);
        }

        const headers: Record<string, string> = {};
        const segredo = step.authValorEnc ? (decryptSecret(step.authValorEnc) ?? "") : "";
        if (segredo) {
          if (step.authTipo === "header") headers[step.authNome || "authorization"] = segredo;
          else if (step.authTipo === "bearer") headers.authorization = "Bearer " + segredo;
          else if (step.authTipo === "basic") headers.authorization = "Basic " + Buffer.from(segredo).toString("base64");
          else if (step.authTipo === "query") alvo.searchParams.set(step.authNome || "token", segredo);
        }

        // GET não tem corpo: os campos viram parâmetros na URL (é o que a API do Asaas espera).
        let corpo: string | undefined;
        if (metodo === "GET") {
          for (const [k, v] of Object.entries(dados)) alvo.searchParams.set(k, v);
        } else {
          headers["content-type"] = "application/json";
          corpo = JSON.stringify(dados);
        }

        // fetchSeguro: revalida CADA redirecionamento pelo mesmo portão do primeiro destino.
        // Com o fetch normal, um 302 do destino levava o motor pra dentro da rede do Swarm e a
        // resposta voltava como variável do fluxo — SSRF com exfiltração (auditoria 07/09).
        const r = await fetchSeguro(alvo, { method: metodo, headers, body: corpo, signal: AbortSignal.timeout(10_000) });
        const texto = (await r.text().catch(() => "")).slice(0, 20_000);
        if (!r.ok) {
          log(`❌ HTTP ${metodo} recusado pelo destino: ${r.status} ${texto.slice(0, 150)}`);
          break;
        }

        // A RESPOSTA vira variável do fluxo. Sem isto o passo só "avisava" o outro sistema e não
        // conseguia USAR o que ele devolveu — que é metade do trabalho de uma integração.
        const prefixo = String(step.salvarEm ?? "").trim().replace(/[^\w]/g, "_");
        if (prefixo) {
          let json: any;
          try { json = JSON.parse(texto); } catch { json = null; }
          if (json && typeof json === "object") {
            const achata = (v: any, pre: string, prof: number) => {
              if (v == null) return;
              if (typeof v === "object" && !Array.isArray(v) && prof < 2) {
                for (const [k, vv] of Object.entries(v)) achata(vv, `${pre}_${k.replace(/[^\w]/g, "_")}`, prof + 1);
                return;
              }
              // LISTA guarda inteira (até 100KB): é o que o Separar lista + Loop consomem — capar
              // em 500 truncava o JSON de "100 cobranças do Asaas" e o Loop recebia lista vazia.
              const cap = Array.isArray(v) ? 100_000 : 500;
              fields[pre.slice(0, 60)] = (typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, cap);
            };
            for (const [k, v] of Object.entries(json)) achata(v, `${prefixo}_${k.replace(/[^\w]/g, "_")}`, 1);
          } else {
            fields[prefixo] = texto.slice(0, 500); // resposta que não é JSON vira texto puro
          }
          log(`🔗 HTTP ${metodo} → ${r.status} · resposta guardada em {{${prefixo}_…}}`);
        } else {
          log(`🔗 HTTP ${metodo} → ${r.status} (${Object.keys(dados).length} campo(s) enviado(s))`);
        }
      } catch (e: any) {
        log("❌ HTTP falhou: " + (e?.name === "TimeoutError" ? "o destino demorou demais (10s)" : e?.message ?? e));
      }
      break;
    }
    case "asaas": {
      // 💳 Passo de PASSAGEM (menos o enviar_comprovante, que envia): erro do Asaas nunca derruba
      // a conversa — loga e segue, mesma regra dos outros conectores.
      try {
        const cfg = configAsaasDoWorkspace();
        if (!cfg) { log("❌ Asaas: chave de API não configurada — Integrações → Asaas"); break; }

        // Acha a COBRANÇA da conversa: por id direto, por cliente, ou achando o cliente por
        // CPF/e-mail primeiro (a API do Asaas não busca cliente por telefone).
        const resolveCobranca = async (): Promise<any | null> => {
          const por = step.buscarPor ?? "cobranca";
          const bruto = render(String(step.valorBusca ?? ""), ev, fields).trim();
          if (por === "cobranca") {
            const id = bruto || fields.asaas_cobranca_id || "";
            if (!id) { log("❌ Asaas: sem o id da cobrança — preencha o campo ou rode antes um passo que o descubra"); return null; }
            return pegarCobranca(cfg, id);
          }
          let clienteId = "";
          if (por === "cliente") clienteId = bruto || fields.asaas_cliente_id || "";
          else {
            const chaveBusca = por === "cpf" ? { cpfCnpj: bruto || fields.cpf || fields.cpf_cnpj || "" } : { email: bruto || fields.email || "" };
            const valor = Object.values(chaveBusca)[0];
            if (!valor) { log(`❌ Asaas: sem ${por === "cpf" ? "CPF/CNPJ" : "e-mail"} pra achar o cliente — colete antes (nó Perguntar) ou preencha o campo`); return null; }
            const cli = await buscarClienteAsaas(cfg, chaveBusca);
            if (!cli) { log(`🔎 Asaas: nenhum cliente com esse ${por === "cpf" ? "CPF/CNPJ" : "e-mail"}`); return null; }
            clienteId = String(cli.id);
            fields.asaas_cliente_id = clienteId;
          }
          if (!clienteId) { log("❌ Asaas: sem o id do cliente — preencha o campo ou busque por CPF/e-mail"); return null; }
          const c = await cobrancaMaisRecente(cfg, clienteId, String(step.filtroStatus ?? "").trim() || undefined);
          if (!c) log("🔎 Asaas: esse cliente não tem cobrança" + (step.filtroStatus ? ` com status ${step.filtroStatus}` : ""));
          return c;
        };
        const aplicaCobranca = (c: any) => {
          const novos = camposDaCobranca(c);
          Object.assign(fields, novos);
          void setContactField(to, "asaas_cobranca_id", novos.asaas_cobranca_id ?? "").catch(() => {});
          return novos;
        };

        if (step.acao === "checar_pagamento" || step.acao === "enviar_comprovante") {
          const c = await resolveCobranca();
          if (!c) { fields.asaas_pago = fields.asaas_pago ?? "não"; break; }
          aplicaCobranca(c);
          log(`💳 Asaas: cobrança ${c.id} · ${fields.asaas_status_rotulo} · ${fields.asaas_valor ?? ""}`);
          if (step.acao === "enviar_comprovante") {
            if (!cobrancaPaga(c)) { log(`💳 Asaas: cobrança ainda "${fields.asaas_status_rotulo}" — comprovante NÃO enviado (use {{asaas_pago}} numa Condição pra tratar esse caminho)`); break; }
            const padrao = "Pagamento confirmado, {{primeiro_nome}}! Recebemos {{asaas_valor}}.\n\nSeu comprovante: {{asaas_comprovante}}";
            const texto = render(String(step.mensagem ?? "").trim() || padrao, ev, fields).trim();
            if (!texto) { log("👻 FANTASMA: mensagem do comprovante ficou vazia — não enviada"); break; }
            log(`💳 Asaas: comprovante → ${to}`);
            await gw.sendText(to, texto);
          }
          break;
        }

        if (step.acao === "pix_copia_cola") {
          const c = await resolveCobranca();
          if (!c) break;
          aplicaCobranca(c);
          const pix = await pixCopiaCola(cfg, String(c.id));
          if (!pix) { log("💳 Asaas: essa cobrança não tem PIX (é de outro tipo?)"); break; }
          fields.asaas_pix = pix.payload;
          if (pix.validade) fields.asaas_pix_validade = pix.validade;
          log(`💳 Asaas: PIX copia-e-cola pronto em {{asaas_pix}} (${pix.payload.length} caracteres)`);
          break;
        }

        if (step.acao === "criar_cobranca") {
          // O Asaas exige o CLIENTE cadastrado — a busca é a mesma do checar (id/CPF/e-mail).
          const por = step.buscarPor === "cobranca" ? "cpf" : (step.buscarPor ?? "cpf");
          const bruto = render(String(step.valorBusca ?? ""), ev, fields).trim();
          let clienteId = por === "cliente" ? (bruto || fields.asaas_cliente_id || "") : "";
          if (!clienteId) {
            const chaveBusca = por === "email" ? { email: bruto || fields.email || "" } : { cpfCnpj: bruto || fields.cpf || fields.cpf_cnpj || "" };
            const valor = Object.values(chaveBusca)[0];
            if (!valor) { log("❌ Asaas: pra criar cobrança preciso achar o cliente — colete o CPF/e-mail antes (nó Perguntar)"); break; }
            const cli = await buscarClienteAsaas(cfg, chaveBusca);
            if (!cli) { log("❌ Asaas: cliente não encontrado no Asaas — cadastre lá (ou confira o CPF/e-mail) antes de cobrar"); break; }
            clienteId = String(cli.id);
          }
          // 💰 Dois formatos de dinheiro chegam aqui: o BR digitado ("1.234,56", "97,00") e o
          // decimal de API ("69.9", vindo de {{asaas_valor_numero}} ou de um código). Tratar os
          // dois EXPLICITAMENTE — um replace ingênuo de ponto transformaria 69.9 em 699.
          const cru = render(String(step.cobrancaValor ?? ""), ev, fields).replace(/[R$\s]/g, "");
          const valorNum = /,\d{1,2}$/.test(cru)
            ? Number(cru.replace(/\./g, "").replace(",", "."))    // 1.234,56 → 1234.56
            : /^\d{1,3}(\.\d{3})+$/.test(cru)
              ? Number(cru.replace(/\./g, ""))                    // 1.234 / 10.000 (milhar BR) → 1234
              : /^\d+(\.\d+)?$/.test(cru)
                ? Number(cru)                                     // 69.9 / 97 (decimal de API) → como está
                : Number(cru.replace(/\./g, "").replace(",", ".")); // resto: trata como BR
          if (!isFinite(valorNum) || valorNum <= 0) { log("❌ Asaas: valor da cobrança inválido — confira o campo (aceita variável, ex. {{valor}})"); break; }
          const dias = Math.max(0, Math.round(Number(step.cobrancaVencimentoDias ?? 3)));
          const d = new Date(Date.now() + dias * 86_400_000);
          const dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const c = await criarCobranca(cfg, {
            customer: clienteId,
            billingType: step.cobrancaTipo ?? "PIX",
            value: Math.round(valorNum * 100) / 100,
            dueDate,
            description: render(String(step.cobrancaDescricao ?? ""), ev, fields).slice(0, 500) || undefined,
          });
          aplicaCobranca(c);
          if ((step.cobrancaTipo ?? "PIX") === "PIX") {
            const pix = await pixCopiaCola(cfg, String(c.id)).catch(() => null);
            if (pix) { fields.asaas_pix = pix.payload; if (pix.validade) fields.asaas_pix_validade = pix.validade; }
          } else if (step.cobrancaTipo === "BOLETO") {
            const linha = await linhaDigitavel(cfg, String(c.id)).catch(() => "");
            if (linha) fields.asaas_boleto_linha = linha;
          }
          log(`💳 Asaas: cobrança criada ${c.id} · ${fields.asaas_valor} · vence ${fields.asaas_vencimento} → link em {{asaas_link}}`);
          break;
        }

        if (step.acao === "listar_cobrancas") {
          const lista = await listarCobrancas(cfg, {
            status: String(step.filtroStatus ?? "").trim() || undefined,
            vencidoDias: step.filtroVencidoDias === undefined || step.filtroVencidoDias === null ? undefined : Number(step.filtroVencidoDias),
            limite: 100,
          });
          // MESMO formato do nó de HTTP ({prefixo}_data com a lista): é o que o Separar lista e o
          // Loop já sabem consumir — fluxo importado do n8n continua funcionando trocando só o nó.
          const prefixo = (String(step.salvarEm ?? "").trim() || "resposta").replace(/[^\w]/g, "_").slice(0, 60);
          fields[`${prefixo}_data`] = JSON.stringify(lista).slice(0, 100_000);
          fields[`${prefixo}_totalCount`] = String(lista.length);
          fields[LISTA_ATUAL] = `${prefixo}_data`; // um Filtrar logo depois peneira ESTA lista
          // "N com telefone" é o número que importa pro Loop: cobrança sem telefone no cliente
          // do Asaas é pulada lá na frente — melhor a pessoa ver aqui que o cadastro está furado.
          const comFone = lista.filter((c: any) => c?.telefone).length;
          log(`💳 Asaas: ${lista.length} cobrança(s)${step.filtroStatus ? ` ${step.filtroStatus}` : ""}${step.filtroVencidoDias !== undefined && step.filtroVencidoDias !== null ? ` · venceu há ${step.filtroVencidoDias} dia(s)` : ""} · ${comFone} com telefone → {{${prefixo}_data}}`);
          break;
        }

        if (step.acao === "buscar_cliente") {
          const por = step.buscarPor ?? "cpf";
          const bruto = render(String(step.valorBusca ?? ""), ev, fields).trim();
          const cli = por === "cliente"
            ? await buscarClienteAsaas(cfg, { id: bruto || fields.asaas_cliente_id || "" })
            : por === "email"
              ? await buscarClienteAsaas(cfg, { email: bruto || fields.email || "" })
              : await buscarClienteAsaas(cfg, { cpfCnpj: bruto || fields.cpf || fields.cpf_cnpj || "" });
          if (!cli) { log("🔎 Asaas: cliente não encontrado"); break; }
          fields.asaas_cliente_id = String(cli.id ?? "");
          // Achatado no prefixo (igual ao HTTP): quem veio do n8n usa {{resposta_name}} etc.
          const prefixo = (String(step.salvarEm ?? "").trim() || "resposta").replace(/[^\w]/g, "_").slice(0, 60);
          for (const [k, v] of Object.entries(cli)) {
            if (v == null || typeof v === "object") continue;
            fields[`${prefixo}_${k.replace(/[^\w]/g, "_")}`.slice(0, 60)] = String(v).slice(0, 500);
          }
          log(`💳 Asaas: cliente ${cli.id} (${String(cli.name ?? "").slice(0, 30)}) → {{${prefixo}_…}}`);
          break;
        }

        log(`❌ Asaas: ação desconhecida "${(step as any).acao}"`);
      } catch (e: any) {
        log("❌ Asaas falhou: " + (e?.name === "TimeoutError" ? "o Asaas demorou demais (12s)" : String(e?.message ?? e).slice(0, 200)));
      }
      break;
    }
    case "email": {
      fields.email_enviado = "";
      const para = render(String(step.para ?? ""), ev, fields).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) { log(`✉️ e-mail${step._id ? ` (${step._id})` : ""}: destinatário sem e-mail válido ("${para.slice(0, 60)}") — passo pulado`); break; }
      const cfgR = configResendDoWorkspace();
      if (!cfgR) { log("❌ e-mail: conecte a Resend em Integrações → Resend (chave + remetente) — passo pulado"); break; }
      const assunto = render(String(step.assunto ?? ""), ev, fields).trim() || "(sem assunto)";
      const texto = render(String(step.corpo ?? ""), ev, fields);
      if (!texto.trim()) { log(`✉️ e-mail${step._id ? ` (${step._id})` : ""}: corpo vazio — não enviado`); break; }
      try {
        const id = await enviarEmailResend(cfgR, { para, assunto, html: textoParaHtml(texto), texto, nome: render(String(step.nomeRemetente ?? ""), ev, fields) || undefined, responderPara: step.responderPara });
        fields.email_enviado = id || "ok";
        log(`✉️ e-mail → ${para.replace(/^(.{2}).*(@.*)$/, "$1***$2")} · "${assunto.slice(0, 60)}" · id ${id || "?"}`);
      } catch (e: any) {
        log("❌ e-mail falhou: " + String(e?.message ?? e).slice(0, 250));
      }
      break;
    }
    case "gsheet_read": {
      const prefixo = (String(step.salvarEm ?? "").trim() || "planilha").replace(/[^\w]/g, "_").slice(0, 60);
      fields[`${prefixo}_data`] = "[]"; fields[`${prefixo}_total`] = "0";
      const sheetId = sheetIdFromUrl(step.sheetUrl);
      if (!sheetId) { log("❌ ler planilha: link inválido no passo"); break; }
      try {
        const access = await tokenGoogleDoWorkspace();
        if (!access) { log("❌ ler planilha: conecte o Google em Integrações (login) — passo pulado"); break; }
        const linhas = await readSheetRowsOAuth(access, sheetId, String(step.aba ?? "").trim() || undefined);
        const itens = linhas.map((o) => {
          // Telefone: acha a coluna (telefone/celular/whatsapp/phone), só dígitos, DDI 55 quando faltar.
          const bruto = o.telefone ?? o.celular ?? o.whatsapp ?? o.phone ?? o.fone ?? "";
          let tel = String(bruto).replace(/\D/g, "");
          if (tel && (tel.length === 10 || tel.length === 11)) tel = "55" + tel;
          const nome = String(o.nome ?? o.cliente ?? o.name ?? "").trim();
          const primeiro = nome.split(/\s+/)[0] ?? "";
          return { ...o, telefone: tel, nome, primeiro_nome: primeiro ? primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR") : "" };
        });
        // Mesmo telefone em duas linhas (comprou 2 lotes) = 1 mensagem só.
        const vistos = new Set<string>();
        let unicos: Array<Record<string, string>> = itens.filter((i) => { if (!i.telefone) return true; if (vistos.has(i.telefone)) return false; vistos.add(i.telefone); return true; });
        const colPula = String(step.pularSe ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
        if (colPula) { const antes = unicos.length; unicos = unicos.filter((i) => !String(i[colPula] ?? "").trim()); log(`📗 ler planilha: ${antes - unicos.length} linha(s) já com "${colPula}" preenchido — puladas`); }
        // SÓ QUEM ENTROU NAS ÚLTIMAS X HORAS (16/10/2026): a planilha de compradores acumula todas as
        // turmas; o aviso do workshop da semana tem que ir só pra quem comprou depois do último.
        // Lê a coluna de data no formato da planilha ("14/10/2026 09:18", fuso de Brasília).
        const colData = String(step.colunaData ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const horas = Number(step.ultimasHoras);
        if (colData && horas > 0) {
          const corte = Date.now() - horas * 3600_000;
          const antes = unicos.length;
          unicos = unicos.filter((i) => {
            const m = String(i[colData] ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
            if (!m) return false;
            const t = Date.parse(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "00").padStart(2, "0")}:${m[5] ?? "00"}:00-03:00`);
            return Number.isFinite(t) && t >= corte;
          });
          log(`📗 ler planilha: ${unicos.length} de ${antes} linha(s) com "${colData}" nas últimas ${horas} h`);
        }
        if (Number(step.limite) > 0) unicos = unicos.slice(0, Math.round(Number(step.limite)));
        if (step.ab) unicos = unicos.map((i, idx) => ({ ...i, variante: idx % 2 === 0 ? "A" : "B" }));
        fields[`${prefixo}_data`] = JSON.stringify(unicos).slice(0, 100_000);
        fields[`${prefixo}_total`] = String(unicos.length);
        fields[LISTA_ATUAL] = `${prefixo}_data`;
        log(`📗 ler planilha: ${unicos.length} linha(s) · ${unicos.filter((i) => i.telefone.length >= 12).length} com telefone → {{${prefixo}_data}} (lista pro Loop)`);
      } catch (e: any) {
        log("❌ ler planilha falhou: " + explicaErroGoogle(e));
      }
      break;
    }
    case "zapsign": {
      // ✍️ Passo de PASSAGEM: falha nunca derruba o fluxo — loga e segue com as variáveis zeradas,
      // pra uma Condição em {{zapsign_total}} não ler número velho de outra execução.
      const prefixo = (String(step.salvarEm ?? "").trim() || "zapsign").replace(/[^\w]/g, "_").slice(0, 60);
      fields[`${prefixo}_total`] = ""; fields[`${prefixo}_resumo`] = ""; fields[`${prefixo}_data`] = "[]";
      const cfgZ = configZapSignDoWorkspace();
      if (!cfgZ) { log("❌ ZapSign: conecte o token em Integrações → ZapSign — passo pulado"); break; }
      try {
        const { total, lista } = await listarPendentes(cfgZ, { diasMin: step.diasMin, telefones: step.telefones !== false });
        fields[`${prefixo}_total`] = String(total);
        fields[`${prefixo}_resumo`] = resumoPendentes(lista, total);
        fields[`${prefixo}_data`] = JSON.stringify(lista).slice(0, 100_000);
        fields[LISTA_ATUAL] = `${prefixo}_data`;
        log(`✍️ ZapSign: ${total} pendente(s)${step.diasMin ? ` há ${step.diasMin}+ dia(s)` : ""} · ${lista.filter((p) => p.telefone).length} com telefone → {{${prefixo}_total}} {{${prefixo}_resumo}}`);
      } catch (e: any) {
        log("❌ ZapSign falhou: " + (e?.name === "TimeoutError" ? "a ZapSign demorou demais (15s)" : String(e?.message ?? e).slice(0, 200)));
      }
      break;
    }
    case "meta_ads": {
      // 📈 Passo de PASSAGEM (molde do zapsign): falha nunca derruba o fluxo. Zera com "0" — o
      // render apaga placeholder não resolvido e deixaria linha órfã ("Gasto: ") no relatório.
      // ⚠️ nomes nunca podem ser dia_semana/hora/data/valor: são built-ins do render.
      const prefixo = (String(step.salvarEm ?? "").trim() || "ads").replace(/[^\w]/g, "_").slice(0, 60);
      const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      for (const k of ["gasto", "gasto_whatsapp", "gasto_compra", "impressoes", "cliques", "conversas_iniciadas", "custo_por_conversa", "compras", "valor_compras", "roas_meta"])
        fields[`${prefixo}_${k}`] = "0";
      fields[`${prefixo}_resumo`] = "⚠️ Meta Ads indisponível (confira Integrações → Meta Ads)";
      fields["_ads_gasto_num"] = "0";
      const actNo = normalizaActId(String(step.actId ?? ""));
      const tokNo = String(step.token ?? "").trim();
      const cfgA = actNo && tokNo ? { actId: actNo, token: tokNo } : configMetaAdsDoWorkspace();
      if (!cfgA) { log("❌ Meta Ads: configure a conta em Integrações → Meta Ads (ou no próprio nó) — passo pulado"); break; }
      try {
        const periodoA = step.periodo === "ontem" ? "ontem" as const : "hoje" as const;
        const i = await buscaInsightsMetaAds(cfgA, periodoA);
        fields[`${prefixo}_gasto`] = brl(i.gasto);
        fields[`${prefixo}_gasto_whatsapp`] = brl(i.gastoWhatsApp);
        fields[`${prefixo}_gasto_compra`] = brl(i.gastoCompra);
        fields[`${prefixo}_impressoes`] = String(i.impressoes);
        fields[`${prefixo}_cliques`] = String(i.cliques);
        fields[`${prefixo}_conversas_iniciadas`] = String(i.conversasIniciadas);
        fields[`${prefixo}_custo_por_conversa`] = i.conversasIniciadas ? brl(i.gasto / i.conversasIniciadas) : "—";
        fields[`${prefixo}_compras`] = String(i.compras);
        fields[`${prefixo}_valor_compras`] = brl(i.valorCompras);
        fields[`${prefixo}_roas_meta`] = i.roasMeta ? i.roasMeta.toFixed(2) : "—";
        fields["_ads_gasto_num"] = String(i.gasto); // contrato interno: é daqui que o nó Métricas do dia tira o ROAS real
        fields[`${prefixo}_resumo`] = [
          `💰 Investido: ${brl(i.gasto)}${i.gastoWhatsApp || i.gastoCompra ? ` (WhatsApp ${brl(i.gastoWhatsApp)} · compra ${brl(i.gastoCompra)})` : ""}`,
          `💬 Conversas iniciadas por anúncio (Meta): ${i.conversasIniciadas}${i.conversasIniciadas ? ` · ${brl(i.gasto / i.conversasIniciadas)}/conversa` : ""}`,
          `🛒 Compras que a Meta atribui: ${i.compras} (${brl(i.valorCompras)})${i.roasMeta ? ` · ROAS Meta ${i.roasMeta.toFixed(2)}` : ""}`,
        ].join("\n");
        log(`📈 Meta Ads (${periodoA}): gasto ${brl(i.gasto)} · ${i.conversasIniciadas} conversa(s) · ${i.compras} compra(s) → {{${prefixo}_gasto}} {{${prefixo}_resumo}}`);
      } catch (e: any) {
        log("❌ Meta Ads falhou: " + (e?.name === "TimeoutError" ? "a Meta demorou demais (15s)" : String(e?.message ?? e).slice(0, 200)));
      }
      break;
    }
    case "metricas_dia": {
      // 📊 Mesmo contrato do meta_ads: zera com "0", nunca derruba o fluxo.
      const prefixo = (String(step.salvarEm ?? "").trim() || "dia").replace(/[^\w]/g, "_").slice(0, 60);
      const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      for (const k of ["conversas_novas", "conversas_anuncio", "conversas_organico", "pedidos", "ticket_medio", "roas"])
        fields[`${prefixo}_${k}`] = "0";
      fields[`${prefixo}_faturamento`] = "R$ 0,00"; fields[`${prefixo}_liquido`] = "R$ 0,00";
      fields[`${prefixo}_resumo`] = "⚠️ métricas do dia indisponíveis";
      try {
        const periodoD = step.periodo === "ontem" ? "ontem" as const : "hoje" as const;
        const m = await metricasDoDia(periodoD);
        const rotulo = limitesDoPeriodo(periodoD).rotulo;
        const gastoNum = Number(fields["_ads_gasto_num"]) || 0; // escrito pelo nó Meta Ads, quando ele roda antes
        const roas = gastoNum > 0 ? m.faturamento / gastoNum : 0;
        fields[`${prefixo}_conversas_novas`] = String(m.conversasNovas);
        fields[`${prefixo}_conversas_anuncio`] = String(m.conversasAnuncio);
        fields[`${prefixo}_conversas_organico`] = String(m.conversasOrganico);
        fields[`${prefixo}_pedidos`] = String(m.pedidos);
        fields[`${prefixo}_faturamento`] = brl(m.faturamento);
        fields[`${prefixo}_liquido`] = brl(m.liquido);
        fields[`${prefixo}_ticket_medio`] = brl(m.ticketMedio);
        fields[`${prefixo}_roas`] = roas ? roas.toFixed(2) : "—";
        fields[`${prefixo}_resumo`] = [
          `📱 Conversas novas no WhatsApp (${rotulo}): ${m.conversasNovas} — ${m.conversasAnuncio} de anúncio · ${m.conversasOrganico} orgânicas`,
          `🧾 Pedidos aprovados (Kiwify): ${m.pedidos} · ${brl(m.faturamento)} bruto (${brl(m.liquido)} líquido)`,
          `🎯 Ticket médio: ${pedMedio(m.pedidos, m.ticketMedio, brl)}${roas ? ` · ROAS real (Kiwify ÷ gasto): ${roas.toFixed(2)}` : ""}`,
        ].join("\n");
        log(`📊 métricas do dia (${periodoD}): ${m.conversasNovas} conversa(s) nova(s) · ${m.pedidos} pedido(s) ${brl(m.faturamento)} → {{${prefixo}_resumo}}`);
      } catch (e: any) {
        log("❌ métricas do dia falharam: " + String(e?.message ?? e).slice(0, 200));
      }
      break;
    }
    case "mention_all": {
      const gwM = gatewayLiteDoWorkspace(step.account) ?? gw;
      log(`marcar todos → grupo ${step.groupJid}${step.account ? ` (pelo número ${step.account})` : ""}`);
      await gwM.mentionAll(step.groupJid, render(step.text, ev, fields), {
        hidden: step.hidden ?? true,
      });
      break;
    }
  }
}

const clampTurns = (n: unknown): number => Math.min(20, Math.max(1, Math.floor(Number(n) || 6)));

// ═══ "DIGITANDO…" ENQUANTO O MODELO PENSA ═══════════════════════════════════════════════════
// Entre a fala do lead e a resposta há a espera da rajada (6s no LITE) + o tempo do modelo
// (3–15s). Isso era silêncio: ✓✓ azul e nada — parece robô ou número morto. Agora o lead vê
// "digitando…" aparecer (3s), sumir (1s) e voltar, como gente que escreve, apaga e escreve de
// novo, até a resposta sair (aí o sendBalloons segue com o digitando de cada balão).
// Pedido do dono pro Escritório Exemplo (01/10/2026): "esperar uns 2 segundos após o cliente ter
// enviado uma mensagem.. e logo em seguida aparecer digitando".
const PENSANDO_DIGITA_MS = 3000;
const PENSANDO_PAUSA_MS = 1000;
const PENSANDO_TETO_MS = 45_000; // modelo travado não deixa o lead vendo "digitando" pra sempre

function mostrarPensando(gw: WhatsAppGateway, phone: string, atrasoMs = 0): { parar: () => Promise<void> } {
  let ativo = true;
  const ciclo = (async () => {
    if (atrasoMs > 0) await sleep(atrasoMs);
    const inicio = Date.now();
    while (ativo && Date.now() - inicio < PENSANDO_TETO_MS) {
      await gw.sendPresence(phone, "composing", PENSANDO_DIGITA_MS).catch(() => {});
      if (!ativo) break; // resposta pronta: o 1º balão já emenda o digitando dele, sem "sumir"
      await gw.sendPresence(phone, "paused", 0).catch(() => {});
      await sleep(PENSANDO_PAUSA_MS);
    }
  })();
  // Espera o ciclo em curso acabar: um "paused" atrasado não pode apagar o digitando do 1º balão.
  return { parar: async () => { ativo = false; await ciclo; } };
}

// Envia os balões de um turno do agente, com pausa curta entre eles (parece gente digitando).
// Manda os balões da agente. DIGITANDO embutido: antes de cada balão o lead vê os "três
// pontinhos", com o tempo proporcional ao tamanho do texto (como gente de verdade digitando).
// `replyId` marca/cita a mensagem do lead no PRIMEIRO balão — o resto vai solto, senão a conversa
// fica poluída de citação.
async function sendBalloons(
  gw: WhatsAppGateway, phone: string, msgs: string[], ev: NormalizedEvent,
  fields: Record<string, string>, replyId?: string,
): Promise<string> {
  const sent: string[] = [];
  for (const m of msgs) {
    const txt = render(m, ev, fields);
    if (!txt.trim()) continue;
    // ~55 caracteres por segundo, entre 1,2s e 5s: texto curto = pausa curta.
    const digitando = Math.max(1200, Math.min(5000, Math.round((txt.length / 55) * 1000)));
    await gw.sendPresence(phone, "composing", digitando).catch(() => {});
    await gw.sendText(phone, txt, 0, sent.length === 0 ? replyId : undefined);
    sent.push(txt);
    await sleep(700 + Math.floor(Math.random() * 700));
  }
  return sent.join("\n");
}

// O ramo desenhado começa num FOLLOW-UP DE VÁCUO? (espera longa que se cancela quando o lead
// responde). Nesse caso dá pra ter os DOIS: o fluxo agenda o follow-up E o agente continua
// atendendo — se o lead responder, o follow-up se cancela sozinho; se sumir, ele dispara.
function branchIsVacuumWait(g: FlowGraph, nodeId: string | null): boolean {
  const step = nodeId ? (getNode(g, nodeId)?.data as Step | undefined) : undefined;
  return !!step && step.type === "wait" && msDaEspera(step) >= SLEEP_MAX_MS && step.cancelOnReply !== false;
}

// Nome de caminho vindo do modelo pode perder espaço duplo/borda ("Grupo  VIP" → "Grupo VIP").
// Acha o caminho pelo nome EXATO e, se falhar, ignorando diferenças de espaçamento.
function findPath<T extends { name: string }>(paths: T[], name: string | undefined): T | undefined {
  if (!name) return undefined;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return paths.find((p) => p.name === name) ?? paths.find((p) => norm(p.name) === norm(name));
}

// Re-arma o follow-up de vácuo a cada turno da conversa: o "sumiu?" conta a partir da ÚLTIMA
// mensagem do lead (a resposta cancela o job pendente; se a sessão segue viva, agenda de novo).
// Ordem: primeiro o ramo do último caminho ENTREGUE; sem nenhum, a SAÍDA PADRÃO do agente —
// é o que permite follow-up de "nem respondeu a abertura" (agente pausado escutando + nudge
// agendado; a resposta do lead cancela o nudge sozinha). Pedido do fluxo da Ana (15/08).
async function rearmVacuumFollowup(
  a: Automation, g: FlowGraph, agentNodeId: string, delivered: string[], phone: string,
): Promise<void> {
  const arma = async (waitId: string | null): Promise<boolean> => {
    if (!branchIsVacuumWait(g, waitId)) return false;
    const wait = getNode(g, waitId!)!.data as Extract<Step, { type: "wait" }>;
    const alvo = nextNodeId(g, waitId!, null);
    if (!alvo) return false;
    await scheduleResume({
      wsId: getCurrentWorkspace(), phone, automationId: a.id, nodeId: alvo,
      instanceToken: getCurrentInstanceToken(), delayMs: wait.ms, cancelOnReply: true,
    }).catch(() => {});
    return true;
  };
  for (let i = delivered.length - 1; i >= 0; i--) {
    const handle = "p:" + delivered[i];
    if (!hasHandleEdge(g, agentNodeId, handle)) continue;
    if (await arma(nextNodeId(g, agentNodeId, handle))) return;
  }
  // Silêncio do lead é a porta "? não identificou / turnos" quando desenhada (é onde o builder e
  // o template põem a espera de vácuo); senão a saída padrão, como sempre foi.
  if (await arma(saidaDoAgente(g, agentNodeId, "fallback"))) return;
  await arma(saidaPadrao(g, agentNodeId));
}

// GUARDAR DADOS do caminho escolhido: extrai das falas do lead e grava na ficha + `fields` deste
// disparo ANTES de a resposta do caminho e o ramo rodarem (a resposta já pode usar {{nome_completo}}).
// Dado ausente vira "" nesta execução — sem isso um CPF velho da ficha seguiria pra Chamada HTTP
// como se o lead tivesse acabado de mandar. A ficha só recebe o que foi achado.
async function guardarDadosDoCaminho(
  chosen: { name: string; guardar?: Array<{ variable: string; hint?: string }> },
  history: Array<{ role: "user" | "assistant"; content: string }>,
  fields: Record<string, string>, phone: string, log: (m: string) => void,
): Promise<void> {
  const campos = (chosen.guardar ?? [])
    .map((c) => ({ variable: String(c?.variable ?? "").trim().replace(/[^\w]/g, "_"), hint: c?.hint }))
    .filter((c) => c.variable);
  if (!campos.length) return;
  const falas = history.filter((h) => h.role === "user").map((h) => h.content);
  const achados = (await extractFields(falas, campos).catch(() => null)) ?? {};
  for (const c of campos) {
    const v = achados[c.variable] ?? "";
    fields[c.variable] = v;
    if (v) await setContactField(phone, c.variable, v).catch(() => {});
  }
  // Nome completo informado → vira o {{nome}} do contato daqui em diante (planilha, Google
  // Contatos, avisos). Antes ficava o apelido do WhatsApp mesmo depois de a pessoa se identificar.
  if (achados.nome_completo && achados.nome_completo.trim().split(/\s+/).length >= 2) {
    fields.nome = achados.nome_completo;
    await setContactField(phone, "nome", achados.nome_completo).catch(() => {});
  }
  const ok = campos.filter((c) => fields[c.variable]).map((c) => c.variable);
  const faltam = campos.filter((c) => !fields[c.variable]).map((c) => c.variable);
  log(`🗂️ agente IA: caminho "${chosen.name}" guardou ${ok.length}/${campos.length} dado(s)${faltam.length ? ` · vazios: ${faltam.join(", ")}` : ""} · ${phone}`);
}

// Abre o Agente IA num nó: envia a 1ª fala e decide o que fazer.
// Estágio 1 do grafo: roteia pela aresta DEFAULT (comportamento idêntico ao linear). Ramos por
// caminho (sourceHandle = nome do caminho) entram no Estágio 3 — aqui já fica preparado.
async function openAgent(
  a: Automation, g: FlowGraph, nodeId: string, step: Extract<Step, { type: "ai_agent" }>,
  ev: NormalizedEvent, gw: WhatsAppGateway, fields: Record<string, string>, phone: string, log: (m: string) => void,
): Promise<{ pause: boolean; next: string | null }> {
  // Falha/encerramento NÃO pode cair num caminho por acaso: usa a porta desenhada pra isso
  // (encerrou / não identificou) ou, sem ela, só a saída padrão.
  const def = () => saidaDoAgente(g, nodeId, "fallback");
  const paths = step.paths.filter((p) => p.name.trim());
  // Quando o lead abriu a conversa falando (Atendente IA), a fala dele É o começo do papo — o
  // agente decide JÁ respondendo a pergunta, em vez de abrir com um "oi" genérico.
  const inicial = String(ev.falaInicial ?? "").trim();
  const historyInicial: Array<{ role: "user" | "assistant"; content: string }> = inicial ? [{ role: "user", content: inicial }] : [];
  // Lead abriu falando → mostra "digitando" enquanto o modelo pensa (na Oficial não há rajada:
  // espera 2s pra não parecer resposta automática; no LITE a rajada já esperou 6s).
  const pensando = inicial ? mostrarPensando(gw, phone, String(ev.platform) === "meta" ? 2000 : 0) : null;
  const decision = await agentDecide({ systemPrompt: render(step.systemPrompt, ev, fields), paths, history: historyInicial, delivered: [] });
  if (pensando) await pensando.parar();
  // A 1ª fala do lead entra no histórico salvo junto com a abertura — senão ela sumia do
  // contexto já no 2º turno e a agente perguntava de novo o que a pessoa acabou de dizer.
  const histSalvo = (op: string | null | undefined): Array<{ role: "user" | "assistant"; content: string }> =>
    [...historyInicial, ...(op ? [{ role: "assistant" as const, content: op }] : [])];

  if (!decision) {
    log(`⚠️  agente IA sem resposta (chave OpenAI ausente ou erro) — pulando o nó`);
    return { pause: false, next: def() };
  }
  try {
    const opening = await sendBalloons(gw, phone, decision.messages, ev, fields, ev.replyToId);
    if (decision.action === "path" && decision.path) {
      const chosen = findPath(paths, decision.path);
      if (chosen) {
        await guardarDadosDoCaminho(chosen, historyInicial, fields, phone, log);
        await sleep(1200);
        // Caminho sem resposta escrita (campo em branco no editor) não vira balão vazio — só o
        // ramo do canvas segue. Enviar "" faz a conversa pular pro topo sem nada aparecer.
        await entregaCaminho(gw, phone, chosen, ev, fields, log);
        recordNodeHit(a.id, nodeId + ":" + chosen.name, phone).catch(() => {});
        // O DESENHO MANDA: se você ligou uma saída nesse caminho no canvas, o motor SEGUE ela.
        // (Antes, com "continuar atendendo" ligado, a linha só era seguida depois que TODOS os
        // caminhos fossem entregues na mesma conversa — na prática, quase nunca.)
        const temRamo = hasHandleEdge(g, nodeId, "p:" + chosen.name);
        if (!temRamo && step.keepAlive !== false && (paths.length > 1 || chosen.repetir)) {
          await saveAgentSession(phone, { automation_id: a.id, next_index: 0, node_id: nodeId, turns: 0, history: histSalvo(opening), delivered: [chosen.name] });
          await rearmVacuumFollowup(a, g, nodeId, [chosen.name], phone); // pausou escutando → arma o nudge de vácuo
          return { pause: true, next: null };
        }
        const next = nextNodeId(g, nodeId, "p:" + chosen.name);
        // A CONVERSA NÃO MORRE: com "continuar atendendo" ligado, o ramo desenhado roda E a agente
        // segue na escuta. Antes, entregar um caminho com ramo encerrava a sessão — o lead mandava
        // áudio/pergunta logo depois e ficava no vácuo (foi o que aconteceu no teste de uma cliente).
        if (temRamo && step.keepAlive !== false) {
          await saveAgentSession(phone, { automation_id: a.id, next_index: 0, node_id: nodeId, turns: 0, history: histSalvo(opening), delivered: [chosen.name] });
        }
        return { pause: false, next };
      }
      return { pause: false, next: def() };
    }
    if (decision.action === "end") return { pause: false, next: saidaDoAgente(g, nodeId, "ended") };
    await saveAgentSession(phone, { automation_id: a.id, next_index: 0, node_id: nodeId, turns: 0, history: histSalvo(opening), delivered: [] });
    // Abertura enviada e agente ESCUTANDO: arma o follow-up de vácuo da saída padrão (se desenhado).
    // Sem isto, lead que nunca responde a abertura nunca recebia nudge — o fluxo ficava pendurado.
    await rearmVacuumFollowup(a, g, nodeId, [], phone);
    log(`🤖 agente IA iniciado · ${phone} · fluxo "${a.id}"`);
    return { pause: true, next: null };
  } catch (e: any) {
    log(`❌ agente IA (abertura) falhou: ${e.message}`);
    return { pause: false, next: def() };
  }
}

// Percorre o GRAFO a partir de `startId`, seguindo as arestas. Ao topar num "perguntar" ou
// "Agente IA", envia a abertura, PAUSA (salva o estado com o id do nó) e retorna true.
// ▶ PASSO A PASSO DE VERDADE (builder): roda UM nó com os dados do teste e devolve qual é o próximo,
// sem continuar. `wait` é pulado (ninguém quer esperar 40s clicando em play); os nós que PAUSAM
// (pergunta, agente IA, botões) rodam de verdade e ficam esperando a resposta do lead no WhatsApp.
export interface SaidaUmPasso { proximo: string | null; pausou: boolean }

async function runFromNode(
  a: Automation,
  g: FlowGraph,
  startId: string | null,
  ev: NormalizedEvent,
  gw: WhatsAppGateway,
  fields: Record<string, string>,
  log: (m: string) => void,
  opts?: { soUm?: boolean; saida?: SaidaUmPasso },
): Promise<boolean> {
  const phone = ev.contact.phone!;
  const seen = new Set<string>(); // anti-loop
  let cur = startId;
  while (cur) {
    if (opts?.soUm && seen.size >= 1) { opts.saida = { proximo: cur, pausou: false }; return false; }
    if (seen.has(cur)) { log(`⚠️  loop no fluxo "${a.id}" em ${cur} — parei`); return false; }
    seen.add(cur);
    const node = getNode(g, cur);
    if (!node) return false;
    const step = node.data as Step;
    if (opts?.soUm && step.type === "wait") {
      log(`⏭️ passo a passo: espera "${cur}" pulada (no teste manual ninguém espera)`);
      opts.saida = { proximo: nextNodeId(g, cur, null), pausou: false };
      return false;
    }

    // 📮 DISPARO SEM DESTINATÁRIO (agendamento sem destino fixo): passo que fala com UMA pessoa é
    // pulado aqui, antes da espera longa e do "perguntar" — os dois agendam/enviam usando o
    // telefone e, vazio, agendariam retomada pra ninguém. Os passos de máquina seguem em frente,
    // que é o ponto do fluxo: buscar a lista e deixar o Loop falar com cada um.
    if (!String(phone ?? "").trim() && PRECISA_DESTINATARIO.has(step.type)) {
      log(`📮 passo "${step.type}" (${cur}) pulado: este disparo não tem destinatário — o agendamento não tem destino fixo. Quem manda mensagem pra cada pessoa da lista é o Loop.`);
      cur = saidaPadrao(g, cur);
      continue;
    }

    // ESPERA LONGA → não segura a conversa: PAUSA aqui e agenda a retomada no próximo nó.
    // (Espera curta continua sleep no runStep — é a pausa que faz o bot parecer humano.)
    if (step.type === "wait" && msDaEspera(step) >= SLEEP_MAX_MS) {
      const proximo = nextNodeId(g, cur, null);
      if (!proximo) return false; // esperar e não ter o que fazer depois = fim do fluxo
      recordNodeHit(a.id, cur, phone).catch(() => {});
      try {
        await scheduleResume({
          wsId: getCurrentWorkspace(),
          phone,
          automationId: a.id,
          nodeId: proximo,
          instanceToken: getCurrentInstanceToken(),
          delayMs: msDaEspera(step),
          cancelOnReply: step.cancelOnReply !== false, // padrão: follow-up de vácuo se cancela na resposta
        });
        log(`⏰ fluxo "${a.id}" agendado pra continuar em ${Math.round(msDaEspera(step) / 60_000)}min${step.modo === "data" ? ` (até ${step.quando})` : ""} · ${phone}`);
      } catch (e: any) {
        log(`❌ não consegui agendar a continuação: ${e.message}`);
      }
      return true; // pausa (libera a fila do telefone — o lead continua sendo atendido)
    }

    if (step.type === "ask") {
      try {
        log(`perguntar → ${phone} (captura ${step.variable})`);
        const pergunta = render(step.text, ev, fields);
        if (!pergunta.trim()) { log(`👻 FANTASMA: passo de perguntar sem enunciado — nada enviado (a captura segue armada)`); }
        else await gw.sendText(phone, pergunta);
      } catch (e: any) {
        log(`❌ perguntar falhou: ${e.message}`);
      }
      recordNodeHit(a.id, cur, phone).catch(() => {});
      await setPending(phone, a.id, 0, step.variable, step.hint, cur);
      log(`⏸️  fluxo "${a.id}" pausado em ${cur} · esperando resposta p/ ${step.variable}`);
      return true;
    }

    if (step.type === "reminder") {
      const prompt =
        step.text?.trim() ||
        "Ok! Estou na escuta do lembrete. Manda em áudio ou texto: o *dia*, a *hora*, *pra quem* e a *mensagem*. (responda *cancelar* pra desistir)";
      try {
        // o eco fromMe do prompt (e de qualquer passo) é registrado pelo withEchoGuard no gw.
        await gw.sendText(phone, render(prompt, ev, fields));
      } catch (e: any) {
        log(`❌ lembrete (prompt) falhou: ${e.message}`);
      }
      recordNodeHit(a.id, cur, phone).catch(() => {});
      await setPending(phone, a.id, 0, REMINDER_VAR, undefined, cur);
      resetReminderFails(phone); // nova escuta → zera o contador de falhas (não herda de tentativa antiga)
      log(`⏸️  fluxo "${a.id}" pausado em ${cur} · escutando LEMBRETE`);
      return true;
    }

    if (step.type === "ai_agent") {
      recordNodeHit(a.id, cur, phone).catch(() => {});
      const r = await comoIa(() => openAgent(a, g, cur!, step, ev, gw, fields, phone, log)); // envios = "ia" (selo do balão)
      if (r.pause) return true;
      cur = r.next;
      continue;
    }

    // 💳 CONSULTA DE PAGAMENTO: não envia nada — CONSULTA o banco e ESCOLHE o caminho
    // ("pago" / "nao_pago"). É o nó que fecha a recuperação de PIX: espera 1h e só cobra quem não
    // pagou. Sem o ramo desenhado, cai na saída padrão (nunca trava o fluxo por falta de desenho).
    if (step.type === "payment_check") {
      const r = await achaPagamento(phone, { produto: step.produto, porCodigo: step.porCodigo, horas: step.horas });
      const handle = r.pago ? "pago" : "nao_pago";
      log(`💳 consulta de pagamento (${step.produto || "qualquer produto"}) → ${r.pago ? "PAGOU" : "não pagou"} · ${phone}`);
      recordNodeHit(a.id, cur + ":" + handle, phone).catch(() => {});
      // O achado alimenta os passos seguintes: {{produto}}/{{valor}} passam a ser os DA COMPRA.
      if (r.pago) {
        if (r.produto) fields.produto = r.produto;
        if (r.valor != null) fields.valor = r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      }
      cur = hasHandleEdge(g, cur, handle) ? nextNodeId(g, cur, handle) : saidaPadrao(g, cur);
      continue;
    }

    // 🕐 JANELA DE CONVERSA: aberta ou fechada? A janela conta da ÚLTIMA FALA DO LEAD — é a hora
    // DELE, muda de pessoa pra pessoa. 24h no caso normal; 72h quando ele chegou por anúncio
    // Click-to-WhatsApp (Free Entry Point da Meta). Nó de decisão: não envia nada, só escolhe.
    if (step.type === "window") {
      const ultima = await ultimaFalaDoLead(phone);
      // Sem horas escolhidas, o próprio lead decide: veio de anúncio → 72h; senão 24h.
      const veioDeAnuncio = !!(fields.anuncio_headline || fields.anuncio_link || fields.anuncio_clique);
      const horas = Number(step.horas) > 0 ? Number(step.horas) : veioDeAnuncio ? 72 : 24;
      const fechaEm = ultima ? (ultima + horas * 3600) * 1000 : 0;
      const aberta = !!ultima && fechaEm > Date.now();
      const restante = aberta ? Math.round((fechaEm - Date.now()) / 60000) : 0;
      const handle = aberta ? "aberta" : "fechada";
      log(`🕐 janela de ${horas}h · ${aberta ? `ABERTA (faltam ${restante}min)` : ultima ? "FECHADA" : "nunca falou — FECHADA"} · ${phone}`);
      recordNodeHit(a.id, cur + ":" + handle, phone).catch(() => {});
      // Deixa o restante pronto pros próximos passos ({{janela_min}} num texto de urgência).
      fields.janela_min = String(restante);
      fields.janela_horas = String(horas);
      cur = hasHandleEdge(g, cur, handle) ? nextNodeId(g, cur, handle) : saidaPadrao(g, cur);
      continue;
    }

    // 🚦 FILTRO: passou segue, não passou PARA aqui. É o único nó que ENCERRA o fluxo de
    // propósito — por isso o log diz qual condição barrou, senão vira "sumiu e não sei por quê".
    if (step.type === "filter") {
      // 🚦 FILTRO SOBRE A LISTA. No n8n o Filter roda item a item; aqui ele sempre foi o portão da
      // CONVERSA (olha os campos da pessoa e para o fluxo). Num "lista → Filtrar → Loop" isso
      // barrava tudo: os campos da condição (deleted, status…) são do ITEM, não existem no nível
      // do fluxo, e o Loop nunca chegava a rodar — o "Filtrar Não Deletados" de um cliente. Regra:
      // se NENHUM campo da condição existe no fluxo e há uma lista recém-produzida, peneira a
      // lista (o Loop lê a mesma variável, já filtrada) e segue; senão, portão como sempre.
      const condUteis = (step.condicoes ?? []).filter((c) => c?.campo?.trim());
      const nomeLista = fields[LISTA_ATUAL];
      const camposSaoDoItem = condUteis.length > 0 && condUteis.every((c) => fields[c.campo.trim()] === undefined);
      if (camposSaoDoItem && nomeLista && fields[nomeLista]) {
        let itens: any[] = [];
        try { const j = JSON.parse(fields[nomeLista]); itens = Array.isArray(j) ? j : []; } catch { itens = []; }
        const ficaram = itens.filter((it) => filtroPassa(condUteis, achataItem(it), step.combinador ?? "e"));
        fields[nomeLista] = JSON.stringify(ficaram).slice(0, 100_000);
        fields[nomeLista + "_total"] = String(ficaram.length);
        log(`🚦 filtro na lista {{${nomeLista}}}: ${ficaram.length} de ${itens.length} item(ns) passaram`);
        recordNodeHit(a.id, cur + ":passou", phone).catch(() => {});
        cur = nextNodeId(g, cur, null);
        continue;
      }
      const passou = filtroPassa(step.condicoes ?? [], fields, step.combinador ?? "e");
      recordNodeHit(a.id, cur + ":" + (passou ? "passou" : "barrado"), phone).catch(() => {});
      if (!passou) {
        const resumo = (step.condicoes ?? []).filter((c) => c?.campo?.trim())
          .map((c) => `${c.campo}=${JSON.stringify(String(fields[c.campo.trim()] ?? "").slice(0, 30))}`).join(" · ");
        log(`🚦 filtro barrou aqui — o fluxo PARA (${resumo || "sem condição"}) · ${phone}`);
        cur = null;
        continue;
      }
      log(`🚦 filtro: passou · ${phone}`);
      cur = nextNodeId(g, cur, null);
      continue;
    }

    // 🔁 LOOP sobre uma lista. Diferente de tudo o mais no motor: aqui cada volta fala com uma
    // PESSOA DIFERENTE (as 100 cobranças vencidas são 100 clientes), então não dá pra "repetir
    // dentro da conversa" — cada item vira um DISPARO próprio, agendado e espaçado.
    //
    // Reusa o mecanismo de follow-up: grava os campos do item na ficha daquele telefone e agenda
    // a retomada no ramo "cada item". Assim ganha de graça o que já é sólido: persistência
    // (sobrevive a redeploy), conta certa do workspace e respeito a quem pediu PARAR.
    //
    // ⚠️ Isto é disparo em massa. Sem teto e sem espaçamento seria uma arma — daí o limite duro.
    if (step.type === "loop") {
      const TETO_DURO = 500;
      const bruto = fields[String(step.lista ?? "").trim()] ?? "";
      let itens: any[] = [];
      try { const j = JSON.parse(bruto); itens = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []); } catch { itens = []; }

      const ramoItem = hasHandleEdge(g, cur, "item") ? nextNodeId(g, cur, "item") : null;
      if (!itens.length || !ramoItem) {
        const porque = !itens.length ? "lista vazia ou não é uma lista" : "a saída de cada item não está ligada";
        log(`🔁 loop "${step.lista}": ${porque} — segui pela saída de conclusão`);
        cur = hasHandleEdge(g, cur, "done") ? nextNodeId(g, cur, "done") : saidaPadrao(g, cur);
        continue;
      }

      const limite = Math.max(1, Math.min(TETO_DURO, Math.round(Number(step.limite) || 50)));
      // ⏱️ Número LITE (API não oficial) nunca dispara mais rápido que 1 pessoa a cada 5 s, mesmo que o nó
      // peça menos — rajada no mesmo segundo é o que derruba número não oficial (pedido do dono, 16/10/2026).
      // A API Oficial aceita o intervalo configurado, inclusive 0 (todos de uma vez).
      const ehOficial = gw instanceof MetaGateway;
      // 0 é válido (Oficial dispara todos juntos); só campo vazio cai no padrão de 8 s.
      const pedido = step.intervaloMs === undefined || step.intervaloMs === null || (step.intervaloMs as any) === "" ? 8000 : Number(step.intervaloMs);
      const intervalo = Math.max(ehOficial ? 0 : 5000, Math.round(Number.isFinite(pedido) ? pedido : 8000));
      if (!ehOficial && Number.isFinite(pedido) && pedido < 5000) log(`⏱️ loop: número Lite — intervalo subiu de ${Number(step.intervaloMs)} ms pra 5000 ms (proteção contra bloqueio)`);
      const campoTel = String(step.campoTelefone ?? "telefone").trim();
      const usados = itens.slice(0, limite);
      if (itens.length > limite) log(`🔁 loop: a lista tem ${itens.length} itens e o limite deste nó é ${limite} — os demais NÃO foram disparados`);

      const wsAtual = getCurrentWorkspace();
      const tokenAtual = getCurrentInstanceToken();
      // 📣 id da EXECUÇÃO nasce ANTES do laço: cada job leva o mesmo id, e é por ele que a tela
      // "Em andamento" conta/pausa SÓ este lote (lotes do mesmo fluxo não se misturam mais).
      const disparoId = "df-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      let agendados = 0;
      for (let i = 0; i < usados.length; i++) {
        const item = usados[i];
        if (!item || typeof item !== "object") continue;
        // Achata o item pra virar variável do disparo dele ({{nome}}, {{valor}}, {{cliente_email}}…).
        const camposItem = achataItem(item);

        const tel = String(camposItem[campoTel] ?? "").replace(/\D/g, "");
        if (tel.length < 10) { log(`🔁 loop: item ${i + 1} sem telefone válido em "${campoTel}" — pulado`); continue; }

        try {
          // Os campos moram na FICHA: é de lá que a retomada os lê (resumeScheduledFlow).
          for (const [k, v] of Object.entries(camposItem)) await setContactField(tel, k, v).catch(() => {});
          await scheduleResume({
            wsId: wsAtual, phone: tel, automationId: a.id, nodeId: ramoItem,
            instanceToken: tokenAtual,
            delayMs: i * intervalo, // espaçamento entre pessoas — evita rajada e bloqueio
            cancelOnReply: false,   // é um envio ativo, não follow-up de vácuo
            disparoId,
          });
          agendados++;
        } catch (e: any) {
          log(`🔁 loop: item ${i + 1} (${tel}) não agendou: ${e.message}`);
        }
      }
      log(`🔁 loop "${step.lista}": ${agendados} disparo(s) agendado(s), 1 a cada ${Math.round(intervalo / 1000)}s`);
      // Vira um "disparo" na tela Em andamento (progresso, métricas por template, pausar/retomar).
      void registraDisparoFluxo({
        id: disparoId,
        wsId: wsAtual, automationId: a.id, nome: a.name, total: agendados, intervaloMs: intervalo,
        templates: [...new Set((a.steps ?? []).filter((s: any) => s?.type === "template" && s.templateName).map((s: any) => String(s.templateName)))],
      });
      recordNodeHit(a.id, cur + ":done", phone).catch(() => {});
      cur = hasHandleEdge(g, cur, "done") ? nextNodeId(g, cur, "done") : saidaPadrao(g, cur);
      continue;
    }

    // 🔀🔀 SWITCH: uma variável, N saídas por valor — cada CASO é uma porta ("c0","c1"…), sem
    // casar cai na saída padrão. Inspirado no nó Switch um cliente (afiliado) usa noutra
    // ferramenta pra rotear alerta de rastreador (chave ligada/desligada, fio desconectado,
    // veículo bloqueado…) — o mesmo padrão, dentro do ZapConverte.
    if (step.type === "switch") {
      const campo = String(step.campo ?? "").trim();
      const atual = String(fields[campo] ?? "").trim();
      const norm2 = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const casos = (step.casos ?? []).filter((c) => c?.rotulo?.trim());
      const atualN = norm2(atual);
      const idx = casos.findIndex((c) => {
        const valN = norm2(String(c.valor ?? ""));
        return c.op === "contem" ? !!valN && atualN.includes(valN) : atualN === valN;
      });
      const handle = idx >= 0 ? "c" + idx : "default";
      log(`🔀 switch: ${campo || "(campo vazio)"}="${atual.slice(0, 40)}" → ${idx >= 0 ? `caso "${casos[idx].rotulo}"` : "sem correspondência (saída padrão)"} · ${phone}`);
      recordNodeHit(a.id, cur + ":" + handle, phone).catch(() => {});
      cur = hasHandleEdge(g, cur, handle) ? nextNodeId(g, cur, handle) : saidaPadrao(g, cur);
      continue;
    }

    // 🔀 CONDIÇÃO: olha a ficha do contato (campo ou etiqueta) e escolhe "sim"/"nao".
    if (step.type === "condition") {
      let ok = false;
      let como = "";
      if (step.checa === "tag") {
        const alvo = String(step.valor ?? "").trim().toLowerCase();
        const tags = (await getContactTags(phone)).map((t) => t.toLowerCase());
        ok = !!alvo && tags.includes(alvo);
        como = `etiqueta "${alvo}"`;
      } else {
        const campo = String(step.campo ?? "").trim();
        const atual = String(fields[campo] ?? "").trim();
        const alvo = render(String(step.valor ?? ""), ev, fields).trim();
        const op = step.op ?? "existe";
        ok = op === "existe" ? !!atual
          : op === "contem" ? !!atual && atual.toLowerCase().includes(alvo.toLowerCase())
          : atual.toLowerCase() === alvo.toLowerCase();
        como = `${campo} ${op} ${op === "existe" ? "" : `"${alvo}"`} (valor: "${atual.slice(0, 30)}")`;
      }
      const handle = ok ? "sim" : "nao";
      log(`🔀 condição: ${como} → ${ok ? "SIM" : "NÃO"} · ${phone}`);
      recordNodeHit(a.id, cur + ":" + handle, phone).catch(() => {});
      cur = hasHandleEdge(g, cur, handle) ? nextNodeId(g, cur, handle) : saidaPadrao(g, cur);
      continue;
    }

    // 🔘 BOTÃO COM RAMO DESENHADO: até 17/08 as saídas "b0/b1/b2" dos botões eram só DESENHO — o
    // motor enviava e seguia reto pela saída padrão, ignorando o clique do lead. Agora, se alguma
    // saída de botão está ligada no canvas, o fluxo envia e fica ESCUTANDO: a resposta roteia pelo
    // botão clicado (resumeButtonBranch). Sem ramo ligado, comporta como sempre (envia e segue) —
    // fluxo antigo não muda de comportamento.
    if (step.type === "buttons" || step.type === "template") {
      const rotulos = (step.type === "buttons" ? step.buttons : step.botoes ?? []).filter((r) => r && r.trim());
      const temRamo = rotulos.some((_, i) => hasHandleEdge(g, cur!, "b" + i));
      if (temRamo) {
        try {
          await runStep(step, ev, gw, fields, log);
          recordNodeHit(a.id, cur, phone).catch(() => {});
        } catch (e: any) {
          log(`❌ passo ${step.type} falhou: ${e.message}`);
          cur = nextNodeId(g, cur, null); // envio falhou → não fica escutando um botão que ninguém viu
          continue;
        }
        await setPending(phone, a.id, 0, BUTTON_VAR, undefined, cur);
        log(`🔘 aguardando clique do botão · ${phone} · nó ${cur}`);
        return true;
      }
    }

    // SAÍDA "falha" (13/10): se o nó tem a porta "falha" ligada, um erro do passo segue por ela (com
    // {{erro_envio}}) — é o que deixa o disparo por planilha marcar "falha" na linha da pessoa.
    const temFalha = hasHandleEdge(g, cur, "falha");
    try {
      await runStep(step, ev, gw, fields, log);
      recordNodeHit(a.id, cur, phone).catch(() => {});
    } catch (e: any) {
      log(`❌ passo ${step.type} falhou: ${e.message}`);
      if (temFalha) {
        fields.erro_envio = String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 200);
        recordNodeHit(a.id, cur + ":falha", phone).catch(() => {});
        cur = nextNodeId(g, cur, "falha");
        continue;
      }
    }
    await sleep(jitterDelay());
    cur = temFalha ? saidaPadrao(g, cur) : nextNodeId(g, cur, null);
  }
  if (opts?.soUm && !opts.saida) opts.saida = { proximo: null, pausou: false };
  return false;
}

// ▶ Executa UM nó do fluxo com os campos informados (o payload capturado no gatilho) e devolve o
// próximo nó + os campos depois do passo (o que o nó produziu: agenda_link, horarios_livres…).
export async function executarPassoDoFluxo(
  a: Automation,
  nodeId: string,
  ev: NormalizedEvent,
  gw: WhatsAppGateway,
  fieldsIn: Record<string, string>,
  log: (m: string) => void = console.log,
): Promise<{ proximo: string | null; pausou: boolean; fields: Record<string, string> }> {
  const g = toGraph(a);
  if (!getNode(g, nodeId)) throw new Error(`o passo ${nodeId} não existe neste fluxo`);
  const phone = ev.contact.phone ?? "";
  const fields = { ...(phone ? await camposDoContato(phone) : {}), ...fieldsIn };
  const opts: { soUm: boolean; saida?: SaidaUmPasso } = { soUm: true };
  const pausou = await runFromNode(a, g, nodeId, ev, gw, fields, log, opts);
  return { proximo: opts.saida?.proximo ?? null, pausou: pausou || !!opts.saida?.pausou, fields };
}

// Roda todas as automações que casam com o evento. Aplica atraso aleatório (anti-ban) entre passos.
// RETOMA um fluxo pausado por espera longa (chamado pelo tick do agendador). Continua exatamente no
// nó gravado — como se a espera tivesse acontecido ali, mas sem ter segurado a conversa.
export async function resumeScheduledFlow(
  phone: string,
  automationId: string,
  nodeId: string,
  gw: WhatsAppGateway,
  all: Automation[],
  log: (m: string) => void = console.log,
): Promise<void> {
  // Fluxo apagado OU virado rascunho → o follow-up agendado nele não dispara mais.
  const a = all.find((x) => x.id === automationId && x.enabled !== false);
  if (!a) { log(`⏰ follow-up: fluxo "${automationId}" não existe mais (ou virou rascunho) — ignorado`); return; }
  const g = toGraph(a);
  if (!getNode(g, nodeId)) { log(`⏰ follow-up: nó ${nodeId} não existe mais em "${automationId}" — ignorado`); return; }
  if (await isOptedOut(phone)) { log(`⏰ follow-up cancelado: ${phone} pediu pra não receber`); return; }
  const fields = await camposDoContato(phone);
  const nomeSalvo = await getContactName(phone);
  const ev: NormalizedEvent = {
    platform: "lite",
    event: "keyword",
    eventId: "job-" + Date.now() + "-" + phone,
    contact: {
      phone,
      // O nome SALVO entra na conta: sem ele o {{primeiro_nome}} dos passos seguintes saía vazio.
      name: fields.nome || nomeSalvo || fields.primeiro_nome || phone,
      firstName: fields.primeiro_nome || nomeSalvo.split(" ")[0] || "",
    },
    raw: {},
  };
  log(`⏰ retomando "${automationId}" em ${nodeId} · ${phone}`);
  // Se havia uma sessão de agente DESTE fluxo "esperando" o lead (keep-alive + follow-up de
  // vácuo), ela é história: o lead ficou em silêncio até aqui. Limpa pra não virar sessão-
  // fantasma respondendo pela conversa antiga depois que o follow-up recomeçar o papo.
  // ⚠️ Só se for DESTE fluxo — um lembrete programado (cancelOnReply=false) de um fluxo A não
  // pode matar a conversa viva de um agente do fluxo B no meio do atendimento.
  const sess = await getAgentSession(phone);
  if (sess && sess.automation_id === automationId) await clearAgentSession(phone);
  await runFromNode(a, g, nodeId, ev, gw, fields, log);
}

export async function runAutomationsFor(
  ev: NormalizedEvent,
  gw: WhatsAppGateway,
  all: Automation[],
  log: (m: string) => void = console.log,
  // `jaFiltrado` = a lista JÁ é a dos fluxos que devem rodar; não refiltrar por gatilho.
  // Sem isto, o disparo por PALAVRA-CHAVE de um fluxo cujo gatilho é "primeiro_contato" morria
  // aqui: o evento vinha como "keyword", o gatilho do fluxo era outro, e a lista zerava em
  // silêncio (a mensagem era marcada como lida e nada acontecia — bug real em produção).
  jaFiltrado = false,
): Promise<{ ran: number }> {
  // 📮 Evento SEM telefone. Pra webhook de venda/lead isso é lixo (nada a fazer sem saber com quem
  // falar) e continua descartado. A EXCEÇÃO é o agendamento sem destino fixo — o Schedule Trigger
  // só marca a hora, e quem recebe aparece lá na frente (buscar cobranças → separar → Loop, que
  // agenda um disparo por item com o telefone daquele item). Sem esta exceção, o fluxo de cobrança
  // de um cliente morria aqui em silêncio: publicava, o cron acordava, e o motor devolvia ran:0.
  const semDestinatario = !String(ev.contact.phone ?? "").trim();
  if (semDestinatario && ev.platform !== "schedule") {
    log(`⚠️  evento ${ev.event} (${ev.platform}) sem telefone — ignorado`);
    return { ran: 0 };
  }
  const matches = jaFiltrado ? all.filter((a) => a.enabled !== false) : matchAutomations(ev, all);
  if (matches.length === 0) {
    log(`nenhuma automação para ${ev.event}/${ev.platform}`);
    return { ran: 0 };
  }
  const phone = String(ev.contact.phone ?? ""); // "" quando é agendamento sem destino fixo
  // 🔑 Os valores CANÔNICOS do evento (pix, produto, valor, link) viram fields ANTES da mistura.
  // Motivo: eles moram no topo do NormalizedEvent, não em ev.fields — então nunca eram salvos na
  // ficha do contato. Tudo que roda depois de uma PAUSA (clique de botão, captura, espera longa)
  // recria o evento do zero, com telefone e nome só. Resultado: {{pix}} resolvia pra VAZIO, o
  // passo virava mensagem vazia, a guarda de fantasma bloqueava — e o nó ainda contava como
  // percorrido. Era o "Copiar Código do Pix" que não devolvia nada (21/08, produção).
  // Entrando em ev.fields, eles (a) resolvem neste disparo, (b) são persistidos pelo laço abaixo,
  // e (c) SOBRESCREVEM o valor salvo antigo — o dado fresco sempre ganha do guardado.
  const canonicos: Record<string, string> = {};
  if (ev.pixCode) canonicos.pix = ev.pixCode;
  if (ev.product?.name) canonicos.produto = ev.product.name;
  if (ev.amount != null) canonicos.valor = formatBRL(ev.amount);
  const linkEv = ev.links?.checkout ?? ev.links?.boleto;
  if (linkEv) canonicos.link = linkEv;
  if (Object.keys(canonicos).length) ev.fields = { ...canonicos, ...(ev.fields ?? {}) };
  // Campos SALVOS do contato + os que vieram no evento (ex.: dados do lead num aviso de trial).
  // Os do evento vêm por último: são o dado fresco daquele disparo.
  const fields = { ...(semDestinatario ? {} : await camposDoContato(phone)), ...(ev.fields ?? {}) };
  // GUARDA o que veio no evento (UTM, afiliado, dados do lead) na ficha do contato. Sem isto o
  // dado morria na mensagem: o painel não teria como mostrar "de onde veio" quem passou no funil.
  for (const [k, v] of Object.entries(ev.fields ?? {})) {
    if (v && !semDestinatario) setContactField(phone, k, v).catch(() => {}); // sem telefone não há ficha pra guardar
  }
  let ran = 0;
  for (const a of matches) {
    const g = toGraph(a);
    log(`▶ automação "${a.id}" (${g.nodes.length - 1} passos) para ${ev.contact.name || ev.contact.phone}`);
    // 🧹 O MESMO fluxo disparando de novo pro MESMO telefone recomeça do zero: apaga a sessão do
    // Agente IA e a pergunta pendente que ESTE fluxo deixou na rodada anterior. Sem isto, no teste
    // do dono (14/09) o "Show" do lead caiu na sessão velha da IA (que já estava na fase de
    // agendar), a pergunta de horário saiu ANTES das 3 mensagens de abertura da rodada nova, e
    // o lead ficou com duas conversas embaralhadas. Sessão/pendência de OUTRO fluxo fica intacta.
    if (phone && !semDestinatario) {
      try {
        const sess = await getAgentSession(phone);
        if (sess && sess.automation_id === a.id) { await clearAgentSession(phone); log(`🧹 sessão antiga do Agente IA deste fluxo apagada pra ${phone}`); }
        const pend = await getPending(phone);
        if (pend && pend.automation_id === a.id) { await clearPending(phone); log(`🧹 pergunta pendente antiga deste fluxo apagada pra ${phone}`); }
      } catch { /* limpeza é best-effort */ }
    }
    // Entrou no fluxo → conta no nó "trigger" (100% do funil). Métrica é fire-and-forget.
    recordNodeHit(a.id, "trigger", phone).catch(() => {});
    ran++;
    // Por qual PORTA do gatilho sair: no switch de checkout cada evento tem a sua (`ev:<evento>`);
    // se aquela porta não estiver ligada a nada, cai na saída comum (o fluxo segue igual ao antigo).
    const portaGatilho = a.trigger === "checkout" ? "ev:" + ev.event
      // Resposta de template: clicou num botão conhecido → sai pela porta daquele botão.
      : a.trigger === "template_reply" && (ev.fields?.botao ?? "").trim() ? "b:" + ev.fields!.botao : null;
    const inicio = (portaGatilho && nextNodeId(g, "trigger", portaGatilho)) || nextNodeId(g, "trigger", null);
    const paused = await runFromNode(a, g, inicio, ev, gw, fields, log);
    // Um telefone só pode ter UMA conversa pausada por vez → não inicia o próximo fluxo pausante.
    if (paused) {
      if (matches.length > 1) log(`⏭️  ${matches.length - ran} fluxo(s) não iniciados (já há conversa ativa em ${phone})`);
      break;
    }
  }
  return { ran };
}

// O lead respondeu uma pergunta pendente → extrai o valor (IA), salva no campo, e RETOMA o fluxo.
// Pendência especial do clique de botão (buttons LITE / template oficial). Diferente do ask, aqui
// NÃO tem IA: a resposta é casada com os rótulos por comparação direta (sem acento, sem caixa).
export const BUTTON_VAR = "__botao__";
export async function resumeButtonBranch(
  phone: string,
  replyText: string,
  gw: WhatsAppGateway,
  all: Automation[],
  pending: Pending,
  log: (m: string) => void = console.log,
): Promise<void> {
  await clearPending(phone); // antes de qualquer await longo — mesma regra do resumeCapture
  const a = all.find((x) => x.id === pending.automation_id && x.enabled !== false);
  if (!a) return;
  const g = toGraph(a);
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const alvoNorm = norm(replyText);

  // Re-acha o botão no grafo ATUAL: varre os nós de template/botões procurando um rótulo igual ao
  // que o lead clicou, com ramo (b{i}) ligado. É a rede de segurança pro caso mais comum de "o
  // botão não fez nada": o fluxo foi editado/republicado entre o envio e o clique, o node_id do
  // pending sumiu, e o motor desistia calado (era o "Copiar Código do Pix" de um lead, 21/08).
  const achaRamo = (): { nodeId: string; next: string; rotulo: string } | null => {
    const achados: { nodeId: string; next: string; rotulo: string }[] = [];
    for (const n of g.nodes) {
      const d = n.data as Step | undefined;
      if (!d || (d.type !== "buttons" && d.type !== "template")) continue;
      const labels = (d.type === "buttons" ? d.buttons : d.botoes ?? []).filter((r) => r && r.trim());
      const i = labels.findIndex((r) => norm(r) === alvoNorm);
      if (i < 0 || !hasHandleEdge(g, n.id, "b" + i)) continue;
      const nx = nextNodeId(g, n.id, "b" + i);
      if (nx) achados.push({ nodeId: n.id, next: nx, rotulo: labels[i] });
    }
    if (achados.length > 1) log(`🔘 ⚠️ AMBÍGUO: "${replyText.slice(0, 30)}" casa em ${achados.length} nós — usando o 1º · ${phone}`);
    return achados[0] ?? null;
  };

  const nodeId = pending.node_id ?? null;
  const node = nodeId ? getNode(g, nodeId) : undefined;
  const step = node?.data as Step | undefined;
  const pendingVale = !!nodeId && !!step && (step.type === "buttons" || step.type === "template");

  let destino: string | null = null;
  let viaFallback = false;
  if (pendingVale) {
    const rotulos = (step!.type === "buttons" ? step!.buttons : step!.botoes ?? []).filter((r) => r && r.trim());
    const idx = rotulos.findIndex((r) => norm(r) === alvoNorm);
    // Clique num botão COM ramo ligado → segue o ramo. Resposta livre (ou botão sem ramo) → saída
    // padrão: quem escreve "quero saber o preço" em vez de clicar não pode ficar no vácuo.
    const handle = idx >= 0 && hasHandleEdge(g, nodeId!, "b" + idx) ? "b" + idx : null;
    destino = handle ? nextNodeId(g, nodeId!, handle) : saidaPadrao(g, nodeId!);
    recordNodeHit(a.id, nodeId! + (handle ? ":" + rotulos[idx] : ""), phone).catch(() => {});
    log(`🔘 resposta "${replyText.slice(0, 40)}" → ${handle ? `ramo do botão "${rotulos[idx]}"` : "saída padrão"}${destino ? ` → nó ${destino}` : " → SEM DESTINO"} · ${phone}`);
    // Casou o rótulo mas o ramo não leva a lugar nenhum (saída padrão vazia / ramo solto no canvas):
    // tenta o fallback do grafo antes de desistir. Sem isto o {{pix}} do lead sumia.
    if (!destino && idx >= 0) { const r = achaRamo(); if (r) { destino = r.next; viaFallback = true; } }
  } else {
    // node_id do pending sumiu (fluxo mudou) → tenta re-achar no grafo atual.
    const r = achaRamo();
    if (r) { destino = r.next; viaFallback = true; recordNodeHit(a.id, r.nodeId + ":" + r.rotulo, phone).catch(() => {}); }
    else log(`🔘 fluxo mudou enquanto esperava o botão e não achei "${replyText.slice(0, 30)}" no grafo atual · ${phone} — nada a retomar`);
  }
  if (viaFallback && destino) log(`🔘 ✅ FALLBACK: re-achei "${replyText.slice(0, 30)}" no grafo → nó ${destino} · ${phone}`);
  if (!destino) return;
  const next = destino;
  const fields = await camposDoContato(phone);
  // Diagnóstico do sumiço do PIX: se o próximo passo vai renderizar {{pix}} e a ficha não tem o
  // código guardado, a mensagem sairia vazia (guarda de fantasma). Log greppável por "PIX-VAZIO".
  const proxStep = getNode(g, next)?.data as Step | undefined;
  if (proxStep && "text" in proxStep && typeof (proxStep as any).text === "string" && (proxStep as any).text.includes("{{pix}}") && !fields.pix) {
    log(`🔘 ⚠️ PIX-VAZIO: nó ${next} usa {{pix}} mas a ficha de ${phone} não tem 'pix' guardado — nada a enviar`);
  }
  const nomeSalvo = await getContactName(phone);
  const ev: NormalizedEvent = {
    platform: "lite",
    event: "keyword",
    eventId: "btn-" + Date.now() + "-" + phone,
    contact: {
      phone,
      name: fields.nome || nomeSalvo || fields.primeiro_nome || phone,
      firstName: fields.primeiro_nome || nomeSalvo.split(" ")[0] || "",
    },
    raw: {},
  };
  await runFromNode(a, g, next, ev, gw, fields, log);
}

export async function resumeCapture(
  phone: string,
  replyText: string,
  gw: WhatsAppGateway,
  all: Automation[],
  pending: Pending,
  log: (m: string) => void = console.log,
): Promise<void> {
  await clearPending(phone); // limpa antes de retomar (evita reentrância se chegar outra msg)
  let value: string | null = null;
  try {
    value = await extractValue(replyText, pending.variable, pending.hint ?? undefined);
  } catch (e: any) {
    log(`extract falhou: ${e.message}`);
  }
  if (value) {
    await setContactField(phone, pending.variable, value);
    log(`🧠 capturado ${pending.variable} = "${value}" · ${phone}`);
  } else {
    log(`🧠 nada capturado p/ ${pending.variable} · ${phone}`);
  }
  // Fluxo apagado OU virado rascunho enquanto esperava a resposta → captura o valor, mas não segue.
  const a = all.find((x) => x.id === pending.automation_id && x.enabled !== false);
  if (!a) return;
  const g = toGraph(a);
  // Retoma pela ARESTA de saída do nó da pergunta (resiste a edição). Sem o nó no grafo → não retoma.
  const askNode = pending.node_id ?? null;
  if (askNode && !getNode(g, askNode)) { log(`fluxo mudou · captura salva, sem retomar · ${phone}`); return; }
  const next = askNode ? nextNodeId(g, askNode, null) : null;
  const fields = await camposDoContato(phone); // já inclui o valor recém-salvo
  const nomeSalvo = await getContactName(phone);
  const ev: NormalizedEvent = {
    platform: "lite",
    event: "keyword",
    eventId: "resume-" + Date.now() + "-" + phone,
    contact: {
      phone,
      // O nome SALVO entra na conta: sem ele o {{primeiro_nome}} dos passos seguintes saía vazio.
      name: fields.nome || nomeSalvo || fields.primeiro_nome || phone,
      firstName: fields.primeiro_nome || nomeSalvo.split(" ")[0] || "",
    },
    raw: {},
  };
  await runFromNode(a, g, next, ev, gw, fields, log);
}

// O lead respondeu numa conversa ATIVA do Agente IA → decide (responder/caminho/encerrar) e age.
// Regras (validadas no OminiFlow): turno falho NÃO consome; caminho vence encerrar; estourou os
// turnos → solta o lead pro resto do fluxo; keepAlive re-abre a conversa com turnos zerados.
// Turno do agente: tudo que sai daqui é registrado como fala da IA (selo "Agente IA" no balão).
export async function resumeAgentTurn(...args: Parameters<typeof resumeAgentTurnCru>): Promise<void> {
  return comoIa(() => resumeAgentTurnCru(...args));
}
async function resumeAgentTurnCru(
  phone: string,
  replyText: string,
  gw: WhatsAppGateway,
  all: Automation[],
  session: AgentSession,
  log: (m: string) => void = console.log,
  // id da mensagem do lead a MARCAR na resposta (vem quando ele mandou várias de uma vez)
  replyToId?: string,
  // quanto esperar antes do 1º "digitando" (Oficial: 2s após a fala; LITE: 0, a rajada já esperou)
  pensarAposMs = 0,
): Promise<void> {
  // Lead pediu pra sair (ou já estava opted-out) → nunca responde. Fecha a corrida de opt-out.
  if (await isOptedOut(phone)) {
    await clearAgentSession(phone);
    log(`🚫 agente IA: ${phone} está opted-out — sessão encerrada`);
    return;
  }
  // ⚠️ Fluxo VIRADO RASCUNHO não pode continuar conversando. Uma sessão antiga sobrevive à
  // desativação, e o lead seguia sendo atendido por um fluxo que o dono já tinha desligado —
  // inclusive com textos de despedida de uma versão que não existe mais no ar.
  const a = all.find((x) => x.id === session.automation_id && x.enabled !== false);
  const g = a ? toGraph(a) : null;
  // Acha o nó do agente pelo _id salvo (resiste a edição/reordenação).
  const agentNodeId = session.node_id ?? null;
  const node = g && agentNodeId ? getNode(g, agentNodeId) : undefined;
  const step = node?.data as Step | undefined;
  if (!a || !g || !agentNodeId || !step || step.type !== "ai_agent") {
    await clearAgentSession(phone); // o fluxo mudou/apagou enquanto conversava
    return;
  }
  const fields = await camposDoContato(phone);
  const nomeSalvo = await getContactName(phone);
  const ev: NormalizedEvent = {
    platform: "lite",
    event: "keyword",
    eventId: "agent-" + Date.now() + "-" + phone,
    contact: {
      phone,
      // O nome SALVO entra na conta: sem ele o {{primeiro_nome}} dos passos seguintes saía vazio.
      name: fields.nome || nomeSalvo || fields.primeiro_nome || phone,
      firstName: fields.primeiro_nome || nomeSalvo.split(" ")[0] || "",
    },
    // A última fala do lead segue adiante no fluxo. Importa quando o ramo deste turno leva a OUTRO
    // Agente IA (triagem → especialista): sem isto o agente seguinte abria com uma saudação
    // genérica, ignorando o que a pessoa tinha acabado de dizer — e ela percebia a troca.
    falaInicial: replyText.slice(0, 500),
    raw: {},
  };
  // Conversa encerrada → porta "encerrou"; estourou turnos → porta "não identificou / turnos".
  // Sem a porta desenhada, a saída padrão. Nunca um caminho ao acaso.
  const resumeNext = (porta: "ended" | "fallback") => runFromNode(a, g, saidaDoAgente(g, agentNodeId, porta), ev, gw, fields, log);
  const paths = step.paths.filter((p) => p.name.trim());
  const maxTurns = clampTurns(step.maxTurns);
  const turnNumber = session.turns + 1;
  const history = [...session.history, { role: "user" as const, content: replyText.slice(0, 1000) }];

  const pensando = mostrarPensando(gw, phone, pensarAposMs);
  const decision = await agentDecide({
    systemPrompt: render(step.systemPrompt, ev, fields),
    paths,
    history,
    delivered: session.delivered,
  });
  await pensando.parar();
  if (!decision) {
    // Turno falho (chave/erro): NÃO consome turno; guarda a msg do lead e espera a próxima.
    await saveAgentSession(phone, { ...session, history });
    log(`⚠️  agente IA: turno falhou (OpenAI) · ${phone} — sessão mantida`);
    return;
  }

  let assistantSaid = "";
  try {
    assistantSaid = await sendBalloons(gw, phone, decision.messages, ev, fields, replyToId);
  } catch (e: any) {
    log(`❌ agente IA (envio) falhou: ${e.message}`);
  }

  // CAMINHO vence encerrar: entrega a resposta do caminho escolhido.
  if (decision.action === "path" && decision.path) {
    const chosen = findPath(paths, decision.path);
    if (chosen) {
      await guardarDadosDoCaminho(chosen, history, fields, phone, log);
      try {
        await sleep(1200);
        await entregaCaminho(gw, phone, chosen, ev, fields, log);
      } catch (e: any) {
        log(`❌ agente IA (caminho "${chosen.name}") falhou: ${e.message}`);
      }
      recordNodeHit(a.id, agentNodeId + ":" + chosen.name, phone).catch(() => {});
      log(`🤖 agente IA: caminho "${chosen.name}" entregue · ${phone}`);
      const delivered = [...session.delivered, chosen.name];
      // Mesma regra do 1º turno: caminho COM saída desenhada → segue a linha agora.
      const temRamo = hasHandleEdge(g, agentNodeId, "p:" + chosen.name);
      if (!temRamo && step.keepAlive !== false && paths.some((p) => p.repetir || !delivered.includes(p.name))) {
        // Continua atendendo (turnos zerados); não repete caminho já entregue (salvo "pode repetir").
        await saveAgentSession(phone, {
          ...session,
          turns: 0,
          delivered,
          history: [...history, { role: "assistant", content: [assistantSaid, `(caminho entregue: ${chosen.name})`].filter(Boolean).join("\n") }],
        });
        await rearmVacuumFollowup(a, g, agentNodeId, delivered, phone);
        return;
      }
      const next = nextNodeId(g, agentNodeId, "p:" + chosen.name);
      // A CONVERSA NÃO MORRE (mesma regra do 1º turno): roda o ramo desenhado E continua atendendo.
      if (temRamo && step.keepAlive !== false) {
        await saveAgentSession(phone, {
          ...session,
          turns: 0,
          delivered,
          history: [...history, { role: "assistant", content: [assistantSaid, `(caminho entregue: ${chosen.name})`].filter(Boolean).join("\n") }],
        });
        await runFromNode(a, g, next, ev, gw, fields, log);
        return;
      }
      await clearAgentSession(phone);
      // SEGUE o ramo do caminho escolhido (handle "p:<nome>") — executa os nós daquela saída.
      // Fallback pra aresta default quando o caminho não tem nó ligado (nextNodeId cuida disso).
      await runFromNode(a, g, next, ev, gw, fields, log);
      return;
    }
  }

  if (decision.action === "end" || turnNumber >= maxTurns) {
    // Conversa acabou (ou estourou os turnos) → solta o lead pro resto do fluxo.
    await clearAgentSession(phone);
    log(`🤖 agente IA: conversa ${decision.action === "end" ? "encerrada" : "estourou turnos"} · ${phone}`);
    await resumeNext(decision.action === "end" ? "ended" : "fallback");
    return;
  }

  // Continua conversando. Se um caminho com follow-up de vácuo já foi entregue, re-arma o
  // relógio: o "sumiu?" vale a partir DESTA última mensagem (a resposta cancelou o job antigo).
  await saveAgentSession(phone, {
    ...session,
    turns: turnNumber,
    history: [...history, ...(assistantSaid ? [{ role: "assistant" as const, content: assistantSaid }] : [])],
  });
  await rearmVacuumFollowup(a, g, agentNodeId, session.delivered, phone);
}
