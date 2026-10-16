// EQUIPE (multiusuário por workspace): membros + convites por e-mail com papéis.
//
// Modelo: o DONO é workspaces.owner_user_id (não vive em workspace_members). Os convidados ficam em
// workspace_members com papel 'admin' (tudo operacional + convida) ou 'atendente' (só inbox/contatos).
// getSession (saas.ts) resolve o workspace por DONO **ou** por MEMBRO — é isso que faz o convidado
// entrar no painel do dono já escopado, sem workspace próprio.
//
// Segurança dos convites: token aleatório de 32 bytes, amarrado a UM e-mail (só ele aceita — o link
// vazado não serve pra outra pessoa), uso único (accepted_at) e expiração de 7 dias.
import { randomBytes, randomUUID } from "node:crypto";
import { dbEnabled, query } from "./db.js";
import { hashPassword, ADMIN_EMAIL } from "./saas.js";
import { sendEmail, esc } from "./lib/mail.js";
import { normalizaPermissoes, lePermissoes, type Permissoes } from "./permissoes.js";
export { AREAS_PERMISSAO, normalizaPermissoes, lePermissoes, rotaLiberada, type Permissoes } from "./permissoes.js";

const PANEL_URL = (process.env.PANEL_URL || "https://painel.seudominio.com.br").replace(/\/+$/, "");
const INVITE_DAYS = 7;
const MAX_MEMBERS = 25; // teto por workspace (anti-abuso; generoso pro uso real)
const ROLES = new Set(["admin", "atendente"]);


export async function setMemberPermissions(wsId: string, userId: string, perms: Permissoes | null): Promise<{ ok: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const r = await query<{ user_id: string }>(
    "UPDATE workspace_members SET permissions=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id",
    [wsId, userId, perms ? JSON.stringify(perms) : null],
  );
  if (!r.length) return { error: "essa pessoa não está na sua equipe" };
  return { ok: true };
}

export interface TeamMember {
  user_id: string;
  email: string;
  name: string;
  role: "dono" | "admin" | "atendente";
  is_owner: boolean;
  created_at: string;
  last_seen: string | null;
  permissions?: Permissoes | null;
}
export interface TeamInvite {
  token: string; email: string; role: string; expires_at: string; created_at: string; link: string;
}

