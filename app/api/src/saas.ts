// Fundação SaaS do ZapConverte: contas, sessões, trial por cupom, afiliados e comissões.
// Pagamento da recorrência é pela KIWIFY — o webhook ativa/renova/cancela o workspace
// casando o e-mail do comprador com o e-mail da conta.
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { dbEnabled, query } from "./db.js";
import { lePermissoes } from "./permissoes.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp.js";
import { enviaEventoMeta } from "./lib/meta-capi.js";

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@seudominio.com.br").toLowerCase();
const SESSION_DAYS = 30;

// ── Senha (scrypt do node — sem dependência nova) ────────────────────────────
export function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pass, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
// 🕐 Hash-isca pro caminho "e-mail não existe". Sem ele, o login respondia ~30x mais rápido pra
// e-mail inexistente (o `||` curto-circuitava e o scrypt nunca rodava) — um cronômetro dizia quais
// e-mails têm conta aqui, sem estourar limite nenhum, porque cada sonda usa um e-mail diferente.
// Gerado uma vez no boot, com senha aleatória que ninguém conhece (auditoria 07/09).
const HASH_ISCA = hashPassword(randomBytes(32).toString("hex"));

export function verifyPassword(pass: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pass, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ── Tipos ────────────────────────────────────────────────────────────────────
// Papel DENTRO do workspace (Equipe). 'dono' = quem comprou (workspaces.owner_user_id);
// 'admin' = braço direito (tudo operacional + convida); 'atendente' = só inbox/contatos.
export type WsRole = "dono" | "admin" | "atendente";

export interface SessionInfo {
  user: { id: string; email: string; name: string; role: string; avatar: string | null; wsRole: WsRole; mustChangePassword?: boolean; idioma?: string | null;
          // Permissões finas (só membro tem; o dono é sempre null = sem restrição). Ver team.ts.
          permissoes?: { paginas?: string[] | null; contas?: string[] | null } | null };
  workspace: {
    id: string;
    name: string;
    plan: string | null;
    status: string; // 'trial' | 'active' | 'canceled'
    trial_ends_at: string | null;
    paid_until: string | null;
    days_left: number | null; // dias restantes do trial (se em trial)
  };
  paywall: boolean; // true = acesso bloqueado (trial acabou e não há assinatura ativa)
  orphan?: boolean; // true = conta sem workspace (removida da equipe) → tela explicativa, não checkout
}

const now = () => new Date();
const days = (n: number) => n * 86_400_000;

// Acesso liberado se: assinatura vigente (paid_until no futuro) OU trial vigente.
// Reembolso/chargeback ZERA paid_until E trial_ends_at (ver handleBillingEvent), então uma conta
// estornada não segura acesso por sobra de período — o status 'canceled' é reforço, não a trava única.
function computeAccess(ws: any): { paywall: boolean; days_left: number | null } {
  const paidOk = ws.paid_until && new Date(ws.paid_until) > now() && ws.status !== "canceled";
  const trialEnd = ws.trial_ends_at ? new Date(ws.trial_ends_at) : null;
  const trialOk = !!trialEnd && trialEnd > now() && ws.status !== "canceled";
  const days_left = trialOk ? Math.max(0, Math.ceil((trialEnd!.getTime() - Date.now()) / 86_400_000)) : null;
  return { paywall: !(paidOk || trialOk), days_left };
}

// Status a gravar ao estender trial SEM rebaixar quem já paga (assinatura vigente continua 'active').
const KEEP_ACTIVE_STATUS = "CASE WHEN paid_until IS NOT NULL AND paid_until > now() THEN 'active' ELSE 'trial' END";

// ── Cadastro / Login / Sessão ────────────────────────────────────────────────
export async function signup(
  input: { name: string; email: string; password: string; coupon?: string; ref?: string },
  opts?: { autoConfirm?: boolean }, // trial passa true (entra sem confirmar e-mail)
): Promise<{ token: string; couponWarning?: string } | { needConfirm: true; confirmToken: string; name: string; email: string } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "e-mail inválido" };
  if (!name) return { error: "informe seu nome" };
  if ((input.password || "").length < 6) return { error: "a senha precisa de pelo menos 6 caracteres" };
  // O e-mail do admin é público (está no código) e é semeado no boot — NINGUÉM pode cadastrá-lo
  // pelo /auth/signup (senão um atacante "squattava" a conta antes do seed e virava admin no redeploy).
  if (email === ADMIN_EMAIL) return { error: "essa conta é gerenciada pelo sistema — use a tela de entrar" };

  // Conta CONFIRMADA já existe → faça login. Conta NÃO confirmada → deixa sobrescrever (o dono
  // legítimo reassume uma conta que alguém pré-emptou; o atacante nunca confirmou porque o e-mail
  // de confirmação foi pra caixa do dono).
  const existing = await query<{ id: string; email_confirmed: boolean; totp_on: boolean; paid_until: string | null }>(
    `SELECT u.id, u.email_confirmed, COALESCE(u.totp_on,FALSE) AS totp_on, w.paid_until
       FROM users u LEFT JOIN workspaces w ON w.owner_user_id = u.id
      WHERE u.email=$1 ORDER BY w.id LIMIT 1`, [email]);
  if (existing.length && existing[0].email_confirmed) return { error: "já existe uma conta com esse e-mail — faça login" };
  // 🔐 O "reassumir conta não confirmada" existe pro dono legítimo retomar uma conta que alguém
  // pré-emptou com o e-mail dele. Mas ele SOBRESCREVE a senha — então não pode valer pra conta que
  // já tem valor dentro: com 2FA ligado ou assinatura vigente, quem souber o e-mail trancaria o
  // dono do lado de fora. Nesses casos responde igual a "já existe" (auditoria 07/09).
  if (existing.length && (existing[0].totp_on || (existing[0].paid_until && new Date(existing[0].paid_until) > now()))) {
    return { error: "já existe uma conta com esse e-mail — faça login" };
  }

  // Auto-confirma (entra direto, sem e-mail de confirmação) SÓ no funil próprio de trial.
  //
  // 🔐 REMOVIDO em 07/09 (auditoria): antes, existir uma compra paga com aquele e-mail também
  // auto-confirmava, sob a premissa de que "a compra prova a posse do e-mail". A premissa é falsa:
  // a compra prova que ALGUÉM usou aquele e-mail, não que quem está mandando ESTE cadastro é dono
  // dele. Entre a compra e o cadastro do comprador existe uma janela — e nela qualquer um que
  // soubesse o e-mail cadastrava primeiro, recebia sessão na hora e herdava o plano pago.
  // Sem o auto-confirm, o comprador legítimo confirma pelo link que chega na caixa DELE e o plano
  // é liberado do mesmo jeito (syncPaidAccess roda no login e na confirmação).
  const autoConfirm = !!opts?.autoConfirm;

  // SEGURANÇA: cadastro público SEMPRE nasce 'user' (admin só é semeado no boot).
  let userId: string;
  let wsId: string;
  let couponWarning: string | undefined;
  if (existing.length) {
    // Reassume a conta não confirmada: troca nome/senha/estado de confirmação; workspace já existe.
    userId = existing[0].id;
    await query("UPDATE users SET name=$2, pass_hash=$3, email_confirmed=$4 WHERE id=$1", [userId, name, hashPassword(input.password), autoConfirm]);
    wsId = (await query<{ id: string }>("SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1", [userId]))[0]?.id ?? "";
  } else {
    userId = "u_" + randomUUID();
    await query("INSERT INTO users(id, email, name, pass_hash, role, email_confirmed) VALUES($1,$2,$3,$4,'user',$5)", [userId, email, name, hashPassword(input.password), autoConfirm]);
    // Atribuição de afiliado (?ref=CODIGO no cadastro).
    let referredBy: string | null = null;
    if (input.ref && input.ref.trim()) {
      const aff = await query<{ id: string }>("SELECT id FROM affiliates WHERE ref_code=$1 AND active=TRUE", [input.ref.trim().toUpperCase()]);
      referredBy = aff[0]?.id ?? null;
    }
    wsId = "ws_" + randomUUID();
    await query("INSERT INTO workspaces(id, owner_user_id, name, status, referred_by) VALUES($1,$2,$3,'trial',$4)", [wsId, userId, name, referredBy]);
    if (input.coupon && input.coupon.trim()) {
      const r = await redeemCouponForWorkspace(wsId, input.coupon);
      if ("error" in r) { couponWarning = `O cupom "${input.coupon.trim().toUpperCase()}" não foi aplicado: ${r.error}`; console.log(`cupom no cadastro falhou (${email}): ${r.error}`); }
    }
    console.log(`👤 nova conta: ${email}${referredBy ? " · ref " + input.ref : ""}${autoConfirm ? " (auto-confirmada)" : " (aguardando confirmação)"}`);
  }
  // Se o email JÁ pagou na Kiwify (compra antes do cadastro), libera o plano na hora.
  if (wsId) await syncPaidAccess(email, wsId).catch(() => {});

  if (autoConfirm) {
    const token = await createSession(userId);
    return couponWarning ? { token, couponWarning } : { token };
  }
  // Não confirmado → gera token de confirmação (SEM sessão). O endpoint manda o e-mail.
  const confirmToken = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(confirmToken).digest("hex");
  await query("DELETE FROM email_confirmations WHERE user_id=$1", [userId]).catch(() => {});
  await query("INSERT INTO email_confirmations(token_hash, user_id, expires_at) VALUES($1,$2, now() + interval '24 hours')", [hash, userId]);
  return { needConfirm: true, confirmToken, name, email };
}

