import { appendFileSync } from "node:fs";
import { randomUUID, createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { config } from "./config.js";
import { gateway, UazapiGateway } from "./gateway/uazapi.js";
import { MetaGateway } from "./gateway/meta.js";
import type { WhatsAppGateway } from "./gateway/types.js";
import { loadAutomations, loadSeedAutomations } from "./automations.js";
import { TERMOS_VERSAO, hashTermos, pacoteTermos } from "./termos.js";
import type { Automation } from "./engine/runner.js";
import { tokenGoogleDoWorkspace, runAutomationsFor, resumeCapture, resumeAgentTurn, resumeScheduledFlow, resumeButtonBranch, BUTTON_VAR, produtoCasa, executarPassoDoFluxo } from "./engine/runner.js";
import { toGraph, saidaPadrao, hasHandleEdge, nextNodeId } from "./engine/graph.js";
import { transcribeAudio, transcribeAudioBuf, describeImage } from "./engine/ai.js";
import { enrichAvatars, enrichAvatarsOficial, scheduleEnrich, syncLiteContacts } from "./engine/avatars.js";
import { resumeReminderCapture, REMINDER_VAR } from "./engine/reminder-capture.js";
import { isBotEcho, withEchoGuard } from "./engine/bot-echo.js";
import { loadReminders, startReminderScheduler, type Reminder } from "./engine/reminders.js";
import { startScheduleTriggerScheduler, cronValido, raioXAgendamentos } from "./engine/schedule-trigger.js";
import { rodaCodigo } from "./engine/code-sandbox.js";
import { FEATURES, featuresDoWorkspace, workspacePodeUsar } from "./features.js";
import { configAsaasDoWorkspace, testarAsaas } from "./engine/asaas.js";
import { configZapSignDoWorkspace, testarZapSign } from "./engine/zapsign.js";
import { configMetaAdsDoWorkspace, origemMetaAds, testarMetaAds, normalizaActId, insightsDiariosPorCampanha } from "./engine/meta-ads.js";
import { configResendDoWorkspace, enviarEmailResend, textoParaHtml } from "./engine/resend-email.js";
import { extraiMarcador, consomeClique, camposDoClique, registraClique, filtraCamposClique } from "./engine/clique-origem.js";
import { destinoPublicoOk, destinoResolveParaPublico } from "./lib/rede-segura.js";
import { signup, login, login2fa, logout, getSession, redeemCouponForWorkspace, grantTrialByEmail, grantPlanByEmail, registrarVendaManual, handleBillingEvent, ensureAdminSeed, salesSummary, setUserPassword, syncPaidAccess, listClients, changeOwnPassword, updateUserName, updateUserAvatar, renameWorkspace, workspaceIdByEmail, get2faStatus, setup2fa, confirm2fa, disable2fa, adminDisable2fa, deveEnviarEmail, trialLifecycleCandidates, affiliateSlugDoLead, affiliatePhoneByEmail, requestPasswordReset, MIN_LINK_ONBOARDING, resetPassword, confirmEmail, resendConfirmation, garanteAfiliado, ehProdutoZapConverte } from "./saas.js";
import { tplTrialExpiringTomorrow, tplTrialExpired, tplPaymentFailed, tplAfiliadoWelcome, tplTrialLeadWelcome, tplAfiliadoTrial30, tplClienteWelcome, tplAfiliadoVenda, tplCancelamento, tplResetSenha, tplConfirmarEmail } from "./emails.js";
import type { NormalizedEvent } from "./webhooks/canonical.js";
import { sendEmail, esc } from "./lib/mail.js";
import { toWhatsAppNumber, variante9BR } from "./lib/phone.js";
import { parseKiwify, verifyKiwifySignature } from "./webhooks/kiwify.js";
import { getFicha, salvaFicha, salvaDoc, lerDoc, apagaDoc, buscaCep, nomesManuais, aplicaNomesManuais } from "./ficha-contato.js";
import { initRecuperacao, agendaRecuperacao, encerraRecuperacao, processaRecuperacao, qrDoPix } from "./recuperacao.js";
import { resumeConversa, metricasDoPeriodo, classificaConversas, textoDoRelatorio, textoDaMsg, msDe, SemChaveIa, type MsgResumo } from "./resumos.js";
import {
  isOptIn,
  isOptOut,
  parseUazapiGroupChange,
  parseUazapiGroupMessage,
  parseUazapiMessage,
  type UazapiIncomingMessage,
} from "./webhooks/uazapi-events.js";
import { parseMetaInbound, parseMetaStatuses, parseMetaCalls, explicaErroMeta } from "./webhooks/meta-events.js";
import { enviaEventoMeta, eventoWhatsAppMeta } from "./lib/meta-capi.js";
import { handleGroupJoins, loadGroupWelcome, type GroupWelcomeConfig } from "./engine/group-welcome.js";
import {
  captureGroupMessage,
  loadGroupSummary,
  runGroupSummary,
  startGroupSummaryScheduler,
} from "./engine/group-summary.js";
import { initSchema, query, backfillTenancy, dbEnabled } from "./db.js";
import { getCached, getCachedFor, refreshConfigCache, saveConfig, saveConfigFor, startConfigRefresher, setPrimaryWorkspace, getPrimaryWorkspace , scanConfig } from "./config-store.js";
import { runWithWorkspace, getCurrentWorkspace, getCurrentInstanceToken } from "./workspace-context.js";
import { perfilDoWorkspace, salvarPerfil, estadoAdvocacia, salvarConfig as salvarConfigAdvocacia, removerConfig as removerConfigAdvocacia, extrairDados as extrairDadosContrato, gerarContrato, statusContrato } from "./advocacia.js";
import { ESPERA_RAJADA_MS, acumuloSeg, janelaRajada, falaComCitacao } from "./engine/acumulo.js";
import { marcaOrigemEnvio, origemDoEnvio, marcaAutorEnvio, autorDoEnvio, envioNossoRecente, envioEmCurso, classificaPropria, ehRespostaAutomaticaWa } from "./engine/origem-envio.js";
import { parseServiceAccount, sheetIdFromUrl, appendSheetRow, createCalendarEvent, explicaErroGoogle, googleOAuthUrl, exchangeGoogleCode, googleUserEmail, refreshGoogleAccessToken, createGoogleContact, createGoogleDoc, createSheetOAuth, appendSheetRowOAuth, createCalendarEventOAuth, convidarParaEventoOAuth, faltaEscopo, SCOPE_CONTACTS, readSheetHeaderOAuth, readSheetHeader } from "./google.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { rotaLiberada, AREAS_PERMISSAO, normalizaPermissoes, setMemberPermissions, listTeam, inviteMember, getInvite, acceptInvite, removeMember, setMemberRole, revokeInvite } from "./team.js";
import { getBoard, createStage, updateStage, deleteStage, reorderStages, moveCard, updateCard, createCard } from "./crm.js";
import { claimDueJobs, cancelOnReply, consumeJob, purgeOldJobs } from "./engine/flow-jobs.js";
import { metaPhoneInfo, verifyMetaSignature, metaListTemplates, metaCreateTemplate, metaDeleteTemplate, metaSendTemplate, metaDownloadMedia, metaSendReaction, metaNumeroSaude, metaAnalyticsDiario, metaCustoDiario, metaUploadHeaderHandle,
  metaTrocaCodePorToken,
  metaAssinaAppNaWaba,
  metaAppsAssinados,
  metaRegistraNumero,
  metaWabaDoToken,
  metaNumerosDaWaba,
  metaNumerosCru,
} from "./meta.js";
import { sugereTemplateMeta, geraFluxoIA, montaGrafo } from "./ai/claude.js";
import { metaListFlows, metaSendFlow, metaProfilePhoto, metaBusinessProfileGet, metaBusinessProfileSet, metaTemplateAnalytics, metaTemplateAnalyticsLote, metaInsightsAtivo, metaAtivaInsights } from "./meta.js";
import {
  connectLiteInstance,
  createLiteInstance,
  deleteLiteInstance,
  liteAgendaContacts,
  liteRawMessages,
  liteChats,
  liteCreateGroup,
  liteDeleteMessage,
  liteGroupParticipants,
  liteGroupPromote,
  liteGroupSetDescription,
  liteGroupSetImage,
  liteCall,
  liteInstanceOwner,
  liteInstanceStatus,
  liteMentionAll,
  liteMessageDownload,
  liteMessages,
  extrairLocal,
  textoDaLocalizacao,
  liteReact,
  liteGroupMembersComNome,
  liteGroupFicha,
  liteGroupLeave,
  liteGroupAdd,
  liteGroupMember,
  liteSend,
  liteChatRead,
  liteMessagePin,
  liteSendMedia,
  liteSetWebhook,
  liteGetWebhook,
} from "./uaz.js";
import {
  OFERTAS,
  type OfertaKey,
  SITE_URL,
  ehCheckoutKiwify,
  linksDivulgacao,
  normalizaTelefoneBR,
  novaChaveEdicao,
  paginaGerador,
  promoPorEmail,
  promoPorSlug,
  renderPromo,
  slugDoNome,
  upsertPromo,
} from "./afiliados-promo.js";
import {
  clearAgentSession,
  clearPending,
  getAgentSession,
  getContactDetail,
  getFlowStats,
  getNodeLeads,
  getFlowTotals,
  getMedia,
  getPending,
  setPending,
  getContactFields,
  setContactField,
  getRecentEvents,
  saveMedia,
  getStats,
  isDuplicate,
  liberaDedup,
  isOptedOut,
  listContacts,
  segmentOptions,
  contactsForSegment,
  recordEvent,
  setOptedOut,
  upsertContact,
  bulkImportContacts,
  bulkAddContactTags,
  updateContact,
  setContactTags,
  editContactTagsByChat,
  getContactTags,
  deleteContact,
  upsertInstance,
  lookupWorkspaceByToken,
  removeInstance,
  listWorkspaceTags,
  createWorkspaceTag,
  renameWorkspaceTag,
  deleteWorkspaceTag,
  arquivarMensagens,
  chatsDaApiOficial,
  pulsoDaContaOficial,
  lerMensagensArquivadas,
  deleteNodeHit,
  registraPedidoKiwify,
  addContactTag,
} from "./repo.js";

// Rede de segurança: nem promessa rejeitada nem exceção síncrona solta derrubam o app em
// produção (ex.: um tick do agendador não pode virar crash-loop e deixar o motor no chão).
process.on("unhandledRejection", (reason) => console.error("unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

// bodyLimit 50MB: mídia (foto/áudio/vídeo) vai em base64 no JSON — o padrão do
// Fastify é só 1MB, o que barrava fotos de celular antes de chegarem na UazAPI.
// O corpo é lido, guardado CRU e parseado ANTES do handler — então numa rota pública a checagem
// de token não protege nada: o custo de memória já foi pago quando o handler roda. 80MB × poucas
// requisições concorrentes = OOM do contêiner, e o contêiner é o de todos os clientes.
// Rota autenticada continua com o teto folgado (mídia vai em base64 no JSON: send-media, importar
// agenda, disparo com lista). A superfície ANÔNIMA — webhooks, /public/*, /auth/* — passa a ter
// teto próprio de 512KB, que é ~50× o maior payload real (o da Kiwify) — auditoria 07/09.
const LIMITE_MIDIA = 80 * 1024 * 1024;
const LIMITE_ANONIMO = { bodyLimit: 512 * 1024 };   // formulários públicos e /auth/*: payload é minúsculo
// Webhook é máquina-a-máquina e não pode quebrar por um payload maior que o previsto (evento de
// grupo com muitos participantes, vCard, lista). 2MB é folgado pro maior payload real (~2KB da
// Kiwify) e ainda corta 40× a superfície de OOM que os 80MB abriam.
const LIMITE_WEBHOOK = { bodyLimit: 2 * 1024 * 1024 };
const app = Fastify({ logger: false, bodyLimit: LIMITE_MIDIA });
// Erro que o próprio Fastify gera (JSON inválido, corpo vazio, rota sem handler…) saía como
// { error: "Bad Request" } — o painel mostra `error` e o motivo real ficava em `message`, que
// ninguém lia. Agora `error` carrega o motivo. Status e demais campos seguem iguais.
app.setErrorHandler((err: any, _req, reply) => {
  const status = Number(err?.statusCode) >= 400 ? Number(err.statusCode) : 500;
  const msg = String(err?.message || err?.error || "erro interno").slice(0, 300);
  if (status >= 500) console.error("💥 erro não tratado:", err);
  reply.code(status).send({ error: msg, statusCode: status, code: err?.code });
});

// ══ LOGS AO VIVO (lupa do super-admin) ══════════════════════════════════════
// Ring buffer em memória com os últimos console.log/warn/error do processo, id crescente pro
// painel fazer tail incremental (a tela /logs pergunta "o que veio depois do id X?" a cada 2s).
// Interceptado AQUI, antes de qualquer rota, pra pegar o boot inteiro. Não persiste de propósito:
// é tempo real pra diagnosticar ("mandei oi e não chegou — o webhook bateu? assinou? achou dono?"),
// não auditoria. Reinício do motor zera — e a primeira linha diz isso.
interface LinhaLog { id: number; ts: number; nivel: "info" | "aviso" | "erro"; texto: string }
const LOG_MAX = 2000;
const logRing: LinhaLog[] = [];
let logSeq = 0;
function guardaLog(nivel: LinhaLog["nivel"], args: unknown[]) {
  try {
    const texto = args
      .map((a) => (typeof a === "string" ? a : a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a)))
      .join(" ")
      .slice(0, 2000);
    logRing.push({ id: ++logSeq, ts: Date.now(), nivel, texto });
    if (logRing.length > LOG_MAX) logRing.splice(0, logRing.length - LOG_MAX);
  } catch { /* log nunca derruba nada */ }
}
{
  const oLog = console.log.bind(console), oWarn = console.warn.bind(console), oErr = console.error.bind(console);
  console.log = (...a: unknown[]) => { guardaLog("info", a); oLog(...a); };
  console.warn = (...a: unknown[]) => { guardaLog("aviso", a); oWarn(...a); };
  console.error = (...a: unknown[]) => { guardaLog("erro", a); oErr(...a); };
  guardaLog("info", ["motor iniciado — os logs ao vivo começam aqui (reinício zera o histórico)"]);
}
const MEDIA_PUBLIC_BASE = "https://app.seudominio.com.br";

// Guarda o corpo BRUTO (necessário para validar assinaturas HMAC das plataformas).
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as any).rawBody = body;
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});

// Arquivo do cabeçalho do template sobe como BINÁRIO CRU (ver /meta/templates/header abaixo):
// sem base64 (−25% de bytes) e, principalmente, sem virar um texto gigante dentro de um JSON,
// que era o que transformava qualquer engasgo de rede num "corpo inválido" sem explicação.
app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
// text/plain cru: é como o `sendBeacon` da página do cliente manda o clique (sem preflight de CORS).
app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => done(null, body));

// ⛑️ BLINDAGEM (defesa em profundidade): o motor é o guardião final dos dados de admin.
// O painel injeta o admin-token compartilhado em TODA chamada /admin/* — então, sozinho, ele não
// distingue um admin de um usuário de trial. Aqui exigimos que, se a requisição carregar um
// x-session-token (o painel NOVO sempre encaminha), essa sessão SEJA de admin. Assim, mesmo que o
// painel volte a ficar velho/furado, uma sessão de trial NÃO consegue ler dados de admin pelo motor.
app.addHook("preHandler", async (req, reply) => {
  const url = (req.raw.url || "").split("?")[0];
  if (!url.startsWith("/admin/")) return; // só protege as rotas de dados administrativos
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  // FAIL-CLOSED: dados de admin EXIGEM uma sessão de admin válida encaminhada pelo painel.
  // Sem x-session-token (painel velho/furado que parou de encaminhar, ou chamada só com o
  // admin-token compartilhado), REJEITA. É isso que torna o motor um backstop de verdade,
  // independente do estado do painel — mesmo painel antigo NÃO vaza dados de admin (só quebra).
  const st = req.headers["x-session-token"];
  const s = st ? await getSession(String(st)) : null;
  if (!s || s.user.role !== "admin") return reply.code(403).send({ error: "acesso restrito ao admin — sessão inválida" });
});

// `versao` = a tag do deploy (timestamp gerado pelo deploy.sh). Serve pra responder na hora
// "o código que estou vendo é o que subiu?" — sem isso, um deploy que falha no meio passa
// despercebido e a gente fica caçando bug num código que nem está no ar (aconteceu 31/07).
const BUILD_TAG = process.env.ZC_TAG || "dev";
const INICIADO_EM = new Date();
// `iniciadoEm` responde "o contêiner novo já estava de pé às HH:MM?" — sem isso, não dava pra
// saber se um agendamento perdeu o minuto por causa do deploy (teste de um cliente, 02/09).
app.get("/health", async () => ({ ok: true, service: "zapconverte-api", versao: BUILD_TAG, iniciadoEm: INICIADO_EM.toISOString(), uptimeSeg: Math.round((Date.now() - INICIADO_EM.getTime()) / 1000) }));

// ═══ INBOX DA API OFICIAL (tela "WPP Api") ═══════════════════════════════════════════════════
// Lê o NOSSO arquivo (a Meta não devolve histórico) e responde pela Cloud API.
// ⚠️ JANELA DE 24H: fora dela a Meta só aceita template aprovado — o endpoint devolve o erro dela
// tal e qual pro painel explicar, em vez de "falhou" genérico.
async function metaCredenciais(wsId: string): Promise<{ phoneNumberId: string; accessToken: string; wsId: string } | null> {
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const phoneNumberId = String(cfg?.phoneNumberId ?? "");
  const accessToken = metaSegredo(cfg, "accessToken");
  // O `wsId` VIAJA JUNTO com a credencial: quem recebe estas credenciais sabe de quem elas são e
  // arquiva no lugar certo, sem depender do contexto da requisição (ver MetaGatewayCreds.wsId).
  return phoneNumberId && accessToken ? { phoneNumberId, accessToken, wsId } : null;
}
async function respondeChatsOficial(wsId: string, reply: any, q?: any) {
  // As contas oficiais DESTE workspace. O filtro é a trava de exibição do isolamento: mesmo que
  // sobre no banco alguma linha antiga de outro cliente, ela não aparece na caixa de quem não é dono.
  const contas = contasOficiais(wsId).map((c) => "meta-" + c.phoneNumberId);
  // Rolagem infinita: a tela pede um pedaço por vez e vai emendando conforme o dono rola. O
  // banco continua devolvendo TODAS (a fusão do 9º dígito exige a lista inteira), mas só o pedaço
  // viaja pro navegador — com mil conversas, mandar tudo a cada poll de 15s era desperdício puro.
  const limite = Number(q?.limit) || 120;
  const offset = Number(q?.offset) || 0;
  const r = await chatsDaApiOficial(wsId, limite, { busca: String(q?.busca ?? ""), contas, offset, fixados: getCachedFor<string[]>(wsId, "chats-fixados:api") ?? [] });
  return reply.send({ chats: r.chats, total: r.total, temMais: r.temMais });
}
async function respondeMensagensOficial(wsId: string, chatId: string, reply: any) {
  const fone = String(chatId ?? "").replace(/\D/g, "");
  if (!fone) return reply.code(400).send({ error: "informe o telefone da conversa" });
  // A conversa pode ter ficado DIVIDIDA entre as duas formas do 9º dígito (envio antigo gravava
  // pelo número digitado; o webhook, pelo wa_id). A lista já mescla os chats — aqui as mensagens
  // das duas chaves entram juntas, em ordem, e o msg_id deduplica o que existir nos dois lados.
  const irma = variante9BR(fone);
  const [a, b] = await Promise.all([
    lerMensagensArquivadas(fone, 300, wsId),
    irma ? lerMensagensArquivadas(irma, 300, wsId) : Promise.resolve([]),
  ]);
  const vistos = new Set<string>();
  const msgs = [...a, ...b]
    .filter((m) => (vistos.has(m.msg_id) ? false : (vistos.add(m.msg_id), true)))
    // Mesmo segundo (clique do lead + resposta automática do robô, 13/10): desempata pela ordem
    // real de gravação — senão a resposta aparecia ANTES do clique que a causou.
    .sort((x, y) => Number(y.ts ?? 0) - Number(x.ts ?? 0) || Number(y.ord ?? 0) - Number(x.ord ?? 0))
    .slice(0, 300);
  return reply.send({ messages: msgs.slice().reverse() }); // do mais antigo pro mais novo (ordem de leitura)
}
async function enviaPelaOficial(wsId: string, chatId: string, texto: string, reply: any, autor?: string, respondeA?: string) {
  const fone = String(chatId ?? "").replace(/\D/g, "");
  const txt = String(texto ?? "").trim();
  if (!fone || !txt) return reply.code(400).send({ error: "informe a conversa e o texto" });
  const creds = await metaCredenciais(wsId);
  if (!creds) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  try {
    // Só ID de mensagem da Meta (wamid.*) vira citação — um ID otimista do painel quebraria o envio.
    const cita = /^wamid\./.test(String(respondeA ?? "")) ? String(respondeA) : undefined;
    const r = await new MetaGateway(creds).sendText(fone, txt, 0, cita);
    // O gateway arquiva em SEGUNDO PLANO (void) — mas o painel refetcha as mensagens assim que o
    // envio responde, e ganhava a corrida do INSERT: a mensagem só aparecia no poll de 6s depois
    // (o "delay" que o dono viu em 16/08). Arquivar AQUI com await (mesmo msg_id → o upsert
    // deduplica com o do gateway) garante que o refetch já traz a mensagem.
    if (r.id) {
      // Chave da conversa = wa_id devolvido pela Meta (ela mexe no 9º dígito BR) — arquivar pelo
      // número digitado criava um SEGUNDO chat da mesma pessoa (caso Matheus, 27/08).
      await arquivarMensagens(
        r.waId || fone,
        [{ msg_id: String(r.id), from_me: true, body: txt, msg_type: "text", ts: Math.floor(Date.now() / 1000),
           extra: { origem: "painel", ...(autor ? { autor } : {}), ...(cita ? { respondeA: cita } : {}) } }], // digitada por uma pessoa no painel (selo com o nome dela)
        "meta-" + creds.phoneNumberId, wsId,
      ).catch(() => {});
      // Humano assumiu pelo painel → a IA sai desta conversa (mesma regra do WPP ao Vivo).
      await pausarBot(r.waId || fone, { motivo: "mensagem manual pelo painel", automatica: true }).catch(() => {});
    }
    return reply.send({ ok: true, id: r.id, chatId: r.waId || fone });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Erro 131047 da Meta = fora da janela de 24h. Traduz pra linguagem de gente.
    const foraDaJanela = /131047|24 hours|re-?engagement/i.test(msg);
    return reply.code(400).send({
      error: foraDaJanela
        ? "Passaram mais de 24h desde a última mensagem desta pessoa — a Meta só permite continuar com um modelo aprovado (Templates Meta)."
        : "não consegui enviar: " + msg.slice(0, 200),
      foraDaJanela,
    });
  }
}
// Envia MÍDIA na janela de 24h: recebe dataUri do painel, hospeda no NOSSO /media (a Cloud API
// baixa por LINK público) e envia. Limites da Meta por tipo: imagem 5MB · áudio/vídeo 16MB ·
// documento 100MB (cortamos em 25MB pra não inchar o banco). O gateway arquiva o enviado.
const LIMITE_MIDIA_OFICIAL: Record<string, number> = { image: 5, audio: 16, video: 16, document: 25, sticker: 1 };
// Anexo na conversa da API Oficial. Aceita binário cru (?chatid=&mime=&caption=) ou o JSON antigo
// com dataUri — mesma razão do /media: base64 dentro de JSON esbarra no teto de 10MB do painel.
// Converte qualquer áudio (webm do Chrome, mp4 do Safari) pra OGG/Opus mono via ffmpeg. Arquivo
// temporário em vez de pipe: o mp4 do Safari guarda o índice no FIM e não dá pra ler por stdin.
async function paraOggOpus(entrada: Buffer): Promise<Buffer> {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "voz-"));
  const ent = join(dir, "in"), sai = join(dir, "out.ogg");
  try {
    await writeFile(ent, entrada);
    await new Promise<void>((ok, falha) => {
      const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", ent, "-vn", "-ac", "1", "-ar", "48000",
        "-c:a", "libopus", "-b:a", "32k", "-application", "voip", sai]);
      let err = "";
      p.stderr.on("data", (d) => { err += String(d); });
      const t = setTimeout(() => { p.kill("SIGKILL"); falha(new Error("tempo esgotado")); }, 30_000);
      p.on("error", (e) => { clearTimeout(t); falha(e); });
      p.on("close", (c) => { clearTimeout(t); c === 0 ? ok() : falha(new Error(err.trim() || "ffmpeg saiu com " + c)); });
    });
    return await readFile(sai);
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
// 🏷️ FIGURINHA: a Meta só aceita sticker WEBP 512×512 (estático até 100KB). Converte qualquer
// imagem (PNG/JPG/WEBP/GIF 1º quadro) centralizando num quadrado TRANSPARENTE — a pessoa escolhe a
// foto que quiser e o formato chato fica por nossa conta.
async function paraFigurinha(entrada: Buffer): Promise<Buffer> {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "fig-"));
  const ent = join(dir, "in"), sai = join(dir, "out.webp");
  const roda = (q: number) => new Promise<void>((ok, falha) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", ent, "-frames:v", "1",
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
      "-c:v", "libwebp", "-lossless", "0", "-quality", String(q), sai]);
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    const t = setTimeout(() => { p.kill("SIGKILL"); falha(new Error("tempo esgotado")); }, 30_000);
    p.on("error", (e) => { clearTimeout(t); falha(e); });
    p.on("close", (c) => { clearTimeout(t); c === 0 ? ok() : falha(new Error(err.trim() || "ffmpeg saiu com " + c)); });
  });
  try {
    await writeFile(ent, entrada);
    // Desce a qualidade até caber nos 100KB da Meta (foto cheia de detalhe passa do limite em 80).
    for (const q of [80, 60, 40, 25]) {
      await roda(q);
      const out = await readFile(sai);
      if (out.length <= 100 * 1024) return out;
    }
    throw new Error("a imagem ficou maior que 100KB mesmo comprimida — tente uma mais simples");
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
async function enviaMidiaPelaOficial(wsId: string, b: any, reply: any, req?: any) {
  const q = (req?.query ?? {}) as any;
  const binario = Buffer.isBuffer(req?.body);
  const fone = String((binario ? q.chatid : b?.chatid) ?? "").replace(/\D/g, "");
  if (!fone) return reply.code(400).send({ error: "informe a conversa" });
  let mime = "", corpoB64 = "";
  if (binario) {
    mime = String(q.mime ?? "").split(";")[0].trim() || "application/octet-stream";
  } else {
    const m = String(b?.dataUri ?? "").match(/^data:([^,]*?);base64,(.+)$/s);
    if (!m) return reply.code(400).send({ error: "arquivo inválido" });
    mime = m[1].split(";")[0] || "application/octet-stream";
    corpoB64 = m[2];
  }
  // ?figurinha=1 → a imagem vira sticker (convertida abaixo), seja qual for o formato de origem.
  const figurinha = String((binario ? q.figurinha : b?.figurinha) ?? "") === "1" && mime.startsWith("image/");
  const tipo = figurinha ? "sticker" : mime.startsWith("image/") ? (mime === "image/webp" ? "sticker" : "image")
    : mime.startsWith("audio/") ? "audio"
    : mime.startsWith("video/") ? "video"
    : "document";
  // A Cloud API é chata com formato: só JPEG/PNG em imagem; áudio aac/mp4/mpeg/amr/ogg; vídeo mp4/3gp.
  if (tipo === "image" && !/jpeg|png/.test(mime)) return reply.code(400).send({ error: "a API Oficial só aceita imagem JPG ou PNG" });
  if (tipo === "video" && !/mp4|3gpp?/.test(mime)) return reply.code(400).send({ error: "a API Oficial só aceita vídeo MP4" });
  // Nota de voz gravada no painel (?voz=1): o Chrome grava WEBM, que a Meta recusa. Converte pra
  // OGG/Opus mono — o formato que o WhatsApp mostra como áudio de voz (bolinha com onda).
  const voz = String((binario ? q.voz : b?.voz) ?? "") === "1" && tipo === "audio";
  let buf = binario ? (req.body as Buffer) : Buffer.from(corpoB64, "base64");
  if (!buf.length) return reply.code(400).send({ error: "arquivo vazio" });
  if (tipo === "audio" && (voz || /webm/.test(mime))) {
    try { buf = await paraOggOpus(buf); mime = "audio/ogg"; }
    catch (e: any) { return reply.code(500).send({ error: "não consegui converter o áudio: " + String(e?.message ?? e).slice(0, 160) }); }
  }
  if (tipo === "audio" && !/aac|mp4|mpeg|amr|ogg/.test(mime)) return reply.code(400).send({ error: "áudio deve ser MP3, OGG, AAC ou M4A" });
  if (figurinha) {
    try { buf = await paraFigurinha(buf); mime = "image/webp"; }
    catch (e: any) { return reply.code(400).send({ error: "não consegui fazer a figurinha: " + String(e?.message ?? e).slice(0, 160) }); }
  }
  const maxMb = LIMITE_MIDIA_OFICIAL[tipo] ?? 16;
  if (buf.length > maxMb * 1024 * 1024) return reply.code(413).send({ error: `arquivo acima de ${maxMb}MB pra ${tipo} — comprima e tente de novo` });
  const creds = await metaCredenciais(wsId);
  if (!creds) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  const id = mediaIdFor(buf, mime);
  try { await saveMedia(id, mime, buf, wsId); } catch (e: any) { return reply.code(500).send({ error: "falha ao hospedar o arquivo: " + e.message }); }
  const url = `${MEDIA_PUBLIC_BASE}/media/${id}`;
  try {
    const legenda = String((binario ? q.caption : b?.caption) ?? "").trim();
    const r = await new MetaGateway(creds).sendMedia({ to: fone, type: tipo as any, file: url, caption: legenda || undefined, voice: voz });
    // Mesma corrida do envio de texto: arquiva com await pro refetch do painel já trazer o balão.
    if (r.id) {
      await arquivarMensagens(
        r.waId || fone,
        [{ msg_id: String(r.id), from_me: true, body: url + (legenda ? "\n" + legenda : ""), msg_type: tipo, ts: Math.floor(Date.now() / 1000) }],
        "meta-" + creds.phoneNumberId, wsId,
      ).catch(() => {});
    }
    return reply.send({ ok: true, id: r.id, url });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const foraDaJanela = /131047|24 hours|re-?engagement/i.test(msg);
    return reply.code(400).send({
      error: foraDaJanela
        ? "Passaram mais de 24h desde a última mensagem desta pessoa — a Meta só permite continuar com um modelo aprovado (Templates Meta)."
        : "não consegui enviar: " + msg.slice(0, 200),
      foraDaJanela,
    });
  }
}
// 😀 Reagir a uma mensagem no WPP Api (emoji "" tira a reação). Arquiva como msg_type "reaction"
// com o alvo no extra — o painel desenha o emoji em cima do balão, igual ao WhatsApp.
async function reageNaOficial(wsId: string, b: any, reply: any) {
  const fone = String(b?.chatid ?? "").replace(/\D/g, "");
  const alvo = String(b?.mid ?? "");
  const emoji = String(b?.emoji ?? "").slice(0, 16);
  if (!fone || !/^wamid\./.test(alvo)) return reply.code(400).send({ error: "mensagem inválida pra reagir" });
  const creds = await metaCredenciais(wsId);
  if (!creds) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  try {
    const r = await metaSendReaction(creds.phoneNumberId, creds.accessToken, fone, alvo, emoji);
    await arquivarMensagens(
      r.waId || fone,
      [{ msg_id: String(r.id ?? "reac-" + Date.now()), from_me: true, body: emoji, msg_type: "reaction",
         ts: Math.floor(Date.now() / 1000), extra: { alvo, origem: "painel" } }],
      "meta-" + creds.phoneNumberId, wsId,
    ).catch(() => {});
    return reply.send({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return reply.code(400).send({ error: /131047|24 hours|re-?engagement/i.test(msg) ? "fora da janela de 24h — a Meta não deixa reagir agora" : "não consegui reagir: " + msg.slice(0, 160) });
  }
}
app.post("/admin/oficial/reagir", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reageNaOficial(getPrimaryWorkspace(), req.body ?? {}, reply);
});
app.post("/app/oficial/reagir", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reageNaOficial(ws, req.body ?? {}, reply);
});
app.get("/admin/oficial/chats", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondeChatsOficial(getPrimaryWorkspace(), reply, req.query);
});
app.get("/admin/oficial/messages", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondeMensagensOficial(getPrimaryWorkspace(), String((req.query as any)?.chatid ?? ""), reply);
});
app.post("/admin/oficial/send", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const wsAdm = getPrimaryWorkspace();
  const autor = await autorDaSessao(req);
  return runWithWorkspace(wsAdm, () => enviaPelaOficial(wsAdm, String(b?.chatid ?? ""), String(b?.text ?? ""), reply, autor, String(b?.replyTo ?? "") || undefined));
});
app.post("/admin/oficial/send-media", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return enviaMidiaPelaOficial(getPrimaryWorkspace(), req.body, reply, req);
});
// WhatsApp Flows (formulários nativos): lista os da WABA e envia um PUBLICADO numa conversa.
// Criar/editar telas continua no Gerenciador da Meta (como os templates antes do builder próprio).
async function respondeFlowsOficial(wsId: string, reply: any) {
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  if (!cfg?.wabaId || !tok) return reply.code(400).send({ error: "API Oficial não conectada (precisa do WABA ID + token)" });
  try {
    return reply.send({ flows: await metaListFlows(String(cfg.wabaId), tok) });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}
async function enviaFlowOficial(wsId: string, b: any, reply: any) {
  const fone = String(b?.chatid ?? b?.to ?? "").replace(/\D/g, "");
  const flowId = String(b?.flowId ?? "").trim();
  const cta = String(b?.cta ?? "").trim().slice(0, 30) || "Preencher";
  const texto = String(b?.texto ?? "").trim() || "Preencha o formulário abaixo:";
  const tela = String(b?.tela ?? "").trim() || undefined;
  if (fone.length < 12) return reply.code(400).send({ error: "número inválido — use DDI+DDD+número" });
  if (!flowId) return reply.code(400).send({ error: "escolha um formulário publicado" });
  const creds = await metaCredenciais(wsId);
  if (!creds) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  try {
    const r = await metaSendFlow(creds.phoneNumberId, creds.accessToken, fone, flowId, cta, texto, tela);
    void arquivarMensagens(
      r.waId || fone,
      [{ msg_id: String(r.id ?? "flow-" + Date.now()), from_me: true, body: texto + `\n[Formulário: ${cta}]`, msg_type: "text", ts: Math.floor(Date.now() / 1000) }],
      "meta-" + creds.phoneNumberId, wsId,
    ).catch(() => {});
    return reply.send({ ok: true, id: r.id });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const foraDaJanela = /131047|24 hours|re-?engagement/i.test(msg);
    return reply.code(400).send({
      error: foraDaJanela
        ? "Passaram mais de 24h desde a última mensagem desta pessoa — envie primeiro um template aprovado (pode ter botão de Flow)."
        : "não consegui enviar: " + msg.slice(0, 200),
      foraDaJanela,
    });
  }
}
app.get("/admin/oficial/flows", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondeFlowsOficial(getPrimaryWorkspace(), reply);
});
app.post("/admin/oficial/flows/enviar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return enviaFlowOficial(getPrimaryWorkspace(), req.body, reply);
});
app.get("/app/oficial/flows", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondeFlowsOficial(ws, reply);
});
app.post("/app/oficial/flows/enviar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return enviaFlowOficial(ws, req.body, reply);
});

// DETALHES da conexão oficial (pra tela Conexão): IDs (WABA/phone number), qualidade, limite de
// envio e o PERFIL comercial (foto, descrição, site…) — o "Perfil" do Gerenciador no painel.
async function respondePerfilOficial(wsId: string, reply: any) {
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "API Oficial não conectada" });
  const [saude, perfil] = await Promise.all([
    metaNumeroSaude(String(cfg.wabaId ?? ""), tok).catch(() => []),
    metaBusinessProfileGet(String(cfg.phoneNumberId), tok).catch(() => ({} as any)),
  ]);
  const s = Array.isArray(saude) ? saude[0] : null;
  return reply.send({
    wabaId: String(cfg.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId),
    telefone: s?.telefone ?? cfg.displayNumber ?? "", nome: s?.nome ?? cfg.verifiedName ?? "",
    qualidade: s?.qualidade ?? "NA",
    tier: s?.tier ?? "", // CRU — o painel formata; se vier vazio/estranho, mostra como veio (diagnóstico do "—")
    // A Meta migrou de TIER (conversas/24h) pra THROUGHPUT em contas sem restrição — sem estes
    // campos o painel só conseguia mostrar "—" e parecia defeito nosso.
    throughput: s?.throughput ?? "", statusNumero: s?.status ?? "",
    perfil,
  });
}
async function salvaPerfilOficial(wsId: string, b: any, reply: any) {
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "API Oficial não conectada" });
  const campos: any = {};
  for (const k of ["about", "address", "description", "email"]) {
    if (typeof b?.[k] === "string") campos[k] = String(b[k]).slice(0, k === "description" ? 512 : 256);
  }
  if (Array.isArray(b?.websites)) campos.websites = b.websites.map((w: any) => String(w)).filter(Boolean).slice(0, 2);
  // Foto: dataUri → Upload API (handle) → profile_picture_handle
  const dataUri = String(b?.fotoDataUri ?? "");
  if (dataUri) {
    const m = dataUri.match(/^data:([^,]*?);base64,(.+)$/s);
    if (!m || !m[1].startsWith("image/")) return reply.code(400).send({ error: "foto inválida (envie JPG ou PNG)" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 5 * 1024 * 1024) return reply.code(413).send({ error: "foto acima de 5MB" });
    try {
      campos.profile_picture_handle = await metaUploadHeaderHandle(tok, buf, m[1].split(";")[0]);
    } catch (e: any) {
      return reply.code(502).send({ error: "upload da foto falhou: " + String(e?.message ?? e) });
    }
  }
  if (!Object.keys(campos).length) return reply.code(400).send({ error: "nada pra salvar" });
  try {
    await metaBusinessProfileSet(String(cfg.phoneNumberId), tok, campos);
    fotoApiCache.delete(String(cfg.phoneNumberId)); // a bolinha pega a foto nova na próxima carga
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}
// DIAGNÓSTICO da conta oficial: o JSON CRU que a Meta devolve pros números. Serve pra responder
// "por que o limite de envio aparece vazio?" olhando o dado real em vez de adivinhar nome de campo.
// Abra no navegador logado: /api/oficial/diagnostico
async function diagnosticoOficial(wsId: string, reply: any) {
  const contas = contasOficiais(wsId);
  if (!contas.length) return reply.code(400).send({ error: "nenhuma conta oficial conectada neste workspace" });
  const out = [];
  for (const c of contas) {
    // "Conectei e não aparece conversa nenhuma": as DUAS causas de verdade são o app não estar
    // assinado na WABA (a Meta nunca bate no nosso webhook) e ninguém ter escrito ainda. O
    // diagnóstico agora responde as duas — sem isso a checagem virava adivinhação por telefone.
    const assinados = c.wabaId ? await metaAppsAssinados(c.wabaId, c.accessToken).catch(() => null) : null;
    const pulso = await pulsoDaContaOficial(wsId, c.phoneNumberId);
    out.push({
      conta: c.rotulo, wabaId: c.wabaId, phoneNumberId: c.phoneNumberId,
      numeros: c.wabaId ? await metaNumerosCru(c.wabaId, c.accessToken).catch((e: any) => ({ erro: String(e?.message ?? e) }))
                        : { erro: "esta conta não tem WABA ID salvo" },
      webhook: {
        appsAssinados: assinados,
        recebeMensagem: assinados === null ? "não deu pra checar" : assinados.length > 0,
        dica: assinados && assinados.length === 0
          ? "A WABA não tem NENHUM app assinado — a Meta não vai entregar mensagem nenhuma. Refaça a conexão (o passo que assina o app) ou assine o app na WABA."
          : undefined,
      },
      arquivo: {
        ...pulso,
        dica: pulso.recebidas === 0
          ? (pulso.enviadas > 0
              ? "Já saiu mensagem por este número, mas nunca CHEGOU nenhuma. Se alguém já escreveu pra ele, o webhook não está entregando."
              : "Nenhuma mensagem entrou nem saiu ainda. Mande uma do seu celular pro número oficial e recarregue — a conversa só aparece depois da primeira mensagem.")
          : undefined,
      },
    });
  }
  return reply.send({ contas: out });
}
app.get("/admin/oficial/diagnostico", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return diagnosticoOficial(getPrimaryWorkspace(), reply);
});
app.get("/app/oficial/diagnostico", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return diagnosticoOficial(ws, reply);
});
app.get("/admin/oficial/perfil", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondePerfilOficial(getPrimaryWorkspace(), reply);
});
app.post("/admin/oficial/perfil", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return salvaPerfilOficial(getPrimaryWorkspace(), req.body, reply);
});
app.get("/app/oficial/perfil", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondePerfilOficial(ws, reply);
});
app.post("/app/oficial/perfil", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return salvaPerfilOficial(ws, req.body, reply);
});

// Métricas da conta oficial (?dias=7|30|90). Cache de 5min por workspace: a Graph é lenta (3
// chamadas) e a Meta rate-limita — o painel pode ficar aberto atualizando sem custo.
const metricasCache = new Map<string, { at: number; data: unknown }>();
// ── PERÍODO das métricas: calendário (`de`/`ate` em AAAA-MM-DD) OU atalho (`dias` = 7/30/90) ──
// Um helper só pra as três telas (Métricas, faixa dos templates, insights de um template) lerem a
// mesma coisa do mesmo jeito. Pedido do dono (30/09): "como na Meta Ads — clico numa data e em
// outra e vira um período; dois cliques na mesma data = aquele dia".
// Dia INTEIRO em horário de Brasília: a Graph conta em UTC, então 00:00 e 23:59:59 entram com o
// -03:00 explícito, senão o "hoje" da tela começaria às 21h de ontem. A Graph aceita no máximo
// 90 dias por consulta — acima disso a janela é encostada no fim (a tela avisa).
interface PeriodoMetricas { inicio: number; fim: number; dias: number; de: string; ate: string; personalizado: boolean; cortado: boolean }
function periodoMetricas(q: any): PeriodoMetricas {
  const isoDia = /^\d{4}-\d{2}-\d{2}$/;
  const de = String(q?.de ?? "").trim(), ate = String(q?.ate ?? "").trim();
  const agora = Math.floor(Date.now() / 1000);
  const diaSp = (seg: number) => new Date(seg * 1000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (isoDia.test(de) && isoDia.test(ate)) {
    const a = Math.floor(new Date(de + "T00:00:00-03:00").getTime() / 1000);
    const b = Math.floor(new Date(ate + "T23:59:59-03:00").getTime() / 1000);
    let inicio = Math.min(a, b);
    const fim = Math.min(Math.max(a, b), agora);
    let cortado = false;
    if (fim - inicio > 90 * 86400) { inicio = fim - 90 * 86400; cortado = true; }
    return { inicio, fim, dias: Math.max(1, Math.ceil((fim - inicio) / 86400)), de: diaSp(inicio), ate: diaSp(fim), personalizado: true, cortado };
  }
  const dias = [7, 30, 90].includes(Number(q?.dias)) ? Number(q.dias) : 30;
  const inicio = agora - dias * 86400;
  return { inicio, fim: agora, dias, de: diaSp(inicio), ate: diaSp(agora), personalizado: false, cortado: false };
}

async function respondeMetricasOficial(wsId: string, q: any, reply: any) {
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  const wabaId = String(cfg?.wabaId ?? "");
  if (!wabaId || !tok) return reply.code(400).send({ error: "API Oficial não conectada (precisa do WABA ID + token)" });
  const per = periodoMetricas(q);
  const chave = wsId + ":" + per.de + ":" + per.ate;
  const cacheado = metricasCache.get(chave);
  if (cacheado && Date.now() - cacheado.at < 5 * 60_000) return reply.send(cacheado.data);
  const { inicio, fim } = per;
  // As consultas em paralelo; cada uma falha SOZINHA (ex.: conta nova sem analytics ainda).
  const [saude, volume, custo, proprio] = await Promise.all([
    metaNumeroSaude(wabaId, tok).catch((e) => ({ erro: String(e?.message ?? e) })),
    metaAnalyticsDiario(wabaId, tok, inicio, fim).catch((e) => ({ erro: String(e?.message ?? e) })),
    metaCustoDiario(wabaId, tok, inicio, fim).catch((e) => ({ erro: String(e?.message ?? e) })),
    // Contadores PRÓPRIOS (webhooks de status) — única fonte de LIDAS; começa a valer do deploy em diante.
    query<{ dia: string; enviadas: number; entregues: number; lidas: number; falhas: number }>(
      `SELECT dia::text, SUM(enviadas)::int AS enviadas, SUM(entregues)::int AS entregues,
              SUM(lidas)::int AS lidas, SUM(falhas)::int AS falhas
         FROM meta_stats WHERE workspace_id=$1 AND dia BETWEEN $2::date AND $3::date
        GROUP BY dia ORDER BY dia`,
      [wsId, per.de, per.ate],
    ).catch(() => [] as any[]),
  ]);
  const data = { dias: per.dias, inicio, fim, de: per.de, ate: per.ate, personalizado: per.personalizado, cortado: per.cortado, saude, volume, custo, proprio };
  metricasCache.set(chave, { at: Date.now(), data });
  return reply.send(data);
}
app.get("/admin/oficial/metricas", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondeMetricasOficial(getPrimaryWorkspace(), req.query, reply);
});
app.get("/app/oficial/chats", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondeChatsOficial(ws, reply, req.query);
});
app.get("/app/oficial/messages", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondeMensagensOficial(ws, String((req.query as any)?.chatid ?? ""), reply);
});
app.post("/app/oficial/send", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  const autor = await autorDaSessao(req);
  return runWithWorkspace(ws, () => enviaPelaOficial(ws, String(b?.chatid ?? ""), String(b?.text ?? ""), reply, autor, String(b?.replyTo ?? "") || undefined));
});
app.post("/app/oficial/send-media", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return enviaMidiaPelaOficial(ws, req.body, reply, req);
});
app.get("/app/oficial/metricas", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondeMetricasOficial(ws, req.query, reply);
});

// ═══ DOSSIÊ DO CONTATO (/ops) ════════════════════════════════════════════════════════════════
// "Quem é essa pessoa?" numa consulta: conta, plano/trial, compras (com UTM), comissões, se é
// afiliado, página /promo, se veio de teste grátis e o histórico de eventos. Serve pro atendimento
// (abrir a conversa já sabendo com quem fala) e pro arquivo de conversas (classificar o contato).
//
// SEGURANÇA — esta rota expõe dado de cliente, então nasce fechada e estreita:
//  • token PRÓPRIO (`OPS_TOKEN`), separado do admin-token; sem a env, a rota fica DESLIGADA (503);
//  • fora de `/admin/*` de propósito (não exige sessão), mas por isso é SÓ LEITURA — nenhuma escrita;
//  • busca EXATA por e-mail ou telefone: não lista, não faz busca parcial — quem tiver o token não
//    consegue varrer a base, precisa já saber o contato;
//  • rate-limit por token e log de cada consulta (rastro de quem foi olhado);
//  • segredos NUNCA saem (senha, 2FA, chave de edição da promo, tokens de API do cliente).
app.get("/ops/dossie", async (req, reply) => {
  const esperado = process.env.OPS_TOKEN || "";
  if (!esperado) return reply.code(503).send({ error: "dossiê desligado (defina OPS_TOKEN no deploy/.env)" });
  if (String(req.headers["x-ops-token"] ?? "") !== esperado) return reply.code(401).send({ error: "token inválido" });
  if (rateLimited("ops-dossie:" + clientIp(req), 120, 60 * 60_000)) return reply.code(429).send({ error: "muitas consultas — tente daqui a pouco" });

  const q = String((req.query as any)?.q ?? "").trim();
  if (q.length < 5) return reply.code(400).send({ error: "informe o e-mail completo ou o telefone em ?q=" });
  const email = q.includes("@") ? q.toLowerCase() : "";
  const fone = q.replace(/\D/g, "");
  if (!email && fone.length < 8) return reply.code(400).send({ error: "telefone muito curto" });
  // Casa telefone pelos últimos 8 dígitos (o 9º dígito e o DDI variam entre cadastros — ver
  // a pegadinha do JID do dono: 5511999999999 vs 5511999999999).
  const fone8 = fone.slice(-8);
  console.log(`🔎 dossiê consultado: ${email || "tel " + fone8}`);

  const busca = async <T,>(sql: string, params: any[]): Promise<T[]> => query<T>(sql, params).catch((e: any) => { console.error("dossiê:", e?.message); return [] as T[]; });

  const [conta, vendas, comissoes, afiliado, promo, leadTeste, contato, eventos] = await Promise.all([
    busca<any>(
      `SELECT u.name, u.email, u.role, u.created_at, w.id AS ws, w.name AS ws_nome, w.plan, w.status,
              w.trial_ends_at, w.paid_until, w.referred_by
         FROM users u LEFT JOIN workspaces w ON w.owner_user_id = u.id
        WHERE ($1 <> '' AND lower(u.email) = $1) LIMIT 1`, [email]),
    busca<any>(
      `SELECT order_id, created_at, plan, gross, status, affiliate_name,
              utm_source, utm_medium, utm_campaign, utm_content
         FROM sales WHERE $1 <> '' AND lower(buyer_email) = $1 ORDER BY created_at DESC LIMIT 20`, [email]),
    busca<any>(
      `SELECT c.created_at, c.amount, c.plan, c.status
         FROM commissions c JOIN affiliates a ON a.id = c.affiliate_id
        WHERE $1 <> '' AND lower(a.email) = $1 ORDER BY c.created_at DESC LIMIT 20`, [email]),
    busca<any>(
      `SELECT id, name, ref_code, commission_pct, active, created_at FROM affiliates
        WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND translate(coalesce(phone,''), '()+- .', '') LIKE '%' || $2) LIMIT 1`, [email, fone8]),
    busca<any>(
      `SELECT slug, nome, email, trial_3_dias, whats_flutuante, created_at, updated_at FROM affiliate_promo
        WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND translate(coalesce(whatsapp, telefone, ''), '()+- .', '') LIKE '%' || $2) LIMIT 1`, [email, fone8]),
    busca<any>(
      `SELECT slug, lead_nome, lead_email, lead_telefone, created_at, utm_source, utm_medium, utm_campaign, utm_content
         FROM trial_leads
        WHERE ($1 <> '' AND lower(lead_email) = $1) OR ($2 <> '' AND translate(coalesce(lead_whatsapp, lead_telefone, ''), '()+- .', '') LIKE '%' || $2)
        ORDER BY created_at DESC LIMIT 5`, [email, fone8]),
    busca<any>(
      `SELECT phone, name, email, platform, opted_out, first_seen, last_seen, workspace_id FROM contacts
        WHERE ($2 <> '' AND phone LIKE '%' || $2) OR ($1 <> '' AND lower(email) = $1) LIMIT 3`, [email, fone8]),
    busca<any>(
      `SELECT created_at, platform, event, product, amount FROM events
        WHERE $1 <> '' AND phone LIKE '%' || $1 ORDER BY created_at DESC LIMIT 15`, [fone8]),
  ]);

  const achou = !!(conta.length || vendas.length || afiliado.length || promo.length || leadTeste.length || contato.length);
  return reply.send({
    q, achou,
    // Classificação pronta (é o que o arquivo de conversas precisa saber de cara)
    e: {
      cliente_pagante: conta[0]?.status === "active" && (!conta[0]?.paid_until || new Date(conta[0].paid_until) > new Date()),
      em_teste: !!conta[0]?.trial_ends_at && new Date(conta[0].trial_ends_at) > new Date() && conta[0]?.status !== "active",
      comprador: vendas.some((v) => v.status === "paga"),
      afiliado: !!afiliado.length,
      tem_pagina_promo: !!promo.length,
      lead_de_teste: !!leadTeste.length,
      tem_conversa_whatsapp: !!contato.length,
    },
    conta: conta[0] ?? null, vendas, comissoes, afiliado: afiliado[0] ?? null,
    pagina_afiliado: promo[0] ?? null, lead_teste: leadTeste, contato, eventos,
  });
});

// URL pública do motor pro webhook da UazAPI apontar (confirmada acessível).
const UAZAPI_WEBHOOK_URL = "https://app.seudominio.com.br/webhooks/uazapi";
// Ring buffer em memória com os últimos inbounds — diagnóstico de "por que o keyword não disparou".
const recentInbound: any[] = [];
const recentKiwify: any[] = []; // últimos payloads CRUS da Kiwify (diagnóstico dos campos de afiliado)
function pushInbound(entry: any) {
  recentInbound.unshift({ at: new Date().toISOString(), ...entry });
  if (recentInbound.length > 30) recentInbound.length = 30;
}

// Serializa o processamento por telefone. O motor roda em 1 réplica (Swarm 1/1), então uma
// fila em memória por telefone garante que 2-3 mensagens seguidas do mesmo lead rodem EM ORDEM,
// cada uma lendo o estado já atualizado — mata a corrida de turnos concorrentes do Agente IA.
const phoneChains = new Map<string, Promise<unknown>>();
function serializeByPhone(phone: string, work: () => Promise<void>): void {
  const prev = phoneChains.get(phone) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(work).catch((e) => console.error("inbound:", e));
  phoneChains.set(phone, next);
  void next.finally(() => { if (phoneChains.get(phone) === next) phoneChains.delete(phone); });
}

// 🛬 DESLIGAMENTO GRACIOSO (14/10/2026): um deploy matou o fluxo do 11 ENTRE o texto "Pix gerado" e o
// passo com o código do Pix — o lead ficou sem o código. Agora, ao receber SIGTERM do Swarm, o motor
// espera as filas por telefone (onde rodam inbound, webhooks de checkout e follow-ups) esvaziarem,
// até 50 s, e só então sai. O stop_grace_period do serviço (60 s) cobre essa espera.
let desligando = false;
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.once(sinal, () => {
    if (desligando) return;
    desligando = true;
    const ini = Date.now();
    console.log(`🛬 ${sinal}: esperando ${phoneChains.size} fila(s) em andamento terminarem antes de sair…`);
    const t = setInterval(() => {
      const passou = Date.now() - ini;
      if (phoneChains.size === 0 || passou > 50_000) {
        clearInterval(t);
        console.log(phoneChains.size === 0 ? `🛬 filas vazias em ${Math.round(passou / 1000)} s — saindo` : `🛬 tempo esgotado com ${phoneChains.size} fila(s) ainda rodando — saindo`);
        process.exit(0);
      }
    }, 250);
  });
}

// Processa UMA mensagem recebida 1:1, já dentro da fila serializada por telefone.
// Ordem: opt-out/opt-in → (opted-out? para) → Agente IA → pergunta pendente → palavra-chave.
// Conversas (agente/perguntar) só valem pra TERCEIROS (!fromMe) — senão o bot conversa consigo.
// Numa conversa ativa, se o lead mandou ÁUDIO (sem texto), baixa e transcreve via Whisper.
// Áudio da API Oficial: o id da mídia é da Meta e só baixa com o token da conta. O webhook guarda
// o token por msg.id (10 min) e o transcritor usa daqui — sem pendurar segredo no objeto da mensagem.
const tokenAudioOficial = new Map<string, string>();
async function transcribeInbound(msg: UazapiIncomingMessage, body: any): Promise<string> {
  const tkOficial = msg.id ? tokenAudioOficial.get(msg.id) : undefined;
  if (tkOficial) {
    try {
      if (!msg.mediaId) return "";
      const { buf, mime } = await metaDownloadMedia(tkOficial, msg.mediaId, 20 * 1024 * 1024);
      return await transcribeAudioBuf(buf, mime);
    } catch (e: any) {
      console.error("transcribe oficial:", e?.message ?? e);
      return "";
    }
  }
  try {
    const token = String(body?.token || config.uazapi.token || "");
    if (!token || !msg.mediaId) return "";
    const dl = await liteMessageDownload(token, msg.mediaId);
    if (!dl.fileURL) return "";
    return await transcribeAudio(dl.fileURL);
  } catch (e) {
    console.error("transcribe inbound:", e);
    return "";
  }
}

// A agente ENXERGA a foto: baixa a imagem da UazAPI e manda pra visão da OpenAI. Devolve a
// descrição (com o texto que estiver escrito na imagem) ou "" se não deu.
async function descreveImagemInbound(msg: UazapiIncomingMessage, body: any): Promise<string> {
  try {
    const token = String(body?.token || config.uazapi.token || "");
    if (!token || !msg.mediaId) return "";
    const dl = await liteMessageDownload(token, msg.mediaId);
    if (!dl.fileURL) return "";
    return await describeImage(dl.fileURL);
  } catch (e) {
    console.error("visão inbound:", e);
    return "";
  }
}
const ehImagem = (msg: UazapiIncomingMessage) => /image|sticker/i.test(msg.type || "");

// Casa a palavra-chave contra a mensagem. "exact" (default): a mensagem INTEIRA é a palavra (fluxos do
// admin seguem idênticos). "contains": a palavra aparece como PALAVRA na mensagem — ex.: "guincho" casa
// "preciso de guincho", mas NÃO "guinchado" (casa por palavra, sem falso-positivo de substring). É o modo
// das Respostas automáticas do cliente, pra disparar em frases reais.
function keywordHit(keywords: string[], txt: string, mode?: string): boolean {
  if (!keywords.length) return false;
  if (mode === "contains") {
    const words = txt.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const joined = " " + words.join(" ") + " ";
    return keywords.some((k) => {
      const parts = k.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return words.includes(parts[0] ?? k);
      return joined.includes(" " + parts.join(" ") + " ");
    });
  }
  return keywords.includes(txt);
}

// gw = "canhão" de saída. Default UazAPI (LITE); o webhook da Meta passa um MetaGateway aqui,
// então toda a lógica (opt-out/agente/captura/keyword) roda idêntica pelos dois canais.
// platform rotula a ORIGEM do evento no CRM ("lite" | "meta") — a Oficial é o foco (80%).
// ═══ RAJADA: junta as mensagens que o lead manda picadas ═════════════════════════════════════
// O jeito real de escrever no WhatsApp é em pedaços ("Bom dia" · "tudo bem?" · "tô viajando").
// Processando uma a uma, a agente respondia CADA pedaço separadamente e as respostas chegavam
// atrasadas e fora de contexto (respondia "e você?" quando o lead já tinha mudado de assunto).
// Agora espera o lead terminar de escrever (silêncio de ESPERA_RAJADA) e trata tudo como UM turno.
// Espera e teto padrão da rajada (6 s / 25 s) moram em engine/acumulo.ts — a parte pura e testada.
type Rajada = {
  msgs: UazapiIncomingMessage[]; body: any; gw: WhatsAppGateway; token?: string;
  timer: ReturnType<typeof setTimeout>; inicio: number;
  // Espera/teto DESTA rajada: o padrão (6 s / 25 s) ou o que o nó do Agente IA pediu (acumularSeg).
  esperaMs: number; tetoMs: number;
  platform: string; // "lite" | "meta" — a rajada também serve a Oficial quando o nó pede acúmulo
};
const rajadas = new Map<string, Rajada>();

// (Re)arma o relógio da rajada com a janela DELA, respeitando o teto total.
function armaRajada(chave: string, wsId: string, r: Rajada): void {
  clearTimeout(r.timer);
  const restante = Math.max(0, r.tetoMs - (Date.now() - r.inicio));
  r.timer = setTimeout(() => descarregarRajada(chave, wsId), Math.min(r.esperaMs, restante));
}
// Quantos segundos o nó do Agente IA que está conversando com este lead pediu pra ACUMULAR
// (0 = não pediu / não há conversa de agente aberta). Roda dentro do contexto do workspace.
async function acumuloDoAgente(phone: string): Promise<number> {
  const sess = await getAgentSession(phone);
  if (!sess) return 0;
  const a = automacoesComAtendente().find((x) => x.id === sess.automation_id);
  const passo = (a?.steps as any[] | undefined)?.find((s) => s?.type === "ai_agent" && (!sess.node_id || s._id === sess.node_id));
  return acumuloSeg(passo?.acumularSeg);
}

// `acumular` > 0 = quem chama JÁ sabe a espera do nó (caminho da API Oficial). No LITE vem 0: a
// rajada nasce com o padrão e, em segundo plano, estica se o nó do agente pedir mais.
function juntarRajada(wsId: string, msg: UazapiIncomingMessage, body: any, gw: WhatsAppGateway, token?: string, platform = "lite", acumular = 0): void {
  // ⚠️ Mensagem NOSSA (fromMe) NUNCA entra na rajada do lead. O webhook devolve o que o próprio
  // bot enviou, e juntando tudo o lote virava "lead + resposta da Anna" com a última sendo dela —
  // aí o motor tratava o conjunto como mensagem própria e IGNORAVA o pedido do lead
  // ("Me coloca no grupo" não fez nada por causa disto).
  if (msg.fromMe) {
    serializeByPhone(wsId + ":" + msg.from, () => runWithWorkspace(wsId, () => processInbound(msg, body, gw, platform), token));
    return;
  }
  const chave = wsId + ":" + msg.from;
  const atual = rajadas.get(chave);
  if (atual) {
    atual.msgs.push(msg);
    atual.body = body; // o último corpo é o que vale pra baixar mídia (token/id)
    armaRajada(chave, wsId, atual);
    return;
  }
  const janela = janelaRajada(acumular);
  const nova: Rajada = {
    msgs: [msg], body, gw, token, platform, inicio: Date.now(), esperaMs: janela.esperaMs, tetoMs: janela.tetoMs,
    timer: setTimeout(() => descarregarRajada(chave, wsId), janela.esperaMs),
  };
  rajadas.set(chave, nova);
  // ⏳ ACÚMULO pedido pelo nó do Agente IA (LITE): consulta a sessão em segundo plano e, se o nó
  // pediu mais que o padrão, estica ESTA rajada. A consulta leva milissegundos e o padrão é 6 s,
  // então o re-arme sempre chega antes do disparo. Sem pedido do nó, nada muda.
  if (!acumular) {
    void runWithWorkspace(wsId, async () => {
      const seg = await acumuloDoAgente(msg.from).catch(() => 0);
      if (!seg || rajadas.get(chave) !== nova) return;
      const j = janelaRajada(seg);
      nova.esperaMs = j.esperaMs; nova.tetoMs = j.tetoMs;
      armaRajada(chave, wsId, nova);
      console.log(`⏳ acumulando mensagens de ${msg.from} por ${Math.round(j.esperaMs / 1000)}s de silêncio (pedido do nó do Agente IA)`);
    }, token);
  } else {
    console.log(`⏳ acumulando mensagens de ${msg.from} por ${Math.round(janela.esperaMs / 1000)}s de silêncio (pedido do nó do Agente IA · ${platform})`);
  }
  // 👀 "Digitando…" 2s depois da 1ª mensagem de quem está conversando com o Agente IA: o lead vê
  // que tem alguém do outro lado ANTES da espera da rajada + o tempo do modelo (o motor emenda o
  // resto — ver mostrarPensando no runner). Só com sessão de agente aberta: fora disso pode não
  // haver resposta nenhuma, e "digitando" sem resposta é pior que silêncio. Best-effort em
  // segundo plano — nunca segura o webhook.
  void runWithWorkspace(wsId, async () => {
    await new Promise((r) => setTimeout(r, 2000));
    // Com acúmulo longo pedido pelo nó, "digitando" aos 2 s e depois meio minuto de silêncio
    // engana o lead (parece que a resposta travou). Nesse caso quem mostra é o runner, quando o
    // modelo começa a pensar de verdade.
    if (nova.esperaMs > ESPERA_RAJADA_MS) return;
    if (!(await getAgentSession(msg.from).catch(() => null))) return;
    await gw.sendPresence(msg.from, "composing", 3000).catch(() => {});
  }, token);
}

function descarregarRajada(chave: string, wsId: string): void {
  const r = rajadas.get(chave);
  if (!r) return;
  rajadas.delete(chave);
  const soTexto = r.msgs.every((m) => !!m.text && !m.isAudio);
  // Mistura de mídia com texto → processa uma a uma (não dá pra fundir imagem+texto sem perder a
  // mídia). Só texto → vira UMA mensagem com as falas em linhas, e a agente responde tudo junto.
  const lote: UazapiIncomingMessage[] = soTexto && r.msgs.length > 1
    ? [{ ...r.msgs[r.msgs.length - 1], text: r.msgs.map((m) => m.text).join("\n"),
         // O que o AGENTE lê: cada fala com a mensagem que o lead MARCOU na frente — é o que diz
         // a qual pergunta cada "Sim"/"Não" responde. `text` segue cru (keyword compara igualdade).
         textoAgente: r.msgs.map((m) => falaComCitacao(m.text, m.citacao)).join("\n"),
         // 2+ mensagens → a resposta MARCA a última (a mais recente do assunto), pra ficar claro
         // a qual delas a agente está respondendo. Mensagem única não marca (ficaria poluído).
         replyToId: r.msgs[r.msgs.length - 1].id,
         // Guarda as falas separadas: a palavra-chave casa por igualdade EXATA, então o texto
         // junto ("Oi\nTudo bem?") nunca bateria com "oi" e o fluxo não disparava.
         partes: r.msgs.map((m) => m.text) }]
    : r.msgs.map((m) => (m.citacao && m.text ? { ...m, textoAgente: falaComCitacao(m.text, m.citacao) } : m));
  for (const m of lote) {
    serializeByPhone(chave, () => runWithWorkspace(wsId, () => processInbound(m, r.body, r.gw, r.platform), r.token));
  }
}

// 🔒 MODO TESTE (lista de números permitidos). Com a config "bot-allowlist" preenchida, o robô só
// responde a esses telefones — todo o resto é recebido e salvo normalmente, mas NÃO dispara fluxo,
// agente nem captura. Lista vazia/ausente = atende todo mundo (comportamento normal).
// Compara pelos últimos 8 dígitos: no Brasil o JID às vezes vem SEM o 9 (o número do dono é
// 5511999999999, mas ele escreve 5511999999999) — comparar string inteira erraria.
const chaveTel = (s: string) => String(s ?? "").replace(/\D/g, "").slice(-8);
// 🏠 NÚMEROS DA PRÓPRIA CONTA. Quando dois WhatsApps do mesmo workspace conversam entre si (a equipe
// no número A mandando algo pro número B do site), o B via a equipe como lead novo e o agente de IA
// começava a "atender" a própria equipe (HG, 03/10: o 98 9122-4646 mandou telefones pro 98 8872-2900
// e a IA respondeu "qual é o veículo?"). Cache de 10 min por workspace — status da UazAPI é rede.
const numerosProprios = new Map<string, { at: number; set: Set<string> }>();
async function numerosDaConta(ws: string): Promise<Set<string>> {
  const c = numerosProprios.get(ws);
  if (c && Date.now() - c.at < 10 * 60_000) return c.set;
  const set = new Set<string>();
  const toks = (getCachedFor<LiteStored[]>(ws, "lite-instances") ?? []).map((i) => i.token);
  if (ws === getPrimaryWorkspace() && config.uazapi.token) toks.push(config.uazapi.token);
  await Promise.all(toks.map(async (t) => {
    const st = await liteInstanceStatus(t).catch(() => null);
    if (st?.number) set.add(chaveTel(st.number));
  }));
  const meta = getCachedFor<any>(ws, "meta-official");
  if (meta?.displayNumber) set.add(chaveTel(String(meta.displayNumber)));
  set.delete("");
  numerosProprios.set(ws, { at: Date.now(), set });
  return set;
}

// Foto do perfil da conta oficial (Graph), com cache de 10min por número — a URL da Meta expira,
// mas rebuscar a cada abertura do seletor seria lento (a chamada extra custa ~300ms).
const fotoApiCache = new Map<string, { at: number; url: string | null }>();
// `tokenCru` = quando o chamador JÁ tem o token em mãos (contas extras, que guardam em claro na
// config "meta-extras" em vez do campo criptografado da conta principal).
async function fotoPerfilApi(meta: any, tokenCru?: string): Promise<string | undefined> {
  const pid = String(meta?.phoneNumberId ?? "");
  const tok = tokenCru || metaSegredo(meta, "accessToken");
  if (!pid || !tok) return undefined;
  const hit = fotoApiCache.get(pid);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.url ?? undefined;
  const url = await metaProfilePhoto(pid, tok);
  fotoApiCache.set(pid, { at: Date.now(), url });
  return url ?? undefined;
}

// Une bolinhas do MESMO número numa só. O número primário ("lite", do .env) e uma instância extra
// que espelhou o MESMO WhatsApp viravam DUAS bolinhas (uma offline + uma live) — sobra de reconexão
// antiga, antes do fix de 16/08 que reconecta a primária em vez de criar extra. Regra: por número,
// fica a CONECTADA (some o fantasma); contas sem número nunca se fundem. Preserva a ordem.
function unificaContasPorNumero<T extends { number?: string; connected?: boolean }>(contas: T[]): T[] {
  const porNum = new Map<string, number>(); // chaveTel → índice no resultado
  const out: T[] = [];
  for (const c of contas) {
    const k = c.number ? chaveTel(c.number) : "";
    if (!k) { out.push(c); continue; } // sem número: entra sempre (não dá pra saber se é a mesma)
    const i = porNum.get(k);
    if (i == null) { porNum.set(k, out.length); out.push(c); continue; }
    // já existe uma bolinha desse número: fica a conectada (a live vence o fantasma offline)
    if (!out[i].connected && c.connected) out[i] = c;
  }
  return out;
}
function botPodeResponder(phone: string): boolean {
  const lista = getCached<string[]>("bot-allowlist");
  if (!Array.isArray(lista) || !lista.length) return true; // sem lista → atende todo mundo
  const alvo = chaveTel(phone);
  return !!alvo && lista.some((n) => chaveTel(n) === alvo);
}

// ═══ CORTE DA IA: o dono respondeu pelo CELULAR → o bot sai da conversa ══════════════════════
// Detectado por mensagem fromMe com source "android"/"ios" (o que o motor/painel envia vem como
// "web" — confirmado ao vivo 04/08). A pausa vale POR CONVERSA, renova a cada mensagem do dono e
// expira sozinha (padrão 6h; config "bot-pausa-horas" muda). Fica no config do workspace —
// estado de operação NUNCA só em memória (regra do dono).
const PAUSA_PADRAO_HORAS = 6;
function botPausado(phone: string): boolean {
  const mapa = getCached<Record<string, string>>("bot-pausas");
  const ate = mapa?.[chaveTel(phone)];
  return !!ate && new Date(ate).getTime() > Date.now();
}
// `opts.horas`: ausente = padrão do workspace; <= 0 = "até eu retomar" (10 anos, na prática sem
// prazo); `opts.motivo` só muda o texto do log. Devolve até quando ficou pausada.
const PAUSA_SEM_PRAZO_HORAS = 87_600;
// `automatica` (padrão: verdadeiro quando não há `motivo`) = pausa disparada por um SINAL (alguém
// respondeu pelo celular, pelo WhatsApp Web, ou digitou no painel), não por um clique no botão.
async function pausarBot(phone: string, opts?: { horas?: number; motivo?: string; automatica?: boolean }): Promise<string> {
  const agora = Date.now();
  const mapa = { ...(getCached<Record<string, string>>("bot-pausas") ?? {}) };
  for (const [k, v] of Object.entries(mapa)) if (new Date(v).getTime() <= agora) delete mapa[k]; // limpa expirados
  const padrao = Number(getCached<unknown>("bot-pausa-horas")) || PAUSA_PADRAO_HORAS;
  const horas = opts?.horas == null ? padrao : opts.horas <= 0 ? PAUSA_SEM_PRAZO_HORAS : Math.min(opts.horas, PAUSA_SEM_PRAZO_HORAS);
  const ate = new Date(agora + horas * 3600_000).toISOString();
  // A pausa AUTOMÁTICA (celular) nunca ENCURTA uma pausa manual mais longa: quem pausou "até eu
  // retomar" e depois respondeu pelo celular não pode cair de volta pras 6h do padrão.
  const atual = mapa[chaveTel(phone)];
  const automatica = opts?.automatica ?? !opts?.motivo;
  const manter = automatica && atual && new Date(atual).getTime() > new Date(ate).getTime();
  mapa[chaveTel(phone)] = manter ? atual : ate;
  await saveConfig("bot-pausas", mapa);
  // Humano assumiu → follow-up automático agendado pra esse lead viraria intromissão. Cancela.
  cancelOnReply(getCurrentWorkspace(), phone)
    .then((n) => { if (n) console.log(`✋ ${n} follow-up(s) cancelado(s): dono assumiu ${phone}`); })
    .catch(() => {});
  console.log(`✋ IA pausada pra ${phone} ${horas >= PAUSA_SEM_PRAZO_HORAS ? "sem prazo" : "por " + horas + "h"} (${opts?.motivo ?? "dono respondeu pelo celular"})`);
  return mapa[chaveTel(phone)];
}

// ── ATENDENTE IA (inbound sempre ligada) ─────────────────────────────────────
// O buraco que ela tapa: hoje a IA só fala se um FLUXO disparar (palavra-chave ou 1º contato). Quem
// já falou antes e volta amanhã com "quanto custa?" não casa em nada e fica NO VÁCUO. A atendente é
// a rede embaixo de tudo: se nada mais atendeu a mensagem, ela responde.
// Não é um motor novo: vira uma automação VIRTUAL com um nó ai_agent, então reaproveita tudo que já
// é rodado e testado — sessão, transcrição de áudio, visão de imagem, pausa quando o dono assume,
// cancelamento de follow-up, opt-out. Vale igual no LITE e na API Oficial (mesmo processInbound).
const ATENDENTE_ID = "__atendente_ia__";
interface AtendenteIA {
  ativa: boolean;
  nome: string;
  systemPrompt: string;
  paths: Array<{ name: string; description: string; reply: string; midia?: string }>;
  maxTurns: number;
  keepAlive: boolean;
  canais: { lite: boolean; oficial: boolean };
  // Responder SÓ quem tem esta etiqueta (vazio = todo mundo). É o que deixa a atendente vender pros
  // leads de anúncio (etiqueta "anuncio-wpp") sem falar por cima das conversas dos ex-alunos.
  soEtiqueta: string;
  horario: { ativo: boolean; dias: number[]; inicio: string; fim: string; foraTexto: string };
}
const ATENDENTE_PADRAO: AtendenteIA = {
  ativa: false, nome: "Atendente", systemPrompt: "", paths: [], maxTurns: 8, keepAlive: true,
  canais: { lite: true, oficial: true }, soEtiqueta: "",
  horario: { ativo: false, dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00", foraTexto: "" },
};
function leAtendente(wsId?: string): AtendenteIA {
  const c = (wsId ? getCachedFor<any>(wsId, "atendente-ia") : getCached<any>("atendente-ia")) ?? {};
  return {
    ativa: !!c.ativa,
    nome: String(c.nome ?? ATENDENTE_PADRAO.nome).slice(0, 40),
    systemPrompt: String(c.systemPrompt ?? ""),
    paths: (Array.isArray(c.paths) ? c.paths : []).slice(0, 8).map((p: any) => ({
      name: String(p?.name ?? "").slice(0, 40),
      description: String(p?.description ?? "").slice(0, 400),
      reply: String(p?.reply ?? "").slice(0, 2000),
      ...(/^https?:\/\//.test(String(p?.midia ?? "").trim()) ? { midia: String(p.midia).trim().slice(0, 500) } : {}),
    })).filter((p: any) => p.name),
    maxTurns: Math.max(1, Math.min(Number(c.maxTurns) || 8, 20)),
    keepAlive: c.keepAlive !== false,
    canais: { lite: c?.canais?.lite !== false, oficial: c?.canais?.oficial !== false },
    soEtiqueta: String(c.soEtiqueta ?? "").trim().slice(0, 60),
    horario: {
      ativo: !!c?.horario?.ativo,
      dias: Array.isArray(c?.horario?.dias) ? c.horario.dias.map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6) : ATENDENTE_PADRAO.horario.dias,
      inicio: /^\d{2}:\d{2}$/.test(String(c?.horario?.inicio)) ? String(c.horario.inicio) : "09:00",
      fim: /^\d{2}:\d{2}$/.test(String(c?.horario?.fim)) ? String(c.horario.fim) : "18:00",
      foraTexto: String(c?.horario?.foraTexto ?? "").slice(0, 600),
    },
  };
}
// A automação virtual da atendente. Não fica na lista de fluxos (o dono não pode quebrar sem querer),
// mas precisa estar em `all` na hora de RETOMAR a sessão — senão o motor acha que o fluxo sumiu.
function atendenteVirtual(wsId?: string): Automation | null {
  const a = leAtendente(wsId);
  if (!a.ativa || !a.systemPrompt.trim()) return null;
  return {
    id: ATENDENTE_ID,
    name: "Atendente IA",
    trigger: "primeiro_contato",
    platforms: ["*"],
    enabled: true,
    steps: [{ _id: "atendente", type: "ai_agent", systemPrompt: a.systemPrompt, maxTurns: a.maxTurns, keepAlive: a.keepAlive, paths: a.paths }],
    edges: [{ id: "e_at", source: "trigger", target: "atendente" }],
  } as Automation;
}
// Lista que o motor usa pra RETOMAR conversa: fluxos do dono + a atendente virtual.
function automacoesComAtendente(): Automation[] {
  const v = atendenteVirtual();
  return v ? [...loadAutomations(), v] : loadAutomations();
}
// Está dentro do horário de atendimento? (fuso de Brasília — o servidor roda em UTC).
function dentroDoHorario(h: AtendenteIA["horario"]): boolean {
  if (!h.ativo) return true;
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const partes = Object.fromEntries(fmt.formatToParts(agora).map((p) => [p.type, p.value]));
  const diaIdx = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].indexOf(String(partes.weekday ?? "").toLowerCase().replace(".", "").slice(0, 3));
  if (diaIdx >= 0 && !h.dias.includes(diaIdx)) return false;
  const min = Number(partes.hour) * 60 + Number(partes.minute);
  const [hi, mi] = h.inicio.split(":").map(Number);
  const [hf, mf] = h.fim.split(":").map(Number);
  const ini = hi * 60 + mi, fim = hf * 60 + mf;
  return ini <= fim ? min >= ini && min <= fim : min >= ini || min <= fim; // vira a meia-noite
}
// Aviso de fora-de-horário no máximo 1× a cada 6h por pessoa — senão vira robô repetindo a mesma
// frase a cada mensagem de quem mandou três seguidas de madrugada.
async function avisoForaJaEnviado(phone: string): Promise<boolean> {
  const mapa = { ...(getCached<Record<string, string>>("atendente-fora-aviso") ?? {}) };
  const agora = Date.now();
  const chave = chaveTel(phone);
  const ate = mapa[chave];
  if (ate && new Date(ate).getTime() > agora) return true;
  for (const [k, v] of Object.entries(mapa)) if (new Date(v).getTime() <= agora) delete mapa[k];
  mapa[chave] = new Date(agora + 6 * 3600_000).toISOString();
  await saveConfig("atendente-fora-aviso", mapa);
  return false;
}

// 📱 NÚMERO DO FLUXO (pedido do dono, 03/10): cada fluxo pode ser amarrado a UM número da conta
// (`conta` = id da conta: "lite-xxxxxxxx", "lite" = principal do super-admin, "api" = Oficial).
// Vazio = vale pra todos os números (como sempre foi). Sem isto, a HG com 2 números teria o mesmo
// agente de reboque respondendo no número da equipe e no do site.
function contaDoInbound(platform?: string): string | null {
  if (platform === "meta") return "api";
  const tok = getCurrentInstanceToken();
  if (!tok) return null;
  return tok === config.uazapi.token ? "lite" : idDaInstancia(tok);
}
// Fluxo amarrado a um número só roda quando a mensagem chegou NESSE número. Número desconhecido
// com fluxo amarrado = não roda (falha fechada: melhor calar que responder pelo número errado).
function fluxoNoNumero(a: any, conta: string | null): boolean {
  const c = String(a?.conta ?? "").trim();
  if (!c) return true;
  return !!conta && c === conta;
}

// A mensagem é EXATAMENTE a palavra-chave de algum fluxo ativo? Usado pra deixar o lead reiniciar
// o fluxo mesmo no meio de uma conversa com a agente (só exato — "contains" daria falso positivo).
function ehPalavraChaveExata(texto: string, platform?: string): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return false;
  const conta = contaDoInbound(platform);
  return loadAutomations().some(
    (a) =>
      a.enabled !== false &&
      fluxoNoNumero(a, conta) &&
      (a.trigger === "keyword" || a.trigger === "primeiro_contato") && // mesma regra do disparo
      String(a.keyword ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).includes(t),
  );
}

// Descreve a mídia que o lead mandou, em 1ª pessoa, pra agente ter o que responder. NÃO é leitura
// de conteúdo (isso exige visão/OCR — build separado): é o suficiente pra ela reagir como gente
// ("recebi sua foto, me conta o que é") em vez de ficar muda.
function descreveMidia(msg: UazapiIncomingMessage): string {
  const t = (msg.type || "").toLowerCase();
  if (msg.isAudio) return "(mandei um áudio, mas não deu pra transcrever — me pede pra escrever)";
  if (t.includes("image")) return "(acabei de te mandar uma IMAGEM)";
  if (t.includes("sticker")) return "(mandei uma figurinha)";
  if (t.includes("video")) return "(acabei de te mandar um VÍDEO)";
  if (t.includes("document")) return "(acabei de te mandar um DOCUMENTO/arquivo)";
  if (t.includes("location")) return "(te mandei minha localização)";
  if (t.includes("contact") || t.includes("vcard")) return "(te mandei um contato)";
  return "(te mandei um anexo)";
}

// ═══ QUEM ENVIOU esta mensagem nossa? (robô · painel · celular · WhatsApp Web) ═══════════════
// Classifica cada fromMe que volta pelo webhook, grava a origem no arquivo (o painel desenha o
// selo) e PAUSA a IA quando foi uma pessoa. Pedido do dono (02/10): "se a gente interromper a
// conversa e mandar mensagem pelo celular, pelo WhatsApp Web ou manualmente pelo ZapConverte,
// automaticamente aparece lá em cima que a IA está pausada".
// O eco do webhook pode chegar ANTES de a chamada de envio devolver o id — por isso, sem registro,
// espera 5 s e confere de novo. Texto que o robô mandou (bot-echo), envio em curso, envio de mídia
// nosso recente e os 2 primeiros minutos após um restart contam como "nosso": errar pro lado de
// NÃO pausar é barato; errar pro outro lado cala o robô depois da própria fala.
async function trataMensagemPropria(msg: UazapiIncomingMessage, phone: string): Promise<void> {
  const ws = getCurrentWorkspace();
  // Saudação/ausência automática do WhatsApp Business: sai do celular mas não é gente → não pausa.
  const automaticaWa = ehRespostaAutomaticaWa(msg.text);
  const doCelular = !automaticaWa && (msg.source === "android" || msg.source === "ios");
  let origemId = msg.id ? origemDoEnvio(msg.id) : undefined;
  let suspeitaNossa = false;
  if (!doCelular && !origemId) {
    suspeitaNossa = envioEmCurso(phone)
      || (!!msg.text && isBotEcho(phone, msg.text))
      || (!msg.text && envioNossoRecente(phone, 60_000));
    await new Promise((r) => setTimeout(r, 5000));
    origemId = msg.id ? origemDoEnvio(msg.id) : undefined;
  }
  const origem = classificaPropria({ source: msg.source, origemId, suspeitaNossa, bootRecente: process.uptime() < 120, automaticaWa });
  if (origem === "android" || origem === "ios") {
    await runWithWorkspace(ws, () => pausarBot(phone));
  } else if (origem === "web") {
    // Chave de segurança por workspace: quem tem OUTRO sistema enviando pelo mesmo número (n8n,
    // painel da UazAPI) veria a IA pausar a cada envio de lá. `bot-pausa-web: false` desliga só isto.
    const ligado = await runWithWorkspace(ws, async () => getCached<unknown>("bot-pausa-web") !== false);
    if (ligado) await runWithWorkspace(ws, () => pausarBot(phone, { motivo: "dono respondeu pelo WhatsApp Web", automatica: true }));
  }
  // O arquivo é gravado em segundo plano pelo webhook; dá um respiro pra linha existir.
  if (msg.id) {
    if (doCelular) await new Promise((r) => setTimeout(r, 2000));
    await query(`UPDATE inbox_messages SET extra = extra || $3::jsonb WHERE workspace_id=$1 AND msg_id=$2`,
      [ws, msg.id, JSON.stringify(origem === "painel" && autorDoEnvio(msg.id) ? { origem, autor: autorDoEnvio(msg.id) } : { origem })]).catch(() => {});
  }
}

// Depois de um envio MANUAL pelo painel (WPP ao Vivo): marca a mensagem como "painel" e pausa a IA
// daquela conversa — direto, sem depender de inferência no webhook. Grupo não tem conversa de IA.
async function aposEnvioManual(to: string, id?: string, autor?: string): Promise<void> {
  if (id) marcaOrigemEnvio(id, "painel");
  // Quem da equipe enviou: vai pro arquivo junto da origem (selo "David" no balão). O webhook
  // costuma gravar a linha em segundos; a gravação direta aqui cobre o caso de ele já ter passado.
  if (id && autor) {
    marcaAutorEnvio(id, autor);
    const ws = getCurrentWorkspace();
    for (const ms of [4000, 15000]) {
      setTimeout(() => {
        query(`UPDATE inbox_messages SET extra = extra || $3::jsonb WHERE workspace_id=$1 AND msg_id = ANY($2)`,
          [ws, [id, id.split(":").pop() ?? id], JSON.stringify({ origem: "painel", autor })]).catch(() => {});
      }, ms);
    }
  }
  if (/@g\.us$/.test(to)) return;
  const fone = to.replace(/@.*/, "").replace(/\D/g, "");
  if (!fone) return;
  await pausarBot(fone, { motivo: "mensagem manual pelo painel", automatica: true }).catch(() => {});
}

async function processInbound(
  msg: UazapiIncomingMessage,
  body: any,
  gw: WhatsAppGateway = gateway,
  platform = "lite",
): Promise<void> {
  const phone = msg.from;
  // 🎯 ORIGEM PELA PÁGINA: a 1ª mensagem pode trazer, invisível, o código do clique no botão da
  // página (engine/clique-origem.ts). Lê, casa com o clique, grava utm_*/gclid na ficha (os fluxos
  // enxergam {{utm_source}}… e o chat mostra o selo ADS) e TIRA o código do texto antes de tudo.
  if (!msg.fromMe && !msg.isGroup && msg.text) {
    const mk = extraiMarcador(msg.text);
    if (mk) {
      msg.text = mk.texto;
      if (msg.partes) msg.partes = msg.partes.map((p) => extraiMarcador(p)?.texto ?? p);
      if (msg.textoAgente) msg.textoAgente = extraiMarcador(msg.textoAgente)?.texto ?? msg.textoAgente;
      const dados = await consomeClique(getCurrentWorkspace(), mk.codigo, phone).catch(() => null);
      if (dados) {
        const campos = camposDoClique(dados);
        for (const [k, v] of Object.entries(campos)) await setContactField(phone, k, v).catch(() => {});
        const resumo = Object.entries(campos).filter(([k]) => k.startsWith("utm_") || k === "gclid").map(([k, v]) => k.replace("utm_", "") + "=" + v.slice(0, 30)).join(" ");
        console.log(`🎯 origem pela página (${mk.codigo}): ${resumo || "sem UTM"} · ${phone}`);
      } else {
        console.log(`🎯 marcador de clique "${mk.codigo}" sem registro (expirou, já usado por outro número ou token errado) · ${phone}`);
      }
    }
  }
  // Envolve o gateway pra que TODO envio 1:1 registre o eco (raiz da supressão anti-loop da escuta).
  const gw2 = withEchoGuard(gw);
  // ✓✓ AZUL — só quando o bot VAI responder. De propósito NÃO marca tudo que chega: mensagem que o
  // bot ignora (conversa pessoal) tem que continuar NÃO LIDA no celular do dono, senão ele perde
  // mensagem de gente de verdade e quem mandou acha que foi lido e ignorado.
  const marcarLido = () => {
    if (platform === "lite" && typeof (gw as any).markRead === "function") (gw as any).markRead(phone).catch(() => {});
  };
  // ✋ CORTE DA IA: o DONO respondeu esta conversa pelo CELULAR (android/ios) → pausa o bot
  // pra ela. Enviado pela API/painel vem como "web" e NÃO pausa (senão o próprio bot se calaria).
  // Agora QUALQUER intervenção humana pausa (celular, WhatsApp Web, painel) — a classificação de
  // quem enviou mora em trataMensagemPropria. Em segundo plano: nunca segura a fila da conversa.
  if (msg.fromMe && !msg.isGroup) {
    void trataMensagemPropria(msg, phone).catch((e) => console.log("✋ falha ao classificar mensagem própria:", e?.message));
  }
  // 🆕 PRIMEIRO CONTATO: TRUE só na 1ª vez que essa pessoa aparece. Alimenta o gatilho
  // "primeiro_contato" lá embaixo — o lead que chama do nada, sem palavra-chave, cai no fluxo.
  let leadNovo = false;
  if (!msg.fromMe) {
    // Salva TODO lead que fez contato pelo canal — com ou sem fluxo. Best-effort, não trava o inbound.
    leadNovo = await upsertContact(phone, msg.name || undefined, platform).catch(() => false);
    // O lead RESPONDEU → mata os follow-ups de vácuo agendados pra ele. Mandar "vi que você sumiu"
    // pra quem acabou de falar é o pior erro possível de um follow-up.
    cancelOnReply(getCurrentWorkspace(), phone)
      .then((n) => { if (n) console.log(`⏰ ${n} follow-up(s) cancelado(s): ${phone} respondeu`); })
      .catch(() => {});
    // Foto de perfil (só LITE — a Cloud API não expõe foto): enriquecimento coalescido (debounce),
    // NÃO dispara /chat/find a cada mensagem. ⚠️ Só pro workspace PRIMÁRIO por ora: scheduleEnrich roda
    // destacado (perde o contexto ALS) e usa o token do dono — pra cliente escreveria no ws errado.
    // Enrich por-cliente (com wsId+token da instância) fica pra incremento futuro.
    if (platform === "lite" && getCurrentWorkspace() === getPrimaryWorkspace()) {
      scheduleEnrich(() => enrichAvatars({ token: config.uazapi.token, mediaBase: MEDIA_PUBLIC_BASE }));
    }
    // 🔒 Fora da lista de teste → o robô fica calado (a mensagem já foi salva no CRM acima).
    if (!botPodeResponder(phone)) {
      pushInbound({ from: phone, name: msg.name, text: (msg.text || "(mídia)").slice(0, 80), fromMe: false, blocked: "modo-teste" });
      return;
    }
    // ✋ O dono assumiu esta conversa pelo celular → o robô fica DE FORA (nem agente, nem captura,
    // nem keyword) até a pausa expirar. A mensagem já foi salva no CRM; sem ✓✓ azul de propósito —
    // quem está lendo é o dono, no ritmo dele.
    // Exceção (16/10/2026): fluxo marcado "furaPausa" cuja palavra-chave EXATA o lead mandou (ex.: a frase
    // pronta do botão "Entrar no Grupo de Avisos" da página de obrigado) roda mesmo com a pausa — é um
    // pedido explícito do lead, não conversa solta no meio do atendimento humano.
    const textoExato = String(msg.text ?? "").trim().toLowerCase();
    const furaPausa = !!textoExato && loadAutomations().some((a: any) => a.enabled !== false && a.furaPausa === true
      && a.trigger === "keyword" && fluxoNoNumero(a, contaDoInbound(platform))
      && String(a.keyword ?? "").split(",").map((w: string) => w.trim().toLowerCase()).filter(Boolean).includes(textoExato));
    if (botPausado(phone) && !furaPausa) {
      pushInbound({ from: phone, name: msg.name, text: (msg.text || "(mídia)").slice(0, 80), fromMe: false, blocked: "dono-assumiu" });
      return;
    }
    if (furaPausa && botPausado(phone)) console.log(`🔓 palavra-chave "${textoExato.slice(0, 40)}" furou a pausa da IA · ${phone}`);
    // 🏠 Mensagem vinda de OUTRO número desta mesma conta = conversa interna da equipe: nada de fluxo/IA.
    if ((await numerosDaConta(getCurrentWorkspace()).catch(() => new Set<string>())).has(chaveTel(phone))) {
      pushInbound({ from: phone, name: msg.name, text: (msg.text || "(mídia)").slice(0, 80), fromMe: false, blocked: "numero-da-conta" });
      return;
    }
    // ⚠️ PERGUNTA tem prioridade sobre a agente. Desde que a sessão passou a sobreviver ao ramo
    // desenhado ("a conversa não morre"), um nó "perguntar" dentro do ramo coexiste com a sessão —
    // e a resposta do lead É pra pergunta, não pra agente. Sem isto a captura nunca completava.
    // 🔑 A PALAVRA-CHAVE INTERROMPE a conversa. Como a sessão agora sobrevive ao ramo desenhado,
    // sem isto o "teste" cairia dentro do papo da agente e o fluxo NUNCA reiniciaria (o bloco de
    // keyword lá embaixo só roda quando não há sessão/pendência). Só corta em correspondência
    // EXATA — "contains" reiniciaria o fluxo no meio de uma frase qualquer do lead.
    // O reinício limpa conversa E pendência: as duas viram null aqui pra nenhum bloco abaixo
    // (inclusive a escuta de lembrete) agir com estado velho.
    // Também olha as falas separadas da rajada (mesma razão do bloco de palavra-chave lá embaixo).
    const reinicia = [msg.text, ...(msg.partes ?? [])].some((t) => !!t && ehPalavraChaveExata(t, platform));
    if (reinicia) { await clearAgentSession(phone); await clearPending(phone); }
    const pending = reinicia ? null : await getPending(phone);
    const sess = reinicia || pending ? null : await getAgentSession(phone);
    // Escuta de LEMBRETE tratada ANTES do opt-out: "cancelar" está nas DUAS listas, e sem isto o
    // lead que responde "cancelar" (como o prompt instrui) viraria opt-out em vez de cancelar.
    if (!sess && pending && pending.variable === REMINDER_VAR) {
      let text = msg.text;
      if (!text && msg.isAudio) {
        text = await transcribeInbound(msg, body);
        if (text) pushInbound({ from: phone, name: msg.name, text: "🎤⏰ " + text.slice(0, 66), fromMe: false, transcribed: true });
      }
      if (!text) { pushInbound({ from: phone, name: msg.name, text: "(mídia — ignorada na escuta)", fromMe: false }); return; }
      pushInbound({ from: phone, name: msg.name, text: "⏰ " + text.slice(0, 70), fromMe: false, capture: "lembrete" });
      await resumeReminderCapture(phone, text, gw2);
      return;
    }
    if (msg.text && isOptOut(msg.text)) {
      pushInbound({ from: phone, name: msg.name, text: msg.text.slice(0, 80), fromMe: false, optOut: true });
      marcarLido(); // vamos confirmar o opt-out → ✓✓ azul
      await clearAgentSession(phone);
      await clearPending(phone);
      await setOptedOut(phone, true);
      await addContactTag(phone, "Contato bloqueado", "bloqueio").catch(() => {}); // aparece no chat e em Contatos
      await gw2.sendText(phone, "Pronto! ✅ Você não vai mais receber nossas mensagens automáticas. Se mudar de ideia, é só responder *VOLTAR*.").catch((e) => console.error("opt-out send:", e?.message));
      console.log(`🚫 opt-out: ${phone}`);
      return;
    }
    if (msg.text && isOptIn(msg.text)) {
      pushInbound({ from: phone, name: msg.name, text: msg.text.slice(0, 80), fromMe: false, optIn: true });
      marcarLido(); // vamos confirmar a volta → ✓✓ azul
      await setOptedOut(phone, false);
      await gw2.sendText(phone, "Que bom te ter de volta! 🟢 Você voltou a receber nossas mensagens.").catch((e) => console.error("opt-in send:", e?.message));
      console.log(`✅ opt-in: ${phone}`);
      return;
    }
    // Já estava opted-out (de antes) → não conversa nem dispara nada.
    if (await isOptedOut(phone)) {
      pushInbound({ from: phone, name: msg.name, text: (msg.text || "(mídia)").slice(0, 80), fromMe: false, blocked: "opted-out" });
      return;
    }
    // Conversa ATIVA (agente ou pergunta) — o lembrete já foi tratado acima. Áudio → Whisper.
    if (sess || pending) {
      let text = msg.text;
      if (!text && msg.isAudio) {
        text = await transcribeInbound(msg, body);
        if (text) pushInbound({ from: phone, name: msg.name, text: "🎤 " + text.slice(0, 70), fromMe: false, transcribed: true });
      }
      // 👁️ A AGENTE ENXERGA A FOTO: manda a imagem pra visão da IA e injeta a descrição (com o
      // texto que estiver escrito nela) na conversa. Vale com E sem legenda — antes ela respondia
      // "manda a foto pra eu ver" com a foto na tela, porque só recebia a legenda.
      if (ehImagem(msg)) {
        const visto = await descreveImagemInbound(msg, body);
        if (visto) {
          text = text
            ? `${text}\n(na imagem que acabei de te mandar: ${visto})`
            : `(acabei de te mandar esta imagem: ${visto})`;
          pushInbound({ from: phone, name: msg.name, text: "👁️ " + visto.slice(0, 70), fromMe: false });
        }
      }
      // MÍDIA NÃO EMUDECE A AGENTE: documento/vídeo/figurinha (e imagem/áudio que a IA não
      // conseguiu ler) viram uma descrição que entra como fala do lead. Antes o motor dava
      // `return` e a conversa morria em silêncio — o lead mandava uma foto e ninguém respondia.
      if (!text) {
        text = descreveMidia(msg);
        pushInbound({ from: phone, name: msg.name, text, fromMe: false });
      }
      marcarLido(); // o bot vai responder agora → ✓✓ azul
      if (sess) {
        pushInbound({ from: phone, name: msg.name, text: text.slice(0, 80), fromMe: false, agentTurn: sess.turns + 1 });
        // A lista inclui a atendente virtual — sem ela, quem está conversando com a Atendente IA
        // teria a sessão descartada no turno seguinte ("o fluxo sumiu").
        // Texto puro (sem transcrição/descrição de mídia por cima) → o agente recebe a versão com as
        // mensagens marcadas na frente de cada fala.
        const falaDoLead = msg.textoAgente && text === msg.text ? msg.textoAgente : text;
        await resumeAgentTurn(phone, falaDoLead, gw2, automacoesComAtendente(), sess, console.log, msg.replyToId, platform === "meta" ? 2000 : 0);
        return;
      }
      // 🔘 Clique de BOTÃO (buttons LITE / template oficial): casa a resposta com o rótulo e segue
      // o ramo desenhado — sem IA (é comparação direta). Vem ANTES do resumeCapture: __botao__
      // não é variável de captura.
      if (pending!.variable === BUTTON_VAR) {
        pushInbound({ from: phone, name: msg.name, text: "🔘 " + text.slice(0, 70), fromMe: false });
        // Diagnóstico do clique: o WhatsApp manda resposta de botão em vários formatos e a UazAPI
        // repassa o que recebeu. Se um dia o rótulo vier num campo novo, esta linha mostra o
        // formato CRU (só quando há botão esperando — não polui o log do dia a dia).
        console.log(
          `🔘 clique recebido · tipo "${msg.type}" · texto lido: "${text.slice(0, 40)}" · ` +
          `campos do content: ${(() => { try { const c = (body as any)?.message?.content; return c && typeof c === "object" ? Object.keys(c).join(",") : typeof c; } catch { return "?"; } })()}`,
        );
        await resumeButtonBranch(phone, text, gw2, automacoesComAtendente(), pending!);
        return;
      }
      // pending aqui é NÃO-lembrete (o lembrete foi tratado antes do opt-out) → captura do nó "perguntar"
      pushInbound({ from: phone, name: msg.name, text: text.slice(0, 80), fromMe: false, capture: pending!.variable });
      await resumeCapture(phone, text, gw2, automacoesComAtendente(), pending!);
      return;
    }
  }
  // LEMBRETE ditado pelo PRÓPRIO dono (fromMe): a pendência __lembrete__ é a ÚNICA que aceita
  // mensagens suas — é você ditando o lembrete pra si mesmo (ex.: no seu próprio chat).
  // Se a mensagem for uma palavra-chave, deixa passar pro bloco de keyword (reinicia o fluxo).
  if (msg.fromMe) {
    const pend = await getPending(phone);
    if (pend && pend.variable === REMINDER_VAR) {
      const txtKw = (msg.text || "").trim().toLowerCase();
      const isKeyword =
        !!txtKw &&
        loadAutomations().some(
          (a) =>
            a.enabled !== false &&
            a.trigger === "keyword" &&
            String(a.keyword ?? "").split(",").map((w) => w.trim().toLowerCase()).includes(txtKw),
        );
      if (!isKeyword) {
        // eco de mensagem NOSSA (prompt/ajuda/confirmação voltando pelo webhook) → ignora
        if (msg.text && isBotEcho(phone, msg.text)) return;
        let text = msg.text;
        if (!text && msg.isAudio) {
          text = await transcribeInbound(msg, body);
          if (text) pushInbound({ from: phone, name: msg.name, text: "🎤⏰ " + text.slice(0, 66), fromMe: true, transcribed: true });
        }
        if (text) {
          pushInbound({ from: phone, name: msg.name, text: "⏰ " + text.slice(0, 70), fromMe: true, capture: "lembrete" });
          await resumeReminderCapture(phone, text, gw2);
        }
        return; // com ou sem texto, não cai no keyword (a escuta continua se não deu pra entender)
      }
    }
  }

  // 🛑 O QUE O DONO ESCREVE PRA UM CLIENTE NUNCA DISPARA FLUXO.
  // O `fromMe` era aceito aqui pra permitir auto-teste. Só que o WhatsApp devolve pro motor TUDO
  // que o dono envia — então escrever "bom dia" pra um cliente disparava o atendimento automático
  // DENTRO da conversa dele (aconteceu 01/08: a Anna se apresentou no meio da conversa do dono
  // com o Alan). Auto-teste agora se faz de outro número, que é como se testa de verdade.
  if (msg.fromMe) return;

  // 🎤 COMANDO POR VOZ: o áudio do lead vira TEXTO antes da palavra-chave.
  // Muito cliente não digita — manda áudio ("desbloqueia meu carro"). O gatilho de palavra-chave
  // exige texto, então esse áudio caía no vazio: nenhum fluxo disparava. (É o coração do fluxo de
  // rastreador um cliente roda no n8n, onde ele mesmo montou Whisper na mão.)
  // NÃO é automático: só transcreve quando ALGUM fluxo ativo pediu ("aceitar comando por áudio"
  // no gatilho). Transcrever todo áudio de todo lead custa dinheiro por minuto e a maioria dos
  // fluxos não precisa — quem precisa, liga; quem não ligou, nada muda.
  if (!msg.text && msg.isAudio) {
    const querVoz = loadAutomations().some(
      (a) =>
        a.enabled !== false &&
        (a.trigger === "keyword" || a.trigger === "primeiro_contato") &&
        String(a.keyword ?? "").trim() &&
        (a as any).audioComoTexto,
    );
    if (querVoz) {
      const falado = await transcribeInbound(msg, body);
      if (falado) {
        console.log(`🎤 áudio virou comando: "${falado.slice(0, 60)}" · ${phone}`);
        pushInbound({ from: phone, name: msg.name, text: "🎤 " + falado.slice(0, 70), fromMe: false, transcribed: true });
        msg = { ...msg, text: falado }; // daqui pra baixo o áudio É esse texto (keyword, 1º contato, atendente)
      }
    }
  }

  // Palavra-chave: exige TEXTO e só vale pra mensagem RECEBIDA.
  // ⚠️ O `return` por falta de texto NÃO pode vir antes do primeiro contato: muito lead abre a
  // conversa mandando ÁUDIO ou FOTO ("oi, queria saber sobre…") e ficaria sem atendimento nenhum.
  if (msg.text) {
    const txt = msg.text.trim().toLowerCase();
    // Testa o texto INTEIRO e também cada fala separada da rajada: quem manda "Oi" e logo depois
    // "Tudo bem?" tem que disparar igual a quem mandou só "Oi" (o bloco junto não casaria).
    const candidatos = [txt, ...(msg.partes ?? []).map((p) => String(p).trim().toLowerCase())].filter(Boolean);
    const contaKw = contaDoInbound(platform);
    const kw = loadAutomations().filter(
      (a) =>
        a.enabled !== false && // rascunho não dispara
        fluxoNoNumero(a, contaKw) && // fluxo amarrado a outro número não responde aqui
        // Um fluxo de PRIMEIRO CONTATO também responde por palavra-chave se tiver uma preenchida —
        // assim o mesmo atendimento serve pro lead que chega do nada E pra quem digita a palavra,
        // sem manter duas cópias do mesmo fluxo (que sempre acabam desencontradas).
        (a.trigger === "keyword" || a.trigger === "primeiro_contato") &&
        a.keyword &&
        candidatos.some((c) =>
          keywordHit(String(a.keyword).split(",").map((w) => w.trim().toLowerCase()).filter(Boolean), c, a.keywordMatch)),
    );
    pushInbound({ from: phone, name: msg.name, text: msg.text.slice(0, 80), fromMe: msg.fromMe, kwMatched: kw.length });
    if (kw.length) {
      console.log(`🔑 palavra-chave "${txt}" → ${kw.length} fluxo(s) · ${phone}${msg.fromMe ? " (self)" : ""}`);
      if (!msg.fromMe) marcarLido(); // o fluxo vai responder agora → ✓✓ azul
      // Reinício limpo: derruba conversa/pendência antigas antes de disparar.
      await clearAgentSession(phone);
      await clearPending(phone);
      const ev: NormalizedEvent = {
        platform,
        event: "keyword",
        eventId: "kw-" + Date.now() + "-" + phone,
        contact: { name: msg.name || phone, firstName: (msg.name || "").split(" ")[0] || "", phone },
        replyToId: msg.replyToId,
        // {{mensagem}} = o que a pessoa escreveu; {{mensagem_em}} = QUANDO ela mandou, em ISO.
        // O horário importa pra quem casa o lead com o clique do anúncio do outro lado: sem ele,
        // o destino usa a hora da CHEGADA, que erra se o webhook pegar fila.
        // Os DOIS canais entregam o carimbo em lugares diferentes: UazAPI em
        // `message.messageTimestamp` e a Cloud API da Meta em `entry[].changes[].value.messages[].timestamp`.
        // Sem nenhum dos dois, cai no agora (chegada) — que é o comportamento antigo.
        fields: {
          mensagem: msg.text.slice(0, 500),
          mensagem_em: new Date(
            (() => {
              const meta = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.timestamp;
              const t = Number(body?.message?.messageTimestamp ?? meta) || 0;
              return t > 1e12 ? t : t ? t * 1000 : Date.now(); // segundos ou ms
            })(),
          ).toISOString(),
        },
        raw: body,
      };
      await runAutomationsFor(ev, gw2, kw, console.log, true);
      return;
    }
  }

  // 📋 RESPOSTA DE TEMPLATE — o gatilho do DISPARO EM MASSA: o Disparador (ou um fluxo) mandou um
  // template pra esta pessoa e ela respondeu/clicou dentro de 7 dias → o funil do disparo assume.
  // Vem ANTES do 1º contato e da Atendente (quem recebeu um disparo tem funil próprio esperando) e
  // é UM TIRO SÓ: depois de disparar, a marca é consumida — as próximas mensagens seguem o rumo
  // normal (sessão do agente, atendente etc.), senão cada "ok" re-disparava o funil do zero.
  if (!msg.fromMe && (msg.text || "").trim()) {
    const tflows = loadAutomations().filter((a) => a.enabled !== false && a.trigger === "template_reply" && fluxoNoNumero(a, contaDoInbound(platform)));
    if (tflows.length) {
      const fCampos = await getContactFields(phone);
      const ultimoTpl = String(fCampos.ultimo_template ?? "");
      const enviadoEm = Number(fCampos.ultimo_template_em ?? 0);
      if (ultimoTpl && Date.now() / 1000 - enviadoEm < 7 * 86400) {
        // `templateName` aceita UMA LISTA separada por vírgula: um fluxo só de botões pode servir vários
        // templates (Pix, carrinho, compra aprovada do workshop) sem engolir resposta de template alheio.
        const alvo = tflows.filter((a: any) => {
          const lista = String(a.templateName ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
          return !lista.length || lista.includes(ultimoTpl);
        });
        if (alvo.length) {
          const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
          const botao = ((alvo[0] as any).botoesGatilho ?? []).find((b: string) => norm(b) === norm(msg.text!)) ?? "";
          console.log(`📋 resposta de template "${ultimoTpl}" → ${alvo.length} fluxo(s)${botao ? ` · botão "${botao}"` : ""} · ${phone}`);
          marcarLido();
          await clearAgentSession(phone);
          await clearPending(phone);
          await setContactField(phone, "ultimo_template", "").catch(() => {}); // consome a marca
          const ev: NormalizedEvent = {
            platform,
            event: "template_reply",
            eventId: "tpl-" + Date.now() + "-" + phone,
            contact: { name: msg.name || phone, firstName: (msg.name || "").split(" ")[0] || "", phone },
            replyToId: msg.replyToId,
            fields: { mensagem: msg.text!.slice(0, 500), ...(botao ? { botao } : {}) },
            falaInicial: msg.text!.slice(0, 500),
            raw: body,
          };
          await runAutomationsFor(ev, gw2, alvo, console.log, true);
          return;
        }
      }
    }
  }

  // 🆕 PRIMEIRO CONTATO: o lead chamou do nada (sem palavra-chave) e é a PRIMEIRA vez dele aqui.
  // Só entra se nenhuma palavra-chave casou (senão o mesmo "oi" dispararia dois fluxos) e nunca
  // pro próprio dono (fromMe). É o gatilho de atendimento: quem chega no WhatsApp é recebido.
  if (leadNovo && !msg.fromMe) {
    const primeiros = loadAutomations().filter((a) => a.enabled !== false && a.trigger === "primeiro_contato" && fluxoNoNumero(a, contaDoInbound(platform)));
    if (primeiros.length) {
      console.log(`🆕 primeiro contato → ${primeiros.length} fluxo(s) · ${phone}`);
      marcarLido();
      const ev: NormalizedEvent = {
        platform,
        event: "primeiro_contato",
        eventId: "pc-" + Date.now() + "-" + phone,
        contact: { name: msg.name || phone, firstName: (msg.name || "").split(" ")[0] || "", phone },
        replyToId: msg.replyToId,
        // A fala que abriu a conversa entra como 1º turno do agente — igual ao gatilho por
        // palavra-chave e à atendente IA. Sem isto o fluxo de 1º contato abria com um "oi"
        // genérico POR CIMA do que a pessoa acabou de escrever, e ela tinha que repetir tudo.
        falaInicial: (msg.text || descreveMidia(msg)).slice(0, 500),
        raw: body,
      };
      await runAutomationsFor(ev, gw2, primeiros, console.log, true);
      return; // fluxo de 1º contato atendeu — a atendente não fala por cima
    }
  }

  // 🤖 ATENDENTE IA — a REDE EMBAIXO DE TUDO. Só chega aqui quem não casou em palavra-chave, não
  // tinha conversa/pergunta aberta e não tem fluxo de 1º contato. Antes disso, essa mensagem
  // simplesmente ficava sem resposta (o caso do lead que volta dias depois).
  if (!msg.fromMe) {
    const cfg = leAtendente();
    const canalOk = platform === "meta" ? cfg.canais.oficial : cfg.canais.lite;
    const virtual = atendenteVirtual();
    // Etiqueta-portão: configurada, a atendente SÓ fala com quem a tem (as duas formas do 9º dígito
    // já são cobertas por getContactTags). Sem a etiqueta, silêncio — o lead comum fica pro humano.
    const etiquetaOk = !cfg.soEtiqueta
      || (await getContactTags(phone)).some((tg) => tg.toLowerCase() === cfg.soEtiqueta.toLowerCase());
    if (virtual && canalOk && etiquetaOk) {
      if (!dentroDoHorario(cfg.horario)) {
        // Fora do expediente: responde uma vez (se o dono escreveu o recado) e NÃO abre conversa —
        // atendente que promete atender 3h da manhã e some é pior que silêncio.
        if (cfg.horario.foraTexto.trim() && !(await avisoForaJaEnviado(phone))) {
          marcarLido();
          await gw2.sendText(phone, cfg.horario.foraTexto).catch((e) => console.error("atendente fora-horário:", e?.message));
          pushInbound({ from: phone, name: msg.name, text: "(fora do horário — recado enviado)", fromMe: false });
        }
        return;
      }
      console.log(`🤖 atendente IA respondendo ${phone} (${platform})`);
      marcarLido();
      const ev: NormalizedEvent = {
        platform,
        event: "primeiro_contato",
        eventId: "at-" + Date.now() + "-" + phone,
        contact: { name: msg.name || phone, firstName: (msg.name || "").split(" ")[0] || "", phone },
        replyToId: msg.replyToId,
        // A fala que abriu a conversa entra como 1º turno do agente (ver falaInicial em canonical.ts).
        falaInicial: (msg.text || descreveMidia(msg)).slice(0, 500),
        raw: body,
      };
      await runAutomationsFor(ev, gw2, [virtual], console.log, true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SUPERFÍCIE DO CLIENTE (/app/*) — multi-tenant Fase 5.
//
// Autentica SÓ pela sessão (x-session-token) — NUNCA pelo admin-token. Resolve o workspace do CHAMADOR
// a partir da sessão (server-side, jamais de header/body do cliente) e embrulha o handler em
// runWithWorkspace → todo getCached/repo lá dentro cai no ws do cliente. Fail-closed: sem sessão/ws/pago
// → erro, nunca cai no primário. Os handlers /admin/* continuam intactos (zero risco pro dono).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Sessão resolvida UMA vez por request (o preHandler de papéis e os handlers reusam).
async function sessionOf(req: any) {
  if (req.__zcSession !== undefined) return req.__zcSession;
  const st = req.headers["x-session-token"];
  req.__zcSession = st ? await getSession(String(st)) : null;
  return req.__zcSession;
}

// Resolve o workspace do cliente pela sessão. Manda o erro e devolve null se não puder atender.
async function clientWs(req: any, reply: any): Promise<string | null> {
  const s = await sessionOf(req);
  if (!s) { reply.code(401).send({ error: "não autenticado" }); return null; }
  if (s.paywall) { reply.code(402).send({ error: "seu período de teste acabou — assine um plano" }); return null; }
  if (!s.workspace?.id) { reply.code(401).send({ error: "conta sem workspace" }); return null; }
  return s.workspace.id;
}
// Sessão completa do cliente (user + workspace) — pras Configurações (perfil/senha/workspace/plano).
async function clientSession(req: any, reply: any) {
  const s = await sessionOf(req);
  if (!s) { reply.code(401).send({ error: "não autenticado" }); return null; }
  return s;
}

// ⛑️ PERMISSÕES DA EQUIPE (defesa em profundidade, num só lugar): em vez de confiar que cada
// endpoint lembre de checar o papel, um preHandler barra as rotas sensíveis por papel. Assim um
// endpoint novo nasce restrito se entrar nos padrões abaixo — não dá pra esquecer.
//  • dono      → tudo
//  • admin     → tudo operacional (fluxos, números, tags, IA, equipe); billing é do dono
//  • atendente → só atendimento: inbox, contatos, ver fluxos, e o PRÓPRIO perfil/senha/2FA
const DONO_ONLY = [/^\/app\/me\/workspace$/]; // renomear o negócio = dono
const NAO_ATENDENTE = [
  /^\/app\/automations$/,            // PUT (salvar fluxos) — o GET é liberado abaixo
  /^\/app\/automations\//,
  /^\/app\/flow-webhook-token$/,     // trocar o token invalida a URL em uso — só o POST cai aqui (GET é leitura)
  /^\/app\/flow-webhook-fire$/,      // "enviar de verdade": manda WhatsApp mesmo, pelo número do workspace
  /^\/app\/flow-webhook-secret$/,    // REMOVER o token da Kiwify desliga a proteção contra venda forjada
  /^\/app\/asaas\//,                 // chave de API do Asaas: salvar/remover/testar é do dono/admin
  /^\/app\/zapsign\//,               // token da ZapSign: idem
  /^\/app\/resend\//,                // chave da Resend (e-mail dos fluxos): idem
  /^\/app\/flow-webhook-example$/,   // grava no registro do fluxo — e fluxo é escrita de dono/admin
  // /app/oficial/*: o atendente PRECISA de send e send-media (é o trabalho dele no inbox), mas
  // não de disparar campanha em massa nem de reescrever o perfil público da conta oficial.
  /^\/app\/oficial\/disparo/,        // campanha em massa pelo número do workspace
  /^\/app\/oficial\/perfil$/,        // muda o que o cliente vê no perfil do WhatsApp da empresa
  /^\/app\/oficial\/flows\/enviar$/, // dispara formulário (Flow) da Meta
  /^\/app\/flow-history\//,          // restaurar versão reescreve o fluxo (GET do histórico é leitura, passa)
  // /app/afiliado/* fica FORA desta lista de propósito: a página de afiliado é PESSOAL (cruzada
  // pelo e-mail do usuário logado, não do workspace) — atendente mexe na própria, não na do dono.
  /^\/app\/lite\//,                  // conectar/remover número
  /^\/app\/ai\/key/,                 // chave OpenAI
  /^\/app\/advocacia\/config/,       // endereço + token da API de contratos (perfil advocacia)
  /^\/app\/google\//,                // conectores Google (credencial da conta de serviço)
  /^\/app\/meta(\/|$)/,              // conexão da API Oficial (credenciais Meta)
  /^\/app\/reminders$/,               // agendar mensagem (dispara pelo número do workspace)
  /^\/app\/inbox\/mention-all$/,      // marcar TODOS de um grupo
  /^\/app\/tags\/(create|rename|delete)$/,
  /^\/app\/team(\/|$)/,              // gerenciar equipe
  /^\/app\/me\/workspace$/,
  /^\/app\/crm\/stage/,              // COLUNAS do board são do dono/admin…
];
// …mas mover card e editar a ficha É o trabalho do atendente (fica fora da lista acima de propósito).
app.addHook("preHandler", async (req, reply) => {
  const url = (req.raw.url || "").split("?")[0];
  if (!url.startsWith("/app/")) return;
  const s = await sessionOf(req);
  if (!s) return; // o handler devolve o 401 (mantém a mensagem/rota de erro atual)
  const role = s.user.wsRole;
  if (role === "dono") return;
  const method = String(req.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  if (DONO_ONLY.some((re) => re.test(url)))
    return reply.code(403).send({ error: "só o dono da conta pode fazer isso" });
  // Leitura é liberada pra todos os papéis; a restrição do atendente é sobre ESCRITA.
  if (role === "atendente" && !isRead && NAO_ATENDENTE.some((re) => re.test(url)))
    return reply.code(403).send({ error: "seu acesso é de atendente — fale com o dono da conta pra liberar" });
  // PERMISSÕES FINAS: o dono escolheu, pessoa a pessoa, quais páginas ela abre. Vale pra LEITURA
  // também — esconder a página no menu não é controle de acesso; quem digita a URL bate aqui.
  if (!rotaLiberada(url, s.user.permissoes ?? null))
    return reply.code(403).send({ error: "seu acesso não inclui esta área — fale com o dono da conta" });
});

// ── Configurações do cliente (perfil / senha / workspace / plano) ────────────────────────────────
app.get("/app/me", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  return reply.send({ user: s.user, workspace: s.workspace, paywall: s.paywall });
});
// Tour de boas-vindas POR USUÁRIO, no servidor (não no navegador): membro novo no MESMO computador
// do dono vê o tour dele; quem pulou nunca mais vê — em qualquer aparelho.
app.get("/app/me/tour", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const key = String((req.query as any)?.key ?? "").slice(0, 60);
  try {
    const rows = await query<{ tours_seen: string }>("SELECT tours_seen FROM users WHERE id=$1", [s.user.id]);
    const vistos = String(rows[0]?.tours_seen ?? "").split(",").filter(Boolean);
    return reply.send({ seen: !!key && vistos.includes(key) });
  } catch (e: any) {
    console.error("tour: falha ao ler:", e?.message);
    return reply.send({ seen: false }); // não trava o painel; o localStorage segura o "já viu"
  }
});
app.post("/app/me/tour", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const TOURS_CONHECIDOS = ["zc-tour-v1", "zc-client-tour-v1"];
  const key = String((req.body as any)?.key ?? "").trim();
  if (!TOURS_CONHECIDOS.includes(key)) return reply.code(400).send({ error: "tour desconhecido" });
  try {
    // `$2 = ANY(...)` em vez de `@> ARRAY[$2]`: a construção anterior podia falhar por tipo
    // polimórfico, e como o painel engolia o erro o "Pular" nunca persistia.
    await query(
      `UPDATE users SET tours_seen = CASE
         WHEN tours_seen = '' THEN $2::text
         WHEN $2::text = ANY(string_to_array(tours_seen, ',')) THEN tours_seen
         ELSE tours_seen || ',' || $2::text END
       WHERE id=$1`,
      [s.user.id, key],
    );
  } catch (e: any) {
    console.error("tour: falha ao marcar como visto:", e?.message);
    return reply.code(500).send({ error: "não consegui salvar" });
  }
  return reply.send({ ok: true });
});
app.put("/app/me/profile", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const name = String((req.body as any)?.name ?? "").trim();
  if (!name) return reply.code(400).send({ error: "informe um nome" });
  await updateUserName(s.user.id, name);
  return reply.send({ ok: true, name });
});
app.post("/app/me/password", LIMITE_ANONIMO, async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const b = req.body as any;
  // Trava de força-bruta na senha ATUAL. Quem rouba uma sessão ainda não sabe a senha; sem esta
  // trava dava pra adivinhá-la aqui à vontade e, acertando, trocar a senha e expulsar o dono.
  // Conta só a FALHA (countOnly na consulta), então o bloqueio não se renova com o tráfego.
  const chaveRl = "pwchange:" + rlKeyFor(s.user.id);
  if (rateLimited(chaveRl, 5, 15 * 60_000, true)) {
    return reply.code(429).send({ error: "muitas tentativas — espere 15 minutos e tente de novo" });
  }
  // keepToken: trocar a senha revoga as OUTRAS sessões (expulsa invasor) e mantém esta.
  const r = await changeOwnPassword(s.user.email, String(b?.current ?? ""), String(b?.next ?? ""), String(req.headers["x-session-token"] ?? ""));
  if ("error" in r) {
    rateNote(chaveRl, 15 * 60_000);
    return reply.code(400).send(r);
  }
  return reply.send({ ok: true });
});
app.put("/app/me/workspace", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const name = String((req.body as any)?.name ?? "").trim();
  if (!name) return reply.code(400).send({ error: "informe um nome" });
  if (s.workspace?.id) await renameWorkspace(s.workspace.id, name);
  return reply.send({ ok: true, name });
});
// Foto do usuário (Perfil). Recebe dataUri (imagem), hospeda no /media (id por hash) e grava a URL.
// dataUri vazio = remove a foto. Vale pros dois papéis (deriva o user DA SESSÃO).
app.post("/app/me/photo", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const dataUri = String((req.body as any)?.dataUri ?? "");
  if (!dataUri) { await updateUserAvatar(s.user.id, null); return reply.send({ ok: true, url: null }); }
  const m = dataUri.match(/^data:([^,]*?);base64,(.+)$/s);
  if (!m) return reply.code(400).send({ error: "imagem inválida" });
  const mime = m[1].split(";")[0] || "";
  if (!mime.startsWith("image/")) return reply.code(400).send({ error: "envie uma imagem (PNG, JPG ou WEBP)" });
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) return reply.code(400).send({ error: "imagem vazia" });
  if (buf.length > 5 * 1024 * 1024) return reply.code(413).send({ error: "imagem acima de 5MB — comprima e tente de novo" });
  const id = mediaIdFor(buf, mime);
  // wsId EXPLÍCITO: sem ele o saveMedia caía no workspace PRIMÁRIO (do admin) — a foto do cliente
  // ia parar na conta do dono (auditoria 06/08).
  try { await saveMedia(id, mime, buf, s.workspace.id); } catch (e: any) { return reply.code(500).send({ error: "falha ao hospedar: " + e.message }); }
  const url = `${MEDIA_PUBLIC_BASE}/media/${id}`;
  await updateUserAvatar(s.user.id, url);
  return reply.send({ ok: true, url });
});

// ⏰ AGENDADOR DE FOLLOW-UP: a cada 30s pega os fluxos cujo "Esperar" longo venceu e continua de onde
// pararam. Cada job roda no SEU workspace (runWithWorkspace) e responde pela instância que originou a
// conversa — cliente com 2 números não tem o follow-up saindo pelo número errado.
function startFollowupScheduler(): void {
  let rodando = false;
  const tick = async () => {
    if (rodando) return; // tick anterior ainda trabalhando → pula (não empilha)
    rodando = true;
    try {
      const jobs = await claimDueJobs(25);
      for (const j of jobs) {
        // O envio usa o número DA CONVERSA; sem token guardado, resolve pela conta do WORKSPACE.
        // Antes caía no `gateway` global — ou seja, no número do dono da plataforma (vazamento).
        const gwJob = j.instance_token && j.instance_token !== config.uazapi.token
          ? withEchoGuard(new UazapiGateway(config.uazapi.url, j.instance_token))
          : gatewayDoWorkspace(j.workspace_id);
        // Serializa por telefone: se o lead estiver falando agora, o follow-up entra na fila (não atropela).
        serializeByPhone(j.workspace_id + ":" + j.phone, () =>
          runWithWorkspace(j.workspace_id, async () => {
            try {
              // Consumo final: se o lead respondeu enquanto o job esperava a vez na fila,
              // o cancelOnReply já o cancelou — aqui a gente percebe e NÃO dispara.
              if (desligando) return; // motor saindo: o job fica pendente e o contêiner novo pega
              if (!(await consumeJob(j.id))) return;
              if (!gwJob) { console.error(`🚫 follow-up ${j.id}: workspace ${j.workspace_id} sem número conectado — NÃO enviei`); return; }
              // ✋ IA PAUSADA nesta conversa (botão do chat ou humano assumiu): nenhum passo
              // automático sai — nem o follow-up que não se cancela com resposta (ex.: lembrete).
              // Antes só os follow-ups "cancela se responder" morriam na pausa; os outros furavam.
              // Exceção: se o passo que retoma é um AVISO pro dono (notify), ele sai mesmo assim — a pausa
              // cala o robô PRO LEAD, não o alerta de "compra aprovada" pro dono (caso 14/10).
              // Só quando o aviso é o FIM do ramo: se houver passo depois dele, a pausa vale (senão vazaria pro lead).
              const fluxoJob: any = loadAutomations().find((a) => a.id === j.automation_id);
              const soAviso = fluxoJob?.steps?.find((st: any) => st._id === j.node_id)?.type === "notify"
                && !(fluxoJob?.edges ?? []).some((e: any) => e.source === j.node_id);
              if (botPausado(j.phone) && !soAviso) { console.log(`✋ follow-up pulado: IA pausada na conversa ${j.phone} (fluxo ${j.automation_id})`); return; }
              await resumeScheduledFlow(j.phone, j.automation_id, j.node_id, gwJob, loadAutomations());
            } catch (e: any) {
              console.error("follow-up:", e?.message ?? e);
            }
          }, j.instance_token ?? undefined),
        );
      }
    } catch (e: any) {
      console.error("follow-up scheduler:", e?.message ?? e);
    } finally {
      rodando = false;
    }
  };
  setInterval(tick, 30_000);
  setInterval(() => { purgeOldJobs().catch(() => {}); }, 6 * 3_600_000); // faxina a cada 6h
  console.log("⏰ agendador de follow-up ligado (tick 30s)");
}

// Manda o e-mail de confirmação de conta (double opt-in). Reusado por signup, login-não-confirmado e reenvio.
async function enviaConfirmacao(email: string, name: string | null, token: string): Promise<void> {
  const link = `${PAINEL_URL}/confirmar?t=${token}`;
  const t = tplConfirmarEmail((name || "").split(" ")[0] || "", link);
  await sendEmail(email, t.subject, t.html).catch((e) => console.error("confirm email:", e?.message));
}

// Dunning (Fase A): renovação falhou → e-mail pedindo pra regularizar. Anti-dup 72h (a Kiwify
// reenvia o "late"). No nível do módulo pra usar o `query` do banco (dentro do webhook ele é sombreado).
async function enviaDunning(email: string, nome: string | null): Promise<void> {
  const em = email.trim().toLowerCase();
  const ws = (await query<{ id: string }>("SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1 ORDER BY w.id LIMIT 1", [em]))[0];
  if (!ws || !(await deveEnviarEmail(ws.id, "dunning", 72))) return;
  const t = tplPaymentFailed((nome || "").split(" ")[0] || "");
  await sendEmail(em, t.subject, t.html).catch((e) => console.error("dunning:", e?.message));
  console.log(`⚠️  dunning enviado (pagamento atrasado) · ${em}`);
}

// Notifica o afiliado de uma venda NOVA (Fase C): e-mail sempre; WhatsApp na hora se tivermos o
// telefone dele. No nível do módulo pra usar o `query`/`gateway` do banco (no webhook eles seriam sombreados).
async function notificaAfiliadoVenda(d: { affiliateEmail: string; affiliateName: string | null; commission: number; buyerName: string | null; buyerEmail: string | null; plan: string | null }): Promise<void> {
  const t = tplAfiliadoVenda({ nome: (d.affiliateName || "").split(" ")[0] || "", comissao: d.commission, plano: d.plan, buyerName: d.buyerName, buyerEmail: d.buyerEmail });
  await sendEmail(d.affiliateEmail, t.subject, t.html).catch((e) => console.error("email venda afiliado:", e?.message));
  const phone = await affiliatePhoneByEmail(d.affiliateEmail).catch(() => null);
  if (phone) {
    const cliente = d.buyerName || d.buyerEmail || "novo cliente";
    const msg = `💸 Você vendeu no ZapConverte!\n\nComissão: R$ ${d.commission.toFixed(2)}${d.plan ? ` · plano ${d.plan.toUpperCase()}` : ""}\nCliente: ${cliente}\n\nBora vender mais! 🚀`;
    await gateway.sendText(phone, msg).catch((e) => console.error("wa venda afiliado:", e?.message));
  }
}

// Cancelamento (Fase D): win-back. Anti-dup 7 dias (evita reenvio se a Kiwify repetir o webhook).
async function notificaCancelamento(d: { email: string; name: string | null; paidUntil: string | null; wsId: string }): Promise<void> {
  if (!(await deveEnviarEmail(d.wsId, "cancel", 168))) return;
  const t = tplCancelamento((d.name || "").split(" ")[0] || "", d.paidUntil);
  await sendEmail(d.email, t.subject, t.html).catch((e) => console.error("email cancelamento:", e?.message));
}

// ── E-mails de ciclo do teste grátis (Fase A) ─────────────────────────────────
// Roda de hora em hora: pra cada teste que expira em ~1 dia → "acaba amanhã"; pra cada teste que
// ACABOU de expirar → "expirou, assine". A trava anti-dup (deveEnviarEmail) garante 1 envio por
// tipo. Quem já assinou (paid_until vigente) é pulado — não leva e-mail de teste.
// CTA do e-mail de ciclo: se o lead veio de um afiliado, manda pra página DELE (checkouts com o
// ?afid= dele → comissão da conversão vai pro afiliado certo); senão, a página de planos geral.
// A UTM viaja: na página de afiliado, o script injeta ela no checkout → a venda chega na Kiwify
// marcada como "veio do e-mail de ciclo".
function ctaCiclo(slug: string | null, kind: string): string {
  const base = slug ? `${SITE_URL}/promo/${slug}` : `${SITE_URL}/`;
  return `${base}?utm_source=email&utm_medium=ciclo&utm_campaign=${kind}#planos`;
}

async function emailsCicloTrialTick(): Promise<void> {
  try {
    const rows = await trialLifecycleCandidates();
    const agora = Date.now();
    for (const r of rows) {
      const pagoVigente = r.paid_until && new Date(r.paid_until).getTime() > agora && r.status !== "canceled";
      if (pagoVigente) continue;
      const horas = (new Date(r.trial_ends_at).getTime() - agora) / 3_600_000;
      const primeiro = (r.name || "").split(" ")[0] || "";
      if (horas > 0 && horas <= 30) {
        // vai expirar (dentro de ~1 dia) → "acaba amanhã" (1x por teste; cooldown ~30 dias)
        if (await deveEnviarEmail(r.ws_id, "trial_soon", 24 * 30)) {
          const t = tplTrialExpiringTomorrow(primeiro, ctaCiclo(await affiliateSlugDoLead(r.email), "trial_soon"));
          await sendEmail(r.email, t.subject, t.html).catch((e) => console.error("email trial_soon:", e?.message));
        }
      } else if (horas <= 0 && horas >= -30) {
        // acabou de expirar → "expirou, assine"
        if (await deveEnviarEmail(r.ws_id, "trial_expired", 24 * 30)) {
          const t = tplTrialExpired(primeiro, ctaCiclo(await affiliateSlugDoLead(r.email), "trial_expired"));
          await sendEmail(r.email, t.subject, t.html).catch((e) => console.error("email trial_expired:", e?.message));
        }
      }
    }
  } catch (e: any) {
    console.error("emails ciclo trial:", e?.message ?? e);
  }
}

// ── CRM KANBAN (board estilo Trello) — escopado por sessão. Atendente PODE mover cards e editar a
// ficha (é o trabalho dele); mexer nas COLUNAS é do dono/admin (ver NAO_ATENDENTE no preHandler).
app.get("/app/crm/board", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => reply.send(await getBoard()));
});
app.post("/app/crm/stage", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const r = await createStage(String((req.body as any)?.name ?? ""));
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.put("/app/crm/stage", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  return runWithWorkspace(ws, async () => {
    const r = await updateStage(String(b?.id ?? ""), { name: b?.name, color: b?.color });
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.post("/app/crm/stage/delete", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const r = await deleteStage(String((req.body as any)?.id ?? ""));
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.post("/app/crm/stage/reorder", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const r = await reorderStages((req.body as any)?.ids ?? []);
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.post("/app/crm/card/move", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  return runWithWorkspace(ws, async () => {
    const r = await moveCard(String(b?.phone ?? ""), String(b?.stageId ?? ""), Number(b?.index ?? 0));
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.put("/app/crm/card", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  return runWithWorkspace(ws, async () => {
    const r = await updateCard(String(b?.phone ?? ""), { name: b?.name, email: b?.email, address: b?.address, notes: b?.notes, value: b?.value });
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});
app.post("/app/crm/card", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  return runWithWorkspace(ws, async () => {
    const r = await createCard({ phone: String(b?.phone ?? ""), name: b?.name, stageId: b?.stageId });
    return "error" in r ? reply.code(400).send(r) : reply.send(r);
  });
});

// ── EQUIPE (multiusuário do workspace) — dono e admin gerenciam; atendente é barrado no preHandler ─
app.get("/app/team", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  // tokens/links só pra quem gerencia (ver listTeam: token = credencial de entrada na equipe)
  const gerencia = s.user.wsRole === "dono" || s.user.wsRole === "admin";
  const t = await listTeam(s.workspace.id, gerencia);
  return reply.send({ ...t, myRole: s.user.wsRole, myId: s.user.id });
});
app.post("/app/team/invite", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  // Conta sem acesso (trial vencido/estorno) NÃO dispara convite — senão vira relay de e-mail.
  if (s.paywall) return reply.code(402).send({ error: "seu acesso está inativo — renove pra convidar sua equipe" });
  if (rateLimited("invite:" + s.workspace.id, 20, 3_600_000)) return reply.code(429).send({ error: "muitos convites — tente de novo mais tarde" });
  // Teto ABSOLUTO por conta: o limite por hora sozinho ainda deixava disparar centenas de e-mails
  // por dia pra endereços quaisquer (conta em trial é grátis) — vira relay de spam com o assunto
  // escolhido por quem convida. 40/dia é folgado pra uma equipe real e mata o abuso.
  if (rateLimited("invite-dia:" + s.workspace.id, 40, 24 * 3_600_000)) return reply.code(429).send({ error: "muitos convites hoje — continue amanhã ou fale com a gente" });
  const b = req.body as any;
  // CRIAR ADMINISTRADOR é do dono. Sem isto, o gate de "só o dono muda papéis" era contornável:
  // o admin não podia promover ninguém, mas podia convidar quantos admins quisesse.
  const papel = String(b?.role ?? "atendente");
  if (papel === "admin" && s.user.wsRole !== "dono")
    return reply.code(403).send({ error: "só o dono da conta pode convidar administradores" });
  // Só o DONO define permissões finas (um admin poderia se dar áreas a mais convidando a si mesmo).
  const perms = s.user.wsRole === "dono" ? b?.permissoes : null;
  const r = await inviteMember(s.workspace.id, s.workspace.name, s.user.id, s.user.name, String(b?.email ?? ""), papel, perms);
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});
app.get("/app/team/areas", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  // Catálogo das áreas que dá pra ligar/desligar — servido pelo motor pra tela NUNCA oferecer
  // uma permissão que o servidor não sabe aplicar.
  return reply.send({ areas: AREAS_PERMISSAO });
});
app.post("/app/team/permissoes", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  if (s.user.wsRole !== "dono") return reply.code(403).send({ error: "só o dono da conta pode mudar permissões" });
  const b = req.body as any;
  const userId = String(b?.userId ?? "");
  if (userId === s.user.id) return reply.code(400).send({ error: "você é o dono — seu acesso não tem restrição" });
  const r = await setMemberPermissions(s.workspace.id, userId, b?.permissoes ? normalizaPermissoes(b.permissoes) : null);
  if ("error" in r) return reply.code(400).send(r);
  return reply.send({ ok: true });
});
app.post("/app/team/remove", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  const userId = String((req.body as any)?.userId ?? "");
  // Um admin não derruba outro admin (só o dono faz isso) — evita briga interna de permissão.
  if (s.user.wsRole === "admin") {
    const t = await listTeam(s.workspace.id);
    const alvo = t.members.find((m) => m.user_id === userId);
    if (alvo && alvo.role === "admin" && alvo.user_id !== s.user.id)
      return reply.code(403).send({ error: "só o dono pode remover outro administrador" });
  }
  const r = await removeMember(s.workspace.id, userId);
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});
app.post("/app/team/role", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  // Promover/rebaixar é do DONO (senão um admin se promoveria sozinho / rebaixaria colegas).
  if (s.user.wsRole !== "dono") return reply.code(403).send({ error: "só o dono da conta pode mudar papéis" });
  const b = req.body as any;
  const r = await setMemberRole(s.workspace.id, String(b?.userId ?? ""), String(b?.role ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});
app.post("/app/team/invite/revoke", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (!s.workspace?.id) return reply.code(401).send({ error: "conta sem workspace" });
  const r = await revokeInvite(s.workspace.id, String((req.body as any)?.token ?? ""));
  if ("error" in r) return reply.code(404).send(r);
  return reply.send(r);
});

// Convite: rotas PÚBLICAS (quem foi convidado ainda não tem sessão).
app.get("/auth/invite/:token", async (req, reply) => {
  const r = await getInvite(String((req.params as any).token ?? ""));
  if ("error" in r) return reply.code(404).send(r);
  return reply.send(r);
});
app.post("/auth/invite/accept", LIMITE_ANONIMO, async (req, reply) => {
  const b = req.body as any;
  if (rateLimited("invite-accept:" + clientIp(req), 20, 3_600_000)) return reply.code(429).send({ error: "muitas tentativas — tente de novo mais tarde" });
  const r = await acceptInvite(String(b?.token ?? ""), String(b?.name ?? ""), String(b?.password ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  // needLogin: a conta já existia COM 2FA — entrou na equipe, mas tem que logar (pra passar o código).
  return reply.send(r);
});

// ── Verificação em 2 fatores (TOTP) — por usuário da sessão ──────────────────────────────────────
app.get("/app/2fa/status", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  return reply.send({ enabled: await get2faStatus(s.user.id) });
});
// Exige a SENHA ATUAL (uma sessão roubada não planta o autenticador do atacante).
app.post("/app/2fa/setup", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (rateLimited("2fa-su:" + s.user.id, 10, 900_000)) return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const r = await setup2fa(s.user.id, s.user.email, String((req.body as any)?.password ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r); // { secret, uri } — o mesmo QR enquanto o cadastro estiver pendente
});
app.post("/app/2fa/confirm", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (rateLimited("2fa-cf:" + s.user.id, 10, 900_000)) return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  // keepToken: ativar o 2FA revoga as OUTRAS sessões, mas mantém esta (quem está ativando).
  const r = await confirm2fa(s.user.id, String((req.body as any)?.code ?? ""), String(req.headers["x-session-token"] ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});
app.post("/app/2fa/disable", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  if (rateLimited("2fa-off:" + s.user.id, 10, 900_000)) return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const r = await disable2fa(s.user.id, String((req.body as any)?.code ?? ""), String(req.headers["x-session-token"] ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});

// ── Tags do workspace (gerenciador em Configurações) — escopado por sessão ────────────────────────
app.get("/app/tags", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => reply.send({ tags: await listWorkspaceTags() }));
});
app.post("/app/tags/create", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const tag = String((req.body as any)?.tag ?? "").trim();
  if (!tag) return reply.code(400).send({ error: "informe a etiqueta" });
  if (etiquetaMeta(tag)) return reply.code(400).send({ error: "essa é uma etiqueta fixa da Meta — ela já existe e não pode ser recriada" });
  return runWithWorkspace(ws, async () => { await createWorkspaceTag(tag); return reply.send({ ok: true, tags: await listWorkspaceTags() }); });
});
app.post("/app/tags/rename", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  const oldT = String(b?.old ?? "").trim(), newT = String(b?.new ?? "").trim();
  if (!oldT || !newT) return reply.code(400).send({ error: "informe a etiqueta atual e a nova" });
  if (etiquetaMeta(oldT) || etiquetaMeta(newT)) return reply.code(400).send({ error: "etiqueta da Meta é fixa — não dá pra renomear nem usar o nome dela" });
  return runWithWorkspace(ws, async () => { await renameWorkspaceTag(oldT, newT); return reply.send({ ok: true, tags: await listWorkspaceTags() }); });
});
app.post("/app/tags/delete", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const tag = String((req.body as any)?.tag ?? "").trim();
  if (!tag) return reply.code(400).send({ error: "informe a etiqueta" });
  if (etiquetaMeta(tag)) return reply.code(400).send({ error: "etiqueta da Meta é fixa — não dá pra excluir" });
  return runWithWorkspace(ws, async () => { await deleteWorkspaceTag(tag); return reply.send({ ok: true, tags: await listWorkspaceTags() }); });
});

// ── Chave OpenAI POR WORKSPACE (nó Agente IA) — criptografada; nunca devolve a chave inteira ──────
// O consumo é cobrado na conta OpenAI de quem configurou. Cliente sem chave própria = IA desligada
// (o motor NÃO usa a chave global do admin pra clientes — ver getOpenAIKey em engine/ai.ts).
app.get("/app/ai/key", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const stored = getCachedFor<{ enc?: string; last4?: string }>(ws, "openai-key");
  const systemFallback = ws === getPrimaryWorkspace() && !!process.env.OPENAI_API_KEY; // só o admin tem a global
  return reply.send({ configured: !!stored?.enc, last4: stored?.last4 ?? null, systemFallback });
});
app.post("/app/ai/key", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const key = String((req.body as any)?.key ?? "").trim();
  if (!key.startsWith("sk-") || key.length < 20) return reply.code(400).send({ error: "chave inválida — cole a chave que começa com sk-" });
  await saveConfigFor(ws, "openai-key", { enc: encryptSecret(key), last4: key.slice(-4) });
  return reply.send({ ok: true, configured: true, last4: key.slice(-4) });
});
app.post("/app/ai/key/remove", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  await saveConfigFor(ws, "openai-key", null);
  return reply.send({ ok: true, configured: false });
});

// ── CONECTORES GOOGLE (conta de serviço) POR WORKSPACE — mesma receita da chave OpenAI: ─────────
// JSON criptografado no config-store (só o servidor lê); pro painel volta SÓ o client_email.
app.get("/app/google/status", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const g = getCachedFor<{ enc?: string; client_email?: string; project_id?: string; updatedAt?: string }>(ws, "google-sa");
  return reply.send({ connected: !!g?.enc, clientEmail: g?.client_email ?? null, projectId: g?.project_id ?? null, updatedAt: g?.updatedAt ?? null });
});
app.post("/app/google/connect", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const raw = String((req.body as any)?.json ?? "").trim();
  const sa = parseServiceAccount(raw);
  if (!sa) return reply.code(400).send({ error: "JSON inválido — cole o arquivo INTEIRO baixado do Google Cloud (tem client_email e private_key)" });
  await saveConfigFor(ws, "google-sa", {
    enc: encryptSecret(raw), client_email: sa.client_email, project_id: sa.project_id ?? "", updatedAt: new Date().toISOString(),
  });
  return reply.send({ ok: true, connected: true, clientEmail: sa.client_email });
});
app.post("/app/google/disconnect", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  await saveConfigFor(ws, "google-sa", null);
  return reply.send({ ok: true, connected: false });
});
// Teste de aceitação: escreve ["Teste", data/hora, "Conexão OK ✅"] na planilha do link.
app.post("/app/google/test-sheets", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const g = getCachedFor<{ enc?: string; client_email?: string }>(ws, "google-sa");
  if (!g?.enc) return reply.code(400).send({ error: "conecte o Google primeiro (cole o JSON da conta de serviço)" });
  const sheetId = sheetIdFromUrl(String((req.body as any)?.sheetUrl ?? ""));
  if (!sheetId) return reply.code(400).send({ error: "isso não parece o LINK de uma planilha — copie a URL docs.google.com/spreadsheets/d/… da barra do navegador" });
  try {
    const raw = decryptSecret(g.enc);
    const sa = raw ? parseServiceAccount(raw) : null;
    if (!sa) return reply.code(400).send({ error: "credencial ilegível (chave-mestra mudou?) — reconecte colando o JSON de novo" });
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Araguaina" });
    await appendSheetRow(sa, sheetId, ["Teste", quando, "Conexão OK ✅"]);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: explicaErroGoogle(e, g.client_email) });
  }
});

// Teste do Google Agenda: cria "Teste ZapConverte ✅" começando daqui a 30min (30min de duração).
app.post("/app/google/test-calendar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const g = getCachedFor<{ enc?: string; client_email?: string }>(ws, "google-sa");
  if (!g?.enc) return reply.code(400).send({ error: "conecte o Google primeiro (cole o JSON da conta de serviço)" });
  const calendarId = String((req.body as any)?.calendarId ?? "").trim();
  if (!calendarId || !calendarId.includes("@")) return reply.code(400).send({ error: "informe o ID da agenda — na agenda pessoal é o teu e-mail do Google" });
  try {
    const raw = decryptSecret(g.enc);
    const sa = raw ? parseServiceAccount(raw) : null;
    if (!sa) return reply.code(400).send({ error: "credencial ilegível (chave-mestra mudou?) — reconecte colando o JSON de novo" });
    const inicio = new Date(Date.now() + 30 * 60_000);
    const fim = new Date(inicio.getTime() + 30 * 60_000);
    const r = await createCalendarEvent(sa, calendarId, {
      titulo: "Teste ZapConverte ✅",
      descricao: "Evento de teste do conector Google Agenda — pode apagar.",
      inicioISO: inicio.toISOString(),
      fimISO: fim.toISOString(),
    });
    return reply.send({ ok: true, link: r.link });
  } catch (e: any) {
    return reply.code(502).send({ error: explicaErroGoogle(e, g.client_email, "agenda") });
  }
});

// ── GOOGLE CONTATOS (OAuth POR USUÁRIO) — grava o lead no Google Contatos PESSOAL da pessoa ──────
// Separado da conta de serviço (Planilha/Agenda): o Contatos pessoal o Google só libera via
// consentimento OAuth. /connect devolve a URL de consentimento; o Google manda o navegador pro
// /google/oauth/callback (público); ali trocamos o code por refresh_token e guardamos cifrado por
// workspace. O nó "google_contact" usa esse refresh_token no runtime.
app.get("/app/google/contacts/status", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const g = getCachedFor<{ enc?: string; email?: string; updatedAt?: string; escopos?: string }>(ws, "google-contacts-oauth");
  // "completo" = a autorização guardada já inclui Docs, Planilha e Agenda. Conexão antiga (só
  // Contatos) fica como incompleta e a tela pede pra reconectar — sem quebrar o que já funciona.
  const guardados = String(g?.escopos ?? "");
  const completo = !!g?.enc && ["documents", "spreadsheets", "calendar"].every((x) => guardados.includes(x));
  return reply.send({
    connected: !!g?.enc,
    completo,
    email: g?.email ?? null,
    updatedAt: g?.updatedAt ?? null,
    // O app OAuth do ZapConverte existe no servidor? Sem isso o botão "Conectar" não tem como funcionar.
    configurado: !!(config.googleOAuth.clientId && config.googleOAuth.clientSecret),
  });
});
app.post("/app/google/contacts/connect", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
    return reply.code(503).send({ error: "o login Google ainda não está configurado no servidor (GOOGLE_OAUTH_CLIENT_ID/SECRET)" });
  }
  // state cifrado (AES-GCM) prende o workspace e expira em 15min — o callback é público, então o
  // state é a ÚNICA prova de qual conta iniciou o consentimento (impede outro ws roubar o token).
  const state = encryptSecret(JSON.stringify({ ws, exp: Date.now() + 15 * 60_000 }));
  const url = googleOAuthUrl({
    clientId: config.googleOAuth.clientId,
    redirectUri: config.googleOAuth.redirectUri,
    scope: SCOPE_CONTACTS,
    state,
  });
  return reply.send({ url });
});
// Teste de aceitação do conector: cria "Teste ZapConverte" nos Contatos da conta ligada. Mesma
// função que o nó do fluxo usa — se passa aqui, o nó funciona (não é simulação).
app.post("/app/google/contacts/test", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const g = getCachedFor<{ enc?: string; email?: string }>(ws, "google-contacts-oauth");
  const refresh = g?.enc ? decryptSecret(g.enc) : null;
  if (!refresh) return reply.code(400).send({ error: "conecte o Google Contatos primeiro" });
  if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
    return reply.code(503).send({ error: "o login Google não está configurado no servidor" });
  }
  try {
    const access = await refreshGoogleAccessToken({
      clientId: config.googleOAuth.clientId, clientSecret: config.googleOAuth.clientSecret, refreshToken: refresh,
    });
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Araguaina" });
    await createGoogleContact(access, { name: "Teste ZapConverte", phone: "+55 11 90000-0000", email: "teste@seudominio.com.br" });
    return reply.send({ ok: true, conta: g?.email ?? null, quando });
  } catch (e: any) {
    const m = String(e?.message ?? e);
    // invalid_grant = o refresh venceu (modo Testing do Google expira em 7 dias) ou foi revogado.
    if (/invalid_grant/i.test(m)) {
      await saveConfigFor(ws, "google-contacts-oauth", null);
      return reply.code(400).send({ error: "a autorização do Google venceu (o modo de teste expira em 7 dias) — clique em Conectar de novo" });
    }
    return reply.code(502).send({ error: m.slice(0, 220) });
  }
});
// Testes de aceitação dos DEMAIS escopos do login Google (Docs, Planilha, Agenda). Existem por
// dois motivos: provar em 1 clique que a conexão funciona, e dar ao dono como DEMONSTRAR cada
// escopo sensível no vídeo de verificação do Google — que exige mostrar o uso de cada um.
app.post("/app/google/test/:oque", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const oque = String((req.params as any).oque ?? "");
  const g = getCachedFor<{ enc?: string }>(ws, "google-contacts-oauth");
  const refresh = g?.enc ? decryptSecret(g.enc) : null;
  if (!refresh) return reply.code(400).send({ error: "conecte a conta Google primeiro" });
  if (!config.googleOAuth.clientId || !config.googleOAuth.clientSecret) {
    return reply.code(503).send({ error: "o login Google não está configurado no servidor" });
  }
  try {
    const access = await refreshGoogleAccessToken({
      clientId: config.googleOAuth.clientId, clientSecret: config.googleOAuth.clientSecret, refreshToken: refresh,
    });
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Araguaina" });
    if (oque === "doc") {
      const r = await createGoogleDoc(access, {
        titulo: "Teste ZapConverte — documento",
        corpo: `Documento criado pelo ZapConverte em ${quando}.\n\nNum fluxo real, aqui entraria a proposta do lead com o nome e o valor preenchidos.`,
      });
      return reply.send({ ok: true, link: r.link });
    }
    if (oque === "planilha") {
      // Com LINK: escreve numa planilha que já é sua — é o que o nó do fluxo faz de verdade, e
      // NÃO precisa compartilhar com ninguém (o login escreve como você). Sem link: cria uma nova.
      const url = String((req.body as any)?.sheetUrl ?? "").trim();
      if (url) {
        const id = sheetIdFromUrl(url);
        if (!id) return reply.code(400).send({ error: "isso não parece o link de uma planilha — copie a URL docs.google.com/spreadsheets/d/… da barra do navegador" });
        await appendSheetRowOAuth(access, id, ["Teste ZapConverte", "5511999998888", "teste", quando]);
        return reply.send({ ok: true, link: `https://docs.google.com/spreadsheets/d/${id}/edit` });
      }
      const r = await createSheetOAuth(access, "Teste ZapConverte — leads", ["Nome", "Telefone", "Origem", "Quando"]);
      return reply.send({ ok: true, link: r.link });
    }
    if (oque === "agenda") {
      const inicio = new Date(Date.now() + 30 * 60_000);
      const fim = new Date(inicio.getTime() + 30 * 60_000);
      const r = await createCalendarEventOAuth(access, "primary", {
        titulo: "Teste ZapConverte", descricao: "Evento de teste do conector — pode apagar.",
        inicioISO: inicio.toISOString(), fimISO: fim.toISOString(),
      });
      return reply.send({ ok: true, link: r.link });
    }
    return reply.code(400).send({ error: "teste desconhecido" });
  } catch (e: any) {
    const m = String(e?.message ?? e);
    if (/invalid_grant/i.test(m)) {
      await saveConfigFor(ws, "google-contacts-oauth", null);
      return reply.code(400).send({ error: "a autorização do Google venceu — clique em Conectar de novo" });
    }
    if (faltaEscopo(e)) return reply.code(400).send({ error: "falta permissão — clique em Reconectar pra autorizar Docs, Planilha e Agenda" });
    console.error(`⚠️ teste Google "${oque}" falhou (ws ${ws.slice(0, 8)}):`, m);
    return reply.code(502).send({ error: m.slice(0, 300) });
  }
});
app.post("/app/google/contacts/disconnect", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  await saveConfigFor(ws, "google-contacts-oauth", null);
  return reply.send({ ok: true, connected: false });
});

// ══ ORIGEM DO LEAD PELA PÁGINA (clique com UTM/gclid) — engine/clique-origem.ts ═══════════════
// Público: a página do cliente chama no clique do botão de WhatsApp. Token por workspace (config
// "clique-token"), gerado uma vez em Integrações. CORS aberto: é um beacon anônimo, sem segredo além
// do token (que só identifica o workspace — não lê nem escreve nada além do clique).
const CORS_CLIQUE = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
app.options("/webhooks/clique/:token", async (_req, reply) => reply.headers(CORS_CLIQUE).code(204).send());
app.post("/webhooks/clique/:token", LIMITE_ANONIMO, async (req, reply) => {
  reply.headers(CORS_CLIQUE);
  const token = String((req.params as any)?.token ?? "");
  if (!/^[a-f0-9]{24,64}$/.test(token)) return reply.code(404).send({ error: "token inválido" });
  if (rateLimited("clique:" + clientIp(req), 120, 60_000)) return reply.code(429).send({ error: "muitos cliques" });
  const dono = scanConfig<string>("clique-token").find((c) => c.value === token);
  if (!dono) return reply.code(404).send({ error: "token desconhecido" });
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const codigo = String(b?.codigo ?? "").trim().toLowerCase();
  if (!/^[a-z2-7]{6}$/.test(codigo)) return reply.code(400).send({ error: "codigo inválido (6 letras/dígitos)" });
  const dados = filtraCamposClique(b);
  dados.clique_em = new Date().toISOString();
  await registraClique(dono.wsId, codigo, dados);
  console.log(`🎯 clique na página registrado (${codigo}) · ws ${dono.wsId} · ${Object.keys(dados).filter((k) => k !== "clique_em").join(", ") || "sem dados"}`);
  return reply.send({ ok: true });
});
async function tokenCliqueH(ws: string, reply: any) {
  let t = getCachedFor<string>(ws, "clique-token");
  if (!t) { t = randomBytes(16).toString("hex"); await saveConfigFor(ws, "clique-token", t); }
  return reply.send({ token: t, url: `${MEDIA_PUBLIC_BASE}/webhooks/clique/${t}` });
}
app.get("/admin/clique/token", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return tokenCliqueH(getPrimaryWorkspace(), reply);
});
app.get("/app/clique/token", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return tokenCliqueH(ws, reply);
});

// ══ ZAPSIGN (Integrações) — mesmo padrão do Asaas: token cifrado por workspace, nunca volta. ════
function statusZapSign(ws: string, reply: any) {
  const c = getCachedFor<{ enc?: string; ambiente?: string; last4?: string }>(ws, "zapsign-config");
  return reply.send({ configurado: !!c?.enc, ambiente: c?.ambiente === "sandbox" ? "sandbox" : "producao", last4: c?.last4 ?? null });
}
async function salvaZapSign(ws: string, body: any, reply: any) {
  const token = String(body?.token ?? "").trim();
  const ambiente = body?.ambiente === "sandbox" ? "sandbox" : "producao";
  if (!token) {
    await saveConfigFor(ws, "zapsign-config", null);
    console.log(`✍️ ZapSign: token removido do workspace ${ws}`);
    return reply.send({ ok: true, configurado: false });
  }
  if (token.length < 20 || token.length > 400) return reply.code(400).send({ error: "esse não parece um token de API da ZapSign — copie ele inteiro (Configurações → Integração → ZAPSIGN API)" });
  await saveConfigFor(ws, "zapsign-config", { enc: encryptSecret(token), ambiente, last4: token.slice(-4), updatedAt: new Date().toISOString() });
  console.log(`✍️ ZapSign: token salvo (…${token.slice(-4)}, ${ambiente}) no workspace ${ws}`);
  return reply.send({ ok: true, configurado: true, ambiente });
}
async function testaZapSign(ws: string, reply: any) {
  return runWithWorkspace(ws, async () => {
    const cfg = configZapSignDoWorkspace();
    if (!cfg) return reply.code(400).send({ error: "salve o token primeiro" });
    try { const r = await testarZapSign(cfg); return reply.send({ ok: true, pendentes: r.pendentes, ambiente: cfg.ambiente }); }
    catch (e: any) { return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 300) }); }
  });
}
for (const [pre, wsDe] of [["/admin", (req: any, reply: any) => (isAdmin(req) ? getPrimaryWorkspace() : (reply.code(401).send({ error: "não autorizado" }), null))], ["/app", (req: any, reply: any) => clientWs(req, reply)]] as const) {
  app.get(pre + "/zapsign/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return statusZapSign(ws, reply); });
  app.post(pre + "/zapsign/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return salvaZapSign(ws, req.body, reply); });
  app.post(pre + "/zapsign/testar", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return testaZapSign(ws, reply); });
  // 📈 Meta Ads (métricas de campanha) — credencial do nó "Métricas Meta Ads" e do relatório diário.
  app.get(pre + "/meta-ads/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return statusMetaAds(ws, reply); });
  app.post(pre + "/meta-ads/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return salvaMetaAds(ws, req.body, reply); });
  app.post(pre + "/meta-ads/testar", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return testaMetaAdsHandler(ws, reply); });
}

// ── Meta Ads (métricas): mesmo molde compacto do ZapSign ─────────────────────────────────────
// Guarda a CONTA DE ANÚNCIO (act_…) e um token com ads_read, cifrado, por workspace. É o que o nó
// "Métricas Meta Ads" usa quando não tem credencial própria. O /testar devolve o gasto de HOJE e o
// FUSO da conta — o date_preset roda no fuso DA CONTA, e deixar isso visível evita o mistério de
// "o gasto não bate" quando a conta está em outro fuso.
async function statusMetaAds(ws: string, reply: any) {
  const c = getCachedFor<any>(ws, "meta-ads-config");
  const origem = origemMetaAds(ws);
  const actEnv = origem === "env" && !c?.actId ? normalizaActId(String(process.env.META_ADS_ACT_ID ?? "")) : "";
  return reply.send({ configurado: !!origem, origem, actId: String(c?.actId ?? actEnv), last4: String(c?.last4 ?? "") });
}
async function salvaMetaAds(ws: string, b: any, reply: any) {
  const actId = normalizaActId(String(b?.actId ?? ""));
  const token = String(b?.token ?? "").trim();
  const atual = getCachedFor<any>(ws, "meta-ads-config");
  if (!actId && !token) { await saveConfigFor(ws, "meta-ads-config", null); return reply.send({ ok: true, configurado: false }); }
  if (!actId) return reply.code(400).send({ error: "informe o ID da conta de anúncio (act_…)" });
  const cfg: any = {
    actId,
    ...(token ? { enc: encryptSecret(token), last4: token.slice(-4) } : atual?.enc ? { enc: atual.enc, last4: atual.last4 } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!cfg.enc) return reply.code(400).send({ error: "cole o token de acesso (permissão ads_read)" });
  await saveConfigFor(ws, "meta-ads-config", cfg);
  return reply.send({ ok: true, configurado: true, actId, last4: cfg.last4 });
}
async function testaMetaAdsHandler(ws: string, reply: any) {
  const cfg = await runWithWorkspace(ws, async () => configMetaAdsDoWorkspace());
  if (!cfg) return reply.code(400).send({ error: "configure a conta e o token primeiro" });
  try {
    const r = await testarMetaAds(cfg);
    return reply.send({ ok: true, ...r });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}

// ══ RESEND (Integrações) — e-mail dos fluxos pela conta Resend DO CLIENTE. Chave cifrada, nunca volta. ══
function statusResend(ws: string, reply: any) {
  const c = getCachedFor<{ enc?: string; last4?: string; remetente?: string; nome?: string; responderPara?: string }>(ws, "resend-config");
  return reply.send({ configurado: !!c?.enc && !!c?.remetente, last4: c?.last4 ?? null, remetente: c?.remetente ?? "", nome: c?.nome ?? "", responderPara: c?.responderPara ?? "" });
}
async function salvaResend(ws: string, body: any, reply: any) {
  const atual = getCachedFor<any>(ws, "resend-config");
  if (body?.remover === true) { await saveConfigFor(ws, "resend-config", null); console.log(`✉️ Resend removida do workspace ${ws}`); return reply.send({ ok: true, configurado: false }); }
  const chave = String(body?.chave ?? "").trim();
  const remetente = String(body?.remetente ?? "").trim().toLowerCase();
  const nome = String(body?.nome ?? "").replace(/[<>"]/g, "").trim().slice(0, 80);
  const responderPara = String(body?.responderPara ?? "").trim().toLowerCase();
  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (chave && (!chave.startsWith("re_") || chave.length < 20 || chave.length > 200)) return reply.code(400).send({ error: "essa não parece uma chave da Resend — ela começa com re_ (resend.com → API Keys)" });
  if (!chave && !atual?.enc) return reply.code(400).send({ error: "cole a chave da API da Resend" });
  if (!emailOk(remetente)) return reply.code(400).send({ error: "e-mail remetente inválido — use um endereço do domínio verificado na Resend (ex.: contato@seudominio.com.br)" });
  if (responderPara && !emailOk(responderPara)) return reply.code(400).send({ error: "o e-mail de resposta é inválido" });
  const enc = chave ? encryptSecret(chave) : atual.enc;
  const last4 = chave ? chave.slice(-4) : atual.last4;
  await saveConfigFor(ws, "resend-config", { enc, last4, remetente, nome, responderPara, updatedAt: new Date().toISOString() });
  console.log(`✉️ Resend salva (…${last4}, remetente ${remetente}) no workspace ${ws}`);
  return reply.send({ ok: true, configurado: true });
}
async function testaResend(ws: string, body: any, reply: any) {
  const para = String(body?.para ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return reply.code(400).send({ error: "informe um e-mail pra receber o teste" });
  const cfg = configResendDoWorkspace(ws);
  if (!cfg) return reply.code(400).send({ error: "salve a chave e o remetente primeiro" });
  try {
    const id = await enviarEmailResend(cfg, { para, assunto: "Teste do ZapConverte: sua Resend está conectada", html: textoParaHtml("Tudo certo! Este e-mail saiu pela sua conta Resend, com o remetente " + cfg.remetente + ".\n\nAgora você já pode usar o passo *Enviar e-mail* nos seus fluxos.") });
    return reply.send({ ok: true, id });
  } catch (e: any) { return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 300) }); }
}
for (const [pre, wsDe] of [["/admin", (req: any, reply: any) => (isAdmin(req) ? getPrimaryWorkspace() : (reply.code(401).send({ error: "não autorizado" }), null))], ["/app", (req: any, reply: any) => clientWs(req, reply)]] as const) {
  app.get(pre + "/resend/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return statusResend(ws, reply); });
  app.post(pre + "/resend/config", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return salvaResend(ws, req.body, reply); });
  app.post(pre + "/resend/testar", async (req, reply) => { const ws = await wsDe(req, reply); if (!ws) return; return testaResend(ws, req.body, reply); });
}

// ══ ASAAS (Integrações) ══════════════════════════════════════════════════════════════════════
// A chave da API fica POR WORKSPACE, cifrada — nunca dentro do fluxo (o n8n exportava a chave em
// texto claro no JSON; aqui o nó Asaas lê daqui em runtime). Mesmo padrão das outras credenciais:
// o valor nunca volta pro navegador, só a marca de configurado + os últimos 4 caracteres.
function statusAsaas(ws: string, reply: any) {
  const c = getCachedFor<{ enc?: string; ambiente?: string; last4?: string }>(ws, "asaas-config");
  return reply.send({ configurado: !!c?.enc, ambiente: c?.ambiente === "sandbox" ? "sandbox" : "producao", last4: c?.last4 ?? null });
}
async function salvaAsaas(ws: string, body: any, reply: any) {
  const chave = String(body?.chave ?? "").trim();
  const ambiente = body?.ambiente === "sandbox" ? "sandbox" : "producao";
  if (!chave) { // sem chave = remover
    await saveConfigFor(ws, "asaas-config", null);
    console.log(`💳 Asaas: chave removida do workspace ${ws}`);
    return reply.send({ ok: true, configurado: false });
  }
  if (chave.length < 20 || chave.length > 400) return reply.code(400).send({ error: "essa não parece uma chave de API do Asaas — copie ela inteira (Conta → Integrações → Chave de API)" });
  await saveConfigFor(ws, "asaas-config", { enc: encryptSecret(chave), ambiente, last4: chave.slice(-4), updatedAt: new Date().toISOString() });
  console.log(`💳 Asaas: chave salva (…${chave.slice(-4)}, ${ambiente}) no workspace ${ws}`);
  return reply.send({ ok: true, configurado: true, ambiente });
}
async function testaAsaas(ws: string, reply: any) {
  return runWithWorkspace(ws, async () => {
    const cfg = configAsaasDoWorkspace();
    if (!cfg) return reply.code(400).send({ error: "salve a chave primeiro" });
    try {
      const r = await testarAsaas(cfg);
      return reply.send({ ok: true, clientes: r.clientes, ambiente: cfg.ambiente });
    } catch (e: any) {
      return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 300) });
    }
  });
}
app.get("/admin/asaas/config", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return statusAsaas(getPrimaryWorkspace(), reply);
});
app.post("/admin/asaas/config", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return salvaAsaas(getPrimaryWorkspace(), req.body, reply);
});
app.post("/admin/asaas/testar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return testaAsaas(getPrimaryWorkspace(), reply);
});
app.get("/app/asaas/config", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return statusAsaas(ws, reply);
});
app.post("/app/asaas/config", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return salvaAsaas(ws, req.body, reply);
});
app.post("/app/asaas/testar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return testaAsaas(ws, reply);
});
// CALLBACK do Google (PÚBLICO — o Google redireciona o navegador da pessoa pra cá). Não há sessão:
// o `state` cifrado diz qual workspace. Troca o code por refresh_token, guarda cifrado e volta pro painel.
app.get("/google/oauth/callback", async (req, reply) => {
  const q = req.query as any;
  const painel = "https://painel.seudominio.com.br/integracoes";
  if (q?.error) return reply.redirect(`${painel}?google_contatos=erro`);
  const code = String(q?.code ?? "");
  const dec = q?.state ? decryptSecret(String(q.state)) : null;
  let st: { ws?: string; exp?: number } | null = null;
  try { st = dec ? JSON.parse(dec) : null; } catch { st = null; }
  if (!code || !st?.ws || !st.exp || st.exp < Date.now()) {
    console.warn("google oauth callback: state inválido/expirado");
    return reply.redirect(`${painel}?google_contatos=erro`);
  }
  try {
    const tok = await exchangeGoogleCode({
      clientId: config.googleOAuth.clientId,
      clientSecret: config.googleOAuth.clientSecret,
      code, redirectUri: config.googleOAuth.redirectUri,
    });
    if (!tok.refreshToken) {
      // Sem refresh_token = a pessoa já tinha autorizado antes sem revogar. prompt=consent evita,
      // mas se acontecer, pede reconexão (revogar em myaccount.google.com/permissions).
      console.warn("google oauth: veio sem refresh_token — pedir reconexão");
      return reply.redirect(`${painel}?google_contatos=sem_refresh`);
    }
    const email = await googleUserEmail(tok.accessToken);
    await saveConfigFor(st.ws, "google-contacts-oauth", {
      enc: encryptSecret(tok.refreshToken), email: email ?? "", updatedAt: new Date().toISOString(),
      // Guarda o que foi concedido: o Google NÃO amplia escopo de um token antigo, então quem
      // conectou antes de Docs/Planilha/Agenda existirem precisa reconectar — e a tela só sabe
      // disso comparando com isto aqui.
      escopos: SCOPE_CONTACTS,
    });
    console.log(`🟢 Google Contatos conectado · ws ${st.ws.slice(0, 8)} · ${email ?? "?"}`);
    return reply.redirect(`${painel}?google_contatos=ok`);
  } catch (e: any) {
    console.error("google oauth callback:", e?.message ?? e);
    return reply.redirect(`${painel}?google_contatos=erro`);
  }
});

// As contas (números) DO CLIENTE — só as instâncias do workspace dele. NÃO inclui a principal do dono.
app.get("/app/accounts", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  // Contas liberadas pra ESTE membro (o dono vê todas). Filtra no fim, com a lista já montada.
  const sPerm = await sessionOf(req);
  const contasOk = sPerm?.user?.permissoes?.contas ?? null;
  return runWithWorkspace(ws, async () => {
    const accounts: any[] = [];
    for (const it of getCached<LiteStored[]>("lite-instances") ?? []) {
      try {
        const s = await liteInstanceStatus(it.token);
        if (s.status !== "connected" && !s.number) continue; // nunca espelhou (QR abandonado do fluxo antigo) — sem bolinha
        accounts.push({ id: "lite-" + it.token.slice(0, 8), type: "LITE", name: s.name || it.name || "WhatsApp", number: s.number, avatar: s.avatar, connected: s.status === "connected", noAuto: !!it.noAuto });
      } catch {
        accounts.push({ id: "lite-" + it.token.slice(0, 8), type: "LITE", name: it.name || "WhatsApp", connected: false, noAuto: !!it.noAuto });
      }
    }
    // Pendente que espelhou com o modal fechado → promove aqui (senão a bolinha só nasceria no próximo "+").
    for (const p of getCached<LitePending[]>("lite-pending") ?? []) {
      const s = await liteInstanceStatus(p.token).catch(() => null);
      if (s?.status !== "connected") continue;
      await promoteLitePending(p, ws);
      accounts.push({ id: idDaInstancia(p.token), type: "LITE", name: s.name || p.name, number: s.number, avatar: s.avatar, connected: true });
    }
    // A API OFICIAL do cliente também é uma conta (o admin já contava — o /app/* nasceu sem, ver
    // [[feedback-replicar-clientes]]). Sem isto, quem conecta só o número oficial fica PRESO na tela
    // "conecte seu WhatsApp" pra sempre, porque nenhuma conta aparece como conectada (caso real
    // 10/08: um cliente tentando ativar a API Oficial).
    const metaCli = getCached<any>("meta-official");
    if (metaCli?.connected) {
      accounts.push({ id: "api", type: "API", name: metaCli.verifiedName || metaCli.displayNumber || "API Oficial", number: metaCli.displayNumber, avatar: await fotoPerfilApi(metaCli), connected: true });
    }
    // FILTRO por permissão: lista vazia de contas permitidas não é "todas", é nenhuma — por isso
    // a checagem é `!== null` e não um "se tiver itens".
    const todas = unificaContasPorNumero(accounts);
    const visiveis = contasOk ? todas.filter((a: any) => contasOk.includes(String(a.id))) : todas;
    return reply.send({ accounts: visiveis });
  });
});

// Grupos do(s) número(s) do CLIENTE (pro seletor do builder/lembretes). Antes esta rota nem
// existia — o remap /admin/groups → /app/groups caía num 404 e o cliente via o seletor vazio.
// Junta os grupos de TODAS as instâncias do workspace (dedup por jid). MEMORIZADO por workspace
// (config "groups-list"): responde na hora com o memorizado e confere em 2º plano; ?refresh=1 =
// checagem profunda na hora.
const wsGroupsCache = new Map<string, { at: number; groups: Array<{ jid: string; name: string }> }>();
const wsGroupsRevalidating = new Set<string>();
app.get("/app/groups", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    // Mesma regra do admin: com `account`, responde SÓ pelos grupos daquele número do workspace.
    // Sem ele, mantém a união de todas as instâncias DO PRÓPRIO workspace (nunca de outro).
    const contaPedida = String((req.query as any)?.account ?? "").trim();
    if (contaPedida && contaPedida !== "lite" && contaPedida !== "api") {
      const it = (getCached<LiteStored[]>("lite-instances") ?? []).find((x: any) => x.id === contaPedida || x.token === contaPedida);
      if (!it?.token) return reply.send({ groups: [] }); // não é número DESTE workspace → vazio
      try {
        const gs = await new UazapiGateway(config.uazapi.url, it.token).listGroups(String((req.query as any)?.refresh ?? "") === "1");
        sortGroups(gs);
        return reply.send({ groups: gs });
      } catch { return reply.send({ groups: [] }); }
    }
    // A busca à força custa ~10-30s na UazAPI (compartilhada por TODOS os tenants) → no máximo
    // 4 por 5min por workspace; estourou, cai na busca normal (rápida) em vez de dar erro.
    let force = String((req.query as any)?.refresh ?? "") === "1";
    if (force && rateLimited("grp-refresh:" + ws, 4, 5 * 60_000)) force = false;
    const hit = wsGroupsCache.get(ws);
    if (!force && hit && Date.now() - hit.at < 60_000) return reply.send({ groups: hit.groups });

    // null = TODAS as instâncias falharam (número desconectado?) — nesse caso NÃO apaga o memorizado.
    const buscar = async (f: boolean): Promise<Array<{ jid: string; name: string }> | null> => {
      const seen = new Map<string, { jid: string; name: string }>();
      let alguma = false;
      for (const it of getCached<LiteStored[]>("lite-instances") ?? []) {
        try {
          const gw = new UazapiGateway(config.uazapi.url, it.token);
          for (const g of await gw.listGroups(f)) if (!seen.has(g.jid)) seen.set(g.jid, g);
          alguma = true;
        } catch { /* instância desconectada → segue com as outras */ }
      }
      if (!alguma) return null;
      return [...seen.values()].sort((a, b) => (a.name || a.jid).localeCompare(b.name || b.jid, "pt-BR"));
    };
    const memorizar = async (groups: Array<{ jid: string; name: string }>) => {
      // Teto de memória SEM punir todo mundo: primeiro expira entradas velhas; se ainda passar,
      // derruba as mais antigas (nunca um clear() geral, que causaria estouro de busca em todos).
      if (wsGroupsCache.size > 500) {
        const cutoff = Date.now() - 10 * 60_000;
        for (const [k, v] of wsGroupsCache) if (v.at < cutoff) wsGroupsCache.delete(k);
        if (wsGroupsCache.size > 500) {
          for (const [k] of [...wsGroupsCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, wsGroupsCache.size - 400)) wsGroupsCache.delete(k);
        }
      }
      wsGroupsCache.set(ws, { at: Date.now(), groups });
      await saveConfig("groups-list", { at: Date.now(), groups }).catch(() => {});
    };

    if (!force) {
      const snap = getCached<GroupsSnap>("groups-list");
      if (snap?.groups?.length) {
        wsGroupsCache.set(ws, { at: Date.now(), groups: snap.groups }); // segura a rajada enquanto confere
        if (!wsGroupsRevalidating.has(ws)) {
          wsGroupsRevalidating.add(ws);
          void buscar(false)
            .then(async (fresh) => { if (fresh) await memorizar(fresh); })
            .catch(() => { /* falhou a conferência → mantém o memorizado */ })
            .finally(() => wsGroupsRevalidating.delete(ws));
        }
        return reply.send({ groups: snap.groups });
      }
    }
    // 1ª vez (nada memorizado) ou ↻ Atualizar: busca sincrona e memoriza.
    const groups = await buscar(force);
    if (!groups) return reply.code(502).send({ error: "não consegui listar os grupos — o número está conectado?" });
    await memorizar(groups);
    return reply.send({ groups });
  });
});

// 📷 Fotos dos leads da API Oficial, por workspace, pelo número Lite DO PRÓPRIO workspace.
let fotosOficialRodando = false;
async function fotosDosLeadsOficial(): Promise<void> {
  if (fotosOficialRodando) return;
  fotosOficialRodando = true;
  try {
    const wss = await query<{ workspace_id: string }>(
      "SELECT DISTINCT workspace_id FROM inbox_messages WHERE account LIKE 'meta-%' AND NOT from_me").catch(() => []);
    for (const { workspace_id: ws } of wss) {
      const token = ws === getPrimaryWorkspace() ? config.uazapi.token : (getCachedFor<LiteStored[]>(ws, "lite-instances") ?? [])[0]?.token;
      if (!token) continue; // cliente sem número Lite: sem de onde buscar a foto
      const n = await enrichAvatarsOficial({ uazUrl: config.uazapi.url, token, mediaBase: MEDIA_PUBLIC_BASE, wsId: ws, limite: 40 }).catch(() => 0);
      if (n) console.log(`📷 fotos de leads da API: ${n} salva(s) · ${ws.slice(0, 11)}`);
    }
  } finally { fotosOficialRodando = false; }
}

// Conecta o WhatsApp do cliente (cria instância LITE no workspace DELE + QR). Limite: 1 número por ora.
// Id OPACO da instância pro navegador: o token da UazAPI é credencial plena (envia/lê tudo) e
// não pode transitar pelo browser nem por query string (auditoria 06/08). O painel usa este id;
// o motor resolve o token server-side dentro do workspace do chamador.
const idDaInstancia = (token: string) => "lite-" + token.slice(0, 8);
function tokenDoWorkspace(wsId: string, accountId: string): string | null {
  // 🔴 "lite" é o apelido da instância PRIMÁRIA (a do dono). O wsId era ignorado aqui: QUALQUER
  // cliente autenticado mandando ?account=lite recebia o status da instância do dono — número,
  // nome, foto e, com ela desconectada, o QR CODE. Ou seja, dava pra parear o próprio WhatsApp na
  // instância da plataforma. É o incidente de 16/08 reaberto por outra porta (auditoria 07/09).
  if (accountId === "lite") return wsId === getPrimaryWorkspace() ? config.uazapi.token : null;
  const lista: Array<{ token: string }> = [
    ...(getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? []),
    ...(getCachedFor<LitePending[]>(wsId, "lite-pending") ?? []), // pendente: o modal fica pollando o status dela
  ];
  const achou = lista.find((x) => idDaInstancia(x.token) === accountId || x.token === accountId);
  return achou?.token ?? null;
}

// ── "+ Adicionar número": bolinha SÓ depois de espelhar (pedido de 07/08) ─────
// Instância recém-criada fica em "lite-pending" (FORA de "lite-instances") até o QR parear.
// Se nunca parear, não aparece conta nenhuma no seletor e a instância é apagada após o TTL
// (libera o slot da UazAPI). Antes: criava direto em "lite-instances" → cada tentativa
// abandonada virava uma bolinha OFFLINE fantasma no painel.
interface LitePending { token: string; name: string; at: number }
const PENDENTE_TTL = 30 * 60_000;

// Pendente que PAREOU vira conta de verdade: entra em "lite-instances" (ganha a bolinha),
// roteia o inbound e liga o webhook na hora (sem esperar o ensureWebhooks do próximo boot).
async function promoteLitePending(p: LitePending, ws: string): Promise<void> {
  // ⛑️ SEGURANÇA multi-tenant: grava EXPLICITAMENTE no `ws` recebido (saveConfigFor/getCachedFor),
  // não no workspace de contexto. Antes dependia de o contexto ALS bater com `ws` — sempre batia
  // hoje, mas um chamador futuro passando um ws diferente do contexto gravaria a instância do
  // cliente na conta de outro. Fonte única = o parâmetro. (Auditoria de dados do cliente 16/08.)
  await saveConfigFor(ws, "lite-pending", (getCachedFor<LitePending[]>(ws, "lite-pending") ?? []).filter((x) => x.token !== p.token));
  const list = (getCachedFor<LiteStored[]>(ws, "lite-instances") ?? []).filter((x) => x.token !== p.token);
  list.push({ token: p.token, name: p.name });
  await saveConfigFor(ws, "lite-instances", list);
  await upsertInstance(p.token, ws, { platform: "lite", name: p.name }).catch((e) => console.error("upsertInstance:", e?.message));
  await liteSetWebhook(p.token, UAZAPI_WEBHOOK_URL, false).catch((e) => console.error("webhook da pendente promovida:", e?.message));
  accountsCache = null;
}

// Apaga pendentes vencidas (QR nunca escaneado). Se a UazAPI falhar, mantém pra tentar depois.
async function purgeLitePendings(): Promise<LitePending[]> {
  const pend = getCached<LitePending[]>("lite-pending") ?? [];
  const vivas: LitePending[] = [];
  for (const p of pend) {
    if (Date.now() - p.at < PENDENTE_TTL) { vivas.push(p); continue; }
    try { await deleteLiteInstance(p.token); } catch { vivas.push(p); }
  }
  if (vivas.length !== pend.length) await saveConfig("lite-pending", vivas);
  return vivas;
}

type IniciaLite =
  | { qr: { account: string; qrcode?: string; paircode?: string; name: string } }
  | { limitReached: true; limit: number };

// 🎟️ SLOTS DO PLANO — "1 número na assinatura" é UM número, não importa por qual porta entrou.
// O teto morava só no caminho do QR: quem tinha direito a 1 conectava o LITE, batia no limite, e
// então clicava em "Conectar API Oficial" — que não conferia nada — e ficava com dois. A conta
// agora é somada nos dois lados (achado durante a demo do BMA, 02/09).
// Conta slots OCUPADOS, não conectados: instância LITE criada já reserva o slot na UazAPI (que é
// custo nosso) mesmo antes de escanear o QR; e o número oficial conta assim que tem phoneNumberId.
function numerosOcupados(wsId: string): { lite: number; oficial: number; total: number } {
  const lite = (getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? []).length;
  const oficial = String(getCachedFor<any>(wsId, "meta-official")?.phoneNumberId ?? "").trim() ? 1 : 0;
  return { lite, oficial, total: lite + oficial };
}

// A frase que o cliente lê ao bater no teto. Diz o que ELE já tem — sem isso a reação é achar que
// é bug ("mas eu não conectei nada!"), quando na verdade o slot está com o outro tipo de número.
function recadoDoTeto(wsId: string, limit: number): string {
  const { lite, oficial } = numerosOcupados(wsId);
  const tem = [lite ? `${lite} pelo WhatsApp normal (QR)` : "", oficial ? "1 pela API Oficial" : ""].filter(Boolean).join(" e ");
  return `Seu plano inclui ${limit} número${limit > 1 ? "s" : ""} do WhatsApp e você já está usando ${tem || "todos"}. ` +
    `Pra conectar mais um, fale com a gente que liberamos. 🚀`;
}

// Núcleo do "+" (admin e cliente — roda DENTRO do contexto do workspace do chamador):
// 1) conta pareada que CAIU → reconecta (QR novo, sem consumir slot nem passar pelo limite);
// 2) fantasma do fluxo antigo (instância em "lite-instances" que nunca pareou) → apaga de vez;
// 3) checa o limite do plano ANTES de abrir QR pra número novo;
// 4) reaproveita a pendente aguardando, senão cria instância nova como PENDENTE.
async function iniciaLite(ws: string, nomeNovo: string, limit: number | null): Promise<IniciaLite> {
  // 🔴 A conta PRIMÁRIA (token fixo UAZAPI_TOKEN) é do SUPER-ADMIN (Admin). O reconnect dela SÓ
  // pode acontecer quando quem clica é o próprio workspace primário. Sem este `ws === primário`,
  // QUALQUER cliente que clicasse "+" com a primária offline recebia o QR DA PRIMÁRIA e, ao
  // escanear, prendia o WhatsApp DELE na instância do dono — o super-admin passava a ver as
  // conversas do cliente (vazamento real 16/08: "um cliente" caiu na conta do dono).
  // Bug que EU introduzi em 14/08 ao consertar a reconexão da primária. Cliente NUNCA toca no
  // token primário: ele só reconecta/cria dentro das próprias instâncias (loop abaixo).
  if (ws === getPrimaryWorkspace()) {
    const stPrimaria = await liteInstanceStatus(config.uazapi.token).catch(() => null);
    if (stPrimaria && stPrimaria.status !== "connected") {
      const c = await connectLiteInstance(config.uazapi.token);
      return { qr: { account: "lite", qrcode: c.qrcode, paircode: c.paircode, name: stPrimaria.name || "WhatsApp" } };
    }
  }
  let stored = getCached<LiteStored[]>("lite-instances") ?? [];
  let reconectar: LiteStored | null = null;
  let mudou = false;
  for (const it of stored) {
    const st = await liteInstanceStatus(it.token).catch(() => null);
    if (st?.status === "connected") continue;
    if (st && !st.number) { // sem número = nunca espelhou → fantasma
      try { await deleteLiteInstance(it.token); } catch { continue; } // UazAPI falhou → fica pra próxima varrida
      stored = stored.filter((x) => x.token !== it.token);
      await removeInstance(it.token).catch(() => {});
      mudou = true;
    } else if (!reconectar) reconectar = it;
  }
  if (mudou) { await saveConfig("lite-instances", stored); accountsCache = null; }
  if (reconectar) {
    const c = await connectLiteInstance(reconectar.token);
    await upsertInstance(reconectar.token, ws, { platform: "lite", name: reconectar.name });
    return { qr: { account: idDaInstancia(reconectar.token), qrcode: c.qrcode, paircode: c.paircode, name: reconectar.name } };
  }
  let aguardando: LitePending | null = null;
  for (const p of await purgeLitePendings()) {
    const st = await liteInstanceStatus(p.token).catch(() => null);
    if (st?.status === "connected") await promoteLitePending(p, ws); // escaneou com o modal fechado
    else if (!aguardando) aguardando = p;
  }
  const contas = numerosOcupados(ws).total; // relê: promoções acima mudam a conta
  if (limit !== null && contas >= limit) return { limitReached: true, limit };
  if (aguardando) {
    const c = await connectLiteInstance(aguardando.token);
    return { qr: { account: idDaInstancia(aguardando.token), qrcode: c.qrcode, paircode: c.paircode, name: aguardando.name } };
  }
  const created = await createLiteInstance(nomeNovo);
  let qrcode = created.qrcode, paircode = created.paircode;
  if (!qrcode) { const c = await connectLiteInstance(created.token); qrcode = c.qrcode; paircode = c.paircode; }
  const pend = (getCached<LitePending[]>("lite-pending") ?? []).filter((x) => x.token !== created.token);
  pend.push({ token: created.token, name: nomeNovo, at: Date.now() });
  await saveConfig("lite-pending", pend);
  return { qr: { account: idDaInstancia(created.token), qrcode, paircode, name: nomeNovo } };
}

// Quantos números o plano dá e quantos já estão em uso — o modal do "+" precisa disso pra AVISAR
// antes do clique, em vez de deixar a pessoa escanear um QR (ou abrir o wizard da Meta inteiro)
// pra só então tomar um 403. Admin não tem teto: devolve limit null.
app.get("/admin/numeros", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const ws = getPrimaryWorkspace();
  return reply.send({ ...numerosOcupados(ws), limit: null, podeAdicionar: true });
});
app.get("/app/numeros", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const limit = Math.max(1, Number(getCachedFor<number>(ws, "number-limit")) || 1);
  const uso = numerosOcupados(ws);
  return reply.send({ ...uso, limit, podeAdicionar: uso.total < limit });
});

app.post("/app/lite/init", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  if (!config.uazapi.adminToken) return reply.code(400).send({ error: "conexão indisponível no momento — fale com o suporte" });
  return runWithWorkspace(ws, async () => {
    const limit = Number(getCached<number>("number-limit")) || 1; // limite de números do plano do cliente (default 1; super-admin sobe)
    const name = String((req.body as any)?.name || "").trim() || "Meu WhatsApp";
    try {
      const r = await iniciaLite(ws, name, limit);
      if ("limitReached" in r) {
        return reply.code(403).send({ error: recadoDoTeto(ws, r.limit), limitReached: true, limit: r.limit });
      }
      return reply.send(r.qr);
    } catch (e: any) {
      return reply.code(502).send({ error: e.message });
    }
  });
});

// Status da conexão (QR espelhou?). IDOR-guard: o token TEM que pertencer ao ws do chamador.
app.get("/app/lite/status", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    // `account` é o caminho novo (id opaco). `token` fica aceito por compatibilidade com abas
    // antigas, mas SEMPRE revalidado contra as instâncias DESTE workspace (IDOR-guard).
    const alvo = String(q?.account ?? q?.token ?? "");
    if (!alvo) return reply.code(400).send({ error: "informe a conta" });
    const token = tokenDoWorkspace(ws, alvo);
    if (!token) return reply.code(403).send({ error: "essa instância não é sua" });
    try {
      const st = await liteInstanceStatus(token);
      // Pendente espelhou → PROMOVE: é neste poll do modal que a conta ganha a bolinha.
      if (st.status === "connected") {
        const p = (getCached<LitePending[]>("lite-pending") ?? []).find((x) => x.token === token);
        if (p) await promoteLitePending(p, ws);
      }
      return reply.send({ ...st, token: undefined, account: idDaInstancia(token) }); // nunca devolve o token
    }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
// Remove o número do cliente (libera o slot da UazAPI + tira do roteamento). Volta pra tela de conectar.
app.post("/app/lite/remove", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const account = String((req.body as any)?.account ?? "");
    const stored = getCached<LiteStored[]>("lite-instances") ?? [];
    const it = stored.find((x) => idDaInstancia(x.token) === account);
    if (!it) return reply.code(404).send({ error: "conta não encontrada" });
    let warn = "";
    try { await deleteLiteInstance(it.token); } catch (e: any) { warn = "removida do painel, mas a UazAPI reclamou: " + e.message; }
    await saveConfig("lite-instances", stored.filter((x) => x.token !== it.token));
    await removeInstance(it.token).catch(() => {});
    return reply.send({ ok: true, warn });
  });
});
// Liga/desliga a automação do número do cliente (dormente = recebe, não roda fluxo).
// 📞 Liga pra um contato pelo WhatsApp, com o número LITE ativo. O botão "Ligar" do inbox
// abria um link tel:, que no Mac cai no FaceTime e no PC não faz nada — nunca ligou pelo WhatsApp.
app.post("/app/lite/call", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const numero = String((req.body as any)?.number ?? "").replace(/\D/g, "");
    if (numero.length < 8) return reply.code(400).send({ error: "número inválido" });
    const conta = String((req.body as any)?.account ?? "");
    const stored = getCached<LiteStored[]>("lite-instances") ?? [];
    const it = conta ? stored.find((x) => idDaInstancia(x.token) === conta) : null;
    // 🔴 FALHA FECHADA. O fallback era `config.uazapi.token` — o número do MICHEL. Bastava um
    // cliente autenticado mandar {"number":"..."} sem `account` (ou não ter instância nenhuma) e
    // o motor originava a ligação a partir do número da plataforma, pra qualquer destino e sem
    // limite. Queima a reputação do número do dono e vira ferramenta de spam (auditoria 07/09).
    // Mesmo padrão do /app/inbox/*: instância do próprio workspace, ou nada.
    const token = it?.token ?? firstClientToken() ?? (ws === getPrimaryWorkspace() ? config.uazapi.token : null);
    if (!token) return reply.code(400).send({ error: "conecte um número de WhatsApp antes de ligar" });
    try {
      const r = await liteCall(token, numero);
      console.log(`📞 ligação pelo WhatsApp → ${numero}`);
      return reply.send({ ok: true, resposta: r });
    } catch (e: any) {
      return reply.code(502).send({ error: "a UazAPI recusou a ligação: " + (e?.message ?? e) });
    }
  });
});

app.post("/app/lite/automation", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const b = req.body as any;
    const account = String(b?.account ?? "");
    const noAuto = !!b?.noAuto;
    const stored = getCached<LiteStored[]>("lite-instances") ?? [];
    const it = stored.find((x) => idDaInstancia(x.token) === account);
    if (!it) return reply.code(404).send({ error: "conta não encontrada" });
    await saveConfig("lite-instances", stored.map((x) => (x.token === it.token ? { ...x, noAuto } : x)));
    return reply.send({ ok: true, account, noAuto });
  });
});

// O webhookToken é estado DO SERVIDOR (nasce no /flow-webhook-token, o builder nem o conhece).
// Sem isto, salvar o fluxo APAGAVA o token: o PUT grava a lista inteira (last-write-wins) e a cópia
// do navegador — carregada antes de gerar o token — vinha sem o campo. Aconteceu de verdade em
// 09/08: gerar endereço → Salvar → webhook 503 "sem token". Chamar DENTRO do workspace da sessão.
// O `webhookSegredoEnc` sofre do MESMO mal, e pior: ele é o que liga a checagem HMAC em
// recebeCheckoutNoFluxo (`if (seg && !verifyKiwifySignature(...))`). Sem segredo a guarda não
// reprova nada — ela some em silêncio, e o painel continua mostrando "configurado" até o F5.
// O caminho pra quebrar era o trivial: cadastrar o segredo → arrastar um nó → Salvar. O builder
// guarda o fluxo em memória de ANTES do segredo existir (o POST /flow-webhook-secret grava direto
// no config e não volta pro navegador, de propósito), então o PUT chegava sem o campo.
// O segredo de autenticação do passo de HTTP chega do painel em CLARO (campo `authValor`) e é
// cifrado aqui antes de encostar no banco. Nunca volta em claro pro painel, e sai do "baixar
// fluxo" — arquivo baixado sai da conta, e token de API de cliente não pode viajar junto.
// Painel que salva SEM o campo (não mexeu na autenticação) mantém o segredo que já existia.
function cifraSegredosDeHttp(list: any[]): any[] {
  const atuais = loadAutomations();
  for (const a of list) {
    if (!a || !Array.isArray(a.steps)) continue;
    const velho: any = atuais.find((x: any) => x.id === a.id);
    a.steps.forEach((st: any, i: number) => {
      if (!st || st.type !== "webhook_out") return;
      if (typeof st.authValor === "string") {
        const v = st.authValor.trim();
        st.authValorEnc = v ? encryptSecret(v) : undefined;
        if (!v) delete st.authValorEnc;
        delete st.authValor; // o valor cru NUNCA é persistido
        return;
      }
      // Não veio campo novo: preserva o cifrado que já estava salvo (procura pelo _id, não pelo
      // índice — um passo movido no canvas mudaria de posição e perderia a credencial).
      if (!st.authValorEnc) {
        const antigo = (velho?.steps ?? []).find((x: any) => x?._id && x._id === st._id) ?? velho?.steps?.[i];
        if (antigo?.type === "webhook_out" && antigo.authValorEnc) st.authValorEnc = antigo.authValorEnc;
      }
    });
  }
  return list;
}

function preservaTokensWebhook(list: any[]): any[] {
  const atuais = loadAutomations();
  for (const a of list) {
    if (!a) continue;
    const velho: any = atuais.find((x: any) => x.id === a.id);
    if (!velho) continue;
    if (!a.webhookToken && velho.webhookToken) a.webhookToken = velho.webhookToken;
    if (!a.webhookSegredoEnc && velho.webhookSegredoEnc) a.webhookSegredoEnc = velho.webhookSegredoEnc;
    if (!a.exemploWebhook && velho.exemploWebhook) a.exemploWebhook = velho.exemploWebhook;
  }
  return list;
}

// Os fluxos DO CLIENTE.
app.get("/app/automations", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => reply.send({ automations: semSegredosDeHttp(loadAutomations()) }));
});
app.put("/app/automations", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const body = req.body as any;
  const list = Array.isArray(body) ? body : body?.automations;
  if (list == null) return reply.code(400).send({ error: "requisição sem o campo 'automations' — nada foi salvo, tente de novo" });
  const err = validateAutomations(list);
  if (err) return reply.code(400).send({ error: err });
  const autor = await autorDaSessao(req);
  return runWithWorkspace(ws, async () => {
    try {
      const { list: clean } = await dehydrateAutomationsMedia(cifraSegredosDeHttp(preservaTokensWebhook(list)));
      await gravaHistoricoFluxos(clean, autor); // ANTES do save: compara com o que está gravado
      await saveConfig("automations", clean);
      return reply.send({ ok: true, automations: loadAutomations() });
    } catch (e: any) {
      return reply.code(500).send({ error: "falha ao salvar: " + e.message });
    }
  });
});

// Inbox do CLIENTE — conversas do número dele (tem 1 só, então sem seletor de conta). Token resolvido
// do lite-instances do workspace do cliente (escopado). Reusa os mesmos helpers do inbox do admin.
function firstClientToken(): string | null {
  return (getCached<LiteStored[]>("lite-instances") ?? [])[0]?.token ?? null;
}
// 📱 Número ESCOLHIDO na bolinha do painel (?account= ou account no corpo). Antes TODA rota de
// inbox do cliente usava o 1º número da conta: com 2 números (HG, 03/10) a bolinha trocava e o
// chat continuava mostrando — e respondendo por — o primeiro. Conta que não é deste workspace
// devolve null (IDOR-guard do tokenDoWorkspace); sem conta informada, segue no 1º como sempre.
function tokenDaConta(req: any): string | null {
  const q = req?.query ?? {};
  const b = req?.body && typeof req.body === "object" ? req.body : {};
  const acc = String(q.account ?? b.account ?? "").trim();
  if (!acc || acc === "api") return firstClientToken();
  const t = tokenDoWorkspace(getCurrentWorkspace(), acc);
  if (t) return t;
  return acc === "lite" ? firstClientToken() : null; // "lite" = apelido antigo do número padrão
}
// ★ REGRA (Admin, 06/08): melhoria no inbox do ADMIN replica pro CLIENTE — o componente de UI é
// o MESMO (o proxy remapeia /admin/inbox/* → /app/inbox/*); endpoint que só existe no admin vira
// falha silenciosa no painel do cliente (caso real: o "lido persistente" não funcionava pra eles).
app.post("/app/inbox/read", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const chatid = String((req.body as any)?.chatid ?? "");
    if (!token || !chatid) return reply.code(400).send({ error: "informe a conversa" });
    try { await liteChatRead(token, chatid); await limparMencao(ws, chatid).catch(() => {}); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/pin", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const id = String((req.body as any)?.id ?? "");
    if (!token || !id) return reply.code(400).send({ error: "informe a mensagem" });
    const b = req.body as any;
    const dur = [1, 7, 30].includes(Number(b?.duration)) ? Number(b.duration) : 7;
    try { await liteMessagePin(token, id, b?.pin !== false, dur); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.get("/app/inbox/favoritas", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ favoritas: getCachedFor<Record<string, any>>(ws, "msgs-favoritas") ?? {} });
});
// 📣 RASTREIO DA CONVERSA: de onde este lead veio (UTM do checkout Kiwify ou anúncio Click-to-
// WhatsApp). Alimenta o selo ADS e a lista suspensa de UTMs no cabeçalho da conversa. Só leitura.
// Sem dado de origem → veioDeAds:false e utm:null (o selo some). Usado pelo /app (cliente) e /admin.
function montaRastreio(f: Record<string, string>) {
  const utm = {
    source: f.utm_source || null, medium: f.utm_medium || null,
    campaign: f.utm_campaign || null, content: f.utm_content || null,
    term: f.utm_term || null, adId: f.ad_id || null,
  };
  const temUtm = Object.values(utm).some(Boolean);
  const anuncio = (f.anuncio_headline || f.anuncio_link)
    ? { headline: f.anuncio_headline || null, link: f.anuncio_link || null } : null;
  // "Veio de anúncio" = tem ad_id (o page empacota o id do anúncio no sck), OU chegou por um
  // Click-to-WhatsApp, OU a mídia/origem é de tráfego pago (paid/cpc/social) ou de uma rede de ads.
  const veioDeAds = !!(utm.adId || anuncio)
    || /paid|cpc|ads|social/i.test(String(utm.medium || ""))
    || /^(meta|facebook|fb|instagram|ig|tik-?tok|google[_-]?ads)$/i.test(String(utm.source || "").trim());
  return { veioDeAds, anuncio, utm: temUtm ? utm : null };
}
app.get("/app/inbox/rastreio", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const bruto = String((req.query as any)?.phone ?? "");
  const phone = toWhatsAppNumber(bruto) || bruto.replace(/\D/g, "");
  if (!phone) return reply.code(400).send({ error: "informe o telefone" });
  return runWithWorkspace(ws, async () => reply.send(montaRastreio(await getContactFields(phone))));
});
app.post("/app/inbox/favorita", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  const id = String(b?.id ?? "");
  if (!id) return reply.code(400).send({ error: "informe o id da mensagem" });
  const mapa = { ...(getCachedFor<Record<string, any>>(ws, "msgs-favoritas") ?? {}) };
  if (b?.on === false) delete mapa[id];
  else {
    const chaves = Object.keys(mapa);
    if (chaves.length >= 500) delete mapa[chaves[0]];
    mapa[id] = {
      chatid: String(b?.chatid ?? ""), chatName: String(b?.chatName ?? "").slice(0, 60),
      texto: String(b?.texto ?? "").slice(0, 140), fromMe: Boolean(b?.fromMe), quando: new Date().toISOString(),
    };
  }
  await saveConfigFor(ws, "msgs-favoritas", mapa);
  return reply.send({ ok: true, total: Object.keys(mapa).length });
});
app.post("/app/inbox/mention-all", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const b = req.body as any;
    const groupJid = String(b?.groupJid ?? "");
    const text = String(b?.text ?? "").trim();
    const hidden = b?.hidden !== false;
    if (!token || !groupJid.endsWith("@g.us")) return reply.code(400).send({ error: "informe o grupo" });
    if (hidden && !text) return reply.code(400).send({ error: "menção oculta precisa de uma mensagem" });
    try {
      await new UazapiGateway(config.uazapi.url, token).mentionAll(groupJid, text, { hidden });
      return reply.send({ ok: true });
    } catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
// Lembretes do CLIENTE (mesma infra; o agendador varre TODOS os workspaces — ver reminders.ts).
app.get("/app/reminders", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const r = getCachedFor<Reminder[]>(ws, "reminders");
  return reply.send({ reminders: Array.isArray(r) ? r : [] });
});
app.put("/app/reminders", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const list = (req.body as any)?.reminders ?? req.body;
  const err = validateReminders(list);
  if (err) return reply.code(400).send({ error: err });
  try {
    await saveConfigFor(ws, "reminders", list as Reminder[]);
    return reply.send({ ok: true, reminders: getCachedFor<Reminder[]>(ws, "reminders") ?? [] });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

app.get("/app/inbox/chats", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    if (!token) return reply.code(400).send({ error: "conecte seu WhatsApp primeiro" });
    const limit = Math.max(1, Math.min(Number((req.query as any)?.limit) || 50, 3000));
    try {
      const mencoes = getCachedFor<Record<string, string>>(ws, "chats-mencao") ?? {};
      const fixados = new Set(getCached<string[]>("chats-fixados:" + idDaInstancia(token)) ?? []);
      const nomes = await nomesManuais(ws);
      return reply.send({ chats: aplicaNomesManuais((await liteChats(token, limit)).map((c) => ({ ...c, mencionado: !!mencoes[c.id], pinned: fixados.has(c.id) })), nomes) });
    }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.get("/app/inbox/messages", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const chatid = String((req.query as any)?.chatid ?? "");
    if (!token || !chatid) return reply.code(400).send({ error: "informe o chatid" });
    try { return reply.send({ messages: await mensagensComArquivo(token, chatid, "lite", ws) }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/send", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const b = req.body as any;
    const to = String(b?.to ?? "");
    const text = String(b?.text ?? "");
    if (!token || !to || !text.trim()) return reply.code(400).send({ error: "faltam dados (destino, texto)" });
    try { const r = await liteSend(token, to, text, b?.mentions ? String(b.mentions) : undefined, b?.replyId ? String(b.replyId) : undefined); await aposEnvioManual(to, r.id, await autorDaSessao(req)); return reply.send({ ok: true, id: r.id }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/send-media", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const b = req.body as any;
    const to = String(b?.to ?? "");
    const type = String(b?.type ?? "image");
    const file = String(b?.file ?? "");
    if (!token || !to || !file) return reply.code(400).send({ error: "faltam dados (destino, arquivo)" });
    try { const r = await liteSendMedia(token, to, type, file, b?.caption ? String(b.caption) : undefined); await aposEnvioManual(to, r.id, await autorDaSessao(req)); return reply.send({ ok: true, id: r.id }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.get("/app/inbox/download", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    const id = String((req.query as any)?.id ?? "");
    if (!token || !id) return reply.code(400).send({ error: "faltam dados (id)" });
    try {
      const curto = id.includes(":") ? id.split(":").pop()! : id;
      return reply.send(await downloadComCache(token, id, curto, ws));
    }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/react", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const b = req.body as any; const id = String(b?.id ?? "");
    if (!token || !id) return reply.code(400).send({ error: "faltam dados (id)" });
    try { await liteReact(token, id, String(b?.emoji ?? "")); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/delete", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const b = req.body as any; const id = String(b?.id ?? "");
    if (!token || !id) return reply.code(400).send({ error: "faltam dados (id)" });
    try { await liteDeleteMessage(token, id); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.get("/app/inbox/participants", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const jid = String((req.query as any)?.jid ?? "");
    if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
    try { return reply.send({ participants: await liteGroupParticipants(token, jid) }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
// Espelhos escopados do modal "Dados da conversa" (o proxy do painel remapeia /admin → /app pro cliente).
app.get("/app/inbox/group-info", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const jid = String((req.query as any)?.chatid ?? "");
    if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
    try { return reply.send(await liteGroupFicha(token, jid)); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/group-add", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const b = req.body as any;
    const jid = String(b?.chatid ?? "");
    const numbers = (Array.isArray(b?.numbers) ? b.numbers : []).map((n: any) => String(n).replace(/\D/g, "")).filter((n: string) => n.length >= 8);
    if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
    if (!numbers.length) return reply.code(400).send({ error: "informe ao menos um número com DDD" });
    try { return reply.send(await liteGroupAdd(token, jid, numbers)); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/group-leave", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const jid = String((req.body as any)?.chatid ?? "");
    if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
    try { await liteGroupLeave(token, jid); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/group-member", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const b = req.body as any;
    const jid = String(b?.chatid ?? "");
    const action = String(b?.action ?? "");
    const participant = String(b?.participant ?? "").replace(/\D/g, "");
    if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
    if (!["promote", "demote", "remove"].includes(action) || !participant) return reply.code(400).send({ error: "ação inválida" });
    try { await liteGroupMember(token, jid, action as "promote" | "demote" | "remove", participant); return reply.send({ ok: true }); }
    catch (e: any) { return reply.code(502).send({ error: e.message }); }
  });
});
app.post("/app/inbox/chat-pin", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req); const b = req.body as any;
    const chatid = String(b?.chatid ?? "");
    if (!token) return reply.code(400).send({ error: "conecte seu WhatsApp primeiro" });
    if (!chatid) return reply.code(400).send({ error: "informe a conversa" });
    const key = "chats-fixados:" + idDaInstancia(token); // mesma chave que o /app/inbox/chats lê
    const lista = (getCached<string[]>(key) ?? []).filter((x) => x !== chatid);
    if (b?.pin) {
      if (lista.length >= PIN_MAX) return reply.code(400).send({ error: `Você já tem ${PIN_MAX} conversas fixadas — desafixe uma pra fixar esta.` });
      lista.unshift(chatid);
    }
    await saveConfig(key, lista);
    return reply.send({ ok: true, pinned: !!b?.pin });
  });
});

// Mídia hospedada do cliente (foto/áudio nos fluxos) — escopada no workspace do cliente.
app.post("/app/media", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  // 💾 Cada arquivo vai pro Postgres (até 60MB). O banco é o MESMO de sessões, inbox e fluxos:
  // disco cheio derruba todos os clientes, não só quem abusou (auditoria 07/09).
  if (rateLimited("upload:" + ws, 60, 3_600_000)) return reply.code(429).send({ error: "muitos envios de arquivo seguidos — aguarde alguns minutos." });
  return runWithWorkspace(ws, () => hospedaMidia(req, reply));
});
// ⚖️ ACEITE DOS TERMOS — a prova de que o cliente foi avisado antes de operar.
// Dois momentos, de propósito:
//  · 'login' → uma vez por versão do texto. Se o texto mudar, todo mundo aceita de novo.
//  · 'canal' → TODA vez que conecta um número. É o aceite que mais vale: foi dado segundos antes
//    de pôr AQUELE número no ar, então não dá pra alegar que "não sabia" depois do banimento.
// 🌐 Idioma do painel. Fica no PERFIL e não só no navegador: quem escolhe inglês e entra de
// outro computador tem que continuar em inglês (e é o que a Meta vê na revisão do app).
app.put("/app/me/idioma", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const idioma = String((req.body as any)?.idioma ?? "");
  if (!["pt", "en", "es"].includes(idioma)) return reply.code(400).send({ error: "idioma inválido" });
  if (dbEnabled) await query("UPDATE users SET idioma=$2 WHERE id=$1", [s.user.id, idioma]);
  return reply.send({ ok: true, idioma });
});

app.get("/app/termos", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const momento = String((req.query as any)?.momento ?? "login") === "canal" ? "canal" : "login";
  const pacote = pacoteTermos(momento);
  // Só o de login "gruda"; o de canal é sempre pedido de novo.
  let aceito = false, aceitoEm: string | null = null;
  if (momento === "login" && dbEnabled) {
    const r = await query<{ aceito_em: string }>(
      "SELECT aceito_em FROM termos_aceites WHERE user_id=$1 AND momento='login' AND versao=$2 ORDER BY aceito_em DESC LIMIT 1",
      [s.user.id, TERMOS_VERSAO],
    ).catch(() => []);
    if (r[0]) { aceito = true; aceitoEm = String(r[0].aceito_em); }
  }
  return reply.send({ ...pacote, aceito, aceitoEm });
});

app.post("/app/termos/aceite", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const b = (req.body ?? {}) as any;
  const momento = String(b?.momento ?? "login") === "canal" ? "canal" : "login";
  // O hash é recalculado AQUI, do texto do servidor — nunca aceitamos o que o navegador diz que
  // leu. Se o cliente mandar um hash diferente, é sinal de tela velha aberta: recusa e recarrega.
  const hash = hashTermos(momento);
  if (b?.hash && String(b.hash) !== hash) {
    return reply.code(409).send({ error: "os termos foram atualizados — recarregue a página", hash });
  }
  // Dispositivo: só o que o navegador consegue informar (tela, fuso, idioma, plataforma).
  // ⚠️ Endereço MAC NÃO existe aqui: nenhum navegador expõe isso a uma página web, em nenhum
  // sistema — é barreira do próprio navegador, não limitação nossa. O par IP + user-agent +
  // horário do SERVIDOR é o que se usa como prova nesse tipo de disputa.
  let dispositivo: string | null = null;
  try {
    const d = b?.dispositivo;
    if (d && typeof d === "object") dispositivo = JSON.stringify(d).slice(0, 1000);
  } catch { /* dispositivo é reforço, não pode derrubar o aceite */ }

  if (!dbEnabled) return reply.code(503).send({ error: "banco indisponível — tente de novo em instantes" });
  await query(
    `INSERT INTO termos_aceites
       (workspace_id, user_id, email, nome, momento, versao, hash_termos, ip, user_agent, dispositivo, referencia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [s.workspace?.id ?? null, s.user.id, s.user.email ?? null, s.user.name ?? null,
     momento, TERMOS_VERSAO, hash, clientIp(req),
     String(req.headers["user-agent"] ?? "").slice(0, 500), dispositivo,
     String(b?.referencia ?? "").slice(0, 120) || null],
  );
  console.log(`⚖️  termos aceitos · ${s.user.email} · ${momento} · ${TERMOS_VERSAO} · ip ${clientIp(req)}`);
  return reply.send({ ok: true });
});

// A prova, do lado do dono: histórico completo de aceites pra anexar numa resposta jurídica.
app.get("/admin/termos-aceites", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  if (!dbEnabled) return reply.send({ aceites: [] });
  const q = req.query as any;
  const email = String(q?.email ?? "").trim().toLowerCase();
  const linhas = await query(
    `SELECT id, workspace_id, user_id, email, nome, momento, versao, hash_termos, ip, user_agent,
            dispositivo, referencia, aceito_em
       FROM termos_aceites
      ${email ? "WHERE lower(email) = $1" : ""}
      ORDER BY aceito_em DESC LIMIT 500`,
    email ? [email] : [],
  ).catch(() => []);
  return reply.send({ aceites: linhas, versaoAtual: TERMOS_VERSAO, hashAtual: { login: hashTermos("login"), canal: hashTermos("canal") } });
});

// QUEM passou por uma etapa — versão do CLIENTE (o admin usa /admin/flow-node-leads). Sem esta
// rota, o cliente clicava no número do funil e recebia 404: o remap /admin/* → /app/* não achava
// destino. Escopada no workspace da sessão, então ninguém vê lead de outro.
app.get("/app/flow-node-leads", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    const automationId = String(q?.automationId ?? "");
    const nodeId = String(q?.nodeId ?? "");
    if (!automationId || !nodeId) return reply.code(400).send({ error: "automationId e nodeId obrigatórios" });
    return reply.send({ leads: await getNodeLeads(automationId, nodeId, q?.since ? String(q.since) : null, q?.until ? String(q.until) : null) });
  });
});

app.get("/app/flow-totals", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => reply.send({ totals: await getFlowTotals() }));
});

// Funil por nó (stats) do cliente.
app.get("/app/flow-stats", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    const automationId = String(q?.automationId ?? "");
    if (!automationId) return reply.code(400).send({ error: "automationId obrigatório" });
    return reply.send(await getFlowStats(automationId, q?.since ? String(q.since) : null, q?.until ? String(q.until) : null));
  });
});
// Templates da API Oficial — cliente LITE não tem conta oficial: lista vazia (o builder degrada suave).
// ── API OFICIAL DO CLIENTE (Fase 4b): o wizard /oficial funciona pro workspace da sessão ──────
// Espelho escopado do /admin/meta — o proxy do painel remapeia /admin/meta → /app/meta pro cliente.
// ── Credenciais da Meta: NUNCA voltam ao navegador e ficam CRIPTOGRAFADAS no config ──────────
// Auditoria 06/08: o GET devolvia accessToken/appSecret inteiros pro browser (e atendente lia o do
// dono). Agora o padrão é o mesmo da chave OpenAI: write-only + last4. Aceita o formato ANTIGO
// (valor cru) pra não quebrar quem já está conectado — na próxima gravação vira criptografado.
function metaSegredo(cfg: any, campo: "accessToken" | "appSecret"): string {
  if (!cfg) return "";
  const enc = cfg[campo + "Enc"];
  if (enc) return decryptSecret(String(enc)) ?? "";
  return String(cfg[campo] ?? ""); // legado em claro
}
// O token de verificação precisa existir NO SERVIDOR antes de a Meta bater no /webhooks/meta.
// Armadilha antiga (Admin em julho, cliente Roba em 06/08): o wizard gerava o token no NAVEGADOR,
// a pessoa colava na Meta e clicava "Verificar" LÁ — mas aqui ele só era salvo ao clicar "Salvar",
// então o handshake dava 403 e parecia erro da Meta. Agora o motor gera e PERSISTE ao abrir a tela.
async function garanteVerifyToken(wsId: string): Promise<any> {
  const cfg = getCachedFor<any>(wsId, "meta-official") ?? {};
  if (cfg.verifyToken) return cfg;
  const novo = { ...cfg, verifyToken: "zc-" + randomUUID() };
  await saveConfigFor(wsId, "meta-official", novo).catch(() => {});
  return novo;
}

function metaParaPainel(cfg: any): Record<string, unknown> {
  const tok = metaSegredo(cfg, "accessToken");
  const sec = metaSegredo(cfg, "appSecret");
  return {
    phoneNumberId: cfg?.phoneNumberId ?? "",
    wabaId: cfg?.wabaId ?? "",
    // Segredos NÃO voltam: só a marca de configurado + últimos 4 (igual openai-key).
    accessToken: "", accessTokenLast4: tok ? tok.slice(-4) : "", accessTokenConfigured: !!tok,
    appSecret: "", appSecretConfigured: !!sec,
    verifyToken: cfg?.verifyToken ?? "", // não é segredo de acesso: é o handshake que o dono cola na Meta
    connected: !!cfg?.connected,
    displayNumber: cfg?.displayNumber ?? "",
    verifiedName: cfg?.verifiedName ?? "",
    webhookUrl: META_WEBHOOK_URL,
  };
}
// Monta o objeto a SALVAR: campo vazio no PUT = mantém o segredo atual (o painel nunca reenvia).
function metaParaSalvar(b: any, atual: any): Record<string, unknown> {
  const tokNovo = String(b?.accessToken ?? "").trim();
  const secNovo = String(b?.appSecret ?? "").trim();
  const tok = tokNovo || metaSegredo(atual, "accessToken");
  const sec = secNovo || metaSegredo(atual, "appSecret");
  return {
    phoneNumberId: String(b?.phoneNumberId ?? "").trim(),
    wabaId: String(b?.wabaId ?? "").trim(),
    accessTokenEnc: tok ? encryptSecret(tok) : "",
    appSecretEnc: sec ? encryptSecret(sec) : "",
    verifyToken: String(b?.verifyToken ?? "").trim() || String(atual?.verifyToken ?? ""),
    connected: !!b?.connected,
    displayNumber: String(b?.displayNumber ?? "").trim(),
    verifiedName: String(b?.verifiedName ?? "").trim(),
  };
}

// ── EMBEDDED SIGNUP: conectar a conta oficial em 1 clique ────────────────────
// Hoje o cliente faz ~10 passos manuais na Meta (criar app, token, webhook, registrar número) —
// o caminho que travou o próprio Admin 3×. Com o app como Tech Provider, o popup da Meta devolve
// um `code` e o motor faz o resto: troca por token, assina o webhook e registra o número.
// O resultado é gravado no MESMO "meta-official" de sempre → o painel inteiro já funciona por cima.
function embeddedDisponivel(): boolean {
  const m = config.metaApp;
  return !!(m.appId && m.appSecret && m.configId);
}
// Qual segredo ASSINA o webhook deste workspace. Na conexão manual é o App Secret do app do próprio
// cliente; no 1-clique o app é o NOSSO (Tech Provider), então quem assina é o segredo da plataforma.
// ⚠️ Sem isto, todo cliente conectado pelo 1-clique teria as mensagens rejeitadas por "assinatura
// inválida" — conecta e não chega nada, o erro mais difícil de diagnosticar desse fluxo.
// Continua FAIL-CLOSED: quem não tem nenhum dos dois segue rejeitado.
function segredoAssinatura(cfg: any): string {
  return metaSegredo(cfg, "appSecret") || (cfg?.viaEmbedded ? config.metaApp.appSecret : "");
}
app.get("/admin/meta/embedded", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ disponivel: embeddedDisponivel(), appId: config.metaApp.appId, configId: config.metaApp.configId });
});
app.get("/app/meta/embedded", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ disponivel: embeddedDisponivel(), appId: config.metaApp.appId, configId: config.metaApp.configId });
});
// Fecha o ciclo do popup. Recebe o `code` (uso único) + o que o popup informou, e devolve o status
// de cada etapa — separado de propósito: quando algo falha, o painel diz O QUE falhou em vez de um
// "não deu certo" genérico (o pior atrito da conexão manual foi justamente não saber onde travou).
async function embeddedSignupHandler(wsId: string, b: any, reply: any) {
  if (!embeddedDisponivel()) return reply.code(400).send({ error: "conexão em 1 clique ainda não está configurada neste servidor" });
  const code = String(b?.code ?? "").trim();
  if (!code) return reply.code(400).send({ error: "o popup da Meta não devolveu o código — tente conectar de novo" });
  const pin = /^\d{6}$/.test(String(b?.pin ?? "")) ? String(b.pin) : "";
  const etapas: Record<string, string> = {};
  try {
    const token = await metaTrocaCodePorToken(code, config.metaApp.appId, config.metaApp.appSecret);
    etapas.token = "ok";

    let wabaId = String(b?.wabaId ?? "").trim();
    if (!wabaId) wabaId = await metaWabaDoToken(token, config.metaApp.appId, config.metaApp.appSecret).catch(() => "");
    if (!wabaId) return reply.code(502).send({ error: "conectou, mas não achei a conta do WhatsApp (WABA) — refaça o passo escolhendo a conta no popup", etapas });
    etapas.waba = wabaId;

    let phoneNumberId = String(b?.phoneNumberId ?? "").trim();
    let displayNumber = "", verifiedName = "";
    const nums = await metaNumerosDaWaba(wabaId, token).catch(() => []);
    const escolhido = nums.find((n) => n.id === phoneNumberId) ?? nums[0];
    if (escolhido) { phoneNumberId = escolhido.id; displayNumber = escolhido.display_phone_number ?? ""; verifiedName = escolhido.verified_name ?? ""; }
    if (!phoneNumberId) return reply.code(502).send({ error: "a conta conectou mas não tem número disponível — conclua o cadastro do número na Meta e tente de novo", etapas });
    etapas.numero = displayNumber || phoneNumberId;

    // Sem assinar, o número conecta e NUNCA recebe mensagem (o "conectou e não chega nada").
    await metaAssinaAppNaWaba(wabaId, token);
    etapas.webhook = "assinado";

    // Métricas de template só existem depois de ligadas, e NÃO são retroativas (documentação da
    // Meta, conferida 20/08). Ligando aqui, toda conta nova já nasce contando — sem isso o cliente
    // dispara por semanas e, quando abre os Insights, encontra tudo zerado sem entender por quê.
    // Falhar aqui não pode derrubar uma conexão que já deu certo: só avisa.
    try {
      await metaAtivaInsights(wabaId, token);
      etapas.metricas = "ligadas";
    } catch (e: any) {
      etapas.metricas = "não deu pra ligar agora (dá pra ligar depois em Templates → Insights)";
      console.log("📊 não consegui ligar as métricas de template:", e?.message ?? e);
    }

    // Registrar é o que libera o ENVIO. Sem PIN não dá pra registrar — não é impeditivo pra receber,
    // então segue com aviso em vez de derrubar tudo que já deu certo.
    if (pin) {
      const r = await metaRegistraNumero(phoneNumberId, token, pin).catch((e: any) => { etapas.registro = "falhou: " + String(e?.message ?? e); return null; });
      if (r) etapas.registro = r.jaRegistrado ? "já estava registrado" : "registrado";
    } else {
      etapas.registro = "pulado (sem PIN) — o número recebe, mas só envia depois de registrar";
    }

    // Preserva o verifyToken que já existe (o webhook do ws não pode mudar por causa disto).
    const atual = getCachedFor<any>(wsId, "meta-official") ?? {};
    await saveConfigFor(wsId, "meta-official", {
      ...atual,
      phoneNumberId, wabaId,
      accessTokenEnc: encryptSecret(token),
      // O segredo do app agora é da PLATAFORMA (o app é nosso, não do cliente) — a verificação de
      // assinatura do webhook usa config.metaApp.appSecret; nada de pedir App Secret pro cliente.
      appSecretEnc: atual.appSecretEnc ?? "",
      verifyToken: String(atual.verifyToken ?? ""),
      connected: true,
      displayNumber, verifiedName,
      viaEmbedded: true,
      conectadoEm: new Date().toISOString(),
    });
    return reply.send({ ok: true, etapas, phoneNumberId, wabaId, displayNumber, verifiedName });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e), etapas });
  }
}
app.post("/admin/meta/embedded", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return embeddedSignupHandler(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/meta/embedded", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  // 🎟️ Teto do plano na porta do 1-clique (a checagem fica AQUI, e não no handler, porque o
  // super-admin usa o mesmo handler pelo /admin e conecta quantos quiser). Quem já tem número
  // oficial passa: aí é troca/reconexão do mesmo slot, não número novo.
  if (!String(getCachedFor<any>(ws, "meta-official")?.phoneNumberId ?? "").trim()) {
    const limite = Math.max(1, Number(getCachedFor<number>(ws, "number-limit")) || 1);
    if (numerosOcupados(ws).total >= limite) return reply.code(403).send({ error: recadoDoTeto(ws, limite), limitReached: true, limit: limite });
  }
  return embeddedSignupHandler(ws, req.body, reply);
});

app.get("/app/meta", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send(metaParaPainel(await garanteVerifyToken(ws)));
});
app.put("/app/meta", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body as any) ?? {};
  const atual = getCachedFor<any>(ws, "meta-official");
  const cfg = metaParaSalvar(b, atual);
  if (!cfg.verifyToken) return reply.code(400).send({ error: "token de verificação é obrigatório" });
  // 🎟️ TETO DO PLANO. Só barra quem está ADICIONANDO um número oficial que ainda não existia:
  // trocar o phoneNumberId (migrou de número) ou só atualizar o token continua livre, senão o
  // cliente ficaria preso sem conseguir consertar a própria conexão.
  if (cfg.phoneNumberId && !String(atual?.phoneNumberId ?? "").trim()) {
    const limite = Math.max(1, Number(getCachedFor<number>(ws, "number-limit")) || 1);
    if (numerosOcupados(ws).total >= limite) return reply.code(403).send({ error: recadoDoTeto(ws, limite), limitReached: true, limit: limite });
  }
  // Um phoneNumberId só pode ter UM dono — senão o roteamento do webhook vira loteria.
  if (cfg.phoneNumberId) {
    const outro = scanConfig<any>("meta-official").find((c) => c.wsId !== ws && String(c.value?.phoneNumberId ?? "") === cfg.phoneNumberId);
    if (outro) return reply.code(409).send({ error: "esse número já está conectado em outra conta — fale com o suporte" });
    // PROVA DE POSSE (auditoria 06/08): sem isto, alguém cadastrava o phoneNumberId de OUTRO
    // cliente e sequestrava o roteamento do webhook. A Graph API só responde pra quem tem o token.
    const tokenUso = metaSegredo(cfg, "accessToken");
    if (tokenUso) {
      try { await metaPhoneInfo(String(cfg.phoneNumberId), tokenUso); }
      catch { return reply.code(400).send({ error: "esse Phone Number ID não confere com o Access Token — revise os dois na Meta" }); }
    }
  }
  try {
    await saveConfigFor(ws, "meta-official", cfg);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});
app.post("/app/meta/test", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body as any) ?? {};
  const cfgCli = getCachedFor<any>(ws, "meta-official");
  const phoneNumberId = String(b.phoneNumberId ?? "").trim() || String(cfgCli?.phoneNumberId ?? "");
  const accessToken = String(b.accessToken ?? "").trim() || metaSegredo(cfgCli, "accessToken");
  if (!phoneNumberId || !accessToken) return reply.code(400).send({ error: "informe Phone Number ID e Access Token" });
  try {
    const info = await metaPhoneInfo(phoneNumberId, accessToken);
    return reply.send({ ok: true, displayNumber: info.display_phone_number ?? "", verifiedName: info.verified_name ?? "", quality: info.quality_rating ?? "" });
  } catch (e: any) {
    return reply.code(200).send({ ok: false, error: e.message });
  }
});

app.get("/app/meta/templates", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    if (!listaWabas(ws).length) return reply.send({ templates: [], wabas: [] });
    try { return reply.send(await listaTemplatesTodasWabas(ws)); }
    catch { return reply.send({ templates: [], wabas: [] }); }
  });
});

// CRM/Contatos DO CLIENTE (lista + etiquetas + fluxos por onde passou) — escopado no ws do cliente.
app.get("/app/contacts", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    const res = await listContacts({ search: q.search, filter: q.filter, tag: q.tag, limit: Number(q.limit), offset: Number(q.offset) });
    const nameById = new Map(loadAutomations().map((a) => [a.id, a.name || a.id]));
    const contacts = res.contacts.map((c) => {
      const flows = (c.flow_ids ?? []).map((id) => ({ id, name: nameById.get(id) ?? "(fluxo removido)", exists: !!nameById.get(id) }));
      const { flow_ids, ...rest } = c; void flow_ids;
      return { ...rest, flows };
    });
    return reply.send({ contacts, total: res.total });
  });
});
// Sincroniza os contatos do WhatsApp do cliente (importa conversas 1:1 + fotos) — usa o token DELE.
app.post("/app/contacts/refresh-avatars", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    if (!token) return reply.code(400).send({ error: "conecte seu WhatsApp primeiro" });
    const r = await syncLiteContacts({ token, mediaBase: MEDIA_PUBLIC_BASE }).catch(() => ({ imported: 0, avatars: 0 }));
    return reply.send({ ok: true, imported: r.imported, avatars: r.avatars });
  });
});
// Importa contatos de ARQUIVO (csv/txt/xlsx lidos no painel) com tags opcionais. O painel manda
// a lista já limpa; aqui só se normaliza o telefone de novo (defesa), grava e etiqueta.
// Origem "importacao" pra dar pra segmentar depois no Disparador ("Por origem").
// MESMA regra do painel (app/web/src/lib/importar-contatos.ts): só põe 55 no que TEM CARA de
// brasileiro. Pôr 55 em tudo que tem 10-11 dígitos mandava celular dos EUA/Espanha/Austrália
// para um brasileiro qualquer com o mesmo número (caso real 25/09, lista de 300 com 6 assim).
const DDD_BR_IMPORT = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
  51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
function normalizaTelImport(bruto: unknown): string {
  const d = String(bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  const ddd = Number(d.slice(0, 2));
  const brSemDdi = DDD_BR_IMPORT.has(ddd)
    && ((d.length === 11 && d[2] === "9") || (d.length === 10 && /[2-5]/.test(d[2])));
  if (brSemDdi) return "55" + d;
  return d.length >= 10 && d.length <= 15 ? d : ""; // já vem com o código do país
}
async function importarContatosHandler(body: any, reply: any) {
  const lista = Array.isArray(body?.contatos) ? body.contatos : [];
  const tags = (Array.isArray(body?.tags) ? body.tags : []).map((t: unknown) => String(t ?? "").trim()).filter((t: string) => t && t.length <= 60).slice(0, 10);
  if (!lista.length) return reply.code(400).send({ error: "lista vazia — nenhum número válido no arquivo" });
  if (lista.length > 20000) return reply.code(400).send({ error: "no máximo 20.000 contatos por importação" });
  const entries: Array<{ phone: string; name?: string | null }> = [];
  for (const c of lista) {
    const phone = normalizaTelImport(c?.numero ?? c?.telefone ?? c?.phone);
    if (!phone) continue;
    const nome = String(c?.nome ?? c?.name ?? "").trim().slice(0, 120);
    entries.push({ phone, name: nome || null });
  }
  if (!entries.length) return reply.code(400).send({ error: "nenhum número válido (use DDD + número, com ou sem 55)" });
  const importados = await bulkImportContacts(entries, "importacao");
  if (tags.length) await bulkAddContactTags(entries.map((e) => e.phone), tags, "importacao");
  console.log(`👥 import arquivo: ${importados}/${entries.length} contatos · tags: ${tags.join(", ") || "-"}`);
  return reply.send({ ok: true, total: lista.length, validos: entries.length, importados, tags });
}
app.post("/app/contacts/import", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => importarContatosHandler(req.body, reply));
});
app.post("/admin/contacts/import", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return importarContatosHandler(req.body, reply);
});
// Importa a AGENDA do celular do CLIENTE (espelho do /admin/contacts/import-agenda) — token DELE.
app.post("/app/contacts/import-agenda", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const token = tokenDaConta(req);
    if (!token) return reply.code(400).send({ error: "conecte seu WhatsApp primeiro" });
    try {
      const agenda = await liteAgendaContacts(token);
      const importados = await bulkImportContacts(agenda, "agenda");
      return reply.send({ ok: true, total: agenda.length, importados });
    } catch (e: any) {
      return reply.code(502).send({ error: "não consegui ler a agenda: " + String(e?.message ?? e) });
    }
  });
});
// Etiquetas do contato pelo CHAT: ler e pôr/tirar (casa as duas formas do 9º dígito). Atendente
// pode — etiquetar o lead é trabalho de atendimento (criar/renomear a etiqueta da conta, não).
async function tagsDoChatGet(q: any, reply: any) {
  const tel = String(q?.phone ?? "").replace(/@.*/, "").replace(/\D/g, "");
  if (tel.length < 8) return reply.code(400).send({ error: "conversa sem telefone" });
  return reply.send({ tags: await getContactTags(tel) });
}
async function tagsDoChatPost(b: any, reply: any) {
  const tel = String(b?.phone ?? "").replace(/@.*/, "").replace(/\D/g, "");
  if (tel.length < 8) return reply.code(400).send({ error: "conversa sem telefone" });
  const lista = (v: any) => (Array.isArray(v) ? v.map((x: any) => String(x ?? "")) : []);
  const add = lista(b?.add);
  const tags = await editContactTagsByChat(tel, add, lista(b?.remove));
  // 🔵 Etiqueta da Meta no meio? Dispara o evento da CAPI de mensagens e devolve o resultado —
  // o painel mostra na hora se a Meta aceitou, se faltou clique ou se já tinha sido enviado.
  const capi = [];
  for (const t of add) if (etiquetaMeta(t)) capi.push(await disparaEtiquetaMeta(tel, t, Number(b?.valor) > 0 ? Number(b.valor) : null, !!b?.forcar));
  return reply.send({ ok: true, tags, ...(capi.length ? { capi } : {}) });
}
app.get("/admin/inbox/tags", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return tagsDoChatGet(req.query, reply);
});
app.post("/admin/inbox/tags", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return tagsDoChatPost(req.body, reply);
});
app.get("/app/inbox/tags", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => tagsDoChatGet(req.query, reply));
});
app.post("/app/inbox/tags", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => tagsDoChatPost(req.body, reply));
});

// Edita a ficha do contato (nome, e-mail, tags, opt-out) e exclui o contato.
async function editarContatoHandler(phone: string, body: any, reply: any) {
  const tel = String(phone || "").replace(/\D/g, "");
  if (!tel) return reply.code(400).send({ error: "telefone inválido" });
  const campos: { name?: string | null; email?: string | null; notes?: string | null; optedOut?: boolean } = {};
  if (body?.nome !== undefined) campos.name = String(body.nome ?? "").trim().slice(0, 120) || null;
  if (body?.email !== undefined) campos.email = String(body.email ?? "").trim().slice(0, 160) || null;
  if (body?.notas !== undefined) campos.notes = String(body.notas ?? "").trim().slice(0, 2000) || null;
  if (body?.optOut !== undefined) campos.optedOut = !!body.optOut;
  const ok = Object.keys(campos).length ? await updateContact(tel, campos) : true;
  if (!ok) return reply.code(404).send({ error: "contato não encontrado" });
  if (Array.isArray(body?.tags)) await setContactTags(tel, body.tags.map((t: unknown) => String(t ?? "")));
  const d = await getContactDetail(tel);
  return reply.send({ ok: true, ...(d ?? {}) });
}
async function excluirContatoHandler(phone: string, reply: any) {
  const tel = String(phone || "").replace(/\D/g, "");
  if (!tel) return reply.code(400).send({ error: "telefone inválido" });
  const ok = await deleteContact(tel);
  if (!ok) return reply.code(404).send({ error: "contato não encontrado" });
  console.log(`🗑 contato excluído: ${tel}`);
  return reply.send({ ok: true });
}
app.put("/app/contacts/:phone", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => editarContatoHandler(String((req.params as any).phone || ""), req.body, reply));
});
app.delete("/app/contacts/:phone", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => excluirContatoHandler(String((req.params as any).phone || ""), reply));
});
app.get("/app/contacts/:phone", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const d = await getContactDetail(String((req.params as any).phone || ""));
    if (!d) return reply.code(404).send({ error: "contato não encontrado" });
    return reply.send(d);
  });
});
// Segmentos do Disparador do CLIENTE (espelhos; estáticas vencem o :phone).
app.get("/app/contacts/segments", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => reply.send(await segmentOptions()));
});
app.get("/app/contacts/segment", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    return reply.send({ contatos: await contactsForSegment({ origem: q.origem || undefined, tag: q.tag || undefined }) });
  });
});

// Recebe os eventos que a UazAPI manda (grupos, mensagens...). Aceita só a nossa instância.
// Handler compartilhado: a rota exata E a coringa /uazapi/* (a UazAPI, com addUrlTypesMessages
// ligado, posta em /uazapi/text, /uazapi/image… — já foi 404 silencioso que descartava TODO
// inbound; a coringa garante que nunca mais se perde mensagem por sufixo de URL).
// Marca "mencionaram você" numa conversa (config "chats-mencao": chatid → ISO). O dono é
// reconhecido pelos ÚLTIMOS 8 DÍGITOS (o JID às vezes vem sem o 9 — mesma pegadinha do allowlist).
async function marcarMencao(wsId: string, chatid: string, texto: string, owner: string): Promise<void> {
  const meus = new Set<string>();
  if (owner) meus.add(chaveTel(owner));
  for (const i of getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? []) if ((i as any).number) meus.add(chaveTel((i as any).number));
  if (!meus.size) return;
  const marcados = Array.from(texto.matchAll(/@(\d{6,})/g)).map((m) => chaveTel(m[1]));
  if (!marcados.some((m) => meus.has(m))) return;
  const mapa = { ...(getCachedFor<Record<string, string>>(wsId, "chats-mencao") ?? {}) };
  mapa[chatid] = new Date().toISOString();
  const chaves = Object.keys(mapa);
  if (chaves.length > 300) delete mapa[chaves[0]]; // teto
  await saveConfigFor(wsId, "chats-mencao", mapa);
}
// Abrir/ler a conversa limpa o "@" dela.
async function limparMencao(wsId: string, chatid: string): Promise<void> {
  const mapa = getCachedFor<Record<string, string>>(wsId, "chats-mencao") ?? {};
  if (!mapa[chatid]) return;
  const novo = { ...mapa };
  delete novo[chatid];
  await saveConfigFor(wsId, "chats-mencao", novo);
}

const uazapiWebhookHandler = async (req: any, reply: any) => {
  const body = req.body as any;
  // ROTEAMENTO POR INSTÂNCIA (multi-tenant): o token no payload diz QUAL número recebeu → resolvo o
  // workspace dono. FAIL-CLOSED: token presente e NÃO registrado = rejeita (nunca cai no primário, senão
  // um inbound de número desconhecido viraria dado do dono). Token da instância principal = primário.
  const token = String(body?.token ?? "");
  // FAIL-CLOSED: o webhook da UazAPI é PÚBLICO e SEM assinatura — o token da instância é a única prova de
  // origem (e é sempre enviado: é a chave do roteamento do inbound). SEM token = requisição forjada →
  // rejeita. Antes, token vazio caía no primário (do dono), deixando qualquer um injetar contato/
  // opt-out/keyword no workspace dele pelo endpoint público. Agora só entra token conhecido.
  if (!token) return reply.code(401).send({ error: "sem token de instância" });
  let wsId: string;
  if (token === config.uazapi.token) {
    wsId = getPrimaryWorkspace(); // instância principal do dono
  } else {
    const found = await lookupWorkspaceByToken(token);
    if (!found) return reply.code(401).send({ error: "instância não registrada" });
    wsId = found;
    // Flag "não automatizar": número conectado mas DORMENTE — recebe, mas não roda fluxo/agente/keyword.
    const inst = (getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? []).find((x) => x.token === token);
    if (inst?.noAuto) return reply.code(200).send({ ok: true, muted: true });
  }
  // Canhão de saída = a instância QUE RECEBEU (não o número do dono). Principal → gateway padrão.
  const gw = token !== config.uazapi.token ? new UazapiGateway(config.uazapi.url, token) : gateway;

  const grp = parseUazapiGroupChange(body);
  if (grp && grp.joins.length > 0) {
    console.log(`📥 uazapi · grupo ${grp.groupJid} · entraram: ${grp.joins.join(", ")}`);
    setImmediate(() => runWithWorkspace(wsId, () => handleGroupJoins(grp.groupJid, grp.joins, gw)));
  }

  // Mensagem dentro de um grupo → guarda para o resumo do dia (só se o grupo estiver na config).
  const gmsg = parseUazapiGroupMessage(body);
  if (gmsg && !gmsg.fromMe && gmsg.text) {
    runWithWorkspace(wsId, () => captureGroupMessage({ groupJid: gmsg.groupJid, senderName: gmsg.senderName, text: gmsg.text }));
    // @ NA LISTA: alguém MARCOU o dono numa conversa → o painel mostra o "@" no chat (igual
    // WhatsApp). A UazAPI não expõe isso no /chat/find, então detectamos aqui pelo texto.
    // Some quando a conversa é marcada como lida (/inbox/read).
    void marcarMencao(wsId, gmsg.groupJid, gmsg.text, body?.owner ?? "").catch(() => {});
  }

  // Mensagem recebida (1:1). Dedup dos retries (chave por WORKSPACE pra ids de instâncias diferentes não
  // colidirem), responde rápido, e processa SERIALIZADO por (workspace+telefone) — tenants distintos com o
  // mesmo telefone de lead NÃO compartilham fila. Toda a lógica roda embrulhada no workspace resolvido.
  const msg = parseUazapiMessage(body);
  // 📚 ARQUIVO: guarda TODA mensagem que passa (1:1 e grupo, minha e do lead) no nosso banco.
  // É o que garante o histórico mesmo com o painel fechado e depois que a UazAPI descartar.
  if (msg?.id) {
    const chatId = String(body?.message?.chatid ?? (msg.isGroup ? "" : msg.from + "@s.whatsapp.net"));
    const contMsg = body?.message?.content;
    if (chatId) {
      void arquivarMensagens(chatId, [{
        msg_id: msg.id, mid: msg.mediaId || undefined, from_me: msg.fromMe,
        sender_name: msg.name || undefined, body: msg.text ?? "", msg_type: msg.type || undefined,
        ts: Number(body?.message?.messageTimestamp) || Math.floor(Date.now() / 1000),
        // A CITAÇÃO vai pro arquivo junto: sem isso ela só existiria enquanto a mensagem
        // estivesse "viva" na UazAPI, e sumiria do histórico depois.
        extra: contMsg && typeof contMsg === "object"
          ? { waveform: (contMsg as any).waveform, seconds: (contMsg as any).seconds, citacao: citacaoDoConteudo(contMsg),
              // 📍 as coordenadas só existem no content: sem isto a localização vira "Localização" seca no arquivo
              local: /location/i.test(msg.type || "") ? extrairLocal(contMsg, msg.type) : undefined }
          : undefined,
      }], token === config.uazapi.token ? "lite" : "lite-" + token.slice(0, 8), wsId).catch(() => {});
      // 📣 LEAD DE ANÚNCIO no LITE (Click-to-WhatsApp): o conteúdo traz contextInfo.externalAdReply
      // na 1ª mensagem — era ignorado (só a citação era lida). Mesmo tratamento da API Oficial:
      // marcador na conversa (com miniatura re-hospedada), etiqueta anuncio-wpp e ficha. Nomes de
      // campo lidos de forma DEFENSIVA (a UazAPI varia a caixa: ctwaClid/ctwa_clid, thumbnailUrl/…).
      const adReply: any = (contMsg as any)?.contextInfo?.externalAdReply;
      if (adReply && typeof adReply === "object" && !msg.fromMe && !msg.isGroup) {
        const contaLite = token === config.uazapi.token ? "lite" : "lite-" + token.slice(0, 8);
        const tsAd = (Number(body?.message?.messageTimestamp) || Math.floor(Date.now() / 1000)) - 1;
        void (async () => {
          try {
            const clid = String(adReply.ctwaClid ?? adReply.ctwa_clid ?? "").trim();
            const titulo = String(adReply.title ?? adReply.headline ?? "").trim().slice(0, 120);
            const link = String(adReply.sourceUrl ?? adReply.source_url ?? adReply.sourceURL ?? "").trim().slice(0, 300);
            // miniatura: pode vir como URL ou como bytes base64 (thumbnail)
            let thumb = "";
            let buf: Buffer | null = null;
            let mime = "image/jpeg";
            const b64 = typeof adReply.thumbnail === "string" && adReply.thumbnail.length > 50 ? adReply.thumbnail : "";
            const urlThumb = String(adReply.thumbnailUrl ?? adReply.thumbnail_url ?? adReply.thumbnailURL ?? "").trim();
            if (b64) { try { buf = Buffer.from(b64, "base64"); } catch { buf = null; } }
            else if (/^https?:\/\//.test(urlThumb)) {
              const r = await fetch(urlThumb, { signal: AbortSignal.timeout(8_000) });
              const m2 = r.headers.get("content-type") ?? "image/jpeg";
              if (r.ok && /^image\//.test(m2)) { buf = Buffer.from(await r.arrayBuffer()); mime = m2; }
            }
            if (buf && buf.length && buf.length <= 2 * 1024 * 1024) {
              const idm = mediaIdFor(buf, mime);
              await saveMedia(idm, mime, buf, wsId);
              thumb = `${MEDIA_PUBLIC_BASE}/media/${idm}`;
            }
            const linhas = [
              "Lead veio de ANÚNCIO (Click-to-WhatsApp)",
              titulo ? `Anúncio: ${titulo}` : "",
              link ? `Link: ${link}` : "",
              clid ? `Clique: ${clid.slice(0, 40)}…` : "",
            ].filter(Boolean);
            const extraAnuncio = { ...(titulo ? { headline: titulo } : {}), ...(link ? { url: link } : {}), ...(thumb ? { thumb } : {}) };
            await arquivarMensagens(chatId, [{
              msg_id: msg.id + "-ctwa", from_me: false, sender_name: "Sistema",
              body: linhas.join("\n"), msg_type: "ctwa", ts: tsAd,
              ...(Object.keys(extraAnuncio).length ? { extra: { anuncio: extraAnuncio } } : {}),
            }], contaLite, wsId);
            if (titulo) void setContactField(msg.from, "anuncio_headline", titulo, wsId).catch(() => {});
            if (link) void setContactField(msg.from, "anuncio_link", link, wsId).catch(() => {});
            if (clid) void setContactField(msg.from, "anuncio_clique", clid.slice(0, 400), wsId).catch(() => {});
            if (thumb) void setContactField(msg.from, "anuncio_thumb", thumb, wsId).catch(() => {});
            void addContactTag(msg.from, "anuncio-wpp", "ctwa", wsId).catch(() => {});
            void setContactField(msg.from, "anuncio_em", String(Math.floor(Date.now() / 1000)), wsId).catch(() => {});
            console.log(`📣 lite · ${msg.from} veio de anúncio CTWA${titulo ? ` ("${titulo}")` : ""} → ws ${wsId.slice(0, 8)}`);
          } catch (e: any) {
            console.error("ctwa lite:", e?.message ?? e);
          }
        })();
      }
    }
  }
  // ⚠️ Antes o filtro era só `msg.text || msg.isAudio`: FOTO, VÍDEO, DOCUMENTO e FIGURINHA sem
  // legenda eram descartados AQUI, na porta de entrada — a agente nunca via a imagem (respondia
  // "não consigo ver a foto") e todo o código de visão ficava inalcançável.
  // 👥 GATILHOS DE GRUPO — mensagem de grupo NUNCA entrava no motor (era descartada logo abaixo,
  // no `!msg.isGroup`), então nenhum fluxo podia reagir a grupo. Agora dois gatilhos escutam:
  //   • "Me marcaram num grupo": o texto cita @<número da instância>;
  //   • "Palavra-chave num grupo": a palavra bate (exato/contém), igual ao 1:1.
  // O fluxo responde no PRIVADO de quem escreveu (não polui o grupo). Sai da frente rápido quando
  // não há fluxo de grupo ativo — grupo é onde mais chega mensagem, não pode custar caro.
  if (msg && msg.isGroup && !msg.fromMe && msg.text) {
    const grupoJid = String(body?.message?.chatid ?? "");
    void runWithWorkspace(wsId, async () => {
      const contaGrupo = token === config.uazapi.token ? "lite" : idDaInstancia(token);
      const flows = loadAutomations().filter(
        (a: any) => a.enabled !== false && (a.trigger === "group_mention" || a.trigger === "group_keyword") && fluxoNoNumero(a, contaGrupo),
      );
      if (!flows.length) return;
      if (msg.id && (await isDuplicate("uazg:" + wsId + ":" + msg.id))) return;
      const txt = msg.text.trim().toLowerCase();
      // "me marcaram": a menção aparece no TEXTO como @<numero> (a UazAPI não manda campo próprio).
      const meuNumero = String((await liteInstanceStatus(token).catch(() => null))?.number ?? "").replace(/\D/g, "");
      // Menção: pega CADA "@<dígitos>" do texto e compara pelo FINAL (8 dígitos). Comparar o número
      // inteiro falha — o WhatsApp marca ora com DDI ("@5511999999999"), ora só o número, e o 9º
      // dígito varia. E procurar "@"+final também falha, porque o @ vem antes do DDI (teste pegou).
      const fim8 = meuNumero.slice(-8);
      const meMarcou = !!fim8 && [...txt.matchAll(/@(\d{6,})/g)].some((m) => m[1].endsWith(fim8));
      const alvo = flows.filter((a: any) => {
        const doGrupo = !Array.isArray(a.grupos) || !a.grupos.length || a.grupos.includes(grupoJid);
        if (!doGrupo) return false;
        if (a.trigger === "group_mention") return meMarcou;
        return a.keyword && keywordHit(String(a.keyword).split(",").map((w) => w.trim().toLowerCase()).filter(Boolean), txt, a.keywordMatch);
      });
      if (!alvo.length) return;
      if (!botPodeResponder(msg.from)) return; // modo teste vale igual em grupo
      const ev: NormalizedEvent = {
        platform: "lite",
        event: alvo[0].trigger,
        eventId: "grp-" + Date.now() + "-" + msg.from,
        contact: { name: msg.name || msg.from, firstName: (msg.name || "").split(" ")[0] || "", phone: msg.from },
        // {{grupo_jid}}/{{grupo}} deixam o fluxo saber DE ONDE veio (dá pra responder no grupo com
        // o passo "Avisar alguém", por exemplo).
        fields: { mensagem: msg.text.slice(0, 500), grupo_jid: grupoJid, grupo: String(body?.message?.chatName ?? "") },
        raw: body,
      };
      console.log(`👥 gatilho de grupo (${alvo[0].trigger}) por ${msg.from} em ${grupoJid}`);
      await upsertContact(msg.from, msg.name || undefined, "lite").catch(() => {});
      await runAutomationsFor(ev, gw, alvo, console.log, true);
    }).catch((e: any) => console.error("gatilho de grupo:", e?.message ?? e));
  }

  const temMidia = /image|video|document|sticker|audio|ptt/i.test(msg?.type ?? "");
  if (msg && !msg.isGroup && (msg.text || msg.isAudio || temMidia)) {
    if (msg.id && (await isDuplicate("uaz:" + wsId + ":" + msg.id))) return reply.code(200).send({ ok: true, duplicate: true });
    // O token da instância entra no contexto: se o fluxo agendar um follow-up, ele volta a falar
    // pelo MESMO número por onde a conversa aconteceu (cliente com 2+ números).
    // 💬 Leva junto a mensagem que o lead MARCOU (a UazAPI entrega em contextInfo). Já era
    // arquivada pro painel desenhar; agora vai também pro agente entender a que a fala responde.
    const cit = citacaoDoConteudo(body?.message?.content);
    if (cit && (cit.texto || cit.tipo)) msg.citacao = cit;
    juntarRajada(wsId, msg, body, gw, token);
  }

  return reply.code(200).send({ ok: true });
};
app.post("/webhooks/uazapi", LIMITE_WEBHOOK, uazapiWebhookHandler);
app.post("/webhooks/uazapi/*", LIMITE_WEBHOOK, uazapiWebhookHandler);

// Gatilho manual de resumo de grupo (teste/operacional). Protegido pelo token da instância.
// Body: { token, jid, name? }. Responde 202 e processa em background.
app.post("/admin/summarize", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const body = req.body as any;
  const jid = String(body?.jid ?? "");
  if (!jid) return reply.code(400).send({ error: "informe 'jid' do grupo" });
  setImmediate(() =>
    runGroupSummary({ jid, name: body?.name, time: "", deliverTo: body?.deliverTo }, gateway).catch(
      (e) => console.error("resumo manual falhou:", e),
    ),
  );
  return reply.code(202).send({ ok: true, note: "resumo em processamento", jid });
});

// ── Admin: config + dashboard (consumido pelo painel pela rede interna) ────────
// Auth: token da instância, via header "x-admin-token" ou body.token.
function isAdmin(req: any): boolean {
  // Só header: aceitar o admin-token no CORPO espalhava o segredo por log de requisição e dump
  // de erro — e nenhum caminho do painel usava essa forma. Comparação em tempo constante, igual
  // ao que kiwify.ts/meta.ts já fazem com HMAC (auditoria 07/09).
  const t = req.headers?.["x-admin-token"];
  if (typeof t !== "string" || t.length !== config.adminToken.length) return false;
  return timingSafeEqual(Buffer.from(t), Buffer.from(config.adminToken));
}

// Rate-limit em memória (1 réplica do motor): janela deslizante simples por chave.
// Trava força-bruta em /auth/login (senha), /auth/signup (spam) e /auth/redeem (cupom).
const rlHits = new Map<string, number[]>();
const RL_MAX_KEYS = 20_000; // teto duro (cada chave é uma lista curta) — evita crescer sem limite
// `countOnly` = só CONSULTA (não empurra na janela). Serve pra (a) não deixar o bloqueio se
// auto-renovar com o tráfego do atacante e (b) contar apenas FALHAS, não toda requisição.
function rateLimited(key: string, max: number, windowMs: number, countOnly = false): boolean {
  const now = Date.now();
  const arr = (rlHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (countOnly) { rlHits.set(key, arr); return arr.length >= max; }
  arr.push(now);
  rlHits.set(key, arr);
  if (rlHits.size > 5000) for (const [k, v] of rlHits) if (!v.some((t) => now - t < windowMs)) rlHits.delete(k);
  // Ainda estourado só com chaves VIVAS (flood de chaves distintas) → descarta as mais antigas.
  if (rlHits.size > RL_MAX_KEYS) {
    let excess = rlHits.size - RL_MAX_KEYS, i = 0;
    for (const k of rlHits.keys()) { if (i++ >= excess) break; rlHits.delete(k); }
  }
  return arr.length > max;
}
// Só marca a falha (sem consultar) — usado depois de uma tentativa errada.
function rateNote(key: string, windowMs: number): void {
  const now = Date.now();
  const arr = (rlHits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  rlHits.set(key, arr);
}
// Chave curta e de tamanho fixo pra e-mail (o corpo aceita megabytes; a chave não pode crescer).
const rlKeyFor = (s: string): string => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const emailOk = (e: string): boolean => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// IP do visitante. NUNCA confia no x-forwarded-for público (o motor é exposto direto na internet,
// então o header é forjável). O painel (Next) e o nginx do site repassam o IP real em
// `x-zc-client-ip` — e é esse header que decide TODA trava por IP (login, cadastro, CAPI…).
const isPrivateIp = (ip: string): boolean =>
  /^(10\.|127\.|::1|fc|fd|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);

// ⚠️ "IP privado" NÃO era prova de origem interna (auditoria 22/08). O motor é público em
// app.seudominio.com.br e quem entrega essa requisição é o TRAEFIK, pela rede overlay do Swarm —
// então o IP do socket é privado TAMBÉM pro tráfego da internet, e o `x-zc-client-ip` de qualquer
// pessoa passava a valer. Trocando o header a cada chamada, toda trava por IP virava enfeite.
//
// O que separa de verdade os dois caminhos é a ROTA, não o IP:
//   · painel  → http://app:3333        (fetch direto na overlay, cabeçalhos montados à mão)
//   · nginx   → http://app:3333        (proxy_pass direto, e limpa os x-forwarded-* herdados)
//   · público → Traefik → app:3333     (o Traefik SEMPRE carimba x-forwarded-proto/server/host)
// Ninguém consegue APAGAR o carimbo do Traefik — só adicioná-lo, o que apenas tira a própria
// confiança. Por isso a presença de qualquer x-forwarded-* significa "veio de fora": descarta.
const CARIMBOS_DE_PROXY = ["x-forwarded-proto", "x-forwarded-server", "x-forwarded-host", "x-forwarded-port"];
let avisouSpoof = 0;
function veioPeloTraefik(req: any): boolean {
  return CARIMBOS_DE_PROXY.some((h) => String(req.headers?.[h] ?? "").trim() !== "");
}
function clientIp(req: any): string {
  const sock = String(req.ip || "?");
  const fwd = String(req.headers?.["x-zc-client-ip"] ?? "").trim();
  if (!fwd || !isPrivateIp(sock)) return sock;
  if (veioPeloTraefik(req)) {
    // Chegou pela borda pública COM o header interno: ou é tentativa de forjar IP, ou o nginx
    // parou de limpar os x-forwarded-* (ver app/site/nginx.conf). Nos dois casos o header não vale.
    if (Date.now() - avisouSpoof > 600_000) {
      avisouSpoof = Date.now();
      console.warn(`🚫 x-zc-client-ip ignorado: veio pela borda pública (${String(req.url ?? "").slice(0, 80)}). Se for o nginx do site, confira os proxy_set_header X-Forwarded-* vazios.`);
    }
    return sock;
  }
  return fwd.slice(0, 64); // painel/nginx internos: confiável
}

function validateWelcome(c: any): string | null {
  if (!c || typeof c !== "object") return "config inválida";
  if (typeof c.enabled !== "boolean") return "campo 'enabled' deve ser true/false";
  if (typeof c.message !== "string" || !c.message.trim()) return "mensagem não pode ficar vazia";
  if (!Array.isArray(c.groups)) return "campo 'groups' deve ser uma lista";
  if (c.groups.some((g: any) => typeof g !== "string")) return "cada grupo deve ser um JID (texto)";
  // Trava anti-spam: sem curinga "*" — o número está em grupos de terceiros.
  // Checa já com trim (senão " * " passaria e o sanitizer normalizaria pra "*").
  if (c.groups.some((g: string) => g.trim() === "*"))
    return "curinga '*' não é permitido (evita spam/ban) — liste os grupos um a um";
  return null;
}
function sanitizeWelcome(c: any): GroupWelcomeConfig {
  return {
    enabled: !!c.enabled,
    message: String(c.message),
    // filtra vazios E "*" (defesa final, além do validateWelcome)
    groups: (c.groups as string[]).map((g) => g.trim()).filter((g) => g && g !== "*"),
    ...(typeof c.delayMs === "number" ? { delayMs: c.delayMs } : {}),
  };
}

function validateSummary(c: any): string | null {
  if (!c || typeof c !== "object") return "config inválida";
  if (typeof c.enabled !== "boolean") return "campo 'enabled' deve ser true/false";
  if (typeof c.timezone !== "string" || !c.timezone) return "timezone é obrigatória";
  try {
    // valida que é um fuso IANA real — senão o agendador quebraria ao formatar a hora.
    new Intl.DateTimeFormat("en-CA", { timeZone: c.timezone });
  } catch {
    return "timezone inválida (use um fuso IANA, ex.: America/Sao_Paulo)";
  }
  if (!Array.isArray(c.groups)) return "campo 'groups' deve ser uma lista";
  for (const g of c.groups) {
    if (!g || typeof g.jid !== "string" || !g.jid.endsWith("@g.us"))
      return "cada grupo precisa de um JID válido (…@g.us)";
    if (typeof g.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(g.time))
      return "horário de cada grupo deve ser HH:MM válido (00:00 a 23:59)";
    if (g.deliverTo != null && String(g.deliverTo).trim() !== "") {
      const d = String(g.deliverTo).trim();
      if (!(d.endsWith("@g.us") || /^\d{10,15}$/.test(d)))
        return "destino do resumo inválido (deixe vazio p/ o próprio grupo, ou use um grupo/número com DDD)";
    }
  }
  return null;
}
function sanitizeSummary(c: any): Record<string, unknown> {
  return {
    enabled: !!c.enabled,
    timezone: String(c.timezone),
    ...(typeof c.model === "string" && c.model ? { model: c.model } : {}),
    maxMessages: Number(c.maxMessages) > 0 ? Number(c.maxMessages) : 500,
    minMessages: Number(c.minMessages) > 0 ? Number(c.minMessages) : 1,
    groups: (c.groups as any[]).map((g) => ({
      jid: String(g.jid).trim(),
      ...(g.name ? { name: String(g.name) } : {}),
      time: String(g.time),
      ...(g.deliverTo && String(g.deliverTo).trim() ? { deliverTo: String(g.deliverTo).trim() } : {}),
    })),
  };
}

app.get("/admin/config/welcome", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(loadGroupWelcome());
});
app.put("/admin/config/welcome", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const c = (req.body as any)?.config ?? req.body;
  const err = validateWelcome(c);
  if (err) return reply.code(400).send({ error: err });
  try {
    await saveConfig("group-welcome", sanitizeWelcome(c));
    return reply.send({ ok: true, config: loadGroupWelcome() });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

// ── Respostas rápidas (o "/" no chat ao vivo) ─────────────────────────────────
function sanitizeQuickReplies(v: any): Array<{ shortcut: string; text: string }> {
  const arr = Array.isArray(v) ? v : [];
  const out: Array<{ shortcut: string; text: string }> = [];
  const seen = new Set<string>();
  for (const q of arr) {
    const shortcut = String(q?.shortcut ?? "").trim().replace(/^\/+/, "").replace(/\s+/g, "-").slice(0, 40);
    const text = String(q?.text ?? "").slice(0, 4000);
    if (!shortcut || !text.trim()) continue;
    const key = shortcut.toLowerCase();
    if (seen.has(key)) continue; // atalho único (case-insensitive)
    seen.add(key);
    out.push({ shortcut, text });
  }
  return out.slice(0, 200);
}
// ── Atendente IA (config por workspace) ──────────────────────────────────────
// leAtendente() já normaliza/limita tudo, então o GET devolve sempre um objeto completo (o painel
// nunca precisa lidar com campo faltando) e o PUT grava o que foi lido de volta — mesma sanitização.
app.get("/admin/atendente", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ atendente: leAtendente() });
});
app.put("/admin/atendente", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const ws = getPrimaryWorkspace();
  await saveConfigFor(ws, "atendente-ia", req.body ?? {});
  return reply.send({ ok: true, atendente: leAtendente(ws) });
});
app.get("/app/atendente", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ atendente: leAtendente(ws) });
});
app.put("/app/atendente", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  await saveConfigFor(ws, "atendente-ia", req.body ?? {});
  return reply.send({ ok: true, atendente: leAtendente(ws) });
});

app.get("/admin/config/quick-replies", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ items: getCached<any>("quick-replies") ?? [] });
});
// Espelhos DO CLIENTE (o proxy remapeia /admin → /app): sem eles, o "/" das respostas rápidas
// falhava SILENCIOSO pro cliente desde sempre — caso clássico do [[feedback-replicar-clientes]].
app.get("/app/config/quick-replies", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ items: getCachedFor<any>(ws, "quick-replies") ?? [] });
});
app.put("/app/config/quick-replies", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const items = sanitizeQuickReplies((req.body as any)?.items ?? req.body);
  try {
    await saveConfigFor(ws, "quick-replies", items);
    return reply.send({ ok: true, items });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});
app.put("/admin/config/quick-replies", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const items = sanitizeQuickReplies((req.body as any)?.items ?? req.body);
  try {
    await saveConfig("quick-replies", items);
    return reply.send({ ok: true, items });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

// Premiação do ranking de afiliados: valores por posição (1º..Nº). Editável pelo admin, persistido.
const DEFAULT_PRIZES = [1000, 500, 200, 100, 100];
app.get("/admin/config/ranking-prizes", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const saved = getCached<number[]>("ranking-prizes");
  return reply.send({ prizes: Array.isArray(saved) && saved.length ? saved : DEFAULT_PRIZES });
});
app.put("/admin/config/ranking-prizes", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const raw = (req.body as any)?.prizes ?? req.body;
  if (!Array.isArray(raw)) return reply.code(400).send({ error: "prizes deve ser uma lista de valores" });
  // até 10 posições, valores não-negativos em reais (arredonda a centavos)
  const prizes = raw.slice(0, 10).map((v: any) => Math.max(0, Math.round(Number(v) * 100) / 100 || 0));
  try {
    await saveConfig("ranking-prizes", prizes);
    return reply.send({ ok: true, prizes });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

app.get("/admin/config/summary", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(loadGroupSummary());
});
app.put("/admin/config/summary", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const c = (req.body as any)?.config ?? req.body;
  const err = validateSummary(c);
  if (err) return reply.code(400).send({ error: err });
  try {
    await saveConfig("group-summary", sanitizeSummary(c));
    return reply.send({ ok: true, config: loadGroupSummary() });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

app.get("/admin/stats", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(await getStats());
});

// 🔒 MODO TESTE: lista de telefones que o robô pode responder. Vazia = atende todo mundo.
// Serve pra colocar o atendimento no ar e ir testando sem responder cliente de verdade.
app.get("/admin/bot-allowlist", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const lista = getCached<string[]>("bot-allowlist") ?? [];
  return reply.send({ allowlist: lista, ativo: lista.length > 0 });
});
app.post("/admin/bot-allowlist", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const bruta = Array.isArray(b?.allowlist) ? b.allowlist : [];
  const lista = [...new Set(bruta.map((n: any) => String(n ?? "").replace(/\D/g, "")).filter((n: string) => n.length >= 8))].slice(0, 50);
  await saveConfig("bot-allowlist", lista);
  console.log(lista.length ? `🔒 modo teste ligado: ${lista.length} número(s) permitido(s)` : "🔓 modo teste desligado — atende todo mundo");
  return reply.send({ ok: true, allowlist: lista, ativo: lista.length > 0 });
});
// ✋ Pausas do corte da IA (dono assumiu pelo celular): listar as ativas e reativar na mão.
app.get("/admin/bot-pausas", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const agora = Date.now();
  const mapa = getCached<Record<string, string>>("bot-pausas") ?? {};
  const ativas = Object.entries(mapa)
    .filter(([, ate]) => new Date(ate).getTime() > agora)
    .map(([tel, ate]) => ({ telefone: tel, ate }));
  return reply.send({ pausas: ativas, horasPadrao: Number(getCached<unknown>("bot-pausa-horas")) || PAUSA_PADRAO_HORAS });
});
app.post("/admin/bot-pausas/clear", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const tel = chaveTel(String((req.body as any)?.phone ?? ""));
  const mapa = { ...(getCached<Record<string, string>>("bot-pausas") ?? {}) };
  if (tel) delete mapa[tel];
  else for (const k of Object.keys(mapa)) delete mapa[k]; // sem phone = reativa TODAS
  await saveConfig("bot-pausas", mapa);
  console.log(tel ? `✋→▶️ IA reativada pra …${tel}` : "✋→▶️ IA reativada pra todas as conversas");
  return reply.send({ ok: true });
});

// ✋ PAUSA MANUAL POR CONVERSA — o botão "Pausar IA" do chat (WPP ao Vivo e WPP Api).
// Pedido do dono (02/10): "entrou um lead e assumimos pelo celular". A pausa automática só pega
// resposta vinda do APP do celular (source android/ios); resposta pelo WhatsApp Web/Desktop chega
// como "web" — igual ao que o próprio motor envia — e a IA seguia falando por cima do humano. Aqui
// a pessoa pausa/retoma na mão e a tela enxerga o estado (inclusive o da pausa automática).
// Existe nas DUAS superfícies (/admin e /app): endpoint só-admin falharia calado pro cliente.
// A conta tem IA LIGADA? (Atendente IA ativo ou algum fluxo ativo com nó de Agente IA.) Sem IA,
// o painel não mostra "IA pausada": a pausa automática é gravada em qualquer intervenção humana,
// e numa conta sem IA o aviso parecia vazamento de outra conta (HG, 03/10 — não era: a pausa era
// da própria HG, criada por um áudio do celular dela).
function contaTemIa(): boolean {
  if (leAtendente(getCurrentWorkspace()).ativa) return true;
  return loadAutomations().some((a: any) => a.enabled !== false && (a.steps ?? []).some((s: any) => s?.type === "ai_agent"));
}
function estadoDaPausa(ate: string | undefined | null) {
  const ativo = !!ate && new Date(ate).getTime() > Date.now();
  return {
    temIa: contaTemIa(),
    pausado: ativo,
    ate: ativo ? ate! : null,
    semPrazo: ativo && new Date(ate!).getTime() - Date.now() > 365 * 86_400_000,
    horasPadrao: Number(getCached<unknown>("bot-pausa-horas")) || PAUSA_PADRAO_HORAS,
  };
}
async function lePausaHandler(q: any, reply: any) {
  const tel = chaveTel(String(q?.chatid ?? ""));
  if (!tel) return reply.code(400).send({ error: "informe a conversa" });
  return reply.send(estadoDaPausa((getCached<Record<string, string>>("bot-pausas") ?? {})[tel]));
}
async function mudaPausaHandler(b: any, reply: any) {
  const chatid = String(b?.chatid ?? "");
  if (/@g\.us$/.test(chatid)) return reply.code(400).send({ error: "a pausa vale pra conversa 1:1, não pra grupo" });
  const fone = chatid.replace(/@.*/, "").replace(/\D/g, "");
  const tel = chaveTel(fone);
  if (!tel) return reply.code(400).send({ error: "informe a conversa" });
  if (b?.pausar === false) {
    const mapa = { ...(getCached<Record<string, string>>("bot-pausas") ?? {}) };
    delete mapa[tel];
    await saveConfig("bot-pausas", mapa);
    console.log(`✋→▶️ IA reativada pra …${tel} (botão do chat)`);
    return reply.send({ ok: true, ...estadoDaPausa(null) });
  }
  const h = b?.horas == null ? undefined : Number(b.horas);
  const ate = await pausarBot(fone, { horas: Number.isFinite(h) ? h : undefined, motivo: "pausa manual pelo painel" });
  return reply.send({ ok: true, ...estadoDaPausa(ate) });
}
app.get("/admin/inbox/pausa", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return lePausaHandler(req.query, reply);
});
app.post("/admin/inbox/pausa", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return mudaPausaHandler(req.body, reply);
});
app.get("/app/inbox/pausa", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => lePausaHandler(req.query, reply));
});
app.post("/app/inbox/pausa", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => mudaPausaHandler(req.body, reply));
});

app.get("/admin/events", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const limit = Math.min(Number((req.query as any)?.limit) || 20, 100);
  return reply.send({ events: await getRecentEvents(limit) });
});

// ── Builder de fluxos: automações (evento → passos) editáveis pelo painel ─────
const CANONICAL_EVENTS = [
  // "checkout" é o gatilho SWITCH (vários eventos de venda num nó só, cada um com sua saída).
  "keyword", "primeiro_contato", "template_reply", "group_mention", "group_keyword", "lead_trial", "novo_afiliado", "webhook", "schedule", "checkout",
  "purchase_approved", "purchase_refused", "pix_generated", "boleto_generated",
  "cart_abandoned", "checkout_started", "refund", "chargeback",
  "subscription_canceled", "subscription_renewed", "payment_delayed", "unknown",
];
// Precisa espelhar TODO tipo em engine/runner.ts (Step union) — um tipo que exista no motor mas
// falte aqui rejeita o fluxo INTEIRO no salvar ("passo inválido: X"), mesmo pra automações que nem
// usam esse passo (a validação para no primeiro erro da lista). Achado nesta auditoria: condition,
// window, switch, set_variable, utm, google_doc, google_contact e call estavam faltando desde o
// commit inicial — corrigido junto com o nó Switch pro FLUXO ANDRÉ salvar.
const STEP_TYPES = ["text", "ptt", "ptv", "media", "buttons", "carousel", "ask", "ai_agent", "notify", "presence", "wait", "add_to_group", "mention_all", "note", "tag", "reminder", "template", "gsheet_append", "webhook_out", "payment_check", "bloquear", "call", "window", "condition", "switch", "set_variable", "utm", "google_doc", "google_contact", "google_calendar", "location", "code", "edit_fields", "loop", "filter", "split_out", "asaas", "zapsign", "gsheet_read", "email", "meta_ads", "metricas_dia"];

function validateAutomations(list: any): string | null {
  if (!Array.isArray(list)) return "automações devem ser uma lista";
  const ids = new Set<string>();
  for (const a of list) {
    if (!a || typeof a !== "object") return "automação inválida";
    if (typeof a.id !== "string" || !a.id.trim()) return "cada automação precisa de um id";
    if (ids.has(a.id)) return `id repetido: ${a.id}`;
    ids.add(a.id);
    if (!CANONICAL_EVENTS.includes(a.trigger)) return `gatilho inválido: ${a.trigger}`;
    // ⚠️ COMPLETUDE vs ESTRUTURA. Estrutura (tipo do campo, valor fora da lista) é sempre erro.
    // Já "faltou preencher" só vale pra fluxo ATIVO — rascunho incompleto é a natureza de um
    // rascunho, e é exatamente assim que um fluxo importado do n8n nasce: o n8n não tem destino
    // pro agendamento nem nome da lista pro laço. Exigir isso no salvar impedia a IMPORTAÇÃO
    // inteira (o dono bateu nisso ao trazer o fluxo de cobrança de um cliente, 25/08).
    const ativo = a.enabled !== false;
    if (a.keyword != null && typeof a.keyword !== "string") return "palavra-chave inválida";
    if (a.audioComoTexto != null && typeof a.audioComoTexto !== "boolean") return "'audioComoTexto' deve ser sim/não";
    if (ativo && (a.trigger === "keyword" || a.trigger === "group_keyword") && !String(a.keyword ?? "").trim())
      return "pra publicar, o gatilho de palavra-chave precisa de uma palavra";
    if (a.trigger === "schedule") {
      if (a.scheduleCron != null && typeof a.scheduleCron !== "string") return "recorrência do agendamento inválida";
      if (a.scheduleTarget != null && typeof a.scheduleTarget !== "string") return "destino do agendamento inválido";
      if (a.conta != null && (typeof a.conta !== "string" || a.conta.length > 60)) return "número do fluxo inválido";
      // ⚠️ DESTINO NÃO É OBRIGATÓRIO (mudou em 02/09). O gatilho por horário é o Schedule Trigger
      // do n8n: ele diz QUANDO, e só. Exigir um telefone aqui impedia o fluxo agendado mais comum
      // — buscar uma LISTA (cobranças vencidas do Asaas, planilha) e falar com CADA pessoa dela,
      // onde quem recebe sai do dado e não de um número fixo. Era o que travava o fluxo de
      // cobrança de um cliente. A recorrência continua obrigatória: sem ela o cron não dispara nunca.
      if (ativo && !cronValido(String(a.scheduleCron ?? "").trim()))
        return "pra publicar, o gatilho por horário precisa de uma recorrência válida — abra o nó do topo e escolha quando disparar";
    }
    if (a.grupos != null && (!Array.isArray(a.grupos) || a.grupos.some((g: any) => typeof g !== "string")))
      return "grupos deve ser uma lista de identificadores de grupo";
    if (a.plataforma != null && typeof a.plataforma !== "string")
      return "plataforma deve ser texto";
    if (a.webhookDe != null && (typeof a.webhookDe !== "string" || a.webhookDe.length > 80))
      return "'receber pelo webhook de outro fluxo' precisa ser o id de um fluxo";
    if (a.webhookDe && a.webhookDe === a.id) return "um fluxo não pode receber pelo próprio webhook";
    if (a.eventos != null && (!Array.isArray(a.eventos) || a.eventos.some((e: any) => typeof e !== "string")))
      return "eventos deve ser uma lista de texto";
    if (ativo && a.trigger === "checkout" && !(a.eventos ?? []).length)
      return "pra publicar, o gatilho de checkout precisa de pelo menos um evento marcado";
    if (a.produtos != null) {
      if (!Array.isArray(a.produtos) || a.produtos.length > 30) return "filtro de produtos: lista inválida (máx. 30)";
      for (const pr of a.produtos) {
        if (!pr || typeof pr !== "object") return "filtro de produtos: item inválido";
        if (pr.id != null && typeof pr.id !== "string") return "filtro de produtos: id deve ser texto";
        if (pr.nome != null && typeof pr.nome !== "string") return "filtro de produtos: nome deve ser texto";
      }
    }
    if (a.templateName != null && typeof a.templateName !== "string")
      return "gatilho de template: 'templateName' deve ser texto";
    if (a.botoesGatilho != null && (!Array.isArray(a.botoesGatilho) || a.botoesGatilho.some((x: any) => typeof x !== "string")))
      return "gatilho de template: 'botoesGatilho' deve ser uma lista de texto";
    if (a.keywordMatch != null && a.keywordMatch !== "exact" && a.keywordMatch !== "contains")
      return "keywordMatch deve ser 'exact' ou 'contains'";
    if (a.platforms != null && (!Array.isArray(a.platforms) || a.platforms.some((p: any) => typeof p !== "string")))
      return "platforms deve ser uma lista de texto";
    if (!Array.isArray(a.steps)) return "steps deve ser uma lista";
    for (const s of a.steps) {
      if (!s || !STEP_TYPES.includes(s.type)) return `passo inválido: ${s?.type}`;
      if (s.type === "text" && typeof s.text !== "string") return "passo de texto precisa de 'text'";
      if ((s.type === "ptt" || s.type === "ptv") && typeof s.file !== "string") return `passo ${s.type} precisa de 'file' (URL)`;
      if (s.type === "media" && (typeof s.file !== "string" || typeof s.mediaType !== "string")) return "passo de mídia precisa de 'file' e 'mediaType'";
      if (s.type === "gsheet_read" && typeof s.sheetUrl !== "string") return "passo Ler planilha precisa do link da planilha";
      if (s.type === "email" && (typeof s.para !== "string" || typeof s.assunto !== "string" || typeof s.corpo !== "string")) return "passo E-mail precisa de destinatário, assunto e texto";
      if (s.type === "buttons" && (typeof s.text !== "string" || !Array.isArray(s.buttons))) return "passo de botões precisa de 'text' e 'buttons'";
      if (s.type === "carousel") {
        if (typeof s.text !== "string") return "passo de carrossel precisa de 'text'";
        if (!Array.isArray(s.cards) || s.cards.length === 0) return "carrossel precisa de pelo menos 1 card";
        for (const c of s.cards) {
          if (!c || typeof c.image !== "string" || typeof c.text !== "string") return "cada card do carrossel precisa de 'image' (URL) e 'text'";
          if (c.buttons != null && (!Array.isArray(c.buttons) || c.buttons.some((b: any) => typeof b !== "string"))) return "os botões do card devem ser uma lista de texto";
        }
      }
      if (s.type === "template" && (typeof s.templateName !== "string" || !s.templateName.trim())) return "passo de template precisa de 'templateName'";
      if (s.type === "ask" && (typeof s.text !== "string" || typeof s.variable !== "string" || !s.variable.trim())) return "passo de perguntar precisa de 'text' e 'variable'";
      if (s.type === "notify" && (!Array.isArray(s.targets) || typeof s.text !== "string")) return "passo de avisar precisa de 'targets' (lista) e 'text'";
      if (s.type === "ai_agent") {
        if (typeof s.systemPrompt !== "string") return "agente IA precisa de 'systemPrompt'";
        if (!Array.isArray(s.paths)) return "agente IA precisa de 'paths' (lista, pode ser vazia)";
        for (const p of s.paths) {
          if (!p || typeof p.name !== "string" || typeof p.description !== "string" || typeof p.reply !== "string")
            return "cada caminho do agente precisa de 'name', 'description' e 'reply'";
          if (p.guardar != null && (!Array.isArray(p.guardar) || p.guardar.length > 20 || p.guardar.some((c: any) => !c || typeof c.variable !== "string" || (c.hint != null && typeof c.hint !== "string"))))
            return `caminho "${p.name}": a lista de dados a guardar precisa de 'variable' (texto) em cada item, até 20`;
          if (p.repetir != null && typeof p.repetir !== "boolean") return `caminho "${p.name}": 'repetir' deve ser verdadeiro ou falso`;
          if (p.midia != null && (typeof p.midia !== "string" || !/^https?:\/\/\S+$/.test(p.midia.trim()) || p.midia.length > 500)) return `caminho "${p.name}": a mídia precisa ser uma URL (https://…)`;
        }
        if (s.maxTurns != null && typeof s.maxTurns !== "number") return "agente IA: 'maxTurns' deve ser número";
        if (s.acumularSeg != null && (typeof s.acumularSeg !== "number" || s.acumularSeg < 0 || s.acumularSeg > 600))
          return "agente IA: o tempo de acumular mensagens deve ficar entre 0 e 600 segundos";
      }
      if (s.type === "wait") {
        if (s.modo === "data") { if (typeof s.quando !== "string" || !s.quando.trim()) return "espera até um horário precisa da data/hora"; }
        else if (typeof s.ms !== "number") return "passo esperar precisa de 'ms'";
      }
      if (s.type === "edit_fields" && !Array.isArray(s.campos)) return "passo de editar campos precisa de 'campos' (lista)";
      if (s.type === "split_out") {
        if (typeof s.campo !== "string") return "separar lista: 'campo' deve ser texto";
        if (ativo && !s.campo.trim()) return "pra publicar, o passo de separar lista precisa saber qual campo tem a lista";
      }
      if (s.type === "filter" && !Array.isArray(s.condicoes)) return "passo de filtro precisa de 'condicoes' (lista)";
      if (s.type === "loop") {
        if (typeof s.lista !== "string") return "o laço: 'lista' deve ser texto";
        if (ativo && !s.lista.trim()) return "pra publicar, o laço precisa saber qual campo tem a lista — abra o nó e preencha";
        if (s.limite != null && (typeof s.limite !== "number" || s.limite < 1 || s.limite > 500)) return "o limite do loop vai de 1 a 500 disparos";
      }
      if (s.type === "presence" && typeof s.presence !== "string") return "passo digitando precisa de 'presence'";
      if ((s.type === "add_to_group" || s.type === "mention_all") && typeof s.groupJid !== "string") return `passo ${s.type} precisa de 'groupJid'`;
      if (s.type === "gsheet_append" && (typeof s.sheetUrl !== "string" || !Array.isArray(s.colunas))) return "passo gsheet_append precisa de 'sheetUrl' e 'colunas'";
      if (s.type === "gsheet_append" && s.chave != null && (typeof s.chave !== "number" || s.chave < 0 || s.chave > 200)) return "passo Planilha: a coluna-chave (atualizar a linha) deve ser uma das colunas lidas";
      if (s.type === "google_calendar") {
        if (s.acao !== undefined && !["horarios", "criar", "calls_do_dia", "convidar"].includes(s.acao)) return "passo Agenda Google: ação inválida";
        if (s.acao === "convidar" && a.enabled !== false && !String(s.busca ?? "").trim()) return "passo Agenda Google (convidar): cole o link do Meet do evento (ou um trecho do título)";
        if (s.duracaoMin !== undefined && (typeof s.duracaoMin !== "number" || s.duracaoMin < 5 || s.duracaoMin > 480)) return "passo Agenda Google: duração entre 5 e 480 minutos";
        if (s.acao === "criar" && a.enabled !== false && !String(s.quando ?? "").trim()) return "passo Agenda Google (marcar): informe de onde vem o horário (ex.: {{horario_escolhido}})";
      }
      if (s.type === "webhook_out") {
        if (typeof s.url !== "string" || !Array.isArray(s.campos)) return "passo webhook_out precisa de 'url' e 'campos'";
        if (s.metodo != null && !["GET", "POST", "PUT"].includes(s.metodo)) return "método HTTP não disponível ainda — use GET, POST ou PUT";
        if (s.authTipo != null && !["nenhuma", "header", "bearer", "basic", "query"].includes(s.authTipo)) return "tipo de autenticação inválido";
        // Só http(s): sem isso, um endereço tipo file:// ou um IP interno viraria porta de entrada
        // pra rede do servidor (SSRF) através de um fluxo salvo.
        if (s.url.trim() && !/^https?:\/\//i.test(s.url.trim())) return "o endereço do webhook precisa começar com http:// ou https://";
      }
      if (s.type === "location" && (typeof s.lat !== "string" || typeof s.lng !== "string")) return "passo de localização precisa de 'lat' e 'lng'";
      if (s.type === "code") {
        if (typeof s.codigo !== "string") return "passo de código precisa de 'codigo'";
        if (s.codigo.length > 20000) return "o código está grande demais (máx. 20.000 caracteres)";
      }
      if (s.type === "tag" && (!Array.isArray(s.tags) || s.tags.some((t: any) => typeof t !== "string"))) return "passo de etiqueta precisa de 'tags' (lista de texto)";
      if (s.type === "asaas") {
        const ACOES = ["checar_pagamento", "enviar_comprovante", "criar_cobranca", "pix_copia_cola", "listar_cobrancas", "buscar_cliente"];
        if (!ACOES.includes(s.acao)) return "passo Asaas: escolha a ação do nó";
        if (s.buscarPor != null && !["cobranca", "cliente", "cpf", "email"].includes(s.buscarPor)) return "passo Asaas: busca inválida";
        if (s.cobrancaTipo != null && !["PIX", "BOLETO", "UNDEFINED"].includes(s.cobrancaTipo)) return "passo Asaas: tipo de cobrança inválido";
        if (ativo && s.acao === "criar_cobranca" && !String(s.cobrancaValor ?? "").trim())
          return "pra publicar, o passo Asaas de criar cobrança precisa do valor — abra o nó e preencha (aceita variável)";
      }
      if (s.type === "meta_ads" || s.type === "metricas_dia") {
        if (s.periodo != null && !["hoje", "ontem"].includes(String(s.periodo))) return "métricas: período deve ser hoje ou ontem";
        if (s.salvarEm != null && typeof s.salvarEm !== "string") return "métricas: 'salvarEm' deve ser texto";
        if (s.type === "meta_ads") {
          if (s.actId != null && typeof s.actId !== "string") return "Meta Ads: id da conta deve ser texto";
          if (s.token != null && typeof s.token !== "string") return "Meta Ads: token deve ser texto";
        }
      }
      if (s.type === "zapsign") {
        if (s.acao != null && s.acao !== "pendentes") return "passo ZapSign: escolha a ação do nó";
        if (s.diasMin != null && (typeof s.diasMin !== "number" || s.diasMin < 0 || s.diasMin > 365)) return "passo ZapSign: 'pendentes há quantos dias' vai de 0 a 365";
      }
      if (s.type === "payment_check") {
        if (s.produto != null && typeof s.produto !== "string") return "consulta de pagamento: 'produto' deve ser texto";
        if (s.horas != null && typeof s.horas !== "number") return "consulta de pagamento: 'horas' deve ser número";
      }
      if (s.type === "bloquear" && s.tags != null && (!Array.isArray(s.tags) || s.tags.some((t: any) => typeof t !== "string")))
        return "bloquear contato: 'tags' deve ser uma lista de texto";
    }
    // Conexões (grafo): opcional; ausente = fluxo linear. Cada aresta liga source→target.
    if (a.edges != null) {
      if (!Array.isArray(a.edges)) return "edges deve ser uma lista";
      for (const e of a.edges) {
        if (!e || typeof e.source !== "string" || typeof e.target !== "string") return "cada conexão precisa de 'source' e 'target'";
      }
    }
  }
  return null;
}

// O segredo de autenticação do passo de HTTP não sai daqui NEM CIFRADO: o painel só precisa
// saber SE existe (pra mostrar "configurado" e não apagar sem querer). Menos superfície: o valor
// cifrado deixa de circular por rede, cache do navegador e arquivo baixado.
function semSegredosDeHttp(list: any[]): any[] {
  return list.map((a: any) => (!Array.isArray(a?.steps) ? a : {
    ...a,
    steps: a.steps.map((st: any) => {
      if (!st || st.type !== "webhook_out" || !st.authValorEnc) return st;
      const { authValorEnc: _e, ...resto } = st;
      return { ...resto, authConfigurado: true };
    }),
  }));
}

app.get("/admin/automations", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ automations: semSegredosDeHttp(loadAutomations()) });
});

// ── TESTE AO VIVO de um nó do fluxo ──────────────────────────────────────────
// Roda o fluxo DE VERDADE a partir de um nó, pro número que o dono escolher. Diferente do "Testar"
// (que é simulação e não envia nada), aqui a mensagem SAI — é o único jeito de conferir template
// oficial, botão e o resto do funil de ponta a ponta. Usa o MESMO caminho da produção
// (resumeScheduledFlow → runFromNode), então o que acontecer aqui é o que vai acontecer pro lead.
async function testeAoVivoHandler(wsId: string, b: any, reply: any) {
  const automationId = String(b?.automationId ?? "").trim();
  const nodeId = String(b?.nodeId ?? "").trim();
  const phone = String(b?.phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!automationId || !nodeId) return reply.code(400).send({ error: "informe o fluxo e o passo" });
  if (phone.length < 12) return reply.code(400).send({ error: "número inválido — use DDI+DDD+número (ex.: 5511989998888)" });
  return runWithWorkspace(wsId, async () => {
    const todas = loadAutomations();
    const a = todas.find((x) => x.id === automationId);
    if (!a) return reply.code(404).send({ error: "fluxo não encontrado" });
    // Rascunho PODE ser testado (é justamente pra isso que o teste existe) — passa uma cópia
    // habilitada, senão o resumeScheduledFlow recusa por "virou rascunho".
    const lista = todas.map((x) => (x.id === automationId ? { ...x, enabled: true } : x));
    if (await isOptedOut(phone)) return reply.code(400).send({ error: "esse número está na lista de bloqueio (mandou PARAR) — o motor não fala com ele" });

    // ✈️ PRÉ-VOO do passo de TEMPLATE. Sem isto o teste respondia "disparado!" e o erro real da
    // Meta morria no log — foi o que aconteceu no 1º teste (o template tinha VÍDEO no cabeçalho e
    // a Meta recusou com 132012, sem nada aparecer na tela). Aqui a checagem é SÍNCRONA e o motivo
    // volta pro painel.
    const passo: any = (a.steps ?? []).find((x: any) => x._id === nodeId);
    if (passo?.type === "template") {
      const cfg = getCachedFor<any>(wsId, "meta-official");
      const tok = metaSegredo(cfg, "accessToken");
      if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "este workspace não tem conta oficial conectada — template só existe na API da Meta" });
      if (!String(passo.templateName ?? "").trim()) return reply.code(400).send({ error: "escolha um template neste passo antes de testar" });
      try {
        const tpls = cfg.wabaId ? await metaListTemplates(String(cfg.wabaId), tok) : [];
        const t = tpls.find((x) => x.name === passo.templateName && x.language === (passo.language || "pt_BR")) ?? tpls.find((x) => x.name === passo.templateName);
        if (!t) return reply.code(400).send({ error: `o template "${passo.templateName}" não existe nesta conta (foi renomeado ou apagado?)` });
        if (String(t.status ?? "").toUpperCase() !== "APPROVED") {
          return reply.code(400).send({ error: `o template "${passo.templateName}" está com status ${t.status} — a Meta só entrega template APROVADO` });
        }
        const comps: any[] = Array.isArray(t.components) ? t.components : [];
        const h = comps.find((x) => String(x?.type).toUpperCase() === "HEADER");
        const fmt = String(h?.format ?? "").toLowerCase();
        if (["image", "video", "document"].includes(fmt) && !String(h?.example?.header_handle?.[0] ?? "")) {
          return reply.code(400).send({ error: `este template tem ${fmt.toUpperCase()} no cabeçalho e a Meta não devolveu o arquivo de exemplo — recrie o template com a mídia ou use o Disparador (que deixa subir o arquivo do envio)` });
        }
        const nVars = (() => { const b = comps.find((x) => String(x?.type).toUpperCase() === "BODY")?.text ?? ""; const ns = [...String(b).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])); return ns.length ? Math.max(...ns) : 0; })();
        const preenchidos = (passo.params ?? []).filter((p: any) => String(p ?? "").trim()).length;
        if (preenchidos < nVars) return reply.code(400).send({ error: `o template pede ${nVars} variável(is) e o passo tem ${preenchidos} preenchida(s) — a Meta recusa envio incompleto` });
      } catch (e: any) {
        return reply.code(502).send({ error: "não consegui conferir o template na Meta: " + String(e?.message ?? e) });
      }
    }

    await upsertContact(phone, undefined, "teste").catch(() => {});

    // TEMPLATE: envia AQUI, esperando a resposta da Meta, e devolve o resultado CRU pro painel.
    // Rodar tudo em segundo plano dizia "disparado!" mesmo quando a Meta recusava — foi o que
    // travou o diagnóstico duas vezes hoje. Agora o id da mensagem (ou o erro exato) aparece na tela.
    if (passo?.type === "template") {
      const cfg = getCachedFor<any>(wsId, "meta-official");
      const tok = metaSegredo(cfg, "accessToken");
      const gwMeta = new MetaGateway({ phoneNumberId: String(cfg.phoneNumberId), accessToken: tok, wabaId: String(cfg.wabaId ?? ""), wsId });
      try {
        const r = await gwMeta.sendTemplate(
          phone, String(passo.templateName), String(passo.language || "pt_BR"),
          (passo.params ?? []).map((p: any) => String(p ?? "")), 0, passo.headerUrl,
        );
        console.log(`🧪 teste ao vivo: template "${passo.templateName}" → ${phone} · id=${r.id ?? "?"}`);
        // Template enviado. Agora o teste tem que se comportar EXATAMENTE como a produção:
        // se algum botão tem ramo ligado no canvas, o fluxo FICA ESPERANDO o clique (é o
        // resumeButtonBranch que roteia). Pular direto pra saída padrão — como estava — fazia o
        // clique do lead cair no vazio e o ramo nunca rodar (foi o "cliquei e não veio o vídeo").
        const g = toGraph({ ...a, enabled: true } as any);
        const rotulos: string[] = ((passo.botoes ?? []) as any[]).map((x) => String(x)).filter(Boolean);
        const esperaClique = rotulos.some((_, i) => hasHandleEdge(g, nodeId, "b" + i));
        if (esperaClique) {
          await setPending(phone, automationId, 0, BUTTON_VAR, undefined, nodeId, wsId);
          return reply.send({ ok: true, phone, messageId: r.id ?? null, aceitoPelaMeta: true, aguardandoBotao: true });
        }
        // Sem ramo de botão: segue o resto do fluxo em segundo plano, pela saída padrão.
        setImmediate(() =>
          serializeByPhone(wsId + ":" + phone, () =>
            runWithWorkspace(wsId, async () => {
              try {
                const prox = saidaPadrao(g, nodeId);
                const gwT = gatewayDoWorkspace(wsId);
                if (prox && gwT) await resumeScheduledFlow(phone, automationId, prox, gwT, lista);
                else if (prox) console.error(`🚫 teste ao vivo: workspace ${wsId} sem número conectado — resto do fluxo NÃO enviado`);
              } catch (e: any) { console.error("teste ao vivo (resto do fluxo):", e?.message ?? e); }
            }),
          ),
        );
        return reply.send({ ok: true, phone, messageId: r.id ?? null, aceitoPelaMeta: true });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        console.error(`🧪 teste ao vivo FALHOU: ${msg}`);
        return reply.code(502).send({ error: "a Meta recusou o envio: " + msg });
      }
    }

    setImmediate(() =>
      serializeByPhone(wsId + ":" + phone, () =>
        runWithWorkspace(wsId, async () => {
          try {
            const gwT = gatewayDoWorkspace(wsId);
            if (!gwT) { console.error(`🚫 teste ao vivo: workspace ${wsId} sem número conectado — NÃO enviei`); return; }
            await resumeScheduledFlow(phone, automationId, nodeId, gwT, lista);
          } catch (e: any) {
            console.error("teste ao vivo:", e?.message ?? e);
          }
        }),
      ),
    );
    console.log(`🧪 teste ao vivo: fluxo "${automationId}" a partir de ${nodeId} → ${phone}`);
    return reply.send({ ok: true, phone });
  });
}
// ▶ PASSO A PASSO DE VERDADE (builder). Roda UM nó com o payload capturado no gatilho (ou com os
// campos que o painel mandar — inclui o que os passos anteriores produziram) e devolve: o próximo
// nó, se pausou esperando o lead, o log do passo e os campos depois dele. Diferente do "Testar"
// (simulação): aqui a planilha recebe a linha, a agenda recebe o evento, o WhatsApp recebe a
// mensagem — no número de teste do payload. Pedido do dono, 15/09.
async function executarPassoHandler(wsId: string, b: any, reply: any) {
  const automationId = String(b?.automationId ?? "").trim();
  const nodeId = String(b?.nodeId ?? "").trim();
  if (!automationId || !nodeId) return reply.code(400).send({ error: "informe o fluxo e o passo" });
  return runWithWorkspace(wsId, async () => {
    const a: any = loadAutomations().find((x) => x.id === automationId);
    if (!a) return reply.code(404).send({ error: "fluxo não encontrado — salve o fluxo primeiro" });
    const exemplo = a.exemploWebhook ?? {};
    const extra = b?.fields && typeof b.fields === "object" ? b.fields : {};
    const fieldsIn: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...(exemplo.fields ?? {}), ...extra }).slice(0, 300)) fieldsIn[String(k).slice(0, 60)] = String(v ?? "").slice(0, 2000);
    const phone = String(b?.phone ?? exemplo.telefone ?? fieldsIn.telefone ?? fieldsIn.whatsapp ?? "").replace(/\D/g, "").replace(/^0+/, "");
    if (phone && phone.length < 10) return reply.code(400).send({ error: "o telefone do exemplo é inválido — use DDI+DDD+número" });
    if (phone && (await isOptedOut(phone))) return reply.code(400).send({ error: "esse número está na lista de bloqueio (mandou PARAR)" });
    const gw = gatewayDoWorkspace(wsId);
    if (!gw) return reply.code(400).send({ error: "este workspace não tem número conectado — conecte um WhatsApp em Contas pra testar de verdade" });
    const nome = String(fieldsIn.nome ?? "").trim() || phone;
    const ev: NormalizedEvent = {
      platform: "lite", event: "keyword", eventId: "passo-" + Date.now() + "-" + nodeId,
      contact: { phone, name: nome, firstName: String(fieldsIn.primeiro_nome ?? nome.split(" ")[0] ?? "") },
      raw: {}, fields: fieldsIn,
    };
    const linhas: string[] = [];
    const log = (m: string) => { linhas.push(String(m).slice(0, 400)); console.log(`🧪 passo ${nodeId}: ${m}`); };
    try {
      const r = await executarPassoDoFluxo({ ...a, enabled: true }, nodeId, ev, gw, fieldsIn, log);
      // Só devolve o que mudou/é útil (a ficha inteira pode ser grande).
      const fieldsOut: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.fields)) if (v !== undefined && String(v) !== "") fieldsOut[k] = String(v).slice(0, 2000);
      return reply.send({ ok: true, proximo: r.proximo, pausou: r.pausou, log: linhas, fields: fieldsOut, phone });
    } catch (e: any) {
      return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 300), log: linhas });
    }
  });
}
app.post("/admin/automations/executar-passo", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return executarPassoHandler(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/automations/executar-passo", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return executarPassoHandler(ws, req.body, reply);
});

// 📊 Cabeçalho da planilha (linha 1) — pro passo Planilha mapear "coluna → variável" sem chave.
// Mesma cascata do nó: login Google primeiro, conta de serviço depois.
async function sheetHeadersHandler(wsId: string, sheetUrl: string, reply: any) {
  const id = sheetIdFromUrl(String(sheetUrl ?? ""));
  if (!id) return reply.code(400).send({ error: "isso não parece o link de uma planilha — copie a URL docs.google.com/spreadsheets/d/… da barra do navegador" });
  const g = getCachedFor<{ enc?: string }>(wsId, "google-contacts-oauth");
  const refresh = g?.enc ? decryptSecret(g.enc) : null;
  try {
    if (refresh && config.googleOAuth.clientId && config.googleOAuth.clientSecret) {
      const access = await refreshGoogleAccessToken({ clientId: config.googleOAuth.clientId, clientSecret: config.googleOAuth.clientSecret, refreshToken: refresh });
      return reply.send({ ok: true, cabecalhos: await readSheetHeaderOAuth(access, id), via: "login" });
    }
    const sa = getCachedFor<{ enc?: string }>(wsId, "google-sa");
    const raw = sa?.enc ? decryptSecret(sa.enc) : null;
    const conta = raw ? parseServiceAccount(raw) : null;
    if (conta) return reply.send({ ok: true, cabecalhos: await readSheetHeader(conta, id), via: "conta-de-servico" });
    return reply.code(400).send({ error: "conecte o Google em Integrações pra eu ler as colunas da planilha" });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 300) });
  }
}
app.get("/admin/google/sheet-headers", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return sheetHeadersHandler(getPrimaryWorkspace(), String((req.query as any)?.sheetUrl ?? ""), reply);
});
app.get("/app/google/sheet-headers", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return sheetHeadersHandler(ws, String((req.query as any)?.sheetUrl ?? ""), reply);
});

// 🤖 ATENDENTE ASSUME UMA CONVERSA JÁ PARADA (14/10/2026): o lead chegou antes de a atendente estar
// ligada naquele número e a pergunta dele ficou sem resposta. Mandar pelo painel pausaria a IA
// (conta como intervenção humana); isto roda a atendente sobre a ÚLTIMA fala recebida, como se
// ela tivesse acabado de chegar. Só admin, só workspace principal.
async function atendenteAssumeHandler(ws: string, b: any, reply: any) {
  const phone = String(b?.phone ?? "").replace(/@.*/, "").replace(/\D/g, "");
  const account = String(b?.account ?? "lite").slice(0, 60);
  if (phone.length < 10) return reply.code(400).send({ error: "telefone inválido" });
  const oficial = account === "api" || account.startsWith("meta-");
  return runWithWorkspace(ws, async () => {
    const virtual = atendenteVirtual();
    if (!virtual) return reply.code(400).send({ error: "o Atendente IA está desligado (Configurações → Atendente IA)" });
    const gw = gatewayDoWorkspace(ws, oficial ? "api" : account);
    if (!gw) return reply.code(400).send({ error: "esse número não está conectado" });
    const ult = await query<{ body: string; sender_name: string | null }>(
      `SELECT body, sender_name FROM inbox_messages
        WHERE workspace_id=$1 AND ${oficial ? "account LIKE 'meta-%'" : "account=$2"} AND chat_id LIKE $${oficial ? 2 : 3} AND NOT from_me
          AND coalesce(msg_type,'') NOT IN ('ctwa','reaction')
        ORDER BY ts DESC LIMIT 1`, oficial ? [ws, phone + "%"] : [ws, account, phone + "%"]);
    const fala = String(ult[0]?.body ?? "").slice(0, 500);
    if (!fala) return reply.code(404).send({ error: "nenhuma mensagem recebida desse contato nesse número" });
    const nome = String(b?.nome ?? ult[0]?.sender_name ?? "").trim();
    const ev: NormalizedEvent = {
      platform: oficial ? "meta" : "lite",
      event: "primeiro_contato",
      eventId: "at-assumir-" + Date.now() + "-" + phone,
      contact: { name: nome || phone, firstName: nome.split(" ")[0] || "", phone },
      falaInicial: fala,
      raw: {},
    };
    console.log(`🤖 atendente ASSUMIU ${phone} (${account}) — fala: "${fala.slice(0, 60)}"`);
    await runAutomationsFor(ev, gw, [virtual], console.log, true);
    return reply.send({ ok: true, fala });
  });
}
app.post("/admin/atendente/assumir", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return atendenteAssumeHandler(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/atendente/assumir", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return atendenteAssumeHandler(ws, req.body, reply);
});

// 📝 SUGESTÕES (pedido do dono, 17/10/2026): caixa "Envie sua sugestão" na página Novidades, pra
// QUALQUER conta (admin e cliente). A sugestão fica guardada na tabela `sugestoes` e dispara, no
// workspace PRINCIPAL (é feedback do produto, vai pro dono do ZapConverte), o fluxo
// "fluxo-sugestoes-novidades" — que avisa o dono no WhatsApp com nome, telefone, e-mail e o texto
// ({{nome}}, {{telefone}}, {{email}}, {{sugestao}}, {{conta}}). Fluxo desligado = só guarda.
const FLUXO_SUGESTOES = "fluxo-sugestoes-novidades";
async function sugestaoHandler(req: any, reply: any) {
  const s = await sessionOf(req);
  if (!s) return reply.code(401).send({ error: "não autenticado" });
  if (rateLimited("sugestao:" + s.user.id, 6, 3_600_000)) return reply.code(429).send({ error: "você já mandou várias sugestões nesta hora — tente de novo daqui a pouco" });
  const b = (req.body ?? {}) as any;
  const texto = String(b.texto ?? "").trim().slice(0, 2000);
  const nome = String(b.nome ?? s.user.name ?? "").trim().slice(0, 80);
  const email = String(b.email ?? s.user.email ?? "").trim().slice(0, 120);
  const telefone = String(b.telefone ?? "").replace(/\D/g, "").slice(0, 15);
  if (texto.length < 3) return reply.code(400).send({ error: "escreva a sua sugestão" });
  if (telefone.length < 10) return reply.code(400).send({ error: "informe o seu WhatsApp com DDD" });
  const conta = String(s.workspace?.name ?? "");
  await query(
    "INSERT INTO sugestoes(workspace_id, user_id, nome, email, telefone, texto) VALUES($1,$2,$3,$4,$5,$6)",
    [s.workspace?.id ?? null, s.user.id, nome, email, telefone, texto],
  ).catch((e: any) => console.error("sugestão: falha ao gravar:", e?.message));
  reply.send({ ok: true });
  const prim = getPrimaryWorkspace();
  setImmediate(() =>
    runWithWorkspace(prim, async () => {
      try {
        const fluxo: any = loadAutomations().find((a: any) => a.id === FLUXO_SUGESTOES);
        if (!fluxo || fluxo.enabled === false) { console.log(`📝 sugestão de ${nome} (${conta}) guardada — fluxo "${FLUXO_SUGESTOES}" desligado, ninguém foi avisado`); return; }
        const gw = gatewayDoWorkspace(prim, String(fluxo.conta ?? "").trim() || undefined);
        if (!gw) { console.error("📝 sugestão guardada, mas o workspace principal está sem número conectado"); return; }
        const ev: NormalizedEvent = {
          platform: "webhook",
          event: "webhook",
          eventId: "sug-" + Date.now() + "-" + telefone,
          contact: { name: nome || telefone, firstName: nome.split(" ")[0] || "", phone: telefone },
          fields: { nome, telefone, email, sugestao: texto, conta },
          raw: {},
        };
        console.log(`📝 sugestão de ${nome} (${conta}) → fluxo "${FLUXO_SUGESTOES}"`);
        await runAutomationsFor(ev, gw, [fluxo], console.log, true);
      } catch (e: any) {
        console.error("sugestão: fluxo falhou:", e?.message ?? e);
      }
    }),
  );
}
app.post("/admin/sugestao", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return sugestaoHandler(req, reply);
});
app.post("/app/sugestao", sugestaoHandler);
app.post("/admin/automations/teste-ao-vivo", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return testeAoVivoHandler(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/automations/teste-ao-vivo", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return testeAoVivoHandler(ws, req.body, reply);
});
// Diagnóstico dos gatilhos por horário de TODOS os workspaces: publicado? cron bate agora? número
// conectado? quando disparou por último? É a resposta pro "foi não" sem precisar de SSH.
app.get("/admin/agendamentos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ motorIniciadoEm: INICIADO_EM.toISOString(), ...raioXAgendamentos((account, wsId) => gatewayDoWorkspace(wsId, account)) });
});
// Diagnóstico: últimos inbounds recebidos no webhook + fluxos de keyword ativos.
// Serve pra ver "o keyword da filha chegou no motor?" — se aparecer aqui, o webhook entregou.
app.get("/admin/webhook-debug", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const keywordFlows = loadAutomations()
    .filter((a) => a.trigger === "keyword")
    .map((a: any) => ({ name: a.name ?? a.id, keyword: a.keyword ?? null, steps: a.steps?.length ?? 0 }));
  return reply.send({ recentInbound, recentKiwify, keywordFlows, webhookUrl: UAZAPI_WEBHOOK_URL });
});
// Diagnóstico: config de webhook de cada instância Lite (enabled/url/excludeMessages).
// Tail dos logs: ?depois=<id> devolve só o que chegou desde então (o painel guarda o último id).
// ?filtro= corta no servidor (útil pra seguir só "meta ·" ou "SEM DONO" com o ring cheio).
app.get("/admin/logs", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const depois = Number(q?.depois ?? 0);
  const filtro = String(q?.filtro ?? "").toLowerCase().slice(0, 120);
  let linhas = Number.isFinite(depois) && depois > 0 ? logRing.filter((l) => l.id > depois) : logRing.slice(-300);
  if (filtro) linhas = linhas.filter((l) => l.texto.toLowerCase().includes(filtro));
  return reply.send({ linhas: linhas.slice(-500), ultimo: logSeq });
});

// 🧪 TESTAR o passo "Enviar webhook" ANTES de publicar: manda o MESMO POST que o motor mandaria e
// devolve o que o outro lado respondeu. Precisa ser aqui e não no navegador — o destino é outro
// domínio e não tem CORS pra nós; do browser a chamada morreria sem resposta legível.
// SSRF: só http(s) e só host público — sem isto o campo de URL vira uma janela pra rede interna
// (localhost, 10.x, 169.254.169.254 da nuvem) usando o motor como procurador.
async function testaWebhookSaida(body: any, reply: any) {
  const url = String(body?.url ?? "").trim();
  let alvo: URL;
  try { alvo = new URL(url); } catch { return reply.code(400).send({ error: "endereço inválido — comece com https://" }); }
  const recusa = "esse endereço não é público (rede interna) — o teste não sai daqui";
  if (!destinoPublicoOk(alvo) || !(await destinoResolveParaPublico(alvo))) return reply.code(400).send({ error: recusa });
  const corpo: Record<string, string> = {};
  for (const c of Array.isArray(body?.campos) ? body.campos : []) {
    const chave = String(c?.chave ?? "").trim();
    if (chave) corpo[chave] = String(c?.valor ?? "");
  }
  const t0 = Date.now();
  try {
    // redirect "manual": o fetch do Node segue até 20 saltos SOZINHO, e o Location não passava por
    // checagem nenhuma — um 302 pra rede interna furava tudo que foi validado acima. Aqui cada
    // salto é revalidado pelo mesmo portão, e são no máximo 3 (webhook que redireciona 3× é defeito
    // do destino, não caso de uso).
    let atual = alvo, r: Response, saltos = 0;
    for (;;) {
      r = await fetch(atual.toString(), {
        method: saltos === 0 ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        ...(saltos === 0 ? { body: JSON.stringify(corpo) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      const destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!destino) break;
      if (++saltos > 3) return reply.send({ ok: false, status: r.status, ms: Date.now() - t0, erro: "o destino redirecionou demais (mais de 3 vezes)", enviado: corpo });
      let proximo: URL;
      try { proximo = new URL(destino, atual); } catch { return reply.code(400).send({ error: "o destino redirecionou pra um endereço inválido" }); }
      if (!destinoPublicoOk(proximo) || !(await destinoResolveParaPublico(proximo))) {
        console.log(`🚫 teste de webhook: ${alvo.host} redirecionou pra rede interna (${proximo.host}) — barrado`);
        return reply.code(400).send({ error: recusa });
      }
      atual = proximo;
    }
    const texto = (await r.text().catch(() => "")).slice(0, 600);
    console.log(`🧪 teste de webhook → ${alvo.host} · ${r.status} em ${Date.now() - t0}ms`);
    return reply.send({ ok: r.ok, status: r.status, ms: Date.now() - t0, resposta: texto, enviado: corpo });
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "o destino não respondeu em 10s" : String(e?.message ?? e);
    console.log(`🧪 teste de webhook → ${alvo.host} · FALHOU: ${msg}`);
    return reply.send({ ok: false, status: 0, ms: Date.now() - t0, erro: msg, enviado: corpo });
  }
}
app.post("/admin/flow-webhook-test", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return testaWebhookSaida(req.body, reply);
});
app.post("/app/flow-webhook-test", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return testaWebhookSaida(req.body, reply);
});

app.get("/admin/webhook-status", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const instances: any[] = [];
  for (const t of allLiteTokens()) {
    try { instances.push({ token: "…" + t.slice(-6), webhook: await liteGetWebhook(t) }); }
    catch (e: any) { instances.push({ token: "…" + t.slice(-6), error: e.message }); }
  }
  return reply.send({ instances, expectedUrl: UAZAPI_WEBHOOK_URL });
});
// Religa o webhook em todas as instâncias na hora (sem esperar redeploy).
app.post("/admin/webhook-setup", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  await ensureWebhooks();
  return reply.send({ ok: true, instances: allLiteTokens().map((t) => "…" + t.slice(-6)) });
});
// Funil de um fluxo: quantas pessoas passaram por cada nó (since/until em ISO; vazio = tudo).
// Total de pessoas por fluxo (a bolinha na lista de fluxos). Uma consulta pra todos.
app.get("/admin/flow-totals", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ totals: await getFlowTotals() });
});

app.get("/admin/flow-stats", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const automationId = String(q?.automationId ?? "");
  if (!automationId) return reply.code(400).send({ error: "automationId obrigatório" });
  const since = q?.since ? String(q.since) : null;
  const until = q?.until ? String(q.until) : null;
  return reply.send(await getFlowStats(automationId, since, until));
});
// Drill-down: leads que passaram por um NÓ específico (o popup ao clicar no chip do funil).
// Apagar UMA passagem do funil. Serve pra limpar teste (o dono roda o próprio fluxo várias vezes
// montando) sem ter que zerar a estatística inteira. Vale pros dois papéis — cliente cai em /app/*
// pelo remap do painel e nunca alcança dado de outro workspace.
app.post("/admin/flow-node-hit-delete", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const id = Number((req.body as any)?.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: "id inválido" });
  return reply.send({ ok: await deleteNodeHit(id, getPrimaryWorkspace()) });
});
app.post("/app/flow-node-hit-delete", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const id = Number((req.body as any)?.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: "id inválido" });
  return reply.send({ ok: await deleteNodeHit(id, ws) });
});

app.get("/admin/flow-node-leads", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const automationId = String(q?.automationId ?? "");
  const nodeId = String(q?.nodeId ?? "");
  if (!automationId || !nodeId) return reply.code(400).send({ error: "automationId e nodeId obrigatórios" });
  return reply.send({ leads: await getNodeLeads(automationId, nodeId, q?.since ? String(q.since) : null, q?.until ? String(q.until) : null) });
});
app.put("/admin/automations", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  // Aceita { automations: [...] } OU o array direto. Se veio um objeto SEM o campo (body perdido no
  // caminho), NÃO cai pro objeto — devolve erro específico em vez do enganoso "não é lista".
  const body = req.body as any;
  const list = Array.isArray(body) ? body : body?.automations;
  if (list === undefined || list === null) {
    console.warn("⚠️  PUT /admin/automations sem campo 'automations' — body:", JSON.stringify(body)?.slice(0, 200));
    return reply.code(400).send({ error: "requisição sem o campo 'automations' — nada foi salvo, tente de novo" });
  }
  const err = validateAutomations(list);
  if (err) return reply.code(400).send({ error: err });
  try {
    // Blindagem: se algum passo chegou com mídia base64 inline (data:), hospeda AQUI e grava só a URL.
    // Assim a config NUNCA acumula base64 — nenhum save futuro estoura o teto de corpo do painel.
    const { list: clean, hosted, cleared } = await dehydrateAutomationsMedia(cifraSegredosDeHttp(preservaTokensWebhook(list)));
    if (hosted || cleared) console.log(`🩹 dehydrate no save: ${hosted} hospedada(s), ${cleared} inválida(s) limpa(s)`);
    await gravaHistoricoFluxos(clean, await autorDaSessao(req)); // ANTES do save: compara com o gravado
    await saveConfig("automations", clean);
    return reply.send({ ok: true, automations: loadAutomations() });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

// ── Mídia hospedada (upload do builder → URL; evita base64 na config dos fluxos) ──
const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/webm": ".webm", "audio/wav": ".wav",
};
// 🛡️ Tipos que podem sair com o Content-Type ORIGINAL (auditoria 22/08). O upload aceita qualquer
// coisa de propósito — o nó de documento é accept="*/*" e precisa mandar .docx, .xlsx, .zip — mas
// o MIME vinha do `?mime=` do cliente e voltava intacto no GET. Com `?mime=text/html` qualquer
// cliente logado publicava uma PÁGINA executável em app.seudominio.com.br/media/... : phishing
// hospedado no seu próprio domínio, com o seu certificado. Fora desta lista o arquivo continua
// sendo servido — os bytes chegam idênticos pra Meta/UazAPI — mas como octet-stream + anexo,
// que o navegador nunca executa. Filtrar na SAÍDA (e não no upload) também cobre o que já está
// gravado no banco desde antes desta correção.
const MIME_SEGURO = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/webm", "audio/wav",
  "application/pdf", "text/plain", "text/csv", "application/zip",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
// Id ENDEREÇADO POR CONTEÚDO (sha256 dos bytes): o MESMO arquivo sempre vira a MESMA URL. Assim
// re-hospedar (retry, boot repetido, mesmo vídeo em 2 fluxos) cai no ON CONFLICT DO NOTHING e NÃO
// acumula linhas órfãs — ao contrário de um UUID novo a cada vez.
function mediaIdFor(buf: Buffer, mime: string): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 32) + (MEDIA_EXT[mime] ?? "");
}
// Hospeda mídia e devolve a URL. Aceita DOIS formatos no mesmo endpoint:
//  · binário cru (content-type application/octet-stream + ?mime=) — o caminho de hoje
//  · { dataUri } em JSON — o caminho antigo, mantido pra não quebrar página já aberta
// Por que o binário existe: o corpo JSON do PAINEL trava em 10MB (medido em produção, 20/08), e
// base64 infla 33% — na prática vídeo acima de ~7,5MB não passava, e o erro culpava a rede.
function bytesDaRequisicao(req: any): { buf: Buffer; mime: string } | { erro: string } {
  if (Buffer.isBuffer(req.body)) {
    const mime = String((req.query as any)?.mime ?? "").split(";")[0].trim() || "application/octet-stream";
    const anunciado = Number(req.headers?.["content-length"] ?? 0);
    if (anunciado && req.body.length < anunciado) {
      return { erro: `o arquivo chegou incompleto (${(req.body.length / 1048576).toFixed(1)}MB de ${(anunciado / 1048576).toFixed(1)}MB) — tente de novo` };
    }
    return { buf: req.body, mime };
  }
  const dataUri = String((req.body as any)?.dataUri ?? "");
  const m = dataUri.match(/^data:([^,]*?);base64,(.+)$/s);
  if (!m) return { erro: "dataUri inválido" };
  return { buf: Buffer.from(m[2], "base64"), mime: m[1].split(";")[0] || "application/octet-stream" };
}
async function hospedaMidia(req: any, reply: any) {
  const r = bytesDaRequisicao(req);
  if ("erro" in r) return reply.code(400).send({ error: r.erro });
  const { buf, mime } = r;
  if (!buf.length) return reply.code(400).send({ error: "mídia vazia" });
  // 75MB: o painel aceita até 70MB por arquivo (pedido do dono, 14/09); fica abaixo do bodyLimit
  // de 80MB do Fastify. Vídeo pra API Oficial continua limitado pela Meta em 16MB — quem barra é ela.
  if (buf.length > 75 * 1024 * 1024) return reply.code(413).send({ error: "mídia acima de 75MB" });
  const id = mediaIdFor(buf, mime);
  try {
    await saveMedia(id, mime, buf);
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao hospedar: " + e.message });
  }
  return reply.send({ url: `${MEDIA_PUBLIC_BASE}/media/${id}` });
}
app.post("/admin/media", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return hospedaMidia(req, reply);
});
// Servida SEM auth (a UazAPI precisa buscar a URL pra enviar). Id é UUID (não adivinhável).
// ═══ RESUMOS (conversa · grupo · relatório do período) ═══════════════════════════════════════
// Uma lógica só pro admin e pro cliente; o número vem da bolinha escolhida (account). Datas
// "AAAA-MM-DD" no fuso de Brasília. Período máximo de 90 dias; até 40 conversas lidas pela IA.
function periodoResumo(de?: string, ate?: string, padraoDias = 7): { de: Date; ate: Date } {
  const ok = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
  const fim = ok(ate) ? new Date(`${ate}T23:59:59.999-03:00`) : new Date();
  let ini = ok(de) ? new Date(`${de}T00:00:00-03:00`) : new Date(fim.getTime() - padraoDias * 86_400_000);
  if (ini > fim) ini = new Date(fim.getTime() - 86_400_000);
  if (fim.getTime() - ini.getTime() > 90 * 86_400_000) ini = new Date(fim.getTime() - 90 * 86_400_000);
  return { de: ini, ate: fim };
}

async function mensagensParaResumo(o: { ehApi: boolean; token: string | null; chatid: string; ws: string; limite: number; nome: string; ehGrupo: boolean }): Promise<MsgResumo[]> {
  if (o.ehApi) {
    const r = await query<{ body: string; from_me: boolean; ts: string; sender_name: string | null; msg_type: string | null }>(
      "SELECT body, from_me, ts, sender_name, msg_type FROM inbox_messages WHERE workspace_id=$1 AND account LIKE 'meta-%' AND chat_id=$2 ORDER BY ts DESC LIMIT $3",
      [o.ws, o.chatid, o.limite]).catch(() => []);
    return r.map((m) => ({ quem: m.from_me ? "Nós" : (m.sender_name || o.nome), texto: textoDaMsg({ text: m.body, type: m.msg_type ?? undefined }), ts: msDe(Number(m.ts)), fromMe: m.from_me }));
  }
  if (!o.token) return [];
  const msgs = await liteMessages(o.token, o.chatid, o.limite);
  return msgs
    .filter((m: any) => m.type !== "ReactionMessage" && !m.pollVoto)
    .map((m: any) => ({ quem: m.fromMe ? "Nós" : (o.ehGrupo ? (m.senderName || "Participante") : (m.senderName || o.nome)), texto: textoDaMsg(m), ts: msDe(m.timestamp), fromMe: !!m.fromMe }));
}

async function resumoHandler(req: any, reply: any, ehAdmin: boolean) {
  const ws = getCurrentWorkspace();
  if (rateLimited("resumo:" + ws, 40, 3_600_000)) return reply.code(429).send({ error: "Muitos resumos em pouco tempo — aguarde alguns minutos." });
  const b = (req.body ?? {}) as any;
  const tipo = String(b.tipo ?? "");
  if (!["conversa", "grupo", "periodo"].includes(tipo)) return reply.code(400).send({ error: "tipo de resumo inválido" });
  const account = String(b.account ?? "").trim();
  const ehApi = account === "api";
  const token = ehApi ? null : ehAdmin ? resolveLiteToken(account || "lite") : tokenDaConta(req);
  if (!ehApi && !token) return reply.code(400).send({ error: "Esse número não está nesta conta." });
  const pergunta = String(b.pergunta ?? "").trim().slice(0, 500);
  try {
    if (tipo === "conversa" || tipo === "grupo") {
      const chatid = String(b.chatid ?? "").trim();
      if (!chatid) return reply.code(400).send({ error: "Escolha a conversa ou o grupo." });
      const ehGrupo = chatid.endsWith("@g.us");
      const nome = String(b.nome ?? "").slice(0, 80) || chatid.replace(/@.*/, "");
      let msgs = await mensagensParaResumo({ ehApi, token, chatid, ws, limite: ehGrupo ? 500 : 300, nome, ehGrupo });
      // Grupo e "conversa com período" filtram pelas datas; conversa sem datas usa o histórico recente.
      if (ehGrupo || b.de || b.ate) {
        const p = periodoResumo(b.de, b.ate, 1);
        msgs = msgs.filter((m) => m.ts >= p.de.getTime() && m.ts <= p.ate.getTime());
      }
      const texto = await resumeConversa(nome, msgs, pergunta, ehGrupo);
      return reply.send({ tipo, texto, mensagens: msgs.length });
    }
    // RELATÓRIO DO PERÍODO
    const p = periodoResumo(b.de, b.ate, 7);
    const nomes = new Map(loadAutomations().map((a: any) => [a.id, a.name || a.id]));
    const metricas = await metricasDoPeriodo(ws, p, (id) => nomes.get(id) ?? id);
    let alvos: Array<{ id: string; nome: string }> = [];
    if (ehApi) {
      const r = await query<{ chat_id: string; nome: string | null }>(
        `SELECT chat_id, max(sender_name) FILTER (WHERE NOT from_me) nome FROM inbox_messages
          WHERE workspace_id=$1 AND account LIKE 'meta-%' AND ts BETWEEN $2 AND $3 GROUP BY chat_id ORDER BY max(ts) DESC LIMIT 40`,
        [ws, Math.floor(p.de.getTime() / 1000), Math.floor(p.ate.getTime() / 1000)]).catch(() => []);
      alvos = r.map((c) => ({ id: c.chat_id, nome: c.nome || c.chat_id }));
    } else {
      const chats = await liteChats(token!, 400);
      alvos = chats
        .filter((c) => !c.isGroup && c.timestamp && msDe(c.timestamp) >= p.de.getTime() && msDe(c.timestamp) <= p.ate.getTime())
        .slice(0, 40)
        .map((c) => ({ id: c.id, nome: c.name }));
    }
    const conversas: Array<{ nome: string; telefone: string; msgs: MsgResumo[] }> = [];
    for (let i = 0; i < alvos.length; i += 5) {
      const lote = await Promise.all(alvos.slice(i, i + 5).map(async (c) => ({
        nome: c.nome, telefone: c.id.replace(/@.*/, ""),
        msgs: await mensagensParaResumo({ ehApi, token, chatid: c.id, ws, limite: 60, nome: c.nome, ehGrupo: false }).catch(() => [] as MsgResumo[]),
      })));
      conversas.push(...lote.filter((c) => c.msgs.some((m) => m.texto)));
    }
    const classificadas = conversas.length ? await classificaConversas(conversas, pergunta) : [];
    const texto = await textoDoRelatorio(p, metricas, classificadas, pergunta);
    return reply.send({ tipo, periodo: { de: p.de.toISOString(), ate: p.ate.toISOString() }, metricas, conversas: classificadas, texto, limitado: alvos.length >= 40 });
  } catch (e: any) {
    if (e instanceof SemChaveIa) return reply.code(400).send({ error: e.message, semChave: true });
    console.error("resumo:", e?.message ?? e);
    return reply.code(502).send({ error: e?.message || "não consegui gerar o resumo" });
  }
}
app.post("/admin/resumos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return resumoHandler(req, reply, true);
});
app.post("/app/resumos", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const s = await sessionOf(req);
  if (s?.user?.wsRole === "atendente") return reply.code(403).send({ error: "Resumos e relatórios são do dono da conta." });
  return runWithWorkspace(ws, () => resumoHandler(req, reply, false));
});

// QR Code do Pix dos e-mails de recuperação (o Gmail bloqueia imagem em data: URI, então a
// imagem precisa de uma URL pública). Id aleatório da régua; sem ele, 404.
app.get("/pix/qr/:arquivo", async (req, reply) => {
  const id = String((req.params as any).arquivo ?? "").replace(/\.png$/, "");
  const png = await qrDoPix(id).catch(() => null);
  if (!png) return reply.code(404).send({ error: "não encontrado" });
  return reply.header("content-type", "image/png").header("cache-control", "public, max-age=604800").send(png);
});

// 📅 "SALVAR NA MINHA AGENDA" (16/10/2026): link que abre o Google Agenda do LEAD já preenchido com a
// PRÓXIMA ocorrência de um evento semanal (ex.: o workshop de todo sábado). Não precisa de login nem
// de API: é o formulário "action=TEMPLATE" do próprio Google. ?formato=ics devolve o arquivo .ics
// (iPhone/Outlook). Parâmetros: t (título), d (dia da semana 0=dom…6=sáb), i/f (HH:MM, Brasília),
// l (local/link do Meet), x (detalhes). Só redireciona pro calendar.google.com — não é open redirect.
app.get("/agenda/semanal", async (req, reply) => {
  const q = (req.query ?? {}) as any;
  const titulo = String(q.t ?? "Evento").slice(0, 200);
  const dia = Math.min(6, Math.max(0, Number(q.d ?? 6) || 0));
  const hm = (v: any, pad: string) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : pad);
  const ini = hm(q.i, "09:00"), fim = hm(q.f, "10:00");
  const local = String(q.l ?? "").slice(0, 300), det = String(q.x ?? "").slice(0, 1000);
  // Próxima data (Brasília, UTC-3 fixo) cujo FIM ainda não passou.
  const agoraBR = new Date(Date.now() - 3 * 3600_000);
  let alvo = new Date(Date.UTC(agoraBR.getUTCFullYear(), agoraBR.getUTCMonth(), agoraBR.getUTCDate()));
  for (let k = 0; k < 8; k++) {
    const c = new Date(alvo.getTime() + k * 86400_000);
    if (c.getUTCDay() !== dia) continue;
    const [fh, fm] = fim.split(":").map(Number);
    if (c.getTime() + (fh * 60 + fm) * 60_000 > agoraBR.getTime()) { alvo = c; break; }
  }
  const ymd = alvo.toISOString().slice(0, 10).replace(/-/g, "");
  const utc = (h: string) => { const [H, M] = h.split(":").map(Number); const t = new Date(alvo.getTime() + ((H + 3) * 60 + M) * 60_000); return t.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
  if (String(q.formato ?? "") === "ics") {
    const esc = (v: string) => v.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ZapConverte//Agenda//PT", "BEGIN:VEVENT",
      `UID:${ymd}-${Buffer.from(titulo).toString("hex").slice(0, 24)}@zapconverte`, `DTSTAMP:${utc("00:00")}`,
      `DTSTART:${utc(ini)}`, `DTEND:${utc(fim)}`, `SUMMARY:${esc(titulo)}`, `LOCATION:${esc(local)}`, `DESCRIPTION:${esc(det || local)}`,
      "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${esc(titulo)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return reply.header("content-type", "text/calendar; charset=utf-8").header("content-disposition", `attachment; filename="evento-${ymd}.ics"`).send(ics);
  }
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", titulo);
  u.searchParams.set("dates", `${utc(ini)}/${utc(fim)}`);
  u.searchParams.set("ctz", "America/Sao_Paulo");
  if (local) u.searchParams.set("location", local);
  u.searchParams.set("details", det || local);
  return reply.redirect(u.toString(), 302);
});

app.get("/media/:id", async (req, reply) => {
  const id = String((req.params as any).id ?? "");
  const m = await getMedia(id);
  if (!m) return reply.code(404).send({ error: "não encontrado" });
  // Só imagem/vídeo/áudio abrem INLINE (é o que o painel mostra em prévia). Documento e qualquer
  // tipo fora da lista viram anexo — a Meta e a UazAPI baixam os bytes e ignoram este cabeçalho,
  // então nada de envio quebra. `nome` é higienizado porque o id vem da URL (evita quebrar o
  // cabeçalho com CRLF).
  const inline = MEDIA_EXT[m.mime] !== undefined;
  reply.header("Content-Type", MIME_SEGURO.has(m.mime) ? m.mime : "application/octet-stream");
  reply.header("X-Content-Type-Options", "nosniff");
  if (!inline) {
    const nome = id.replace(/[^\w.-]/g, "").slice(0, 80) || "arquivo";
    reply.header("Content-Disposition", `attachment; filename="${nome}"`);
  }
  reply.header("Cache-Control", "public, max-age=31536000, immutable");
  // O painel lê os bytes pro botão "Baixar" do áudio (14/10/2026). O arquivo já é público pela URL
  // (sem cookie, sem credencial), então "*" não abre nada novo — e não depende do cache do
  // Cloudflare, que ignora Vary: Origin e serviria a cópia sem o cabeçalho.
  reply.header("Access-Control-Allow-Origin", "*");
  // RANGE (206): navegador pede pedaços do vídeo/áudio — é o que deixa a bolinha do PTV e o player
  // do inbox começarem a tocar antes de baixar tudo, e permite arrastar a linha do tempo. Sem isto,
  // um mp4 sem faststart (o CapCut exporta assim) ficava PRETO no builder: o Chrome precisava do
  // arquivo inteiro só pra ler o cabeçalho (bolinha do dono, 14/09).
  const total = m.data.length;
  reply.header("Accept-Ranges", "bytes");
  const faixa = String(req.headers.range ?? "").match(/^bytes=(\d*)-(\d*)$/);
  if (faixa && (faixa[1] || faixa[2])) {
    let ini = faixa[1] ? Number(faixa[1]) : Math.max(0, total - Number(faixa[2]));
    let fim = faixa[1] && faixa[2] ? Math.min(Number(faixa[2]), total - 1) : total - 1;
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || ini >= total || ini > fim) {
      reply.code(416).header("Content-Range", `bytes */${total}`);
      return reply.send();
    }
    reply.code(206).header("Content-Range", `bytes ${ini}-${fim}/${total}`).header("Content-Length", String(fim - ini + 1));
    return reply.send(m.data.subarray(ini, fim + 1));
  }
  reply.header("Content-Length", String(total));
  return reply.send(m.data);
});

// 🩹 De-inline de mídia embutida (data:) DENTRO do motor: hospeda no banco (bytes já em memória,
// SEM trafegar corpo grande pela rede) e troca o passo pela URL /media/<id>. É a defesa definitiva
// contra o base64 gigante que inflava a config a dezenas de MB e travava TODO save (o corpo do PUT
// estourava o teto do painel).
//
// ATÔMICO: trabalha numa CÓPIA — só devolve a lista limpa se TUDO hospedar. Se o saveMedia falhar no
// meio, propaga o erro e a lista original (o cache vivo) fica intacta, sem estado meio-URL/meio-base64.
// `data:` quebrado (regex não casa / 0 bytes) é LIMPO (file="") pra não travar todo save pra sempre.
// Ids por hash de conteúdo (mediaIdFor) → re-hospedar é idempotente e não deixa órfão.
async function dehydrateAutomationsMedia(list: any[]): Promise<{ list: any[]; hosted: number; cleared: number }> {
  const clone = structuredClone(Array.isArray(list) ? list : []);
  let hosted = 0, cleared = 0;
  for (const a of clone) {
    if (!a || !Array.isArray(a.steps)) continue;
    for (const s of a.steps) {
      if (!s || typeof s.file !== "string" || !s.file.startsWith("data:")) continue;
      // Aceita mime parametrizado (…;codecs=opus;base64,…). (.*) casa até payload vazio → cai no limpa.
      const m = s.file.match(/^data:([^,]*?);base64,(.*)$/s);
      const buf = m ? Buffer.from(m[2], "base64") : null;
      if (!buf || !buf.length) { s.file = ""; cleared++; continue; } // data: sem conteúdo hospedável: limpa (não trava o save)
      const mime = m![1].split(";")[0] || "application/octet-stream";
      const id = mediaIdFor(buf, mime);
      await saveMedia(id, mime, buf); // se falhar, throw: nada é devolvido, cache original preservado
      s.file = `${MEDIA_PUBLIC_BASE}/media/${id}`;
      hosted++;
    }
  }
  return { list: clone, hosted, cleared };
}

// Gatilho manual (admin): conserta os fluxos JÁ salvos com base64 inline. Corpo minúsculo entra/sai;
// todo o trabalho pesado é interno ao motor. Também roda sozinho no boot (ver sequência de inicialização).
app.post("/admin/automations/dehydrate", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  try {
    const list = loadAutomations();
    const bytesBefore = JSON.stringify(list).length;
    const { list: clean, hosted, cleared } = await dehydrateAutomationsMedia(list);
    if (hosted || cleared) await saveConfig("automations", clean);
    const bytesAfter = JSON.stringify(clean).length;
    return reply.send({ ok: true, hosted, cleared, bytesBefore, bytesAfter });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha no conserto: " + (e?.message ?? e) });
  }
});

// ── Lembretes agendados ───────────────────────────────────────────────────────
function validateReminders(list: any): string | null {
  if (!Array.isArray(list)) return "lembretes deve ser uma lista";
  const ids = new Set<string>();
  for (const r of list) {
    if (!r || typeof r !== "object") return "lembrete inválido";
    if (typeof r.id !== "string" || !r.id.trim()) return "cada lembrete precisa de um id";
    if (ids.has(r.id)) return `id repetido: ${r.id}`;
    ids.add(r.id);
    const s = r.schedule;
    if (!s || !["once", "daily", "weekly"].includes(s.type)) return "agendamento inválido (once/daily/weekly)";
    if (!/^\d{2}:\d{2}$/.test(String(s.time ?? ""))) return "horário inválido (use HH:MM)";
    if (s.type === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date ?? ""))) return "lembrete 'uma vez' precisa de data";
    if (s.type === "weekly" && (!Array.isArray(s.days) || s.days.length === 0)) return "lembrete semanal precisa de ao menos um dia";
    if (typeof r.target !== "string" || !r.target.trim()) return "lembrete precisa de um destino";
    if (!r.flowId && typeof r.message !== "string") return "lembrete precisa de mensagem ou fluxo";
  }
  return null;
}
app.get("/admin/reminders", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ reminders: loadReminders() });
});
app.put("/admin/reminders", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const list = (req.body as any)?.reminders ?? req.body;
  const err = validateReminders(list);
  if (err) return reply.code(400).send({ error: err });
  try {
    await saveConfig("reminders", list as Reminder[]);
    return reply.send({ ok: true, reminders: loadReminders() });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

// ── SaaS: contas, sessão, cupons, afiliados, comissões ───────────────────────
app.post("/auth/signup", LIMITE_ANONIMO, async (req, reply) => {
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!emailOk(email)) return reply.code(400).send({ error: "e-mail inválido" }); // ANTES do rate-limit (chave não cresce)
  // countOnly: cadastros BEM-SUCEDIDOS não empurram a janela (só as falhas, marcadas abaixo) —
  // assim um flood não bloqueia o cadastro de todo mundo por 1h.
  if (rateLimited("signup:" + clientIp(req), 10, 3_600_000, true)) return reply.code(429).send({ error: "muitas tentativas — tente de novo em uma hora" });
  const r = await signup({ name: String(b?.name ?? ""), email: String(b?.email ?? ""), password: String(b?.password ?? ""), coupon: b?.coupon ? String(b.coupon) : undefined, ref: b?.ref ? String(b.ref) : undefined });
  if ("error" in r) { rateNote("signup:" + clientIp(req), 3_600_000); return reply.code(400).send(r); }
  // Cadastro direto sem prova de posse → precisa confirmar o e-mail (fecha a pré-empção). Comprador
  // verificado na Kiwify e trial entram direto (autoConfirm no signup) e caem no {token} abaixo.
  if ("needConfirm" in r) { await enviaConfirmacao(r.email, r.name, r.confirmToken); return reply.send({ needConfirm: true }); }
  return reply.send(r);
});
// Confirma o e-mail (token do link) e já loga.
app.post("/auth/confirm", LIMITE_ANONIMO, async (req, reply) => {
  if (rateLimited("confirm-ip:" + clientIp(req), 20, 900_000)) return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const r = await confirmEmail(String((req.body as any)?.token ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});
// Reenvia o e-mail de confirmação. Resposta sempre genérica (não revela se a conta existe/está pendente).
app.post("/auth/resend-confirm", LIMITE_ANONIMO, async (req, reply) => {
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
  if (rateLimited("resend-ip:" + clientIp(req), 5, 900_000) || (emailOk(email) && rateLimited("resend-em:" + rlKeyFor(email), 3, 3_600_000))) {
    return reply.code(429).send({ error: "muitas tentativas — tente de novo mais tarde" });
  }
  if (emailOk(email)) {
    const rc = await resendConfirmation(email).catch(() => null);
    if (rc) await enviaConfirmacao(email, rc.name, rc.token);
  }
  return reply.send({ ok: true });
});
// "Esqueci minha senha": manda o link de reset por e-mail. Resposta SEMPRE genérica (não revela se
// o e-mail existe — anti-enumeração). Rate-limit por IP e por e-mail contra flood/spam.
app.post("/auth/forgot", LIMITE_ANONIMO, async (req, reply) => {
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
  if (rateLimited("forgot-ip:" + clientIp(req), 5, 900_000) || (emailOk(email) && rateLimited("forgot-em:" + rlKeyFor(email), 3, 3_600_000))) {
    return reply.code(429).send({ error: "muitas tentativas — tente de novo mais tarde" });
  }
  if (emailOk(email)) {
    const r = await requestPasswordReset(email).catch(() => null);
    if (r) {
      const link = `${PAINEL_URL}/redefinir?t=${r.token}`;
      const t = tplResetSenha((r.name || "").split(" ")[0] || "", link);
      await sendEmail(email, t.subject, t.html).catch((e) => console.error("reset email:", e?.message));
      console.log(`🔑 reset de senha solicitado · ${email}`);
    }
  }
  return reply.send({ ok: true, message: "Se existe uma conta com esse e-mail, enviamos o link de redefinição." });
});
// Aplica o reset com o token do e-mail + a nova senha.
app.post("/auth/reset", LIMITE_ANONIMO, async (req, reply) => {
  if (rateLimited("reset-ip:" + clientIp(req), 20, 900_000)) return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const b = req.body as any;
  const r = await resetPassword(String(b?.token ?? ""), String(b?.password ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send({ ok: true });
});
app.post("/auth/login", LIMITE_ANONIMO, async (req, reply) => {
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!emailOk(email)) return reply.code(401).send({ error: "e-mail ou senha incorretos" });
  const ipKey = "login-ip:" + clientIp(req), emKey = "login-em:" + rlKeyFor(email);
  // countOnly nos DOIS: só FALHA de senha empurra a janela (logins legítimos não gastam cota e o
  // bloqueio não se auto-renova com o tráfego do atacante).
  if (rateLimited(ipKey, 60, 900_000, true) || rateLimited(emKey, 8, 900_000, true))
    return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const r = await login(String(b?.email ?? ""), String(b?.password ?? ""));
  if ("error" in r) {
    // Senha certa mas e-mail não confirmado: reenvia o link (não é falha de senha → não empurra o rate-limit).
    if ("unconfirmed" in r && r.unconfirmed) {
      const rc = await resendConfirmation(email).catch(() => null);
      if (rc) await enviaConfirmacao(email, rc.name, rc.token);
      return reply.code(403).send(r);
    }
    rateNote(ipKey, 900_000); rateNote(emKey, 900_000); return reply.code(401).send(r);
  }
  return reply.send(r); // token OU { need2fa, tfa } (senha ok + 2FA ligado → falta o código do app)
});
// 2º passo do login com 2FA: ticket + código de 6 dígitos → sessão.
// Defesa em camadas: ticket (6 tentativas) + IP (aqui) + contador CUMULATIVO por conta com lock
// (no banco, dentro do login2fa) — esta última é a que o ticket rotativo não contorna.
app.post("/auth/login/2fa", LIMITE_ANONIMO, async (req, reply) => {
  const b = req.body as any;
  const ipKey = "2fa-ip:" + clientIp(req);
  if (rateLimited(ipKey, 60, 900_000, true))
    return reply.code(429).send({ error: "muitas tentativas — aguarde alguns minutos" });
  const r = await login2fa(String(b?.tfa ?? ""), String(b?.code ?? ""));
  if ("error" in r) { rateNote(ipKey, 900_000); return reply.code(401).send(r); }
  return reply.send(r);
});
app.post("/auth/logout", async (req, reply) => {
  await logout(String(req.headers["x-session-token"] ?? ""));
  return reply.send({ ok: true });
});
app.get("/auth/session", async (req, reply) => {
  const s = await getSession(String(req.headers["x-session-token"] ?? ""));
  if (!s) return reply.code(401).send({ error: "sessão inválida" });
  return reply.send(s);
});
// "Já assinei" no paywall: re-checa a compra na Kiwify e libera o plano se já pagou.
// ⚠️ BILLING é do DONO. Um MEMBRO da equipe não pode creditar a compra dele (e-mail dele!) nem
// resgatar cupom no workspace do dono — seria pagar/ativar por tabela alheia.
app.post("/auth/sync-access", LIMITE_ANONIMO, async (req, reply) => {
  const s = await getSession(String(req.headers["x-session-token"] ?? ""));
  if (!s) return reply.code(401).send({ error: "sessão inválida" });
  if (s.user.wsRole !== "dono") return reply.code(403).send({ error: "só o dono da conta cuida do plano" });
  const activated = await syncPaidAccess(s.user.email, s.workspace.id).catch(() => false);
  return reply.send({ ok: true, activated });
});
app.post("/auth/redeem", LIMITE_ANONIMO, async (req, reply) => {
  const s = await getSession(String(req.headers["x-session-token"] ?? ""));
  if (!s) return reply.code(401).send({ error: "sessão inválida" });
  if (s.user.wsRole !== "dono") return reply.code(403).send({ error: "só o dono da conta pode usar cupom" });
  // Anti-brute-force de código de cupom (por conta).
  if (rateLimited("redeem:" + s.workspace.id, 10, 3_600_000)) return reply.code(429).send({ error: "muitas tentativas de cupom — aguarde" });
  const r = await redeemCouponForWorkspace(s.workspace.id, String((req.body as any)?.coupon ?? ""));
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});

// Admin SaaS (painel manda o admin-token; o papel de admin é checado no painel pela sessão).
app.get("/admin/coupons", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ coupons: await query("SELECT * FROM coupons ORDER BY created_at DESC") });
});
app.put("/admin/coupons", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const code = String(b?.code ?? "").trim().toUpperCase();
  if (!code || !/^[A-Z0-9_-]{2,32}$/.test(code)) return reply.code(400).send({ error: "código inválido (letras/números, 2-32)" });
  const trialDays = Math.max(1, Math.min(365, Number(b?.trial_days) || 0));
  if (!trialDays) return reply.code(400).send({ error: "dias de teste inválidos" });
  await query(
    `INSERT INTO coupons(code, trial_days, max_uses, expires_at, active) VALUES($1,$2,$3,$4,TRUE)
     ON CONFLICT (code) DO UPDATE SET trial_days=EXCLUDED.trial_days, max_uses=EXCLUDED.max_uses, expires_at=EXCLUDED.expires_at`,
    // Validade no fim do dia no horário do Brasil (-03:00), não no fuso do servidor (evita expirar ~3h cedo).
    [code, trialDays, b?.max_uses != null && b.max_uses !== "" ? Number(b.max_uses) : null, b?.expires_at ? new Date(String(b.expires_at) + "T23:59:59-03:00") : null],
  );
  return reply.send({ ok: true });
});
app.post("/admin/coupons/toggle", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  await query("UPDATE coupons SET active=$1 WHERE code=$2", [Boolean(b?.active), String(b?.code ?? "").toUpperCase()]);
  return reply.send({ ok: true });
});

app.get("/admin/affiliates", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  // Cada afiliado com: comissões (ranking), a PÁGINA de afiliado dele (casada por e-mail) + leads de
  // teste que ela trouxe, e a CARTEIRA de clientes que ele gerou.
  // A carteira vem de DUAS fontes unidas, sem repetir cliente:
  //   (1) VENDA da Kiwify (sales.affiliate_id → e-mail do comprador → workspace) — o caminho real;
  //   (2) cadastro pelo link ?ref= (workspaces.referred_by).
  // Só (2) deixava o placar zerado mesmo com venda paga (o webhook não gravava atribuição; corrigido
  // em handleBillingEvent, e a união cobre o histórico anterior ao fix).
  // "mrr" = soma dos planos ATIVOS pelo preço MENSAL (espelha OFERTAS): cliente anual entra pelo
  // equivalente mensal — é estimativa. A divisão casa/afiliado é feita no painel pelo % do afiliado.
  const affiliates = await query(`
    WITH com AS (
      SELECT affiliate_id,
             SUM(CASE WHEN status <> 'estornado' THEN amount ELSE 0 END) AS total,
             SUM(CASE WHEN status = 'pendente' THEN amount ELSE 0 END) AS pending,
             COUNT(*) AS sales_count,
             SUM(CASE WHEN status = 'estornado' THEN 1 ELSE 0 END) AS canceled_count
        FROM commissions GROUP BY affiliate_id
    ),
    carteira AS (
      SELECT s.affiliate_id AS aff, w.id, w.status, w.paid_until, w.plan
        FROM sales s
        JOIN users u ON lower(u.email) = lower(s.buyer_email)
        JOIN workspaces w ON w.owner_user_id = u.id
       WHERE s.affiliate_id IS NOT NULL AND s.status = 'paga'
      UNION
      SELECT w.referred_by AS aff, w.id, w.status, w.paid_until, w.plan
        FROM workspaces w WHERE w.referred_by IS NOT NULL
    ),
    cart AS (
      SELECT aff,
             SUM(CASE WHEN status='active' AND (paid_until IS NULL OR paid_until > now()) THEN 1 ELSE 0 END) AS ativos,
             SUM(CASE WHEN status='active' AND paid_until IS NOT NULL AND paid_until <= now() THEN 1 ELSE 0 END) AS inadimplentes,
             SUM(CASE WHEN status='canceled' THEN 1 ELSE 0 END) AS inativos,
             SUM(CASE WHEN status='active' AND (paid_until IS NULL OR paid_until > now())
                      THEN (CASE plan WHEN 'start' THEN 97 WHEN 'pro' THEN 147 WHEN 'escala' THEN 297 ELSE 0 END)
                      ELSE 0 END) AS mrr
        FROM carteira GROUP BY aff
    ),
    pag AS (SELECT lower(email) AS em, MIN(slug) AS slug FROM affiliate_promo GROUP BY lower(email)),
    lds AS (SELECT slug, COUNT(*) AS n FROM trial_leads GROUP BY slug)
    SELECT a.*,
           COALESCE(c.total,0) AS accumulated, COALESCE(c.pending,0) AS pending,
           COALESCE(c.sales_count,0) AS sales_count, COALESCE(c.canceled_count,0) AS canceled_count,
           pag.slug AS promo_slug, COALESCE(lds.n,0) AS trial_leads,
           COALESCE(cart.ativos,0) AS clientes_ativos, COALESCE(cart.inadimplentes,0) AS clientes_inadimplentes,
           COALESCE(cart.inativos,0) AS clientes_inativos, COALESCE(cart.mrr,0) AS mrr
      FROM affiliates a
      LEFT JOIN com c ON c.affiliate_id = a.id
      LEFT JOIN cart ON cart.aff = a.id
      LEFT JOIN pag ON a.email IS NOT NULL AND pag.em = lower(a.email)
      LEFT JOIN lds ON lds.slug = pag.slug
     ORDER BY COALESCE(c.sales_count,0) DESC, COALESCE(c.total,0) DESC, a.created_at DESC`);
  return reply.send({ affiliates });
});
app.put("/admin/affiliates", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const name = String(b?.name ?? "").trim();
  if (!name) return reply.code(400).send({ error: "informe o nome" });
  const id = b?.id ? String(b.id) : "a_" + randomUUID();
  const ref = String(b?.ref_code ?? "").trim().toUpperCase() || name.split(" ")[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) + Math.floor(100 + Math.random() * 900);
  const pct = Math.max(0, Math.min(90, Number(b?.commission_pct) || 30));
  await query(
    `INSERT INTO affiliates(id, name, email, phone, instagram, kind, ref_code, commission_pct, active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
     ON CONFLICT (id) DO UPDATE SET name=$2, email=$3, phone=$4, instagram=$5, kind=$6, ref_code=$7, commission_pct=$8`,
    [id, name, b?.email ?? null, b?.phone ?? null, b?.instagram ?? null, b?.kind === "parceiro" ? "parceiro" : "afiliado", ref, pct],
  );
  return reply.send({ ok: true, id, ref_code: ref });
});
app.post("/admin/affiliates/toggle", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  await query("UPDATE affiliates SET active=$1 WHERE id=$2", [Boolean(b?.active), String(b?.id ?? "")]);
  return reply.send({ ok: true });
});
app.post("/admin/affiliates/remove", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  await query("DELETE FROM affiliates WHERE id=$1", [String((req.body as any)?.id ?? "")]);
  return reply.send({ ok: true });
});
// Liberar teste manual (por e-mail) — atribui o afiliado se a conta ainda não tem indicação.
app.post("/admin/trial/grant", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  // Só aqui (rota de admin) a concessão pode reativar conta cancelada — é o win-back manual.
  const r = await grantTrialByEmail(String(b?.email ?? ""), Math.max(1, Math.min(90, Number(b?.days) || 3)), b?.affiliateId ? String(b.affiliateId) : undefined, { permitirCancelada: true });
  if ("error" in r) return reply.code(400).send(r);
  return reply.send(r);
});

// Tela de Clientes: lista as contas com status da assinatura (ativo/trial/atrasado/cancelado).
// Enriquecimento com contagem de números por cliente (números conectados + instâncias livres).
// Cacheado 15s porque resolve o status AO VIVO de cada instância LITE na UazAPI (custa 1 chamada
// por instância). "provisioned" = slots que o cliente OCUPA na UazAPI (contam pro limite, mesmo sem
// escanear o QR ainda); "connected" = quantos estão online agora.
let clientsCache: { at: number; data: unknown } | null = null;
async function clientNumbers(wsId: string): Promise<{ liteConnected: number; liteTotal: number; apiConnected: boolean; limit: number; phone: string | null }> {
  const lite = getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? [];
  const meta = getCachedFor<any>(wsId, "meta-official");
  const limit = Math.max(1, Number(getCachedFor<number>(wsId, "number-limit")) || 1);
  const statuses = await Promise.all(lite.map((it) => liteInstanceStatus(it.token).then((s) => ({ ok: s.status === "connected", number: s.number })).catch(() => ({ ok: false, number: undefined as string | undefined }))));
  // Telefone pra CHAMAR o cliente: 1º número LITE conectado; senão o número da API oficial. Só dígitos.
  const soDig = (v: any) => String(v ?? "").replace(/\D/g, "");
  const liteNum = statuses.find((s) => s.ok && s.number)?.number;
  const apiNum = meta?.connected ? (meta.displayNumber ?? meta.number) : undefined;
  const phone = soDig(liteNum || apiNum) || null;
  return { liteConnected: statuses.filter((s) => s.ok).length, liteTotal: lite.length, apiConnected: !!meta?.connected, limit, phone };
}
app.get("/admin/clients", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  if (clientsCache && Date.now() - clientsCache.at < 15_000) return reply.send(clientsCache.data);
  const clients = await listClients();
  const enriched = await Promise.all(clients.map(async (c) => {
    const n = await clientNumbers(c.ws_id).catch(() => ({ liteConnected: 0, liteTotal: 0, apiConnected: false, limit: 1, phone: null as string | null }));
    const provisioned = n.liteTotal + (n.apiConnected ? 1 : 0);
    // Telefone p/ o botão de WhatsApp: prioriza o do CADASTRO de trial (contato pessoal que a
    // pessoa deu) e cai pro número conectado (WhatsApp que ela plugou na plataforma).
    const trialPhone = c.trial_phone ? String(c.trial_phone).replace(/\D/g, "") : "";
    return {
      ...c,
      lite_connected: n.liteConnected,
      lite_total: n.liteTotal,
      api_connected: n.apiConnected,
      numbers_connected: n.liteConnected + (n.apiConnected ? 1 : 0),
      number_limit: n.limit,
      numbers_used: provisioned,
      numbers_available: Math.max(0, n.limit - provisioned),
      phone: (trialPhone.length >= 10 ? trialPhone : "") || n.phone || null,
      perfil: perfilDoWorkspace(c.ws_id),
    };
  }));
  const data = { clients: enriched };
  clientsCache = { at: Date.now(), data };
  return reply.send(data);
});
// Super-admin: LIBERA PLANO na mão (venda fechada por fora — pix direto, negociação). Soma no
// paid_until vigente; opcionalmente já sobe o limite de números do plano no mesmo clique.
app.post("/admin/clients/grant-plan", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return reply.code(400).send({ error: "e-mail inválido" });
  const dias = Math.max(1, Math.min(730, Math.round(Number(b?.dias)) || 30));
  const plano = ["start", "pro", "escala"].includes(String(b?.plan)) ? String(b.plan) : undefined;
  const r = await grantPlanByEmail(email, dias, plano);
  if ("error" in r) return reply.code(400).send(r);
  const numeros = Math.round(Number(b?.numeros));
  if (numeros >= 1 && numeros <= 50) {
    const wsId = await workspaceIdByEmail(email);
    if (wsId) await saveConfigFor(wsId, "number-limit", numeros);
  }
  // Venda fechada por fora (PIX/transferência) entra nas Vendas & Ganhos junto com a liberação.
  const valor = Number(b?.valor);
  let venda: string | null = null;
  if (valor > 0) {
    const v = await registrarVendaManual(email, valor, plano ?? "manual", b?.nota ? String(b.nota).slice(0, 120) : undefined);
    venda = v.orderId;
    // ⚠️ Vendas são por E-MAIL; o CRM (aba Contatos → Compradores) é por TELEFONE. Sem este passo
    // a venda existia em Vendas & Ganhos mas o contato não aparecia como comprador (06/08).
    const tel = String(b?.telefone ?? "").replace(/\D/g, "");
    if (tel.length >= 10) {
      await runWithWorkspace(getPrimaryWorkspace(), async () => {
        await upsertContact(tel, String(b?.nome ?? "").trim() || undefined, "manual").catch(() => {});
        await recordEvent(tel, "manual", "purchase_approved", plano ? `Plano ${plano}` : "Venda manual", valor).catch(() => {});
      });
    }
  }
  clientsCache = null; // a tela de Clientes reflete na hora
  console.log(`💳 plano liberado na mão: ${email} +${dias}d${plano ? " (" + plano + ")" : ""}${valor > 0 ? ` · venda R$${valor}` : ""}`);
  return reply.send({ ok: true, email, paidUntil: r.paidUntil, venda });
});
// Super-admin: define quantos NÚMEROS de WhatsApp um cliente pode conectar (libera mais canais LITE).
// ── FEATURES LIBERADAS POR CLIENTE ─────────────────────────────────────────────────────────
// Recurso sensível (hoje: o nó de código) nasce só pro super admin e é liberado cliente a cliente.
app.get("/admin/features", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const email = String((req.query as any)?.email ?? "").trim().toLowerCase();
  // Sem email = "o que EU tenho?" (o builder do próprio admin perguntando). O super admin tem
  // tudo — é ele quem aprova, então não precisa se aprovar. Com email = a conta daquele cliente.
  if (!email) return reply.send({ catalogo: FEATURES, liberadas: FEATURES.map((f) => f.id) });
  const wsId = await workspaceIdByEmail(email);
  if (!wsId) return reply.code(404).send({ error: "cliente não encontrado" });
  return reply.send({ catalogo: FEATURES, liberadas: featuresDoWorkspace(wsId) });
});
app.post("/admin/features", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  const pedidas = Array.isArray(b?.liberadas) ? b.liberadas.map((x: any) => String(x)) : [];
  const wsId = await workspaceIdByEmail(email);
  if (!wsId) return reply.code(404).send({ error: "cliente não encontrado" });
  // Só ids do catálogo entram — id inventado no corpo não vira permissão fantasma.
  const validas = pedidas.filter((id: string) => FEATURES.some((f) => f.id === id));
  await saveConfigFor(wsId, "features-liberadas", validas);
  console.log(`🔓 features do cliente ${email}: ${validas.length ? validas.join(", ") : "(nenhuma)"}`);
  return reply.send({ ok: true, email, liberadas: validas });
});

// "Execute step" do nó de código: roda o JavaScript com os dados que a pessoa tem na tela e
// devolve saída + console.log. Mesmo executor isolado da produção — o que passar aqui passa lá.
app.post("/admin/code/testar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  return reply.send(await rodaCodigo(String(b?.codigo ?? ""), (b?.campos ?? {}) as Record<string, string>));
});
app.post("/app/code/testar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  if (!workspacePodeUsar(ws, "code_node")) return reply.code(403).send({ error: "o nó de código não está liberado para esta conta" });
  // O QuickJS roda SÍNCRONO no mesmo thread: cada teste segura o motor por até 1s. Em laço, o
  // painel de todos os clientes trava. O teto de feature limita quem chega aqui; este limita
  // quantas vezes (auditoria 07/09).
  if (rateLimited("code:" + ws, 20, 60_000)) return reply.code(429).send({ error: "muitos testes seguidos — espere um minuto." });
  const b = (req.body ?? {}) as any;
  return reply.send(await rodaCodigo(String(b?.codigo ?? ""), (b?.campos ?? {}) as Record<string, string>));
});
// ── PERFIL DO NEGÓCIO (ex.: advocacia) — liga recursos do segmento, como o botão de contrato ──
app.post("/admin/clients/perfil", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  const wsId = await workspaceIdByEmail(email);
  if (!wsId) return reply.code(404).send({ error: "cliente não encontrado" });
  const perfil = await salvarPerfil(wsId, b?.perfil ? String(b.perfil) : null);
  clientsCache = null;
  console.log(`🏷️ perfil do cliente ${email}: ${perfil ?? "(geral)"}`);
  return reply.send({ ok: true, email, perfil });
});

// ── ADVOCACIA: contrato e procuração pela conversa (advocacia.ts). Admin = workspace primário. ──
// Todo endpoint confere o perfil AQUI — esconder o botão no painel não é controle.
const semPerfilAdv = (reply: any) => reply.code(403).send({ error: "recurso do perfil advocacia — peça ao suporte pra ativar" });
async function advStatusH(_req: any, reply: any) { return reply.send(estadoAdvocacia(getCurrentWorkspace())); }
async function advConfigH(req: any, reply: any) {
  const ws = getCurrentWorkspace();
  if (perfilDoWorkspace(ws) !== "advocacia") return semPerfilAdv(reply);
  const r = await salvarConfigAdvocacia(ws, (req.body ?? {}) as any);
  if (r.erro) return reply.code(400).send({ error: r.erro });
  return reply.send({ ok: true, ...estadoAdvocacia(ws) });
}
async function advConfigRemoveH(_req: any, reply: any) {
  const ws = getCurrentWorkspace();
  await removerConfigAdvocacia(ws);
  return reply.send({ ok: true, ...estadoAdvocacia(ws) });
}
const foneDoChat = (v: any) => String(v ?? "").replace(/@.*/, "").replace(/\D/g, "");
async function advExtrairH(req: any, reply: any) {
  if (perfilDoWorkspace(getCurrentWorkspace()) !== "advocacia") return semPerfilAdv(reply);
  const b = (req.body ?? {}) as any;
  const fone = foneDoChat(b.phone);
  if (fone.length < 10) return reply.code(400).send({ error: "conversa sem telefone — abra uma conversa 1:1" });
  const falas = Array.isArray(b.falas) ? b.falas.slice(-200).map((x: any) => String(x ?? "").slice(0, 2000)) : [];
  return reply.send(await extrairDadosContrato(fone, falas));
}
async function advGerarH(req: any, reply: any) {
  const ws = getCurrentWorkspace();
  if (perfilDoWorkspace(ws) !== "advocacia") return semPerfilAdv(reply);
  // Cada geração cria documento pago na ZapSign: teto por workspace além dos limites do escritório.
  if (rateLimited("contrato:" + ws, 10, 60_000)) return reply.code(429).send({ error: "muitas gerações seguidas — espere um minuto" });
  const b = (req.body ?? {}) as any;
  const fone = foneDoChat(b.phone);
  if (fone.length < 10) return reply.code(400).send({ error: "conversa sem telefone — abra uma conversa 1:1" });
  // modelo: "trabalhista" | "previdenciario" — o escritório escolhe o par de documentos por ele
  const modelo = b.modelo === "previdenciario" ? "previdenciario" : "trabalhista";
  return reply.send(await gerarContrato(fone, (b.dados ?? {}) as Record<string, unknown>, modelo));
}
async function advStatusContratoH(req: any, reply: any) {
  if (perfilDoWorkspace(getCurrentWorkspace()) !== "advocacia") return semPerfilAdv(reply);
  const fone = foneDoChat((req.query as any)?.phone);
  if (fone.length < 10) return reply.code(400).send({ error: "informe o telefone" });
  return reply.send(await statusContrato(fone));
}
const advRotas: Array<["get" | "post", string, (req: any, reply: any) => Promise<any>]> = [
  ["get", "/advocacia/status", advStatusH],
  ["post", "/advocacia/config", advConfigH],
  ["post", "/advocacia/config/remove", advConfigRemoveH],
  ["post", "/advocacia/contrato/extrair", advExtrairH],
  ["post", "/advocacia/contrato/gerar", advGerarH],
  ["get", "/advocacia/contrato/status", advStatusContratoH],
];
for (const [metodo, rota, h] of advRotas) {
  app[metodo]("/admin" + rota, async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
    return h(req, reply);
  });
  app[metodo]("/app" + rota, async (req, reply) => {
    const ws = await clientWs(req, reply); if (!ws) return;
    return runWithWorkspace(ws, () => h(req, reply));
  });
}

// Quais features ESTA conta tem (o painel do cliente usa pra mostrar/esconder o nó).
app.get("/app/features", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ liberadas: featuresDoWorkspace(ws) });
});

app.post("/admin/clients/number-limit", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(50, Math.round(Number(b?.limit)) || 1));
  const wsId = await workspaceIdByEmail(email);
  if (!wsId) return reply.code(404).send({ error: "cliente não encontrado" });
  await saveConfigFor(wsId, "number-limit", limit);
  clientsCache = null; // reflete o novo limite na tela de Clientes na hora
  return reply.send({ ok: true, email, limit });
});
// TRANSFERE um WhatsApp conectado do painel do SUPER-ADMIN pro workspace de um cliente.
// É a limpeza da sequela do incidente 16/08 (cliente escaneava o QR e a instância caía na conta
// do dono — caso de um cliente: conectada mas "0/1" em Clientes) e também serve pro fluxo legítimo
// "o admin pareia pelo cliente e depois atribui". NÃO toca na UazAPI: a sessão do WhatsApp
// continua viva; muda só a atribuição (config + roteamento do inbound).
app.post("/admin/clients/vincular-whats", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const email = String(b?.email ?? "").trim().toLowerCase();
  const account = String(b?.account ?? "");
  if (!email.includes("@") || !account) return reply.code(400).send({ error: "informe o cliente (email) e a conta (account)" });
  const wsCliente = await workspaceIdByEmail(email);
  if (!wsCliente) return reply.code(404).send({ error: "cliente não encontrado" });
  const primario = getPrimaryWorkspace();
  if (wsCliente === primario) return reply.code(400).send({ error: "esse e-mail é o do super-admin" });
  const doPrimario = getCachedFor<LiteStored[]>(primario, "lite-instances") ?? [];
  const it = doPrimario.find((x) => idDaInstancia(x.token) === account);
  if (!it) return reply.code(404).send({ error: "essa conta não está no painel do super-admin" });
  // tira do primário e entrega ao cliente (config) + corrige o roteamento do inbound (tabela instances)
  await saveConfigFor(primario, "lite-instances", doPrimario.filter((x) => x.token !== it.token));
  const doCliente = (getCachedFor<LiteStored[]>(wsCliente, "lite-instances") ?? []).filter((x) => x.token !== it.token);
  doCliente.push({ token: it.token, name: it.name });
  await saveConfigFor(wsCliente, "lite-instances", doCliente);
  await upsertInstance(it.token, wsCliente, { platform: "lite", name: it.name }).catch(() => {});
  accountsCache = null;
  clientsCache = null;
  console.log(`🔁 vincular-whats: token …${it.token.slice(-6)} transferido do primário → ws ${wsCliente.slice(0, 8)} (${email})`);
  return reply.send({ ok: true, email, account });
});
// Resgate: cliente perdeu o celular do 2FA → o super-admin desliga o 2FA da conta dele.
app.post("/admin/clients/disable-2fa", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return reply.code(400).send({ error: "e-mail inválido" });
  const found = await adminDisable2fa(email);
  if (!found) return reply.code(404).send({ error: "não achei conta com esse e-mail" });
  return reply.send({ ok: true, email });
});

// Reseta a senha de um cliente e DEVOLVE a nova (pro dono repassar). Rede de segurança contra
// lockout quando a entrega automática (WhatsApp/email) falha.
app.post("/admin/accounts/set-password", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return reply.code(400).send({ error: "e-mail inválido" });
  const r = await setUserPassword(email);
  if (!r) return reply.code(404).send({ error: "não achei conta com esse e-mail" });
  return reply.send({ ok: true, email, name: r.name, password: r.password });
});
// Dashboard financeiro: bruto, taxa Kiwify, SEUS ganhos, pago a afiliados (por período).
app.get("/admin/sales-summary", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const since = (req.query as any)?.since ? String((req.query as any).since) : null;
  return reply.send(await salesSummary(since));
});
app.get("/admin/commissions", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const commissions = await query(`
    SELECT c.*, a.name AS affiliate_name FROM commissions c
      LEFT JOIN affiliates a ON a.id = c.affiliate_id
     ORDER BY c.created_at DESC LIMIT 200`);
  return reply.send({ commissions });
});
app.post("/admin/commissions/pay", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  await query("UPDATE commissions SET status='pago', paid_at=now() WHERE id=$1", [String((req.body as any)?.id ?? "")]);
  return reply.send({ ok: true });
});

// ── API OFICIAL (WhatsApp Cloud API) — conexão do número oficial ──────────────
const META_WEBHOOK_URL = "https://app.seudominio.com.br/webhooks/meta";

app.get("/admin/meta", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(metaParaPainel(await garanteVerifyToken(getPrimaryWorkspace())));
});

app.put("/admin/meta", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body as any) ?? {};
  const cfg = metaParaSalvar(b, getCached<any>("meta-official"));
  if (!cfg.verifyToken) return reply.code(400).send({ error: "token de verificação é obrigatório" });
  try {
    await saveConfig("meta-official", cfg);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(500).send({ error: "falha ao salvar: " + e.message });
  }
});

// Testa as credenciais buscando os dados do número na Graph API.
app.post("/admin/meta/test", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body as any) ?? {};
  const cfgAtual = getCached<any>("meta-official");
  const phoneNumberId = String(b.phoneNumberId ?? "").trim() || String(cfgAtual?.phoneNumberId ?? "");
  // Painel não reenvia o segredo (ele nem o tem): campo vazio = usa o que está salvo.
  const accessToken = String(b.accessToken ?? "").trim() || metaSegredo(cfgAtual, "accessToken");
  if (!phoneNumberId || !accessToken)
    return reply.code(400).send({ error: "informe Phone Number ID e Access Token" });
  try {
    const info = await metaPhoneInfo(phoneNumberId, accessToken);
    return reply.send({
      ok: true,
      displayNumber: info.display_phone_number ?? "",
      verifiedName: info.verified_name ?? "",
      quality: info.quality_rating ?? "",
    });
  } catch (e: any) {
    return reply.code(200).send({ ok: false, error: e.message });
  }
});

// ── Templates da API Oficial (modelos aprovados pela Meta) ────────────────────
function metaCreds(): { wabaId: string; phoneNumberId: string; accessToken: string } | null {
  const c = getCached<any>("meta-official");
  const tok = metaSegredo(c, "accessToken");
  if (!tok) return null;
  return { wabaId: c?.wabaId ?? "", phoneNumberId: c?.phoneNumberId ?? "", accessToken: tok };
}
// ── 🔵 ETIQUETAS DA META (CAPI de mensagens) ────────────────────────────────────────────────
// Etiquetas FIXAS, azuis e com o símbolo da Meta no painel. Marcar um contato com uma delas
// DISPARA o evento correspondente na API de Conversões de MENSAGENS (business_messaging +
// ctwa_clid): a campanha de Click-to-WhatsApp fica sabendo qual conversa virou venda e passa a
// otimizar por COMPRA, não por clique. Pesquisa + prova de conceito: 13-14/09/2026 (dataset por
// WABA, evento custom rejeitado, Meta NÃO deduplica). Os NOMES são contrato com o painel
// (lib/etiquetas-meta.ts no web): mudou aqui, muda lá.
const ETIQUETAS_META: Array<{ tag: string; evento: string | null; dica: string }> = [
  { tag: "Compra aprovada", evento: "Purchase", dica: "Venda fechada nesta conversa — aceita o valor em R$ e vira Purchase na Meta." },
  { tag: "Lead qualificado", evento: "QualifiedLead", dica: "Lead com perfil de compra — a campanha aprende a buscar gente assim." },
  { tag: "Lead cadastrado", evento: "LeadSubmitted", dica: "Deixou os dados, virou cadastro." },
  { tag: "Checkout iniciado", evento: "InitiateCheckout", dica: "Recebeu o link de pagamento e começou a pagar." },
  { tag: "Carrinho abandonado", evento: "CartAbandoned", dica: "Começou a comprar e parou no meio." },
  { tag: "Lead desqualificado", evento: null, dica: "Só organiza aqui dentro — a Meta não tem evento negativo; o sinal dela é nunca receber o de qualificado." },
];
const etiquetaMeta = (t: string) => ETIQUETAS_META.find((e) => e.tag.toLowerCase() === String(t ?? "").trim().toLowerCase()) ?? null;

// Config POR WORKSPACE (Integrações → Conversões de WhatsApp): dataset + token opcional.
// Sem token próprio vale o da conexão oficial — é o mesmo dono e a mesma permissão
// (whatsapp_business_manage_events bastou no teste de 14/09, sem App Review).
function capiWhatsAppCfg(): { datasetId: string; token: string; testCode: string } | null {
  const c = getCached<any>("capi-whatsapp") ?? {};
  const datasetId = String(c.datasetId ?? "").trim();
  if (!datasetId) return null;
  const token = c.tokenEnc ? decryptSecret(String(c.tokenEnc)) : (metaCreds()?.accessToken ?? "");
  return token ? { datasetId, token, testCode: String(c.testCode ?? "").trim() } : null;
}

// Etiqueta marcada → evento enviado. Nunca lança: devolve o status pro painel mostrar na hora, e
// TUDO fica no livro-razão capi_eventos (é ele que segura duplicata — a Meta conta 2× sem dó).
async function disparaEtiquetaMeta(tel: string, tag: string, valor?: number | null, forcar?: boolean):
  Promise<{ tag: string; evento: string | null; status: string; detalhe: string }> {
  const em = etiquetaMeta(tag)!;
  const ws = getCurrentWorkspace();
  const grava = (status: string, detalhe: string, clid?: string, dataset?: string) =>
    query(
      "INSERT INTO capi_eventos(workspace_id, phone, evento, valor, ctwa_clid, dataset_id, status, detalhe) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [ws, tel, em.evento ?? em.tag, valor ?? null, clid ?? null, dataset ?? null, status, detalhe.slice(0, 300)],
    ).catch(() => {});
  if (!em.evento) return { tag: em.tag, evento: null, status: "local", detalhe: "etiqueta só de organização — nada vai pra Meta" };
  const cfg = capiWhatsAppCfg();
  if (!cfg) {
    const detalhe = "configure o conjunto de dados em Integrações → Conversões de WhatsApp";
    await grava("sem_config", detalhe);
    return { tag: em.tag, evento: em.evento, status: "sem_config", detalhe };
  }
  const clid = String((await getContactFields(tel)).anuncio_clique ?? "").trim();
  if (!clid) {
    const detalhe = "este contato não tem clique de anúncio registrado (não veio de Click-to-WhatsApp) — a Meta não teria como casar o evento";
    await grava("sem_clique", detalhe);
    return { tag: em.tag, evento: em.evento, status: "sem_clique", detalhe };
  }
  if (!forcar && !cfg.testCode) {
    const variantes = [tel, variante9BR(tel)].filter(Boolean) as string[];
    const ja = await query<{ created_at: string }>(
      "SELECT created_at FROM capi_eventos WHERE workspace_id=$1 AND phone = ANY($2) AND evento=$3 AND status='ok' ORDER BY id DESC LIMIT 1",
      [ws, variantes, em.evento],
    ).catch(() => [] as Array<{ created_at: string }>);
    if (ja.length) {
      const quando = new Date(ja[0].created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      return { tag: em.tag, evento: em.evento, status: "duplicado", detalhe: `já enviado em ${quando} — a Meta contaria 2 conversões` };
    }
  }
  const r = await eventoWhatsAppMeta({
    datasetId: cfg.datasetId, token: cfg.token, evento: em.evento, ctwaClid: clid,
    wabaId: metaCreds()?.wabaId || undefined, valor: em.evento === "Purchase" ? valor : null,
    testCode: cfg.testCode || undefined,
  });
  // MODO TESTE (14/10/2026): com o código da aba "Testar eventos" preenchido, o evento só aparece lá
  // e não conta como conversão. Fica no livro-razão como "teste" — não trava o envio real depois.
  if (cfg.testCode) {
    const det = (r.ok ? "TESTE · " : "TESTE com erro · ") + r.detalhe;
    await grava(r.ok ? "teste" : "erro", det, clid, cfg.datasetId);
    console.log(`🔵 etiqueta da Meta "${em.tag}" → ${em.evento} (TESTE ${cfg.testCode}) · ${tel} · ${r.ok ? "OK" : "ERRO: " + r.detalhe}`);
    return { tag: em.tag, evento: em.evento, status: r.ok ? "teste" : "erro", detalhe: det };
  }
  // Clique salvo ANTES de 13/10 veio cortado em 80 chars (bug do slice): a Meta recusa esses — o
  // detalhe explica, em vez de parecer mistério. Lead novo vai com o clique inteiro.
  const detalhe = !r.ok && clid.length === 80
    ? r.detalhe + " · o clique deste contato foi salvo cortado por um bug corrigido em 13/10 — não tem conserto; leads novos vão inteiros"
    : r.detalhe;
  await grava(r.ok ? "ok" : "erro", detalhe, clid, cfg.datasetId);
  console.log(`🔵 etiqueta da Meta "${em.tag}" → ${em.evento} · ${tel} · ${r.ok ? "OK" : "ERRO: " + detalhe}`);
  return { tag: em.tag, evento: em.evento, status: r.ok ? "ok" : "erro", detalhe };
}

async function capiWhatsAppGet(reply: any) {
  const c = getCached<any>("capi-whatsapp") ?? {};
  const eventos = await query<any>(
    "SELECT phone, evento, valor, status, detalhe, created_at FROM capi_eventos WHERE workspace_id=$1 ORDER BY id DESC LIMIT 15",
    [getCurrentWorkspace()],
  ).catch(() => []);
  return reply.send({
    datasetId: String(c.datasetId ?? ""),
    temToken: !!c.tokenEnc,
    testCode: String(c.testCode ?? ""),
    conexaoOficial: !!metaCreds(),
    etiquetas: ETIQUETAS_META,
    eventos,
  });
}
async function capiWhatsAppPost(b: any, reply: any) {
  const atual = getCached<any>("capi-whatsapp") ?? {};
  const novo: any = { datasetId: String(b?.datasetId ?? "").trim().replace(/\D/g, "").slice(0, 30) };
  // Código de teste: undefined = mantém; "" = limpa (volta a mandar conversão de verdade).
  const tc = b?.testCode === undefined ? String(atual.testCode ?? "") : String(b.testCode ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (tc) novo.testCode = tc;
  const tok = b?.token === null ? null : String(b?.token ?? "").trim();
  if (tok) novo.tokenEnc = encryptSecret(tok);
  else if (tok !== null && atual.tokenEnc) novo.tokenEnc = atual.tokenEnc; // vazio = mantém o atual
  await saveConfigFor(getCurrentWorkspace(), "capi-whatsapp", novo);
  return capiWhatsAppGet(reply);
}
// Descobrir o dataset com 1 clique, pela conexão oficial: GET /{WABA}/dataset e, se não existir,
// POST cria (idempotente — provado ao vivo em 14/09; a doc dizia que o GET não existia, mas existe).
async function capiWhatsAppDescobrir(reply: any) {
  const creds = metaCreds();
  if (!creds?.wabaId) return reply.code(400).send({ error: "conecte a API Oficial primeiro — o conjunto de dados nasce da WABA" });
  try {
    const g = await fetch(`https://graph.facebook.com/v21.0/${creds.wabaId}/dataset?access_token=${encodeURIComponent(creds.accessToken)}`);
    let j: any = await g.json().catch(() => ({}));
    if (j?.error) throw new Error(j.error.error_user_msg ?? j.error.message);
    let id = j?.data?.[0]?.id;
    if (!id) {
      const pr = await fetch(`https://graph.facebook.com/v21.0/${creds.wabaId}/dataset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: creds.accessToken }),
      });
      j = await pr.json().catch(() => ({}));
      if (j?.error) throw new Error(j.error.error_user_msg ?? j.error.message);
      id = j?.id;
    }
    if (!id) throw new Error("a Meta não devolveu o conjunto de dados");
    const atual = getCached<any>("capi-whatsapp") ?? {};
    await saveConfigFor(getCurrentWorkspace(), "capi-whatsapp", { ...atual, datasetId: String(id) });
    return capiWhatsAppGet(reply);
  } catch (e: any) {
    return reply.code(502).send({ error: "não consegui descobrir o conjunto de dados: " + String(e?.message ?? e) });
  }
}
app.get("/admin/capi-whatsapp", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return capiWhatsAppGet(reply);
});
app.post("/admin/capi-whatsapp", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return capiWhatsAppPost(req.body, reply);
});
app.post("/admin/capi-whatsapp/descobrir", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return capiWhatsAppDescobrir(reply);
});
app.get("/app/capi-whatsapp", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => capiWhatsAppGet(reply));
});
app.post("/app/capi-whatsapp", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => capiWhatsAppPost(req.body, reply));
});
app.post("/app/capi-whatsapp/descobrir", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, () => capiWhatsAppDescobrir(reply));
});

// AUTHENTICATION fica de fora: templates de autenticação têm estrutura fixa (OTP + recomendação de
// segurança, sem corpo livre) que este construtor simples não monta — a Meta rejeitaria.
const TPL_CATEGORIES = ["MARKETING", "UTILITY"];

// Lista os templates de TODAS as WABAs conectadas, cada um marcado com a conta (wabaId/wabaRotulo)
// — é o que faz "aparecer de qual número API é o template" quando há mais de uma conta. `wabas`
// vai junto pra UI decidir se mostra a etiqueta (com 1 só, não polui).
// Prévia PRÓPRIA da mídia do cabeçalho, por template ("nome|idioma" → URL no nosso /media).
// Enquanto o template está EM ANÁLISE a Meta não devolve o arquivo na listagem, e o card ficava
// com um retângulo escrito "Vídeo no topo" (print do dono, 20/08). Guardamos no envio.
function guardaPreviaTpl(wsId: string, chave: string, url: string): void {
  if (!chave || !url) return;
  const atual = (getCachedFor<Record<string, string>>(wsId, "meta-tpl-previa") ?? {}) as Record<string, string>;
  // Teto de 300 pra config não crescer sem fim; entra o novo, sai o mais antigo.
  const chaves = Object.keys(atual);
  if (chaves.length > 300) delete atual[chaves[0]];
  void saveConfigFor(wsId, "meta-tpl-previa", { ...atual, [chave]: url });
}
async function listaTemplatesTodasWabas(wsId: string) {
  const wabas = listaWabas(wsId);
  const previas = (getCachedFor<Record<string, string>>(wsId, "meta-tpl-previa") ?? {}) as Record<string, string>;
  const todos: any[] = [];
  for (const w of wabas) {
    try {
      const ts = await metaListTemplates(w.wabaId, w.accessToken);
      for (const t of ts) {
        todos.push({
          ...t, wabaId: w.wabaId, wabaRotulo: w.rotulo,
          previaUrl: previas[`${t.name}|${t.language ?? ""}`] ?? previas[`${t.name}|`] ?? "",
        });
      }
    } catch { /* uma WABA falhar não derruba o resto */ }
  }
  return { templates: todos, wabas: wabas.map((w) => ({ wabaId: w.wabaId, rotulo: w.rotulo })) };
}
app.get("/admin/meta/templates", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const wabas = listaWabas(getPrimaryWorkspace());
  if (!wabas.length) return reply.code(400).send({ error: "conecte a conta oficial (WABA ID + token) primeiro" });
  try {
    return reply.send(await listaTemplatesTodasWabas(getPrimaryWorkspace()));
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Cria/submete um template. Body amigável: { name, category, language, headerText?, headerDataUri?,
// body, footerText?, examples?, botoes? }. Núcleo compartilhado admin+cliente.
// Cabeçalho de MÍDIA: a Meta NÃO aceita URL na criação — exige um "header handle" da Upload API
// (o arquivo de exemplo que o revisor vê). Botões: até 3 (site/ligação/resposta rápida).
// Todas as WABAs do workspace: a PRINCIPAL (config "meta-official") + extras ("meta-extras",
// lista {nome, wabaId, accessToken}) — é o que permite aprovar um template em VÁRIAS contas de
// uma vez (pedido do dono 16/08: "10 números = aprovar nas 10 WABAs"). Extras ainda não têm
// tela de cadastro (entra junto com a contingência multi-API); a arquitetura já nasce pronta.
function listaWabas(wsId: string): Array<{ rotulo: string; wabaId: string; accessToken: string; phoneNumberId?: string; numero?: string }> {
  return contasOficiais(wsId)
    .filter((c) => c.wabaId && c.accessToken)
    .map((c) => ({ rotulo: c.rotulo, wabaId: c.wabaId, accessToken: c.accessToken, phoneNumberId: c.phoneNumberId, numero: c.numero }));
}
// TODAS as contas oficiais de um workspace: a principal (config "meta-official") + as extras
// (config "meta-extras", uma por número adicional). Ponto único de verdade — o webhook, a lista de
// WABAs e o painel leem daqui, então um número extra não fica "meio conectado" (aparecendo pra
// enviar template mas invisível pro webhook, que era o risco de tratar extras só num canto).
interface ContaOficial {
  id: string;              // "principal" ou o id da extra
  rotulo: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;       // o da própria conta; sem isso, o da principal (mesmo app da BM)
  numero: string;
  principal: boolean;
}
function contasOficiais(wsId: string): ContaOficial[] {
  const out: ContaOficial[] = [];
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tokP = metaSegredo(cfg, "accessToken");
  const secP = segredoAssinatura(cfg);
  if (cfg?.phoneNumberId && tokP) {
    out.push({
      id: "principal", rotulo: cfg.verifiedName || cfg.displayNumber || "Principal",
      wabaId: String(cfg.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId), accessToken: tokP,
      appSecret: secP, numero: String(cfg.displayNumber ?? ""), principal: true,
    });
  }
  for (const e of getCachedFor<any[]>(wsId, "meta-extras") ?? []) {
    const tok = metaSegredo(e, "accessToken");
    if (!e?.phoneNumberId || !tok) continue;
    out.push({
      id: String(e.id ?? e.phoneNumberId), rotulo: String(e.nome || e.verifiedName || e.numero || e.phoneNumberId),
      wabaId: String(e.wabaId ?? ""), phoneNumberId: String(e.phoneNumberId), accessToken: tok,
      // Número extra da MESMA BM usa o mesmo app → mesmo App Secret. Só guarda um próprio quem
      // conectou por outro app; sem nenhum dos dois o webhook rejeita (fail-closed de sempre).
      appSecret: metaSegredo(e, "appSecret") || secP,
      numero: String(e.numero ?? ""), principal: false,
    });
  }
  return out;
}
// Mesma coisa pra TODOS os workspaces — é o que o webhook da Meta precisa pra achar o dono de um
// evento pelo phoneNumberId, inclusive quando o número é uma conta extra.
function todasContasOficiais(): Array<{ wsId: string; conta: ContaOficial }> {
  const out: Array<{ wsId: string; conta: ContaOficial }> = [];
  const wss = new Set<string>();
  for (const c of scanConfig<any>("meta-official")) wss.add(c.wsId);
  for (const c of scanConfig<any>("meta-extras")) wss.add(c.wsId);
  for (const wsId of wss) for (const conta of contasOficiais(wsId)) out.push({ wsId, conta });
  return out;
}
// Mesma lista, PRONTA pro painel: sem token e com a foto do perfil (a que o cliente vê no WhatsApp).
// É o que deixa o criador de template mostrar em QUAL conta o modelo está sendo criado — com 2+
// contas, criar no lugar errado é fácil demais. A foto reusa o cache de 10 min das bolinhas.
async function wabasPraPainel(wsId: string) {
  const lista = listaWabas(wsId);
  return Promise.all(lista.map(async (w) => ({
    wabaId: w.wabaId,
    rotulo: w.rotulo,
    numero: w.numero || undefined,
    foto: w.phoneNumberId
      ? await fotoPerfilApi({ phoneNumberId: w.phoneNumberId }, w.accessToken).catch(() => undefined)
      : undefined,
  })));
}

async function criaTemplateOficial(
  c: { wabaId: string; accessToken: string },
  b: any,
  reply: any,
  wsId: string,
) {
  const name = String(b.name ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60);
  const category = TPL_CATEGORIES.includes(String(b.category)) ? String(b.category) : "MARKETING";
  const language = String(b.language ?? "pt_BR").trim() || "pt_BR";
  const bodyText = String(b.body ?? "").trim();
  if (!name) return reply.code(400).send({ error: "informe um nome (só letras minúsculas, números e _)" });
  if (!bodyText) return reply.code(400).send({ error: "o corpo (body) do template é obrigatório" });
  // variáveis {{1}}, {{2}}… → devem ser SEQUENCIAIS a partir de 1 e ter um exemplo cada (a Meta exige).
  const varNums = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const maxVar = varNums.length ? Math.max(...varNums) : 0;
  const varSet = new Set(varNums);
  const sequential = maxVar === 0 || Array.from({ length: maxVar }, (_, i) => i + 1).every((n) => varSet.has(n));
  if (!sequential) return reply.code(400).send({ error: "as variáveis devem ser sequenciais: {{1}}, {{2}}… sem pular números" });
  const examples = Array.isArray(b.examples) ? b.examples.map((x: any) => String(x ?? "")) : [];
  if (maxVar > 0 && examples.slice(0, maxVar).some((x: string) => !x.trim()))
    return reply.code(400).send({ error: `preencha um exemplo para CADA variável ({{1}}..{{${maxVar}}})` });

  const components: any[] = [];
  // Caminho novo: o arquivo já subiu sozinho e só o `handle` viaja aqui (JSON pequeno).
  const headerHandle = String(b.headerHandle ?? "").trim();
  const headerFormato = String(b.headerFormato ?? "").toUpperCase();
  const headerDataUri = String(b.headerDataUri ?? "");
  if (headerHandle && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormato)) {
    components.push({ type: "HEADER", format: headerFormato, example: { header_handle: [headerHandle] } });
    // A prévia é NOSSA cópia (veio do /templates/header): deixa o card mostrar a mídia já na
    // análise, sem esperar a Meta aprovar pra devolver o arquivo.
    guardaPreviaTpl(wsId, `${name}|${language}`, String(b.previaUrl ?? ""));
  } else if (headerDataUri) {
    const m = headerDataUri.match(/^data:([^,]*?);base64,(.+)$/s);
    if (!m) return reply.code(400).send({ error: "arquivo do cabeçalho inválido" });
    const mime = m[1].split(";")[0] || "";
    const formato = mime.startsWith("image/") ? "IMAGE" : mime.startsWith("video/") ? "VIDEO" : "DOCUMENT";
    if (formato === "IMAGE" && !/jpeg|png/.test(mime)) return reply.code(400).send({ error: "cabeçalho de imagem: só JPG ou PNG" });
    if (formato === "VIDEO" && !/mp4/.test(mime)) return reply.code(400).send({ error: "cabeçalho de vídeo: só MP4" });
    const buf = Buffer.from(m[2], "base64");
    const maxMb = formato === "IMAGE" ? 5 : 16;
    if (!buf.length) return reply.code(400).send({ error: "arquivo do cabeçalho vazio" });
    if (buf.length > maxMb * 1024 * 1024) return reply.code(413).send({ error: `arquivo do cabeçalho acima de ${maxMb}MB` });
    try {
      const handle = await metaUploadHeaderHandle(c.accessToken, buf, mime);
      components.push({ type: "HEADER", format: formato, example: { header_handle: [handle] } });
    } catch (e: any) {
      return reply.code(502).send({ error: String(e?.message ?? e) });
    }
  } else if (String(b.headerText ?? "").trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: String(b.headerText).trim().slice(0, 60) });
  }

  const bodyComp: any = { type: "BODY", text: bodyText };
  if (maxVar > 0) bodyComp.example = { body_text: [examples.slice(0, maxVar)] };
  components.push(bodyComp);
  if (String(b.footerText ?? "").trim()) components.push({ type: "FOOTER", text: String(b.footerText).trim().slice(0, 60) });

  // Botões (até 3). A REGRA REAL da Meta (documentação de components, conferida 20/08) é só que
  // os dois grupos fiquem CONTÍGUOS — e ela lista "URL, Phone, Quick Reply, Quick Reply" como
  // válido. Ou seja: botão de site PODE vir primeiro. O que existia aqui forçava resposta rápida
  // na frente e embaralhava a ordem escolhida no editor (o dono montou "Quero meu ingresso,
  // Falar com Admin, Pausar" e chegou "Falar, Pausar, Quero meu ingresso" — 20/08).
  const brutos: any[] = Array.isArray(b.botoes) ? b.botoes.slice(0, 3) : [];
  if (brutos.length) {
    const botoes: any[] = [];
    for (const bt of brutos) {
      const texto = String(bt?.texto ?? "").trim().slice(0, 25);
      if (!texto) return reply.code(400).send({ error: "todo botão precisa de um texto (até 25 caracteres)" });
      const tipo = String(bt?.tipo ?? "");
      if (tipo === "url") {
        const url = String(bt?.url ?? "").trim();
        if (!/^https?:\/\/.+/i.test(url)) return reply.code(400).send({ error: `botão "${texto}": informe a URL completa (https://...)` });
        botoes.push({ type: "URL", text: texto, url });
      } else if (tipo === "telefone") {
        const tel = String(bt?.telefone ?? "").replace(/\D/g, "");
        if (tel.length < 10) return reply.code(400).send({ error: `botão "${texto}": telefone inválido (DDI+DDD+número)` });
        botoes.push({ type: "PHONE_NUMBER", text: texto, phone_number: "+" + tel });
      } else {
        botoes.push({ type: "QUICK_REPLY", text: texto });
      }
    }
    // Ordem do editor é RESPEITADA quando já está agrupada. Só reorganiza quando há intercalação
    // (ex.: resposta, site, resposta), que a Meta recusa — e aí preserva a ordem relativa dentro
    // de cada grupo e mantém na frente o grupo que aparecia primeiro. Mexer o mínimo.
    const ehQR = (x: any) => x.type === "QUICK_REPLY";
    const trocas = botoes.reduce((n, bt, i) => (i > 0 && ehQR(bt) !== ehQR(botoes[i - 1]) ? n + 1 : n), 0);
    const ordenados = trocas <= 1
      ? botoes
      : ehQR(botoes[0])
        ? [...botoes.filter(ehQR), ...botoes.filter((x) => !ehQR(x))]
        : [...botoes.filter((x) => !ehQR(x)), ...botoes.filter(ehQR)];
    components.push({ type: "BUTTONS", buttons: ordenados });
  }

  try {
    const r = await metaCreateTemplate(c.wabaId, c.accessToken, { name, language, category, components });
    return reply.send({ ok: true, id: r.id, status: r.status, category: r.category });
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
}
// Coletor: um "reply" de mentira que só guarda status+corpo — deixa reusar o handler de criação
// (com todas as validações) por WABA quando o pedido é "aprovar em TODAS".
function replyColetor() {
  const r: any = { statusCode: 200, corpo: null };
  r.code = (s: number) => { r.statusCode = s; return r; };
  r.send = (b: any) => { r.corpo = b; return r; };
  return r;
}
async function criaTemplateNasWabas(wsId: string, b: any, reply: any) {
  const todas = listaWabas(wsId);
  if (!todas.length) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  const sel = String(b?.waba ?? "");
  // sem waba = principal (comportamento antigo); "all" = todas; senão a WABA exata
  const alvos = sel === "all" ? todas : sel ? todas.filter((w) => w.wabaId === sel) : todas.slice(0, 1);
  if (!alvos.length) return reply.code(404).send({ error: "essa WABA não está conectada neste painel" });
  if (alvos.length === 1) return criaTemplateOficial(alvos[0], b, reply, wsId);
  const resultados = [];
  for (const w of alvos) {
    const col = replyColetor();
    await criaTemplateOficial(w, b, col, wsId);
    const erro = col.corpo?.error;
    resultados.push({ waba: w.wabaId, rotulo: w.rotulo, ok: !erro, ...(erro ? { error: String(erro) } : { status: col.corpo?.status }) });
  }
  return reply.send({ ok: resultados.every((r) => r.ok), resultados });
}
app.post("/admin/meta/templates", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return criaTemplateNasWabas(getPrimaryWorkspace(), (req.body as any) ?? {}, reply);
});
// Lista as WABAs conectadas (pro seletor "aprovar em qual conta" do criador de template).
// ── Números oficiais EXTRAS (2º, 3º… número na mesma conta) ──────────────────
// O painel nasceu com UM número oficial por workspace. Quem já tem um conectado e clica em
// "+ → API Oficial" caía na tela de "já conectado", onde o único botão é Reconfigurar — que
// SOBRESCREVERIA o número que está funcionando. Aqui os extras entram sem encostar no principal.
// Antes de salvar, testa as credenciais na Graph: melhor recusar na hora que "salvar" algo quebrado.
async function salvaExtra(wsId: string, b: any, reply: any) {
  const phoneNumberId = String(b?.phoneNumberId ?? "").trim();
  const wabaId = String(b?.wabaId ?? "").trim();
  const accessToken = String(b?.accessToken ?? "").trim();
  const appSecret = String(b?.appSecret ?? "").trim();
  if (!phoneNumberId || !accessToken) return reply.code(400).send({ error: "informe o Phone Number ID e o Access Token do número novo" });
  const jaTem = contasOficiais(wsId).some((c) => c.phoneNumberId === phoneNumberId);
  if (jaTem) return reply.code(400).send({ error: "esse número já está conectado nesta conta" });
  // Número que já é de OUTRO workspace não pode ser sequestrado (mesma trava do salvar principal).
  const deOutro = todasContasOficiais().find((c) => c.wsId !== wsId && c.conta.phoneNumberId === phoneNumberId);
  if (deOutro) return reply.code(409).send({ error: "esse número já está conectado em outra conta do sistema" });
  let info: any;
  try {
    info = await metaPhoneInfo(phoneNumberId, accessToken);
  } catch (e: any) {
    return reply.code(400).send({ error: "a Meta recusou essas credenciais: " + String(e?.message ?? e) });
  }
  const extras = [...(getCachedFor<any[]>(wsId, "meta-extras") ?? [])];
  extras.push({
    id: "extra-" + Date.now(),
    nome: String(b?.nome ?? "").trim() || info?.verified_name || info?.display_phone_number || phoneNumberId,
    wabaId, phoneNumberId,
    accessTokenEnc: encryptSecret(accessToken),
    ...(appSecret ? { appSecretEnc: encryptSecret(appSecret) } : {}),
    numero: String(info?.display_phone_number ?? ""),
    verifiedName: String(info?.verified_name ?? ""),
    criadoEm: new Date().toISOString(),
  });
  await saveConfigFor(wsId, "meta-extras", extras);
  return reply.send({ ok: true, numero: info?.display_phone_number ?? "", nome: info?.verified_name ?? "" });
}
async function removeExtra(wsId: string, id: string, reply: any) {
  const extras = (getCachedFor<any[]>(wsId, "meta-extras") ?? []).filter((e: any) => String(e?.id ?? e?.phoneNumberId) !== id);
  await saveConfigFor(wsId, "meta-extras", extras);
  return reply.send({ ok: true });
}
// Lista SEM segredo (o painel só precisa saber quais números existem).
const extrasPraPainel = (wsId: string) =>
  contasOficiais(wsId).filter((c) => !c.principal).map((c) => ({ id: c.id, nome: c.rotulo, numero: c.numero, phoneNumberId: c.phoneNumberId, wabaId: c.wabaId }));

app.get("/admin/meta/extras", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ extras: extrasPraPainel(getPrimaryWorkspace()) });
});
app.post("/admin/meta/extras", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return salvaExtra(getPrimaryWorkspace(), req.body, reply);
});
app.delete("/admin/meta/extras/:id", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return removeExtra(getPrimaryWorkspace(), String((req.params as any).id ?? ""), reply);
});
app.get("/app/meta/extras", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ extras: extrasPraPainel(ws) });
});
app.post("/app/meta/extras", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return salvaExtra(ws, req.body, reply);
});
app.delete("/app/meta/extras/:id", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return removeExtra(ws, String((req.params as any).id ?? ""), reply);
});

app.get("/admin/meta/wabas", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ wabas: await wabasPraPainel(getPrimaryWorkspace()) });
});
app.get("/app/meta/wabas", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send({ wabas: await wabasPraPainel(ws) });
});
// Espelhos DO CLIENTE (o proxy remapeia /admin → /app): criar e excluir template.
app.post("/app/meta/templates", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return criaTemplateNasWabas(ws, (req.body as any) ?? {}, reply);
});
app.delete("/app/meta/templates", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const q = req.query as any;
    return excluiTemplate(ws, String(q?.name ?? "").trim(), q?.waba ? String(q.waba) : undefined, reply);
  });
});

// INSIGHTS de UM template (funil enviadas→entregues→lidas→cliques + série diária) — o "Insights
// sobre o modelo" do Gerenciador dentro do painel. ?id=<template_id>&waba=<wabaId>&dias=7|30|90.
async function insightsDoTemplate(wsId: string, q: any, reply: any) {
  const templateId = String(q?.id ?? "").trim();
  if (!templateId) return reply.code(400).send({ error: "informe o id do template" });
  const wabas = listaWabas(wsId);
  const alvo = (q?.waba && wabas.find((w) => w.wabaId === String(q.waba))) || wabas[0];
  if (!alvo) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  const per = periodoMetricas(q);
  const dias = per.dias;
  // Zero pode ser "não enviou nada" OU "a captura nunca foi ligada" — são coisas MUITO diferentes,
  // e a tela precisa saber qual é pra não deixar o dono achando que o template não performa.
  const capturaLigada = await metaInsightsAtivo(alvo.wabaId, alvo.accessToken).catch(() => null);
  try {
    const pontos = await metaTemplateAnalytics(alvo.wabaId, alvo.accessToken, templateId, per.inicio, per.fim);
    const soma = (k: "sent" | "delivered" | "read" | "clicked") => pontos.reduce((s, p) => s + p[k], 0);
    // cliques por botão agregados no período
    const porBotao = new Map<string, number>();
    for (const p of pontos) for (const b of p.botoes ?? []) porBotao.set(b.texto, (porBotao.get(b.texto) ?? 0) + b.cliques);
    return reply.send({
      dias, de: per.de, ate: per.ate, personalizado: per.personalizado, cortado: per.cortado, pontos, capturaLigada,
      totais: { enviadas: soma("sent"), entregues: soma("delivered"), lidas: soma("read"), cliques: soma("clicked") },
      botoes: [...porBotao.entries()].map(([texto, cliques]) => ({ texto, cliques })).sort((a, b) => b.cliques - a.cliques),
    });
  } catch (e: any) {
    // devolve o erro CRU da Graph (ex.: analytics não habilitado na WABA) — diagnóstico na tela
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}
// ── MÉTRICAS DE TODOS OS TEMPLATES (a faixinha embaixo de cada card) ────────────────────────
// Uma resposta só pra tela inteira: envios/lidas/cliques por template (Graph em lotes de 10) e
// CUSTO ESTIMADO — a Meta não fatura por template, então o cálculo usa o preço médio POR MENSAGEM
// PAGA da PRÓPRIA conta no período (custo da categoria ÷ mensagens da categoria) × envios do
// template. É estimativa honesta com dado real da conta, não tabela inventada — e vai marcada
// como "aprox" no payload pra tela mostrar o "~".
const tplMetricasCache = new Map<string, { at: number; body: any }>();
async function metricasDosTemplates(wsId: string, q: any, reply: any) {
  const per = periodoMetricas(q);
  const dias = per.dias;
  const chave = wsId + ":" + per.de + ":" + per.ate;
  const hit = tplMetricasCache.get(chave);
  if (hit && Date.now() - hit.at < 10 * 60_000) return reply.send(hit.body);
  const wabas = listaWabas(wsId);
  if (!wabas.length) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  // A PEGADINHA do "—" (caso Admin, 23/08): a Graph só devolve template_analytics DEPOIS do
  // is_enabled_for_insights=true — sem ele responde 200 com data_points VAZIO, enquanto o
  // Gerenciador da Meta mostra números (dados internos deles). Conta conectada ANTES do wizard
  // passar a ligar isso fica pra sempre com os cards em "—". AUTO-CONSERTO: se está desligada,
  // liga AQUI (idempotente, vale pra todo workspace que abrir a tela). Não é retroativo: os
  // números começam a contar dos próximos envios — o aviso na tela explica isso.
  let capturaLigada: boolean | null = null;
  let capturaAtivadaAgora = false;
  for (const w of wabas) {
    const on = await metaInsightsAtivo(w.wabaId, w.accessToken).catch(() => null);
    if (on === false) {
      try {
        await metaAtivaInsights(w.wabaId, w.accessToken);
        capturaAtivadaAgora = true;
        if (capturaLigada !== false) capturaLigada = true;
        console.log(`📊 captura de métricas estava DESLIGADA na waba ${w.wabaId} — liguei agora (ws ${wsId.slice(0, 8)})`);
      } catch (e: any) {
        capturaLigada = false;
        console.log(`📊 não consegui ligar a captura de métricas (waba ${w.wabaId}):`, e?.message ?? e);
      }
    } else if (capturaLigada !== false && on !== null) capturaLigada = on;
  }
  const { inicio, fim } = per;
  // Por template: o funil, o custo estimado e — o que o dono pediu — os cliques ABERTOS POR
  // BOTÃO ("quantos clicaram em Entrar no Grupo × quantos em Parar"). Antes o lote somava tudo.
  const porTemplate: Record<string, {
    id: string; waba: string; categoria: string;
    enviadas: number; entregues: number; lidas: number; cliques: number;
    botoes: Array<{ texto: string; cliques: number }>;
    custoAprox: number | null;
  }> = {};
  for (const w of wabas) {
    try {
      const tpls = await metaListTemplates(w.wabaId, w.accessToken);
      const ids = tpls.filter((t) => (t.status || "").toUpperCase() === "APPROVED" && (t as any).id).map((t) => String((t as any).id));
      if (!ids.length) continue;
      const uso = await metaTemplateAnalyticsLote(w.wabaId, w.accessToken, ids, inicio, fim);
      // preço médio por mensagem PAGA, por categoria, DESTA conta neste período
      const precoPorCat = new Map<string, number>();
      try {
        const custos = await metaCustoDiario(w.wabaId, w.accessToken, inicio, fim);
        const porCat = new Map<string, { qtd: number; custo: number }>();
        for (const c of custos) {
          const acc = porCat.get(c.categoria) ?? { qtd: 0, custo: 0 };
          acc.qtd += c.qtd; acc.custo += c.custo;
          porCat.set(c.categoria, acc);
        }
        for (const [cat, v] of porCat) if (v.qtd > 0 && v.custo > 0) precoPorCat.set(cat, v.custo / v.qtd);
      } catch { /* sem pricing analytics → custo fica null, o resto vale */ }
      for (const t of tpls) {
        const id = String((t as any).id ?? "");
        const u = id ? uso.get(id) : undefined;
        if (!u) continue;
        const preco = precoPorCat.get(String(t.category ?? "").toUpperCase()) ?? null;
        porTemplate[t.name + "|" + (t.language ?? "")] = {
          id, waba: w.wabaId, categoria: String(t.category ?? "").toUpperCase(),
          enviadas: u.sent, entregues: u.delivered, lidas: u.read, cliques: u.clicked,
          botoes: u.botoes,
          custoAprox: preco != null ? Math.round(u.sent * preco * 100) / 100 : null,
        };
      }
    } catch (e: any) {
      console.log("métricas de templates (waba " + w.wabaId + "):", e?.message ?? e);
    }
  }
  const body = { dias, de: per.de, ate: per.ate, personalizado: per.personalizado, cortado: per.cortado, porTemplate, capturaLigada, capturaAtivadaAgora };
  tplMetricasCache.set(chave, { at: Date.now(), body });
  return reply.send(body);
}
app.get("/admin/meta/templates/metricas", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return metricasDosTemplates(getPrimaryWorkspace(), req.query, reply);
});
// 🔬 DIAGNÓSTICO das métricas de template (só admin, sem cache): mostra o que a GRAPH responde de
// verdade — estado da captura, ids consultados, a URL chamada (sem token) e a resposta CRUA.
// Criado 23/08 pra fechar com EVIDÊNCIA o caso "cards em — com o Gerenciador cheio": abre no
// navegador logado em /api/meta/templates/metricas-debug e a resposta diz quem é o culpado.
app.get("/admin/meta/templates/metricas-debug", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const wsId = getPrimaryWorkspace();
  const dias = [7, 30, 90].includes(Number((req.query as any)?.dias)) ? Number((req.query as any).dias) : 30;
  const fim = Math.floor(Date.now() / 1000);
  const inicio = fim - dias * 86400;
  const saida: any[] = [];
  for (const w of listaWabas(wsId)) {
    const item: any = { wabaId: w.wabaId, rotulo: (w as any).rotulo ?? null };
    try {
      item.capturaLigada = await metaInsightsAtivo(w.wabaId, w.accessToken);
      const tpls = await metaListTemplates(w.wabaId, w.accessToken);
      const aprovados = tpls.filter((t) => (t.status || "").toUpperCase() === "APPROVED" && (t as any).id);
      item.templatesAprovados = aprovados.length;
      const ids = aprovados.slice(0, 10).map((t) => String((t as any).id));
      item.idsConsultados = aprovados.slice(0, 10).map((t) => ({ id: String((t as any).id), nome: t.name }));
      const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(w.wabaId)}/template_analytics` +
        `?start=${inicio}&end=${fim}&granularity=DAILY` +
        `&metric_types=${encodeURIComponent('["SENT","DELIVERED","READ","CLICKED"]')}` +
        `&template_ids=${encodeURIComponent("[" + ids.join(",") + "]")}`;
      item.urlChamada = url;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${w.accessToken}` } });
      const bruto = await res.text();
      item.graphStatus = res.status;
      item.respostaCrua = bruto.slice(0, 4000);
    } catch (e: any) {
      item.erro = String(e?.message ?? e);
    }
    saida.push(item);
  }
  return reply.send({ dias, janela: { inicio: new Date(inicio * 1000).toISOString(), fim: new Date(fim * 1000).toISOString() }, wabas: saida });
});
app.get("/app/meta/templates/metricas", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return metricasDosTemplates(ws, req.query, reply);
});

// ── ARQUIVO DO CABEÇALHO → HANDLE DA META (upload separado) ──────────────────────────────────
// Antes o arquivo ia junto do template, em base64, dentro do JSON: um MP4 de 16MB virava ~21MB de
// texto numa requisição só. Qualquer corte no caminho quebrava o JSON e o painel dizia só "corpo
// inválido" — sem dizer que o problema era o arquivo (foi o que o dono viu em 20/08).
// Agora o arquivo sobe SOZINHO, em binário, e o que volta é o `handle` que a Meta devolve. O
// template em si vira um JSON pequeno de texto.
// Percorre as caixas de nível 1 do MP4. Devolve a explicação do problema, ou null se está inteiro.
// Não decodifica vídeo (isso exigiria ffmpeg): só confere se o arquivo tem o tamanho que ele mesmo
// diz ter. É barato e pega exatamente a falha real — upload interrompido.
function mp4Truncado(buf: Buffer): string | null {
  let off = 0;
  while (off + 8 <= buf.length) {
    let len = buf.readUInt32BE(off);
    const tipo = buf.toString("latin1", off + 4, off + 8);
    let cabeca = 8;
    if (len === 1) {
      if (off + 16 > buf.length) return "o vídeo chegou incompleto — envie de novo.";
      len = Number(buf.readBigUInt64BE(off + 8));
      cabeca = 16;
    }
    if (len === 0) break; // "vai até o fim do arquivo" — válido
    if (len < cabeca) return "este MP4 está corrompido — exporte o vídeo de novo.";
    if (off + len > buf.length) {
      const bytesFaltando = off + len - buf.length;
      // "faltam 0.0MB" não diz nada a quem lê; abaixo de 100KB a conta só faz sentido em KB.
      const faltam = bytesFaltando >= 102400 ? `${(bytesFaltando / 1048576).toFixed(1)}MB` : `${Math.ceil(bytesFaltando / 1024)}KB`;
      return `o vídeo está cortado: faltam ${faltam} do pedaço "${tipo}". O envio foi interrompido no meio — mande de novo, de preferência com um arquivo mais leve.`;
    }
    off += len;
  }
  return null;
}

async function subeHeaderTemplate(wsId: string, req: any, reply: any) {
  const contas = contasOficiais(wsId);
  if (!contas.length) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  const waba = String((req.query as any)?.waba ?? "");
  const c = (waba && contas.find((x) => x.wabaId === waba)) || contas[0];
  const mime = String((req.query as any)?.mime ?? "").split(";")[0].trim();
  const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  // Arquivo cortado no caminho é a falha que a gente perseguiu em 20/08 sem conseguir reproduzir.
  // Aqui dá pra PROVAR: compara o que o navegador anunciou com o que realmente chegou.
  const anunciado = Number(req.headers?.["content-length"] ?? 0);
  if (anunciado && buf.length < anunciado) {
    console.log(`📎 cabeçalho CORTADO no caminho: anunciado ${anunciado}B, chegaram ${buf.length}B`);
    return reply.code(400).send({ error: `o arquivo chegou incompleto (${(buf.length / 1048576).toFixed(1)}MB de ${(anunciado / 1048576).toFixed(1)}MB) — tente enviar de novo` });
  }
  // O content-length acima NÃO basta: quando o upload do navegador cai no meio, o painel reenvia o
  // pedaço com um content-length coerente e a comparação passa. `bytes` é o tamanho REAL do arquivo
  // no disco do dono, carimbado lá na origem — é o que fecha a conta de ponta a ponta.
  const tamanhoReal = Number((req.query as any)?.bytes ?? 0);
  if (tamanhoReal > 0 && buf.length < tamanhoReal) {
    console.log(`📎 cabeçalho CORTADO na origem: arquivo tem ${tamanhoReal}B, chegaram ${buf.length}B`);
    return reply.code(400).send({ error: `o arquivo chegou incompleto (${(buf.length / 1048576).toFixed(1)}MB de ${(tamanhoReal / 1048576).toFixed(1)}MB) — a conexão caiu no meio do envio. Tente de novo, de preferência com um vídeo mais leve.` });
  }
  if (!buf.length) return reply.code(400).send({ error: "o arquivo chegou vazio — tente enviar de novo" });
  const formato = mime.startsWith("image/") ? "IMAGE" : mime.startsWith("video/") ? "VIDEO" : "DOCUMENT";
  if (formato === "IMAGE" && !/jpeg|png/.test(mime)) return reply.code(400).send({ error: "cabeçalho de imagem: só JPG ou PNG" });
  if (formato === "VIDEO" && !/mp4/.test(mime)) return reply.code(400).send({ error: "cabeçalho de vídeo: só MP4" });
  const maxMb = formato === "IMAGE" ? 5 : 16;
  if (buf.length > maxMb * 1024 * 1024) {
    return reply.code(413).send({ error: `o arquivo tem ${(buf.length / 1024 / 1024).toFixed(1)}MB e o limite da Meta é ${maxMb}MB` });
  }
  // ÚLTIMA barreira, e a que pega o caso que nenhuma contagem pega: um MP4 pode chegar inteiro em
  // bytes e ainda assim estar quebrado. O container declara o tamanho de cada caixa; se a `mdat`
  // (onde mora o vídeo de verdade) diz que vai além do fim do arquivo, ele está cortado. Era o
  // sintoma que a Meta devolvia como "No video stream found in given video file" — depois do
  // template criado, na hora do disparo, quando já não dá pra consertar sem refazer tudo.
  if (formato === "VIDEO") {
    const corte = mp4Truncado(buf);
    if (corte) return reply.code(400).send({ error: corte });
  }
  try {
    const handle = await metaUploadHeaderHandle(c.accessToken, buf, mime);
    // CÓPIA NOSSA da mídia. Enquanto o template está "em análise", a Meta NÃO devolve o arquivo
    // na listagem (o example.header_handle vem sem URL utilizável) — e o card mostrava um
    // retângulo escrito "Vídeo no topo" (print do dono, 20/08). Com a cópia, a prévia aparece
    // desde o minuto do envio, sem esperar aprovação.
    let previa = "";
    try {
      const idm = mediaIdFor(buf, mime);
      await saveMedia(idm, mime, buf, wsId);
      previa = `${MEDIA_PUBLIC_BASE}/media/${idm}`;
    } catch { /* sem a cópia o template continua indo; só a prévia fica pro depois da aprovação */ }
    console.log(`📎 cabeçalho de template enviado à Meta (${formato}, ${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    return reply.send({ handle, formato, previa });
  } catch (e: any) {
    return reply.code(502).send({ error: "a Meta recusou o arquivo: " + String(e?.message ?? e) });
  }
}
app.post("/admin/meta/templates/header", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return subeHeaderTemplate(getPrimaryWorkspace(), req, reply);
});
app.post("/app/meta/templates/header", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return subeHeaderTemplate(ws, req, reply);
});

// Liga a captura de métricas de template na WABA. Uma vez só por conta; a Meta passa a contar
// A PARTIR DAQUI (o histórico anterior não existe e não tem como recuperar).
async function ativaInsightsHandler(wsId: string, reply: any) {
  const wabas = listaWabas(wsId);
  if (!wabas.length) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  const feitas: string[] = [];
  for (const w of wabas) {
    try {
      await metaAtivaInsights(w.wabaId, w.accessToken);
      feitas.push(w.rotulo);
      console.log(`📊 métricas de template LIGADAS na WABA ${w.wabaId} (${w.rotulo})`);
    } catch (e: any) {
      return reply.code(502).send({ error: `a Meta recusou em "${w.rotulo}": ${String(e?.message ?? e)}` });
    }
  }
  return reply.send({ ok: true, contas: feitas });
}
app.post("/admin/meta/templates/insights/ativar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return ativaInsightsHandler(getPrimaryWorkspace(), reply);
});
app.post("/app/meta/templates/insights/ativar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return ativaInsightsHandler(ws, reply);
});

app.get("/admin/meta/templates/insights", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return insightsDoTemplate(getPrimaryWorkspace(), req.query, reply);
});
app.get("/app/meta/templates/insights", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return insightsDoTemplate(ws, req.query, reply);
});

// IA sugere o template a partir de texto livre — tenta o encaixe UTILITY (mais barato); quando não
// dá, explica por quê e entrega como MARKETING. Só transforma texto (não toca dados do ws), então
// admin e cliente usam o mesmo handler.
async function sugereTemplateHandler(req: any, reply: any) {
  const pedido = String((req.body as any)?.texto ?? "").trim();
  if (pedido.length < 10) return reply.code(400).send({ error: "descreva a mensagem que você quer mandar (pelo menos uma frase)" });
  try {
    return reply.send({ sugestao: await sugereTemplateMeta(pedido) });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}
app.post("/admin/meta/templates/sugerir", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return sugereTemplateHandler(req, reply);
});
app.post("/app/meta/templates/sugerir", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  if (rateLimited("ia-tpl:" + ws, 30, 3_600_000)) return reply.code(429).send({ error: "muitas sugestões seguidas — tente de novo daqui a pouco." });
  if (rateLimited("ia-dia:" + ws, 100, 24 * 3_600_000)) return reply.code(429).send({ error: "limite diário de IA atingido — volta amanhã ou fala com a gente." });
  return sugereTemplateHandler(req, reply);
});

// ── Fluxo completo por IA ────────────────────────────────────────────────────
// Texto livre → automação PRONTA (nós + conexões + posições no canvas). NÃO salva: devolve a
// automação pro painel, que grava pelo caminho normal (PUT /automations) — um só caminho de
// escrita, e a validação do motor continua sendo a última palavra. Nasce como RASCUNHO.
async function geraFluxoHandler(req: any, reply: any) {
  const pedido = String((req.body as any)?.texto ?? "").trim();
  if (pedido.length < 15) return reply.code(400).send({ error: "descreva a automação que você quer (o que dispara, o que o robô manda, o que fazer se a pessoa sumir)" });
  try {
    const f = await geraFluxoIA(pedido);
    // Grafo: linha reta + os ramos que a IA não sabe desenhar (ex.: aviso no caminho "falar com humano").
    const { edges, layout } = montaGrafo(f.passos, f.avisos);
    const automacao: any = {
      id: "fluxo-ia-" + Date.now(),
      name: f.nome,
      trigger: f.trigger,
      ...(f.keyword ? { keyword: f.keyword, keywordMatch: f.keywordMatch } : {}),
      ...(f.eventos?.length ? { eventos: f.eventos } : {}),
      platforms: ["*"],
      enabled: false, // rascunho: ninguém dispara sem o dono revisar
      steps: f.passos,
      edges,
      layout,
    };
    // Passa pela MESMA validação do save — se a IA escapou de algo, o erro aparece aqui e não
    // depois, na hora de salvar (e o painel mostra o motivo real).
    const err = validateAutomations([automacao]);
    if (err) return reply.code(502).send({ error: "a IA montou um fluxo inválido (" + err + ") — tente descrever de novo" });
    return reply.send({ automacao, resumo: f.resumo, avisos: f.avisos });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
}
app.post("/admin/automations/gerar-ia", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return geraFluxoHandler(req, reply);
});
app.post("/app/automations/gerar-ia", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  // 💸 Esta rota gasta a chave ANTHROPIC **da plataforma**, não do cliente — e cadastro é
  // self-service com trial. Sem teto, uma conta nova em laço vira fatura (auditoria 07/09).
  // Limite por WORKSPACE (a sessão já identifica o tenant), com teto de hora e de dia.
  if (rateLimited("ia-fluxo:" + ws, 20, 3_600_000)) return reply.code(429).send({ error: "muitas gerações por IA seguidas — tente de novo daqui a pouco." });
  if (rateLimited("ia-dia:" + ws, 100, 24 * 3_600_000)) return reply.code(429).send({ error: "limite diário de geração por IA atingido — volta amanhã ou fala com a gente." });
  return geraFluxoHandler(req, reply);
});

// Exclui um template. Com várias WABAs, `?waba=` diz de QUAL conta apagar (o card manda a dele);
// sem isso, cai na principal (comportamento antigo, 1 conta).
async function excluiTemplate(wsId: string, name: string, wabaId: string | undefined, reply: any) {
  if (!name) return reply.code(400).send({ error: "nome do template obrigatório" });
  const wabas = listaWabas(wsId);
  const alvo = (wabaId && wabas.find((w) => w.wabaId === wabaId)) || wabas[0];
  if (!alvo) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  try {
    await metaDeleteTemplate(alvo.wabaId, alvo.accessToken, name);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
}
app.delete("/admin/meta/templates", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  return excluiTemplate(getPrimaryWorkspace(), String(q?.name ?? "").trim(), q?.waba ? String(q.waba) : undefined, reply);
});

// Envia um template aprovado (funciona fora da janela de 24h). Body: { to, name, language, params?, headerUrl? }
// Núcleo compartilhado entre admin e cliente: resolve o CABEÇALHO DE MÍDIA (obrigatório re-anexar
// no envio — ver comentário em metaSendTemplate) e ARQUIVA a mensagem na conversa do WPP Api,
// senão o template enviado não aparecia no chat (a Meta não devolve histórico).
// Resolve o que o envio de um template precisa ALÉM do nome: o cabeçalho de mídia (se houver) e o
// texto do corpo (pro arquivo da conversa). Consulta a Meta UMA vez — o disparador em massa chama
// isto uma única vez e reusa pra cada número.
type HeaderTpl = { format: "image" | "video" | "document"; url: string } | null;
// Cache (memória + /media) da mídia de exemplo dos templates, re-hospedada no nosso domínio.
const headerHospedado = new Map<string, string>();
async function headerExemploHospedado(nome: string, lingua: string, exemplo: string): Promise<string> {
  const chave = nome + ":" + lingua;
  const ja = headerHospedado.get(chave); if (ja) return ja;
  if (!/^https:\/\//.test(exemplo)) return exemplo;
  const base = "tplhdr-" + createHash("sha256").update(chave).digest("hex").slice(0, 24);
  for (const ext of [".png", ".jpg", ".mp4", ".pdf", ".webp", ""]) {
    if (await getMedia(base + ext).catch(() => null)) { const u = `${MEDIA_PUBLIC_BASE}/media/${base}${ext}`; headerHospedado.set(chave, u); return u; }
  }
  try {
    const r = await fetch(exemplo);
    if (!r.ok) return exemplo;
    const mime = (r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return exemplo;
    const id = base + (MEDIA_EXT[mime] ?? "");
    await saveMedia(id, mime, buf, getPrimaryWorkspace());
    const u = `${MEDIA_PUBLIC_BASE}/media/${id}`;
    headerHospedado.set(chave, u);
    console.log(`🖼️ mídia de exemplo do template "${nome}" hospedada em ${u}`);
    return u;
  } catch { return exemplo; }
}
async function resolveTemplateEnvio(
  c: { wabaId: string; phoneNumberId: string; accessToken: string },
  name: string,
  language: string,
  headerUrl?: string,
): Promise<{ header: HeaderTpl; corpo: string; botoes: Array<{ texto: string; tipo: string }>; rodape: string } | { erro: string; status: number }> {
  let header: HeaderTpl = null;
  let corpo = "";
  // Botões e rodapé do modelo: vão pro ARQUIVO da mensagem (extra.tpl) — é o que deixa o inbox
  // mostrar o template como o cliente recebeu, com os botões desenhados, em vez de só o texto.
  let botoes: Array<{ texto: string; tipo: string }> = [];
  let rodape = "";
  try {
    const tpls = c.wabaId ? await metaListTemplates(c.wabaId, c.accessToken) : [];
    const t = tpls.find((x) => x.name === name && x.language === language) ?? tpls.find((x) => x.name === name);
    const comps: any[] = Array.isArray(t?.components) ? t!.components! : [];
    corpo = String(comps.find((x) => String(x?.type).toUpperCase() === "BODY")?.text ?? "");
    rodape = String(comps.find((x) => String(x?.type).toUpperCase() === "FOOTER")?.text ?? "");
    botoes = (comps.find((x) => String(x?.type).toUpperCase() === "BUTTONS")?.buttons ?? [])
      .map((b: any) => ({ texto: String(b?.text ?? ""), tipo: String(b?.type ?? "").toLowerCase() }))
      .filter((b: any) => b.texto);
    const h = comps.find((x) => String(x?.type).toUpperCase() === "HEADER");
    const fmt = String(h?.format ?? "").toLowerCase();
    if (fmt === "image" || fmt === "video" || fmt === "document") {
      // usa a URL que o chamador mandou; senão, o arquivo de EXEMPLO da criação (funciona, mas expira —
      // pra disparo de verdade o ideal é subir a mídia própria e mandar headerUrl).
      let url = String(headerUrl ?? "").trim();
      // Sem arquivo próprio: usa o EXEMPLO da aprovação — mas HOSPEDADO aqui. O link scontent.whatsapp.net
      // do exemplo a própria Meta não consegue baixar no envio ("Media upload error", visto 13/10 no
      // teste do ws_convite_ex_alunos) e ainda expira. Baixa uma vez, guarda em /media, reusa sempre.
      if (!url) url = await headerExemploHospedado(name, language, String(h?.example?.header_handle?.[0] ?? ""));
      if (!url) return { erro: `este template tem ${fmt.toUpperCase()} no cabeçalho — informe a URL do arquivo (headerUrl)`, status: 400 };
      header = { format: fmt, url };
    }
  } catch {
    // não conseguiu consultar o template (rede/permissão): segue com o que o chamador mandou
    const url = String(headerUrl ?? "").trim();
    if (url) header = { format: "image", url };
  }
  return { header, corpo, botoes, rodape };
}

async function enviaTemplateOficial(
  c: { wabaId: string; phoneNumberId: string; accessToken: string },
  b: any,
  wsId: string,
): Promise<{ ok: true; id?: string } | { erro: string; status: number }> {
  const to = String(b?.to ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const name = String(b?.name ?? "").trim();
  const language = String(b?.language ?? "pt_BR").trim() || "pt_BR";
  const params = Array.isArray(b?.params) ? b.params.map((x: any) => String(x ?? "")) : [];
  if (to.length < 12) return { erro: "número inválido — use DDI+DDD+número (ex.: 5511989...)", status: 400 };
  if (!name) return { erro: "escolha um template", status: 400 };
  if (await isOptedOut(to, wsId).catch(() => false)) return { erro: "esse número está na lista de bloqueio (pediu pra não receber mensagens)", status: 400 };
  const res = await resolveTemplateEnvio(c, name, language, b?.headerUrl);
  if ("erro" in res) return res;
  try {
    const r = await metaSendTemplate(c.phoneNumberId, c.accessToken, to, name, language, params, res.header);
    // A conversa (e as marcas do gatilho de resposta) usam o wa_id que a Meta devolveu — ela mexe
    // no 9º dígito BR, e arquivar pelo número digitado criava um SEGUNDO chat da mesma pessoa,
    // com a resposta do cliente caindo no chat "irmão" (caso Matheus, 27/08).
    const chatDestino = r.waId || to;
    const rendered = res.corpo
      ? res.corpo.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? `{{${i}}}`)
      : `[template ${name} enviado]`;
    // Template com MÍDIA no topo: arquiva na convenção do inbox ("URL\ntexto" + msg_type do
    // formato) — senão a conversa mostrava só o texto e a imagem "sumia" (print do dono 16/08).
    const comMidia = !!res.header?.url;
    void arquivarMensagens(
      chatDestino,
      [{ msg_id: String(r.id ?? "tpl-" + Date.now()), from_me: true,
         body: comMidia ? res.header!.url + "\n" + rendered : rendered,
         msg_type: comMidia ? res.header!.format : "template", ts: Math.floor(Date.now() / 1000),
         // O RETRATO do template: o inbox desenha os botões e o rodapé como o cliente recebeu.
         extra: { tpl: { nome: name, idioma: language, botoes: res.botoes, rodape: res.rodape } } }],
      "meta-" + c.phoneNumberId,
      wsId,
    ).catch(() => {});
    // 🎯 ARMA O GATILHO "resposta de template". Sem isto, o teste enviado daqui era um beco sem
    // saída: a pessoa clicava no botão e NENHUM fluxo disparava, porque só o Disparador gravava
    // esta marca. Agora um "Enviar teste" é um teste de ponta a ponta de verdade — manda, clica,
    // o fluxo roda. (O motor consome a marca no primeiro uso e ela vale 7 dias.)
    void runWithWorkspace(wsId, async () => {
      await setContactField(chatDestino, "ultimo_template", name).catch(() => {});
      await setContactField(chatDestino, "ultimo_template_em", String(Math.floor(Date.now() / 1000))).catch(() => {});
    }).catch(() => {});
    return { ok: true, id: r.id };
  } catch (e: any) {
    return { erro: String(e?.message ?? e), status: 502 };
  }
}

// ── ENVIAR UM FLUXO pra UMA conversa (a partir do inbox oficial) ─────────────────────────────
// "Reabrir a janela" mandando só um template é meio caminho: a resposta da pessoa não aciona nada.
// Aqui o inbox roda o FLUXO inteiro pra este contato — o template está dentro dele e o clique nos
// botões cai nos ramos desenhados no canvas. Mesmo mecanismo do Disparador em modo fluxo, para 1.
async function enviaFluxoPraConversa(wsId: string, b: any, reply: any) {
  const numero = String(b?.chatId ?? "").replace(/\D/g, "");
  const fluxoId = String(b?.fluxoId ?? "").trim();
  if (numero.length < 12) return reply.code(400).send({ error: "conversa inválida" });
  if (!fluxoId) return reply.code(400).send({ error: "escolha um fluxo" });
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  const fluxo = runWithWorkspace(wsId, () => loadAutomations()).find((x) => x.id === fluxoId) ?? null;
  if (!fluxo) return reply.code(404).send({ error: "fluxo não encontrado" });
  if (fluxo.enabled === false) return reply.code(400).send({ error: `o fluxo "${fluxo.name ?? fluxoId}" está como RASCUNHO — publique antes de enviar` });
  // Sem template o fluxo não atravessa a janela fechada — a Meta simplesmente não entrega.
  if (!(fluxo.steps ?? []).some((x: any) => x.type === "template")) {
    return reply.code(400).send({ error: "esse fluxo não tem passo de TEMPLATE — sem template a Meta não entrega pra quem está fora da janela de 24h" });
  }
  const g = toGraph(fluxo);
  const primeiro = nextNodeId(g, "trigger", null);
  if (!primeiro) return reply.code(400).send({ error: "esse fluxo não tem nenhum passo ligado ao gatilho" });
  const creds = { wabaId: String(cfg?.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId), accessToken: tok };
  await upsertContact(numero, undefined, "inbox", wsId).catch(() => {});
  // MESMA fila por telefone de todo o resto — a conversa não pode rodar concorrente com webhook.
  await serializeByPhone(wsId + ":" + numero, () =>
    runWithWorkspace(wsId, () => resumeScheduledFlow(numero, fluxo.id, primeiro, withEchoGuard(new MetaGateway({ ...creds, wsId })), [fluxo])),
  );
  console.log(`🚀 fluxo "${fluxo.name ?? fluxo.id}" enviado pela conversa → ${numero}`);
  return reply.send({ ok: true });
}
app.post("/admin/oficial/inbox-fluxo", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return enviaFluxoPraConversa(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/oficial/inbox-fluxo", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return enviaFluxoPraConversa(ws, req.body, reply);
});

app.post("/admin/meta/templates/send", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const c = metaCreds();
  if (!c?.phoneNumberId || !c.accessToken) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
  const r = await enviaTemplateOficial(c, req.body, getCurrentWorkspace());
  if ("erro" in r) return reply.code(r.status).send({ error: r.erro });
  return reply.send({ ok: true, id: r.id });
});

// ── DISPARADOR EM MASSA (API Oficial) ─────────────────────────────────────────
// Template aprovado × lista de números, com intervalo configurável entre os envios. Job em memória
// (1 por workspace; reinício do motor cancela — o relatório mostra até onde foi). O painel fica
// pollando o status e vê o contador subir ao vivo.
interface DisparoJob {
  total: number; done: number; ok: number;
  erros: Array<{ numero: string; erro: string }>;
  running: boolean; cancelado: boolean;
  template: string; intervaloSeg: number; inicioEm: number;
  nota?: string; // observação da campanha (rótulo livre do painel)
  pausadoPorFalhas?: boolean; // opção "pausar automaticamente se houver falhas" (5 erros seguidos)
  pausado?: boolean; // PAUSA manual (tela Em andamento): o laço espera aqui até retomar ou parar
  eventos: Array<{ at: number; ok: number; err: number }>; // log com HORÁRIO REAL do servidor (não do poll do navegador)
  // Livro-razão POR NÚMERO, na ordem do envio: é o que a tela lista ao vivo (enviado/erro/a enviar).
  // Cabe em memória: o teto do disparo é 5.000 itens de ~80 bytes.
  itens: Array<{ numero: string; nome?: string; status: "pendente" | "ok" | "erro"; erro?: string; at?: number }>;
}
const disparoJobs = new Map<string, DisparoJob>();

async function iniciaDisparo(wsId: string, b: any, reply: any) {
  const atual = disparoJobs.get(wsId);
  if (atual?.running) return reply.code(409).send({ error: "já existe um disparo em andamento — pare o atual antes de iniciar outro" });
  const cfg = getCachedFor<any>(wsId, "meta-official");
  const tok = metaSegredo(cfg, "accessToken");
  if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "API Oficial não conectada neste workspace" });
  const c = { wabaId: String(cfg?.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId), accessToken: tok };
  // MODO: "template" (manda o modelo e pronto) ou "fluxo" (roda um FLUXO inteiro pra cada contato —
  // o template está dentro dele, e o que a pessoa responder cai nos ramos desenhados no canvas).
  const modo = String(b?.modo ?? "template") === "fluxo" ? "fluxo" : "template";
  const fluxoId = String(b?.fluxoId ?? "").trim();
  let fluxoAlvo: Automation | null = null;
  let primeiroNo: string | null = null;
  if (modo === "fluxo") {
    const todas = runWithWorkspace(wsId, () => loadAutomations());
    fluxoAlvo = todas.find((x) => x.id === fluxoId) ?? null;
    if (!fluxoAlvo) return reply.code(404).send({ error: "fluxo não encontrado" });
    if (fluxoAlvo.enabled === false) return reply.code(400).send({ error: `o fluxo "${fluxoAlvo.name ?? fluxoId}" está como RASCUNHO — publique antes de disparar pra uma lista` });
    const g = toGraph(fluxoAlvo);
    primeiroNo = nextNodeId(g, "trigger", null);
    if (!primeiroNo) return reply.code(400).send({ error: "esse fluxo não tem nenhum passo ligado ao gatilho" });
    // Disparo é FORA da janela de 24h: sem template, a Meta não entrega nada pra quem não falou
    // com você nas últimas 24h. Melhor barrar aqui que ver 5.000 erros no log.
    if (!(fluxoAlvo.steps ?? []).some((x: any) => x.type === "template")) {
      return reply.code(400).send({ error: "esse fluxo não tem passo de TEMPLATE — sem template a Meta não entrega pra quem está fora da janela de 24h" });
    }
  }
  const name = String(b?.name ?? "").trim();
  const language = String(b?.language ?? "pt_BR").trim() || "pt_BR";
  const params = Array.isArray(b?.params) ? b.params.map((x: any) => String(x ?? "")) : [];
  if (modo === "template" && !name) return reply.code(400).send({ error: "escolha um template aprovado" });
  // Aceita `contatos` [{numero, nome?, params?}] (CSV com variável POR CONTATO — ex.: o nome de
  // cada pessoa) OU o `numeros` simples de antes. Normaliza + DEDUPLICA por número.
  const brutos: Array<{ numero: string; nome?: string; params?: string[] }> = Array.isArray(b?.contatos)
    ? b.contatos.map((x: any) => ({ numero: String(x?.numero ?? ""), nome: x?.nome ? String(x.nome) : undefined, params: Array.isArray(x?.params) ? x.params.map((p: any) => String(p ?? "")) : undefined }))
    : (Array.isArray(b?.numeros) ? b.numeros : []).map((n: any) => ({ numero: String(n) }));
  const vistos = new Set<string>();
  const contatos: typeof brutos = [];
  for (const ct of brutos) {
    const num = ct.numero.replace(/\D/g, "").replace(/^0+/, "");
    if (num.length < 12 || vistos.has(num)) continue;
    vistos.add(num);
    contatos.push({ ...ct, numero: num });
  }
  if (!contatos.length) return reply.code(400).send({ error: "nenhum número válido — use DDI+DDD+número (ex.: 5511989...)" });
  if (contatos.length > 5000) return reply.code(400).send({ error: "máximo de 5.000 números por disparo — divida a lista" });
  // Intervalo: 0 = SEM espera entre envios (o que o dono quer no teste). O `|| 5` antigo tratava
  // 0 como falsy e virava 5s; o Math.max(1,…) ainda forçava 1s. Agora 0 vale 0 de verdade; só cai
  // no default 5 quando o valor não é número. ⚠️ mesmo com 0, cada envio é uma chamada à Graph
  // (sequencial) → 3 msgs levam alguns segundos de rede, não é instantâneo.
  const rawIntervalo = Number(b?.intervaloSeg);
  const intervaloSeg = Number.isFinite(rawIntervalo) ? Math.max(0, Math.min(rawIntervalo, 600)) : 5;
  const res = modo === "template"
    ? await resolveTemplateEnvio(c, name, language, b?.headerUrl)
    : { header: null as HeaderTpl, corpo: "" };
  if ("erro" in res) return reply.code(res.status).send({ error: res.erro });
  const job: DisparoJob = {
    total: contatos.length, done: 0, ok: 0, erros: [],
    running: true, cancelado: false,
    template: modo === "fluxo" ? `fluxo: ${fluxoAlvo!.name ?? fluxoId}` : name,
    intervaloSeg, inicioEm: Date.now(),
    nota: String(b?.nota ?? "").trim().slice(0, 100) || undefined,
    eventos: [],
    itens: contatos.map((ct) => ({ numero: ct.numero, nome: ct.nome, status: "pendente" as const })),
  };
  disparoJobs.set(wsId, job);
  // Variáveis de cada contato: as do CSV vencem posição a posição; "{{nome}}" num campo global vira
  // o nome da pessoa daquela linha (o "disparo com o nome de cada um").
  // Texto de reserva pra quando "{{nome}}" não tem nome: a Meta RECUSA parâmetro de texto vazio
  // ("Parameter of type text is missing text value") e o contato se perdia com um erro em inglês
  // que não dizia o que fazer (caso dum cliente, 30/09, ao vivo numa reunião). Vem do painel;
  // sem ele, "tudo bem" — encaixa no "Olá {{1}}," que é como quase todo template desses começa.
  const semNome = String(b?.fallbackNome ?? "").trim().slice(0, 60) || "tudo bem";
  const paramsDe = (ct: { nome?: string; params?: string[] }) =>
    params.map((p: string, i: number) => {
      const proprio = ct.params?.[i]?.trim();
      if (proprio) return proprio;
      const v = p.replaceAll("{{nome}}", (ct.nome ?? "").trim()).trim();
      // NUNCA devolve vazio: se o campo era só "{{nome}}" e o contato veio sem nome, o parâmetro
      // sairia "" e a Meta rejeita a mensagem INTEIRA daquele contato.
      if (v) return v;
      return p.includes("{{nome}}") ? semNome : "-";
    });
  const pausarFalhas = !!b?.pausarFalhas; // 5 erros SEGUIDOS → pausa sozinho (protege a qualidade do número)
  let falhasSeguidas = 0;
  setImmediate(async () => {
    for (let idx = 0; idx < contatos.length; idx++) {
      const ct = contatos[idx];
      const item = job.itens[idx];
      while (job.pausado && !job.cancelado) await new Promise((r) => setTimeout(r, 2000));
      if (job.cancelado) break;
      // 🚫 LISTA DE BLOQUEIO: quem mandou PARAR ou tocou em "Não receber mensagens" NUNCA recebe
      // disparo. Antes o Disparador ignorava o opt-out (os fluxos já respeitavam) — risco de
      // denúncia/ban e de LGPD num disparo pra milhares (achado 13/10). Pula sem chamar a Meta.
      if (await isOptedOut(ct.numero, wsId).catch(() => false)) {
        item.status = "erro"; item.erro = "bloqueado: pediu pra não receber mensagens"; item.at = Math.floor(Date.now() / 1000);
        job.erros.push({ numero: ct.numero, erro: item.erro });
        job.done++;
        continue;
      }
      const ps = paramsDe(ct);
      try {
        // MODO FLUXO: em vez de mandar um template solto, roda o FLUXO inteiro pra este contato,
        // a partir do 1º passo. O template de dentro dele sai normalmente (o runner troca pro
        // gateway oficial sozinho) e, se houver ramo de botão, o fluxo FICA ESPERANDO o clique —
        // é o disparo em massa que vira funil. Serializado por telefone, como todo inbound.
        if (modo === "fluxo") {
          await upsertContact(ct.numero, ct.nome, "disparo", wsId).catch(() => {});
          await serializeByPhone(wsId + ":" + ct.numero, () =>
            runWithWorkspace(wsId, () => resumeScheduledFlow(ct.numero, fluxoAlvo!.id, primeiroNo!, withEchoGuard(new MetaGateway({ ...c, wsId })), [fluxoAlvo!])),
          );
          job.ok++;
          falhasSeguidas = 0;
          item.status = "ok"; item.at = Math.floor(Date.now() / 1000);
          job.done++;
          job.eventos.push({ at: Math.floor(Date.now() / 1000), ok: job.ok, err: job.erros.length });
          if (job.eventos.length > 200) job.eventos.shift();
          if (job.done < job.total && !job.cancelado && intervaloSeg > 0) await new Promise((r) => setTimeout(r, intervaloSeg * 1000));
          continue;
        }
        const r = await metaSendTemplate(c.phoneNumberId, c.accessToken, ct.numero, name, language, ps, res.header);
        job.ok++;
        falhasSeguidas = 0;
        item.status = "ok"; item.at = Math.floor(Date.now() / 1000);
        // Chave real da pessoa = wa_id devolvido pela Meta (9º dígito BR) — é nela que a resposta
        // vai chegar, então o gatilho e o arquivo usam ELA, não o número da lista.
        const chatDisparo = r.waId || ct.numero;
        // Arma o gatilho "Resposta de template": se a pessoa responder/clicar em até 7 dias, o
        // fluxo com esse gatilho assume a conversa. wsId explícito — este loop roda fora do ALS.
        void setContactField(chatDisparo, "ultimo_template", name, wsId).catch(() => {});
        void setContactField(chatDisparo, "ultimo_template_em", String(Math.floor(Date.now() / 1000)), wsId).catch(() => {});
        const rendered = res.corpo
          ? res.corpo.replace(/\{\{(\d+)\}\}/g, (_m, i) => ps[Number(i) - 1] ?? `{{${i}}}`)
          : `[template ${name} enviado]`;
        const comMidia = !!res.header?.url; // com imagem/vídeo no topo → arquiva "URL\ntexto" (o inbox renderiza a mídia)
        void arquivarMensagens(
          chatDisparo,
          [{ msg_id: String(r.id ?? `disparo-${wsId}-${ct.numero}-${Date.now()}`), from_me: true,
             body: comMidia ? res.header!.url + "\n" + rendered : rendered,
             msg_type: comMidia ? res.header!.format : "template", ts: Math.floor(Date.now() / 1000),
             // Igual ao inbox e ao fluxo: rodapé/botões desenhados e DE QUAL modelo veio.
             extra: { tpl: { nome: name, idioma: language, botoes: (res as any).botoes ?? [], rodape: (res as any).rodape ?? "" } } }],
          "meta-" + c.phoneNumberId, wsId,
        ).catch(() => {});
      } catch (e: any) {
        const erro = String(e?.message ?? e).slice(0, 140);
        job.erros.push({ numero: ct.numero, erro });
        item.status = "erro"; item.erro = erro; item.at = Math.floor(Date.now() / 1000);
        falhasSeguidas++;
        if (pausarFalhas && falhasSeguidas >= 5) { job.cancelado = true; job.pausadoPorFalhas = true; }
      }
      job.done++;
      job.eventos.push({ at: Math.floor(Date.now() / 1000), ok: job.ok, err: job.erros.length }); // horário REAL do envio
      if (job.eventos.length > 200) job.eventos.shift();
      if (job.done < job.total && !job.cancelado && intervaloSeg > 0) await new Promise((r) => setTimeout(r, intervaloSeg * 1000));
    }
    job.running = false;
    console.log(`📣 disparo ws ${wsId.slice(0, 8)}: ${job.ok}/${job.total} ok, ${job.erros.length} erros${job.cancelado ? " (PARADO)" : ""}`);
  });
  return reply.send({ ok: true, total: contatos.length, intervaloSeg });
}
function statusDisparo(wsId: string, reply: any, desde = 0) {
  const j = disparoJobs.get(wsId);
  if (!j) return reply.send({ existe: false });
  // Itens já decididos (ok/erro) a partir de `desde` + TODOS os pendentes viram só um número
  // (a tela mostra "a enviar: N"), senão cada poll carregaria 5.000 linhas.
  const decididos = j.itens.filter((it) => it.status !== "pendente");
  const ini = Math.max(0, Math.min(desde, decididos.length));
  return reply.send({
    itens: decididos.slice(ini),
    itensDesde: ini,
    itensDecididos: decididos.length,
    pendentes: j.itens.length - decididos.length,
    existe: true, running: j.running, cancelado: j.cancelado, template: j.template, nota: j.nota,
    pausadoPorFalhas: j.pausadoPorFalhas || undefined,
    total: j.total, done: j.done, ok: j.ok, errosQtd: j.erros.length,
    erros: j.erros.slice(-100), intervaloSeg: j.intervaloSeg, inicioEm: j.inicioEm,
    eventos: j.eventos.slice(-14), // log com horário real do servidor
  });
}
function paraDisparo(wsId: string, reply: any) {
  const j = disparoJobs.get(wsId);
  if (!j?.running) return reply.code(400).send({ error: "nenhum disparo em andamento" });
  j.cancelado = true;
  return reply.send({ ok: true });
}
// ══ DISPAROS EM ANDAMENTO (tela "Em andamento", 13/10) ════════════════════════════════════════
// Junta os dois jeitos de disparar: o DISPARADOR (job em memória) e os FLUXOS com Loop (flow_jobs no
// banco). Métricas de entrega saem do arquivo de mensagens: template + ack, a partir do início.
// `fimMs` = início do PRÓXIMO lote do mesmo fluxo (ou agora): sem ele, 3 lotes do mesmo template
// somavam um dentro do outro — era "a mesma informação em dois em andamento" (Admin, 13/10).
async function metricasDisparo(wsId: string, templates: string[], inicioMs: number, fimMs?: number) {
  if (!templates.length) return { porTemplate: [], motivos: [] };
  const desde = Math.floor(inicioMs / 1000) - 60;
  const ate = Math.floor((fimMs ?? Date.now()) / 1000) + 60;
  const porTemplate = await query<any>(
    `SELECT extra->'tpl'->>'nome' AS template,
            count(*)::int AS total,
            count(*) FILTER (WHERE extra->>'ack' IN ('delivered','read'))::int AS entregues,
            count(*) FILTER (WHERE extra->>'ack' = 'read')::int AS lidas,
            count(*) FILTER (WHERE extra->>'ack' = 'failed')::int AS falhas
       FROM inbox_messages WHERE workspace_id=$1 AND from_me AND ts >= $2 AND ts < $4 AND extra->'tpl'->>'nome' = ANY($3)
      GROUP BY 1 ORDER BY 1`, [wsId, desde, templates, ate]).catch(() => []);
  const motivos = await query<any>(
    `SELECT left(coalesce(extra->>'erro','sem motivo'), 120) AS motivo, count(*)::int AS qtd
       FROM inbox_messages WHERE workspace_id=$1 AND from_me AND ts >= $2 AND ts < $4 AND extra->'tpl'->>'nome' = ANY($3) AND extra->>'ack'='failed'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [wsId, desde, templates, ate]).catch(() => []);
  return { porTemplate, motivos };
}
async function listaDisparos(wsId: string, reply: any) {
  const out: any[] = [];
  const j = disparoJobs.get(wsId);
  if (j) {
    const tpl = j.template.startsWith("fluxo: ") ? [] : [j.template];
    out.push({
      id: "disparador", origem: "disparador", titulo: j.template, nota: j.nota ?? null,
      total: j.total, feitos: j.done, aceitos: j.ok, recusados: j.erros.length,
      status: j.running ? (j.pausado ? "pausado" : "rodando") : (j.cancelado ? "parado" : "concluido"),
      inicio: j.inicioEm, intervaloSeg: j.intervaloSeg, podeParar: j.running,
      ...(await metricasDisparo(wsId, tpl, j.inicioEm)),
    });
  }
  // Cada card enxerga SÓ a própria janela: [início, início do PRÓXIMO lote do mesmo fluxo | agora].
  // Pendentes contam por disparo_id (jobs novos levam o id); lote antigo (sem id) cai no fallback
  // por created_at dentro da janela — run_at não serve de recorte: pausar/retomar o reescreve.
  const fl = await query<any>(
    `SELECT *, LEAD(inicio) OVER (PARTITION BY automation_id ORDER BY inicio) AS proximo
       FROM disparos_fluxo WHERE workspace_id=$1 AND inicio > now() - interval '7 days'
      ORDER BY inicio DESC LIMIT 20`, [wsId]).catch(() => []);
  for (const d of fl) {
    const inicioMs = new Date(d.inicio).getTime();
    const fimMs = d.proximo ? new Date(d.proximo).getTime() : undefined;
    const pend = await query<{ n: number }>(
      `SELECT count(*)::int n FROM flow_jobs
        WHERE workspace_id=$1 AND status IN ('pending','claimed')
          AND (disparo_id = $2 OR (disparo_id IS NULL AND automation_id=$3 AND created_at >= $4 AND created_at < $5))`,
      [wsId, d.id, d.automation_id, new Date(inicioMs - 120_000), d.proximo ? new Date(fimMs! - 120_000) : new Date(Date.now() + 60_000)]).catch(() => [{ n: 0 }]);
    const restantes = Math.min(d.total, pend[0]?.n ?? 0);
    out.push({
      id: d.id, origem: "fluxo", fluxoId: d.automation_id, titulo: d.nome || d.automation_id,
      templates: d.templates, total: d.total, feitos: d.total - restantes, restantes,
      status: restantes === 0 ? "concluido" : d.pausado ? "pausado" : "rodando",
      inicio: inicioMs, intervaloSeg: Math.round(d.intervalo_ms / 1000),
      ...(await metricasDisparo(wsId, d.templates ?? [], inicioMs, fimMs)),
    });
  }
  out.sort((a, b) => (a.status === "concluido" ? 1 : 0) - (b.status === "concluido" ? 1 : 0) || b.inicio - a.inicio);
  return reply.send({ disparos: out });
}
async function acaoDisparo(wsId: string, b: any, reply: any) {
  const id = String(b?.id ?? ""); const acao = String(b?.acao ?? "");
  if (id === "disparador") {
    const j = disparoJobs.get(wsId);
    if (!j?.running) return reply.code(400).send({ error: "esse disparo já terminou" });
    if (acao === "pausar") j.pausado = true;
    else if (acao === "retomar") j.pausado = false;
    else if (acao === "parar") { j.cancelado = true; j.pausado = false; }
    else return reply.code(400).send({ error: "ação inválida" });
    return reply.send({ ok: true });
  }
  const d = (await query<any>(
    `SELECT *, LEAD(inicio) OVER (PARTITION BY automation_id ORDER BY inicio) AS proximo
       FROM disparos_fluxo WHERE workspace_id=$1 AND automation_id = (SELECT automation_id FROM disparos_fluxo WHERE id=$2 AND workspace_id=$1)`,
    [wsId, id]).catch(() => []) as any[]).find((x) => x.id === id);
  if (!d) return reply.code(404).send({ error: "disparo não encontrado" });
  // Escopo da ação = SÓ os jobs deste lote: pelo disparo_id (jobs novos) ou, nos antigos sem id,
  // pelo created_at dentro da janela do lote. Antes era por automation_id e pausar um card
  // pausava os outros lotes do mesmo fluxo (bug 13/10).
  const iniW = new Date(new Date(d.inicio).getTime() - 120_000);
  const fimW = d.proximo ? new Date(new Date(d.proximo).getTime() - 120_000) : new Date(Date.now() + 60_000);
  const escopo = "(disparo_id = $2 OR (disparo_id IS NULL AND automation_id=$3 AND created_at >= $4 AND created_at < $5))";
  const args = [wsId, d.id, d.automation_id, iniW, fimW];
  if (acao === "pausar") {
    // Empurra os envios que faltam pra longe (continuam na fila, na MESMA ordem) — nada se perde.
    await query(`UPDATE flow_jobs SET run_at = run_at + interval '50 years' WHERE workspace_id=$1 AND status='pending' AND run_at < now() + interval '40 years' AND ${escopo}`, args);
    await query("UPDATE disparos_fluxo SET pausado=TRUE WHERE id=$1", [id]);
  } else if (acao === "retomar") {
    // Devolve pra agora, respeitando a ordem e o intervalo de antes.
    await query(`WITH r AS (SELECT id, row_number() OVER (ORDER BY run_at) - 1 AS n FROM flow_jobs
                  WHERE workspace_id=$1 AND status='pending' AND run_at > now() + interval '40 years' AND ${escopo})
                 UPDATE flow_jobs f SET run_at = now() + (r.n * $6::int) * interval '1 millisecond' FROM r WHERE f.id = r.id`,
      [...args, d.intervalo_ms]);
    await query("UPDATE disparos_fluxo SET pausado=FALSE WHERE id=$1", [id]);
  } else if (acao === "parar") {
    await query(`UPDATE flow_jobs SET status='canceled' WHERE workspace_id=$1 AND status='pending' AND ${escopo}`, args);
    await query("UPDATE disparos_fluxo SET pausado=FALSE WHERE id=$1", [id]);
  } else return reply.code(400).send({ error: "ação inválida" });
  console.log(`📣 disparo por fluxo ${id} (${d.nome ?? d.automation_id}): ${acao}`);
  return reply.send({ ok: true });
}
app.get("/admin/oficial/disparos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return listaDisparos(getPrimaryWorkspace(), reply);
});
app.post("/admin/oficial/disparos/acao", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return acaoDisparo(getPrimaryWorkspace(), req.body, reply);
});
app.get("/app/oficial/disparos", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return listaDisparos(ws, reply);
});
app.post("/app/oficial/disparos/acao", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return acaoDisparo(ws, req.body, reply);
});
// 📞 As formas do mesmo número BR pra casar com a ficha DENTRO do SQL: o wa_id da Meta derruba o
// 9º dígito em número antigo, a planilha/Kiwify mandam COM o 9. Sem isto, 282 dos 500 contatos do
// disparo de 13/10 apareciam "sem nome" com o nome gravado na ficha na outra forma.
const SQL_FORMAS_9 = (col: string) =>
  `${col}, substr(${col},1,4)||'9'||substr(${col},5), CASE WHEN length(${col})=13 AND substr(${col},5,1)='9' THEN substr(${col},1,4)||substr(${col},6) END`;
// LISTA DE CONTATOS de um disparo por status (enviados/entregues/lidas/falhas) — é o popup da tela
// de disparos. Uma linha por pessoa (a última mensagem do disparo pra ela), com nome da ficha.
async function contatosDoDisparo(wsId: string, id: string, status: string): Promise<any[] | null> {
  let templates: string[] = []; let inicioMs = 0; let fimMs: number | undefined;
  if (id === "disparador") {
    const j = disparoJobs.get(wsId); if (!j) return null;
    templates = j.template.startsWith("fluxo: ") ? [] : [j.template]; inicioMs = j.inicioEm;
  } else {
    // A janela fecha no início do PRÓXIMO lote do mesmo fluxo — sem isso a lista de um card
    // trazia os contatos dos lotes seguintes (mesmo template).
    const d = (await query<any>(
      `SELECT *, LEAD(inicio) OVER (PARTITION BY automation_id ORDER BY inicio) AS proximo
         FROM disparos_fluxo WHERE workspace_id=$2 AND automation_id = (SELECT automation_id FROM disparos_fluxo WHERE id=$1 AND workspace_id=$2)`,
      [id, wsId]).catch(() => []) as any[]).find((x) => x.id === id);
    if (!d) return null;
    templates = d.templates ?? []; inicioMs = new Date(d.inicio).getTime();
    if (d.proximo) fimMs = new Date(d.proximo).getTime();
  }
  if (!templates.length) return [];
  const desde = Math.floor(inicioMs / 1000) - 60;
  const ate = Math.floor((fimMs ?? Date.now()) / 1000) + 60;
  const cond = status === "entregues" ? "AND m.extra->>'ack' IN ('delivered','read')"
    : status === "lidas" ? "AND m.extra->>'ack' = 'read'"
    : status === "falhas" ? "AND m.extra->>'ack' = 'failed'" : "";
  return query<any>(
    `SELECT DISTINCT ON (m.chat_id) m.chat_id AS phone, COALESCE(c.name, (SELECT f.value FROM contact_fields f WHERE f.workspace_id = $1 AND regexp_replace(f.phone,'[^0-9]','','g') IN (${SQL_FORMAS_9("m.chat_id")}) AND f.field IN ('nome','primeiro_nome') AND f.value <> '' ORDER BY f.field LIMIT 1), m.sender_name) AS name,
            m.extra->'tpl'->>'nome' AS template, m.extra->>'ack' AS ack, left(m.extra->>'erro', 160) AS erro, m.ts
       FROM inbox_messages m LEFT JOIN contacts c ON c.phone = m.chat_id AND c.workspace_id = $1
      WHERE m.workspace_id = $1 AND m.from_me AND m.ts >= $2 AND m.ts < $4 AND m.extra->'tpl'->>'nome' = ANY($3) ${cond}
      ORDER BY m.chat_id, m.ts DESC`, [wsId, desde, templates, ate]).catch(() => []);
}
async function respondeContatosDisparo(wsId: string, q: any, reply: any) {
  const r = await contatosDoDisparo(wsId, String(q?.id ?? ""), String(q?.status ?? "enviados"));
  if (r === null) return reply.code(404).send({ error: "disparo não encontrado" });
  return reply.send({ contatos: r.sort((a: any, b: any) => Number(b.ts ?? 0) - Number(a.ts ?? 0)) });
}
// Etiqueta em TODOS os contatos de um status do disparo (ex.: "falhas" → "número inexistente").
// A etiqueta entra no registro da conta se for nova, pra aparecer no seletor de todo lugar.
async function etiquetaContatosDisparo(wsId: string, b: any, reply: any) {
  const tag = String(b?.tag ?? "").trim().slice(0, 60);
  if (!tag) return reply.code(400).send({ error: "informe a etiqueta" });
  const r = await contatosDoDisparo(wsId, String(b?.id ?? ""), String(b?.status ?? "enviados"));
  if (r === null) return reply.code(404).send({ error: "disparo não encontrado" });
  const phones = [...new Set(r.map((x: any) => String(x.phone)))];
  await runWithWorkspace(wsId, () => createWorkspaceTag(tag)).catch(() => {});
  await bulkAddContactTags(phones, [tag], "disparo", wsId);
  console.log(`🏷️ etiqueta "${tag}" em ${phones.length} contato(s) do disparo ${b?.id} (${b?.status})`);
  return reply.send({ ok: true, aplicados: phones.length });
}
// QUEM CLICOU num botão de RESPOSTA RÁPIDA de um template, no período (tela Métricas → "Por botão").
// Botão de LINK (URL) a Meta só conta: ela não identifica quem clicou — a resposta diz isso.
async function contatosDoBotao(wsId: string, q: any): Promise<{ tipo: "resposta" | "url" | "desconhecido"; contatos: any[] }> {
  const nome = String(q?.template ?? "").trim(); const botao = String(q?.botao ?? "").trim();
  if (!nome || !botao) return { tipo: "desconhecido", contatos: [] };
  const wabas = listaWabas(wsId);
  const alvo = (q?.waba && wabas.find((x) => x.wabaId === String(q.waba))) || wabas[0];
  let tipo: "resposta" | "url" | "desconhecido" = "desconhecido";
  if (alvo) {
    const tpls = await metaListTemplates(alvo.wabaId, alvo.accessToken).catch(() => [] as any[]);
    const t: any = tpls.find((x: any) => x.name === nome);
    const b = (t?.components?.find((c: any) => c.type === "BUTTONS")?.buttons ?? []).find((x: any) => String(x.text ?? "").trim().toLowerCase() === botao.toLowerCase());
    if (b) tipo = String(b.type).toUpperCase() === "QUICK_REPLY" ? "resposta" : "url";
  }
  if (tipo === "url") return { tipo, contatos: [] };
  const per = periodoMetricas(q);
  const rows = await query<any>(
    `SELECT DISTINCT ON (r.chat_id) r.chat_id AS phone, COALESCE(c.name, (SELECT f.value FROM contact_fields f WHERE f.workspace_id = $1 AND regexp_replace(f.phone,'[^0-9]','','g') IN (${SQL_FORMAS_9("r.chat_id")}) AND f.field IN ('nome','primeiro_nome') AND f.value <> '' ORDER BY f.field LIMIT 1), r.sender_name) AS name, r.ts
       FROM inbox_messages r
       JOIN LATERAL (SELECT 1 FROM inbox_messages t WHERE t.workspace_id = r.workspace_id AND t.chat_id = r.chat_id AND t.from_me
                       AND t.extra->'tpl'->>'nome' = $2 AND t.ts <= r.ts AND t.ts >= $3 LIMIT 1) t ON TRUE
       LEFT JOIN contacts c ON c.phone = r.chat_id AND c.workspace_id = $1
      WHERE r.workspace_id = $1 AND NOT r.from_me AND lower(btrim(r.body)) = lower($4) AND r.ts BETWEEN $3 AND $5
      ORDER BY r.chat_id, r.ts DESC`, [wsId, nome, per.inicio, botao, per.fim]).catch(() => []);
  return { tipo, contatos: rows.sort((a: any, b: any) => Number(b.ts ?? 0) - Number(a.ts ?? 0)) };
}
app.get("/admin/oficial/metricas/botao", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(await contatosDoBotao(getPrimaryWorkspace(), req.query));
});
app.get("/app/oficial/metricas/botao", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return reply.send(await contatosDoBotao(ws, req.query));
});
// ETIQUETA EM LOTE numa lista de telefones (popups de contatos: disparos, botões de template…).
async function etiquetaLote(wsId: string, b: any, reply: any) {
  const tag = String(b?.tag ?? "").trim().slice(0, 60);
  const phones: string[] = [...new Set<string>((Array.isArray(b?.phones) ? b.phones : []).map((p: any) => String(p).replace(/\D/g, "")).filter((p: string) => p.length >= 10))].slice(0, 5000);
  if (!tag) return reply.code(400).send({ error: "informe a etiqueta" });
  if (!phones.length) return reply.code(400).send({ error: "nenhum telefone na lista" });
  await runWithWorkspace(wsId, () => createWorkspaceTag(tag)).catch(() => {});
  await bulkAddContactTags(phones, [tag], "lote", wsId);
  console.log(`🏷️ etiqueta "${tag}" em ${phones.length} contato(s) (lote)`);
  return reply.send({ ok: true, aplicados: phones.length });
}
app.post("/admin/contacts/tag-lote", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return etiquetaLote(getPrimaryWorkspace(), req.body, reply);
});
app.post("/app/contacts/tag-lote", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return etiquetaLote(ws, req.body, reply);
});
app.get("/admin/oficial/disparos/contatos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return respondeContatosDisparo(getPrimaryWorkspace(), req.query, reply);
});
app.post("/admin/oficial/disparos/tag", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return etiquetaContatosDisparo(getPrimaryWorkspace(), req.body, reply);
});
app.get("/app/oficial/disparos/contatos", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return respondeContatosDisparo(ws, req.query, reply);
});
app.post("/app/oficial/disparos/tag", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return etiquetaContatosDisparo(ws, req.body, reply);
});

// Rascunho do Disparador ("Salvar rascunho") — persistido no SERVIDOR, não no navegador (regra da
// casa: estado de operação fica na fonte). Um rascunho por workspace; {limpar:true} apaga.
function leRascunho(wsId: string, reply: any) {
  const r = getCachedFor<any>(wsId, "disparo-rascunho");
  if (!r?.dados) return reply.send({ existe: false });
  return reply.send({ existe: true, salvoEm: r.salvoEm, dados: r.dados });
}
async function salvaRascunho(wsId: string, b: any, reply: any) {
  if (b?.limpar) { await saveConfigFor(wsId, "disparo-rascunho", { salvoEm: 0, dados: null }); return reply.send({ ok: true }); }
  const dados = b?.dados;
  if (!dados || typeof dados !== "object") return reply.code(400).send({ error: "rascunho vazio" });
  if (JSON.stringify(dados).length > 400_000) return reply.code(400).send({ error: "rascunho grande demais — importe a lista de contatos de novo na hora do envio" });
  await saveConfigFor(wsId, "disparo-rascunho", { salvoEm: Date.now(), dados });
  return reply.send({ ok: true });
}
// ── RASCUNHOS DE TEMPLATE ─────────────────────────────────────────────────────
// Guarda o template PELA METADE, no servidor (não no navegador), pra retomar depois — a Meta só
// conhece template já submetido, e perder meia hora de escrita ao fechar a aba é o que mais
// irritava. O ARQUIVO do cabeçalho NÃO entra: vídeo de 16MB não cabe numa config e o exemplo é
// reescolhido na hora de enviar pra aprovação.
const MAX_RASCUNHOS_TPL = 30;
function listaRascunhosTpl(wsId: string): any[] {
  const c = getCachedFor<any>(wsId, "templates-rascunhos");
  return Array.isArray(c?.lista) ? c.lista : [];
}
function leRascunhosTpl(wsId: string, reply: any) {
  return reply.send({ rascunhos: listaRascunhosTpl(wsId) });
}
async function salvaRascunhoTpl(wsId: string, body: any, reply: any) {
  const dados = body?.dados ?? null;
  if (!dados || typeof dados !== "object") return reply.code(400).send({ error: "rascunho vazio" });
  if (JSON.stringify(dados).length > 200_000) return reply.code(400).send({ error: "rascunho grande demais" });
  const lista: any[] = [...listaRascunhosTpl(wsId)];
  const id = String(body?.id || "").trim() || "r" + Date.now().toString(36);
  const item = { id, nome: String(dados?.name || "").slice(0, 80) || "(sem nome)", salvoEm: Date.now(), dados };
  const i = lista.findIndex((x) => x?.id === id);
  if (i >= 0) lista[i] = item; else lista.unshift(item);
  const nova = lista.slice(0, MAX_RASCUNHOS_TPL);
  await saveConfigFor(wsId, "templates-rascunhos", { lista: nova });
  // devolve a lista já atualizada: o cache de config só reflete em ~15s
  return reply.send({ ok: true, id, salvoEm: item.salvoEm, rascunhos: nova });
}
async function apagaRascunhoTpl(wsId: string, id: string, reply: any) {
  const nova = listaRascunhosTpl(wsId).filter((x) => x?.id !== id);
  await saveConfigFor(wsId, "templates-rascunhos", { lista: nova });
  return reply.send({ ok: true, rascunhos: nova });
}
app.get("/admin/oficial/templates/rascunhos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return leRascunhosTpl(getPrimaryWorkspace(), reply);
});
app.post("/admin/oficial/templates/rascunhos", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return salvaRascunhoTpl(getPrimaryWorkspace(), req.body, reply);
});
app.delete("/admin/oficial/templates/rascunhos/:id", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return apagaRascunhoTpl(getPrimaryWorkspace(), String((req.params as any).id || ""), reply);
});
app.get("/app/oficial/templates/rascunhos", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return leRascunhosTpl(ws, reply);
});
app.post("/app/oficial/templates/rascunhos", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return salvaRascunhoTpl(ws, req.body, reply);
});
app.delete("/app/oficial/templates/rascunhos/:id", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return apagaRascunhoTpl(ws, String((req.params as any).id || ""), reply);
});
app.get("/admin/oficial/disparo/rascunho", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return leRascunho(getPrimaryWorkspace(), reply);
});
app.post("/admin/oficial/disparo/rascunho", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return salvaRascunho(getPrimaryWorkspace(), req.body, reply);
});
app.get("/app/oficial/disparo/rascunho", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return leRascunho(ws, reply);
});
app.post("/app/oficial/disparo/rascunho", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return salvaRascunho(ws, req.body, reply);
});
app.post("/admin/oficial/disparo", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return iniciaDisparo(getPrimaryWorkspace(), req.body, reply);
});
app.get("/admin/oficial/disparo", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return statusDisparo(getPrimaryWorkspace(), reply, Number((req.query as any)?.desde) || 0);
});
app.post("/admin/oficial/disparo/parar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return paraDisparo(getPrimaryWorkspace(), reply);
});
app.post("/app/oficial/disparo", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return iniciaDisparo(ws, req.body, reply);
});
app.get("/app/oficial/disparo", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return statusDisparo(ws, reply, Number((req.query as any)?.desde) || 0);
});
app.post("/app/oficial/disparo/parar", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return paraDisparo(ws, reply);
});

// Espelho DO CLIENTE (o proxy do painel remapeia /admin → /app pra sessão não-admin).
app.post("/app/meta/templates/send", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => {
    const cfg = getCached<any>("meta-official");
    const tok = metaSegredo(cfg, "accessToken");
    if (!cfg?.phoneNumberId || !tok) return reply.code(400).send({ error: "conecte a conta oficial primeiro" });
    const r = await enviaTemplateOficial({ wabaId: String(cfg?.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId), accessToken: tok }, req.body, ws);
    if ("erro" in r) return reply.code(r.status).send({ error: r.erro });
    return reply.send({ ok: true, id: r.id });
  });
});

// Webhook da Meta (Cloud API): verificação (GET) + recebimento (POST). Estático vence o :platform.
// ★ FASE 4b (06/08): o webhook da Meta é MULTI-TENANT — cada workspace tem sua config
// "meta-official" e o roteamento acha o dono pelo verifyToken (handshake) / phoneNumberId (eventos).
app.get("/webhooks/meta", async (req, reply) => {
  const q = req.query as any;
  if (q["hub.mode"] === "subscribe" && q["hub.verify_token"]) {
    const dono = scanConfig<any>("meta-official").find((c) => c.value?.verifyToken && c.value.verifyToken === q["hub.verify_token"]);
    if (dono) return reply.code(200).type("text/plain").send(String(q["hub.challenge"] ?? ""));
  }
  return reply.code(403).send("forbidden");
});
app.post("/webhooks/meta", LIMITE_WEBHOOK, async (req, reply) => {
  const raw = (req as any).rawBody as string | undefined;
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  // Inclui as contas EXTRAS (números adicionais). Antes só a principal entrava aqui: um número
  // extra recebia mensagem e o webhook não achava dono — ficava "conectado" só pra enviar.
  const todos = todasContasOficiais();
  // FAIL-CLOSED em duas camadas: (1) a assinatura HMAC do corpo cru tem que bater com o App Secret
  // de ALGUM workspace conhecido (endpoint é público); (2) cada evento só roda no workspace cujo
  // appSecret assina o corpo — evento de um app NUNCA entra no workspace de outro.
  const assinaturaOk = todos.some((c) => c.conta.appSecret && verifyMetaSignature(raw ?? "", sig, c.conta.appSecret));
  if (!assinaturaOk) return reply.code(401).send({ error: "assinatura inválida" });
  // ✓✓ STATUS de envio (sent/delivered/read/failed): alimenta os contadores diários da página
  // Métricas (é a ÚNICA fonte de "lidas") e o ack da mensagem arquivada. Best-effort em fundo.
  try {
    for (const st of parseMetaStatuses(req.body)) {
      const dono = todos.find((c) => c.conta.phoneNumberId === st.phoneNumberId);
      if (!dono || !verifyMetaSignature(raw ?? "", sig, dono.conta.appSecret)) continue;
      // NÃO ENTREGUE: a Meta aceita o envio (200 + id) e SÓ DEPOIS avisa que segurou. Sem este log
      // o sintoma era "mandei e não chegou", sem nada em lugar nenhum pra explicar — o painel
      // ainda dizia "a Meta aceitou". Agora o motivo aparece nos Logs ao vivo na hora.
      if (st.status === "failed") {
        for (const e of st.erros ?? []) {
          console.log(
            `📵 meta · NÃO ENTREGUE para ${st.paraQuem ?? "?"} · código ${e.code} (${e.title}) · ` +
            explicaErroMeta(e.code, e.title) + (e.detalhe ? ` · detalhe da Meta: ${e.detalhe}` : ""),
          );
        }
        if (!(st.erros ?? []).length) console.log(`📵 meta · NÃO ENTREGUE para ${st.paraQuem ?? "?"} · a Meta não disse o motivo (msg ${st.msgId})`);
      }
      const coluna = st.status === "sent" ? "enviadas" : st.status === "delivered" ? "entregues" : st.status === "read" ? "lidas" : st.status === "failed" ? "falhas" : null;
      if (!coluna) continue;
      void query(
        `INSERT INTO meta_stats(workspace_id, dia, phone_id, ${coluna}) VALUES($1, CURRENT_DATE, $2, 1)
         ON CONFLICT (workspace_id, dia, phone_id) DO UPDATE SET ${coluna} = meta_stats.${coluna} + 1`,
        [dono.wsId, st.phoneNumberId],
      ).catch(() => {});
      // O ack no balão do WPP Api. Guarda de ORDEM: um "delivered" atrasado não pode regredir uma
      // mensagem já "read" (retries da Meta chegam fora de ordem). failed leva junto o MOTIVO
      // traduzido — é o que o painel mostra em vermelho ("enviado mas não recebido", caso de uma cliente).
      const rankAck: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
      const extraAck: Record<string, unknown> = { ack: st.status };
      if (st.status === "failed") {
        const e1 = (st.erros ?? [])[0];
        extraAck.erro = e1 ? explicaErroMeta(e1.code, e1.title) : "a Meta não disse o motivo";
        if (e1) extraAck.erroCodigo = e1.code;
      }
      void query(
        `UPDATE inbox_messages SET extra = extra || $3::jsonb
          WHERE workspace_id=$1 AND msg_id=$2
            AND COALESCE(CASE extra->>'ack' WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 END, 0) <= $4`,
        [dono.wsId, st.msgId, JSON.stringify(extraAck), rankAck[st.status] ?? 0],
      ).catch(() => {});
    }
  } catch { /* status nunca derruba o webhook */ }
  // 📞 LIGAÇÕES (Fase 0 da Calling API): cada chamada vira UM evento inline na conversa do WPP
  // Api — "tocando" evolui pra "atendida/perdida" no MESMO balão (msg_id = call-<id>, o ON
  // CONFLICT do arquivo troca o body). Payload real ainda não visto: log RAW greppável (`📞 meta`)
  // pra calibrar com a primeira ligação. Best-effort: ligação NUNCA derruba o webhook.
  try {
    for (const cl of parseMetaCalls(req.body)) {
      const dono = todos.find((c) => c.conta.phoneNumberId === String(cl.phoneNumberId)) ?? null;
      if (!dono) { console.log(`🚨 meta · ligação num phone_number_id sem dono (${cl.phoneNumberId}) — descartada`); continue; }
      if (!verifyMetaSignature(raw ?? "", sig, dono.conta.appSecret)) continue;
      // Qual lado é o LEAD: o wa_id que NÃO é o número do negócio (em recebida vem no from; em
      // feita pela empresa, no to).
      const negocio = cl.displayNumber.replace(/\D/g, "");
      const lead = [cl.from, cl.to].map((v) => String(v ?? "").replace(/\D/g, "")).find((v) => v && v !== negocio) ?? "";
      console.log(`📞 meta · ligação "${cl.evento || "?"}" · lead ${lead || "?"} · dir ${cl.direcao || "?"} · status ${cl.statusFim || "-"} · dur ${cl.duracaoSeg ?? "-"}s · raw ${JSON.stringify(cl.raw).slice(0, 400)}`);
      if (!lead) continue;
      const recebida = cl.direcao !== "BUSINESS_INITIATED";
      const terminou = cl.evento === "terminate" || cl.evento === "terminated" || !!cl.statusFim.match(/completed|missed|rejected|no_answer|failed/);
      const atendida = (cl.duracaoSeg ?? 0) > 0 || cl.statusFim === "completed";
      const dur = cl.duracaoSeg != null ? ` (${cl.duracaoSeg >= 60 ? Math.floor(cl.duracaoSeg / 60) + "min" + (cl.duracaoSeg % 60 ? " " + (cl.duracaoSeg % 60) + "s" : "") : cl.duracaoSeg + "s"})` : "";
      const texto = !terminou
        ? (recebida ? "Ligação pelo WhatsApp — tocando" : "Ligação pelo WhatsApp — chamando o cliente")
        : recebida
          ? (atendida ? `Ligação recebida — atendida${dur}` : "Ligação perdida — o cliente ligou e ninguém atendeu")
          : (atendida ? `Ligação feita — o cliente atendeu${dur}` : "Ligação feita — o cliente não atendeu");
      void arquivarMensagens(
        lead,
        [{ msg_id: "call-" + (cl.callId || String(cl.ts)), from_me: !recebida, sender_name: "Sistema", body: texto, msg_type: "call", ts: cl.ts }],
        "meta-" + dono.conta.phoneNumberId,
        dono.wsId,
      ).catch(() => {});
    }
  } catch (e: any) { console.log("📞 meta · erro no parse de ligação:", e?.message ?? e); }
  try {
    for (const { phoneNumberId, msg, caption, flowResposta, anuncio, respondeA } of parseMetaInbound(req.body)) {
      // Dono do número: workspace cuja config tem esse phoneNumberId. FAIL-CLOSED.
      // ⚠️ Aqui existia um fallback pro workspace PRIMÁRIO ("cobre o número em meio de configuração",
      // Fase 1). Com cliente na mesma BM/app do dono a assinatura BATE, e o efeito era o pior
      // possível: mensagem de CLIENTE caindo na caixa do dono (o incidente de 16/08 de novo) e o
      // cliente jurando que a API dele "não tem chat ao vivo". Número sem dono agora é DESCARTADO
      // com log gritado — some o vazamento e sobra um sintoma diagnosticável.
      const dono = todos.find((c) => c.conta.phoneNumberId === String(phoneNumberId)) ?? null;
      if (!dono) {
        console.log(`🚨 meta · SEM DONO: chegou mensagem do phone_number_id ${phoneNumberId} e NENHUM workspace tem esse número salvo com token. Descartada. Confira a Conexão daquele cliente (phoneNumberId + token).`);
        continue;
      }
      if (!verifyMetaSignature(raw ?? "", sig, dono.conta.appSecret)) {
        console.log(`📨 meta · evento de ${phoneNumberId} não assina com o app do workspace dono — descartado`);
        continue;
      }
      const cfg = dono.conta;
      const creds = { phoneNumberId: cfg.phoneNumberId || phoneNumberId, accessToken: cfg.accessToken, wabaId: cfg.wabaId || "" };
      if (!creds.phoneNumberId || !creds.accessToken) continue;
      if (msg.id && (await isDuplicate("meta:" + dono.wsId + ":" + msg.id))) continue;
      const metaGw = new MetaGateway({ ...creds, wsId: dono.wsId });
      // ✓✓ azul — best-effort. O `msg.from` vai junto porque é aqui que o gateway APRENDE o id da
      // última fala do lead: é ele que faz o passo "Digitando..." funcionar na API Oficial.
      metaGw.markRead(msg.id, msg.from).catch(() => {});
      // 📎 MÍDIA RECEBIDA: o payload traz só o media id (a URL da Meta exige token e expira em ~5min).
      // Baixa agora, hospeda no NOSSO /media e arquiva "URL[\n legenda]" — antes era DESCARTADA
      // ("sem texto — ignorado") e a conversa no WPP Api ficava com buraco. Best-effort em segundo
      // plano: falha de download não atrasa o 200 do webhook (a Meta re-tenta se demorarmos).
      if (msg.isAudio && msg.id) {
        tokenAudioOficial.set(msg.id, creds.accessToken);
        setTimeout(() => tokenAudioOficial.delete(msg.id), 10 * 60_000).unref?.();
      }
      const ehMidia = ["image", "video", "audio", "document", "sticker"].includes(msg.type || "");
      if (ehMidia && msg.mediaId) {
        const conta = "meta-" + (cfg.phoneNumberId || phoneNumberId);
        void (async () => {
          const { buf, mime } = await metaDownloadMedia(creds.accessToken, msg.mediaId!);
          const mediaId = "meta-" + String(msg.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
          await saveMedia(mediaId, mime, buf, dono.wsId);
          const url = MEDIA_PUBLIC_BASE + "/media/" + mediaId;
          await arquivarMensagens(
            msg.from,
            [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: url + (caption ? "\n" + caption : ""), msg_type: msg.type, ts: Math.floor(Date.now() / 1000) }],
            conta,
            dono.wsId,
          );
        })().catch((e) => console.error("meta mídia recebida:", e?.message));
      }
      // 📣 LEAD DE ANÚNCIO (Click-to-WhatsApp): o `referral` só vem na 1ª mensagem e era descartado.
      // Arquiva uma linha de contexto na conversa — o atendente vê DE QUAL anúncio o lead veio, e
      // fica registrado que a janela GRÁTIS de 72h (Free Entry Point) vale pra esta conversa.
      if (anuncio) {
        const linhas = [
          "Lead veio de ANÚNCIO (Click-to-WhatsApp)",
          anuncio.headline ? `Anúncio: ${anuncio.headline}` : "",
          anuncio.sourceUrl ? `Link: ${anuncio.sourceUrl}` : "",
          anuncio.ctwaClid ? `Clique: ${anuncio.ctwaClid.slice(0, 40)}…` : "",
        ].filter(Boolean);
        const tsCtwa = Math.floor(Date.now() / 1000) - 1;
        // 🖼️ Miniatura re-hospedada FORA do caminho da resposta (a Meta exige o 200 rápido) e em
        // best-effort: a URL do scontent EXPIRA, então a cópia vai pro nosso /media; sem miniatura,
        // o marcador sai só com o texto, como sempre.
        void (async () => {
          let thumb = "";
          const urlThumb = anuncio.thumbUrl || anuncio.imageUrl || "";
          if (urlThumb) {
            try {
              const r = await fetch(urlThumb, { signal: AbortSignal.timeout(8_000) });
              const mime = r.headers.get("content-type") ?? "image/jpeg";
              if (r.ok && /^image\//.test(mime)) {
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length && buf.length <= 2 * 1024 * 1024) {
                  const idm = mediaIdFor(buf, mime);
                  await saveMedia(idm, mime, buf, dono.wsId);
                  thumb = `${MEDIA_PUBLIC_BASE}/media/${idm}`;
                }
              }
            } catch { /* cosmético */ }
          }
          const extraAnuncio = {
            ...(anuncio.headline ? { headline: String(anuncio.headline).slice(0, 120) } : {}),
            ...(anuncio.sourceUrl ? { url: String(anuncio.sourceUrl).slice(0, 300) } : {}),
            ...(thumb ? { thumb } : {}),
          };
          await arquivarMensagens(
            msg.from,
            [{ msg_id: msg.id + "-ctwa", from_me: false, sender_name: "Sistema", body: linhas.join("\n"), msg_type: "ctwa", ts: tsCtwa,
               ...(Object.keys(extraAnuncio).length ? { extra: { anuncio: extraAnuncio } } : {}) }],
            "meta-" + (cfg.phoneNumberId || phoneNumberId),
            dono.wsId,
          );
          if (thumb) void setContactField(msg.from, "anuncio_thumb", thumb, dono.wsId).catch(() => {});
        })().catch(() => {});
        // Guarda o anúncio na FICHA do contato (não só na conversa): é o que acende o selo ADS e
        // entra na lista de origem no cabeçalho da conversa — igual às UTMs do checkout.
        if (anuncio.headline) void setContactField(msg.from, "anuncio_headline", String(anuncio.headline).slice(0, 120), dono.wsId).catch(() => {});
        if (anuncio.sourceUrl) void setContactField(msg.from, "anuncio_link", String(anuncio.sourceUrl).slice(0, 300), dono.wsId).catch(() => {});
        // ⚠️ o ctwa_clid tem ~99 chars — o slice(0,80) de antes CORTAVA e inutilizava todo clique
        // salvo (a Meta responde "ctwa clid inválido"). Achado em 13/09, consertado em 13/10.
        if (anuncio.ctwaClid) void setContactField(msg.from, "anuncio_clique", String(anuncio.ctwaClid).slice(0, 400), dono.wsId).catch(() => {});
        // 📣 Pedido do dono (13/10): todo lead de anúncio ganha a etiqueta na hora (é ela que liga
        // a atendente IA só pra esses leads) e o carimbo do clique — desde 01/10/2026 o CTWA abre
        // janela de 7 DIAS (não 24h), e é deste carimbo que o painel calcula o fim dela.
        void addContactTag(msg.from, "anuncio-wpp", "ctwa", dono.wsId).catch(() => {});
        void setContactField(msg.from, "anuncio_em", String(Math.floor(Date.now() / 1000)), dono.wsId).catch(() => {});
        console.log(`📣 meta · ${msg.from} veio de anúncio CTWA${anuncio.headline ? ` ("${anuncio.headline}")` : ""} → ws ${dono.wsId.slice(0, 8)}`);
      }
      // 📋 FORMULÁRIO PREENCHIDO (WhatsApp Flow): a resposta chega como interactive.nfm_reply e era
      // DESCARTADA. Arquiva legível ("campo: valor" por linha) — aparece no chat do WPP Api na hora.
      if (flowResposta) {
        const linhas = Object.entries(flowResposta)
          .filter(([k]) => k !== "flow_token") // token opaco de correlação, não é resposta da pessoa
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
        void arquivarMensagens(
          msg.from,
          [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: "Formulário preenchido\n" + linhas.join("\n"), msg_type: "flow_reply", ts: Math.floor(Date.now() / 1000) }],
          "meta-" + (cfg.phoneNumberId || phoneNumberId),
          dono.wsId,
        ).catch(() => {});
        console.log(`📨 meta · ${msg.from} · formulário preenchido (${linhas.length} campos) → ws ${dono.wsId.slice(0, 8)}`);
        continue;
      }
      // 📍 LOCALIZAÇÃO recebida pela Cloud API: não tem texto, então caía no "ignorado" abaixo e
      // sumia da conversa. Arquiva com as coordenadas no extra (o painel desenha o cartão).
      if (msg.type === "location" && msg.local) {
        const l = msg.local;
        void arquivarMensagens(
          msg.from,
          [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: [l.nome, l.endereco].filter(Boolean).join("\n") || "Localização",
             msg_type: "location", ts: Math.floor(Date.now() / 1000), extra: { local: l } }],
          "meta-" + (cfg.phoneNumberId || phoneNumberId),
          dono.wsId,
        ).catch(() => {});
        console.log(`📍 meta · ${msg.from} · localização ${l.lat},${l.lng} → ws ${dono.wsId.slice(0, 8)}`);
        // E o agente/fluxo também recebem (como texto com o link do Maps) — antes a localização
        // morria aqui e o atendente de IA nunca sabia onde o lead estava. Já arquivada acima.
        const msgLoc = { ...msg, text: textoDaLocalizacao(l) };
        const corpoLoc = req.body;
        serializeByPhone(dono.wsId + ":" + msg.from, () => runWithWorkspace(dono.wsId, () => processInbound(msgLoc, corpoLoc, metaGw, "meta")));
        continue;
      }
      // 👤 CONTATO compartilhado pela Cloud API: também vem sem texto. Arquiva com os dados no
      // extra — o painel desenha o cartão com "Conversar"/"Copiar número".
      if (msg.type === "contacts" && msg.contatos?.length) {
        const nomes = msg.contatos.map((c) => c.nome).filter(Boolean).join(", ");
        void arquivarMensagens(
          msg.from,
          [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: nomes || "Contato",
             msg_type: "contacts", ts: Math.floor(Date.now() / 1000), extra: { contatos: msg.contatos } }],
          "meta-" + (cfg.phoneNumberId || phoneNumberId),
          dono.wsId,
        ).catch(() => {});
        console.log(`👤 meta · ${msg.from} · contato compartilhado (${msg.contatos.length}) → ws ${dono.wsId.slice(0, 8)}`);
        continue;
      }
      // 😀 REAÇÃO do lead: vira o emoji em cima do balão alvo no WPP Api. Não é fala — não acorda
      // fluxo, agente nem gatilho de template (um 👍 não pode disparar a IA vendedora).
      if (msg.type === "reaction") {
        void arquivarMensagens(
          msg.from,
          [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: msg.text ?? "",
             msg_type: "reaction", ts: Math.floor(Date.now() / 1000), extra: { alvo: respondeA ?? "" } }],
          "meta-" + (cfg.phoneNumberId || phoneNumberId),
          dono.wsId,
        ).catch(() => {});
        continue;
      }
      if (!msg.text) {
        if (!ehMidia) console.log(`📨 meta · ${msg.from} · tipo ${msg.type} (sem texto — ignorado)`);
        continue;
      }
      console.log(`📨 meta · ${msg.from} · "${msg.text.slice(0, 40)}" → ws ${dono.wsId.slice(0, 8)}`);
      // 📚 ARQUIVO da API Oficial. Diferente do Lite (que guarda histórico na UazAPI e a gente
      // consulta), aqui o NOSSO banco é a ÚNICA fonte: a Meta não devolve conversa passada.
      // Sem isto, a tela "WPP Api" não teria o que mostrar. Conta = "meta-<phoneNumberId>" pra
      // separar por número quando o workspace tiver mais de um.
      void arquivarMensagens(
        msg.from,
        [{ msg_id: msg.id, from_me: false, sender_name: msg.name || undefined, body: msg.text, msg_type: msg.type || "text", ts: Math.floor(Date.now() / 1000),
           // clique de botão / resposta citada: guarda o id da NOSSA mensagem — atribuição exata por template
           ...(respondeA ? { extra: { respondeA } } : {}) }],
        "meta-" + (cfg.phoneNumberId || phoneNumberId),
        dono.wsId,
      ).catch(() => {});
      // MESMA fila (e MESMA chave ws:phone) do LITE e do agendador de follow-up — senão o turno do
      // lead e um follow-up agendado rodariam CONCORRENTES e um apagaria a sessão do outro.
      // ⏳ O acúmulo pedido pelo nó do Agente IA vale também na Oficial — mas SÓ quando há conversa
      // de agente aberta com `acumularSeg`. Clique de botão, palavra-chave e todo o resto seguem
      // instantâneos como sempre (a Oficial nunca teve rajada, e um template não pode esperar).
      const corpoMeta = req.body;
      serializeByPhone(dono.wsId + ":" + msg.from, () => runWithWorkspace(dono.wsId, async () => {
        const seg = msg.type === "text" ? await acumuloDoAgente(msg.from).catch(() => 0) : 0;
        if (!seg) return processInbound(msg, corpoMeta, metaGw, "meta");
        if (respondeA) {
          // Na Oficial a marcação chega só como o ID da nossa mensagem; o texto está no arquivo.
          const alvo = await query<{ body: string }>("SELECT body FROM inbox_messages WHERE workspace_id=$1 AND msg_id=$2 LIMIT 1", [dono.wsId, respondeA]).catch(() => [] as Array<{ body: string }>);
          const txt = String(alvo[0]?.body ?? "").trim();
          if (txt) msg.citacao = { alvoId: respondeA, texto: txt };
        }
        juntarRajada(dono.wsId, msg, corpoMeta, metaGw, undefined, "meta", seg);
      }));
    }
  } catch (e: any) {
    console.error("meta webhook:", e?.message);
  }
  return reply.code(200).send({ ok: true });
});

// CRM: lista de contatos (busca + filtro comprador/carrinho/optout) e ficha de um contato.
app.get("/admin/contacts", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const res = await listContacts({
    search: q.search,
    filter: q.filter,
    tag: q.tag,
    limit: Number(q.limit),
    offset: Number(q.offset),
  });
  // Resolve os ids dos fluxos (flow_node_hits) para {id, name, exists}. exists=false = fluxo removido
  // (o chip não vira link no painel). O nome sai da config atual de automações.
  const nameById = new Map(loadAutomations().map((a) => [a.id, a.name || a.id]));
  const contacts = res.contacts.map((c) => {
    const flows = (c.flow_ids ?? []).map((id) => {
      const name = nameById.get(id);
      return { id, name: name ?? "(fluxo removido)", exists: !!name };
    });
    const { flow_ids, ...rest } = c; // não vaza os ids crus pro cliente
    void flow_ids;
    return { ...rest, flows };
  });
  return reply.send({ contacts, total: res.total });
});
// Sincroniza do WhatsApp (LITE): importa TODAS as conversas 1:1 como contatos + puxa as fotos.
// Resolve o "essa pessoa me chamou mas não está em Contatos" das conversas ANTIGAS (o webhook só
// captura mensagens novas). On-demand pelo botão do painel.
app.post("/admin/contacts/refresh-avatars", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const r = await syncLiteContacts({ token: config.uazapi.token, mediaBase: MEDIA_PUBLIC_BASE }).catch(() => ({ imported: 0, avatars: 0 }));
  return reply.send({ ok: true, imported: r.imported, avatars: r.avatars });
});
// Importa a AGENDA inteira do celular (GET /contacts da UazAPI — só quem o dono salvou; diferente
// do sync acima, que importa CONVERSAS). Opt-in pelo botão do painel; platform "agenda" marca a origem.
app.post("/admin/contacts/import-agenda", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  if (!config.uazapi.token) return reply.code(400).send({ error: "conecte o WhatsApp LITE primeiro" });
  try {
    const agenda = await liteAgendaContacts(config.uazapi.token);
    const importados = await bulkImportContacts(agenda, "agenda");
    return reply.send({ ok: true, total: agenda.length, importados });
  } catch (e: any) {
    return reply.code(502).send({ error: "não consegui ler a agenda: " + String(e?.message ?? e) });
  }
});
app.put("/admin/contacts/:phone", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return editarContatoHandler(String((req.params as any).phone || ""), req.body, reply);
});
app.delete("/admin/contacts/:phone", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return excluirContatoHandler(String((req.params as any).phone || ""), reply);
});
app.get("/admin/contacts/:phone", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const phone = String((req.params as any).phone || "");
  const d = await getContactDetail(phone);
  if (!d) return reply.code(404).send({ error: "contato não encontrado" });
  return reply.send(d);
});

// ═══ FICHA DO CONTATO (clique no nome da conversa) — ficha-contato.ts ═══════════════════════════
// Uma lógica só pro admin e pro cliente: o /app/* roda dentro do runWithWorkspace do cliente.
const fichaRotas = {
  async get(req: any, reply: any) {
    const f = await getFicha(String(req.params.phone || ""));
    if (!f) return reply.code(400).send({ error: "telefone inválido" });
    return reply.send(f);
  },
  async put(req: any, reply: any) {
    const r = await salvaFicha(String(req.params.phone || ""), req.body);
    if (r.erro) return reply.code(400).send({ error: r.erro });
    return reply.send({ ok: true, ...(await getFicha(String(req.params.phone || ""))) });
  },
  async postDoc(req: any, reply: any) {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: "envie o arquivo" });
    const q = req.query ?? {};
    const r = await salvaDoc(String(req.params.phone || ""), {
      tipo: String(q.tipo ?? ""), nome: String(q.nome ?? ""), mime: String(q.mime ?? "").split(";")[0].trim().toLowerCase(), buf: req.body,
    });
    if (r.erro) return reply.code(400).send({ error: r.erro });
    return reply.send({ ok: true, doc: r.doc });
  },
  async getDoc(req: any, reply: any) {
    const d = await lerDoc(String(req.params.phone || ""), String(req.params.id || ""));
    if (!d) return reply.code(404).send({ error: "documento não encontrado" });
    return reply
      .header("content-type", d.mime)
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `inline; filename="${encodeURIComponent(d.nome)}"`)
      .send(d.data);
  },
  async delDoc(req: any, reply: any) {
    const ok = await apagaDoc(String(req.params.phone || ""), String(req.params.id || ""));
    if (!ok) return reply.code(404).send({ error: "documento não encontrado" });
    return reply.send({ ok: true });
  },
  async cep(req: any, reply: any) {
    const r = await buscaCep(String(req.params.cep || ""));
    if (!r) return reply.code(404).send({ error: "CEP não encontrado" });
    return reply.send(r);
  },
};
for (const [metodo, caminho, h] of [
  ["GET", "/contacts/:phone/ficha", fichaRotas.get],
  ["PUT", "/contacts/:phone/ficha", fichaRotas.put],
  ["POST", "/contacts/:phone/docs", fichaRotas.postDoc],
  ["GET", "/contacts/:phone/docs/:id", fichaRotas.getDoc],
  ["DELETE", "/contacts/:phone/docs/:id", fichaRotas.delDoc],
  ["GET", "/cep/:cep", fichaRotas.cep],
] as const) {
  app.route({ method: metodo, url: "/admin" + caminho, handler: async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
    return h(req, reply);
  } });
  app.route({ method: metodo, url: "/app" + caminho, handler: async (req, reply) => {
    const ws = await clientWs(req, reply); if (!ws) return;
    if (metodo === "POST" && rateLimited("upload:" + ws, 60, 3_600_000)) return reply.code(429).send({ error: "muitos envios de arquivo seguidos — aguarde alguns minutos." });
    return runWithWorkspace(ws, () => h(req, reply));
  } });
}
// Segmentos do Disparador (rotas ESTÁTICAS vencem o :phone acima no roteador do Fastify).
app.get("/admin/contacts/segments", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(await segmentOptions());
});
app.get("/admin/contacts/segment", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  return reply.send({ contatos: await contactsForSegment({ origem: q.origem || undefined, tag: q.tag || undefined }) });
});

// Lista os grupos do número conectado (pro seletor do painel). MEMORIZADO no banco (config
// "groups-list"): a 1ª busca grava; das próximas o painel recebe NA HORA a lista memorizada e o
// motor CONFERE em 2º plano — grupo novo entra, grupo de que saiu some (a lista fresca substitui
// a antiga; o diff é implícito). Sobrevive a redeploy. ?refresh=1 = checagem profunda (direto no
// WhatsApp, ~10-30s) na hora — pro "↻ Atualizar" quando um grupo recém-criado ainda não aparece.
type GroupsSnap = { at: number; groups: Array<{ jid: string; name: string; participantCount?: number; isAnnounce?: boolean }> };
const sortGroups = (gs: GroupsSnap["groups"]) => gs.sort((a, b) => (a.name || a.jid).localeCompare(b.name || b.jid, "pt-BR"));
let groupsCache: { at: number; groups: GroupsSnap["groups"] } | null = null;
let adminGroupsRevalidating = false;
// Cache da lista de grupos POR NÚMERO (a lista é do aparelho, não da conta).
const groupsPorConta = new Map<string, GroupsSnap>();
app.get("/admin/groups", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const force = String((req.query as any)?.refresh ?? "") === "1";
  const wsAdmin = getPrimaryWorkspace();
  // 🔴 GRUPO É DO NÚMERO, NÃO DA CONTA. Sem `account` isto respondia SEMPRE pelo gateway
  // PRIMÁRIO — com 2 números Lite conectados, o seletor mostrava os grupos do outro número
  // (relatado 19/08: "aparecendo grupos que não são meus"). Pior: se um cliente já esteve
  // pareado na instância primária, os grupos dele apareciam aqui. Agora, quando o painel diz
  // de qual número quer, a resposta vem SÓ daquele — e o cache é por número.
  const contaPedida = String((req.query as any)?.account ?? "").trim();
  if (contaPedida && contaPedida !== "lite" && contaPedida !== "api") {
    const tok = resolveLiteToken(contaPedida);
    if (!tok) return reply.send({ groups: [] }); // número desconhecido → lista VAZIA, nunca a de outro
    const chave = "groups-list:" + contaPedida;
    const hit = groupsPorConta.get(contaPedida);
    if (!force && hit && Date.now() - hit.at < 60_000) return reply.send({ groups: hit.groups });
    try {
      const gs = await new UazapiGateway(config.uazapi.url, tok).listGroups(force);
      sortGroups(gs);
      groupsPorConta.set(contaPedida, { at: Date.now(), groups: gs });
      await saveConfigFor(wsAdmin, chave, { at: Date.now(), groups: gs });
      return reply.send({ groups: gs });
    } catch {
      const snap = getCachedFor<GroupsSnap>(wsAdmin, chave);
      return reply.send({ groups: snap?.groups ?? [] });
    }
  }
  try {
    if (!force) {
      if (groupsCache && Date.now() - groupsCache.at < 60_000) return reply.send({ groups: groupsCache.groups });
      const snap = getCachedFor<GroupsSnap>(wsAdmin, "groups-list");
      if (snap?.groups?.length) {
        groupsCache = { at: Date.now(), groups: snap.groups };
        if (!adminGroupsRevalidating) {
          adminGroupsRevalidating = true; // uma revalidação por vez — rajada de aberturas não empilha busca
          void gateway.listGroups()
            .then(async (fresh) => {
              sortGroups(fresh);
              groupsCache = { at: Date.now(), groups: fresh };
              await saveConfigFor(wsAdmin, "groups-list", { at: Date.now(), groups: fresh });
            })
            .catch(() => { /* falhou a conferência → mantém o memorizado */ })
            .finally(() => { adminGroupsRevalidating = false; });
        }
        return reply.send({ groups: snap.groups });
      }
    }
    // 1ª vez (nada memorizado) ou ↻ Atualizar: busca sincrona e memoriza.
    const groups = await gateway.listGroups(force);
    sortGroups(groups);
    groupsCache = { at: Date.now(), groups };
    await saveConfigFor(wsAdmin, "groups-list", { at: Date.now(), groups }).catch(() => {});
    return reply.send({ groups });
  } catch (e: any) {
    return reply.code(502).send({ error: "não consegui listar os grupos: " + e.message });
  }
});

// Tag universal em TODA importação de grupo — pra saber, no CRM, que o contato veio de um grupo.
const GROUP_IMPORT_TAG = "importado grupo";

// Importa os participantes de um grupo pro CRM (contatos) e marca com a tag escolhida + a universal.
// Body: { jid, tag }. Só participantes com telefone real entram (quem só expõe @lid é ignorado).
app.post("/admin/groups/import-contacts", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const jid = String(b?.jid ?? "");
  const tag = String(b?.tag ?? "").trim();
  if (!jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  if (!tag) return reply.code(400).send({ error: "informe o nome da tag" });
  try {
    // NOME resolvido em 2 fontes (agenda + pushName do histórico) — o /group/info vem com
    // DisplayName vazio pra TODO mundo (confirmado 06/08). Ver liteGroupMembersComNome.
    const token = resolveLiteToken(String(b?.account ?? "lite")) ?? config.uazapi.token;
    const membros = await liteGroupMembersComNome(token, jid);
    const info = await gateway.groupInfo(jid);
    const entries = membros.map((m) => ({ phone: m.phone, name: m.name }));
    const comNome = entries.filter((e) => e.name).length;
    const daAgenda = membros.filter((m) => m.fonte === "agenda").length;
    const doPerfil = membros.filter((m) => m.fonte === "perfil").length;
    // Bulk: 2 statements no total (não um loop de milhares). imported = contagem REAL de linhas.
    const imported = await bulkImportContacts(entries, "lite");
    await bulkAddContactTags(entries.map((e) => e.phone), [tag, GROUP_IMPORT_TAG], "group-import");
    // dispara o enriquecimento de fotos pros recém-importados (best-effort)
    scheduleEnrich(() => enrichAvatars({ token: config.uazapi.token, mediaBase: MEDIA_PUBLIC_BASE }));
    console.log(`👥 import "${info.name}": ${imported} contatos · ${comNome} com nome (${daAgenda} da agenda, ${doPerfil} do perfil)`);
    return reply.send({
      ok: true, imported, skipped: Math.max(0, info.participants.length - entries.length),
      group: info.name, tag, comNome, semNome: entries.length - comNome, daAgenda, doPerfil,
    });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message || "falha ao importar" });
  }
});

// Estado do número conectado (status/nome/foto/QR) — pro cabeçalho do painel. Cache curto.
let instCache: { at: number; data: unknown } | null = null;
app.get("/admin/instance", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  try {
    if (!instCache || Date.now() - instCache.at > 20_000) {
      instCache = { at: Date.now(), data: await gateway.instanceStatus() };
    }
    return reply.send(instCache.data);
  } catch (e: any) {
    return reply.code(502).send({ error: "não consegui ler o status: " + e.message });
  }
});

// ── LITE: adicionar número novo por QR (cria instância na UazAPI) ─────────────
interface LiteStored {
  token: string;
  name: string;
  noAuto?: boolean; // true = número conectado mas DORMENTE (não roda automação / não auto-responde)
}
let accountsCache: { at: number; data: unknown } | null = null;

app.post("/admin/lite/init", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  if (!config.uazapi.adminToken)
    return reply.code(400).send({ error: "UAZAPI_ADMIN_TOKEN não configurado no servidor (preencha o deploy/.env)" });
  const name = String((req.body as any)?.name || "").trim() || "ZapConverte";
  try {
    // Mesmo fluxo do cliente, sem limite de números (o dono conecta quantos quiser).
    const r = await iniciaLite(getCurrentWorkspace(), name, null);
    if ("limitReached" in r) return reply.code(403).send({ error: "limite de números atingido" }); // inalcançável (limite null) — só narrowing do TS
    return reply.send(r.qr);
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Liga/desliga a automação de um número LITE extra. noAuto=true → número dormente (recebe, não roda fluxo).
// A conta principal ("lite", do .env) sempre automatiza.
app.post("/admin/lite/automation", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const account = String(b?.account ?? "");
  const noAuto = !!b?.noAuto;
  if (!account || account === "lite") return reply.code(400).send({ error: "a conta principal sempre automatiza" });
  const stored = getCached<LiteStored[]>("lite-instances") ?? [];
  const it = stored.find((x) => idDaInstancia(x.token) === account);
  if (!it) return reply.code(404).send({ error: "conta não encontrada" });
  await saveConfig("lite-instances", stored.map((x) => (x.token === it.token ? { ...x, noAuto } : x)));
  accountsCache = null;
  return reply.send({ ok: true, account, noAuto });
});

app.get("/admin/lite/status", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const alvo = String(q?.account ?? q?.token ?? "");
  if (!alvo) return reply.code(400).send({ error: "informe a conta" });
  const token = tokenDoWorkspace(getPrimaryWorkspace(), alvo);
  if (!token) return reply.code(404).send({ error: "conta não encontrada" });
  try {
    const st = await liteInstanceStatus(token);
    // Pendente espelhou → PROMOVE: é neste poll do modal que a conta ganha a bolinha.
    if (st.status === "connected") {
      const p = (getCached<LitePending[]>("lite-pending") ?? []).find((x) => x.token === token);
      if (p) await promoteLitePending(p, getCurrentWorkspace());
    }
    return reply.send({ ...st, token: undefined, account: idDaInstancia(token) });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// ── LIMPAR NÚMEROS OFFLINE (uma ação só) ─────────────────────────────────────
// Bolinha offline acumula: instância extra que o dono não usa mais, e a PRIMÁRIA que ficou sem
// aparelho. Os dois casos precisam de tratamento DIFERENTE:
//  • extra (lite-xxxx) → apaga de verdade (libera o slot da assinatura na UazAPI);
//  • primária ("lite", token do .env) → NÃO dá pra apagar (é o remetente padrão do motor). O que
//    dá é ESQUECER a identidade velha: a UazAPI guarda o último perfil pareado, então a bolinha
//    continuava mostrando nome e foto de quem esteve ali por último (no caso do dono, uma
//    CLIENTE — resíduo do incidente de 16/08). Esquecendo, ela vira "Número principal ·
//    desconectado" e o "Reconectar por QR" segue funcionando.
app.post("/admin/lite/limpar-offline", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const removidas: string[] = [];
  const avisos: string[] = [];
  let esqueceuPrimaria = false;

  const stored = getCached<LiteStored[]>("lite-instances") ?? [];
  const restantes: LiteStored[] = [];
  for (const it of stored) {
    const st = await liteInstanceStatus(it.token).catch(() => null);
    if (st?.status === "connected") { restantes.push(it); continue; }
    // Instância de CLIENTE que caiu aqui não é apagada por engano: devolver é com o Desvincular.
    const dono = await lookupWorkspaceByToken(it.token).catch(() => null);
    if (dono && dono !== getPrimaryWorkspace()) {
      restantes.push(it);
      avisos.push(`"${st?.name || it.name || "número"}" é de um CLIENTE — use Desvincular, não removi.`);
      continue;
    }
    try { await deleteLiteInstance(it.token); } catch (e: any) { avisos.push("a UazAPI reclamou ao apagar: " + e.message); }
    await removeInstance(it.token).catch(() => {});
    removidas.push(st?.name || it.name || idDaInstancia(it.token));
  }
  if (removidas.length) { await saveConfig("lite-instances", restantes); }

  // Primária offline → esquece a identidade velha (não apaga o token do .env).
  const stPrim = await liteInstanceStatus(config.uazapi.token).catch(() => null);
  if (stPrim && stPrim.status !== "connected") {
    const esquecidos = new Set(getCached<string[]>("lite-esquecidos") ?? []);
    if (!esquecidos.has(config.uazapi.token)) {
      esquecidos.add(config.uazapi.token);
      await saveConfig("lite-esquecidos", [...esquecidos]);
      esqueceuPrimaria = true;
    }
  }
  accountsCache = null;
  return reply.send({ ok: true, removidas, esqueceuPrimaria, avisos });
});

// Remove um número LITE: apaga a instância na UazAPI (libera o slot da assinatura)
// e tira da config. A conta principal ("lite", do .env) não sai por aqui.
app.post("/admin/lite/remove", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const account = String((req.body as any)?.account ?? "");
  if (!account || account === "lite")
    return reply.code(400).send({ error: "essa é a conta principal — não dá pra remover por aqui" });
  const stored = getCached<LiteStored[]>("lite-instances") ?? [];
  const it = stored.find((x) => idDaInstancia(x.token) === account);
  if (!it) return reply.code(404).send({ error: "conta não encontrada" });
  let warn = "";
  try {
    await deleteLiteInstance(it.token);
  } catch (e: any) {
    warn = "removida do painel, mas a UazAPI reclamou ao apagar a instância: " + e.message;
  }
  await saveConfig("lite-instances", stored.filter((x) => x.token !== it.token));
  await removeInstance(it.token).catch(() => {}); // tira do roteamento (senão inbound órfão do número removido)
  accountsCache = null;
  return reply.send({ ok: true, warn });
});

// DESVINCULAR (super-admin): tira do painel do dono um WhatsApp de CLIENTE que caiu na conta
// dele (incidente 16/08). NÃO apaga a instância na UazAPI (a sessão do cliente continua viva) —
// só corrige a atribuição: remove da config do primário e, se o banco souber o dono verdadeiro,
// devolve a bolinha pro workspace certo. Assim o cliente recupera o número na conta DELE.
app.post("/admin/lite/desvincular", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const account = String((req.body as any)?.account ?? "");
  if (!account || account === "lite") return reply.code(400).send({ error: "a conta principal não é desvinculável" });
  const primario = getPrimaryWorkspace();
  const stored = getCachedFor<LiteStored[]>(primario, "lite-instances") ?? [];
  const it = stored.find((x) => idDaInstancia(x.token) === account);
  if (!it) return reply.code(404).send({ error: "conta não encontrada" });
  const dono = await lookupWorkspaceByToken(it.token).catch(() => null);
  // tira do primário (some da vista do super-admin), SEM tocar na UazAPI (não desconecta o cliente)
  await saveConfigFor(primario, "lite-instances", stored.filter((x) => x.token !== it.token));
  let devolvido = false;
  if (dono && dono !== primario) {
    const doDono = (getCachedFor<LiteStored[]>(dono, "lite-instances") ?? []).filter((x) => x.token !== it.token);
    doDono.push({ token: it.token, name: it.name });
    await saveConfigFor(dono, "lite-instances", doDono);
    devolvido = true;
  }
  accountsCache = null;
  console.log(`🧹 desvincular: token …${it.token.slice(-6)} tirado do primário${devolvido ? ` e devolvido ao ws ${dono!.slice(0, 8)}` : " (dono no banco desconhecido)"}`);
  return reply.send({ ok: true, devolvido });
});

// Todas as contas do painel (LITE primária + LITE extras + API) — pro seletor de bolinhas.
app.get("/admin/accounts", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  if (accountsCache && Date.now() - accountsCache.at < 12_000) return reply.send(accountsCache.data);
  const accounts: any[] = [];
  try {
    const p = await gateway.instanceStatus();
    // "Esquecida": a primária ficou sem aparelho e o dono mandou limpar. A UazAPI ainda devolve o
    // ÚLTIMO perfil pareado — mostrar isso é errado (já apareceu nome e foto de CLIENTE aqui).
    // Enquanto não reconectar, a bolinha é neutra; ao reconectar, a marca cai sozinha.
    const esquecida = (getCached<string[]>("lite-esquecidos") ?? []).includes(config.uazapi.token);
    const conectada = p.status === "connected";
    if (esquecida && conectada) {
      await saveConfig("lite-esquecidos", (getCached<string[]>("lite-esquecidos") ?? []).filter((t) => t !== config.uazapi.token));
    }
    // Esquecida E offline → a bolinha SOME de vez (pedido do dono 18/08: "quero é remover ela
    // daqui do meu perfil" — o teste da cliente estava acabando e tanto faz o número cair).
    // O token do .env continua vivo por baixo: o "+" → Conectar por QR oferece a reconexão da
    // primária, e ao reconectar a marca de esquecida cai sozinha e a bolinha volta.
    if (!(esquecida && !conectada)) {
      accounts.push({
        id: "lite", type: "LITE",
        name: p.profileName || p.name || "WhatsApp",
        number: p.number,
        avatar: p.profilePicUrl,
        connected: conectada,
      });
    }
  } catch {
    /* primária indisponível */
  }
  const stored = getCached<LiteStored[]>("lite-instances") ?? [];
  const primario = getPrimaryWorkspace();
  for (const it of stored) {
    // `alheia` = o banco (tabela instances) diz que este token é de OUTRO workspace — ou seja, é o
    // WhatsApp de um CLIENTE que caiu na conta do super-admin (incidente 16/08). Marca pra UI avisar
    // e oferecer "Desvincular" (devolve pro dono, sem apagar a sessão do cliente).
    const dono = await lookupWorkspaceByToken(it.token).catch(() => null);
    const alheia = !!dono && dono !== primario;
    try {
      const s = await liteInstanceStatus(it.token);
      if (s.status !== "connected" && !s.number) continue; // nunca espelhou (QR abandonado do fluxo antigo) — sem bolinha
      accounts.push({ id: "lite-" + it.token.slice(0, 8), type: "LITE", name: s.name || it.name || "WhatsApp", number: s.number, avatar: s.avatar, connected: s.status === "connected", noAuto: !!it.noAuto, alheia });
    } catch {
      accounts.push({ id: "lite-" + it.token.slice(0, 8), type: "LITE", name: it.name || "WhatsApp", connected: false, noAuto: !!it.noAuto, alheia });
    }
  }
  // Pendente que espelhou com o modal fechado → promove aqui (senão a bolinha só nasceria no próximo "+").
  for (const p of getCached<LitePending[]>("lite-pending") ?? []) {
    const s = await liteInstanceStatus(p.token).catch(() => null);
    if (s?.status !== "connected") continue;
    await promoteLitePending(p, getCurrentWorkspace());
    accounts.push({ id: idDaInstancia(p.token), type: "LITE", name: s.name || p.name, number: s.number, avatar: s.avatar, connected: true });
  }
  const meta = getCached<any>("meta-official");
  if (meta?.connected) accounts.push({ id: "api", type: "API", name: meta.verifiedName || meta.displayNumber || "API Oficial", number: meta.displayNumber, avatar: await fotoPerfilApi(meta), connected: true });
  const data = { accounts: unificaContasPorNumero(accounts) };
  accountsCache = { at: Date.now(), data };
  return reply.send(data);
});

// ── Inbox ao vivo (LITE): conversas + mensagens + responder ───────────────────
// Resolve o token da conta ativa: "lite" = número primário; "lite-xxxx" = instância criada por QR.
function resolveLiteToken(accountId: string): string | null {
  if (!accountId || accountId === "lite") return config.uazapi.token;
  const stored = getCached<LiteStored[]>("lite-instances") ?? [];
  const it = stored.find((x) => "lite-" + x.token.slice(0, 8) === accountId);
  return it?.token ?? null;
}

// TODOS os tokens Lite (primário do .env + extras por QR). Usado pra ligar o webhook em cada instância.
function allLiteTokens(): string[] {
  const tokens = new Set<string>();
  if (config.uazapi.token) tokens.add(config.uazapi.token);
  for (const it of getCached<LiteStored[]>("lite-instances") ?? []) if (it.token) tokens.add(it.token);
  return [...tokens];
}
// Liga o webhook em TODAS as instâncias Lite (não só uma) — roda no boot. fromMe permitido.
async function ensureWebhooks(): Promise<void> {
  const tokens = allLiteTokens();
  if (!tokens.length) return;
  for (const t of tokens) {
    try {
      await liteSetWebhook(t, UAZAPI_WEBHOOK_URL, false);
      console.log(`🔗 webhook ligado na instância …${t.slice(-6)} → ${UAZAPI_WEBHOOK_URL}`);
    } catch (e: any) {
      console.error(`⚠️  webhook instância …${t.slice(-6)}:`, e.message);
    }
  }
}

app.get("/admin/inbox/chats", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const account = String((req.query as any)?.account ?? "lite");
  const token = resolveLiteToken(account);
  if (!token) return reply.code(404).send({ error: "conta não encontrada" });
  // limit padrão 50 (poll de 12s, leve); a BUSCA do painel pede até 3000 pra cobrir todas.
  const limit = Math.max(1, Math.min(Number((req.query as any)?.limit) || 50, 3000));
  try {
    const mencoes = getCached<Record<string, string>>("chats-mencao") ?? {};
    const fixados = new Set(getCached<string[]>("chats-fixados:" + account) ?? []);
    const chats = aplicaNomesManuais((await liteChats(token, limit)).map((c) => ({ ...c, mencionado: !!mencoes[c.id], pinned: fixados.has(c.id) })), await nomesManuais());
    return reply.send({ chats });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Junta o que a UazAPI ainda tem (fresco, com mídia) com o NOSSO arquivo (histórico completo).
// Dedup por id; ordena do mais antigo pro mais novo (é como o painel desenha).
async function mensagensComArquivo(token: string, chatid: string, account: string, wsId: string): Promise<any[]> {
  let vivas: any[] = [];
  let erroVivo: Error | null = null;
  try { vivas = await liteMessages(token, chatid, 300); } catch (e: any) { erroVivo = e; }
  // Arquiva o que veio (best-effort) — é assim que o histórico vira nosso, dia após dia.
  if (vivas.length) {
    void arquivarMensagens(chatid, vivas.map((m) => ({
      msg_id: m.id, mid: m.mid, from_me: m.fromMe, sender_name: m.senderName,
      body: m.text ?? "", msg_type: m.type, ts: m.timestamp,
      ...(m.local ? { extra: { local: m.local } } : {}),
    })), account, wsId).catch(() => {});
  }
  const doArquivo = await lerMensagensArquivadas(chatid, 500, wsId);
  if (!doArquivo.length) {
    if (erroVivo && !vivas.length) throw erroVivo; // sem arquivo E sem API → mostra o erro real
    return vivas;
  }
  const porId = new Map<string, any>();
  // O arquivo entra primeiro; a versão VIVA sobrescreve (tem status fresco) — mas o EXTRA do
  // arquivo (fileURL LOCAL cacheada, waveform, duração) é overlay por cima: é o que faz a mídia
  // abrir instantânea sem falar com a uazapi de novo.
  const extraDe = new Map<string, any>();
  for (const a of doArquivo) {
    if (a.extra) extraDe.set(a.msg_id, a.extra);
    porId.set(a.msg_id, {
      id: a.msg_id, mid: a.mid, text: a.body, fromMe: a.from_me, senderName: a.sender_name,
      type: a.msg_type, timestamp: a.ts, arquivada: true,
      fileURL: (a.extra as any)?.fileURL, waveform: (a.extra as any)?.waveform,
      durationSec: Number((a.extra as any)?.seconds) || undefined,
      citacao: (a.extra as any)?.citacao,
      origem: (a.extra as any)?.origem,
      autor: (a.extra as any)?.autor,
      local: (a.extra as any)?.local,
      anuncio: (a.extra as any)?.anuncio,
    });
  }
  for (const v of vivas) {
    const ex: any = extraDe.get(v.id);
    porId.set(v.id, ex ? { ...v, fileURL: ex.fileURL ?? v.fileURL, waveform: v.waveform ?? ex.waveform, durationSec: v.durationSec ?? (Number(ex.seconds) || undefined), citacao: v.citacao ?? ex.citacao, origem: ex.origem, autor: ex.autor, local: v.local ?? ex.local, anuncio: (v as any).anuncio ?? ex.anuncio } : v);
  }
  return Array.from(porId.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// Mesma extração de citação do uaz.ts, para o caminho do WEBHOOK — que monta a mensagem à mão
// e não passa pelo mapeamento de /message/find.
function citacaoDoConteudo(c: any): { alvoId?: string; texto?: string; tipo?: string } | undefined {
  const ci = c?.contextInfo;
  const qm = ci?.quotedMessage;
  if (!ci || !qm || typeof qm !== "object") return undefined;
  const texto = String(qm.conversation ?? qm.extendedTextMessage?.text ?? qm.imageMessage?.caption
    ?? qm.videoMessage?.caption ?? qm.documentMessage?.fileName ?? "").trim();
  const tipo = qm.imageMessage ? "imagem" : qm.videoMessage ? "vídeo"
    : (qm.audioMessage || qm.pttMessage) ? "áudio" : qm.stickerMessage ? "figurinha"
    : qm.documentMessage ? "documento" : qm.locationMessage ? "localização" : undefined;
  const alvoId = String(ci.stanzaID ?? ci.stanzaId ?? "") || undefined;
  if (!texto && !tipo && !alvoId) return undefined;
  return { alvoId, texto: texto || undefined, tipo };
}

// DIAGNÓSTICO: o JSON CRU de mensagens de um tipo específico numa conversa. Nasceu do caso da
// ENQUETE (17/08): sem ver o `content` real, adivinhar nome de campo é chute. Só admin, e filtrado
// por tipo pra não despejar a conversa inteira na tela.
// Uso: /api/inbox/raw?account=lite-xxxx&chatid=...@g.us&tipo=poll
app.get("/admin/inbox/raw", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const token = resolveLiteToken(String(q?.account ?? "lite"));
  const chatid = String(q?.chatid ?? "");
  const tipo = String(q?.tipo ?? "poll");
  if (!token || !chatid) return reply.code(400).send({ error: "informe conta e chatid" });
  try {
    const r: any = await liteRawMessages(token, chatid, 60);
    const todas: any[] = r?.messages ?? [];
    const casam = todas.filter((m) => new RegExp(tipo, "i").test(String(m?.messageType ?? "")));
    return reply.send({
      tiposNaConversa: [...new Set(todas.map((m) => String(m?.messageType ?? "?")))],
      encontradas: casam.length,
      amostra: casam.slice(0, 3),
    });
  } catch (e: any) {
    return reply.code(502).send({ error: String(e?.message ?? e) });
  }
});
app.get("/admin/inbox/messages", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const token = resolveLiteToken(String((req.query as any)?.account ?? "lite"));
  const chatid = String((req.query as any)?.chatid ?? "");
  if (!token || !chatid) return reply.code(400).send({ error: "informe conta e chatid" });
  try {
    const account = String((req.query as any)?.account ?? "lite");
    return reply.send({ messages: await mensagensComArquivo(token, chatid, account, getCurrentWorkspace()) });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// 📣 Marcar TODOS do grupo direto do chat (reusa o mentionAll dos fluxos). hidden=true (padrão)
// notifica todo mundo SEM poluir o texto com @; hidden=false anexa os @número visíveis.
app.post("/admin/inbox/mention-all", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const groupJid = String(b?.groupJid ?? "");
  const text = String(b?.text ?? "").trim();
  const hidden = b?.hidden !== false;
  if (!token || !groupJid.endsWith("@g.us")) return reply.code(400).send({ error: "informe conta e o JID do grupo (@g.us)" });
  if (hidden && !text) return reply.code(400).send({ error: "menção oculta precisa de uma mensagem (senão sai um balão vazio)" });
  try {
    const gw = new UazapiGateway(config.uazapi.url, token);
    await gw.mentionAll(groupJid, text, { hidden });
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// 📌 Fixa/desafixa uma mensagem (nativo da UazAPI — aparece fixada no WhatsApp de verdade).
app.post("/admin/inbox/pin", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const id = String(b?.id ?? "");
  if (!token || !id) return reply.code(400).send({ error: "informe conta e id" });
  const dur = [1, 7, 30].includes(Number(b?.duration)) ? Number(b.duration) : 7;
  try {
    await liteMessagePin(token, id, b?.pin !== false, dur);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// ⭐ Favoritas: marcador INTERNO do painel (o WhatsApp não tem API de favoritar) — guardado no
// config do workspace (servidor, não navegador — regra do dono). Cap de 500 pra não inchar.
app.get("/admin/inbox/favoritas", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const mapa = getCached<Record<string, any>>("msgs-favoritas") ?? {};
  return reply.send({ favoritas: mapa });
});
// Espelho admin do rastreio da conversa (o cliente usa /app/inbox/rastreio; admin não é remapeado).
app.get("/admin/inbox/rastreio", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const bruto = String((req.query as any)?.phone ?? "");
  const phone = toWhatsAppNumber(bruto) || bruto.replace(/\D/g, "");
  if (!phone) return reply.code(400).send({ error: "informe o telefone" });
  return reply.send(montaRastreio(await getContactFields(phone)));
});
app.post("/admin/inbox/favorita", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const id = String(b?.id ?? "");
  if (!id) return reply.code(400).send({ error: "informe o id da mensagem" });
  const mapa = { ...(getCached<Record<string, any>>("msgs-favoritas") ?? {}) };
  if (b?.on === false) delete mapa[id];
  else {
    const chaves = Object.keys(mapa);
    if (chaves.length >= 500) delete mapa[chaves[0]]; // estourou o teto → derruba a mais antiga
    mapa[id] = {
      chatid: String(b?.chatid ?? ""), chatName: String(b?.chatName ?? "").slice(0, 60),
      texto: String(b?.texto ?? "").slice(0, 140), fromMe: Boolean(b?.fromMe), quando: new Date().toISOString(),
    };
  }
  await saveConfig("msgs-favoritas", mapa);
  return reply.send({ ok: true, total: Object.keys(mapa).length });
});

// Abriu a conversa no painel → marca como LIDA na UazAPI (o contador zera no servidor e
// sobrevive ao refresh; sem isto o "não lida" era só estado do navegador e voltava sempre).
app.post("/admin/inbox/read", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const chatid = String(b?.chatid ?? "");
  if (!token || !chatid) return reply.code(400).send({ error: "informe conta e chatid" });
  try {
    await liteChatRead(token, chatid);
    await limparMencao(getCurrentWorkspace(), chatid).catch(() => {});
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

app.post("/admin/inbox/send", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const to = String(b?.to ?? "");
  const text = String(b?.text ?? "");
  if (!token || !to || !text.trim()) return reply.code(400).send({ error: "faltam dados (conta, destino, texto)" });
  try {
    const r = await liteSend(token, to, text, b?.mentions ? String(b.mentions) : undefined, b?.replyId ? String(b.replyId) : undefined); await aposEnvioManual(to, r.id, await autorDaSessao(req));
    return reply.send({ ok: true, id: r.id });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Reage a uma mensagem com um emoji.
app.post("/admin/inbox/react", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const id = String(b?.id ?? "");
  if (!token || !id) return reply.code(400).send({ error: "faltam dados (conta, id)" });
  try {
    await liteReact(token, id, String(b?.emoji ?? ""));
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Apaga uma mensagem (pra todos).
app.post("/admin/inbox/delete", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const id = String(b?.id ?? "");
  if (!token || !id) return reply.code(400).send({ error: "faltam dados (conta, id)" });
  try {
    await liteDeleteMessage(token, id);
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Baixa a mídia de uma mensagem (imagem/áudio/figurinha/vídeo) → { fileURL, mimetype }.
// ── CACHE-THROUGH DE MÍDIA (06/08): baixar da UazAPI só UMA vez ──────────────────────────────
// Antes, cada abertura de conversa rebaixava a mídia do servidor da uazapi (lento, e o link deles
// expira). Agora: 1ª vez → busca a URL na uazapi, PUXA os bytes (até 8MB) pro nosso banco (tabela
// media, servida por /media/* com cache imutável de 1 ano) e grava a URL LOCAL no arquivo da
// conversa (inbox_messages.extra). Aberturas seguintes nem falam com a uazapi. >8MB (vídeo grande)
// → devolve a URL da uazapi como antes (não incha o banco).
const MIDIA_CACHE_MAX = 8 * 1024 * 1024;
const midiaEmCurso = new Set<string>(); // anti-estouro: 2 abas pedindo a mesma mídia = 1 download
async function downloadComCache(token: string, mid: string, msgIdCurto: string, wsId: string): Promise<{ fileURL: string; mimetype?: string }> {
  // 1. Já temos no arquivo? (a URL local nunca expira)
  const linhas = await query<{ extra: any }>(
    "SELECT extra FROM inbox_messages WHERE workspace_id=$1 AND msg_id=$2 LIMIT 1", [wsId, msgIdCurto],
  ).catch(() => [] as any[]);
  const extra = linhas[0]?.extra ?? {};
  if (extra.fileURL) return { fileURL: String(extra.fileURL), mimetype: extra.mimetype ? String(extra.mimetype) : undefined };

  // 2. Busca na uazapi (como antes)
  const r = await liteMessageDownload(token, mid);
  const urlUaz = String((r as any)?.fileURL ?? "");
  const mime = String((r as any)?.mimetype ?? "");
  if (!urlUaz) return r as any;

  // 3. Puxa os bytes pro NOSSO banco (best-effort; falhou → devolve a URL da uazapi mesmo)
  const chave = wsId + ":" + msgIdCurto;
  if (!midiaEmCurso.has(chave)) {
    midiaEmCurso.add(chave);
    try {
      const resp = await fetch(urlUaz);
      const tam = Number(resp.headers.get("content-length") || 0);
      if (resp.ok && (!tam || tam <= MIDIA_CACHE_MAX)) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length <= MIDIA_CACHE_MAX) {
          const mediaId = "wa-" + msgIdCurto.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
          await saveMedia(mediaId, mime || resp.headers.get("content-type") || "application/octet-stream", buf, wsId);
          const local = MEDIA_PUBLIC_BASE + "/media/" + mediaId;
          // UPSERT (não UPDATE): se a mensagem ainda não estiver arquivada, o UPDATE pegaria 0
          // linhas e a mídia seria rebaixada da uazapi em TODA abertura (achado da auditoria).
          await query(
            `INSERT INTO inbox_messages(workspace_id, account, chat_id, msg_id, mid, extra)
             VALUES($1,'lite','',$2,$3,$4::jsonb)
             ON CONFLICT (workspace_id, msg_id) DO UPDATE SET extra = inbox_messages.extra || EXCLUDED.extra`,
            [wsId, msgIdCurto, mid, JSON.stringify({ fileURL: local, mimetype: mime })],
          ).catch(() => {});
          return { fileURL: local, mimetype: mime };
        }
      }
    } catch { /* segue com a URL da uazapi */ }
    finally { midiaEmCurso.delete(chave); }
  }
  return { fileURL: urlUaz, mimetype: mime };
}

app.get("/admin/inbox/download", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const token = resolveLiteToken(String(q?.account ?? "lite"));
  const id = String(q?.id ?? "");
  if (!token || !id) return reply.code(400).send({ error: "faltam dados (conta, id)" });
  try {
    const curto = id.includes(":") ? id.split(":").pop()! : id;
    return reply.send(await downloadComCache(token, id, curto, getCurrentWorkspace()));
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// Participantes de um grupo (pro seletor de "@" no inbox).
app.get("/admin/inbox/participants", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const token = resolveLiteToken(String(q?.account ?? "lite"));
  const jid = String(q?.jid ?? "");
  if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  try {
    return reply.send({ participants: await liteGroupParticipants(token, jid) });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// ── Modal "Dados da conversa" (estilo WhatsApp) + fixar conversas ─────────────
// Ficha do grupo: descrição, criador, data de criação e membros (pro modal do painel).
app.get("/admin/inbox/group-info", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  const token = resolveLiteToken(String(q?.account ?? "lite"));
  const jid = String(q?.chatid ?? "");
  if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  try { return reply.send(await liteGroupFicha(token, jid)); }
  catch (e: any) { return reply.code(502).send({ error: e.message }); }
});
app.post("/admin/inbox/group-add", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const jid = String(b?.chatid ?? "");
  const numbers = (Array.isArray(b?.numbers) ? b.numbers : []).map((n: any) => String(n).replace(/\D/g, "")).filter((n: string) => n.length >= 8);
  if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  if (!numbers.length) return reply.code(400).send({ error: "informe ao menos um número com DDD" });
  try { return reply.send(await liteGroupAdd(token, jid, numbers)); }
  catch (e: any) { return reply.code(502).send({ error: e.message }); }
});
app.post("/admin/inbox/group-leave", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const jid = String(b?.chatid ?? "");
  if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  try { await liteGroupLeave(token, jid); return reply.send({ ok: true }); }
  catch (e: any) { return reply.code(502).send({ error: e.message }); }
});
// Ação sobre UM membro (menu do modal): promote (vira admin) / demote (sai de admin) / remove (sai do grupo).
app.post("/admin/inbox/group-member", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const jid = String(b?.chatid ?? "");
  const action = String(b?.action ?? "");
  const participant = String(b?.participant ?? "").replace(/\D/g, "");
  if (!token || !jid.endsWith("@g.us")) return reply.code(400).send({ error: "grupo inválido" });
  if (!["promote", "demote", "remove"].includes(action) || !participant) return reply.code(400).send({ error: "ação inválida" });
  try { await liteGroupMember(token, jid, action as "promote" | "demote" | "remove", participant); return reply.send({ ok: true }); }
  catch (e: any) { return reply.code(502).send({ error: e.message }); }
});
// Fixa/desafixa uma conversa no topo da lista (por conta; teto de 10, igual o WhatsApp).
// Guardado em config nossa ("chats-fixados:<conta>") — não mexe no estado do app do celular.
const PIN_MAX = 10;
app.post("/admin/inbox/chat-pin", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const account = String(b?.account ?? "lite");
  const chatid = String(b?.chatid ?? "");
  if (!chatid) return reply.code(400).send({ error: "informe a conversa" });
  const key = "chats-fixados:" + account;
  const lista = (getCached<string[]>(key) ?? []).filter((x) => x !== chatid);
  if (b?.pin) {
    if (lista.length >= PIN_MAX) return reply.code(400).send({ error: `Você já tem ${PIN_MAX} conversas fixadas — desafixe uma pra fixar esta.` });
    lista.unshift(chatid);
  }
  await saveConfig(key, lista);
  return reply.send({ ok: true, pinned: !!b?.pin });
});

app.post("/admin/inbox/send-media", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const to = String(b?.to ?? "");
  const type = String(b?.type ?? "image");
  const file = String(b?.file ?? "");
  if (!token || !to || !file) return reply.code(400).send({ error: "faltam dados (conta, destino, arquivo)" });
  try {
    const r = await liteSendMedia(token, to, type, file, b?.caption); await aposEnvioManual(to, r.id, await autorDaSessao(req));
    return reply.send({ ok: true, id: r.id });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// ── Marcar todos num grupo ────────────────────────────────────────────────────
app.post("/admin/groups/mention-all", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  const jid = String(b?.jid ?? "");
  const text = String(b?.text ?? "");
  if (!token || !jid.endsWith("@g.us") || !text.trim())
    return reply.code(400).send({ error: "faltam dados (conta, grupo válido, texto)" });
  try {
    const r = await liteMentionAll(token, jid, text, b?.hidden !== false);
    return reply.send({ ok: true, count: r.count, id: r.id });
  } catch (e: any) {
    return reply.code(502).send({ error: e.message });
  }
});

// ── Criar grupos em massa (job assíncrono com delay) ──────────────────────────
interface BulkJob {
  total: number;
  done: number;
  created: Array<{ jid: string; name: string }>;
  errors: string[];
  running: boolean;
}
const bulkJobs = new Map<string, BulkJob>();

app.post("/admin/groups/bulk-create", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  const token = resolveLiteToken(String(b?.account ?? "lite"));
  if (!token) return reply.code(404).send({ error: "conta não encontrada" });
  const names: string[] = Array.isArray(b?.names) ? b.names.map((n: any) => String(n).trim()).filter(Boolean) : [];
  if (!names.length) return reply.code(400).send({ error: "informe pelo menos um nome de grupo" });
  const admins: string[] = Array.isArray(b?.admins) ? b.admins.map((n: any) => String(n).replace(/\D/g, "")).filter(Boolean) : [];
  const description = String(b?.description ?? "");
  const image = String(b?.image ?? "");
  const delayMs = Math.max(0, Math.min(Number(b?.delaySec) || 0, 600)) * 1000;
  const jobId = "bulk-" + Date.now();
  const job: BulkJob = { total: names.length, done: 0, created: [], errors: [], running: true };
  bulkJobs.set(jobId, job);
  setImmediate(async () => {
    // A própria conta já entra como criadora/admin — tira ela da lista de add/promote
    // (comparando pelos últimos 8 dígitos, pois o JID BR pode não ter o 9º dígito).
    const owner = admins.length ? await liteInstanceOwner(token) : "";
    const ownerL8 = owner.slice(-8);
    const others = admins.filter((a) => !ownerL8 || a.slice(-8) !== ownerL8);
    for (const name of names) {
      try {
        const jid = await liteCreateGroup(token, name, others);
        if (jid) {
          if (description) await liteGroupSetDescription(token, jid, description).catch(() => {});
          if (image) {
            try { await liteGroupSetImage(token, jid, image); }
            catch (e: any) { job.errors.push(`${name}: foto não aplicada (${e.message})`); }
          }
          if (others.length) {
            await new Promise((r) => setTimeout(r, 1500)); // deixa os membros assentarem antes de promover
            const pr = await liteGroupPromote(token, jid, others);
            if (pr.failed.length) job.errors.push(`${name}: não virou admin → ${pr.failed.map((f) => `${f.number} (${f.error})`).join(" · ")}`);
          }
          job.created.push({ jid, name });
        } else {
          job.errors.push(`${name}: sem JID de retorno`);
        }
      } catch (e: any) {
        job.errors.push(`${name}: ${e.message}`);
      }
      job.done++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
    job.running = false;
  });
  return reply.send({ ok: true, jobId, total: names.length });
});

app.get("/admin/groups/bulk-status", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const job = bulkJobs.get(String((req.query as any)?.jobId ?? ""));
  if (!job) return reply.code(404).send({ error: "job não encontrado" });
  return reply.send(job);
});

// Resolve um link de convite → {jid, name}, sem entrar no grupo.
app.post("/admin/groups/resolve", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const invite = String((req.body as any)?.invite ?? "").trim();
  if (!invite) return reply.code(400).send({ error: "informe o link de convite" });
  const info = await gateway.inviteInfo(invite);
  if (!info) return reply.code(400).send({ error: "link de convite inválido ou não encontrado" });
  return reply.send(info);
});

async function processEvent(ev: NormalizedEvent): Promise<void> {
  if (ev.contact.phone) {
    await upsertContact(ev.contact.phone, ev.contact.name, ev.platform, undefined, ev.contact.email);
    if (await isOptedOut(ev.contact.phone)) {
      console.log(`🚫 ${ev.contact.phone} optou por sair — automação pulada`);
      await recordEvent(ev.contact.phone, ev.platform, ev.event, ev.product?.name, ev.amount, undefined, ev.product?.id);
      return;
    }
  }
  await recordEvent(ev.contact.phone, ev.platform, ev.event, ev.product?.name, ev.amount, undefined, ev.product?.id);
  const automations = loadAutomations();
  // withEchoGuard: se um fluxo Kiwify avisar (notify) o dono durante uma escuta de lembrete, o eco é suprimido.
  // Fluxo com NÚMERO escolhido no gatilho envia por ele; os sem número seguem pelo padrão.
  const semConta = automations.filter((a: any) => !String(a.conta ?? "").trim());
  await runAutomationsFor(ev, withEchoGuard(gateway), semConta);
  for (const a of automations.filter((x: any) => String(x.conta ?? "").trim())) {
    const gwA = gatewayDoWorkspace(getCurrentWorkspace(), String((a as any).conta));
    if (!gwA) { console.error(`🚫 fluxo ${a.id}: o número escolhido no gatilho não está conectado — NÃO enviei`); continue; }
    await runAutomationsFor(ev, gwA, [a]);
  }
}

// ═══ GATILHO POR WEBHOOK (conector universal) ════════════════════════════════════════════════
// Qualquer sistema de fora (formulário de site, CRM, n8n, Zapier…) chama a URL DO FLUXO e ele
// dispara. É o que permite "lead preencheu o formulário → manda WhatsApp na hora".
//   POST /webhooks/fluxo/<id-do-fluxo>?token=<token do fluxo>
//   Body JSON livre. Só uma regra: precisa ter o telefone de destino em alguma destas chaves —
//   telefone | phone | whatsapp | celular | numero  (com ou sem máscara).
//   TODO o resto do JSON vira variável pro texto: {"nome":"Ana"} → {{nome}}.
// O token é POR FLUXO (fica na automação) — vazar um não expõe os outros, e dá pra trocar só ele.

// "Escutar" do builder: a última chegada de cada webhook de fluxo, em memória (some no redeploy —
// é o teste ao vivo do painel, não histórico). Grava também as chegadas que NÃO disparam (rascunho,
// sem telefone): é exatamente o que quem está testando precisa ver. Token errado não grava — sem
// token válido não dá pra saber se o POST é mesmo de quem conhece o endereço.
type EspiadaWebhook = {
  at: number;
  // ok = disparou · filtrado = produto fora do filtro · evento_desmarcado = evento não marcado no nó
  // sem_parser = a integração escolhida ainda não tem leitura própria
  status: "ok" | "sem_telefone" | "rascunho" | "filtrado" | "evento_desmarcado" | "sem_parser" | "duplicado" | "assinatura_invalida" | "sem_assinatura";
  telefone?: string;
  fields: Record<string, string>;
  // JSON cru do POST (capado) — só no gatilho webhook simples, pra copiar/depurar o payload
  // inteiro sem precisar pedir pra origem mandar de novo (pedido do dono, 24/08).
  raw?: string;
  // true = veio do "colar payload" do builder (nada foi disparado), não de um POST real.
  simulado?: boolean;
  // Versão MASTIGADA pro nó de checkout: rótulo em português + a variável pronta pra copiar.
  resumo?: Array<{ rotulo: string; variavel?: string; valor: string }>;
  evento?: string;  // rótulo do evento em pt ("PIX gerado")
  produto?: string; // nome do produto do evento (pro aviso de filtro)
};
const espiadasWebhook = new Map<string, EspiadaWebhook>(); // "wsId:automationId" → última chegada

// Rótulos dos eventos de venda em português — o que o leigo lê na escuta do nó.
const EVENTO_ROTULO: Record<string, string> = {
  purchase_approved: "Compra aprovada", pix_generated: "PIX gerado", boleto_generated: "Boleto gerado",
  cart_abandoned: "Carrinho abandonado", purchase_refused: "Compra recusada", refund: "Reembolso",
  chargeback: "Chargeback", subscription_canceled: "Assinatura cancelada",
  subscription_renewed: "Assinatura renovada", payment_delayed: "Pagamento atrasado",
};
const brl2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// 💰 VENDA → META. Sem este aviso a Meta só enxerga PageView/ViewContent/InitiateCheckout: ela
// nunca sabe que alguém COMPROU, então a campanha não tem como otimizar por venda — otimiza por
// clique no botão e queima verba em quem clica e não paga.
// Roda no webhook DO FLUXO de propósito: o caminho global exige KIWIFY_WEBHOOK_TOKEN, que não está
// configurado, e por isso recusa 100% das chamadas há tempo. Este aqui já é autenticado (token do
// fluxo + assinatura da plataforma) e já está recebendo os eventos de verdade.
// Independe do filtro de produto e de o fluxo estar publicado: a venda aconteceu de qualquer jeito,
// e a Meta precisa saber. A dedup é POR PEDIDO (não por fluxo) — dois fluxos ouvindo o mesmo
// webhook não podem virar duas conversões.
// Evento de TESTE da Kiwify (botão "testar webhook" no painel dela): produto "Example product",
// e-mail @example.com. Não é venda — mandar pra Meta suja a otimização da campanha com compras
// falsas (aconteceu 07/10: 2 Purchases de R$ 68,65 e R$ 58,15 aceitos pela Meta).
function ehTesteKiwify(ev: NormalizedEvent): boolean {
  return /^\s*example product\s*$/i.test(String(ev.product?.name ?? "")) || /@example\.(com|org|net)$/i.test(String(ev.contact.email ?? ""));
}
// 🔕 PURCHASE PELA KIWIFY, NÃO POR AQUI (opção A, decisão do dono em 08/10/2026). A Kiwify já
// reporta a mesma compra pro MESMO pixel (pixel do checkout + API de Conversões dela) com um
// "ID único" próprio, diferente do nosso event_id (número do pedido) → a Meta não deduplicava e o
// Gerenciador de Anúncios mostrava 4 compras pra 2 vendas (R$ 59,28 = 2×17 nossos + 2×12,64 dela).
// Fonte única passa a ser a Kiwify, que já atribui ao anúncio. Os OUTROS eventos da CAPI (lead
// qualificado etc.) seguem normais. Pra voltar a mandar Purchase daqui: config "capi-opcoes"
// = { "purchaseKiwify": true } no workspace primário.
async function avisaMetaDaVenda(ev: NormalizedEvent): Promise<void> {
  if (ev.event !== "purchase_approved") return;
  if (ehTesteKiwify(ev)) { console.log(`💰 Purchase NÃO enviado à Meta: evento de teste da Kiwify ("${ev.product?.name ?? "?"}")`); return; }
  if (getCached<any>("capi-opcoes")?.purchaseKiwify !== true) {
    console.log(`💰 Purchase NÃO enviado à Meta: a Kiwify é a fonte única do Purchase (opção A, 08/10) · pedido ${String(ev.eventId ?? "").slice(0, 8)}…`);
    return;
  }
  const pedido = String(ev.eventId ?? "").trim();
  if (!pedido) return;
  // A chave é uma RESERVA, não um carimbo de "pronto": ela impede duas chamadas simultâneas de
  // mandarem a mesma venda, mas é DEVOLVIDA se o envio falhar (ver o final da função). Marcar antes
  // e nunca soltar fazia um timeout de 8s da Graph apagar aquela venda pra sempre — a Kiwify
  // reenviava, batia na chave já marcada e voltava calado. Reenviar é seguro: a Meta deduplica pelo
  // event_id, que é este mesmo número de pedido.
  const chaveDedup = "capi-purchase:" + pedido;
  if (await isDuplicate(chaveDedup)) return;

  // O JOIN: a plataforma devolve o identificador curto que a página pendurou no link do checkout.
  // Com ele voltam o fbp e o fbc — que a plataforma NUNCA devolveria — e é isso que permite à Meta
  // amarrar esta venda ao clique no anúncio.
  const trk = String(ev.tracking?.sck ?? "").trim();
  let ficha: any = null;
  if (trk && dbEnabled) {
    ficha = (await query(
      "SELECT fbp, fbc, ip, user_agent, landing_url, ad_id FROM checkout_sessions WHERE trk = $1",
      [trk],
    ).catch(() => []))[0] ?? null;
  }
  const ok = await enviaEventoMeta({
    evento: "Purchase",
    email: ev.contact.email ?? null,
    telefone: ev.contact.phone ?? null,
    nome: ev.contact.name ?? null,
    valor: ev.amount != null ? Number(ev.amount) : null,
    idPedido: pedido,
    fbp: ficha?.fbp ?? null,
    fbc: ficha?.fbc ?? null,
    ip: ficha?.ip ?? null,
    userAgent: ficha?.user_agent ?? null,
    origemUrl: ficha?.landing_url ?? null,
    conteudo: ev.product?.name ?? null,
  }).catch(() => false);
  // Falhou? Devolve a reserva pro reenvio da Kiwify conseguir tentar de novo.
  if (!ok) await liberaDedup(chaveDedup);
  console.log(
    `💰 Purchase → Meta · pedido ${pedido} · R$ ${ev.amount ?? "?"} · ` +
    `${ok ? "aceito" : "RECUSADO (vai tentar de novo no reenvio)"} · ficha do clique: ${ficha ? `achada (fbp ${ficha.fbp ? "sim" : "não"}, fbc ${ficha.fbc ? "sim" : "não"})` : trk ? `trk "${trk}" sem ficha` : "sem trk no webhook"}`,
  );
}
// ⚠️ DE QUAL NÚMERO O FLUXO ENVIA. Regra dura de isolamento: workspace de CLIENTE envia pela
// instância DELE — nunca pela primária. Um webhook do fluxo do cliente saindo pelo WhatsApp do
// dono da plataforma é vazamento entre contas (aconteceu: o alerta do rastreador de um cliente saiu
// pelo número do dono, 25/08).
//
// FALHA FECHADA de propósito: sem conta resolvida devolve null e o chamador NÃO envia. Mandar
// pelo número errado é pior que não mandar — o lead recebe de um desconhecido e o dono da conta
// que emprestou o número leva o bloqueio.
//
// A ordem é a mesma do agendador de lembretes (que já fazia certo): conta pedida → LITE do
// workspace → conta Oficial do workspace.
function gatewayDoWorkspace(wsId: string, account?: string): WhatsAppGateway | null {
  const oficialDo = (ws: string): WhatsAppGateway | null => {
    const cfg = getCachedFor<any>(ws, "meta-official");
    const tok = metaSegredo(cfg, "accessToken");
    if (!cfg?.phoneNumberId || !tok) return null;
    return new MetaGateway({ wabaId: String(cfg.wabaId ?? ""), phoneNumberId: String(cfg.phoneNumberId), accessToken: tok, wsId: ws });
  };
  if (account === "api") return oficialDo(wsId);

  if (wsId === getPrimaryWorkspace()) {
    if (!account || account === "lite") return withEchoGuard(gateway);
    const tok = resolveLiteToken(account);
    return tok ? withEchoGuard(new UazapiGateway(config.uazapi.url, tok)) : null;
  }

  const insts = getCachedFor<LiteStored[]>(wsId, "lite-instances") ?? [];
  // O id da conta é "lite-" + 8 primeiros do token (idDaInstancia) — o LiteStored NÃO tem campo `id`.
  // Antes isto procurava `i.id` e nunca achava: fluxo de cliente amarrado a um número caía no 1º.
  const alvo = account && account !== "lite" ? insts.find((i: any) => idDaInstancia(i.token) === account || i.token === account) : insts[0];
  if (alvo?.token) return withEchoGuard(new UazapiGateway(config.uazapi.url, alvo.token));
  return oficialDo(wsId); // sem LITE, tenta a conta Oficial dele; senão null (não envia)
}

// ── Leitura do evento de venda, compartilhada ───────────────────────────────────────────────
// Usada pela rota REAL e pelo "colar payload" do builder. Ter uma função só é o que garante que o
// que você vê testando é o que acontece na venda de verdade — duas leituras separadas divergiriam
// em silêncio na primeira vez que uma delas mudasse.
function mastigaCheckout(fluxo: any, b: any): { erro: "sem_parser"; } | {
  erro: null; ev: NormalizedEvent; rotuloEv: string;
  resumo: NonNullable<EspiadaWebhook["resumo"]>; campos: Record<string, string>;
} {
  const plataforma = String(fluxo.plataforma ?? "kiwify") || "kiwify";
  if (plataforma !== "kiwify") return { erro: "sem_parser" };
  let ev: NormalizedEvent;
  try { ev = parseKiwify(b); } catch { return { erro: "sem_parser" }; }
  // {{email}}, {{utm_source}} e {{oferta}} não são canônicos do render — entram como fields do
  // evento pra RESOLVEREM de verdade nos textos/template (chip oferecido = chip que funciona).
  ev.fields = {
    ...(ev.fields ?? {}),
    ...(ev.contact.email ? { email: String(ev.contact.email) } : {}),
    ...(ev.tracking?.source ? { utm_source: String(ev.tracking.source) } : {}),
    ...(ev.tracking?.medium ? { utm_medium: String(ev.tracking.medium) } : {}),
    ...(ev.tracking?.campaign ? { utm_campaign: String(ev.tracking.campaign) } : {}),
    ...(ev.tracking?.content ? { utm_content: String(ev.tracking.content) } : {}),
    ...(ev.tracking?.term ? { utm_term: String(ev.tracking.term) } : {}),
    ...(ev.tracking?.sck ? { ad_id: String(ev.tracking.sck) } : {}),
    ...(ev.plan?.offerCode ? { oferta: String(ev.plan.offerCode) } : {}),
  };
  const rotuloEv = EVENTO_ROTULO[ev.event] ?? ev.event;
  // O RESUMO MASTIGADO: rótulo → valor → variável pronta. É o que o nó mostra na escuta e o que
  // a pessoa copia pros campos {{1}}, {{2}}… do template.
  // `campos` é a MESMA informação em forma de variável editável (o quadro do gatilho de webhook).
  // Ele nasce do resumo de propósito: assim toda linha que aparece pra editar é uma variável que
  // resolve DE VERDADE nos textos — oferecer uma que não resolve é pior que não oferecer.
  const resumo: NonNullable<EspiadaWebhook["resumo"]> = [];
  const campos: Record<string, string> = { ...(ev.fields ?? {}) };
  const põe = (rotulo: string, valor: unknown, variavel?: string, valorCheio?: unknown) => {
    const v = String(valor ?? "").trim();
    if (!v) return;
    resumo.push({ rotulo, valor: v.slice(0, 220), ...(variavel ? { variavel } : {}) });
    if (variavel) campos[variavel.replace(/[{}]/g, "")] = String(valorCheio ?? valor ?? "").slice(0, 500);
  };
  põe("Evento", rotuloEv);
  põe("Nome", ev.contact.name, "{{nome}}");
  põe("Primeiro nome", ev.contact.firstName, "{{primeiro_nome}}");
  põe("Telefone", ev.contact.phone, "{{telefone}}");
  põe("E-mail", ev.contact.email, "{{email}}");
  põe("Produto", ev.product?.name, "{{produto}}");
  põe("ID do produto", ev.product?.id);
  if (ev.amount != null) põe("Valor", brl2(ev.amount), "{{valor}}");
  põe("Link (checkout/boleto)", ev.links?.checkout ?? ev.links?.boleto, "{{link}}");
  // O PIX aparece cortado na lista (é gigante) mas a VARIÁVEL leva o código inteiro — mandar
  // "…" pro cliente seria um Pix que não cola.
  põe("Código PIX", ev.pixCode ? ev.pixCode.slice(0, 40) + "…" : "", "{{pix}}", ev.pixCode);
  põe("Oferta (checkout_link)", ev.plan?.offerCode ?? "", "{{oferta}}");
  põe("Afiliado", ev.affiliate?.name ?? "");
  if (ev.affiliate?.commission != null) põe("Comissão do afiliado", brl2(ev.affiliate.commission));
  põe("Origem (utm_source)", ev.tracking?.source ?? "", "{{utm_source}}");
  põe("Campanha", ev.tracking?.campaign ?? "", "{{utm_campaign}}");
  põe("Criativo (utm_content)", ev.tracking?.content ?? "", "{{utm_content}}");
  põe("Anúncio (ad_id)", ev.tracking?.sck ?? "", "{{ad_id}}");
  return { erro: null, ev, rotuloEv, resumo, campos };
}

async function recebeCheckoutNoFluxo(
  wsId: string, fluxo: any, b: any, reply: any, rawBody = "", assinatura = "",
) {
  const espia = (e: Omit<EspiadaWebhook, "at">) => espiadasWebhook.set(wsId + ":" + fluxo.id, { at: Date.now(), ...e });
  const plataforma = String(fluxo.plataforma ?? "kiwify") || "kiwify";
  const lido = mastigaCheckout(fluxo, b);
  if (lido.erro) {
    espia({ status: "sem_parser", fields: {} });
    return plataforma !== "kiwify"
      ? reply.code(200).send({ ok: false, motivo: "integração sem leitura própria ainda" })
      : reply.code(400).send({ error: "não consegui ler esse formato — é o webhook da Kiwify?" });
  }
  const { ev, rotuloEv, resumo, campos } = lido;
  // `raw` = o JSON como chegou. É o que faz o "copiar payload" e o "enviar de verdade" existirem
  // no nó de checkout também: sem ele, dava pra ver o evento mas não pra repetir o evento.
  const base = {
    fields: campos, resumo, evento: rotuloEv, produto: String(ev.product?.name ?? ""),
    raw: (rawBody || JSON.stringify(b, null, 2)).slice(0, 20_000),
  };

  // SEGREDO DA PLATAFORMA (opcional, mas recomendado): com ele configurado, o corpo precisa vir
  // ASSINADO pela Kiwify. Sem isso, quem descobrir a URL consegue forjar uma venda — e o token da
  // URL viaja em query string, que fica em log de proxy e histórico de navegador.
  // A conferência acontece AQUI, depois do resumo, de propósito: antes, a recusa gravava uma
  // espiada VAZIA e o log só dizia "descartado". Quem gerou um Pix e não recebeu nada não tinha
  // como saber se a Kiwify chegou a bater na porta. Rejeitar continua igual — o que muda é que
  // agora sobra prova do que chegou e de qual dos dois lados está com o token diferente.
  const seg = fluxo.webhookSegredoEnc ? decryptSecret(String(fluxo.webhookSegredoEnc)) : "";
  if (seg && !verifyKiwifySignature(rawBody, assinatura || undefined, seg)) {
    // Dois problemas DIFERENTES, com conserto diferente:
    //   sem assinatura  → a Kiwify não está assinando (webhook lá sem token) → tirar o token daqui
    //                     OU cadastrar o mesmo token lá
    //   não confere     → os dois lados têm token, mas são tokens diferentes
    const status = assinatura ? "assinatura_invalida" : "sem_assinatura";
    espia({ ...base, status, telefone: ev.contact.phone ?? undefined });
    console.log(
      `🔐 webhook do fluxo "${fluxo.id}" RECUSADO (${status}) · ${rotuloEv} · ` +
      `${ev.product?.name ?? "?"} → ${ev.contact.phone ?? "sem telefone"} · ` +
      `assinatura recebida: ${assinatura ? assinatura.slice(0, 8) + "… (" + assinatura.length + " chars)" : "NENHUMA"} · ` +
      `corpo: ${rawBody.length} bytes`,
    );
    return reply.code(401).send({ error: status === "sem_assinatura" ? "webhook sem assinatura" : "assinatura inválida" });
  }

  // A venda é avisada à Meta AQUI: já passou pela autenticação (token + assinatura), e ainda não
  // passou pelos portões do fluxo — que dizem respeito ao FLUXO, não ao fato de ter vendido.
  // ⚠️ SÓ do workspace PRIMÁRIO. O pixel/CAPI vem do ambiente (META_PIXEL_ID) e é do DONO da
  // plataforma: mandar a venda de um cliente pra lá jogaria o e-mail/telefone do comprador DELE
  // no pixel de outra empresa (LGPD) e ainda sujaria a atribuição das duas. Quando existir pixel
  // por workspace, este portão vira "o pixel daquele workspace".
  if (wsId === getPrimaryWorkspace()) void avisaMetaDaVenda(ev);
  // 🧾 Todo pedido APROVADO (ingresso E bumps — cada bump chega como um pedido separado) entra na
  // tabela, ANTES do filtro de produto do fluxo: é dela que sai o {{resumo_compra}} do aviso.
  if (ev.event === "purchase_approved") {
    void registraPedidoKiwify({
      orderId: String(ev.eventId ?? ""), wsId, phone: ev.contact.phone, email: (ev.contact as any).email,
      produto: ev.product?.name, bruto: ev.amount ?? null, liquido: ev.fees?.producerNet ?? null, utm: ev.tracking ?? null,
    });
  }
  else console.log(`📊 venda do workspace ${wsId}: NÃO avisada ao pixel da plataforma (o pixel é do dono; dado do comprador não sai da conta do cliente)`);

  // 🪞 Os ESPELHOS rodam antes dos portões do fluxo dono: o evento já está autenticado, e cada
  // espelho tem os PRÓPRIOS portões (rascunho, eventos, filtro de produto). Senão a venda de um
  // produto que o dono filtra nunca chegaria ao espelho que o aceita.
  void rodaEspelhosDoWebhook(wsId, fluxo, ev, plataforma, base);

  if (fluxo.enabled === false) {
    espia({ ...base, status: "rascunho", telefone: ev.contact.phone ?? undefined });
    return reply.code(200).send({ ok: false, motivo: "fluxo em rascunho" });
  }
  if (!(fluxo.eventos ?? []).includes(ev.event)) {
    espia({ ...base, status: "evento_desmarcado" });
    return reply.code(200).send({ ok: false, motivo: `evento ${ev.event} não está marcado no nó` });
  }
  // O FILTRO DE PRODUTO: o dado chega, fica visível na escuta, mas o fluxo NÃO anda — exatamente
  // o combinado ("pode receber os dados do teste, mas não avança").
  if (!produtoCasa(fluxo.produtos, ev.product)) {
    espia({ ...base, status: "filtrado" });
    console.log(`💳 webhook do fluxo "${fluxo.id}": produto "${ev.product?.name ?? "?"}" fora do filtro — segurado`);
    return reply.code(200).send({ ok: false, motivo: "produto fora do filtro deste fluxo" });
  }
  if (!ev.contact.phone) {
    espia({ ...base, status: "sem_telefone" });
    return reply.code(200).send({ ok: false, motivo: "evento sem telefone do cliente" });
  }
  // Kiwify REENVIA quando demora/erra: o mesmo pedido não pode disparar o fluxo duas vezes.
  if (ev.eventId && (await isDuplicate("flx:" + wsId + ":" + fluxo.id + ":" + ev.event + ":" + ev.eventId))) {
    espia({ ...base, status: "duplicado", telefone: ev.contact.phone });
    return reply.code(200).send({ ok: true, duplicate: true });
  }
  espia({ ...base, status: "ok", telefone: ev.contact.phone });
  console.log(`💳 webhook do fluxo "${fluxo.id}" · ${rotuloEv} · ${ev.product?.name ?? "?"} → ${ev.contact.phone}`);
  reply.code(200).send({ ok: true }); // responde JÁ — a Kiwify não espera o WhatsApp sair
  disparaCheckoutNoFluxo(wsId, fluxo, ev, plataforma);
}

// Roda o fluxo de checkout pra venda já aceita (fora da resposta HTTP, serializado por telefone).
function disparaCheckoutNoFluxo(wsId: string, fluxo: any, ev: NormalizedEvent, plataforma: string) {
  const tel = String(ev.contact.phone ?? "");
  setImmediate(() =>
    serializeByPhone(wsId + ":" + tel, () =>
      runWithWorkspace(wsId, async () => {
        try {
          await upsertContact(tel, ev.contact.name || undefined, plataforma, undefined, ev.contact.email);
          if (await isOptedOut(tel)) { console.log(`🚫 ${tel} optou por sair — fluxo pulado`); return; }
          await recordEvent(tel, plataforma, ev.event, ev.product?.name, ev.amount, undefined, ev.product?.id);
          const gw = gatewayDoWorkspace(wsId, String(fluxo.conta ?? "").trim() || undefined); // número escolhido no gatilho
          if (!gw) { console.error(`🚫 webhook checkout do fluxo ${fluxo.id}: workspace ${wsId} sem número conectado — NÃO enviei (não uso o número de outra conta)`); return; }
          await runAutomationsFor(ev, gw, [fluxo], console.log, true);
        } catch (e: any) {
          console.error(`webhook checkout do fluxo ${fluxo.id}:`, e?.message ?? e);
        }
      }),
    ),
  );
}

// 🪞 ESPELHO DE WEBHOOK: um endereço cadastrado na Kiwify, VÁRIOS fluxos. O fluxo com
// `webhookDe: "<id do dono>"` roda com o mesmo evento que chegou no dono — cada um com o PRÓPRIO
// número (`conta`), eventos e filtro de produto. Nasceu em 13/10/2026: o fluxo do LITE 11 nunca
// disparou porque a URL dele nunca foi cadastrada na Kiwify (só a do fluxo da API Oficial) — e
// "toda compra aprovada tem que ter confirmação pelo 11". Com o espelho, basta UMA URL lá.
async function rodaEspelhosDoWebhook(wsId: string, dono: any, ev: NormalizedEvent, plataforma: string, base: Omit<EspiadaWebhook, "at" | "status">) {
  let espelhos: any[] = [];
  try {
    espelhos = await runWithWorkspace(wsId, async () =>
      loadAutomations().filter((a: any) => a?.trigger === "checkout" && a?.id !== dono.id && String(a?.webhookDe ?? "") === String(dono.id)));
  } catch (e: any) { console.error(`🪞 espelhos do webhook de "${dono.id}":`, e?.message ?? e); return; }
  for (const f of espelhos) {
    const espia = (e: Omit<EspiadaWebhook, "at">) => espiadasWebhook.set(wsId + ":" + f.id, { at: Date.now(), ...e });
    const motivo = f.enabled === false ? "rascunho"
      : !(f.eventos ?? []).includes(ev.event) ? "evento_desmarcado"
      : !produtoCasa(f.produtos, ev.product) ? "filtrado"
      : !ev.contact.phone ? "sem_telefone" : "";
    if (motivo) {
      espia({ ...base, status: motivo as EspiadaWebhook["status"], telefone: ev.contact.phone ?? undefined });
      console.log(`🪞 espelho "${f.id}" do webhook de "${dono.id}": ${motivo} · ${ev.product?.name ?? "?"}`);
      continue;
    }
    if (ev.eventId && (await isDuplicate("flx:" + wsId + ":" + f.id + ":" + ev.event + ":" + ev.eventId))) {
      espia({ ...base, status: "duplicado", telefone: ev.contact.phone ?? undefined });
      continue;
    }
    espia({ ...base, status: "ok", telefone: ev.contact.phone ?? undefined });
    console.log(`🪞 espelho "${f.id}" do webhook de "${dono.id}" · ${base.evento} · ${ev.product?.name ?? "?"} → ${ev.contact.phone}`);
    disparaCheckoutNoFluxo(wsId, f, ev, plataforma);
  }
}

// Extração compartilhada do POST do gatilho webhook (rota real E "colar payload" do builder):
//  • telefone: primeiro pelo campoTelefone do fluxo (caminho pontuado, ex. "device.vin" — payloads
//    de rastreador/CRM enterram o telefone num objeto), depois os nomes padrão de topo;
//  • fields: JSON achatado até 2 níveis ("device.vin" → {{device_vin}}); o que sobrar aninhado
//    além disso vira JSON em texto — melhor mostrar algo do que sumir com o dado;
//  • raw: o corpo cru formatado (capado) pro botão "copiar payload".
// Nomes de campo que carregam telefone em QUALQUER plataforma (depois de achatado: Customer_mobile,
// buyer_checkout_phone, data_customer_phone…). Serve de rede: o campo explícito do fluxo continua
// tendo a palavra final, e só caímos aqui quando o payload não usa "telefone" na raiz.
const CAMPO_PARECE_FONE = /(?:^|_)(telefone|phone|mobile|celular|whatsapp|numero|number|msisdn)(?:_|$)/i;

function extraiDadosWebhook(fluxo: any, b: any): { telefone: string; fields: Record<string, string>; raw: string } {
  const soDigitos = (v: any) => String(v ?? "").replace(/\D/g, "");
  const campoTelefone = String(fluxo?.campoTelefone ?? "").trim();
  const pegaCampo = (obj: any, caminho: string): any =>
    caminho.split(".").reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj);
  let telefone = soDigitos(
    (campoTelefone ? pegaCampo(b, campoTelefone) : undefined) ?? b.telefone ?? b.phone ?? b.whatsapp ?? b.celular ?? b.numero,
  );
  const fields: Record<string, string> = {};
  const achatarJson = (v: any, prefixo: string, profundidade: number) => {
    if (v == null) return;
    if (typeof v === "object" && !Array.isArray(v) && profundidade < 2) {
      for (const [k, vv] of Object.entries(v)) achatarJson(vv, prefixo ? `${prefixo}_${k.replace(/[^\w]/g, "_")}` : k.replace(/[^\w]/g, "_"), profundidade + 1);
      return;
    }
    const chave = prefixo.slice(0, 60);
    if (!chave) return;
    fields[chave] = (typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 500);
  };
  for (const [k, v] of Object.entries(b)) achatarJson(v, k.replace(/[^\w]/g, "_").slice(0, 40), 0);
  // 📞 REDE DE SEGURANÇA. A Kiwify manda o telefone em `Customer.mobile` — nenhum dos nomes da
  // raiz que a gente procurava. Resultado: webhook de VENDA caindo num fluxo comum devolvia
  // "sem_telefone" e o comprador não recebia nada (foi o que aconteceu no pedido 88651eee, 06/09).
  // Aqui a gente varre os campos JÁ ACHATADOS atrás de um que se pareça com telefone e tenha
  // cara de número de verdade (10 a 15 dígitos) — vale pra Kiwify, Hotmart, Eduzz e afins.
  if (!telefone || telefone.length < 8) {
    for (const [k, v] of Object.entries(fields)) {
      if (!CAMPO_PARECE_FONE.test(k)) continue;
      const d = soDigitos(v);
      if (d.length >= 10 && d.length <= 15) { telefone = d; break; }
    }
  }
  return { telefone, fields, raw: JSON.stringify(b, null, 2).slice(0, 20_000) };
}

app.post("/webhooks/fluxo/:automationId", LIMITE_WEBHOOK, async (req, reply) => {
  const automationId = String((req.params as any).automationId ?? "");
  const veio = String(req.headers["x-fluxo-token"] ?? (req.query as any)?.token ?? "");
  // O fluxo pode ser de QUALQUER workspace (cliente também tem builder): o id acha o dono no cache
  // de configs; o seed de arquivo do primário (que não vive no cache) fica coberto pelo fallback.
  const wsId = scanConfig<any[]>("automations").find((c) => (Array.isArray(c.value) ? c.value : []).some((a: any) => a?.id === automationId))?.wsId
    ?? getPrimaryWorkspace();
  const fluxo = await runWithWorkspace(wsId, async () => loadAutomations().find((a: any) => a.id === automationId));
  // Estes três casos morriam CALADOS. Um fluxo apagado/recriado troca de id, e a URL antiga fica
  // na Kiwify batendo em 404 pra sempre — sem log, "não chegou nada" e "chegou no lugar errado"
  // ficam indistinguíveis, e é justamente a diferença entre consertar a URL e caçar outra coisa.
  if (!fluxo) {
    console.log(`🚪 webhook para o fluxo "${automationId}": FLUXO NÃO EXISTE (id antigo na origem?) — 404`);
    return reply.code(404).send({ error: "fluxo não encontrado" });
  }
  const esperado = String((fluxo as any).webhookToken ?? "");
  if (!esperado) {
    console.log(`🚪 webhook do fluxo "${automationId}": ainda sem token gerado — 503`);
    return reply.code(503).send({ error: "este fluxo ainda não tem token de webhook — gere um no painel" });
  }
  if (veio !== esperado) {
    console.log(`🚪 webhook do fluxo "${automationId}": token da URL não confere (recebido: ${veio ? veio.slice(0, 6) + "…" : "NENHUM"}) — 401`);
    return reply.code(401).send({ error: "token inválido" });
  }

  const b = (req.body ?? {}) as any;
  // 🎟️ Se o que chegou aqui for a venda de um ingresso do workshop, ela também é CONTABILIZADA —
  // este endpoint existe pra rodar o fluxo (mandar o acesso no WhatsApp) e passava longe da tabela
  // de vendas. Era por aqui que a venda de 06/09 entrou sem aparecer no contador da página.
  // Só conta com a assinatura da Kiwify conferida (o token do fluxo sozinho não basta — ver abaixo).
  // A Kiwify assina cada webhook com o token DAQUELE webhook: o do fluxo é outro, diferente do
  // global da plataforma. Conferindo só com o global, TODA venda de ingresso que entrava por aqui
  // era "assinatura inválida — NÃO contabilizado" (visto 07/10 no teste; nenhum lote nunca contou).
  const segredoDoFluxo = (fluxo as any).webhookSegredoEnc ? (decryptSecret(String((fluxo as any).webhookSegredoEnc)) ?? "") : "";
  void registraIngressoWorkshop(b, { rawBody: String((req as any).rawBody ?? ""), assinatura: String((req.query as any)?.signature ?? ""), segredos: [segredoDoFluxo] });
  // GATILHO DE CHECKOUT com webhook PRÓPRIO: o payload é da plataforma de venda (Kiwify) e é
  // parseado pelo MESMO parser do caminho global — o nó recebe o evento mastigado, testa o filtro
  // de produto e dispara pelos ramos ev:<evento>. A espiada registra TUDO que chegar (inclusive o
  // que o filtro segurou) — é o modo escuta do builder.
  if ((fluxo as any).trigger === "checkout") {
    return recebeCheckoutNoFluxo(wsId, fluxo as any, b, reply, String((req as any).rawBody ?? ""), String((req.query as any)?.signature ?? ""));
  }
  const { telefone, fields, raw: rawTxt } = extraiDadosWebhook(fluxo, b);
  const espia = (status: EspiadaWebhook["status"]) =>
    espiadasWebhook.set(wsId + ":" + automationId, { at: Date.now(), status, telefone: telefone || undefined, fields, raw: rawTxt });

  if (fluxo.enabled === false) {
    espia("rascunho");
    return reply.code(409).send({ error: "o fluxo está como rascunho — ative pra receber" });
  }
  if (!telefone || telefone.length < 8) {
    espia("sem_telefone");
    return reply.code(400).send({ error: "informe o telefone de destino em 'telefone' (ou phone/whatsapp/celular/numero)" });
  }
  fields.telefone = telefone;
  espia("ok");
  const nome = String(b.nome ?? b.name ?? b.primeiro_nome ?? "").slice(0, 80);

  const ev: NormalizedEvent = {
    platform: "webhook",
    event: "webhook",
    eventId: "wh-" + Date.now() + "-" + telefone,
    contact: { name: nome || telefone, firstName: nome.split(" ")[0] || "", phone: telefone },
    fields,
    raw: b,
  };
  console.log(`🔗 webhook do fluxo "${automationId}" → ${telefone}`);
  reply.code(200).send({ ok: true }); // responde JÁ: o site de origem não espera o WhatsApp sair
  setImmediate(() =>
    serializeByPhone(wsId + ":" + telefone, () =>
      runWithWorkspace(wsId, async () => {
        try {
          await upsertContact(telefone, nome || undefined, "webhook");
          const gw = gatewayDoWorkspace(wsId, String((fluxo as any).conta ?? "").trim() || undefined); // número escolhido no gatilho
          if (!gw) { console.error(`🚫 webhook do fluxo ${automationId}: workspace ${wsId} sem número conectado — NÃO enviei (não uso o número de outra conta)`); return; }
          await runAutomationsFor(ev, gw, [fluxo], console.log, true);
        } catch (e: any) {
          console.error("webhook de fluxo:", e?.message ?? e);
        }
      }),
    ),
  );
});

// Gera (ou troca) o token de webhook de um fluxo. Devolve a URL pronta pra colar no outro sistema.
// A lógica é compartilhada admin/cliente — o que muda é só o portão e o workspace da sessão.
function urlDoWebhook(automationId: string, token: string): string {
  return `${MEDIA_PUBLIC_BASE}/webhooks/fluxo/${automationId}?token=${token}`;
}
async function trocaTokenWebhook(automationId: string, reply: any) {
  const lista = loadAutomations();
  const alvo: any = lista.find((a) => a.id === automationId);
  if (!alvo) return reply.code(404).send({ error: "fluxo não encontrado" });
  alvo.webhookToken = randomBytes(18).toString("hex");
  await saveConfig("automations", lista);
  return reply.send({ ok: true, token: alvo.webhookToken, url: urlDoWebhook(automationId, alvo.webhookToken) });
}
// GET: devolve a URL ATUAL sem trocar o token — abrir o painel de novo não pode invalidar o
// endereço que já está colado no formulário/n8n de alguém. Sem token ainda → url: null.
function leTokenWebhook(automationId: string, reply: any) {
  const alvo: any = loadAutomations().find((a) => a.id === automationId);
  if (!alvo) return reply.code(404).send({ error: "fluxo não encontrado" });
  const token = String(alvo.webhookToken ?? "");
  // O segredo NUNCA volta pro painel — só a marca de configurado (mesmo padrão das chaves do
  // motor). Assim ele não vaza pra quem abrir o DevTools numa máquina compartilhada.
  const seg = String(alvo.webhookSegredoEnc ?? "");
  return reply.send({
    ok: true,
    url: token ? urlDoWebhook(automationId, token) : null,
    segredoConfigurado: !!seg,
  });
}
// Grava (ou apaga) o segredo do webhook da plataforma — o "Token" que a Kiwify mostra na tela de
// criar webhook. Guardado criptografado, por fluxo.
async function salvaSegredoWebhook(automationId: string, segredo: string, reply: any) {
  const lista = loadAutomations();
  const alvo: any = lista.find((a) => a.id === automationId);
  if (!alvo) return reply.code(404).send({ error: "fluxo não encontrado" });
  const limpo = String(segredo ?? "").trim().slice(0, 200);
  if (limpo) alvo.webhookSegredoEnc = encryptSecret(limpo);
  else delete alvo.webhookSegredoEnc;
  await saveConfig("automations", lista);
  console.log(`🔐 segredo do webhook do fluxo "${automationId}" ${limpo ? "salvo" : "removido"}`);
  return reply.send({ ok: true, segredoConfigurado: !!limpo });
}
app.post("/admin/flow-webhook-secret", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  return salvaSegredoWebhook(String(b?.automationId ?? ""), String(b?.segredo ?? ""), reply);
});
app.post("/app/flow-webhook-secret", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body ?? {}) as any;
  return runWithWorkspace(ws, async () => salvaSegredoWebhook(String(b?.automationId ?? ""), String(b?.segredo ?? ""), reply));
});
app.post("/admin/flow-webhook-token", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return trocaTokenWebhook(String((req.body as any)?.automationId ?? ""), reply);
});
app.get("/admin/flow-webhook-token", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return leTokenWebhook(String((req.query as any)?.automationId ?? ""), reply);
});
app.post("/app/flow-webhook-token", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => trocaTokenWebhook(String((req.body as any)?.automationId ?? ""), reply));
});
app.get("/app/flow-webhook-token", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => leTokenWebhook(String((req.query as any)?.automationId ?? ""), reply));
});

// O botão "Escutar" do builder: a última chegada do webhook deste fluxo DEPOIS de `since`.
// O `now` da resposta é o relógio do servidor — o painel usa ele como baseline da escuta
// (comparar com Date.now() do navegador quebraria com relógio adiantado/atrasado).
function respondeEspiada(wsId: string, automationId: string, since: number, reply: any) {
  const ev = espiadasWebhook.get(wsId + ":" + automationId) ?? null;
  return reply.send({ now: Date.now(), event: ev && ev.at > since ? ev : null });
}
app.get("/admin/flow-webhook-last", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const q = req.query as any;
  return respondeEspiada(getPrimaryWorkspace(), String(q?.automationId ?? ""), Number(q?.since ?? 0) || 0, reply);
});
app.get("/app/flow-webhook-last", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const q = req.query as any;
  return respondeEspiada(ws, String(q?.automationId ?? ""), Number(q?.since ?? 0) || 0, reply);
});
// Apaga a captura de teste guardada (o "apagar captura" do builder). A captura fica em memória
// até alguém apagar (ou o motor reiniciar) — é dado de teste, não histórico.
app.post("/admin/flow-webhook-clear", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  espiadasWebhook.delete(getPrimaryWorkspace() + ":" + String((req.body as any)?.automationId ?? ""));
  return reply.send({ ok: true });
});
app.post("/app/flow-webhook-clear", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  espiadasWebhook.delete(ws + ":" + String((req.body as any)?.automationId ?? ""));
  return reply.send({ ok: true });
});
// O exemplo de teste do gatilho mora NO FLUXO (banco), não na memória do motor: a pessoa monta o
// fluxo em cima dele por dias, e reinício/deploy não pode apagar (era o que acontecia — Admin,
// 25/08: "coloco o payload e ao atualizar a tela desaparece"). Endpoint próprio pra NÃO passar
// pelo histórico de versões: guardar um dado de teste não é uma versão do fluxo.
function salvaExemploWebhook(automationId: string, exemplo: any, reply: any) {
  const lista = loadAutomations();
  const alvo: any = lista.find((a: any) => a.id === automationId);
  if (!alvo) return reply.code(404).send({ error: "fluxo não encontrado — salve o fluxo primeiro" });
  if (exemplo && typeof exemplo === "object") {
    // Capa o que vai pro banco: a config dos fluxos é lida inteira a cada disparo.
    const campos: Record<string, string> = {};
    for (const [k, v] of Object.entries(exemplo.fields ?? {}).slice(0, 150)) campos[String(k).slice(0, 60)] = String(v ?? "").slice(0, 500);
    // O resumo MASTIGADO (gatilho de checkout) também precisa sobreviver ao recarregar: sem ele a
    // pessoa voltava pra tela e o evento aparecia sem "Nome / Produto / Valor", só com as variáveis.
    const resumo = Array.isArray(exemplo.resumo)
      ? exemplo.resumo.slice(0, 40).map((li: any) => ({
          rotulo: String(li?.rotulo ?? "").slice(0, 60),
          valor: String(li?.valor ?? "").slice(0, 300),
          ...(li?.variavel ? { variavel: String(li.variavel).slice(0, 60) } : {}),
        })).filter((li: any) => li.rotulo)
      : undefined;
    alvo.exemploWebhook = {
      at: Number(exemplo.at) || Date.now(),
      status: String(exemplo.status ?? "ok"),
      telefone: exemplo.telefone ? String(exemplo.telefone).slice(0, 20) : undefined,
      fields: campos,
      raw: exemplo.raw ? String(exemplo.raw).slice(0, 8000) : undefined,
      simulado: !!exemplo.simulado,
      ...(resumo?.length ? { resumo } : {}),
      ...(exemplo.evento ? { evento: String(exemplo.evento).slice(0, 60) } : {}),
      ...(exemplo.produto ? { produto: String(exemplo.produto).slice(0, 120) } : {}),
    };
  } else {
    delete alvo.exemploWebhook;
  }
  return saveConfig("automations", lista).then(() => reply.send({ ok: true, exemplo: alvo.exemploWebhook ?? null }));
}
app.post("/admin/flow-webhook-example", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  return salvaExemploWebhook(String(b?.automationId ?? ""), b?.exemplo, reply);
});
app.post("/app/flow-webhook-example", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body ?? {}) as any;
  return runWithWorkspace(ws, async () => salvaExemploWebhook(String(b?.automationId ?? ""), b?.exemplo, reply));
});

// "Colar payload" do builder: processa um JSON de exemplo pelo MESMO caminho do POST real
// (campoTelefone + achatamento) e guarda como captura de teste — SEM disparar nada. Serve pra
// quando a pessoa já tem um exemplo do payload em mãos e não quer ficar esperando na escuta.
function simulaWebhook(wsId: string, automationId: string, payload: any, reply: any, campos?: any) {
  const fluxo: any = loadAutomations().find((a: any) => a.id === automationId);
  if (!fluxo) return reply.code(404).send({ error: "fluxo não encontrado — salve o fluxo primeiro" });
  if (fluxo.trigger !== "webhook" && fluxo.trigger !== "checkout") {
    return reply.code(400).send({ error: "colar payload vale pros gatilhos de webhook e de checkout" });
  }
  // Só os CAMPOS (sem payload): o builder editou um valor da captura pra testar outro caminho —
  // atualiza a captura guardada, sem remontar nada. Some junto com ela; é dado de teste.
  if (!payload && campos && typeof campos === "object" && !Array.isArray(campos)) {
    const atual = espiadasWebhook.get(wsId + ":" + automationId);
    if (!atual) return reply.code(404).send({ error: "não há captura de teste pra editar" });
    const limpos: Record<string, string> = {};
    for (const [k, v] of Object.entries(campos).slice(0, 300)) limpos[String(k).slice(0, 60)] = String(v ?? "").slice(0, 500);
    // O resumo mastigado do checkout mostra a MESMA informação numa lista de leitura. Se ele não
    // acompanhar a edição, a tela passa a mostrar dois valores diferentes pro mesmo dado — e a
    // pessoa não tem como saber qual dos dois o fluxo vai usar.
    const resumo = atual.resumo?.map((li) => {
      const chave = li.variavel?.replace(/[{}]/g, "");
      return chave && chave in limpos ? { ...li, valor: String(limpos[chave]).slice(0, 220) } : li;
    });
    const ev: EspiadaWebhook = { ...atual, fields: limpos, telefone: limpos.telefone || atual.telefone, ...(resumo ? { resumo } : {}) };
    espiadasWebhook.set(wsId + ":" + automationId, ev);
    return reply.send({ ok: true, event: ev });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply.code(400).send({ error: "o payload precisa ser um objeto JSON" });
  // Captura do n8n colada inteira ({headers, params, body:{...}})? O POST real seria só o body.
  const corpo = payload.headers && typeof payload.body === "object" && payload.body ? payload.body : payload;

  // CHECKOUT: lê pelo MESMO caminho da venda real (parser da plataforma + resumo mastigado), só
  // que sem conferir assinatura, sem filtro de produto e sem disparar nada — é exemplo de teste.
  if (fluxo.trigger === "checkout") {
    const lido = mastigaCheckout(fluxo, corpo);
    if (lido.erro) return reply.code(400).send({ error: "não consegui ler esse payload como evento da Kiwify — confere se copiou o JSON do webhook inteiro." });
    const tel = String(lido.ev.contact.phone ?? "");
    const ev: EspiadaWebhook = {
      at: Date.now(),
      status: tel.length >= 8 ? "ok" : "sem_telefone",
      telefone: tel || undefined,
      fields: lido.campos,
      resumo: lido.resumo,
      evento: lido.rotuloEv,
      produto: String(lido.ev.product?.name ?? ""),
      raw: JSON.stringify(corpo, null, 2).slice(0, 20_000),
      simulado: true,
    };
    espiadasWebhook.set(wsId + ":" + automationId, ev);
    return reply.send({ ok: true, event: ev });
  }

  const { telefone, fields, raw } = extraiDadosWebhook(fluxo, corpo);
  if (telefone) fields.telefone = telefone;
  const ev: EspiadaWebhook = {
    at: Date.now(),
    status: telefone.length >= 8 ? "ok" : "sem_telefone",
    telefone: telefone || undefined,
    fields, raw, simulado: true,
  };
  espiadasWebhook.set(wsId + ":" + automationId, ev);
  return reply.send({ ok: true, event: ev });
}
app.post("/admin/flow-webhook-simulate", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  return simulaWebhook(getPrimaryWorkspace(), String(b?.automationId ?? ""), b?.payload, reply, b?.campos);
});
app.post("/app/flow-webhook-simulate", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body ?? {}) as any;
  return runWithWorkspace(ws, async () => simulaWebhook(ws, String(b?.automationId ?? ""), b?.payload, reply, b?.campos));
});

// "Enviar de verdade agora" do builder: POST na URL PÚBLICA do próprio fluxo, de propósito — o
// teste percorre o caminho REAL (mesmo endereço, mesmo token, mesmo motor, mesma conta de envio).
// Se funciona aqui, funciona quando a plataforma chamar.
//
// A ASSINATURA é feita AQUI e só aqui. O gatilho de checkout com token da Kiwify salvo recusa
// corpo sem assinatura válida — então, sem isto, o próprio botão de testar levaria um 401 e a
// pessoa concluiria que a integração está quebrada, quando na verdade está protegida. O segredo
// continua sem sair do motor: quem assina é o motor, o painel nunca vê o valor nem a assinatura.
// A URL nunca vem de fora (é montada pelo automationId), então isto não vira proxy aberto.
async function disparaWebhookDeVerdade(automationId: string, payload: any, reply: any) {
  const fluxo: any = loadAutomations().find((a: any) => a.id === automationId);
  if (!fluxo) return reply.code(404).send({ error: "fluxo não encontrado — salve o fluxo primeiro" });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return reply.code(400).send({ error: "o payload precisa ser um objeto JSON" });
  }
  const token = String(fluxo.webhookToken ?? "");
  if (!token) return reply.code(400).send({ error: "este fluxo ainda não tem endereço de webhook — gere um antes" });
  const corpo = JSON.stringify(payload);
  let url = urlDoWebhook(automationId, token);
  const seg = fluxo.webhookSegredoEnc ? decryptSecret(String(fluxo.webhookSegredoEnc)) : "";
  // HMAC-SHA1 do corpo cru, hex, em ?signature= — exatamente o formato que a Kiwify manda.
  if (seg) url += "&signature=" + createHmac("sha1", seg).update(corpo).digest("hex");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      signal: AbortSignal.timeout(20_000),
    });
    const txt = (await r.text().catch(() => "")).slice(0, 400);
    return reply.send({ ok: r.ok, status: r.status, resposta: txt, assinado: !!seg });
  } catch (e: any) {
    return reply.code(502).send({ error: "não consegui chamar o webhook: " + String(e?.message ?? e) });
  }
}
app.post("/admin/flow-webhook-fire", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  return disparaWebhookDeVerdade(String(b?.automationId ?? ""), b?.payload, reply);
});
app.post("/app/flow-webhook-fire", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = (req.body ?? {}) as any;
  return runWithWorkspace(ws, async () => disparaWebhookDeVerdade(String(b?.automationId ?? ""), b?.payload, reply));
});

// ═══ HISTÓRICO DE VERSÕES DOS FLUXOS (estilo Google Docs) ════════════════════════════════════
// Cada SAVE que muda um fluxo grava uma versão (snapshot completo + quem salvou + quando) na
// config "flow-history:<id>" do workspace. Restaurar substitui o fluxo pelo snapshot — e a própria
// restauração vira uma versão nova (dá pra "desfazer a restauração" restaurando a anterior).
type VersaoFluxo = { at: string; autor: string; auto: any };
const HIST_FLUXO_MAX = 40;
// Comparação ignora o que muda sozinho (updatedAt) e o que é estado do servidor (webhookToken) —
// senão todo save no-op viraria versão fantasma.
function fluxoMudou(a: any, b: any): boolean {
  const limpa = (x: any) => { const { updatedAt: _u, webhookToken: _t, ...resto } = x ?? {}; return resto; };
  return JSON.stringify(limpa(a)) !== JSON.stringify(limpa(b));
}
async function gravaHistoricoFluxos(listaNova: any[], autor: string): Promise<void> {
  const atuais = new Map(loadAutomations().map((a: any) => [a.id, a]));
  for (const a of listaNova) {
    const antes = atuais.get(a.id);
    if (antes && !fluxoMudou(antes, a)) continue;
    const key = "flow-history:" + a.id;
    const hist = getCached<VersaoFluxo[]>(key) ?? [];
    hist.unshift({ at: new Date().toISOString(), autor, auto: JSON.parse(JSON.stringify(a)) });
    await saveConfig(key, hist.slice(0, HIST_FLUXO_MAX));
  }
}
// Quem salvou: nome (ou e-mail) da sessão — no histórico aparece "quem alterou o fluxo".
async function autorDaSessao(req: any): Promise<string> {
  try { const s = await sessionOf(req); return s?.user?.name || s?.user?.email || "admin"; } catch { return "admin"; }
}
function listaHistorico(automationId: string, reply: any) {
  const hist = getCached<VersaoFluxo[]>("flow-history:" + automationId) ?? [];
  return reply.send({ versions: hist.map((h) => ({ at: h.at, autor: h.autor, passos: Array.isArray(h.auto?.steps) ? h.auto.steps.length : 0 })) });
}
async function restauraVersao(automationId: string, at: string, autor: string, reply: any) {
  const key = "flow-history:" + automationId;
  const hist = getCached<VersaoFluxo[]>(key) ?? [];
  const v = hist.find((h) => h.at === at);
  if (!v) return reply.code(404).send({ error: "versão não encontrada" });
  const lista = loadAutomations();
  const i = lista.findIndex((a: any) => a.id === automationId);
  const restaurado: any = { ...JSON.parse(JSON.stringify(v.auto)), updatedAt: new Date().toISOString() };
  // webhookToken é estado do SERVIDOR: restaurar o desenho não pode reviver/matar o endereço em uso.
  const tokenAtual = i >= 0 ? (lista[i] as any)?.webhookToken : undefined;
  if (tokenAtual) restaurado.webhookToken = tokenAtual; else delete restaurado.webhookToken;
  // Idem pro segredo da plataforma: restaurar um desenho antigo não pode DESLIGAR a checagem de
  // assinatura do webhook — o histórico guarda o desenho, não as credenciais em uso.
  const segredoAtual = i >= 0 ? (lista[i] as any)?.webhookSegredoEnc : undefined;
  if (segredoAtual) restaurado.webhookSegredoEnc = segredoAtual; else delete restaurado.webhookSegredoEnc;
  if (i >= 0) lista[i] = restaurado; else lista.push(restaurado);
  const quando = new Date(v.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  hist.unshift({ at: new Date().toISOString(), autor: `${autor} (restaurou a versão de ${quando})`, auto: JSON.parse(JSON.stringify(restaurado)) });
  await saveConfig(key, hist.slice(0, HIST_FLUXO_MAX));
  await saveConfig("automations", lista);
  return reply.send({ ok: true, automation: restaurado });
}
app.get("/admin/flow-history", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return listaHistorico(String((req.query as any)?.automationId ?? ""), reply);
});
app.post("/admin/flow-history/restore", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = req.body as any;
  return restauraVersao(String(b?.automationId ?? ""), String(b?.at ?? ""), await autorDaSessao(req), reply);
});
app.get("/app/flow-history", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  return runWithWorkspace(ws, async () => listaHistorico(String((req.query as any)?.automationId ?? ""), reply));
});
app.post("/app/flow-history/restore", async (req, reply) => {
  const ws = await clientWs(req, reply); if (!ws) return;
  const b = req.body as any;
  const autor = await autorDaSessao(req);
  return runWithWorkspace(ws, async () => restauraVersao(String(b?.automationId ?? ""), String(b?.at ?? ""), autor, reply));
});

// ═══ AFILIADOS SELF-SERVICE: gerador público + páginas /promo/<slug> ═════════════════════════
// Fase 1 da spec docs/afiliados-modulo-spec.md. O Traefik roteia seudominio.com.br/promo/*,
// /pagina-cadastro-afiliado e /public/afiliados/* PRA CÁ (router zapconverte_promo no stack) —
// o site continua estático; o motor renderiza a promo trocando os checkouts oficiais pelos do
// afiliado em cima do index.html real (fonte única, sem cópia da página de vendas).
const promo404 = () => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Página não encontrada — ZapConverte</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#07120D;color:#E4F5EC;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;text-align:center}a{color:#25D366;font-weight:700}</style></head><body><div><h1>Essa página de afiliado não existe (ou mudou de nome)</h1><p>Quer a sua? <a href="/pagina-cadastro-afiliado">Gere a sua página de afiliado aqui</a> — leva 1 minuto.</p></div></body></html>`;

// Headers de segurança das páginas HTML públicas (defesa em profundidade). Não uso CSP restritiva
// porque a página de vendas é cheia de <script> inline — a defesa contra XSS é o escape na saída
// (linkSeguroParaHtml). Estes headers cobrem sniffing de MIME, clickjacking e vazamento de referer.
function headersPaginaPublica(reply: any) {
  return reply
    .header("content-type", "text/html; charset=utf-8")
    .header("x-content-type-options", "nosniff")
    .header("x-frame-options", "DENY")
    .header("referrer-policy", "strict-origin-when-cross-origin");
}

// ══ WORKSHOP (landing pública + contador REAL com VIRADA DE LOTE) ════════════
// Decisões de arquitetura (o prompt pedia tabelas novas; o projeto já tem o necessário):
//  • CONFIG do evento → config store ("workshop"), o mesmo mecanismo de toda configuração daqui.
//  • VENDAS → tabela `sales`, que JÁ é idempotente por `order_id` e JÁ guarda `offer_code`,
//    alimentada pelo webhook da Kiwify que existe. Tabela nova duplicaria a verdade.
//  • A Kiwify manda `checkout_link` como CÓDIGO CURTO (ex.: "lgsNVIq") — que é exatamente o final
//    do link de cada lote. Então cada lote é contado pelo próprio código, sem configuração extra.
//  • Reembolso/chargeback viram status 'estornada' lá → saem da conta sozinhos.
interface WorkshopLote { nome: string; precoLabel: string; checkoutUrl: string; codigo: string; vagas: number }
interface WorkshopCfg {
  nome: string; dataISO: string; inicio: string; fim: string; tz: string;
  garantiaDias: number; status: "aberto" | "encerrado"; lotes: WorkshopLote[];
  // 🎚️ Como a ESCASSEZ é exibida (decisão de marketing do dono, 07/09 — os dois são % das vagas):
  //  pisoPct  = quanto o lote já mostra vendido quando abre. "Restam 50 de 50" mata a escassez:
  //             a pessoa lê "ninguém se inscreveu" e some. Começa em 95% e o número REAL só passa
  //             a valer quando alcança esse piso.
  //  tetoPct  = até onde o lote deixa passar de 100% antes de virar pro próximo. Passar de 100
  //             parece erro de página — e é de propósito: quem vê "104%" corre pra aproveitar o
  //             valor promocional, que continua valendo (o checkout segue no mesmo lote).
  pisoPct: number; tetoPct: number;
}
// O código do lote é o final da URL da Kiwify — extrair evita erro de digitação ao configurar.
const codigoDoLink = (url: string) => (String(url).match(/kiwify\.com\.br\/([A-Za-z0-9]+)/)?.[1] ?? "").trim();
const LOTES_PADRAO: WorkshopLote[] = [
  // R$ 17,00 é o que a Kiwify COBRA de verdade nessa oferta (confirmado no payload da venda da
  // uma cliente, 21/08: product_offer_name "Lote 01 R$ 17,00", charge_amount 1700). Estava 19 aqui e a
  // página anunciava um preço diferente do cobrado — o "de/por" também fica errado por tabela.
  { nome: "Lote 1", precoLabel: "R$ 17,00", checkoutUrl: "https://pay.kiwify.com.br/SEU-CHECKOUT", codigo: "lgsNVIq", vagas: 50 },
  { nome: "Lote 2", precoLabel: "R$ 27,00", checkoutUrl: "https://pay.kiwify.com.br/SEU-CHECKOUT", codigo: "284VJRz", vagas: 50 },
  { nome: "Lote 3", precoLabel: "R$ 37,00", checkoutUrl: "https://pay.kiwify.com.br/SEU-CHECKOUT", codigo: "hgGYA2S", vagas: 50 },
  { nome: "Lote 4", precoLabel: "R$ 47,00", checkoutUrl: "https://pay.kiwify.com.br/SEU-CHECKOUT", codigo: "TgtNiXF", vagas: 1000 },
];
const WORKSHOP_PADRAO: WorkshopCfg = {
  nome: "Workshop WhatsApp API + Claude IA",
  dataISO: "2026-09-05", inicio: "09:00", fim: "14:00", tz: "America/Sao_Paulo",
  garantiaDias: 7, status: "aberto", lotes: LOTES_PADRAO, pisoPct: 95, tetoPct: 110,
};
function leWorkshop(): WorkshopCfg {
  const c = (getCached<any>("workshop") ?? {}) as any;
  const n = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const lotesCru: any[] = Array.isArray(c.lotes) && c.lotes.length ? c.lotes : LOTES_PADRAO;
  const lotes = lotesCru.slice(0, 10).map((l: any, i: number) => {
    const url = /^https:\/\//i.test(String(l?.checkoutUrl ?? "")) ? String(l.checkoutUrl) : "";
    return {
      nome: String(l?.nome ?? `Lote ${i + 1}`).slice(0, 40),
      precoLabel: String(l?.precoLabel ?? "").slice(0, 40),
      checkoutUrl: url,
      // código explícito vence; sem ele, extrai do próprio link
      codigo: String(l?.codigo ?? "").trim() || codigoDoLink(url),
      vagas: Math.max(1, n(l?.vagas, 50)),
    };
  }).filter((l: WorkshopLote) => l.checkoutUrl);
  return {
    nome: String(c.nome ?? WORKSHOP_PADRAO.nome).slice(0, 120),
    dataISO: /^\d{4}-\d{2}-\d{2}$/.test(String(c.dataISO)) ? String(c.dataISO) : WORKSHOP_PADRAO.dataISO,
    inicio: /^\d{2}:\d{2}$/.test(String(c.inicio)) ? String(c.inicio) : WORKSHOP_PADRAO.inicio,
    fim: /^\d{2}:\d{2}$/.test(String(c.fim)) ? String(c.fim) : WORKSHOP_PADRAO.fim,
    tz: String(c.tz ?? WORKSHOP_PADRAO.tz),
    garantiaDias: Math.max(0, n(c.garantiaDias, 7)),
    status: String(c.status) === "encerrado" ? "encerrado" : "aberto",
    lotes: lotes.length ? lotes : LOTES_PADRAO,
    // piso entre 0 e 99 (100 seria "esgotado" desde o primeiro segundo); teto nunca abaixo de 100.
    pisoPct: Math.min(99, Math.max(0, n(c.pisoPct, 95))),
    tetoPct: Math.max(100, Math.min(300, n(c.tetoPct, 110))),
  };
}
// 📅 PRÓXIMA EDIÇÃO — o workshop acontece TODO SÁBADO. A `dataISO` do config é a data de uma
// edição específica; quando ela passa, a próxima é calculada aqui. Sem isso a página anunciava
// "5 de setembro" no dia 7, com a campanha rodando (era o que o dono via no anúncio).
// Data explícita NO FUTURO continua mandando: serve pra remarcar uma edição fora do sábado.
const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function partesEm(tz: string): { data: string; hhmm: string; dow: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { data: `${g("year")}-${g("month")}-${g("day")}`, hhmm: `${g("hour")}:${g("minute")}`, dow: DOW.indexOf(g("weekday")) };
}
const isoMaisDias = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const diasEntre = (a: string, b: string) => {
  const t = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
};
function proximaEdicao(cfg: WorkshopCfg) {
  const { data: hoje, hhmm, dow } = partesEm(cfg.tz);
  const acabouHoje = hhmm >= cfg.fim; // depois das 14h o sábado de hoje já foi
  let alvo = cfg.dataISO;
  if (alvo < hoje || (alvo === hoje && acabouHoje)) {
    const faltamPraSabado = (6 - dow + 7) % 7;           // 0 = hoje já é sábado
    alvo = isoMaisDias(hoje, faltamPraSabado === 0 && acabouHoje ? 7 : faltamPraSabado);
  }
  const dias = diasEntre(hoje, alvo);
  const [, mes, dia] = alvo.split("-").map(Number);
  const diaMes = `${dia} de ${MESES_PT[mes - 1]}`;
  // O prefixo é o que dá urgência: "amanhã" na sexta, "hoje" no próprio sábado, "próximo sábado"
  // no resto da semana (o anúncio roda todo dia — a frase tem que servir pra qualquer um deles).
  const prefixo = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : "próximo sábado";
  return {
    dataISO: alvo, diaMes, diasAte: dias, prefixo,
    // "amanhã, sábado, 12 de setembro" · "hoje, sábado, 12 de setembro" · "próximo sábado, 12 de setembro"
    rotulo: dias <= 1 ? `${prefixo}, sábado, ${diaMes}` : `${prefixo}, ${diaMes}`,
  };
}

// Cache curto: a página pergunta a cada 15s. 10s é curto o bastante pra escassez não mentir e
// longo o bastante pra não bater no banco a cada visitante.
let wsStatsCache: { at: number; body: any; reais: any[] } | null = null;
async function workshopStats(): Promise<any> {
  if (wsStatsCache && Date.now() - wsStatsCache.at < 10_000) return wsStatsCache.body;
  const cfg = leWorkshop();
  const codigos = cfg.lotes.map((l) => l.codigo).filter(Boolean);
  const porCodigo = new Map<string, number>();
  let contagemOk = codigos.length > 0;
  if (codigos.length) {
    try {
      const r = await query<{ offer_code: string; n: number }>(
        "SELECT offer_code, COUNT(*)::int AS n FROM sales WHERE offer_code = ANY($1) AND status = 'paga' GROUP BY offer_code",
        [codigos],
      );
      for (const x of r) porCodigo.set(x.offer_code, x.n);
    } catch { contagemOk = false; }
  }
  // NÚMERO EXIBIDO ≠ número real (ver pisoPct/tetoPct em WorkshopCfg).
  //   piso        = quanto o lote já nasce mostrando vendido (95% das vagas)
  //   capacidade  = quantos ingressos o lote aceita DE VERDADE antes de virar (110% das vagas)
  //   exibidos    = max(real, piso), limitado à capacidade
  // O lote só troca quando o real bate a CAPACIDADE — é isso que mantém o preço promocional
  // valendo enquanto a barra mostra mais de 100%. Sem isso o CTA já mandava pro lote seguinte
  // (mais caro) enquanto a página ainda anunciava o preço antigo: propaganda enganosa de verdade.
  const capacidadeDe = (vagas: number) => Math.max(vagas, Math.round((vagas * cfg.tetoPct) / 100));
  // VIRADA DE LOTE: o lote da vez é o primeiro que ainda cabe gente. Quando o 1º enche, o CTA passa
  // sozinho pro link do 2º — sem ninguém mexer no painel no meio da campanha. Calculado com o
  // número REAL, antes de qualquer piso: quem decide a troca é a venda, não a vitrine.
  const idxAtual = cfg.lotes.findIndex((l) => (porCodigo.get(l.codigo) ?? 0) < capacidadeDe(l.vagas));
  const lotes = cfg.lotes.map((l, i) => {
    const reais = porCodigo.get(l.codigo) ?? 0;
    const capacidade = capacidadeDe(l.vagas);
    // O piso vale SÓ no lote que está à venda. Nos futuros seria mentira sem propósito (um lote
    // que nem abriu aparecendo quase cheio) e ainda estragaria o total exibido.
    const piso = i === idxAtual ? Math.round((l.vagas * cfg.pisoPct) / 100) : 0;
    const vendidos = Math.min(Math.max(reais, piso), capacidade);
    return {
      nome: l.nome, precoLabel: l.precoLabel || null, vagas: l.vagas,
      vendidos, restantes: Math.max(l.vagas - vendidos, 0),
      esgotado: reais >= capacidade,
      _reais: reais, _capacidade: capacidade, // internos: nunca vão pro payload público
    };
  });
  const atual = idxAtual >= 0 ? { ...lotes[idxAtual], checkoutUrl: cfg.lotes[idxAtual].checkoutUrl, indice: idxAtual + 1 } : null;
  const publico = lotes.map(({ _reais, _capacidade, ...l }) => l); // o número REAL não sai daqui
  const ed = proximaEdicao(cfg);
  const body = {
    status: cfg.status === "encerrado" ? "encerrado" : atual ? "aberto" : "esgotado",
    loteAtual: atual ? {
      indice: atual.indice, nome: atual.nome, precoLabel: atual.precoLabel,
      vagas: atual.vagas, vendidos: atual.vendidos, restantes: atual.restantes,
      // PODE passar de 100 (até tetoPct): é o "erro de página" proposital que faz a pessoa correr.
      percentual: Math.min(cfg.tetoPct, Math.round((atual.vendidos / atual.vagas) * 100)),
    } : null,
    lotes: publico, // a "escada" de lotes: mostra o que já esgotou e o que vem depois
    totalVendidos: publico.reduce((a, l) => a + l.vendidos, 0),
    contagemDisponivel: contagemOk,
    evento: {
      dataISO: ed.dataISO, inicio: cfg.inicio, fim: cfg.fim, tz: cfg.tz, garantiaDias: cfg.garantiaDias,
      diaMes: ed.diaMes, rotulo: ed.rotulo, prefixo: ed.prefixo, diasAte: ed.diasAte,
    },
    updatedAt: new Date().toISOString(),
  };
  // Os números REAIS ficam só aqui, pro painel do dono. A página pública recebe os exibidos.
  const reais = lotes.map((l) => ({ nome: l.nome, vagas: l.vagas, vendidos: l._reais,
                                    capacidade: l._capacidade, exibidos: l.vendidos, esgotado: l.esgotado }));
  wsStatsCache = { at: Date.now(), body, reais };
  return body;
}
// Só admin: o que a página MOSTRA vs o que REALMENTE vendeu (o piso de escassez fica evidente).
async function workshopReais(): Promise<any[]> {
  await workshopStats();
  return wsStatsCache?.reais ?? [];
}
// 🎟️ REGISTRA A VENDA DO INGRESSO — por que isto existe (venda perdida de 06/09, de um lead,
// pedido 88651eee, R$ 17,00 do Lote 1, que NÃO apareceu no contador):
//
//  1) O contador lê a tabela `sales`. Quem escreve lá é `handleBillingEvent`, que começa com o
//     portão `isZapConverteSale` — feito pra impedir que comprar OUTRO produto do dono libere o
//     app. O ingresso do workshop é outro produto (id-do-produto…, R$ 17) e cai fora do portão: a
//     função retorna ANTES de gravar. Certo pra ativação de conta, errado pra contabilidade.
//  2) Pior: aquela venda nem chegou nesse caminho. O webhook da Kiwify estava apontado pra
//     /webhooks/fluxo/<id> (o gatilho que manda o WhatsApp de acesso), que roda o fluxo e nunca
//     encosta em `sales`.
//
// Então a gravação passa a acontecer nos DOIS caminhos, aqui: é venda de ingresso quando o
// `checkout_link` do pedido bate com o código de um lote configurado. Idempotente por order_id —
// webhook repetido, ou os dois caminhos recebendo o mesmo pedido, não conta duas vezes.
// NÃO ativa conta nenhuma: ingresso de workshop não é assinatura do app.
// `prova` = corpo cru + assinatura da Kiwify. Obrigatória: este dado alimenta o contador da página
// E o dashboard financeiro, e o webhook de FLUXO é autenticado só pelo token do fluxo — que
// pertence ao cliente dono daquele fluxo. Sem conferir a assinatura, qualquer cliente poderia
// postar um "pedido" forjado (o código do lote é público, está no link do checkout) e mexer nos
// números do dono. Com HMAC, só quem tem o segredo da Kiwify escreve aqui.
async function registraIngressoWorkshop(bruto: any, prova?: { rawBody: string; assinatura: string; segredos?: string[] }): Promise<void> {
  try {
    const o = bruto?.order ?? bruto; // a Kiwify manda o pedido na raiz; o log do painel aninha em "order"
    if (!o || typeof o !== "object") return;
    // Vale a assinatura pelo token global OU pelo token do webhook do fluxo que recebeu o pedido.
    const segredos = [config.secrets.kiwifyWebhookToken, ...(prova?.segredos ?? [])].filter(Boolean);
    if (prova && !segredos.some((seg) => verifyKiwifySignature(prova.rawBody, prova.assinatura, seg))) {
      console.warn("🎟️ pedido de workshop com assinatura inválida — NÃO contabilizado");
      return;
    }
    const aprovado = String(o.webhook_event_type ?? "") === "order_approved" || String(o.order_status ?? "") === "paid";
    if (!aprovado) return;
    const codigo = String(o.checkout_link ?? "").trim();
    if (!codigo) return;
    const lote = leWorkshop().lotes.find((l) => l.codigo === codigo);
    if (!lote) return; // não é ingresso do workshop — segue o baile
    const orderId = String(o.order_id ?? o.order_ref ?? "").trim();
    if (!orderId) return;
    const cent = (v: any) => (typeof v === "number" ? v / 100 : 0);
    const c = o.Commissions ?? o.commissions ?? {};
    const t = o.TrackingParameters ?? o.tracking_parameters ?? {};
    const email = String(o.Customer?.email ?? o.customer?.email ?? "").trim().toLowerCase() || null;
    const r = await query<{ order_id: string }>(
      // grants_access = FALSE: ingresso de workshop é VENDA, não assinatura. Sem isso o comprador
      // de R$ 17 se cadastrava com o mesmo e-mail e ganhava 37 dias de plano (auditoria 07/09).
      `INSERT INTO sales(order_id, plan, plan_name, offer_code, gross, kiwify_fee, producer_net,
                         buyer_email, status, grants_access, utm_source, utm_medium, utm_campaign, utm_content)
       VALUES($1,'workshop',$2,$3,$4,$5,$6,$7,'paga',FALSE,$8,$9,$10,$11)
       ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
      [orderId, `${lote.nome} · ${o.Product?.product_name ?? "Workshop"}`.slice(0, 120), codigo,
       cent(c.charge_amount), cent(c.kiwify_fee), cent(c.my_commission), email,
       t.utm_source ?? null, t.utm_medium ?? null, t.utm_campaign ?? null, t.utm_content ?? null],
    );
    if (r.length) {
      wsStatsCache = null; // o contador da página sobe no próximo carregamento, não daqui a 10s
      console.log(`🎟️ ingresso do workshop registrado: ${lote.nome} · ${email ?? "sem e-mail"} · pedido ${orderId}`);
    }
  } catch (e: any) {
    console.error("🎟️ falhou ao registrar ingresso do workshop:", e?.message ?? e);
  }
}

// PÚBLICO (a landing é estática e chama por trás do nginx, mesma origem). Devolve SÓ agregado —
// nunca e-mail, nome, id de comprador, valor da venda ou payload.
app.get("/public/workshop/stats", async (_req, reply) => {
  return reply.header("cache-control", "public, max-age=10").send(await workshopStats());
});
// O CTA pergunta pra ONDE ir: assim a virada de lote acontece sem redeploy do site.
app.get("/public/workshop/checkout", async (_req, reply) => {
  const cfg = leWorkshop();
  const st = await workshopStats();
  const i = (st.loteAtual?.indice ?? 0) - 1;
  const url = i >= 0 ? cfg.lotes[i]?.checkoutUrl : "";
  if (!url) return reply.code(404).send({ error: "sem lote disponível" });
  return reply.send({ url, lote: cfg.lotes[i].nome, precoLabel: cfg.lotes[i].precoLabel || null });
});
// 🔗 FICHA DO CLIQUE (o "trk"). A página manda tudo que só ELA sabe — cookies do Meta, UTMs e os
// ids do anúncio — e recebe de volta uma chave curta pra pendurar no link do checkout.
// Por que isso existe: a Kiwify devolve no webhook uma lista FIXA de campos, e fbp/fbc NÃO estão
// nela. Sem esta ficha, a venda chega sem nenhum identificador de navegador e a Meta não consegue
// ligá-la ao clique que a gerou — a campanha otimiza no escuro mesmo recebendo o Purchase.
// Aqui também nascem os cookies de 400 DIAS: o Safari (ITP) corta em 7 dias todo cookie criado por
// JavaScript, então os que a página cria sozinha morrem numa semana no iPhone. Cookie que vem do
// SERVIDOR, em Set-Cookie, escapa desse corte.
const COOKIE_400D = 400 * 24 * 60 * 60;
function indiceSubdominio(host: string): number {
  // O "1" de fb.1.… é o índice de subdomínio: conta os pedaços do domínio. .com → 1, .com.br → 2.
  const partes = String(host || "").split(":")[0].replace(/^www\./, "").split(".").filter(Boolean);
  return Math.max(1, partes.length - 1);
}
app.post("/public/workshop/sessao", LIMITE_ANONIMO, async (req, reply) => {
  const b = (req.body ?? {}) as any;
  const ip = clientIp(req);
  if (rateLimited("sessao:" + ip, 40, 600_000)) return reply.code(429).send({ error: "muitas chamadas" });
  const txt = (v: any, n = 200) => { const x = String(v ?? "").trim(); return x ? x.slice(0, n) : null; };

  const cookies = String(req.headers.cookie ?? "");
  const doCookie = (n: string) => {
    const m = cookies.match(new RegExp("(?:^|;\\s*)" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  };
  const idx = indiceSubdominio(String(req.headers.host ?? ""));
  // fbp/fbc: vale o que o navegador já tem; só criamos o que falta (nunca sobrescrever, senão a
  // pessoa "vira outra" a cada visita e o histórico de atribuição se perde).
  const fbp = txt(b.fbp) || doCookie("_fbp") || `fb.${idx}.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
  const fbclid = txt(b.fbclid, 400);
  const fbc = txt(b.fbc, 400) || doCookie("_fbc") || (fbclid ? `fb.${idx}.${Date.now()}.${fbclid}` : null);
  // O trk é CHAVE PRIMÁRIA e vinha do corpo sem nenhuma checagem de formato — dava pra escolher a
  // chave alheia e ocupar a tabela com o que quisesse. Só aceitamos de volta o que ESTE endpoint
  // emitiu (formato UUID); qualquer outra coisa ganha um trk novo em vez de ser recusada, senão
  // um cookie velho ou estranho faria a pessoa perder a atribuição no meio do funil.
  const trkPedido = txt(b.trk, 60) ?? "";
  const trk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trkPedido)
    ? trkPedido
    : randomUUID();

  if (dbEnabled) {
    await query(
      `INSERT INTO checkout_sessions
         (trk, fbp, fbc, gclid, ttclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          ad_id, adset_id, campaign_id, placement, ip, user_agent, landing_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (trk) DO UPDATE SET
         fbp = COALESCE(EXCLUDED.fbp, checkout_sessions.fbp),
         fbc = COALESCE(EXCLUDED.fbc, checkout_sessions.fbc),
         -- UTM vazia NÃO apaga a que já estava: quem volta ao site sem parâmetro (digitou a URL,
         -- veio do histórico) não pode zerar a origem do clique que trouxe a pessoa.
         utm_source   = COALESCE(EXCLUDED.utm_source,   checkout_sessions.utm_source),
         utm_medium   = COALESCE(EXCLUDED.utm_medium,   checkout_sessions.utm_medium),
         utm_campaign = COALESCE(EXCLUDED.utm_campaign, checkout_sessions.utm_campaign),
         utm_content  = COALESCE(EXCLUDED.utm_content,  checkout_sessions.utm_content),
         utm_term     = COALESCE(EXCLUDED.utm_term,     checkout_sessions.utm_term),
         ad_id        = COALESCE(EXCLUDED.ad_id,        checkout_sessions.ad_id),
         adset_id     = COALESCE(EXCLUDED.adset_id,     checkout_sessions.adset_id),
         campaign_id  = COALESCE(EXCLUDED.campaign_id,  checkout_sessions.campaign_id),
         placement    = COALESCE(EXCLUDED.placement,    checkout_sessions.placement)`,
      [trk, fbp, fbc, txt(b.gclid, 400), txt(b.ttclid, 400),
       txt(b.utm_source), txt(b.utm_medium), txt(b.utm_campaign), txt(b.utm_content), txt(b.utm_term),
       txt(b.ad_id, 60), txt(b.adset_id, 60), txt(b.campaign_id, 60), txt(b.placement, 60),
       ip && !isPrivateIp(ip) && ip !== "?" ? ip : null,
       txt(req.headers["user-agent"], 500), txt(b.url, 500)],
    ).catch((e: any) => console.error("checkout_sessions:", e?.message ?? e));
  }

  const cookie = (n: string, v: string) =>
    `${n}=${encodeURIComponent(v)}; Path=/; Max-Age=${COOKIE_400D}; SameSite=Lax; Secure`;
  const setar = [cookie("_fbp", fbp), cookie("zc_trk", trk)];
  if (fbc) setar.push(cookie("_fbc", fbc));
  return reply.header("set-cookie", setar).send({ trk, fbp, fbc });
});

// 📈 EVENTO DA LANDING → META CAPI. A página manda o evento pra CÁ e o MOTOR fala com a Meta.
// Por que não direto do navegador: o token da CAPI é secreto. Numa página estática ele ficaria
// legível no "ver código-fonte" — e com ele qualquer um injeta conversão falsa no pixel (envenena
// o aprendizado da campanha e queima verba). Aqui o token nunca sai da VPS.
// O que o navegador manda: só o que SÓ ele sabe — os cookies do Meta (_fbp, fbclid). IP e
// user-agent o motor pega da própria requisição.
// InitiateCheckout, AddPaymentInfo e Purchase são da KIWIFY (pixel dela, no checkout) — decisão do
// Admin em 12/10/2026. A página manda só o CLIQUE no botão, com nome próprio, pra não contar dobrado.
const EVENTOS_LANDING = new Set(["PageView", "ViewContent", "CliqueCheckout", "Lead"]);
// 📅 "ADICIONAR À MINHA AGENDA" da página de obrigado (16/10/2026). O link de modelo do Google Agenda
// sempre abre a tela de EDIÇÃO; o caminho de 1 clique é convidar o e-mail no evento: ele entra direto na
// agenda da pessoa (Gmail adiciona sozinho) e o Google manda o convite. Evento FIXO no servidor (o link do
// Meet do workshop) — a página não escolhe evento, então ninguém usa isto pra convidar gente pra outra
// reunião do dono. Limite por IP. Só a próxima data do evento semanal.
const MEET_WORKSHOP = "https://meet.google.com/SUA-SALA";
app.post("/public/workshop/agenda", LIMITE_ANONIMO, async (req, reply) => {
  const ip = clientIp(req);
  if (rateLimited("ws-agenda:" + ip, 6, 60 * 60_000)) return reply.code(429).send({ error: "Muitas tentativas. Tente de novo daqui a pouco." });
  const email = String((req.body as any)?.email ?? "").trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply.code(400).send({ error: "Confira o e-mail digitado." });
  return runWithWorkspace(getPrimaryWorkspace(), async () => {
    try {
      const access = await tokenGoogleDoWorkspace();
      if (!access) return reply.code(424).send({ error: "Agenda indisponível agora. Use o link do Google Agenda logo abaixo." });
      const r = await convidarParaEventoOAuth(access, "primary", MEET_WORKSHOP, email, 8);
      console.log(`📅 página de obrigado: ${email.replace(/(.{2}).*@/, "$1***@")} ${r.status === "convidado" ? "adicionado(a)" : "já estava"} em "${r.titulo.slice(0, 40)}"`);
      return reply.send({ ok: true, status: r.status, inicio: r.inicio });
    } catch (e: any) {
      console.error("página de obrigado (agenda):", String(e?.message ?? e).slice(0, 200));
      return reply.code(424).send({ error: faltaEscopo(e) ? "Agenda indisponível agora. Use o link do Google Agenda logo abaixo." : "Não consegui adicionar agora. Use o link do Google Agenda logo abaixo." });
    }
  });
});

app.post("/public/workshop/evento", LIMITE_ANONIMO, async (req, reply) => {
  const b = (req.body ?? {}) as any;
  const evento = String(b?.evento ?? "").trim();
  if (!EVENTOS_LANDING.has(evento)) return reply.code(400).send({ error: "evento não permitido" });
  // Anti-flood: landing pública, sem sessão. 40 eventos por IP a cada 10min já é folgado pra uma
  // pessoa navegando e corta script que tentar inflar conversão.
  const ip = clientIp(req);
  if (rateLimited("capi:" + ip, 40, 600_000)) return reply.code(429).send({ error: "muitos eventos" });
  // IP PRIVADO não é o do visitante — é o do contêiner do proxy. Mandar isso pra Meta não ajuda a
  // casar ninguém e ainda suja o sinal, então some com o campo. Ele só existe quando o nginx do
  // site repassa o IP verdadeiro (X-Zc-Client-Ip); sem isso o evento vai só com país + user-agent.
  const ipPublico = ip && !isPrivateIp(ip) && ip !== "?" ? ip : null;
  const ok = await enviaEventoMeta({
    evento,
    idPedido: String(b?.eventId ?? "").slice(0, 100) || null, // dedup com o pixel do navegador
    origemUrl: String(b?.url ?? "").slice(0, 400) || null,
    fbp: String(b?.fbp ?? "").slice(0, 200) || null,
    fbc: String(b?.fbc ?? "").slice(0, 300) || null,
    ip: ipPublico,
    userAgent: String(req.headers["user-agent"] ?? ""),
    conteudo: "Workshop WhatsApp API + Claude IA",
  }).catch(() => false);
  return reply.send({ ok });
});
app.get("/admin/workshop", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send({ workshop: leWorkshop(), stats: await workshopStats(), reais: await workshopReais() });
});
app.put("/admin/workshop", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  const b = (req.body ?? {}) as any;
  if (Array.isArray(b.lotes)) {
    for (const l of b.lotes) {
      if (l?.checkoutUrl && !/^https:\/\//i.test(String(l.checkoutUrl))) {
        return reply.code(400).send({ error: "o link de cada lote precisa começar com https://" });
      }
    }
  }
  await saveConfigFor(getPrimaryWorkspace(), "workshop", { ...leWorkshop(), ...b });
  wsStatsCache = null;
  console.log("🎟️ workshop: configuração atualizada");
  return reply.send({ ok: true, workshop: leWorkshop() });
});

app.get("/pagina-cadastro-afiliado", async (_req, reply) => {
  return headersPaginaPublica(reply).send(paginaGerador());
});

app.get("/promo/:slug", async (req, reply) => {
  const slug = String((req.params as any)?.slug ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return headersPaginaPublica(reply.code(404)).send(promo404());
  const p = await promoPorSlug(slug).catch(() => null);
  if (!p) return headersPaginaPublica(reply.code(404)).send(promo404());
  try {
    // no-store: o afiliado edita os links e quer ver a página nova na hora (o cache de 60s do
    // template é só do ESQUELETO da página de vendas; os checkouts entram a cada render).
    return headersPaginaPublica(reply).header("cache-control", "no-store").send(await renderPromo(p));
  } catch (e: any) {
    console.error("promo render:", e?.message ?? e);
    return headersPaginaPublica(reply.code(503)).send("<p style='font-family:sans-serif'>Página indisponível agora — tente de novo em instantes.</p>");
  }
});

// 🤝 AFILIADO NOVO → WhatsApp (pedido do dono, 13/10): o e-mail de boas-vindas sozinho não basta —
// o afiliado fechou o modal sem querer, o e-mail não apareceu e ele ficou sem os links. Agora:
//   1) o afiliado recebe pelo 11 (número que ele já conhece) a página, os links e o link de edição;
//   2) o dono recebe no 11 (enviado pelo 98) o aviso de que entrou um afiliado novo.
// Tudo best-effort: WhatsApp fora do ar não pode derrubar a criação da página.
async function avisaAfiliadoNovo(a: { nome: string; email: string; telefone: string; slug: string; editUrl: string }) {
  const ws = getPrimaryWorkspace();
  const primeiro = a.nome.split(/\s+/)[0] || a.nome;
  const pagina = `${SITE_URL}/promo/${a.slug}`;
  const meta = `${pagina}?utm_source=FB&utm_medium=afiliado&utm_campaign=${a.slug}`;
  try {
    const gw11 = gatewayDoWorkspace(ws, "lite");
    if (gw11 && a.telefone) {
      await gw11.sendText(a.telefone, [
        `Opa, ${primeiro}! aqui é da equipe, blz pura? ✌️`,
        ``,
        `Tua página de afiliado do ZapConverte já tá no ar 👇`,
        pagina,
        ``,
        `Link pra anúncio na Meta (já com rastreio):`,
        meta,
        ``,
        `Pra editar tua página depois (guarda esse link):`,
        a.editUrl,
        ``,
        `Falta só se cadastrar como afiliado na Kiwify (é ela que paga tua comissão de 50%): ${KIWIFY_AFILIADO}`,
        `E entra no grupo dos afiliados: https://chat.whatsapp.com/SEU-GRUPO`,
      ].join("\n"));
    }
  } catch (e: any) { console.error("afiliado novo (boas-vindas whatsapp):", e?.message ?? e); }
  try {
    const gw98 = gatewayDoWorkspace(ws, "lite-77d116ab");
    if (gw98) {
      await gw98.sendText("5511999999999",
        `🤝 Afiliado NOVO no ZapConverte: ${a.nome}\n${a.telefone} · ${a.email}\nPágina: ${pagina}`);
    }
  } catch (e: any) { console.error("afiliado novo (aviso ao dono):", e?.message ?? e); }
}

// ══ 📊 DASHBOARD DE LANÇAMENTO ═══════════════════════════════════════════════════════════════
// Pedido do dono (13/10): acompanhar o funil do lançamento do Workshop num lugar só — o que a
// Meta GASTOU e atribui (ads_diario) × o que a Kiwify VENDEU de verdade (kiwify_pedidos + events)
// × as conversas que chegaram (anúncio × orgânico). Regra da casa: venda real (Kiwify) vence a
// atribuição da Meta. Sincroniza a Meta a cada 30 min quando houver Integrações → Meta Ads.
async function sincronizaAdsDiario(wsId: string, dias = 3): Promise<{ linhas: number }> {
  return runWithWorkspace(wsId, async () => {
    const cfg = configMetaAdsDoWorkspace();
    if (!cfg) return { linhas: 0 };
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Araguaina" }).format(d);
    const ate = fmt(new Date());
    const desde = fmt(new Date(Date.now() - (dias - 1) * 86_400_000));
    const linhas = await insightsDiariosPorCampanha(cfg, desde, ate);
    for (const l of linhas) {
      await query(
        `INSERT INTO ads_diario(workspace_id, data, campanha, campanha_id, objetivo, gasto, impressoes, alcance, ctr_link, lpv, ic, compras, valor, conversas, fonte, atualizado)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'api', now())
         ON CONFLICT (workspace_id, data, campanha) DO UPDATE SET campanha_id=EXCLUDED.campanha_id, objetivo=EXCLUDED.objetivo,
           gasto=EXCLUDED.gasto, impressoes=EXCLUDED.impressoes, alcance=EXCLUDED.alcance, ctr_link=EXCLUDED.ctr_link,
           lpv=EXCLUDED.lpv, ic=EXCLUDED.ic, compras=EXCLUDED.compras, valor=EXCLUDED.valor, conversas=EXCLUDED.conversas,
           fonte='api', atualizado=now()`,
        [wsId, l.data, l.campanha, l.campanhaId, l.objetivo, l.gasto, l.impressoes, l.alcance, l.ctrLink, l.lpv, l.ic, l.compras, l.valor, l.conversas],
      );
    }
    return { linhas: linhas.length };
  });
}
function startAdsDiarioScheduler() {
  const tick = async () => {
    const wss = new Set<string>(scanConfig<any>("meta-ads-config").filter((c) => c.value?.enc).map((c) => c.wsId));
    if (origemMetaAds(getPrimaryWorkspace()) === "env") wss.add(getPrimaryWorkspace()); // token do .env
    for (const wsId of wss) {
      const c = { wsId };
      try { const r = await sincronizaAdsDiario(c.wsId); if (r.linhas) console.log(`📊 ads_diario ${c.wsId.slice(0, 8)}: ${r.linhas} linha(s) da Meta`); }
      catch (e: any) { console.error(`📊 ads_diario ${c.wsId.slice(0, 8)}:`, String(e?.message ?? e).slice(0, 200)); }
    }
  };
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), 30 * 60_000);
}

async function dadosLancamento(wsId: string, q: any) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Araguaina" }).format(new Date());
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(q?.de ?? "")) ? String(q.de) : "2026-10-07";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(q?.ate ?? "")) ? String(q.ate) : hoje;
  const ini = Date.parse(de + "T00:00:00-03:00") / 1000, fim = Date.parse(ate + "T00:00:00-03:00") / 1000 + 86_400;
  const ads = await query<any>(
    `SELECT to_char(data,'YYYY-MM-DD') AS data, campanha, objetivo, gasto::float, impressoes, alcance, ctr_link::float, lpv, ic, compras, valor::float, conversas, fonte, atualizado
       FROM ads_diario WHERE workspace_id=$1 AND data BETWEEN $2 AND $3 ORDER BY data, campanha`, [wsId, de, ate]).catch(() => []);
  // Vendas REAIS: kiwify_pedidos (com líquido e UTM, desde 13/10) + events de compra aprovada (antes
  // disso), sem duplicar o mesmo pedido (telefone + produto + dia).
  const vendas = await query<any>(
    `WITH p AS (
       SELECT regexp_replace(coalesce(phone,''),'[^0-9]','','g') AS fone, produto, bruto::float AS bruto, liquido::float AS liquido,
              utm_source, utm_medium, utm_campaign, utm_content, created_at, 1 AS pri
         FROM kiwify_pedidos WHERE workspace_id=$1 AND created_at >= to_timestamp($2) AND created_at < to_timestamp($3)
       UNION ALL
       SELECT regexp_replace(coalesce(phone,''),'[^0-9]','','g'), product, amount::float, NULL, NULL, NULL, NULL, NULL, created_at, 2
         FROM events WHERE workspace_id=$1 AND event='purchase_approved' AND platform='kiwify' AND created_at >= to_timestamp($2) AND created_at < to_timestamp($3)
     )
     SELECT DISTINCT ON (fone, produto, (created_at AT TIME ZONE 'America/Araguaina')::date)
            fone, produto, bruto, liquido, utm_source, utm_medium, utm_campaign, utm_content,
            to_char(created_at AT TIME ZONE 'America/Araguaina','YYYY-MM-DD') AS data,
            to_char(created_at AT TIME ZONE 'America/Araguaina','DD/MM HH24:MI') AS quando
       FROM p ORDER BY fone, produto, (created_at AT TIME ZONE 'America/Araguaina')::date, pri`, [wsId, ini, fim]).catch(() => []);
  // Conversas NOVAS no WPP Api por dia (primeira mensagem do chat cai no dia), anúncio × orgânico.
  const conversas = await query<any>(
    `WITH novas AS (
       SELECT chat_id, MIN(ts) AS primeira FROM inbox_messages
        WHERE workspace_id=$1 AND account LIKE 'meta-%' AND NOT from_me AND msg_type <> 'reaction'
        GROUP BY chat_id HAVING MIN(ts) >= $2 AND MIN(ts) < $3
     )
     SELECT to_char(to_timestamp(primeira) AT TIME ZONE 'America/Araguaina','YYYY-MM-DD') AS data,
            count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inbox_messages m WHERE m.workspace_id=$1 AND m.chat_id=novas.chat_id AND m.msg_type='ctwa'))::int AS anuncio
       FROM novas GROUP BY 1 ORDER BY 1`, [wsId, ini, fim]).catch(() => []);
  const disparos = await query<any>(
    `SELECT id, nome, total, to_char(inicio AT TIME ZONE 'America/Araguaina','DD/MM HH24:MI') AS quando, templates
       FROM disparos_fluxo WHERE workspace_id=$1 AND inicio >= to_timestamp($2) AND inicio < to_timestamp($3) ORDER BY inicio`, [wsId, ini, fim]).catch(() => []);
  return { de, ate, ads, vendas, conversas, disparos, metaAdsConfigurado: !!origemMetaAds(wsId), metaAdsOrigem: origemMetaAds(wsId) };
}
app.get("/admin/lancamento", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  return reply.send(await dadosLancamento(getPrimaryWorkspace(), req.query));
});
app.post("/admin/lancamento/sincronizar", async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: "não autorizado" });
  try { return reply.send({ ok: true, ...(await sincronizaAdsDiario(getPrimaryWorkspace(), 30)) }); }
  catch (e: any) { return reply.code(502).send({ error: String(e?.message ?? e).slice(0, 200) }); }
});

app.post("/public/afiliados/gerar", LIMITE_ANONIMO, async (req, reply) => {
  const ip = clientIp(req);
  if (rateLimited("aff-gerar:" + ip, 10, 60 * 60_000)) {
    return reply.code(429).send({ error: "Muitas tentativas seguidas — espere alguns minutos e tente de novo." });
  }
  const b = (req.body ?? {}) as any;
  const nome = String(b.nome ?? "").trim().slice(0, 80);
  // Honeypot: humano não vê o campo "site"; se veio preenchido é bot → finge sucesso e não grava.
  if (String(b.site ?? "").trim()) {
    const fake = slugDoNome(String(b.slug ?? "")) || slugDoNome(nome) || "afiliado";
    return reply.send({ ok: true, slug: fake, atualizada: false, url: `${SITE_URL}/promo/${fake}`, links: [] });
  }
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const telefone = normalizaTelefoneBR(String(b.telefone ?? ""));
  if (nome.length < 2) return reply.code(400).send({ error: "Me diz seu nome — ele vira o endereço da sua página." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Esse e-mail não parece válido — confere?" });
  if (telefone.length < 12 || telefone.length > 15) return reply.code(400).send({ error: "WhatsApp inválido — use DDD + número (ex.: 11 91234-5678)." });
  const links = {} as Record<OfertaKey, string>;
  for (const o of OFERTAS) {
    const v = String(b[o.key] ?? "").trim();
    if (!ehCheckoutKiwify(v)) {
      return reply.code(400).send({ error: `O link do ${o.rotulo} precisa ser um checkout da Kiwify (começa com https://pay.kiwify.com.br/...).` });
    }
    links[o.key] = v;
  }
  try {
    const r = await upsertPromo({
      nome, email, telefone, links,
      slug: String(b.slug ?? "").slice(0, 80),
      trial3Dias: !!b.trial,
      whatsFlutuante: !!b.whats_flutuante,
      editKey: b.editKey ? String(b.editKey) : undefined,
      metaPixelId: String(b.meta_pixel_id ?? "").trim().slice(0, 40) || undefined,
      metaCapiToken: String(b.meta_capi_token ?? "").trim().slice(0, 300) || undefined,
      googleAdsId: String(b.google_ads_id ?? "").trim().slice(0, 40) || undefined,
      googleAdsLabel: String(b.google_ads_label ?? "").trim().slice(0, 60) || undefined,
      tiktokPixelId: String(b.tiktok_pixel_id ?? "").trim().slice(0, 40) || undefined,
      tiktokAccessToken: String(b.tiktok_access_token ?? "").trim().slice(0, 300) || undefined,
    });
    // Página já existe e a chave não confere → NÃO sobrescreve (anti-sequestro de comissão).
    if (!r.ok) {
      return reply.code(403).send({ error: "Já existe uma página de afiliado com esse e-mail. Pra editá-la, use o link de edição que você recebeu ao criá-la (mandamos também no seu e-mail). Perdeu? Fale com o suporte." });
    }
    // Gerou a página = está no programa → entra JÁ na lista de Afiliados do painel (não espera a
    // primeira venda). Best-effort: falha aqui não pode derrubar a criação da página.
    void garanteAfiliado({ nome, email, telefone, origem: "gerou página" }).catch((e: any) => console.error("garanteAfiliado (gerar):", e?.message ?? e));
    const editUrl = r.editKey ? `${SITE_URL}/pagina-cadastro-afiliado?email=${encodeURIComponent(email)}&k=${r.editKey}` : undefined;
    // 1ª criação (editUrl setado) → e-mail de BOAS-VINDAS de afiliado (Fase B): página, links de
    // divulgação, comissão, grupo e o link de edição. Best-effort, não bloqueia a resposta.
    if (editUrl) {
      const wt = tplAfiliadoWelcome({ nome, pageUrl: `${SITE_URL}/promo/${r.slug}`, editUrl, links: linksDivulgacao(r.slug) });
      void sendEmail(email, wt.subject, wt.html).catch(() => {});
      void avisaAfiliadoNovo({ nome, email, telefone, slug: r.slug, editUrl });
    }
    return reply.send({ ok: true, slug: r.slug, atualizada: r.atualizada, url: `${SITE_URL}/promo/${r.slug}`, links: linksDivulgacao(r.slug), editUrl });
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
});

// ── "MEUS SITES" no painel: a página /promo do PRÓPRIO usuário logado ────────────────────────
// O cruzamento é pelo E-MAIL (chave do gerador E da conta do trial de afiliado). Cada usuário vê a
// página DO SEU e-mail — vale pro dono do workspace e pra membro (a página de afiliado é pessoal).
app.get("/app/afiliado/pagina", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const p = await promoPorEmail(String(s.user.email ?? ""));
  if (!p) return reply.send({ pagina: null, gerador: `${SITE_URL}/afiliados` });
  return reply.send({
    pagina: {
      slug: p.slug,
      url: `${SITE_URL}/promo/${p.slug}`,
      nome: p.nome,
      trial3Dias: !!p.trial_3_dias,
      links: linksDivulgacao(p.slug),
    },
    gerador: `${SITE_URL}/afiliados`,
  });
});
// Recuperação do link de edição SEM suporte: sessão com o e-mail dono = prova de posse. Rotaciona
// a chave (o link antigo morre) e devolve o novo — o mesmo formato do e-mail de boas-vindas.
app.post("/app/afiliado/edit-link", async (req, reply) => {
  const s = await clientSession(req, reply); if (!s) return;
  const email = String(s.user.email ?? "").toLowerCase();
  const chave = await novaChaveEdicao(email);
  if (!chave) return reply.code(404).send({ error: "não achei uma página de afiliado no seu e-mail — crie a sua primeiro" });
  return reply.send({ ok: true, editUrl: `${SITE_URL}/pagina-cadastro-afiliado?email=${encodeURIComponent(email)}&k=${chave}` });
});

// ── Teste grátis de 3 dias pela página do afiliado (fase 2 da spec) ───────────
const PAINEL_URL = (process.env.PAINEL_PUBLIC_URL || "https://painel.seudominio.com.br").replace(/\/+$/, "");
// Link de cadastro de afiliado na Kiwify + grupo de afiliados (usados no popup do afiliados.html).
const KIWIFY_AFILIADO = process.env.KIWIFY_AFILIADO_URL || "https://dashboard.kiwify.com/join/affiliate/51lFnv0D";
const GRUPO_AFILIADOS = "https://chat.whatsapp.com/SEU-GRUPO";
// Código de UM uso pra logar o lead direto no painel (troca código→sessão do outro domínio).
// Em memória (réplica única) com TTL de 10min — o token de sessão nunca aparece em URL.
const trialCodes = new Map<string, { token: string; at: number }>();

app.post("/public/afiliados/trial", LIMITE_ANONIMO, async (req, reply) => {
  const ip = clientIp(req);
  // Teto de contas por IP por hora (antiabuso da spec §5) — countOnly: só criação de verdade conta.
  if (rateLimited("aff-trial:" + ip, 5, 3_600_000, true)) {
    return reply.code(429).send({ error: "Muitas contas criadas deste endereço — tente de novo mais tarde." });
  }
  const b = (req.body ?? {}) as any;
  // Honeypot: humano não vê o campo "site" — bot "sucede" sem criar nada.
  if (String(b.site ?? "").trim()) return reply.send({ ok: true, entrar: PAINEL_URL });
  const slug = String(b.slug ?? "").toLowerCase().slice(0, 60);
  const promo = /^[a-z0-9-]{2,60}$/.test(slug) ? await promoPorSlug(slug).catch(() => null) : null;
  if (!promo) return reply.code(400).send({ error: "página de afiliado inválida" });
  if (!promo.trial_3_dias) return reply.code(400).send({ error: "esta página não oferece teste grátis" });
  const nome = String(b.nome ?? "").trim().slice(0, 80);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const telefone = normalizaTelefoneBR(String(b.telefone ?? ""));
  if (nome.length < 2) return reply.code(400).send({ error: "Me diz seu nome completo." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Esse e-mail não parece válido — confere?" });
  if (telefone.length < 12 || telefone.length > 15) return reply.code(400).send({ error: "WhatsApp inválido — use DDD + número (ex.: 11 91234-5678)." });

  // 1 conta por e-mail (antiabuso): quem já tem conta entra pelo login normal.
  const jaExiste = await query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  // A resposta distingue "tem conta" de "não tem" — é um oráculo de enumeração, e sem esta marca
  // ele era ILIMITADO: o countOnly acima só CONSULTA a janela, e a sonda saía antes de qualquer
  // rateNote (auditoria 07/09). O lead de verdade passa por aqui uma vez só.
  if (jaExiste.length) { rateNote("aff-trial:" + ip, 3_600_000); return reply.send({ ok: true, jaTem: true, entrar: PAINEL_URL + "/entrar" }); }

  // Conta com senha aleatória (o lead entra logado pelo código; troca a senha nas Configurações).
  // autoConfirm: o lead entrou pelo funil dele (a página do afiliado) — sem atrito de confirmação de e-mail.
  const r = await signup({ name: nome, email, password: randomBytes(9).toString("base64url") }, { autoConfirm: true });
  if ("error" in r) { rateNote("aff-trial:" + ip, 3_600_000); return reply.code(400).send({ error: r.error }); }
  if (!("token" in r)) return reply.code(500).send({ error: "falha ao criar a conta de teste" }); // autoConfirm garante token; guard p/ TS
  rateNote("aff-trial:" + ip, 3_600_000); // criou de verdade → conta no teto por IP

  // 3 dias de teste + atribuição (se o e-mail da página também é um afiliado cadastrado, amarra).
  const aff = await query<{ id: string }>("SELECT id FROM affiliates WHERE lower(email)=$1 AND active=TRUE", [promo.email]);
  await grantTrialByEmail(email, 3, aff[0]?.id).catch((e: any) => console.error("trial grant:", e?.message ?? e));

  // Lead gravado com o slug DA PÁGINA visitada + UTMs (a busca depois é por CONJUNTO de slugs — §3).
  const ws = await query<{ id: string }>(
    "SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1", [email],
  ).catch(() => [] as Array<{ id: string }>);
  const corta = (v: any, n: number) => String(v ?? "").slice(0, n) || null;
  await query(
    `INSERT INTO trial_leads(id, slug, lead_nome, lead_email, lead_telefone, lead_whatsapp, account_id,
       utm_source, utm_medium, utm_campaign, utm_content)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    ["tl_" + randomUUID(), slug, nome, email, telefone, telefone, ws[0]?.id ?? null,
      corta(b.utm_source, 80), corta(b.utm_medium, 80), corta(b.utm_campaign, 80), corta(b.utm_content, 80)],
  ).catch((e: any) => console.error("trial_leads:", e?.message ?? e)); // lead não pode derrubar a conta já criada

  // Aviso no WhatsApp do afiliado (fluxo "AVISO TRIAL 3D AFILIADO").
  disparaAvisoTrial({
    lead: { nome, telefone, email },
    afiliado: { nome: promo.nome, telefone: promo.whatsapp || promo.telefone, slug },
    utm: { source: b.utm_source, medium: b.utm_medium, campaign: b.utm_campaign, content: b.utm_content, term: b.utm_term },
    pagina: b.pagina,
    raw: { origem: "promo", slug, lead: { nome, email } },
  });

  // Boas-vindas pro LEAD (Fase B): onboarding do teste grátis. Best-effort, não bloqueia a entrada.
  { const wl = tplTrialLeadWelcome(nome.split(" ")[0] || ""); void sendEmail(email, wl.subject, wl.html).catch(() => {}); }

  const code = randomBytes(24).toString("hex");
  trialCodes.set(code, { token: r.token, at: Date.now() });
  console.log(`🎁 teste grátis: ${email} pela página /promo/${slug}`);
  return reply.send({ ok: true, entrar: `${PAINEL_URL}/api/auth/trial-entrar?c=${code}` });
});

// Troca o código de 1 uso pela sessão (chamado pelo painel em /api/auth/trial-entrar).
app.post("/auth/trial-code", LIMITE_ANONIMO, async (req, reply) => {
  if (rateLimited("trial-code:" + clientIp(req), 30, 900_000)) return reply.code(429).send({ error: "muitas tentativas" });
  const code = String((req.body as any)?.code ?? "");
  const hit = trialCodes.get(code);
  trialCodes.delete(code); // um uso só — válido ou não
  for (const [k, v] of trialCodes) if (Date.now() - v.at > 10 * 60_000) trialCodes.delete(k);
  if (!hit || Date.now() - hit.at > 10 * 60_000) return reply.code(401).send({ error: "código inválido ou expirado — entre com e-mail e senha" });
  return reply.send({ token: hit.token });
});

// ═══ POPUP "QUERO ME AFILIAR" (afiliados.html) → LEAD DE AFILIADO ═════════════════════════════
// O popup coleta nome/telefone/email e chama isto. A gente: (1) dá 30 dias grátis da plataforma
// (cria a conta se não existir), (2) manda o WhatsApp de boas-vindas pro LEAD (fluxo editável
// "NOVO AFILIADO ZAPCONVERTE") com o grupo + link de acesso, e (3) devolve o link da Kiwify pro
// popup redirecionar e ele finalizar o cadastro de afiliado lá.
app.post("/public/afiliados/lead", LIMITE_ANONIMO, async (req, reply) => {
  const ip = clientIp(req);
  if (rateLimited("aff-lead:" + ip, 8, 3_600_000, true)) {
    return reply.code(429).send({ error: "Muitas tentativas deste endereço — tente de novo mais tarde." });
  }
  const b = (req.body ?? {}) as any;
  // Honeypot: humano não vê o campo "site" — bot "sucede" sem gravar nada, só leva pra Kiwify.
  if (String(b.site ?? "").trim()) return reply.send({ ok: true, kiwify: KIWIFY_AFILIADO });
  const nome = String(b.nome ?? "").trim().slice(0, 80);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const telefone = normalizaTelefoneBR(String(b.telefone ?? ""));
  if (nome.length < 2) return reply.code(400).send({ error: "Me diz seu nome." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "Esse e-mail não parece válido — confere?" });
  if (telefone.length < 12 || telefone.length > 15) return reply.code(400).send({ error: "WhatsApp inválido — use DDD + número (ex.: 11 91234-5678)." });

  try {
    // 30 dias de acesso grátis. Cria a conta se ainda não existir (autoConfirm: veio do nosso
    // próprio funil). Quem já tem conta só ganha o trial estendido — sem recriar.
    const jaTem = await query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
    const novaConta = jaTem.length === 0;
    if (novaConta) {
      const r = await signup({ name: nome, email, password: randomBytes(9).toString("base64url") }, { autoConfirm: true });
      if ("error" in r) { rateNote("aff-lead:" + ip, 3_600_000); return reply.code(400).send({ error: r.error }); }
    }
    rateNote("aff-lead:" + ip, 3_600_000);
    // 🔐 O trial só é concedido a conta NOVA (auditoria 07/09). Antes rodava também para conta
    // existente, e como grantTrialByEmail SOMA em cima do trial vigente, este endpoint público e
    // sem autenticação virava acesso grátis infinito: bastava repetir a chamada com o próprio
    // e-mail (8x/hora por IP, e o IP é rotacionável). Pior: ele também reescrevia o status de uma
    // conta ESTORNADA de volta pra 'trial', desfazendo a revogação do reembolso/chargeback.
    // Conta que já existe entra pelo login normal — o funil segue funcionando igual pro lead novo.
    if (novaConta) await grantTrialByEmail(email, 30).catch((e: any) => console.error("aff-lead trial:", e?.message ?? e));

    // ⚠️ SEGURANÇA (anti account-takeover): o link de DEFINIR SENHA (reset) só é gerado/enviado pra
    // conta RECÉM-CRIADA — que ainda não tem dono nem senha. Pra uma conta que JÁ existe, mandar um
    // link de redefinição pro telefone/e-mail informados NO REQUEST deixaria qualquer um assumir a
    // conta da vítima (bastava pôr o e-mail dela + o próprio contato). Conta existente = login normal.
    // Pediu pra se afiliar pelo popup → também entra JÁ na lista de Afiliados do painel.
    void garanteAfiliado({ nome, email, telefone, origem: "popup afiliados" }).catch((e: any) => console.error("garanteAfiliado (lead):", e?.message ?? e));
    if (novaConta) {
      let acessoLink = `${PAINEL_URL}/entrar`;
      // 7 dias (não 1h): este link chega no WhatsApp/e-mail SEM ela ter pedido — quem abrisse a
      // mensagem mais tarde encontrava o link morto e parava na porta (auditoria 10/08).
      const rp = await requestPasswordReset(email, MIN_LINK_ONBOARDING).catch(() => null);
      if (rp) acessoLink = `${PAINEL_URL}/redefinir?t=${rp.token}`;
      // WhatsApp de boas-vindas (fluxo "NOVO AFILIADO ZAPCONVERTE"): grupo + acesso 30 dias.
      disparaBoasVindasAfiliado({ nome, telefone, acessoLink });
      // E-mail específico do afiliado que ativou os 30 dias (copy própria). Best-effort.
      { const t = tplAfiliadoTrial30({ nome, acessoLink }); void sendEmail(email, t.subject, t.html).catch(() => {}); }
      console.log(`🤝 afiliado trial 30d (conta nova): ${email} (${telefone})`);
      return reply.send({ ok: true, novaConta: true, acesso: acessoLink });
    }
    // Conta já existia: só estendeu o trial. Sem link de reset (anti-takeover) e sem e-mail/WhatsApp
    // pra contatos informados no request — ela entra pelo login normal.
    console.log(`🤝 afiliado trial 30d (conta já existia): ${email}`);
    return reply.send({ ok: true, novaConta: false });
  } catch (e: any) {
    return reply.code(502).send({ error: e?.message ?? "erro ao processar" });
  }
});

// Dispara o fluxo "NOVO AFILIADO ZAPCONVERTE" pro telefone do LEAD (ele é o contato do evento).
// {{grupo}} e {{acesso_link}} viram variáveis nos passos do fluxo (editável no builder).
function disparaBoasVindasAfiliado(d: { nome: string; telefone: string; acessoLink: string }): void {
  const tel = String(d.telefone ?? "").replace(/\D/g, "");
  if (!tel) return;
  const fields: Record<string, string> = {
    nome: d.nome.slice(0, 80),
    primeiro_nome: (d.nome.split(" ")[0] || "").slice(0, 40),
    telefone: tel,
    grupo: GRUPO_AFILIADOS,
    acesso_link: d.acessoLink,
    // {{kiwify}} = cadastro de afiliado na Kiwify. É QUEM PAGA a comissão: sem esse cadastro a
    // pessoa divulga e não recebe nada. A variável existe pro texto do fluxo poder cobrar o passo
    // (auditoria 10/08: nenhuma etapa da jornada pedia isso).
    kiwify: KIWIFY_AFILIADO,
  };
  const wsId = getPrimaryWorkspace();
  const ev: NormalizedEvent = {
    platform: "web",
    event: "novo_afiliado",
    eventId: "afiliado-" + Date.now() + "-" + tel,
    contact: { name: fields.nome || tel, firstName: fields.primeiro_nome, phone: tel },
    fields,
    raw: { origem: "popup-afiliados" },
  };
  console.log(`🤝 boas-vindas afiliado → ${tel}`);
  setImmediate(() =>
    serializeByPhone(wsId + ":" + tel, () =>
      runWithWorkspace(wsId, async () => {
        try {
          await upsertContact(tel, fields.nome || undefined, "afiliado");
          await runAutomationsFor(ev, withEchoGuard(gateway), loadAutomations());
        } catch (e: any) {
          console.error("boas-vindas afiliado:", e?.message ?? e);
        }
      }),
    ),
  );
}

// ═══ TESTE GRÁTIS → AVISA O AFILIADO ═════════════════════════════════════════════════════════
// Recebe o lead que acabou de pedir trial num site parceiro (seudominio.com.br) e dispara o fluxo
// "AVISO TRIAL 3D AFILIADO" — que manda o WhatsApp PRO AFILIADO, não pro lead.
// Auth: header `x-trial-token` (ou ?token=) igual a TRIAL_WEBHOOK_TOKEN do .env. Sem token
// configurado, o endpoint fica DESLIGADO (503) — melhor que ficar aberto na internet.
// Corpo esperado (JSON):
//   { "lead":     { "nome": "...", "telefone": "5511...", "email": "...", "instagram": "@..." },
//     "afiliado": { "nome": "...", "telefone": "5511...", "slug": "..." } }
// Núcleo do aviso: monta o evento e dispara o fluxo "AVISO TRIAL 3D AFILIADO" — o CONTATO do
// evento é o AFILIADO (o WhatsApp do aviso vai pra ele, não pro lead). Usado pelo /webhooks/trial
// (sites parceiros) e pelo teste grátis das páginas /promo (fase 2 da spec de afiliados).
function disparaAvisoTrial(d: {
  lead: { nome?: string; telefone?: string; email?: string; instagram?: string };
  afiliado: { nome?: string; telefone: string; slug?: string };
  utm: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  pagina?: string;
  raw?: unknown;
}): void {
  const soDigitos = (v: any) => String(v ?? "").replace(/\D/g, "");
  const telAfiliado = soDigitos(d.afiliado.telefone);
  if (!telAfiliado) return;
  const corta = (v: any, n: number) => String(v ?? "").slice(0, n);
  const u = {
    source: corta(d.utm.source, 80), medium: corta(d.utm.medium, 80), campaign: corta(d.utm.campaign, 80),
    content: corta(d.utm.content, 80), term: corta(d.utm.term, 80),
  };
  // A LINHA INTEIRA (rótulo incluído) é montada AQUI, não no texto do fluxo: se não vier UTM
  // nenhuma ela some por completo. Se o rótulo ficasse no texto, um lead de tráfego direto
  // receberia "- UTM:" pendurado sem valor nenhum.
  const partesOrigem = [u.source, u.medium, u.campaign, u.content, u.term].filter(Boolean);
  const origem = partesOrigem.length ? "- UTM: Veio de: " + partesOrigem.join(" · ") : "";
  const fields: Record<string, string> = {
    lead_nome: corta(d.lead.nome, 80),
    lead_telefone: soDigitos(d.lead.telefone),
    lead_email: corta(d.lead.email, 120),
    lead_instagram: corta(d.lead.instagram, 60),
    afiliado_nome: corta(d.afiliado.nome, 80),
    afiliado_slug: corta(d.afiliado.slug, 60),
    // {{origem}} = a linha pronta (ou vazia). As UTMs soltas ficam disponíveis pra quem quiser
    // montar o texto do jeito dele no builder.
    origem,
    utm_source: u.source, utm_medium: u.medium, utm_campaign: u.campaign,
    utm_content: u.content, utm_term: u.term,
    pagina: corta(d.pagina, 300),
  };
  const wsId = getPrimaryWorkspace();
  const ev: NormalizedEvent = {
    platform: "trial",
    event: "lead_trial",
    eventId: "trial-" + Date.now() + "-" + telAfiliado,
    // O CONTATO é o AFILIADO: é o telefone dele que recebe a mensagem do fluxo.
    contact: { name: fields.afiliado_nome || telAfiliado, firstName: (fields.afiliado_nome || "").split(" ")[0] || "", phone: telAfiliado },
    fields,
    raw: d.raw ?? d,
  };
  console.log(`🎟️ trial: lead "${fields.lead_nome}" → avisar afiliado ${telAfiliado}`);
  setImmediate(() =>
    serializeByPhone(wsId + ":" + telAfiliado, () =>
      runWithWorkspace(wsId, async () => {
        try {
          await upsertContact(telAfiliado, fields.afiliado_nome || undefined, "trial");
          await runAutomationsFor(ev, withEchoGuard(gateway), loadAutomations());
        } catch (e: any) {
          console.error("aviso trial:", e?.message ?? e);
        }
      }),
    ),
  );
}

app.post("/webhooks/trial", LIMITE_WEBHOOK, async (req, reply) => {
  const esperado = process.env.TRIAL_WEBHOOK_TOKEN || "";
  if (!esperado) return reply.code(503).send({ error: "webhook de trial desligado (defina TRIAL_WEBHOOK_TOKEN)" });
  const veio = String(req.headers["x-trial-token"] ?? (req.query as any)?.token ?? "");
  if (veio !== esperado) return reply.code(401).send({ error: "token inválido" });

  const b = (req.body ?? {}) as any;
  const lead = b.lead ?? {};
  const afiliado = b.afiliado ?? b.affiliate ?? {};
  const telAfiliado = String(afiliado.telefone ?? afiliado.phone ?? "").replace(/\D/g, "");
  if (!telAfiliado) return reply.code(400).send({ error: "afiliado.telefone é obrigatório (é quem recebe o aviso)" });
  // UTMs: aceita aninhado (utm:{source,…}) OU solto no corpo (utm_source,…) — cada site manda de
  // um jeito e não vale quebrar a integração por causa disso.
  const utm = b.utm ?? {};
  const pegaUtm = (nome: string) => String(utm[nome] ?? b["utm_" + nome] ?? "");
  // Responde JÁ (o site parceiro não fica esperando o WhatsApp) e processa em seguida.
  reply.code(200).send({ ok: true });
  disparaAvisoTrial({
    lead: { nome: lead.nome ?? lead.name, telefone: lead.telefone ?? lead.phone, email: lead.email, instagram: lead.instagram },
    afiliado: { nome: afiliado.nome ?? afiliado.name, telefone: telAfiliado, slug: afiliado.slug },
    utm: { source: pegaUtm("source"), medium: pegaUtm("medium"), campaign: pegaUtm("campaign"), content: pegaUtm("content"), term: pegaUtm("term") },
    pagina: b.url ?? b.pagina,
    raw: b,
  });
});

app.post("/webhooks/:platform", LIMITE_WEBHOOK, async (req, reply) => {
  const platform = (req.params as any).platform as string;
  const rawBody = (req as any).rawBody as string;
  const query = req.query as any;

  // Captura o payload BRUTO de cada webhook (para estudar os formatos reais).
  const captureFile = process.env.WEBHOOK_CAPTURE_FILE;
  if (captureFile) {
    try {
      appendFileSync(
        captureFile,
        JSON.stringify({ ts: new Date().toISOString(), platform, query, body: rawBody }) + "\n",
      );
    } catch {
      /* ignora erro de captura */
    }
  }

  let ev: NormalizedEvent;

  if (platform === "kiwify") {
    if (!verifyKiwifySignature(rawBody, query.signature, config.secrets.kiwifyWebhookToken)) {
      return reply.code(401).send({ error: "assinatura inválida" });
    }
    ev = parseKiwify(req.body);
    // Captura o CRU (últimos 8) pra confirmar campos de afiliado no 1º afiliado real — sem chutar.
    recentKiwify.unshift({ at: new Date().toISOString(), event: ev.event, affiliate: ev.affiliate ?? null, raw: req.body });
    // 🎟️ Ingresso do workshop: gravado ANTES do billing porque o portão do billing (isZapConverteSale)
    // barra este produto de propósito — ele não ativa conta no app, mas é venda e tem que contar.
    void registraIngressoWorkshop(req.body);
    if (recentKiwify.length > 8) recentKiwify.length = 8;
  } else {
    console.log(`webhook ${platform} (sem parser ainda):`, JSON.stringify(req.body).slice(0, 300));
    return reply.code(200).send({ ok: true, note: "plataforma sem parser" });
  }

  // Billing do SaaS: SÍNCRONO e idempotente (comissão UNIQUE por order_id; UPDATE do workspace
  // é reexecutável). Rodar antes do 200 faz o Kiwify REENVIAR se algo falhar (não perde a ativação).
  try {
    await handleBillingEvent({
      event: ev.event,
      email: ev.contact.email ?? null,
      amount: ev.amount ?? null,
      productId: ev.product?.id ?? null,
      orderId: ev.eventId,
      affiliate: ev.affiliate ?? null,
      planName: ev.plan?.name ?? null,
      offerCode: ev.plan?.offerCode ?? null,
      kiwifyFee: ev.fees?.kiwify ?? null,
      producerNet: ev.fees?.producerNet ?? null,
      tracking: ev.tracking ?? null,
      buyerName: ev.contact.name ?? null,
      buyerPhone: ev.contact.phone ?? null,
    }, async ({ email, name, phone }) => {
      // Boas-vindas com LINK DE CADASTRO (e-mail da compra pré-preenchido). O cliente cria a conta
      // com a própria senha e o acesso é liberado na hora (cruzamento com a venda no signup).
      const first = (name || "").split(" ")[0] || "";
      const link = `https://painel.seudominio.com.br/cadastro?email=${encodeURIComponent(email)}${name ? `&nome=${encodeURIComponent(name)}` : ""}`;
      const wa =
        `Olá${first ? " " + first : ""}! 🎉 Sua compra do *ZapConverte* foi confirmada!\n\n` +
        `Pra ativar seu acesso, é só criar sua conta (leva 30 segundos):\n👉 ${link}\n\n` +
        `O e-mail da compra já vem preenchido — você só define uma senha e pronto. Qualquer dúvida, chama aqui! 🚀`;
      // O WhatsApp de boas-vindas é a mensagem mais cara de perder do ciclo todo: é ela que leva o
      // link de cadastro pro cliente que ACABOU de pagar. Uma tentativa só não serve — a UazAPI
      // devolve 503 esporádico (aconteceu na venda da Ana Dux, 18/08 14:21: 503 e a mensagem morreu
      // ali). Tenta 3× com espera crescente. Vai em SEGUNDO PLANO de propósito: o e-mail já saiu
      // de forma síncrona e é a garantia; o webhook da Kiwify não pode ficar esperando retry.
      if (phone) {
        void (async () => {
          const esperas = [0, 2000, 6000];
          for (let i = 0; i < esperas.length; i++) {
            if (esperas[i]) await new Promise((r) => setTimeout(r, esperas[i]));
            try {
              await gateway.sendText(phone, wa);
              console.log(`🤝 boas-vindas no WhatsApp → ${phone}${i ? ` (na ${i + 1}ª tentativa)` : ""}`);
              return;
            } catch (e: any) {
              console.error(`wa boas-vindas ${phone} tentativa ${i + 1}/${esperas.length}:`, e?.message ?? e);
            }
          }
          // Esgotou: grita com TUDO que o dono precisa pra mandar na mão, sem caçar em lugar nenhum.
          console.warn(`🚨 boas-vindas NÃO foram pro WhatsApp de ${phone} (${email}) após 3 tentativas. Mande o link na mão: ${link}`);
        })();
      }
      const html =
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0e1a15">` +
        `<h2 style="color:#0b7a3b">Sua compra foi confirmada! 🎉</h2>` +
        `<p>Olá${first ? " " + esc(first) : ""}, seu acesso ao ZapConverte está garantido. Pra começar, é só criar sua conta — o e-mail da compra já vem preenchido, você só define uma senha:</p>` +
        `<p style="margin:20px 0"><a href="${link}" style="background:#12A150;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">Criar minha conta e acessar</a></p>` +
        `<p style="color:#6a7a72;font-size:13px">Se o botão não abrir, use este link:<br><a href="${link}">${link}</a></p></div>`;
      const mailOk = await sendEmail(email, "Ative seu acesso ao ZapConverte 🚀", html);
      if (!mailOk) {
        console.warn(`⚠️  boas-vindas de ${email} NÃO saíram por e-mail — se o WhatsApp também falhar, mande o link na mão: ${link}`);
      }
    }, async ({ email, name, plan, renewed }) => {
      // Conta JÁ EXISTIA e virou pagante (Fase B) → boas-vindas de assinatura. Renovação automática
      // NÃO leva welcome (recibo de renovação fica pra Fase D).
      if (renewed) return;
      const t = tplClienteWelcome((name || "").split(" ")[0] || "", plan);
      await sendEmail(email, t.subject, t.html).catch((e) => console.error("welcome cliente:", e?.message));
    }, async (info) => {
      // Fase C: venda nova de afiliado → avisa ele (e-mail + WhatsApp) com comissão e dados do cliente.
      await notificaAfiliadoVenda(info);
    }, async (info) => {
      // Fase D: cliente cancelou a renovação → e-mail de win-back (acesso até X + reativar).
      await notificaCancelamento(info);
    });
    // Dunning (Fase A): renovação falhou (subscription_late) → e-mail pra regularizar. Helper no
    // nível do módulo porque aqui dentro `query` é o req.query (sombreado), não o do banco.
    if (ev.event === "payment_delayed" && ev.contact.email) await enviaDunning(ev.contact.email, ev.contact.name ?? null);
  } catch (e) {
    console.error("billing:", e);
    return reply.code(500).send({ error: "billing falhou — reenviar" });
  }

  // 📧 RECUPERAÇÃO POR E-MAIL (Pix + carrinho) — só o produto ZapConverte. Nunca derruba o
  // webhook: falhou, loga e segue (o WhatsApp do fluxo continua indo).
  try {
    const email = ev.contact.email ?? "";
    if (email && ehProdutoZapConverte(ev.product?.id ?? null, ev.amount ?? null)) {
      const bruto: any = (req.body as any)?.order ?? req.body;
      if (ev.event === "pix_generated" || ev.event === "cart_abandoned") {
        await agendaRecuperacao({
          tipo: ev.event === "pix_generated" ? "pix" : "carrinho",
          email,
          orderId: ev.eventId || null,
          nome: ev.contact.name ?? "",
          valor: ev.amount ?? null,
          pix: ev.pixCode ?? null,
          expira: bruto?.pix_expiration ?? null,
          checkout: ev.links?.checkout ?? null,
        });
      } else if (ev.event === "purchase_approved" || ev.event === "subscription_renewed") {
        await encerraRecuperacao(email);
      }
    }
  } catch (e: any) {
    console.error("recuperação por e-mail (agendar):", e?.message ?? e);
  }

  // Idempotência do lado das AUTOMAÇÕES (fluxos): dedup por (plataforma, id, evento).
  const key = `${ev.platform}:${ev.eventId}:${ev.event}`;
  const duplicate = await isDuplicate(key);
  if (!duplicate) {
    // Responde rápido e processa depois (não travar o webhook da plataforma).
    setImmediate(() => processEvent(ev).catch((e) => console.error("erro no motor:", e)));
  }

  console.log(
    `📥 ${ev.platform} · ${ev.event} · ${ev.contact.name || "?"} · ${ev.contact.phone || "sem telefone"}${duplicate ? " (duplicado)" : ""}`,
  );
  return reply.code(200).send({ ok: true, event: ev.event, duplicate });
});

initSchema()
  .then(() => ensureAdminSeed()) // admin + workspace do dono existem
  .then(() => backfillTenancy()) // multi-tenant Fase 1: dados atuais → workspace do dono; devolve o id
  .then((primaryWs) => setPrimaryWorkspace(primaryWs)) // config-store aprende o workspace primário
  .then(() => refreshConfigCache()) // carrega a config JÁ sabendo o primário (linhas antigas caem nele)
  .then(async () => {
    // Fase 4 (backfill de roteamento): registra a instância primária + as LITE salvas → workspace do dono.
    const ws = getPrimaryWorkspace();
    if (ws && ws !== "__primary__") {
      if (config.uazapi.token) await upsertInstance(config.uazapi.token, ws, { platform: "lite", name: "Principal" }).catch(() => {});
      for (const it of getCached<LiteStored[]>("lite-instances") ?? []) {
        await upsertInstance(it.token, ws, { platform: "lite", name: it.name }).catch(() => {});
      }
    }
  })
  .then(async () => {
    // 🩹 Auto-conserto: se algum fluxo salvo ainda tem mídia base64 inline (legado que inflava a
    // config a dezenas de MB e travava TODO save), hospeda e regrava só as URLs — no próprio boot,
    // sem passo manual. Roda dentro do motor (sem corpo grande pela rede). No-op se já estiver limpo.
    try {
      const list = loadAutomations();
      const { list: clean, hosted, cleared } = await dehydrateAutomationsMedia(list);
      if (hosted || cleared) {
        await saveConfig("automations", clean);
        console.log(`🩹 boot: ${hosted} mídia(s) hospedada(s), ${cleared} inválida(s) limpa(s) — config de fluxos sem base64`);
      }
    } catch (e: any) {
      console.error("dehydrate no boot falhou (segue mesmo assim):", e?.message ?? e);
    }
  })
  .then(async () => {
    // 🌱 Seed idempotente do fluxo "NOVO AFILIADO ZAPCONVERTE". Necessário porque, quando o store
    // já tem fluxos (o dono usa o builder), o loadAutomations NÃO olha o automations.json — então
    // um fluxo novo no arquivo não apareceria em produção. Aqui a gente INSERE no store só se o id
    // ainda não existir — nunca sobrescreve o que o dono editar depois. Se o store está vazio, o
    // seed do arquivo já vale e não há o que fazer.
    try {
      const IDS_ESSENCIAIS = ["novo-afiliado-zapconverte", "lead-campanhas-Sua Empresa", "manu-lguc-meta-ads", "sdr-advocacia-arao-mendes"];
      const store = getCached<Automation[]>("automations");
      if (Array.isArray(store)) {
        const faltando = loadSeedAutomations().filter(
          (s) => IDS_ESSENCIAIS.includes(s.id) && !store.some((a) => a.id === s.id),
        );
        // O endereço do webhook do Sua Empresa carrega um TOKEN secreto — por isso ele mora no
        // deploy/.env (LGU_LEAD_WEBHOOK_URL), nunca no automations.json (que é versionado no git).
        // Sem a env, o fluxo nasce com o campo vazio e o dono cola no builder.
        const urlLead = (process.env.LGU_LEAD_WEBHOOK_URL || "").trim();
        if (urlLead) {
          for (const f of faltando) {
            for (const s of (f.steps ?? []) as any[]) if (s?.type === "webhook_out" && !s.url) s.url = urlLead;
          }
        }
        // Escritório virtual do Escritório Exemplo: em produção a URL local (localhost:4173) não alcança
        // o escritório — a env ESCRITORIO_WEBHOOK_URL (deploy/.env, carrega o token) substitui.
        const urlEscritorio = (process.env.ESCRITORIO_WEBHOOK_URL || "").trim();
        if (urlEscritorio) {
          for (const f of faltando) {
            if (f.id !== "sdr-advocacia-arao-mendes") continue;
            for (const s of (f.steps ?? []) as any[])
              if (s?.type === "webhook_out" && (!s.url || s.url.startsWith("http://localhost:4173/"))) s.url = urlEscritorio;
          }
        }
        if (faltando.length) {
          await saveConfig("automations", [...store, ...faltando]);
          console.log(`🌱 boot: fluxo(s) essencial(is) semeado(s) no store: ${faltando.map((f) => f.id).join(", ")}`);
        }
      }
    } catch (e: any) {
      console.error("seed de fluxo essencial no boot falhou (segue):", e?.message ?? e);
    }
  })
  .then(async () => {
    // 🤝 Passo da KIWIFY no fluxo de boas-vindas do afiliado. O fluxo que RODA fica no store (o
    // automations.json só semeia instalação nova), então a correção da jornada (auditoria 10/08 —
    // ninguém pedia o cadastro na Kiwify, que é quem PAGA) precisa entrar por aqui.
    // Idempotente: só insere se ainda não existir um passo citando {{kiwify}}.
    // ⚠️ Se o dono estiver com o builder aberto e salvar depois, o PUT (last-write-wins) apaga —
    // o log abaixo é a prova de que entrou; recarregar a aba do editor antes de editar.
    try {
      const store = getCached<Automation[]>("automations");
      const fluxo: any = Array.isArray(store) ? store.find((a: any) => a.id === "novo-afiliado-zapconverte") : null;
      const jaTem = fluxo?.steps?.some((s: any) => String(s?.text ?? "").includes("{{kiwify}}"));
      if (fluxo && Array.isArray(fluxo.steps) && !jaTem) {
        const passo = {
          _id: "s_" + randomUUID(),
          type: "text",
          text: "⚠️ *Falta 1 passo* pra você receber suas comissões: o pagamento é feito pela *Kiwify*, então seu cadastro de afiliado precisa estar lá.\n\nÉ rápido (2 min) e é o que garante que TODA venda sua caia na sua conta:\n{{kiwify}}\n\nJá fez? Perfeito — é só divulgar. 💚",
        };
        const i = fluxo.steps.findIndex((s: any) => s?.type === "text"); // logo depois das boas-vindas
        fluxo.steps.splice(i >= 0 ? i + 1 : fluxo.steps.length, 0, passo, { _id: "s_" + randomUUID(), type: "wait", ms: 2000 });
        await saveConfig("automations", store);
        console.log("🤝 boot: passo da Kiwify inserido no fluxo 'novo-afiliado-zapconverte' (jornada do afiliado)");
      }
    } catch (e: any) {
      console.error("passo Kiwify no boot falhou (segue):", e?.message ?? e);
    }
  })
  .then(async () => {
    // 🔗 Fluxo de lead do Sua Empresa: completa o nó de webhook que JÁ está no store (o seed só
    // cria quando não existe, nunca atualiza). Duas coisas, ambas idempotentes:
    //   • a URL, se o campo estiver vazio e a env existir (o token mora no .env, não no git);
    //   • o campo `ocorrido_em` ({{mensagem_em}}) — o destino casa o lead com o clique do anúncio
    //     pelo HORÁRIO; sem ele, usa a hora da chegada e erra se o webhook pegar fila.
    try {
      const store = getCached<Automation[]>("automations");
      const fluxo: any = Array.isArray(store) ? store.find((a: any) => a.id === "lead-campanhas-Sua Empresa") : null;
      const passo: any = fluxo?.steps?.find((s: any) => s?.type === "webhook_out");
      if (passo) {
        let mudou = false;
        const urlEnv = (process.env.LGU_LEAD_WEBHOOK_URL || "").trim();
        if (!String(passo.url ?? "").trim() && urlEnv) { passo.url = urlEnv; mudou = true; }
        passo.campos = Array.isArray(passo.campos) ? passo.campos : [];
        if (!passo.campos.some((c: any) => c?.chave === "ocorrido_em")) {
          const i = passo.campos.findIndex((c: any) => c?.chave === "origem");
          passo.campos.splice(i >= 0 ? i : passo.campos.length, 0, { chave: "ocorrido_em", valor: "{{mensagem_em}}" });
          mudou = true;
        }
        if (mudou) {
          await saveConfig("automations", store);
          console.log("🔗 boot: nó de webhook do fluxo de leads do LGU atualizado (url/ocorrido_em)");
        }
      }
    } catch (e: any) {
      console.error("ajuste do fluxo de leads no boot falhou (segue):", e?.message ?? e);
    }
  })
  .then(async () => {
    // 🔁 Backfill dos afiliados: quem gerou página ANTES do auto-cadastro existir (10/08) não estava
    // na lista do painel. Idempotente (garanteAfiliado casa por e-mail) e barato — a tabela é pequena.
    try {
      const pgs = await query<{ nome: string; email: string; telefone: string; whatsapp: string | null }>(
        "SELECT nome, email, telefone, whatsapp FROM affiliate_promo",
      );
      let novos = 0;
      for (const p of pgs) {
        if (await garanteAfiliado({ nome: p.nome, email: p.email, telefone: p.whatsapp || p.telefone, origem: "backfill da página" })) novos++;
      }
      if (novos) console.log(`🤝 boot: ${novos} afiliado(s) que já tinham página entraram na lista`);
    } catch (e: any) {
      console.error("backfill de afiliados no boot falhou (segue):", e?.message ?? e);
    }
  })
  .then(() => app.listen({ port: config.port, host: "0.0.0.0" }))
  .then(() => {
    console.log(`🟢 ZapConverte API ouvindo em http://localhost:${config.port}`);
    startGroupSummaryScheduler(gateway);
    // Lembretes: cada um envia pela SUA conta (token resolvido pelo id lite-xxxx). Conta primária → gateway padrão.
    // Mesma regra de todo o resto: cada lembrete sai pela conta DELE. Era aqui que a lógica certa
    // morava copiada — agora tem uma função só, pra não divergir de novo.
    startReminderScheduler(withEchoGuard(gateway), console.log, (account, wsId) => gatewayDoWorkspace(wsId, account));
    // Mesma regra de isolamento: cada gatilho por horário sai pela conta do PRÓPRIO workspace.
    startScheduleTriggerScheduler(console.log, (account, wsId) => gatewayDoWorkspace(wsId, account));
    startAdsDiarioScheduler(); // 📊 Dashboard de Lançamento: Meta Ads → ads_diario a cada 30 min
    startConfigRefresher();
    // 🧹 Retenção do CACHE de mídia do inbox (prefixo "wa-"): mantém ~60 dias e teto de 4GB.
    // Mídia de FLUXO/avatar (outros prefixos) nunca é apagada — é conteúdo do produto, não cache.
    // 📏 RAIO-X DO ARMAZENAMENTO: a mídia mora DENTRO do Postgres (BYTEA), então ela infla o banco
    // e todo backup junto. Sem número, decidir retenção é chute — e medir exigia SSH na VPS. Agora
    // o próprio motor mede e escreve na tela de Logs ao vivo, por tipo de arquivo.
    //   wa-   = recebido no WhatsApp Lite   (limpo aos 60 dias, abaixo)
    //   meta- = recebido na API Oficial     (HOJE NÃO É LIMPO — é o furo)
    //   av-   = foto de perfil (cache leve)
    //   resto = upload do produto (mídia de fluxo) — nunca apagar
    const raioXMidia = async () => {
      try {
        const r = await query<{ tipo: string; n: number; bytes: string }>(
          `SELECT CASE WHEN id LIKE 'wa-%' THEN 'wa (Lite)'
                       WHEN id LIKE 'meta-%' THEN 'meta (API Oficial)'
                       WHEN id LIKE 'av-%' THEN 'av (fotos de perfil)'
                       ELSE 'upload do produto' END AS tipo,
                  COUNT(*)::int AS n, COALESCE(SUM(octet_length(data)),0)::text AS bytes
             FROM media GROUP BY 1 ORDER BY SUM(octet_length(data)) DESC`,
        );
        const mb = (b: number) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + " GB" : (b / 1024 ** 2).toFixed(1) + " MB");
        const total = r.reduce((a, x) => a + Number(x.bytes), 0);
        console.log(`📏 mídia no banco: ${mb(total)} no total — ` +
          (r.length ? r.map((x) => `${x.tipo}: ${x.n} arq, ${mb(Number(x.bytes))}`).join(" · ") : "vazio"));
      } catch (e: any) { console.log("📏 raio-x da mídia falhou:", e?.message); }
    };
    const limpaCacheMidia = async () => {
      await raioXMidia();
      try {
        const apagadas = await query<{ id: string }>(
          `DELETE FROM media WHERE id LIKE 'wa-%' AND created_at < now() - interval '60 days' RETURNING id`,
        );
        const tam = await query<{ total: string }>(
          `SELECT COALESCE(SUM(octet_length(data)),0)::text AS total FROM media WHERE id LIKE 'wa-%'`,
        );
        const bytes = Number(tam[0]?.total ?? 0);
        if (bytes > 4 * 1024 ** 3) {
          // Estourou o teto → derruba as mais antigas até caber (metade do excedente por rodada).
          await query(
            `DELETE FROM media WHERE id IN (
               SELECT id FROM media WHERE id LIKE 'wa-%' ORDER BY created_at ASC LIMIT 500)`,
          );
          console.log(`🧹 cache de mídia acima de 4GB (${(bytes / 1024 ** 3).toFixed(1)}GB) — podei as 500 mais antigas`);
        }
        if (apagadas.length) console.log(`🧹 cache de mídia: ${apagadas.length} arquivo(s) com +60 dias removidos`);
      } catch { /* faxina é best-effort */ }
    };
    setTimeout(limpaCacheMidia, 120_000);
    setInterval(limpaCacheMidia, 12 * 60 * 60_000);
    // 🧹 FICHAS DE CLIQUE VELHAS (LGPD). checkout_sessions guarda IP, user-agent e URL de origem de
    // TODO visitante da VSL — dado pessoal — e o INSERT é público, então crescia pra sempre. 90 dias
    // cobre com folga a atribuição: a janela mais longa da Meta é 28 dias, e uma ficha só é lida no
    // Purchase, que chega minutos depois do clique. Depois disso a linha é só passivo.
    const limpaFichasDeClique = async () => {
      try {
        const r = await query<{ trk: string }>("DELETE FROM checkout_sessions WHERE created_at < now() - INTERVAL '90 days' RETURNING trk");
        if (r.length) console.log(`🧹 fichas de clique: ${r.length} com +90 dias removidas (LGPD)`);
      } catch { /* faxina é best-effort */ }
    };
    setTimeout(limpaFichasDeClique, 180_000);
    setInterval(limpaFichasDeClique, 24 * 60 * 60_000);
    startFollowupScheduler(); // ⏰ follow-ups agendados (espera longa dos fluxos)
    // 📧 Régua de e-mail do Pix/carrinho do ZapConverte: tabela + fila a cada 2 min.
    initRecuperacao()
      .then(() => { setTimeout(() => void processaRecuperacao(), 60_000); setInterval(() => void processaRecuperacao(), 120_000); })
      .catch((e) => console.error("recuperação por e-mail (init):", e?.message ?? e));
    // ⏰ e-mails de ciclo do teste grátis (Fase A): 1ª leva ~2min após o boot, depois de hora em hora.
    setTimeout(() => { emailsCicloTrialTick().catch(() => {}); }, 120_000);
    setInterval(() => { emailsCicloTrialTick().catch(() => {}); }, 3_600_000);
    ensureWebhooks().catch((e) => console.error("ensureWebhooks:", e)); // liga webhook em todas as instâncias
    // Fotos de perfil: 1ª leva ~30s após o boot e depois a cada 10min (contatos sem foto).
    const runAvatars = () => {
      enrichAvatars({ token: config.uazapi.token, mediaBase: MEDIA_PUBLIC_BASE }).catch(() => {});
      void fotosDosLeadsOficial();
    };
    setTimeout(runAvatars, 30_000);
    setInterval(runAvatars, 10 * 60_000);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