// Lista o DONO + os membros + os convites pendentes de um workspace.
// ⚠️ `withTokens` SÓ pra quem gerencia (dono/admin). O TOKEN do convite é uma CREDENCIAL: quem tem
// o link vira membro com o papel do convite. Se um atendente enxergasse um convite pendente de
// "admin" cujo e-mail ainda não tem conta, ele criaria essa conta com a própria senha e viraria
// admin do workspace — escalada de privilégio. Sem tokens, ele só vê que existe um convite.
export async function listTeam(wsId: string, withTokens = false): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  if (!dbEnabled) return { members: [], invites: [] };
  const members = await query<any>(
    `SELECT u.id AS user_id, u.email, u.name, 'dono' AS role, TRUE AS is_owner, w.created_at,
            (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen,
            NULL AS permissions
       FROM workspaces w JOIN users u ON u.id = w.owner_user_id
      WHERE w.id=$1
     UNION ALL
     SELECT u.id AS user_id, u.email, u.name, m.role, FALSE AS is_owner, m.created_at,
            (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen,
            m.permissions
       FROM workspace_members m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id=$1
      ORDER BY is_owner DESC, created_at ASC`,
    [wsId],
  );
  const invites = await query<any>(
    `SELECT token, email, role, expires_at, created_at FROM workspace_invites
      WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
    [wsId],
  );
  return {
    members: members.map((m) => ({ ...m, permissions: lePermissoes(m.permissions) })) as TeamMember[],
    invites: invites.map((i) =>
      withTokens
        ? { ...i, link: `${PANEL_URL}/convite/${i.token}` }
        : { ...i, token: "", link: "" }, // atendente vê que existe convite, mas NUNCA o token
    ),
  };
}

// Cria (ou renova) o convite e tenta entregar por e-mail. SEMPRE devolve o link — a entrega por
// e-mail depende de RESEND_API_KEY; sem ela o dono copia o link e manda no WhatsApp.
export async function inviteMember(
  wsId: string, wsName: string, invitedBy: string, inviterName: string, emailRaw: string, roleRaw: string,
  permsRaw?: any,
): Promise<{ ok: true; link: string; emailed: boolean; email: string } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const role = String(roleRaw ?? "atendente").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { error: "e-mail inválido" };
  if (!ROLES.has(role)) return { error: "papel inválido (use admin ou atendente)" };
  // A conta do SISTEMA (admin do ZapConverte) nunca entra em equipe de cliente — o /auth/signup já
  // barra esse e-mail; sem isto, o convite seria um caminho alternativo pra "squattar" a conta.
  if (email === ADMIN_EMAIL) return { error: "esse e-mail não pode ser convidado" };

  // Já é o dono deste workspace?
  const owner = await query<{ email: string }>(
    "SELECT u.email FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE w.id=$1", [wsId],
  );
  if (owner[0]?.email === email) return { error: "esse e-mail é o dono da conta" };

  // Já é membro deste workspace?
  const already = await query(
    "SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND u.email=$2",
    [wsId, email],
  );
  if (already.length) return { error: "essa pessoa já está na sua equipe" };

  // A conta já existe e pertence a OUTRO workspace (dona da própria conta ou membro de outra equipe)?
  // Bloqueia agora com mensagem clara em vez de falhar no aceite (índice único por user_id).
  const other = await query<{ kind: string }>(
    `SELECT 'dono' AS kind FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE u.email=$1
     UNION ALL
     SELECT 'membro' AS kind FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE u.email=$1 AND m.workspace_id<>$2`,
    [email, wsId],
  );
  if (other.length) return { error: `esse e-mail já tem conta própria no ZapConverte (${other[0].kind}) — peça pra usar outro e-mail` };

  // Um convite pendente por (workspace, e-mail): renova o token/prazo em vez de acumular.
  // ⚠️ Isto vem ANTES da contagem: no teto, RENOVAR o convite de quem já está na lista era
  // recusado ("limite atingido") mesmo sem adicionar ninguém.
  await query("DELETE FROM workspace_invites WHERE workspace_id=$1 AND email=$2 AND accepted_at IS NULL", [wsId, email]);

  // O teto conta o DONO + MEMBROS + CONVITES PENDENTES — senão dava pra estourar o limite só
  // acumulando convites, e o dono não entrava na conta (o teto real virava MAX+1 pessoas).
  const { count } = (await query<{ count: string }>(
    `SELECT (1 + (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=$1)
              + (SELECT COUNT(*) FROM workspace_invites WHERE workspace_id=$1 AND accepted_at IS NULL AND expires_at > now()))::int AS count`,
    [wsId],
  ))[0] ?? { count: "0" };
  if (Number(count) >= MAX_MEMBERS) return { error: `limite de ${MAX_MEMBERS} pessoas (contando o dono e os convites pendentes) — remova alguém ou cancele um convite` };
  const token = randomBytes(32).toString("hex");
  const perms = normalizaPermissoes(permsRaw);
  await query(
    "INSERT INTO workspace_invites(token, workspace_id, email, role, invited_by, expires_at, permissions) VALUES($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval, $7)",
    [token, wsId, email, role, invitedBy, String(INVITE_DAYS), perms ? JSON.stringify(perms) : null],
  );
  const link = `${PANEL_URL}/convite/${token}`;
  const emailed = await sendEmail(
    email,
    `${esc(inviterName)} te convidou pra equipe no ZapConverte`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6">
       <h2 style="margin:0 0 8px">Você foi convidado 🎉</h2>
       <p><b>${esc(inviterName)}</b> te convidou pra participar da conta <b>${esc(wsName)}</b> no ZapConverte
          como <b>${esc(role === "admin" ? "Administrador" : "Atendente")}</b>.</p>
       <p style="margin:22px 0"><a href="${link}" style="background:#25D366;color:#062916;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">Aceitar convite</a></p>
       <p style="color:#666;font-size:13px">Ou copie este link: ${link}<br>O convite vale por ${INVITE_DAYS} dias e só funciona pro e-mail ${esc(email)}.</p>
     </div>`,
  ).catch(() => false);
  return { ok: true, link, emailed: !!emailed, email };
}

// Dados públicos do convite (pra tela de aceite mostrar de quem é, sem exigir login).
export async function getInvite(token: string): Promise<{ email: string; role: string; wsName: string; needsAccount: boolean } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const r = await query<any>(
    `SELECT i.email, i.role, w.name AS ws_name, i.accepted_at, i.expires_at
       FROM workspace_invites i JOIN workspaces w ON w.id = i.workspace_id
      WHERE i.token=$1`,
    [String(token ?? "")],
  );
  if (!r.length) return { error: "convite não encontrado" };
  if (r[0].accepted_at) return { error: "esse convite já foi usado" };
  if (new Date(r[0].expires_at).getTime() < Date.now()) return { error: "esse convite expirou — peça um novo" };
  const has = await query("SELECT 1 FROM users WHERE email=$1", [r[0].email]);
  return { email: r[0].email, role: r[0].role, wsName: r[0].ws_name, needsAccount: has.length === 0 };
}