// Confirma o e-mail com o token e JÁ loga (cria sessão). Uso único, expira em 24h.
export async function confirmEmail(token: string): Promise<{ token: string } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const hash = createHash("sha256").update(String(token || "")).digest("hex");
  const r = await query<{ user_id: string }>("SELECT user_id FROM email_confirmations WHERE token_hash=$1 AND used=FALSE AND expires_at > now()", [hash]);
  if (!r.length) return { error: "link de confirmação inválido ou expirado — peça um novo" };
  const userId = r[0].user_id;
  await query("UPDATE users SET email_confirmed=TRUE WHERE id=$1", [userId]);
  await query("UPDATE email_confirmations SET used=TRUE WHERE token_hash=$1", [hash]);
  return { token: await createSession(userId) };
}

// Reenvia a confirmação. Retorna null (genérico) se a conta não existe ou já está confirmada.
export async function resendConfirmation(email: string): Promise<{ token: string; name: string | null } | null> {
  if (!dbEnabled) return null;
  const clean = email.trim().toLowerCase();
  const u = await query<{ id: string; name: string | null; email_confirmed: boolean }>("SELECT id, name, email_confirmed FROM users WHERE email=$1", [clean]);
  if (!u.length || u[0].email_confirmed) return null;
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await query("DELETE FROM email_confirmations WHERE user_id=$1", [u[0].id]).catch(() => {});
  await query("INSERT INTO email_confirmations(token_hash, user_id, expires_at) VALUES($1,$2, now() + interval '24 hours')", [hash, u[0].id]);
  return { token, name: u[0].name };
}

// Semeia/garante o admin (Admin) no boot — determinístico, sem corrida no cadastro público.
// Se ADMIN_EMAIL já existe → garante role='admin'. Se não existe e ADMIN_PASSWORD está setada → cria.
export async function ensureAdminSeed(): Promise<void> {
  if (!dbEnabled) return;
  try {
    const pass = process.env.ADMIN_PASSWORD;
    const existing = await query<{ id: string; role: string }>("SELECT id, role FROM users WHERE email=$1", [ADMIN_EMAIL]);
    if (existing.length) {
      // O deploy/.env é a FONTE DA VERDADE das credenciais do admin. Se ADMIN_PASSWORD está setada,
      // sobrescreve a senha (e garante role=admin) — assim nem uma conta que tenha squattado o e-mail
      // mantém acesso. Sem ADMIN_PASSWORD, NÃO promove às cegas (poderia promover um squatter).
      if (pass) {
        await query("UPDATE users SET role='admin', pass_hash=$2 WHERE id=$1", [existing[0].id, hashPassword(pass)]);
        console.log(`🔑 admin garantido (${ADMIN_EMAIL}) — credenciais sincronizadas com o deploy/.env`);
      }
      // BREAK-GLASS do 2FA: se o dono perder o celular do autenticador, seta ADMIN_2FA_RESET=1
      // no deploy/.env e redeploya — o boot desliga o 2FA do admin.
      // ONE-SHOT: registra em admin_flags e NÃO repete. Assim uma flag esquecida no .env não
      // re-desliga o 2FA silenciosamente a cada deploy (só avisa no log).
      if (process.env.ADMIN_2FA_RESET === "1") {
        const first = await query<{ flag: string }>(
          "INSERT INTO admin_flags(flag) VALUES('admin_2fa_reset') ON CONFLICT (flag) DO NOTHING RETURNING flag",
        );
        if (first.length) {
          await query("UPDATE users SET totp_enc=NULL, totp_on=false, totp_fails=0, totp_locked_until=NULL, totp_last_counter=NULL WHERE id=$1", [existing[0].id]);
          await revokeOtherSessions(existing[0].id);
          console.warn(`🛡️  ADMIN_2FA_RESET consumida → 2FA do admin DESLIGADO. REMOVA a flag do deploy/.env (ela não vai agir de novo).`);
        } else {
          console.warn(`⚠️  ADMIN_2FA_RESET ainda está no deploy/.env mas JÁ foi usada — ignorada. Remova a linha.`);
        }
      }
      if (!pass && existing[0].role !== "admin") {
        console.warn(`⚠️  conta ${ADMIN_EMAIL} existe mas ADMIN_PASSWORD não está setada — NÃO promovi (defina a senha no deploy/.env e redeploye).`);
      }
      return;
    }
    if (!pass) {
      console.warn(`⚠️  admin ainda não existe e ADMIN_PASSWORD não está setada — defina no deploy/.env para o dono entrar como admin.`);
      return;
    }
    const userId = "u_" + randomUUID();
    await query("INSERT INTO users(id, email, name, pass_hash, role) VALUES($1,$2,$3,$4,'admin')", [userId, ADMIN_EMAIL, "Admin", hashPassword(pass)]);
    const wsId = "ws_" + randomUUID();
    await query("INSERT INTO workspaces(id, owner_user_id, name, status, paid_until) VALUES($1,$2,'ZapConverte','active',$3)", [
      wsId, userId, new Date(Date.now() + days(3650)),
    ]);
    console.log(`🔑 admin criado: ${ADMIN_EMAIL}`);
  } catch (e) {
    console.error("ensureAdminSeed:", e);
  }
}

export async function login(email: string, password: string): Promise<{ token: string } | { need2fa: true; tfa: string } | { error: string; unconfirmed?: true }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const clean = email.trim().toLowerCase();
  const rows = await query<any>("SELECT id, pass_hash, totp_on, email_confirmed FROM users WHERE email=$1", [clean]);
  // Conta inexistente também paga o custo do scrypt: os dois caminhos levam o mesmo tempo.
  const senhaOk = rows.length ? verifyPassword(password, rows[0].pass_hash) : (verifyPassword(password, HASH_ISCA), false);
  if (!senhaOk) return { error: "e-mail ou senha incorretos" };
  // Double opt-in: senha certa mas e-mail não confirmado → barra e sinaliza (o endpoint reenvia o link).
  if (!rows[0].email_confirmed) return { error: "Confirme seu e-mail antes de entrar — reenviamos o link pra sua caixa.", unconfirmed: true };
  // Ativação retroativa: se o email pagou na Kiwify mas a conta ainda estava sem acesso, libera agora.
  const ws = (await query<{ id: string }>("SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1", [rows[0].id]))[0];
  if (ws) await syncPaidAccess(clean, ws.id).catch(() => {});
  // 2FA ligado → NÃO cria sessão ainda: devolve um ticket temporário e espera o código do app.
  if (rows[0].totp_on) {
    sweep2faPending();
    const tfa = "tfa_" + randomUUID();
    pending2fa.set(tfa, { userId: rows[0].id, expires: Date.now() + 5 * 60_000, attempts: 0 });
    return { need2fa: true, tfa };
  }
  const token = await createSession(rows[0].id);
  return { token };
}

// ── Verificação em 2 fatores (TOTP nativo — totp.ts) ────────────────────────
// Tickets de login pendentes de código (memória; motor = 1 réplica). Restart = ticket some →
// o usuário só refaz o login. TTL 5min, máx 6 tentativas de código por ticket.
// ⚠️ O cap por ticket NÃO é a defesa principal: o atacante rotaciona ticket refazendo o login.
// A defesa real é o contador CUMULATIVO por conta (users.totp_fails + totp_locked_until, no banco).
const pending2fa = new Map<string, { userId: string; expires: number; attempts: number }>();
const MAX_PENDING_2FA = 5000; // teto de memória (ticket é barato, mas não infinito)
function sweep2faPending() {
  const now = Date.now();
  for (const [k, v] of pending2fa) if (v.expires < now) pending2fa.delete(k);
  if (pending2fa.size > MAX_PENDING_2FA) {
    // ainda cheio de tickets válidos: descarta os mais antigos (FIFO da inserção do Map)
    const excess = pending2fa.size - MAX_PENDING_2FA;
    let i = 0;
    for (const k of pending2fa.keys()) { if (i++ >= excess) break; pending2fa.delete(k); }
  }
}

const TOTP_LOCK_AT = 5;       // falhas → lock temporário (backoff)
const TOTP_HARD_LOCK_AT = 12; // falhas cumulativas → lock longo (só reset de senha/admin resolve)

// Registra falha de código e devolve a mensagem já com o lock aplicado (backoff exponencial).
async function noteTotpFail(userId: string): Promise<string> {
  const r = await query<{ totp_fails: number }>(
    "UPDATE users SET totp_fails = totp_fails + 1 WHERE id=$1 RETURNING totp_fails", [userId],
  );
  const fails = r[0]?.totp_fails ?? 1;
  if (fails >= TOTP_LOCK_AT) {
    // 5 falhas → 15min; dobra a cada falha; a partir de 12 → 24h.
    const mins = fails >= TOTP_HARD_LOCK_AT ? 1440 : Math.min(240, 15 * Math.pow(2, fails - TOTP_LOCK_AT));
    await query("UPDATE users SET totp_locked_until = now() + ($2 || ' minutes')::interval WHERE id=$1", [userId, String(mins)]);
    return fails >= TOTP_HARD_LOCK_AT
      ? "conta bloqueada por muitas tentativas — fale com o suporte pra desbloquear"
      : `código incorreto — bloqueado por ${mins} minuto(s) por tentativas erradas`;
  }
  return "código incorreto — confira no app e tente de novo";
}
async function clearTotpFails(userId: string): Promise<void> {
  await query("UPDATE users SET totp_fails=0, totp_locked_until=NULL WHERE id=$1", [userId]).catch(() => {});
}
// Guard de replay COMPARTILHADO (login, confirmação e desativação) e PERSISTIDO no banco —
// sobrevive a restart. Rejeita um contador já usado (o mesmo código não vale duas vezes).
async function checkAndBumpCounter(userId: string, counter: number): Promise<boolean> {
  const r = await query<{ ok: boolean }>(
    `UPDATE users SET totp_last_counter=$2
      WHERE id=$1 AND (totp_last_counter IS NULL OR totp_last_counter < $2) RETURNING true AS ok`,
    [userId, counter],
  );
  return r.length > 0;
}

// 2º passo do login: valida o código do app e SÓ ENTÃO cria a sessão.
export async function login2fa(tfa: string, code: string): Promise<{ token: string } | { error: string }> {
  const p = pending2fa.get(String(tfa ?? ""));
  if (!p || p.expires < Date.now()) { if (p) pending2fa.delete(String(tfa)); return { error: "verificação expirou — faça login de novo" }; }
  p.attempts++;
  if (p.attempts > 6) { pending2fa.delete(String(tfa)); return { error: "muitas tentativas — faça login de novo" }; }
  const rows = await query<any>("SELECT totp_enc, totp_on, totp_locked_until FROM users WHERE id=$1", [p.userId]);
  if (!rows.length) { pending2fa.delete(String(tfa)); return { error: "conta não encontrada" }; }
  // Lock cumulativo por CONTA (a barreira que o ticket rotativo não contorna).
  if (rows[0].totp_locked_until && new Date(rows[0].totp_locked_until).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(rows[0].totp_locked_until).getTime() - Date.now()) / 60_000);
    return { error: `muitas tentativas erradas — tente de novo em ${mins} minuto(s)` };
  }
  if (!rows[0].totp_on) { pending2fa.delete(String(tfa)); return { error: "2FA não está mais ativo — faça login de novo" }; }
  const secret = rows[0].totp_enc ? decryptSecret(rows[0].totp_enc) : null;
  // Segredo ILEGÍVEL (chave-mestra ZC_ENCRYPTION_KEY trocada) ≠ 2FA desligado. Sem isso o usuário
  // entra em loop eterno com mensagem enganosa. Grita no log e manda pro suporte.
  if (!secret) {
    pending2fa.delete(String(tfa));
    console.error(`🚨 2FA: segredo de ${p.userId} NÃO descriptografa — ZC_ENCRYPTION_KEY mudou? Use /admin/clients/disable-2fa pra liberar a conta.`);
    return { error: "não consegui validar seu 2FA (problema de chave no servidor) — fale com o suporte pra liberar sua conta" };
  }
  const counter = verifyTotp(secret, code);
  if (counter == null) return { error: await noteTotpFail(p.userId) };
  if (!(await checkAndBumpCounter(p.userId, counter))) return { error: "código já usado — espere o próximo aparecer no app" };
  await clearTotpFails(p.userId);
  pending2fa.delete(String(tfa));
  const token = await createSession(p.userId);
  return { token };
}

export async function get2faStatus(userId: string): Promise<boolean> {
  const r = await query<{ totp_on: boolean }>("SELECT totp_on FROM users WHERE id=$1", [userId]);
  return !!r[0]?.totp_on;
}
// Começa o cadastro: gera o segredo (criptografado no banco, PENDENTE até confirmar) e devolve
// o segredo + a URI otpauth (vira QR no painel).
//  • Exige a SENHA ATUAL: uma sessão roubada não planta o autenticador do atacante.
//  • IDEMPOTENTE: se já há segredo pendente, devolve O MESMO (2 abas / re-clique não invalidam o QR).
//  • 2FA já ativo → exige desativar antes (não troca segredo silenciosamente).
export async function setup2fa(userId: string, email: string, password: string): Promise<{ secret: string; uri: string } | { error: string }> {
  const cur = await query<any>("SELECT totp_on, totp_enc, pass_hash FROM users WHERE id=$1", [userId]);
  if (!cur.length) return { error: "conta não encontrada" };
  if (!verifyPassword(password, cur[0].pass_hash)) return { error: "senha atual incorreta" };
  if (cur[0].totp_on) return { error: "2FA já está ativo — desative antes de reconfigurar" };
  const pendente = cur[0].totp_enc ? decryptSecret(cur[0].totp_enc) : null;
  if (pendente) return { secret: pendente, uri: otpauthUri(email, pendente) }; // mesmo QR de antes
  const secret = generateTotpSecret();
  await query("UPDATE users SET totp_enc=$2, totp_on=false WHERE id=$1", [userId, encryptSecret(secret)]);
  return { secret, uri: otpauthUri(email, secret) };
}
// Confirma o cadastro: o código do app tem que bater com o segredo pendente → liga o 2FA.
// Revoga as OUTRAS sessões (ativar 2FA expulsa quem já estava logado com a senha vazada).
export async function confirm2fa(userId: string, code: string, keepToken?: string): Promise<{ ok: true } | { error: string }> {
  const rows = await query<any>("SELECT totp_enc, totp_on, totp_locked_until FROM users WHERE id=$1", [userId]);
  if (!rows.length) return { error: "conta não encontrada" };
  if (rows[0].totp_on) return { error: "2FA já está ativo" };
  if (rows[0].totp_locked_until && new Date(rows[0].totp_locked_until).getTime() > Date.now())
    return { error: "muitas tentativas erradas — aguarde alguns minutos" };
  const secret = rows[0].totp_enc ? decryptSecret(rows[0].totp_enc) : null;
  if (!secret) return { error: "cadastro não iniciado — clique em Ativar de novo" };
  const counter = verifyTotp(secret, code);
  if (counter == null) return { error: await noteTotpFail(userId) };
  if (!(await checkAndBumpCounter(userId, counter))) return { error: "código já usado — espere o próximo aparecer no app" };
  await clearTotpFails(userId);
  await query("UPDATE users SET totp_on=true WHERE id=$1", [userId]);
  await revokeOtherSessions(userId, keepToken);
  return { ok: true };
}
// Desativa: com 2FA ATIVO exige um código válido (e o código não pode ser reusado); cadastro
// pendente (nunca confirmou) limpa direto. Também revoga as outras sessões.
export async function disable2fa(userId: string, code: string, keepToken?: string): Promise<{ ok: true } | { error: string }> {
  const rows = await query<any>("SELECT totp_enc, totp_on, totp_locked_until FROM users WHERE id=$1", [userId]);
  if (!rows.length) return { error: "conta não encontrada" };
  if (rows[0].totp_on) {
    if (rows[0].totp_locked_until && new Date(rows[0].totp_locked_until).getTime() > Date.now())
      return { error: "muitas tentativas erradas — aguarde alguns minutos" };
    const secret = rows[0].totp_enc ? decryptSecret(rows[0].totp_enc) : null;
    if (!secret) return { error: "não consegui validar seu 2FA (problema de chave no servidor) — fale com o suporte" };
    const counter = verifyTotp(secret, code);
    if (counter == null) return { error: await noteTotpFail(userId) };
    if (!(await checkAndBumpCounter(userId, counter))) return { error: "código já usado — espere o próximo aparecer no app" };
    await clearTotpFails(userId);
  }
  await query("UPDATE users SET totp_enc=NULL, totp_on=false, totp_fails=0, totp_locked_until=NULL, totp_last_counter=NULL WHERE id=$1", [userId]);
  await revokeOtherSessions(userId, keepToken);
  return { ok: true };
}
// Resgate do super-admin: cliente perdeu o celular → Admin desliga o 2FA dele (suporte).
// Derruba TODAS as sessões da conta (quem estava logado precisa entrar de novo).
export async function adminDisable2fa(email: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    "UPDATE users SET totp_enc=NULL, totp_on=false, totp_fails=0, totp_locked_until=NULL, totp_last_counter=NULL WHERE email=$1 RETURNING id",
    [email.trim().toLowerCase()],
  );
  if (!r.length) return false;
  await revokeSessionsByEmail(email);
  return true;
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO sessions(token, user_id, expires_at) VALUES($1,$2,$3)", [token, userId, new Date(Date.now() + days(SESSION_DAYS))]);
  return token;
}
// Mesma coisa, exposta pro fluxo de convite da Equipe (team.ts) já entregar o membro logado.
export async function createSessionFor(userId: string): Promise<string> { return createSession(userId); }

export async function logout(token: string): Promise<void> {
  if (!dbEnabled || !token) return;
  await query("DELETE FROM sessions WHERE token=$1", [token]).catch(() => {});
}