// Aceita o convite. Dois caminhos:
//  • conta NÃO existe → cria (nome + senha) e vira membro;
//  • conta existe     → exige a SENHA dela (prova de posse) e vincula.
// Devolve o token de sessão pra já entrar logado.
export async function acceptInvite(
  token: string, name: string, password: string,
): Promise<{ token: string } | { needLogin: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const inv = await query<any>(
    "SELECT token, workspace_id, email, role, accepted_at, expires_at, permissions FROM workspace_invites WHERE token=$1",
    [String(token ?? "")],
  );
  if (!inv.length) return { error: "convite não encontrado" };
  const i = inv[0];
  if (i.accepted_at) return { error: "esse convite já foi usado" };
  if (new Date(i.expires_at).getTime() < Date.now()) return { error: "esse convite expirou — peça um novo" };
  if (!password || password.length < 6) return { error: "a senha precisa de pelo menos 6 caracteres" };

  // O workspace ainda existe? (dono pode ter sido apagado no meio)
  const ws = await query("SELECT 1 FROM workspaces WHERE id=$1", [i.workspace_id]);
  if (!ws.length) return { error: "a conta que te convidou não existe mais" };

  // A conta do sistema nunca vira membro (mesma trava do /auth/signup).
  const { ADMIN_EMAIL: SYS_ADMIN } = await import("./saas.js");
  if (i.email === SYS_ADMIN) return { error: "esse convite não pode ser usado" };

  const existing = await query<{ id: string; pass_hash: string; totp_on: boolean }>("SELECT id, pass_hash, totp_on FROM users WHERE email=$1", [i.email]);
  let userId = ""; // preenchido no ramo "conta existe" ou na criação, sempre antes do vínculo
  let jaTinhaConta = false;
  if (existing.length) {
    // Conta já existe: exige a senha dela (senão o link daria acesso à conta de alguém).
    const { verifyPassword } = await import("./saas.js");
    if (!verifyPassword(password, existing[0].pass_hash)) return { error: "essa conta já existe — digite a SENHA dela pra entrar na equipe" };
    userId = existing[0].id;
    jaTinhaConta = true;
    // Não pode já ser dono/membro de outro workspace (índice único por user_id barraria).
    const other = await query(
      `SELECT 1 FROM workspaces WHERE owner_user_id=$1
       UNION ALL SELECT 1 FROM workspace_members WHERE user_id=$1`, [userId],
    );
    if (other.length) return { error: "essa conta já pertence a outro workspace do ZapConverte" };
  }

  // CONSOME O CONVITE PRIMEIRO (uso único atômico). Se perder a corrida — 2 cliques simultâneos ou
  // o dono revogando neste instante — para AQUI, antes de criar conta ou virar membro.
  // ⚠️ A CRIAÇÃO DA CONTA TAMBÉM vem depois disto (era antes): com o convite revogado, quem tinha
  // o link ainda criava uma conta PERMANENTE no e-mail da vítima, com a senha dele. A vítima nunca
  // mais conseguia se cadastrar ("já existe conta com esse e-mail") e não há como apagar usuário
  // pelo sistema. Consumir primeiro fecha isso.
  const used = await query<{ token: string }>(
    "UPDATE workspace_invites SET accepted_at=now() WHERE token=$1 AND accepted_at IS NULL AND expires_at > now() RETURNING token", [i.token],
  );
  if (!used.length) return { error: "esse convite já foi usado ou cancelado" };

  if (!existing.length) {
    const nm = String(name ?? "").trim().slice(0, 80) || i.email.split("@")[0];
    userId = "u_" + randomUUID();
    try {
      // ON CONFLICT: dois cliques simultâneos no mesmo link davam 23505 → 500 seco na cara do convidado.
      const criado = await query<{ id: string }>(
        "INSERT INTO users(id, email, name, pass_hash, role) VALUES($1,$2,$3,$4,'user') ON CONFLICT (email) DO NOTHING RETURNING id",
        [userId, i.email, nm, hashPassword(password)],
      );
      if (!criado.length) { // alguém criou a conta no meio do caminho → exige a senha dela
        await query("UPDATE workspace_invites SET accepted_at=NULL WHERE token=$1", [i.token]).catch(() => {});
        return { error: "essa conta já existe — digite a SENHA dela pra entrar na equipe" };
      }
    } catch (e) {
      await query("UPDATE workspace_invites SET accepted_at=NULL WHERE token=$1", [i.token]).catch(() => {});
      throw e;
    }
  }

  // Conta que JÁ EXISTIA e tem 2FA: NÃO vincula ainda — devolver o vínculo antes do segundo fator
  // deixaria quem tem só a senha mover a conta da vítima pra um workspace escolhido por ele.
  // O convite fica pendente de novo e vale quando ela entrar pelo login normal, com o código.
  if (jaTinhaConta && existing[0].totp_on) {
    await query("UPDATE workspace_invites SET accepted_at=NULL WHERE token=$1", [i.token]).catch(() => {});
    return { needLogin: true };
  }

  // Vincula. ON CONFLICT cobre (workspace_id,user_id); o UNIQUE(user_id) pode estourar 23505 numa
  // corrida — devolvo o convite pro estado pendente pra não queimá-lo por um erro que não é do usuário.
  try {
    await query(
      // As permissões viajam no CONVITE e viram as do membro no aceite — senão o funcionário
      // entraria com acesso total até o dono lembrar de restringir.
      "INSERT INTO workspace_members(workspace_id, user_id, role, permissions) VALUES($1,$2,$3,$4) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role=EXCLUDED.role, permissions=EXCLUDED.permissions",
      [i.workspace_id, userId, ROLES.has(i.role) ? i.role : "atendente", i.permissions ?? null],
    );
  } catch (e: any) {
    await query("UPDATE workspace_invites SET accepted_at=NULL WHERE token=$1", [i.token]).catch(() => {});
    if (e?.code === "23505") return { error: "essa conta já pertence a outro workspace do ZapConverte" };
    throw e;
  }
  console.log(`👥 equipe: ${i.email} entrou no workspace ${i.workspace_id} como ${i.role}`);

  const { createSessionFor } = await import("./saas.js");
  return { token: await createSessionFor(userId) };
}