// ⛑️ Revogação de sessões: TODA ação de segurança (trocar senha, ligar/desligar 2FA, reset do admin)
// tem que expulsar as OUTRAS sessões — senão o cookie de 30 dias de um invasor sobrevive justamente
// à ação que a vítima tomou pra se proteger. `keepToken` mantém quem está fazendo a mudança logado.
export async function revokeOtherSessions(userId: string, keepToken?: string): Promise<void> {
  if (!dbEnabled) return;
  if (keepToken) await query("DELETE FROM sessions WHERE user_id=$1 AND token<>$2", [userId, keepToken]).catch(() => {});
  else await query("DELETE FROM sessions WHERE user_id=$1", [userId]).catch(() => {});
}
async function revokeSessionsByEmail(email: string): Promise<void> {
  if (!dbEnabled) return;
  await query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email=$1)", [email.trim().toLowerCase()]).catch(() => {});
}

export async function getSession(token: string): Promise<SessionInfo | null> {
  if (!dbEnabled || !token) return null;
  try {
    const rows = await query<any>(
      // O workspace da sessão vem de DONO (owner_user_id) OU de MEMBRO (workspace_members) — é isso
      // que faz a Equipe funcionar: o convidado não tem workspace próprio, herda o do dono.
      // ORDER BY prioriza ser dono (se alguém for dono E membro de outro, o próprio ganha).
      `SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.must_change_password, u.idioma,
              w.id AS ws_id, w.name AS ws_name, w.plan, w.status, w.trial_ends_at, w.paid_until,
              CASE WHEN w.owner_user_id = u.id THEN 'dono' ELSE COALESCE(m.role, 'atendente') END AS ws_role,
              CASE WHEN w.owner_user_id = u.id THEN NULL ELSE m.permissions END AS ws_permissions
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN workspace_members m ON m.user_id = u.id
         -- LEFT JOIN de propósito: quem foi REMOVIDO da equipe fica sem workspace. Com JOIN normal a
         -- sessão viraria null e o painel abriria quebrado sem explicação; assim a sessão existe e a
         -- UI mostra a tela "você não faz parte de nenhuma conta" (ver workspace.id vazio).
         LEFT JOIN workspaces w ON (w.owner_user_id = u.id OR w.id = m.workspace_id)
        WHERE s.token=$1 AND s.expires_at > now()
        ORDER BY (w.owner_user_id = u.id) DESC NULLS LAST
        LIMIT 1`,
      [token],
    );
    const r = rows[0];
    if (!r) return null;
    const acc = computeAccess(r);
    const wsRole: WsRole = r.ws_role === "dono" ? "dono" : r.ws_role === "admin" ? "admin" : "atendente";
    // SEM workspace = removido da equipe (ou dado órfão). A sessão existe (senão o painel abriria
    // quebrado, sem explicar nada) mas fica em paywall → a UI mostra a tela de "sem conta".
    const semWs = !r.ws_id;
    return {
      user: { id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar_url ?? null, wsRole, mustChangePassword: !!r.must_change_password, idioma: r.idioma ?? null,
              permissoes: lePermissoes(r.ws_permissions) },
      workspace: {
        id: r.ws_id ?? "", name: r.ws_name ?? "", plan: r.plan ?? null, status: r.status ?? "none",
        trial_ends_at: r.trial_ends_at ?? null, paid_until: r.paid_until ?? null, days_left: acc.days_left,
      },
      paywall: r.role === "admin" ? false : semWs ? true : acc.paywall, // admin (Admin) nunca é bloqueado
      orphan: semWs,
    };
  } catch {
    return null;
  }
}

// ── Cupons (trial por código) ────────────────────────────────────────────────
export async function redeemCouponForWorkspace(workspaceId: string, codeRaw: string): Promise<{ ok: true; trial_days: number } | { error: string }> {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return { error: "informe o código" };
  const rows = await query<any>("SELECT * FROM coupons WHERE code=$1", [code]);
  const c = rows[0];
  if (!c || !c.active) return { error: "cupom inválido ou desativado" };
  if (c.expires_at && new Date(c.expires_at) < now()) return { error: "cupom expirado" };
  if (c.max_uses != null && c.uses >= c.max_uses) return { error: "cupom esgotado" };
  const used = await query("SELECT 1 FROM coupon_redemptions WHERE coupon_code=$1 AND workspace_id=$2", [code, workspaceId]);
  if (used.length) return { error: "esse cupom já foi usado nesta conta" };
  const ws = await query<any>("SELECT trial_ends_at FROM workspaces WHERE id=$1", [workspaceId]);
  if (!ws.length) return { error: "conta não encontrada" };

  // 1) Reivindica o uso ATOMICAMENTE (um UPDATE com guarda — resgates simultâneos não estouram o limite).
  const claimed = await query<{ trial_days: number }>(
    `UPDATE coupons SET uses = uses + 1
      WHERE code=$1 AND active=TRUE
        AND (expires_at IS NULL OR expires_at > now())
        AND (max_uses IS NULL OR uses < max_uses)
      RETURNING trial_days`,
    [code],
  );
  if (!claimed.length) return { error: "cupom esgotado ou expirado" };
  // 2) Registra o resgate (PK coupon+workspace segura duplo-clique); se falhar, devolve o uso.
  try {
    await query("INSERT INTO coupon_redemptions(coupon_code, workspace_id) VALUES($1,$2)", [code, workspaceId]);
  } catch {
    await query("UPDATE coupons SET uses = uses - 1 WHERE code=$1", [code]).catch(() => {});
    return { error: "esse cupom já foi usado nesta conta" };
  }
  // 3) Estende o trial a partir de AGORA ou do fim atual (o que for maior). Não rebaixa quem já paga.
  const trialDays = Number(claimed[0].trial_days);
  const base = ws[0].trial_ends_at && new Date(ws[0].trial_ends_at) > now() ? new Date(ws[0].trial_ends_at) : now();
  await query(`UPDATE workspaces SET trial_ends_at=$1, status=${KEEP_ACTIVE_STATUS} WHERE id=$2`, [new Date(base.getTime() + days(trialDays)), workspaceId]);
  console.log(`🎟️  cupom ${code} → +${trialDays}d de teste (ws ${workspaceId})`);
  return { ok: true, trial_days: trialDays };
}

// Admin: liberar teste manualmente por e-mail (ex.: botão "Liberar trial" do afiliado).
export async function grantTrialByEmail(
  email: string, trialDays: number, affiliateId?: string,
  // Só o ADMIN pode ressuscitar uma conta cancelada (win-back manual). Nos caminhos públicos isto
  // fica false: senão o estorno/chargeback — que zera acesso e marca 'canceled' — seria desfeito
  // por uma chamada anônima, e quem pediu reembolso continuaria dentro (auditoria 07/09).
  opts?: { permitirCancelada?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const rows = await query<any>(
    "SELECT w.id, w.trial_ends_at, w.referred_by, w.status FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1",
    [email.trim().toLowerCase()],
  );
  const ws = rows[0];
  if (!ws) return { error: "nenhuma conta com esse e-mail — a pessoa precisa se cadastrar primeiro" };
  if (ws.status === "canceled" && !opts?.permitirCancelada) {
    return { error: "essa conta foi cancelada — fale com o suporte para reativar" };
  }
  const base = ws.trial_ends_at && new Date(ws.trial_ends_at) > now() ? new Date(ws.trial_ends_at) : now();
  await query(`UPDATE workspaces SET trial_ends_at=$1, status=${KEEP_ACTIVE_STATUS}, referred_by=COALESCE(referred_by,$2) WHERE id=$3`, [
    new Date(base.getTime() + days(trialDays)), affiliateId ?? ws.referred_by ?? null, ws.id,
  ]);
  return { ok: true };
}

// ── E-mails de ciclo de vida (Fase A) ────────────────────────────────────────
// Trava anti-duplicação ATÔMICA: só devolve true (pode enviar) se nunca enviou este `kind` pra
// este workspace, OU se o último envio foi há mais de `cooldownHoras`. O INSERT…ON CONFLICT…DO
// UPDATE…WHERE grava a marca no MESMO passo da checagem (sem corrida entre "checar" e "marcar").
export async function deveEnviarEmail(wsId: string, kind: string, cooldownHoras: number): Promise<boolean> {
  if (!dbEnabled) return false;
  const r = await query<{ workspace_id: string }>(
    `INSERT INTO email_log(workspace_id, kind) VALUES($1,$2)
       ON CONFLICT (workspace_id, kind) DO UPDATE SET sent_at=now()
         WHERE email_log.sent_at < now() - ($3 || ' hours')::interval
     RETURNING workspace_id`,
    [wsId, kind, String(Math.max(0, cooldownHoras))],
  );
  return r.length > 0;
}

// Slug da página de afiliado por onde ESTE lead entrou (pra o e-mail de conversão mandar de volta
// pra página do afiliado e a comissão ir pra ele). JOIN com affiliate_promo garante que a página
// ainda existe; pega a mais recente. null = não veio de afiliado (ou a página sumiu).
export async function affiliateSlugDoLead(email: string): Promise<string | null> {
  if (!dbEnabled) return null;
  const r = await query<{ slug: string }>(
    `SELECT p.slug FROM trial_leads tl JOIN affiliate_promo p ON p.slug = tl.slug
      WHERE tl.lead_email=$1 ORDER BY tl.created_at DESC LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  return r[0]?.slug ?? null;
}

export interface TrialLifecycleRow { ws_id: string; email: string; name: string | null; trial_ends_at: string; paid_until: string | null; status: string }
// Candidatos ao e-mail de ciclo do teste: trial_ends_at a ±30h de AGORA — pega tanto "vai expirar"
// (futuro) quanto "acabou de expirar" (passado). A janela estreita evita varrer a base inteira E
// evita disparo em massa pra trials que expiraram há semanas (só os RECENTES entram).
export async function trialLifecycleCandidates(): Promise<TrialLifecycleRow[]> {
  if (!dbEnabled) return [];
  return query<TrialLifecycleRow>(
    `SELECT w.id AS ws_id, u.email, u.name, w.trial_ends_at, w.paid_until, w.status
       FROM workspaces w JOIN users u ON u.id=w.owner_user_id
      WHERE u.role<>'admin' AND w.trial_ends_at IS NOT NULL
        AND w.trial_ends_at BETWEEN now() - interval '30 hours' AND now() + interval '30 hours'`,
  );
}

// Venda MANUAL (PIX direto, transferência, negociação) — entra nas Vendas & Ganhos como qualquer
// outra. order_id próprio ("manual-…") pra nunca colidir com pedido da Kiwify. Sem taxa: o líquido
// é o bruto (não passou por gateway).
export async function registrarVendaManual(
  email: string, valor: number, plan: string, nota?: string,
): Promise<{ ok: true; orderId: string }> {
  const orderId = "manual-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  await query(
    `INSERT INTO sales(order_id, plan, plan_name, offer_code, gross, kiwify_fee, producer_net,
                       buyer_email, status)
     VALUES($1,$2,$3,'manual',$4,0,$4,$5,'paga')`,
    [orderId, plan, nota || `Venda manual (${plan})`, valor, email.trim().toLowerCase()],
  );
  return { ok: true, orderId };
}

// Liberação MANUAL de plano (venda fechada por fora da Kiwify — pix direto, negociação).
// Soma em cima do paid_until vigente (renovar não desperdiça dias) e marca a assinatura ativa.
export async function grantPlanByEmail(
  email: string, dias: number, plan?: string,
): Promise<{ ok: true; paidUntil: string } | { error: string }> {
  const rows = await query<any>(
    "SELECT w.id, w.paid_until FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1",
    [email.trim().toLowerCase()],
  );
  const ws = rows[0];
  if (!ws) return { error: "nenhuma conta com esse e-mail — a pessoa precisa se cadastrar primeiro (painel.seudominio.com.br/cadastro)" };
  const base = ws.paid_until && new Date(ws.paid_until) > now() ? new Date(ws.paid_until) : now();
  const ate = new Date(base.getTime() + days(dias));
  // trial_ends_at=NULL: sai do "Teste · N dias" e passa a mostrar "Assinatura ativa" de verdade
  // (o cliente do Roba tinha 180d de cupom por cima da compra — confundia a tela).
  await query("UPDATE workspaces SET paid_until=$1, status='active', trial_ends_at=NULL, plan=COALESCE($2, plan) WHERE id=$3", [ate, plan ?? null, ws.id]);
  return { ok: true, paidUntil: ate.toISOString() };
}

// ── Kiwify → ativação/renovação/cancelamento + comissão de afiliado ─────────
const PLAN_BY_AMOUNT = (amount: number): { plan: string } | null => {
  if (amount >= 250) return { plan: "escala" };
  if (amount >= 120) return { plan: "pro" };
  if (amount >= 60) return { plan: "start" };
  return null;
};
// Plano pelo NOME da Kiwify (Subscription.plan.name, ex.: "Plano Escala R$ 297,00") — mais confiável
// que o valor (aguenta desconto/anual). Ordem importa: escala antes de pro antes de start.
function planFromName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("escala")) return "escala";
  if (n.includes("pro")) return "pro"; // "Plano Pro" / "Profissional"
  if (n.includes("start")) return "start";
  return null;
}

// Só produtos do ZapConverte podem ativar uma conta. O dono vende OUTROS produtos na mesma
// Kiwify (Instagram, Palavra de Conforto…) — sem esse filtro, comprar qualquer coisa liberaria o app.
// ZAPCONVERTE_PRODUCT_IDS = ids separados por vírgula (deploy/.env). Vazio → cai no piso de valor.
const ZC_PRODUCT_IDS = (process.env.ZAPCONVERTE_PRODUCT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MIN_ACTIVATION_AMOUNT = 60; // menor plano (Start)

function isZapConverteSale(productId?: string | null, amount?: number | null): boolean {
  if (ZC_PRODUCT_IDS.length) return !!productId && ZC_PRODUCT_IDS.includes(String(productId));
  // Sem allowlist configurada: exige pelo menos o valor do menor plano (reduz ativação por engano),
  // mas AVISA — o correto é configurar ZAPCONVERTE_PRODUCT_IDS.
  console.warn("⚠️  ZAPCONVERTE_PRODUCT_IDS não configurado — ativando por valor. Configure os IDs dos produtos.");
  return amount != null && Number(amount) >= MIN_ACTIVATION_AMOUNT;
}

// O evento é do PRODUTO ZapConverte? Mesmo portão da ativação, exposto pra régua de recuperação
// por e-mail (Pix/carrinho). Carrinho abandonado não traz valor: sem a lista de IDs configurada,
// ele não passa — melhor não mandar e-mail do que mandar o do ZapConverte pra comprador de workshop.
export function ehProdutoZapConverte(productId: string | null, amount: number | null): boolean {
  return isZapConverteSale(productId, amount);
}

const BILLING_EVENTS = new Set(["purchase_approved", "subscription_renewed", "refund", "chargeback", "subscription_canceled"]);

export interface BillingAffiliate { id?: string | null; name?: string | null; email?: string | null; commission?: number | null }

// Quem entra no FUNIL de afiliados (gerou a página de vendas no site ou veio do popup "quero me
// afiliar") aparece na lista do painel NA HORA — antes, só entrava quem já tinha vendido, então o
// Admin ficava cego pra quem acabou de se cadastrar (caso real 10/08).
// Casa por E-MAIL: quando a primeira venda chegar da Kiwify, `recordAffiliateSale` procura por
// ref_code e, não achando, POR E-MAIL — cai neste mesmo registro, sem duplicar.
// Devolve TRUE quando criou a linha agora (o backfill do boot usa isso pra contar).
export async function garanteAfiliado(d: { nome: string; email: string; telefone?: string | null; origem: string }): Promise<boolean> {
  if (!dbEnabled) return false;
  const email = String(d.email ?? "").trim().toLowerCase();
  if (!email) return false;
  const nome = String(d.nome ?? "").trim() || email.split("@")[0];
  const fone = d.telefone ? String(d.telefone) : null;
  const existe = await query<{ id: string }>("SELECT id FROM affiliates WHERE lower(email)=$1 LIMIT 1", [email]);
  if (existe.length) {
    // Já está na lista (cadastro manual ou auto pela venda): só completa o que está faltando.
    await query(
      "UPDATE affiliates SET name = COALESCE(NULLIF(name,''), $2), phone = COALESCE(NULLIF(phone,''), $3) WHERE id=$1",
      [existe[0].id, nome, fone],
    );
    return false;
  }
  const base = (email.split("@")[0] || "afiliado").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "AFILIADO";
  for (const ref of [`ZC-${base}`, `ZC-${base}-${randomUUID().slice(0, 4).toUpperCase()}`]) {
    const ins = await query<{ id: string }>(
      `INSERT INTO affiliates(id, name, email, phone, kind, ref_code, commission_pct, active)
       VALUES($1,$2,$3,$4,'afiliado',$5,50,TRUE) ON CONFLICT (ref_code) DO NOTHING RETURNING id`,
      ["a_" + randomUUID(), nome, email, fone, ref],
    );
    if (ins.length) { console.log(`🤝 afiliado na lista (${d.origem}): ${nome} <${email}> ref ${ref}`); return true; }
  }
  return false;
}

// Registra a venda de um AFILIADO no nosso painel/ranking. A Kiwify é quem paga o afiliado — aqui a
// gente METRIFICA (quem vendeu, quanto, quantas) pra montar ranking e premiar os tops. Independe de o
// COMPRADOR ter conta no ZapConverte. Idempotente por order_id (retry do webhook não duplica).
// Upsert do afiliado por ref_code estável (id da Kiwify quando houver) ou por e-mail.
async function recordAffiliateSale(aff: BillingAffiliate, orderId: string | null, saleAmount: number | null, plan: string | null): Promise<{ id: string; name: string | null; email: string | null; commission: number; isNew: boolean } | null> {
  if (!aff || !orderId || (!aff.email && !aff.id && !aff.name)) return null;
  const email = aff.email ? aff.email.trim().toLowerCase() : null;
  const base = aff.id ? String(aff.id) : email ? email.split("@")[0] : String(aff.name);
  const refCode = "KW-" + base.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);

  let rows = await query<{ id: string }>("SELECT id FROM affiliates WHERE ref_code=$1", [refCode]);
  if (!rows.length && email) rows = await query<{ id: string }>("SELECT id FROM affiliates WHERE lower(email)=$1", [email]);
  let affiliateId = rows[0]?.id;
  if (!affiliateId) {
    affiliateId = "a_" + randomUUID();
    const ins = await query<{ id: string }>(
      "INSERT INTO affiliates(id, name, email, kind, ref_code, commission_pct, active) VALUES($1,$2,$3,'afiliado',$4,50,TRUE) ON CONFLICT (ref_code) DO NOTHING RETURNING id",
      [affiliateId, aff.name ?? "Afiliado", email, refCode],
    );
    if (!ins.length) { const r = await query<{ id: string }>("SELECT id FROM affiliates WHERE ref_code=$1", [refCode]); affiliateId = r[0]?.id; }
    else console.log(`🆕 afiliado auto-cadastrado da Kiwify: ${aff.name ?? email ?? refCode}`);
  } else if (aff.name || email) {
    await query("UPDATE affiliates SET name=COALESCE(NULLIF($2,''), name), email=COALESCE($3, email) WHERE id=$1", [affiliateId, aff.name ?? "", email]);
  }
  if (!affiliateId) return null;

  // Valor da comissão: o que a Kiwify informou; se não vier, estima 50% (padrão do programa).
  const amount = aff.commission != null ? aff.commission : saleAmount != null ? Math.round(Number(saleAmount) * 50) / 100 : 0;
  const ins2 = await query<{ id: string }>(
    `INSERT INTO commissions(id, affiliate_id, workspace_id, order_id, amount, sale_amount, plan, status)
     VALUES($1,$2,NULL,$3,$4,$5,$6,'pendente')
     ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING RETURNING id`,
    ["c_" + randomUUID(), affiliateId, orderId, amount, saleAmount, plan],
  );
  if (ins2.length) console.log(`🤝 venda de afiliado ${aff.name ?? email ?? refCode}: comissão R$ ${Number(amount).toFixed(2)} (order ${orderId})`);
  // isNew = a comissão foi inserida AGORA (não é retry do webhook) → só aí vale notificar o afiliado.
  return { id: affiliateId, name: aff.name ?? null, email, commission: Number(amount), isNew: ins2.length > 0 };
}

// Telefone do afiliado pra aviso no WhatsApp (self-service tem whatsapp; senão o phone do cadastro).
export async function affiliatePhoneByEmail(email: string): Promise<string | null> {
  if (!dbEnabled || !email) return null;
  const e = email.trim().toLowerCase();
  const p = await query<{ phone: string | null }>(
    "SELECT COALESCE(NULLIF(whatsapp,''), NULLIF(telefone,'')) AS phone FROM affiliate_promo WHERE lower(email)=$1 LIMIT 1", [e]);
  if (p[0]?.phone) return p[0].phone.replace(/\D/g, "");
  const a = await query<{ phone: string | null }>("SELECT phone FROM affiliates WHERE lower(email)=$1 AND phone IS NOT NULL LIMIT 1", [e]);
  return a[0]?.phone ? a[0].phone.replace(/\D/g, "") : null;
}

// Registra a VENDA aprovada com o detalhamento financeiro (dashboard de ganhos). Idempotente por order_id.
async function recordSale(ev: BillingEvent, plan: string | null, aff: { id: string; name: string | null } | null): Promise<void> {
  if (!ev.orderId) return;
  const tk = ev.tracking ?? null;
  await query(
    `INSERT INTO sales(order_id, plan, plan_name, offer_code, gross, kiwify_fee, producer_net,
                       affiliate_id, affiliate_name, affiliate_commission, buyer_email, status,
                       utm_source, utm_medium, utm_campaign, utm_content)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paga',$12,$13,$14,$15)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      ev.orderId, plan, ev.planName ?? null, ev.offerCode ?? null,
      ev.amount ?? 0, ev.kiwifyFee ?? 0, ev.producerNet ?? 0,
      aff?.id ?? null, aff?.name ?? ev.affiliate?.name ?? null, ev.affiliate?.commission ?? 0,
      ev.email ? ev.email.trim().toLowerCase() : null,
      tk?.source ?? null, tk?.medium ?? null, tk?.campaign ?? null, tk?.content ?? null,
    ],
  );
}