// Remove alguém da equipe (o DONO nunca sai por aqui). Derruba as sessões da pessoa na hora —
// senão ela continuaria dentro do painel por até 30 dias depois de ser removida.
export async function removeMember(wsId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const owner = await query<{ owner_user_id: string }>("SELECT owner_user_id FROM workspaces WHERE id=$1", [wsId]);
  if (owner[0]?.owner_user_id === userId) return { error: "o dono da conta não pode ser removido" };
  const r = await query<{ user_id: string }>(
    "DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id", [wsId, userId],
  );
  if (!r.length) return { error: "essa pessoa não está na sua equipe" };
  await query("DELETE FROM sessions WHERE user_id=$1", [userId]).catch(() => {});
  return { ok: true };
}

// Troca o papel de um membro (admin ↔ atendente). Derruba as sessões pra o novo papel valer já
// (a permissão é lida da sessão a cada request, mas o nav/telas em cache não).
export async function setMemberRole(wsId: string, userId: string, roleRaw: string): Promise<{ ok: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const role = String(roleRaw ?? "").trim().toLowerCase();
  if (!ROLES.has(role)) return { error: "papel inválido (use admin ou atendente)" };
  const owner = await query<{ owner_user_id: string }>("SELECT owner_user_id FROM workspaces WHERE id=$1", [wsId]);
  if (owner[0]?.owner_user_id === userId) return { error: "o dono já tem acesso total" };
  const r = await query<{ user_id: string }>(
    "UPDATE workspace_members SET role=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id", [wsId, userId, role],
  );
  if (!r.length) return { error: "essa pessoa não está na sua equipe" };
  await query("DELETE FROM sessions WHERE user_id=$1", [userId]).catch(() => {});
  return { ok: true };
}

// Cancela um convite pendente.
export async function revokeInvite(wsId: string, token: string): Promise<{ ok: true } | { error: string }> {
  if (!dbEnabled) return { error: "banco indisponível" };
  const r = await query<{ token: string }>(
    "DELETE FROM workspace_invites WHERE workspace_id=$1 AND token=$2 AND accepted_at IS NULL RETURNING token",
    [wsId, String(token ?? "")],
  );
  return r.length ? { ok: true } : { error: "convite não encontrado" };
}