export interface BillingEvent {
  event: string; email?: string | null; amount?: number | null; productId?: string | null; orderId?: string | null;
  affiliate?: BillingAffiliate | null;
  planName?: string | null; offerCode?: string | null; kiwifyFee?: number | null; producerNet?: number | null;
  tracking?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null } | null;
  buyerName?: string | null; buyerPhone?: string | null; // pra provisionar a conta e entregar credenciais
}

// Senha legível pro cliente (alfanumérica, ~10 chars, sem caracteres ambíguos).
function genPassword(): string {
  const alfabeto = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(10);
  let out = "zc-";
  for (let i = 0; i < 8; i++) out += alfabeto[b[i] % alfabeto.length];
  return out;
}

// ATIVAÇÃO RETROATIVA: o caso comum é o cliente PAGAR na Kiwify e criar a conta DEPOIS — quando o
// webhook chegou, ainda não havia conta pra ativar. Aqui, no signup/login, olhamos a tabela `sales`
// (compras JÁ pagas do email) e liberamos o plano na hora. Idempotente. Retorna true se ativou.
export async function syncPaidAccess(email: string, wsId: string): Promise<boolean> {
  if (!dbEnabled) return false;
  const clean = email.trim().toLowerCase();
  // ⚠️ `grants_access` é OBRIGATÓRIO aqui. A tabela `sales` guarda TODA venda — inclusive as que
  // não são assinatura do app (o ingresso do workshop, R$ 17). Sem este filtro, comprar um
  // ingresso e se cadastrar com o mesmo e-mail liberava 37 dias de plano completo, contornando por
  // dentro do banco o portão isZapConverteSale que existe justamente pra impedir isso.
  const s = (await query<{ plan: string | null; created_at: string }>(
    "SELECT plan, created_at FROM sales WHERE buyer_email=$1 AND status='paga' AND grants_access ORDER BY created_at DESC LIMIT 1",
    [clean],
  ))[0];
  if (!s) return false;
  const paidUntil = new Date(new Date(s.created_at).getTime() + days(37)); // mensalidade + folga
  if (paidUntil <= new Date()) return false; // compra antiga já vencida → NÃO ativa (fica em atraso → paywall)
  await query(
    "UPDATE workspaces SET status='active', plan=COALESCE($1, plan), paid_until=GREATEST(COALESCE(paid_until, $2::timestamptz), $2::timestamptz) WHERE id=$3",
    [s.plan, paidUntil, wsId],
  );
  console.log(`✅ acesso ATIVADO retroativamente por compra Kiwify · ${clean} (plano ${s.plan ?? "?"})`);
  return true;
}

// Lista os CLIENTES (contas não-admin) com o status da assinatura derivado — pra tela de Clientes.
export interface ClientRow {
  ws_id: string;
  email: string; name: string; created_at: string;
  plan: string | null; status: string; paid_until: string | null; trial_ends_at: string | null;
  sales_count: number; last_sale: string | null; total_paid: string | number;
  sub_status: "ativo" | "trial" | "atrasado" | "cancelado" | "sem_acesso";
  trial_phone: string | null; // telefone que o lead deu no cadastro de trial (pro botão de WhatsApp)
}
export async function listClients(): Promise<ClientRow[]> {
  if (!dbEnabled) return [];
  const rows = await query<any>(
    `SELECT w.id AS ws_id, u.email, u.name, u.created_at,
            w.plan, w.status, w.paid_until, w.trial_ends_at,
            COALESCE((SELECT COUNT(*) FROM sales sa WHERE sa.buyer_email=u.email AND sa.status='paga'),0)::int AS sales_count,
            (SELECT MAX(sa.created_at) FROM sales sa WHERE sa.buyer_email=u.email AND sa.status='paga') AS last_sale,
            COALESCE((SELECT SUM(sa.gross) FROM sales sa WHERE sa.buyer_email=u.email AND sa.status='paga'),0) AS total_paid,
            (SELECT COALESCE(NULLIF(tl.lead_whatsapp,''), NULLIF(tl.lead_telefone,'')) FROM trial_leads tl
              WHERE tl.lead_email=u.email ORDER BY tl.created_at DESC LIMIT 1) AS trial_phone
       FROM users u JOIN workspaces w ON w.owner_user_id = u.id
      WHERE u.role <> 'admin'
        AND u.email NOT LIKE '%@zc-selftest.local'   -- contas do self-test do deploy
        AND u.email NOT LIKE '%@zc-verif.local'      -- contas de verificação
      ORDER BY u.created_at DESC LIMIT 500`,
  );
  const now = Date.now();
  return rows.map((r) => {
    const paidOk = r.paid_until && new Date(r.paid_until).getTime() > now && r.status !== "canceled";
    const trialOk = r.trial_ends_at && new Date(r.trial_ends_at).getTime() > now && r.status !== "canceled";
    let sub: ClientRow["sub_status"] = "sem_acesso";
    if (r.status === "canceled") sub = "cancelado";
    else if (paidOk) sub = "ativo";
    else if (trialOk) sub = "trial";
    else if (r.sales_count > 0) sub = "atrasado"; // já pagou antes, mas o acesso venceu (não renovou)
    return { ...r, sub_status: sub };
  });
}

// Reseta a senha de um cliente e DEVOLVE a nova (pro admin repassar). Rede de segurança contra o
// lockout: se a entrega automática (WhatsApp/email) falhar, o dono gera uma nova aqui e envia.
export async function setUserPassword(email: string): Promise<{ password: string; name: string | null } | null> {
  if (!dbEnabled) return null;
  const clean = email.trim().toLowerCase();
  const u = await query<{ id: string; name: string | null }>("SELECT id, name FROM users WHERE email=$1", [clean]);
  if (!u.length) return null;
  const password = genPassword();
  // must_change_password: a senha que passou pelo navegador do ADMIN vira temporária — morre no
  // primeiro uso (auditoria 06/08). O cliente é obrigado a definir a dele ao entrar.
  await query("UPDATE users SET pass_hash=$2, must_change_password=true WHERE id=$1", [u[0].id, hashPassword(password)]);
  await revokeOtherSessions(u[0].id); // senha resetada pelo admin → derruba TODAS as sessões
  return { password, name: u[0].name };
}

// ── Reset de senha self-service ("Esqueci minha senha") ──────────────────────
// Pede reset: se o e-mail existe, cria um token (devolve o CRU pro e-mail; guarda só o hash) com
// TTL de 1h. Retorna null se não há conta — o ENDPOINT responde genérico dos dois jeitos (não
// revela se o e-mail existe, anti-enumeração).
// `minutos`: 60 é o padrão do "esqueci a senha" (link que a pessoa PEDIU e vai usar na hora).
// Já no ONBOARDING (afiliado/comprador que recebe o link sem pedir, no WhatsApp/e-mail) 1 hora é
// curto demais — quem abre a mensagem à noite achava o link morto e travava na porta. Nesses casos
// passamos 7 dias: o link é de PRIMEIRO acesso de quem ainda nem tem senha, e chega no canal do
// próprio dono do e-mail/telefone.
export async function requestPasswordReset(email: string, minutos = 60): Promise<{ token: string; name: string | null } | null> {
  if (!dbEnabled) return null;
  const clean = email.trim().toLowerCase();
  const u = await query<{ id: string; name: string | null }>("SELECT id, name FROM users WHERE email=$1", [clean]);
  if (!u.length) return null;
  const token = randomBytes(32).toString("hex"); // 256 bits
  const hash = createHash("sha256").update(token).digest("hex");
  const mins = Math.max(5, Math.min(60 * 24 * 14, Math.round(minutos))); // teto de 14 dias
  // Invalida pedidos anteriores desse usuário (só o último link vale) e grava o novo.
  await query("DELETE FROM password_resets WHERE user_id=$1", [u[0].id]).catch(() => {});
  await query("INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES($1,$2, now() + ($3 || ' minutes')::interval)", [hash, u[0].id, String(mins)]);
  return { token, name: u[0].name };
}
export const MIN_LINK_ONBOARDING = 60 * 24 * 7; // 7 dias — primeiro acesso (afiliado/comprador)

// Aplica o reset: valida o token (hash, 1 uso, não expirado), troca a senha e DERRUBA todas as
// sessões do usuário (a senha pode ter vazado — expulsa qualquer invasor logado).
export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  if (!newPassword || newPassword.length < 6) return { error: "a senha precisa de pelo menos 6 caracteres" };
  const hash = createHash("sha256").update(String(token || "")).digest("hex");
  const r = await query<{ user_id: string }>(
    "SELECT user_id FROM password_resets WHERE token_hash=$1 AND used=FALSE AND expires_at > now()", [hash]);
  if (!r.length) return { error: "link inválido ou expirado — peça um novo" };
  const userId = r[0].user_id;
  await query("UPDATE users SET pass_hash=$2, must_change_password=FALSE WHERE id=$1", [userId, hashPassword(newPassword)]);
  await query("UPDATE password_resets SET used=TRUE WHERE token_hash=$1", [hash]);
  await revokeOtherSessions(userId); // sem keepToken = derruba TODAS
  return { ok: true };
}

// Cliente troca a PRÓPRIA senha (verifica a atual). Self-service em Configurações.
// Revoga as OUTRAS sessões: trocar a senha porque ela vazou tem que expulsar o invasor.
export async function changeOwnPassword(email: string, current: string, next: string, keepToken?: string): Promise<{ ok: true } | { error: string }> {
  if (!next || next.length < 6) return { error: "a nova senha precisa de pelo menos 6 caracteres" };
  const rows = await query<{ id: string; pass_hash: string }>("SELECT id, pass_hash FROM users WHERE email=$1", [email.trim().toLowerCase()]);
  if (!rows.length || !verifyPassword(current, rows[0].pass_hash)) return { error: "senha atual incorreta" };
  await query("UPDATE users SET pass_hash=$2, must_change_password=false WHERE id=$1", [rows[0].id, hashPassword(next)]);
  await revokeOtherSessions(rows[0].id, keepToken);
  return { ok: true };
}
// Atualiza o nome do usuário (Perfil).
export async function updateUserName(userId: string, name: string): Promise<void> {
  await query("UPDATE users SET name=$2 WHERE id=$1", [userId, String(name || "").trim().slice(0, 80) || "Sem nome"]);
}
// Atualiza a foto do usuário (URL já hospedada no /media). null limpa.
export async function updateUserAvatar(userId: string, url: string | null): Promise<void> {
  await query("UPDATE users SET avatar_url=$2 WHERE id=$1", [userId, url]);
}
// Renomeia o workspace do cliente.
export async function renameWorkspace(wsId: string, name: string): Promise<void> {
  await query("UPDATE workspaces SET name=$2 WHERE id=$1", [wsId, String(name || "").trim().slice(0, 80) || "Meu negócio"]);
}
// Resolve o workspace de um cliente pelo e-mail (pro super-admin liberar mais números etc.).
export async function workspaceIdByEmail(email: string): Promise<string | null> {
  const r = await query<{ id: string }>("SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1 ORDER BY w.id LIMIT 1", [email.trim().toLowerCase()]);
  return r[0]?.id ?? null;
}

// Cria a conta do comprador (user + workspace) se ainda não existir. Idempotente e à prova de corrida
// (ON CONFLICT + rechecagem). Retorna a senha EM TEXTO só quando cria de fato (pra entregar 1x).
export async function provisionAccount(email: string, name?: string | null): Promise<{ password: string; wsId: string; created: boolean }> {
  const clean = email.trim().toLowerCase();
  const nm = (name || clean.split("@")[0] || "Cliente").trim().slice(0, 80);
  const existing = await query<{ id: string }>("SELECT id FROM users WHERE email=$1", [clean]);
  let userId: string;
  let password = "";
  let created = false;
  if (existing.length) {
    userId = existing[0].id;
  } else {
    password = genPassword();
    userId = "u_" + randomUUID();
    await query("INSERT INTO users(id, email, name, pass_hash, role) VALUES($1,$2,$3,$4,'user') ON CONFLICT (email) DO NOTHING", [userId, clean, nm, hashPassword(password)]);
    // rechecagem: se outra execução criou primeiro, a senha que eu gerei NÃO vale → não entrega.
    const after = (await query<{ id: string }>("SELECT id FROM users WHERE email=$1", [clean]))[0];
    if (after && after.id === userId) created = true;
    else { userId = after?.id ?? userId; password = ""; created = false; }
  }
  let wsRow = (await query<{ id: string }>("SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1", [userId]))[0];
  if (!wsRow) {
    const wsId = "ws_" + randomUUID();
    // ON CONFLICT (owner_user_id): se outra execução criou primeiro, não duplica; o re-SELECT pega o real.
    await query("INSERT INTO workspaces(id, owner_user_id, name, status) VALUES($1,$2,$3,'trial') ON CONFLICT (owner_user_id) DO NOTHING", [wsId, userId, nm]);
    wsRow = (await query<{ id: string }>("SELECT id FROM workspaces WHERE owner_user_id=$1 ORDER BY id LIMIT 1", [userId]))[0] ?? { id: wsId };
  }
  return { password, wsId: wsRow.id, created };
}

export async function handleBillingEvent(
  ev: BillingEvent,
  onNewBuyer?: (info: { email: string; name: string | null; phone: string | null }) => Promise<void>,
  // Conta que JÁ EXISTIA foi ativada por uma compra (ou renovada). `renewed` distingue renovação
  // automática de 1ª compra — pro chamador mandar "boas-vindas" só na compra, não na renovação.
  onActivated?: (info: { email: string; name: string | null; plan: string | null; renewed: boolean }) => Promise<void>,
  // Venda NOVA de um afiliado (Fase C) → notificar o afiliado (e-mail + WhatsApp) com a comissão e os dados do cliente.
  onAffiliateSale?: (info: { affiliateEmail: string; affiliateName: string | null; commission: number; buyerName: string | null; buyerEmail: string | null; plan: string | null }) => Promise<void>,
  // Cliente desligou a renovação (Fase D) → e-mail de win-back (a Kiwify só manda o "cancelado" seco).
  onCanceled?: (info: { email: string; name: string | null; paidUntil: string | null; wsId: string }) => Promise<void>,
): Promise<void> {
  if (!dbEnabled || !ev.email || !BILLING_EVENTS.has(ev.event)) return; // ignora pix/boleto/carrinho — nada a fazer
  const email = ev.email.trim().toLowerCase();
  // Plano: prefere o nome da Kiwify (Subscription.plan.name), cai pro valor se não vier.
  const plan = planFromName(ev.planName) ?? (ev.amount != null ? PLAN_BY_AMOUNT(Number(ev.amount))?.plan ?? null : null);
  const buyerWs = async () =>
    (await query<any>("SELECT w.id FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1 ORDER BY w.id LIMIT 1", [email]))[0];

  if (ev.event === "purchase_approved" || ev.event === "subscription_renewed") {
    if (!isZapConverteSale(ev.productId, ev.amount)) {
      console.log(`💳 ${ev.event} de ${email} IGNORADO — não é venda do ZapConverte (produto ${ev.productId ?? "?"}, R$ ${ev.amount ?? "?"})`);
      return;
    }
    // (a) AFILIADO — métrica p/ ranking/premiação, independente de o comprador ter conta.
    const aff = ev.affiliate ? await recordAffiliateSale(ev.affiliate, ev.orderId ?? null, ev.amount ?? null, plan) : null;
    // (b) VENDA — detalhamento financeiro pro dashboard de ganhos (bruto/taxa/líquido/afiliado).
    await recordSale(ev, plan, aff);
    // (b2) META — avisa a API de Conversões que a venda aconteceu. Sem isto o anúncio otimiza por
    // CLIQUE (o checkout é na Kiwify, o pixel do site nunca vê a compra). Só em venda nova, com
    // event_id = pedido (retry do webhook não conta duas vezes). Best-effort: nunca derruba o fluxo.
    if (ev.event === "purchase_approved") {
      void enviaEventoMeta({
        evento: "Purchase", email, telefone: ev.buyerPhone ?? null, nome: ev.buyerName ?? null,
        valor: ev.amount != null ? Number(ev.amount) : null, idPedido: ev.orderId ?? null,
      }).catch(() => {});
    }
    // (d) NOTIFICA O AFILIADO (Fase C): só em venda NOVA (não renovação, não retry do webhook) e se
    // temos o e-mail dele. `aff.isNew` garante 1 aviso por venda.
    if (ev.event === "purchase_approved" && aff?.isNew && aff.email && onAffiliateSale) {
      await onAffiliateSale({ affiliateEmail: aff.email, affiliateName: aff.name, commission: aff.commission, buyerName: ev.buyerName ?? null, buyerEmail: email, plan }).catch((e) => console.error("onAffiliateSale:", e?.message));
    }
    // (c) Ativa o workspace do COMPRADOR — provisiona a conta se ele ainda não tiver.
    const paidUntil = new Date(Date.now() + days(37)); // 37 dias = mensalidade + folga (atraso de webhook)
    const ws = await buyerWs();
    if (!ws) {
      // Sem conta: NÃO criamos a conta. Mandamos a copy de boas-vindas com o LINK DE CADASTRO
      // (e-mail da compra pré-preenchido). Quando o cliente se cadastrar, syncPaidAccess (no signup)
      // cruza o e-mail com esta venda e libera o plano — o cliente define a própria senha.
      if (onNewBuyer) await onNewBuyer({ email, name: ev.buyerName ?? null, phone: ev.buyerPhone ?? null }).catch((e) => console.error("boas-vindas:", e?.message));
      console.log(`💳 ${email} — comprador sem conta: DISPAREI boas-vindas + link de cadastro (ativa ao se cadastrar). Se saiu mesmo, veja as linhas de e-mail/WhatsApp acima.`);
      return;
    }
    await query("UPDATE workspaces SET status='active', plan=COALESCE($1, plan), paid_until=$2 WHERE id=$3", [plan, paidUntil, ws.id]);
    // Amarra o CLIENTE ao afiliado que o trouxe. Antes só o cadastro por link `?ref=` gravava isso,
    // e o caminho real (venda pela Kiwify) não gravava nada — por isso a carteira do afiliado
    // aparecia zerada no painel mesmo com venda paga (caso real 10/08). COALESCE: a primeira
    // atribuição manda, renovação não rouba o cliente de outro afiliado.
    if (aff?.id) await query("UPDATE workspaces SET referred_by=COALESCE(referred_by,$1) WHERE id=$2", [aff.id, ws.id]);
    console.log(`💳 workspace ${ws.id} ATIVO (${plan ?? "plano mantido"}) · ${email}`);
    if (onActivated) await onActivated({ email, name: ev.buyerName ?? null, plan, renewed: ev.event === "subscription_renewed" }).catch((e) => console.error("onActivated:", e?.message));
  } else if (ev.event === "refund" || ev.event === "chargeback") {
    if (!isZapConverteSale(ev.productId, ev.amount)) {
      console.log(`💳 ${ev.event} de ${email} IGNORADO — não é produto do ZapConverte (${ev.productId ?? "?"})`);
      return;
    }
    // Estorna a comissão do afiliado E a venda (por order_id, independe do comprador).
    // Estorna TAMBÉM o que já estava marcado como "pago": antes o filtro era `status='pendente'`, e
    // uma venda estornada DEPOIS de o dono marcar o pagamento seguia contando no acumulado e no
    // ranking/premiação (auditoria 10/08). O log diferencia os dois casos — comissão já paga pode
    // exigir acerto com o afiliado, e isso precisa aparecer.
    if (ev.orderId) {
      // Lê ANTES pra saber se já estava paga (o RETURNING do UPDATE traria o status novo).
      const antes = await query<{ status: string }>("SELECT status FROM commissions WHERE order_id=$1", [ev.orderId]);
      const rev = await query<{ id: string }>("UPDATE commissions SET status='estornado' WHERE order_id=$1 AND status <> 'estornado' RETURNING id", [ev.orderId]);
      if (rev.length) {
        const eraPaga = antes.some((r) => r.status === "pago");
        console.log(`↩️  comissão estornada (order ${ev.orderId})${eraPaga ? " — ⚠️ ela JÁ ESTAVA MARCADA COMO PAGA: confira o acerto com o afiliado" : ""}`);
      }
      await query("UPDATE sales SET status='estornada' WHERE order_id=$1", [ev.orderId]);
    }
    // Estorno REVOGA o comprador agora: zera acesso pago E qualquer trial de sobra. Cancela TODOS
    // os workspaces do email (defesa contra dups legados — o índice único evita novos).
    const rv = await query<{ id: string }>(
      "UPDATE workspaces SET status='canceled', paid_until=NULL, trial_ends_at=NULL WHERE owner_user_id IN (SELECT id FROM users WHERE email=$1) RETURNING id",
      [email],
    );
    if (rv.length) console.log(`💳 ${rv.length} workspace(s) ESTORNADO(s) (${ev.event}) · ${email}`);
  } else if (ev.event === "subscription_canceled") {
    // Cancelamento de renovação NÃO tira o que já foi pago — o acesso segue até paid_until expirar.
    console.log(`💳 renovação DESLIGADA (${email}) — acesso mantido até o fim do período pago.`);
    if (onCanceled) {
      const w = (await query<{ id: string; paid_until: string | null }>("SELECT w.id, w.paid_until FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1 ORDER BY w.id LIMIT 1", [email]))[0];
      if (w) await onCanceled({ email, name: ev.buyerName ?? null, paidUntil: w.paid_until, wsId: w.id }).catch((e) => console.error("onCanceled:", e?.message));
    }
  }
}

// Resumo financeiro pro dashboard de vendas (período): bruto, taxa, SEUS ganhos, pago a afiliados.
export async function salesSummary(sinceIso?: string | null): Promise<any> {
  if (!dbEnabled) return { totals: {}, byPlan: [], recent: [] };
  const since = sinceIso ? [sinceIso] : null;
  const where = since ? "WHERE status='paga' AND created_at >= $1" : "WHERE status='paga'";
  const totals = (await query<any>(
    `SELECT COUNT(*)::int AS vendas, COALESCE(SUM(gross),0) AS bruto, COALESCE(SUM(kiwify_fee),0) AS taxa_kiwify,
            COALESCE(SUM(producer_net),0) AS meus_ganhos, COALESCE(SUM(affiliate_commission),0) AS pago_afiliados,
            COUNT(*) FILTER (WHERE affiliate_id IS NOT NULL)::int AS vendas_afiliado
       FROM sales ${where}`,
    since ?? [],
  ))[0];
  const byPlan = await query<any>(
    `SELECT COALESCE(plan,'—') AS plan, COUNT(*)::int AS vendas, COALESCE(SUM(gross),0) AS bruto,
            COALESCE(SUM(producer_net),0) AS meus_ganhos, COALESCE(SUM(affiliate_commission),0) AS pago_afiliados
       FROM sales ${where} GROUP BY plan ORDER BY bruto DESC`,
    since ?? [],
  );
  const recent = await query<any>(
    `SELECT order_id, plan, plan_name, gross, kiwify_fee, producer_net, affiliate_name, affiliate_commission, buyer_email, status, created_at,
            utm_source, utm_medium, utm_campaign, utm_content
       FROM sales ORDER BY created_at DESC LIMIT 50`,
  );
  return { totals, byPlan, recent };
}

// NOTA (atribuição in-house, dormente): antes a comissão vinha do `?ref=` do nosso cadastro
// (workspaces.referred_by → commission_pct). Trocamos pela fonte KIWIFY (recordAffiliateSale acima),
// que é como o dono opera. O campo referred_by continua sendo capturado no signup (harmless) caso
// um dia a gente queira atribuição própria por link do painel — aí é só voltar a comissionar por ele.
