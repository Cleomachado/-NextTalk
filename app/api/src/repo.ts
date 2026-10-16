import { dbEnabled, query } from "./db.js";
import { getCurrentWorkspace } from "./workspace-context.js";
import { variante9BR } from "./lib/phone.js";

// 📞 As formas do mesmo número BR (com/sem o 9º dígito). O wa_id da Meta derruba o 9 em números
// antigos e as plataformas de venda mandam COM o 9 — o MESMO lead vira duas chaves e o estado
// (pending de botão, ficha, pix, UTM, opt-out, pagamento) sumia no meio (caso de um lead, 21-22/08).
// Regra: ESCREVE na forma que chegou; LÊ nas duas (a forma exata vence); LIMPA as duas.
function formas(phone: string): string[] {
  const v = variante9BR(phone);
  return v ? [phone, v] : [phone];
}

// ★ MULTI-TENANT (Fase 3): toda função de dados de tenant aceita `wsId?` (default = workspace primário
// = Admin). Hoje tudo cai no primário → single-tenant idêntico; a Fase 4 passa o workspace real por
// instância. As queries filtram/gravam por workspace_id; PKs viram (workspace_id, phone).

// Fallbacks em memória (quando não há banco — dev local).
const memDedup = new Set<string>();
const memOptOut = new Set<string>();

// Idempotência de webhook: retorna true se a chave JÁ foi vista (duplicado).
export async function isDuplicate(key: string): Promise<boolean> {
  if (!dbEnabled) {
    if (memDedup.has(key)) return true;
    memDedup.add(key);
    return false;
  }
  try {
    const rows = await query(
      "INSERT INTO webhook_dedup(key) VALUES($1) ON CONFLICT (key) DO NOTHING RETURNING key",
      [key],
    );
    return rows.length === 0; // 0 linhas inseridas = já existia = duplicado
  } catch {
    return false; // em caso de erro, não bloqueia o processamento
  }
}

// Devolve a chave pro caixa. Serve pra quem usa isDuplicate como RESERVA de um trabalho que ainda
// pode falhar: reserva antes (pra duas chamadas simultâneas não fazerem a mesma coisa duas vezes) e
// libera se der errado, pra que o reenvio da plataforma tenha uma nova chance. Sem isto, uma falha
// de rede de 1 segundo marcava o evento como "já processado" PARA SEMPRE.
export async function liberaDedup(key: string): Promise<void> {
  if (!dbEnabled) { memDedup.delete(key); return; }
  try { await query("DELETE FROM webhook_dedup WHERE key = $1", [key]); } catch { /* best-effort */ }
}

// Devolve TRUE quando o contato acabou de nascer (1ª vez que essa pessoa aparece no workspace).
// É o que permite o gatilho "primeiro contato": o `xmax = 0` do Postgres distingue INSERT de UPDATE
// dentro do próprio UPSERT — sem SELECT extra e sem corrida entre duas mensagens simultâneas.
export async function upsertContact(phone: string, name?: string, platform?: string, wsId?: string, email?: string): Promise<boolean> {
  if (!dbEnabled) return false;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const r = await query<{ novo: boolean }>(
      `INSERT INTO contacts(workspace_id, phone, name, platform, email) VALUES($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, phone) DO UPDATE
         SET name = CASE WHEN contacts.name_manual THEN contacts.name ELSE COALESCE(EXCLUDED.name, contacts.name) END, -- nome digitado na ficha vence o do WhatsApp
             -- platform = ORIGEM (1º canal). Preserva 'kiwify' de um comprador mesmo que ele depois
             -- responda no WhatsApp — senão o rótulo de origem se perdia a cada inbound.
             platform = COALESCE(contacts.platform, EXCLUDED.platform),
             email = COALESCE(EXCLUDED.email, contacts.email),
             last_seen = now()
       RETURNING (xmax = 0) AS novo`,
      [ws, phone, name ?? null, platform ?? null, email ?? null],
    );
    return !!r[0]?.novo;
  } catch {
    /* não trava o fluxo */
    return false;
  }
}

// Busca contato pelo NOME (captura de lembrete: "manda pro João…"). Mais recente primeiro.
export async function searchContactsByName(name: string, wsId?: string): Promise<Array<{ phone: string; name: string | null }>> {
  if (!dbEnabled || !name.trim()) return [];
  const ws = wsId ?? getCurrentWorkspace();
  try {
    return await query<{ phone: string; name: string | null }>(
      "SELECT phone, name FROM contacts WHERE workspace_id=$1 AND name ILIKE $2 ORDER BY last_seen DESC LIMIT 3",
      [ws, "%" + name.trim() + "%"],
    );
  } catch {
    return [];
  }
}

// Importa vários contatos de uma vez (bulk). Um único INSERT (via unnest) em vez de milhares de
// round-trips — pra uma importação de grupo de 1024 membros não pendurar o request. Retorna quantas
// linhas foram gravadas (contagem REAL). PROPAGA erro (não engole) pro endpoint saber se falhou.
export async function bulkImportContacts(
  entries: Array<{ phone: string; name?: string | null }>,
  platform: string,
  wsId?: string,
): Promise<number> {
  if (!dbEnabled || entries.length === 0) return 0;
  const ws = wsId ?? getCurrentWorkspace();
  const byPhone = new Map<string, string | null>();
  for (const e of entries) if (e.phone) byPhone.set(e.phone, e.name ?? null);
  const phones = [...byPhone.keys()];
  if (!phones.length) return 0;
  const names = phones.map((p) => byPhone.get(p) ?? null);
  const rows = await query<{ phone: string }>(
    `INSERT INTO contacts(workspace_id, phone, name, platform)
       SELECT $1, p, n, $2 FROM unnest($3::text[], $4::text[]) AS t(p, n)
     ON CONFLICT (workspace_id, phone) DO UPDATE
       SET name = CASE WHEN contacts.name_manual THEN contacts.name ELSE COALESCE(EXCLUDED.name, contacts.name) END, -- nome digitado na ficha vence o do WhatsApp
           platform = COALESCE(contacts.platform, EXCLUDED.platform),
           last_seen = now()
     RETURNING phone`,
    [ws, platform, phones, names],
  );
  return rows.length;
}

// Marca vários telefones com várias tags de uma vez (produto phones × tags), num único INSERT.
export async function bulkAddContactTags(
  phones: string[],
  tags: string[],
  source: string | null,
  wsId?: string,
): Promise<void> {
  if (!dbEnabled || phones.length === 0 || tags.length === 0) return;
  const ws = wsId ?? getCurrentWorkspace();
  const pArr: string[] = [];
  const tArr: string[] = [];
  for (const p of phones) for (const t of tags) { pArr.push(p); tArr.push(t); }
  await query(
    `INSERT INTO contact_tags(workspace_id, phone, tag, source)
       SELECT $1, p, t, $2 FROM unnest($3::text[], $4::text[]) AS x(p, t)
     ON CONFLICT (workspace_id, phone, tag) DO NOTHING`,
    [ws, source, pArr, tArr],
  );
}

// Marca um contato com uma tag (idempotente). source = de onde veio (ex.: 'group-import').
export async function addContactTag(phone: string, tag: string, source: string | null, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const t = String(tag ?? "").trim();
  if (!t) return;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    await query(
      "INSERT INTO contact_tags(workspace_id, phone, tag, source) VALUES($1,$2,$3,$4) ON CONFLICT (workspace_id, phone, tag) DO NOTHING",
      [ws, phone, t, source],
    );
  } catch {
    /* não trava a importação */
  }
}

// ── Tags do workspace (gerenciador em Configurações) ─────────────────────────────────────────────
// A lista = UNIÃO das tags já usadas em contact_tags + as pré-criadas no tag_registry, com a contagem
// de contatos por tag. Escopado pelo workspace corrente (getCurrentWorkspace) — cliente vê só as dele.
export async function listWorkspaceTags(wsId?: string): Promise<Array<{ tag: string; count: number }>> {
  if (!dbEnabled) return [];
  const ws = wsId ?? getCurrentWorkspace();
  const rows = await query<{ tag: string; count: string }>(
    `SELECT t.tag, COUNT(DISTINCT ct.phone)::int AS count
       FROM (
         SELECT tag FROM contact_tags WHERE workspace_id=$1
         UNION
         SELECT tag FROM tag_registry WHERE workspace_id=$1
       ) t
       LEFT JOIN contact_tags ct ON ct.workspace_id=$1 AND ct.tag=t.tag
      GROUP BY t.tag
      ORDER BY count DESC, t.tag ASC`,
    [ws],
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) || 0 }));
}
export async function createWorkspaceTag(tag: string, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const t = String(tag ?? "").trim();
  if (!t) return;
  const ws = wsId ?? getCurrentWorkspace();
  await query("INSERT INTO tag_registry(workspace_id, tag) VALUES($1,$2) ON CONFLICT (workspace_id, tag) DO NOTHING", [ws, t]);
}
// Renomeia em contact_tags E no registro. Dedup: se o novo já existe no MESMO contato, só apaga o antigo
// (evita violar o índice único (ws, phone, tag)).
export async function renameWorkspaceTag(oldTag: string, newTag: string, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const o = String(oldTag ?? "").trim(), n = String(newTag ?? "").trim();
  if (!o || !n || o === n) return;
  const ws = wsId ?? getCurrentWorkspace();
  await query(
    `UPDATE contact_tags SET tag=$3 WHERE workspace_id=$1 AND tag=$2
       AND NOT EXISTS (SELECT 1 FROM contact_tags c2 WHERE c2.workspace_id=$1 AND c2.phone=contact_tags.phone AND c2.tag=$3)`,
    [ws, o, n],
  );
  await query("DELETE FROM contact_tags WHERE workspace_id=$1 AND tag=$2", [ws, o]); // sobras que colidiram com o novo
  await query("INSERT INTO tag_registry(workspace_id, tag) VALUES($1,$3) ON CONFLICT DO NOTHING", [ws, o, n]);
  await query("DELETE FROM tag_registry WHERE workspace_id=$1 AND tag=$2", [ws, o]);
}
export async function deleteWorkspaceTag(tag: string, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const t = String(tag ?? "").trim();
  if (!t) return;
  const ws = wsId ?? getCurrentWorkspace();
  await query("DELETE FROM contact_tags WHERE workspace_id=$1 AND tag=$2", [ws, t]);
  await query("DELETE FROM tag_registry WHERE workspace_id=$1 AND tag=$2", [ws, t]);
}

// Salva a foto de perfil JÁ HOSPEDADA (URL do /media/… — persiste no redeploy). null = sem foto.
export async function setContactAvatar(phone: string, avatarUrl: string | null, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    await query("UPDATE contacts SET avatar_url=$3 WHERE workspace_id=$1 AND phone=$2", [ws, phone, avatarUrl]);
  } catch {
    /* enriquecimento de foto é best-effort */
  }
}

// Telefones que ainda NÃO têm foto salva (pro enriquecedor puxar do /chat/find e hospedar).
export async function listContactsMissingAvatar(limit = 200, wsId?: string): Promise<string[]> {
  if (!dbEnabled) return [];
  const ws = wsId ?? getCurrentWorkspace();
  try {
    // Exclui contatos 'meta': a Cloud API NÃO expõe foto → ficariam NULL pra sempre, entupindo a
    // janela (ORDER BY last_seen) e sufocando os contatos LITE, que são os únicos enriquecíveis.
    const rows = await query<{ phone: string }>(
      "SELECT phone FROM contacts WHERE workspace_id=$1 AND avatar_url IS NULL AND platform IS DISTINCT FROM 'meta' ORDER BY last_seen DESC LIMIT $2",
      [ws, Math.min(Math.max(limit, 1), 1000)],
    );
    return rows.map((r) => r.phone);
  } catch {
    return [];
  }
}

// Leads que passaram por um NÓ de um fluxo (drill-down do chip de funil): telefone, nome, e-mail,
// último produto/valor e quando passou. Distintos por telefone (o mais recente).
export interface NodeLead {
  phone: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  platform: string | null;
  product: string | null;
  amount: number | null;
  ran_at: string;
  tags: string[];
  campos: Record<string, string>; // utm_source, afiliado_slug, lead_nome… o que foi capturado
}
export async function getNodeLeads(automationId: string, nodeId: string, since: string | null, until: string | null, wsId?: string): Promise<NodeLead[]> {
  if (!dbEnabled) return [];
  const ws = wsId ?? getCurrentWorkspace();
  const params: any[] = [automationId, nodeId, ws];
  let where = "automation_id=$1 AND node_id=$2 AND workspace_id=$3";
  if (since) { params.push(since); where += ` AND ran_at >= $${params.length}`; }
  if (until) { params.push(until); where += ` AND ran_at <= $${params.length}`; }
  try {
    // Além do básico, traz as ETIQUETAS e os CAMPOS capturados do contato — é onde ficam UTM,
    // afiliado e o que veio no evento. Sem isso a lista só respondia "quem", não "de onde veio".
    return await query(
      `SELECT sub.id, sub.phone, c.name, c.email, c.avatar_url, c.platform, ev.product, ev.amount, sub.ran_at,
              COALESCE((SELECT ARRAY_AGG(ct.tag ORDER BY ct.tag) FROM contact_tags ct
                         WHERE ct.workspace_id = $3 AND ct.phone = sub.phone), '{}') AS tags,
              COALESCE((SELECT jsonb_object_agg(cf.field, cf.value) FROM contact_fields cf
                         WHERE cf.workspace_id = $3 AND cf.phone = sub.phone), '{}'::jsonb) AS campos
         FROM (SELECT id, phone, ran_at FROM flow_node_hits WHERE ${where}) sub
         LEFT JOIN contacts c ON c.phone = sub.phone AND c.workspace_id = $3
         -- 🛒 O PRODUTO DAQUELA PASSAGEM, não o último que a pessoa comprou. Antes o LATERAL
         -- pegava sempre o evento MAIS RECENTE do telefone: quem comprou o produto principal e um
         -- order bump aparecia duas vezes na lista com o MESMO nome de produto nas duas linhas, e
         -- não dava pra saber qual era qual (caso de um lead, 07/09). Agora casa pelo TEMPO: o
         -- evento imediatamente anterior à passagem pelo nó. A folga de 1 minuto cobre a ordem de
         -- gravação (o evento entra e o fluxo roda logo em seguida, às vezes no mesmo segundo).
         LEFT JOIN LATERAL (
           SELECT product, amount FROM events e
            WHERE e.phone = sub.phone AND e.workspace_id = $3 AND e.product IS NOT NULL
              AND e.created_at <= sub.ran_at + interval '1 minute'
            ORDER BY e.created_at DESC, e.id DESC LIMIT 1
         ) ev ON TRUE
        ORDER BY sub.ran_at DESC
        LIMIT 500`,
      params,
    );
  } catch {
    return [];
  }
}

export async function recordEvent(
  phone: string | null,
  platform: string,
  event: string,
  product?: string,
  amount?: number,
  wsId?: string,
  productId?: string,
): Promise<void> {
  if (!dbEnabled) return;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    await query(
      "INSERT INTO events(workspace_id, phone, platform, event, product, amount, product_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [ws, phone, platform, event, product ?? null, amount ?? null, productId ?? null],
    );
  } catch {
    /* idem */
  }
}

// Quando o contato apareceu pela 1ª vez (contacts.first_seen) — vira {{data_entrada}} nos fluxos.
export async function getContactFirstSeen(phone: string, wsId?: string): Promise<Date | null> {
  if (!dbEnabled || !phone) return null;
  try {
    const r = await query<{ first_seen: string }>(
      "SELECT first_seen FROM contacts WHERE workspace_id=$1 AND phone = ANY($2) ORDER BY first_seen ASC LIMIT 1",
      [wsId ?? getCurrentWorkspace(), formas(phone)],
    );
    const d = r[0]?.first_seen ? new Date(r[0].first_seen) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch { return null; }
}

// Etiquetas de um contato (nó "Condição" → "tem a etiqueta X?"). Olha as duas formas do 9º dígito.
export async function getContactTags(phone: string, wsId?: string): Promise<string[]> {
  if (!dbEnabled || !phone) return [];
  try {
    const r = await query<{ tag: string }>(
      "SELECT DISTINCT tag FROM contact_tags WHERE workspace_id=$1 AND phone = ANY($2)",
      [wsId ?? getCurrentWorkspace(), formas(phone)],
    );
    return r.map((x) => x.tag);
  } catch {
    return [];
  }
}

// ── ÚLTIMA FALA DO LEAD (nó "Janela de conversa") ────────────────────────────
// A janela da Meta conta do último inbound DELE — então é a hora DELE, varia de pessoa pra pessoa
// (mesma lógica do OminiFlow, adaptada: lá a janela é do Instagram, aqui da Cloud API).
// Lê do arquivo do inbox, que é onde toda mensagem recebida cai (LITE e Oficial).
export async function ultimaFalaDoLead(phone: string, wsId?: string): Promise<number | null> {
  if (!dbEnabled || !phone) return null;
  try {
    const r = await query<{ ts: number | null }>(
      // ::bigint, não ::int — a coluna guarda segundos OU milissegundos (a UazAPI manda ms em
      // alguns eventos; o painel já trata as duas formas). Um valor em ms (1.7e12) estourava o
      // int4, o Postgres erguia erro, o catch devolvia null e a janela de 24h ficava "sem data" —
      // o painel dizia "Janela fechada" pra quem tinha acabado de escrever.
      `SELECT MAX(ts)::bigint AS ts FROM inbox_messages
        WHERE workspace_id=$1 AND from_me = false AND regexp_replace(chat_id, '\\D', '', 'g') = ANY($2)`,
      [wsId ?? getCurrentWorkspace(), formas(phone)],
    );
    // SEMPRE devolve SEGUNDOS: a coluna recebe as duas unidades conforme a origem, e quem consome
    // faz `(ultima + horas*3600) * 1000` — um valor em ms deixava a janela eternamente "aberta".
    const ts = r[0]?.ts;
    if (!ts) return null;
    const n = Number(ts);
    return n > 1e11 ? Math.floor(n / 1000) : n;
  } catch {
    return null;
  }
}

// ── "Esta pessoa PAGOU?" (nó Consulta de pagamento) ──────────────────────────
// Procura um evento de COMPRA APROVADA desta pessoa. O filtro de produto aceita o CÓDIGO (exato,
// como está na plataforma) ou o NOME (parcial, sem caixa) — o dono escolhe o que for mais fácil
// pra ele; vazio = qualquer produto. `horas` limita a janela (ex.: "pagou nas últimas 24h?").
export async function achaPagamento(
  phone: string,
  opts: { produto?: string; porCodigo?: boolean; horas?: number },
  wsId?: string,
): Promise<{ pago: boolean; produto?: string; valor?: number; quando?: string }> {
  if (!dbEnabled || !phone) return { pago: false };
  const ws = wsId ?? getCurrentWorkspace();
  const params: any[] = [ws, formas(phone)];
  // Compra aprovada e assinatura renovada contam como PAGO. Reembolso/chargeback NÃO entram aqui:
  // são eventos próprios e quem estornou não deve cair no caminho de "pagou".
  // phone = ANY: o pagamento chega da plataforma COM o 9º dígito e a consulta pode vir do wa_id
  // sem o 9 — sem as duas formas, cobrava de novo quem JÁ pagou.
  let sql = `SELECT product, amount, created_at FROM events
              WHERE workspace_id=$1 AND phone = ANY($2)
                AND event IN ('purchase_approved','subscription_renewed')`;
  const filtro = String(opts.produto ?? "").trim();
  if (filtro) {
    params.push(filtro);
    sql += opts.porCodigo
      ? ` AND product_id = $${params.length}`
      : ` AND product ILIKE '%' || $${params.length} || '%'`;
  }
  const horas = Number(opts.horas);
  if (Number.isFinite(horas) && horas > 0) {
    params.push(Math.min(horas, 24 * 365));
    sql += ` AND created_at > now() - ($${params.length} || ' hours')::interval`;
  }
  sql += " ORDER BY id DESC LIMIT 1";
  try {
    const r = await query<{ product: string | null; amount: string | null; created_at: string }>(sql, params);
    if (!r.length) return { pago: false };
    return {
      pago: true,
      produto: r[0].product ?? undefined,
      valor: r[0].amount != null ? Number(r[0].amount) : undefined,
      quando: r[0].created_at,
    };
  } catch {
    // Banco fora → NÃO inventa "pagou": o fluxo segue pelo caminho de não-pago (cobrar de novo
    // quem já pagou é o pior erro possível aqui... mas silenciar quem não pagou também. Ver o
    // tratamento no runner: erro de consulta usa a saída padrão, não o ramo "pagou").
    return { pago: false };
  }
}

// Apaga UMA passagem do funil (a linha que a pessoa escolheu na lista do nó). Escopado pelo
// workspace: um cliente nunca apaga passagem de outro, mesmo mandando um id chutado.
export async function deleteNodeHit(id: number, wsId?: string): Promise<boolean> {
  if (!dbEnabled) return false;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const r = await query<{ id: string }>("DELETE FROM flow_node_hits WHERE id = $1 AND workspace_id = $2 RETURNING id", [id, ws]);
    return r.length > 0;
  } catch {
    return false;
  }
}

// Registra que um contato passou por um nó de um fluxo (para o funil por nó).
export async function recordNodeHit(automationId: string, nodeId: string, phone: string, wsId?: string): Promise<void> {
  if (!dbEnabled) return;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    await query("INSERT INTO flow_node_hits(workspace_id, automation_id, node_id, phone) VALUES($1,$2,$3,$4)", [ws, automationId, nodeId, phone]);
  } catch {
    /* métrica não pode travar o envio */
  }
}

export interface FlowStatsResult {
  total: number; // PASSAGENS pelo fluxo no período
  byNode: Record<string, { count: number; pessoas?: number; pct: number }>; // passagens, gente distinta e % do total
}

// Agrega o funil de um fluxo: quantas PASSAGENS houve por cada nó no período (e quanta gente
// distinta, que é a leitura de funil).
// Quantas PESSOAS distintas entraram em CADA fluxo — numa consulta só, pra lista de fluxos.
// (Fazer uma chamada por fluxo deixaria a tela lenta com 10+ automações.)
export async function getFlowTotals(wsId?: string): Promise<Record<string, number>> {
  if (!dbEnabled) return {};
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const rows = await query<{ automation_id: string; total: string }>(
      `SELECT automation_id, COUNT(DISTINCT phone) AS total
         FROM flow_node_hits WHERE workspace_id = $1 GROUP BY automation_id`,
      [ws],
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.automation_id] = Number(r.total) || 0;
    return out;
  } catch {
    return {};
  }
}

export async function getFlowStats(automationId: string, since: string | null, until: string | null, wsId?: string): Promise<FlowStatsResult> {
  const empty: FlowStatsResult = { total: 0, byNode: {} };
  if (!dbEnabled) return empty;
  const ws = wsId ?? getCurrentWorkspace();
  const params: any[] = [automationId, ws];
  let where = "automation_id = $1 AND workspace_id = $2";
  if (since) { params.push(since); where += ` AND ran_at >= $${params.length}`; }
  if (until) { params.push(until); where += ` AND ran_at <= $${params.length}`; }
  try {
    // PASSAGENS, não pessoas: quem testa o mesmo fluxo 7× precisa ver 7 (pedido do dono, 25/08 —
    // com COUNT(DISTINCT phone) os 7 testes dele viravam "1" e parecia que não estava gravando).
    // `pessoas` vem junto porque o número de gente distinta continua sendo a leitura de funil.
    const rows = await query<{ node_id: string; cnt: string; pessoas: string }>(
      `SELECT node_id, COUNT(*) AS cnt, COUNT(DISTINCT phone) AS pessoas
         FROM flow_node_hits WHERE ${where} GROUP BY node_id`,
      params,
    );
    const totalRow = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM flow_node_hits WHERE ${where}`,
      params,
    );
    const total = Number(totalRow[0]?.total ?? 0);
    const byNode: FlowStatsResult["byNode"] = {};
    for (const r of rows) {
      const count = Number(r.cnt);
      byNode[r.node_id] = { count, pessoas: Number(r.pessoas ?? 0), pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
    }
    return { total, byNode };
  } catch {
    return empty;
  }
}

// ── Mídia hospedada (upload do builder → servida por URL) ────────────────────
export async function saveMedia(id: string, mime: string, data: Buffer, wsId?: string): Promise<void> {
  if (!dbEnabled) throw new Error("sem banco — não dá pra hospedar mídia");
  const ws = wsId ?? getCurrentWorkspace();
  await query("INSERT INTO media(workspace_id, id, mime, data) VALUES($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING", [ws, id, mime, data]);
}
export async function getMedia(id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!dbEnabled) return null;
  const rows = await query<{ mime: string; data: Buffer }>("SELECT mime, data FROM media WHERE id=$1", [id]);
  return rows[0] ?? null;
}

// ── Conversa pausada (nó "perguntar") ────────────────────────────────────────
export interface Pending { automation_id: string; next_index: number; variable: string; hint: string | null; node_id: string | null }

// Pendências/sessões viram lixo depois de 24h (lead sumiu no meio) — não engolir msgs pra sempre.
const STATE_TTL = "24 hours";

// Fallback em memória quando não há banco (dev local).
const memPending = new Map<string, Pending & { at: number }>();
const memFields = new Map<string, Record<string, string>>();
const fresh = (at: number) => Date.now() - at < 86_400_000;

export async function setPending(phone: string, automationId: string, nextIndex: number, variable: string, hint?: string, nodeId?: string, wsId?: string): Promise<void> {
  if (!dbEnabled) { memPending.set(phone, { automation_id: automationId, next_index: nextIndex, variable, hint: hint ?? null, node_id: nodeId ?? null, at: Date.now() }); return; }
  const ws = wsId ?? getCurrentWorkspace();
  await query(
    `INSERT INTO flow_pending(workspace_id, phone, automation_id, next_index, variable, hint, node_id, created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (workspace_id, phone) DO UPDATE SET automation_id=EXCLUDED.automation_id, next_index=EXCLUDED.next_index, variable=EXCLUDED.variable, hint=EXCLUDED.hint, node_id=EXCLUDED.node_id, created_at=now()`,
    [ws, phone, automationId, nextIndex, variable, hint ?? null, nodeId ?? null],
  );
}
export async function getPending(phone: string, wsId?: string): Promise<Pending | null> {
  if (!dbEnabled) { const m = memPending.get(phone) ?? memPending.get(variante9BR(phone) ?? ""); return m && fresh(m.at) ? m : null; }
  const ws = wsId ?? getCurrentWorkspace();
  try {
    // As DUAS formas do 9º dígito, a exata primeiro: o pending foi criado com o telefone da
    // plataforma (com 9) e o clique do botão volta pelo wa_id (sem 9) — era o Pix que não saía.
    const f = formas(phone);
    const rows = await query<Pending & { phone: string }>(`SELECT phone, automation_id, next_index, variable, hint, node_id FROM flow_pending WHERE workspace_id=$1 AND phone = ANY($2) AND created_at > now() - interval '${STATE_TTL}'`, [ws, f]);
    rows.sort((a, b) => (a.phone === phone ? -1 : 0) - (b.phone === phone ? -1 : 0));
    return rows[0] ?? null;
  } catch {
    return null; // erro de banco não pode derrubar o webhook
  }
}
export async function clearPending(phone: string, wsId?: string): Promise<void> {
  if (!dbEnabled) { for (const f of formas(phone)) memPending.delete(f); return; }
  // limpa as DUAS formas — senão o pending da forma irmã sobrava e retomava de novo
  await query("DELETE FROM flow_pending WHERE workspace_id=$1 AND phone = ANY($2)", [wsId ?? getCurrentWorkspace(), formas(phone)]);
}

// ── Sessão do Agente IA (conversa ativa) ─────────────────────────────────────
export interface AgentSession {
  automation_id: string;
  next_index: number; // índice do passo DEPOIS do agente (retoma o fluxo quando a conversa acaba)
  node_id?: string | null; // _id do nó do agente (retoma pelo id mesmo se o fluxo mudar)
  turns: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  delivered: string[]; // nomes dos caminhos já entregues (não repete)
}
const memAgent = new Map<string, AgentSession & { at: number }>();

export async function getAgentSession(phone: string, wsId?: string): Promise<AgentSession | null> {
  if (!dbEnabled) { const m = memAgent.get(phone) ?? memAgent.get(variante9BR(phone) ?? ""); return m && fresh(m.at) ? m : null; }
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const rows = await query<any>(`SELECT phone, automation_id, next_index, node_id, turns, history, delivered FROM agent_sessions WHERE workspace_id=$1 AND phone = ANY($2) AND updated_at > now() - interval '${STATE_TTL}'`, [ws, formas(phone)]);
    rows.sort((a: any, b: any) => (a.phone === phone ? -1 : 0) - (b.phone === phone ? -1 : 0));
    const r = rows[0];
    if (!r) return null;
    return {
      automation_id: r.automation_id,
      next_index: Number(r.next_index),
      node_id: r.node_id ?? null,
      turns: Number(r.turns),
      history: Array.isArray(r.history) ? r.history : [],
      delivered: Array.isArray(r.delivered) ? r.delivered : [],
    };
  } catch {
    return null; // erro de banco não pode derrubar o webhook
  }
}
export async function saveAgentSession(phone: string, s: AgentSession, wsId?: string): Promise<void> {
  if (!dbEnabled) { memAgent.set(phone, { ...s, at: Date.now() }); return; }
  const ws = wsId ?? getCurrentWorkspace();
  await query(
    `INSERT INTO agent_sessions(workspace_id, phone, automation_id, next_index, node_id, turns, history, delivered, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb, now())
     ON CONFLICT (workspace_id, phone) DO UPDATE SET automation_id=EXCLUDED.automation_id, next_index=EXCLUDED.next_index, node_id=EXCLUDED.node_id,
       turns=EXCLUDED.turns, history=EXCLUDED.history, delivered=EXCLUDED.delivered, updated_at=now()`,
    [ws, phone, s.automation_id, s.next_index, s.node_id ?? null, s.turns, JSON.stringify(s.history.slice(-40)), JSON.stringify(s.delivered)],
  );
}
export async function clearAgentSession(phone: string, wsId?: string): Promise<void> {
  if (!dbEnabled) { for (const f of formas(phone)) memAgent.delete(f); return; }
  await query("DELETE FROM agent_sessions WHERE workspace_id=$1 AND phone = ANY($2)", [wsId ?? getCurrentWorkspace(), formas(phone)]);
}

export async function setContactField(phone: string, field: string, value: string, wsId?: string): Promise<void> {
  if (!dbEnabled) { const f = memFields.get(phone) ?? {}; f[field] = value; memFields.set(phone, f); return; }
  const ws = wsId ?? getCurrentWorkspace();
  await query(
    `INSERT INTO contact_fields(workspace_id, phone, field, value, updated_at) VALUES($1,$2,$3,$4, now())
     ON CONFLICT (workspace_id, phone, field) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [ws, phone, field, value],
  );
}
export async function getContactFields(phone: string, wsId?: string): Promise<Record<string, string>> {
  if (!dbEnabled) return { ...(memFields.get(variante9BR(phone) ?? "") ?? {}), ...(memFields.get(phone) ?? {}) };
  // Mescla as DUAS formas do 9º dígito (a exata vence): o webhook grava com 9, o inbound lê sem —
  // era o {{pix}} e as UTMs que "sumiam" da ficha do mesmo lead.
  const rows = await query<{ phone: string; field: string; value: string }>("SELECT phone, field, value FROM contact_fields WHERE workspace_id=$1 AND phone = ANY($2)", [wsId ?? getCurrentWorkspace(), formas(phone)]);
  const out: Record<string, string> = {};
  for (const r of rows) if (r.phone !== phone) out[r.field] = r.value; // a variante primeiro…
  for (const r of rows) if (r.phone === phone) out[r.field] = r.value; // …a exata sobrescreve
  return out;
}

// Nome SALVO do contato (o pushName que veio no WhatsApp). Sem isto, quando o fluxo continua
// depois da conversa da agente (ramo do caminho, follow-up agendado, retomada de pergunta), o
// evento era montado só com os campos capturados e o {{primeiro_nome}} saía VAZIO — o lead recebia
// "Pronto, ! Já te coloquei no grupo".
export async function getContactName(phone: string, wsId?: string): Promise<string> {
  if (!dbEnabled) return "";
  try {
    const r = await query<{ phone: string; name: string | null }>(
      "SELECT phone, name FROM contacts WHERE workspace_id=$1 AND phone = ANY($2)", [wsId ?? getCurrentWorkspace(), formas(phone)],
    );
    r.sort((a, b) => (a.phone === phone ? -1 : 0) - (b.phone === phone ? -1 : 0));
    return String(r.find((x) => String(x.name ?? "").trim())?.name ?? "").trim();
  } catch {
    return "";
  }
}

export async function isOptedOut(phone: string, wsId?: string): Promise<boolean> {
  if (!dbEnabled) return formas(phone).some((f) => memOptOut.has(f));
  try {
    // As duas formas do 9º dígito: quem manda PARAR pelo WhatsApp (sem 9) TEM que calar também os
    // disparos do webhook (com 9) — senão seguia recebendo depois do opt-out (risco de ban/LGPD).
    const rows = await query<{ opted_out: boolean }>(
      "SELECT opted_out FROM contacts WHERE workspace_id=$1 AND phone = ANY($2)",
      [wsId ?? getCurrentWorkspace(), formas(phone)],
    );
    return rows.some((r) => r.opted_out === true);
  } catch {
    return false;
  }
}

export async function setOptedOut(phone: string, value: boolean, wsId?: string): Promise<void> {
  if (!dbEnabled) {
    if (value) memOptOut.add(phone);
    else memOptOut.delete(phone);
    return;
  }
  const ws = wsId ?? getCurrentWorkspace();
  try {
    await query(
      `INSERT INTO contacts(workspace_id, phone, opted_out) VALUES($1, $2, $3)
       ON CONFLICT (workspace_id, phone) DO UPDATE SET opted_out = $3, last_seen = now()`,
      [ws, phone, value],
    );
  } catch {
    /* idem */
  }
}

// ── EDITAR / EXCLUIR CONTATO (ficha do CRM) ───────────────────────────────────
// Editar salva só o que veio no corpo (undefined = não mexe), pra um campo em branco poder
// APAGAR o valor sem que os outros sejam zerados por tabela.
export async function updateContact(
  phone: string,
  campos: { name?: string | null; email?: string | null; notes?: string | null; address?: string | null; optedOut?: boolean },
  wsId?: string,
): Promise<boolean> {
  if (!dbEnabled || !phone) return false;
  const ws = wsId ?? getCurrentWorkspace();
  const sets: string[] = [];
  const vals: unknown[] = [ws, phone];
  const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (campos.name !== undefined) push("name", campos.name || null);
  if (campos.email !== undefined) push("email", campos.email || null);
  if (campos.notes !== undefined) push("notes", campos.notes || null);
  if (campos.address !== undefined) push("address", campos.address || null);
  if (campos.optedOut !== undefined) push("opted_out", !!campos.optedOut);
  if (!sets.length) return false;
  const rows = await query<{ phone: string }>(
    `UPDATE contacts SET ${sets.join(", ")} WHERE workspace_id = $1 AND phone = $2 RETURNING phone`,
    vals,
  );
  return rows.length > 0;
}

// Etiquetas pelo CHAT (botão "Etiquetas" do WPP ao Vivo / WPP Api). O telefone do chat pode vir
// sem o 9º dígito e o contato estar gravado com ele (ou o contrário): as duas formas valem, igual
// ao getContactTags. Etiqueta nova entra no telefone JÁ GRAVADO do contato (se houver) — senão
// ficaria uma tag "órfã" na outra forma do número, que a ficha do contato não mostra.
export async function editContactTagsByChat(
  phone: string, add: string[], remove: string[], wsId?: string,
): Promise<string[]> {
  if (!dbEnabled || !phone) return [];
  const ws = wsId ?? getCurrentWorkspace();
  const variantes = formas(phone);
  const limpa = (l: string[]) => [...new Set(l.map((t) => String(t ?? "").trim()).filter((t) => t && t.length <= 60))].slice(0, 30);
  const tira = limpa(remove);
  if (tira.length) {
    await query(`DELETE FROM contact_tags WHERE workspace_id=$1 AND phone = ANY($2) AND tag = ANY($3::text[])`, [ws, variantes, tira]);
  }
  const poe = limpa(add);
  if (poe.length) {
    const gravado = await query<{ phone: string }>(
      `SELECT phone FROM contacts WHERE workspace_id=$1 AND phone = ANY($2) ORDER BY last_seen DESC NULLS LAST LIMIT 1`, [ws, variantes]);
    await bulkAddContactTags([gravado[0]?.phone ?? phone], poe, "manual", ws);
  }
  return getContactTags(phone, ws);
}

// Troca as tags do contato pelas que vieram (some com as que saíram, cria as que entraram).
export async function setContactTags(phone: string, tags: string[], wsId?: string): Promise<void> {
  if (!dbEnabled || !phone) return;
  const ws = wsId ?? getCurrentWorkspace();
  const limpas = [...new Set(tags.map((t) => String(t ?? "").trim()).filter((t) => t && t.length <= 60))].slice(0, 30);
  await query(`DELETE FROM contact_tags WHERE workspace_id = $1 AND phone = $2${limpas.length ? " AND NOT (tag = ANY($3::text[]))" : ""}`,
    limpas.length ? [ws, phone, limpas] : [ws, phone]);
  if (limpas.length) await bulkAddContactTags([phone], limpas, "manual", ws);
}

// Exclui o contato e as tags dele. O HISTÓRICO (events) fica: é livro-razão de venda/evento e
// some junto seria perder registro financeiro — se o número voltar, o histórico volta com ele.
export async function deleteContact(phone: string, wsId?: string): Promise<boolean> {
  if (!dbEnabled || !phone) return false;
  const ws = wsId ?? getCurrentWorkspace();
  await query(`DELETE FROM contact_tags WHERE workspace_id = $1 AND phone = $2`, [ws, phone]);
  // Documento pessoal (RG/CPF) não fica órfão depois que o contato some.
  await query(`DELETE FROM contact_docs WHERE workspace_id = $1 AND phone = $2`, [ws, phone]).catch(() => {});
  const rows = await query<{ phone: string }>(
    `DELETE FROM contacts WHERE workspace_id = $1 AND phone = $2 RETURNING phone`, [ws, phone]);
  return rows.length > 0;
}

// ── Mensagens de grupo (para o resumo do dia) ─────────────────────────────────
interface GroupMsgRow {
  sender_name: string;
  text: string;
  created_at: number; // epoch ms (fallback em memória)
}
const memGroupMsgs = new Map<string, GroupMsgRow[]>();

export async function recordGroupMessage(
  groupJid: string,
  senderName: string,
  text: string,
  wsId?: string,
): Promise<void> {
  const clean = (text ?? "").trim();
  if (!groupJid || !clean) return;
  if (!dbEnabled) {
    const arr = memGroupMsgs.get(groupJid) ?? [];
    arr.push({ sender_name: senderName ?? "", text: clean, created_at: Date.now() });
    // limita memória a 2000 msgs por grupo (dev local)
    if (arr.length > 2000) arr.splice(0, arr.length - 2000);
    memGroupMsgs.set(groupJid, arr);
    return;
  }
  try {
    await query("INSERT INTO group_messages(workspace_id, group_jid, sender_name, text) VALUES($1,$2,$3,$4)", [
      wsId ?? getCurrentWorkspace(),
      groupJid,
      senderName ?? null,
      clean,
    ]);
  } catch {
    /* não trava o webhook */
  }
}

// Retorna as mensagens do grupo desde `sinceMs`, em ordem cronológica, no máximo `limit`
// (pega as mais recentes se passar do limite).
export async function getGroupMessagesSince(
  groupJid: string,
  sinceMs: number,
  limit: number,
  wsId?: string,
): Promise<Array<{ sender_name: string; text: string }>> {
  if (!dbEnabled) {
    const arr = (memGroupMsgs.get(groupJid) ?? []).filter((m) => m.created_at >= sinceMs);
    return arr.slice(-limit).map((m) => ({ sender_name: m.sender_name, text: m.text }));
  }
  try {
    return await query<{ sender_name: string; text: string }>(
      `SELECT sender_name, text FROM (
         SELECT sender_name, text, created_at FROM group_messages
         WHERE workspace_id = $4 AND group_jid = $1 AND created_at >= to_timestamp($2)
         ORDER BY created_at DESC LIMIT $3
       ) t ORDER BY created_at ASC`,
      [groupJid, sinceMs / 1000, limit, wsId ?? getCurrentWorkspace()],
    );
  } catch {
    return [];
  }
}

// Limpa mensagens antigas (chamado após cada resumo pra não deixar a tabela crescer sem fim).
export async function pruneGroupMessages(olderThanDays: number): Promise<void> {
  if (!dbEnabled) {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    for (const [jid, arr] of memGroupMsgs) {
      memGroupMsgs.set(
        jid,
        arr.filter((m) => m.created_at >= cutoff),
      );
    }
    return;
  }
  try {
    await query(
      `DELETE FROM group_messages WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(olderThanDays)],
    );
  } catch {
    /* idem */
  }
}

// ── Config da aplicação (editável pelo painel) — POR WORKSPACE (multi-tenant Fase 2) ──
// Cada linha é (workspace_id, key). O config-store passa o workspace (default = primário/Admin).
const memAppConfig = new Map<string, unknown>(); // chave "wsId|key" (fallback sem banco)

export async function getConfig(key: string, wsId: string): Promise<unknown | null> {
  if (!dbEnabled) { const k = wsId + "|" + key; return memAppConfig.has(k) ? memAppConfig.get(k) : null; }
  const rows = await query<{ value: unknown }>("SELECT value FROM app_config WHERE workspace_id=$1 AND key=$2", [wsId, key]);
  return rows.length ? rows[0].value : null;
}

// NÃO engole erro de propósito: o painel precisa saber se o salvar falhou.
export async function setConfig(key: string, value: unknown, wsId: string): Promise<void> {
  if (!dbEnabled) { memAppConfig.set(wsId + "|" + key, value); return; }
  await query(
    `INSERT INTO app_config(workspace_id, key, value, updated_at) VALUES($1, $2, $3::jsonb, now())
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = $3::jsonb, updated_at = now()`,
    [wsId, key, JSON.stringify(value)],
  );
}

// ── Roteamento instância → workspace (multi-tenant Fase 4) ───────────────────
export async function upsertInstance(token: string, wsId: string, opts?: { platform?: string; phoneNumberId?: string; name?: string }): Promise<void> {
  if (!dbEnabled || !token || !wsId) return;
  await query(
    `INSERT INTO instances(token, workspace_id, platform, phone_number_id, name) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (token) DO UPDATE SET workspace_id=EXCLUDED.workspace_id, platform=EXCLUDED.platform,
       phone_number_id=COALESCE(EXCLUDED.phone_number_id, instances.phone_number_id),
       name=COALESCE(EXCLUDED.name, instances.name)`,
    [token, wsId, opts?.platform ?? "lite", opts?.phoneNumberId ?? null, opts?.name ?? null],
  );
}
export async function lookupWorkspaceByToken(token: string): Promise<string | null> {
  if (!dbEnabled || !token) return null;
  try { const rows = await query<{ workspace_id: string }>("SELECT workspace_id FROM instances WHERE token=$1", [token]); return rows[0]?.workspace_id ?? null; } catch { return null; }
}
export async function lookupWorkspaceByPhoneNumberId(pni: string): Promise<string | null> {
  if (!dbEnabled || !pni) return null;
  try { const rows = await query<{ workspace_id: string }>("SELECT workspace_id FROM instances WHERE phone_number_id=$1", [pni]); return rows[0]?.workspace_id ?? null; } catch { return null; }
}
export async function removeInstance(token: string): Promise<void> {
  if (!dbEnabled || !token) return;
  await query("DELETE FROM instances WHERE token=$1", [token]).catch(() => {});
}

// Carrega TODAS as configs (todos os workspaces) — o config-store agrupa por workspace no cache.
export async function getAllConfig(): Promise<{ workspace_id: string | null; key: string; value: unknown }[]> {
  if (!dbEnabled) {
    return [...memAppConfig.entries()].map(([k, value]) => {
      const i = k.indexOf("|");
      return { workspace_id: k.slice(0, i), key: k.slice(i + 1), value };
    });
  }
  return query<{ workspace_id: string | null; key: string; value: unknown }>("SELECT workspace_id, key, value FROM app_config");
}

// ── Leitura pro painel (dashboard) ────────────────────────────────────────────
export interface EventRow {
  event: string;
  platform: string;
  product: string | null;
  amount: string | null; // NUMERIC volta como string no pg
  phone: string | null;
  name: string | null;
  created_at: string;
}

export async function getRecentEvents(limit = 20, wsId?: string): Promise<EventRow[]> {
  if (!dbEnabled) return [];
  const ws = wsId ?? getCurrentWorkspace();
  try {
    return await query<EventRow>(
      `SELECT e.event, e.platform, e.product, e.amount, e.phone,
              c.name, e.created_at
         FROM events e
         LEFT JOIN contacts c ON c.phone = e.phone AND c.workspace_id = e.workspace_id
        WHERE e.workspace_id = $2
        ORDER BY e.id DESC
        LIMIT $1`,
      [limit, ws],
    );
  } catch {
    return [];
  }
}

export interface Stats {
  today: { events: number; revenue: number; sales: number };
  last7d: { events: number; revenue: number };
  contacts: number;
  optedOut: number;
  byEventToday: Array<{ event: string; count: number }>;
}

export async function getStats(wsId?: string): Promise<Stats> {
  const zero: Stats = {
    today: { events: 0, revenue: 0, sales: 0 },
    last7d: { events: 0, revenue: 0 },
    contacts: 0,
    optedOut: 0,
    byEventToday: [],
  };
  if (!dbEnabled) return zero;
  const ws = wsId ?? getCurrentWorkspace();
  // "Hoje" = dia-calendário em São Paulo (o banco guarda em UTC).
  const spDay =
    "(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date";
  // Faturamento conta SÓ vendas aprovadas (senão pix_generated + purchase_approved dobrariam).
  const approvedRevenue = "COALESCE(SUM(e.amount) FILTER (WHERE e.event = 'purchase_approved'),0)";
  const approvedCount = "COUNT(*) FILTER (WHERE e.event = 'purchase_approved')::int";
  try {
    const [today] = await query<{ events: string; revenue: string | null; sales: string }>(
      `SELECT COUNT(*)::int AS events, ${approvedRevenue} AS revenue, ${approvedCount} AS sales
         FROM events e WHERE e.workspace_id = $1 AND ${spDay}`,
      [ws],
    );
    const [week] = await query<{ events: string; revenue: string | null }>(
      `SELECT COUNT(*)::int AS events, ${approvedRevenue} AS revenue
         FROM events e WHERE e.workspace_id = $1 AND e.created_at >= now() - interval '7 days'`,
      [ws],
    );
    const [contacts] = await query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1`, [ws]);
    const [opted] = await query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND opted_out = TRUE`,
      [ws],
    );
    const byEvent = await query<{ event: string; count: string }>(
      `SELECT e.event, COUNT(*)::int AS count FROM events e
        WHERE e.workspace_id = $1 AND ${spDay} GROUP BY e.event ORDER BY count DESC`,
      [ws],
    );
    return {
      today: {
        events: Number(today?.events ?? 0),
        revenue: Number(today?.revenue ?? 0),
        sales: Number(today?.sales ?? 0),
      },
      last7d: { events: Number(week?.events ?? 0), revenue: Number(week?.revenue ?? 0) },
      contacts: Number(contacts?.n ?? 0),
      optedOut: Number(opted?.n ?? 0),
      byEventToday: byEvent.map((r) => ({ event: r.event, count: Number(r.count) })),
    };
  } catch {
    return zero;
  }
}

// ── CRM: contatos ─────────────────────────────────────────────────────────────
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
  flow_ids: string[] | null; // ids dos fluxos por onde o contato passou (flow_node_hits); nome resolvido no endpoint
  tags: string[] | null; // etiquetas (ex.: importação de grupo)
}

// Segmentos do Disparador: origens (platform) e tags com contagem — só contatos SEM opt-out.
export async function segmentOptions(wsId?: string): Promise<{
  total: number;
  origens: Array<{ origem: string; total: number }>;
  tags: Array<{ tag: string; total: number }>;
}> {
  if (!dbEnabled) return { total: 0, origens: [], tags: [] };
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const [tot] = await query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id=$1 AND NOT opted_out", [ws]);
    const origens = await query<{ origem: string; total: number }>(
      `SELECT COALESCE(platform,'outros') AS origem, COUNT(*)::int AS total
         FROM contacts WHERE workspace_id=$1 AND NOT opted_out GROUP BY 1 ORDER BY 2 DESC`, [ws]);
    const tags = await query<{ tag: string; total: number }>(
      `SELECT t.tag, COUNT(*)::int AS total
         FROM contact_tags t JOIN contacts c ON c.workspace_id=t.workspace_id AND c.phone=t.phone AND NOT c.opted_out
        WHERE t.workspace_id=$1 GROUP BY t.tag ORDER BY 2 DESC LIMIT 60`, [ws]);
    return { total: tot?.n ?? 0, origens, tags };
  } catch {
    return { total: 0, origens: [], tags: [] };
  }
}

// 🚫 O IRMÃO DO 9º DÍGITO NO OPT-OUT. `isOptedOut` já olhava as duas formas do número, mas o
// DISPARO EM MASSA puxava do CRM só com `NOT opted_out` da própria linha — e o loop de envio não
// re-checa. Resultado: quem mandou PARAR pelo WhatsApp (chave sem o 9) continuava recebendo
// campanha na linha importada da plataforma (chave com o 9). É ban e é LGPD.
// Este pedaço exclui a linha quando a forma IRMÃ dela está com opt-out. A conta do irmão é a mesma
// de `variante9BR`, feita em SQL: 13 dígitos com "9" na 5ª posição ↔ 12 dígitos, só quando o
// dígito seguinte é 6-9 (número pré-migração) — número novo não vira "fixo de outra pessoa".
const SEM_IRMAO_OPTOUT = `NOT EXISTS (
  SELECT 1 FROM contacts o
   WHERE o.workspace_id = c.workspace_id AND o.opted_out
     AND o.phone = CASE
       WHEN length(c.phone) = 13 AND substr(c.phone,5,1) = '9' AND substr(c.phone,6,1) ~ '[6-9]'
         THEN substr(c.phone,1,4) || substr(c.phone,6)
       WHEN length(c.phone) = 12 AND substr(c.phone,5,1) ~ '[6-9]'
         THEN substr(c.phone,1,4) || '9' || substr(c.phone,5)
       ELSE NULL END)`;

// Contatos de um segmento (todos | origem | tag) — o Disparador puxa direto do CRM, sem CSV.
// Opt-out NUNCA entra; mais recentes primeiro; teto 5.000 (o mesmo do disparo).
export async function contactsForSegment(
  seg: { origem?: string; tag?: string },
  wsId?: string,
): Promise<Array<{ numero: string; nome?: string }>> {
  if (!dbEnabled) return [];
  const ws = wsId ?? getCurrentWorkspace();
  try {
    let rows: Array<{ phone: string; name: string | null }>;
    if (seg.tag) {
      rows = await query(
        `SELECT c.phone, c.name FROM contacts c
           JOIN contact_tags t ON t.workspace_id=c.workspace_id AND t.phone=c.phone
          WHERE c.workspace_id=$1 AND NOT c.opted_out AND t.tag=$2 AND ${SEM_IRMAO_OPTOUT}
          ORDER BY c.last_seen DESC LIMIT 5000`, [ws, seg.tag]);
    } else if (seg.origem) {
      rows = await query(
        `SELECT phone, name FROM contacts c
          WHERE c.workspace_id=$1 AND NOT c.opted_out AND COALESCE(c.platform,'outros')=$2 AND ${SEM_IRMAO_OPTOUT}
          ORDER BY c.last_seen DESC LIMIT 5000`, [ws, seg.origem]);
    } else {
      rows = await query(
        `SELECT c.phone, c.name FROM contacts c
          WHERE c.workspace_id=$1 AND NOT c.opted_out AND ${SEM_IRMAO_OPTOUT}
          ORDER BY c.last_seen DESC LIMIT 5000`, [ws]);
    }
    return rows
      .map((r) => ({ numero: String(r.phone).replace(/\D/g, ""), nome: r.name ?? undefined }))
      .filter((r) => r.numero.length >= 11); // precisa de DDI+DDD+número pra Cloud API
  } catch {
    return [];
  }
}

export async function listContacts(opts: {
  search?: string;
  filter?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}, wsId?: string): Promise<{ contacts: ContactRow[]; total: number }> {
  if (!dbEnabled) return { contacts: [], total: 0 };
  // Filtro de workspace SEMPRE presente ($1) — as subqueries de events correlacionam por c.workspace_id.
  const where: string[] = ["c.workspace_id = $1"];
  const params: any[] = [wsId ?? getCurrentWorkspace()];
  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }
  if (opts.filter === "comprador") {
    where.push(`EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved')`);
  } else if (opts.filter === "carrinho") {
    where.push(
      `EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='cart_abandoned')
       AND NOT EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved')`,
    );
  } else if (opts.filter === "optout") {
    where.push(`c.opted_out = TRUE`);
  }
  // Filtro por TAG: combina com a busca e com os outros filtros (ex.: tag "Lista Setembro"
  // + Opt-out). EXISTS em vez de JOIN pra não duplicar linha quando o contato tem várias tags.
  if (opts.tag && opts.tag.trim()) {
    params.push(opts.tag.trim());
    where.push(`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.workspace_id=c.workspace_id AND ct.phone=c.phone AND ct.tag=$${params.length})`);
  }
  const whereSql = "WHERE " + where.join(" AND ");
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 500);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  try {
    const [cnt] = await query<{ n: string }>(`SELECT COUNT(*)::int AS n FROM contacts c ${whereSql}`, params);
    const rows = await query<ContactRow>(
      `SELECT c.phone, c.name, c.email, c.avatar_url, c.platform, c.opted_out, c.first_seen, c.last_seen,
              le.event AS last_event, le.created_at AS last_event_at,
              COALESCE(pc.purchases,0)::int AS purchases,
              COALESCE(ec.total,0)::int AS total_events,
              fl.flow_ids AS flow_ids,
              tg.tags AS tags
         FROM contacts c
         LEFT JOIN LATERAL (
           SELECT event, created_at FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id ORDER BY e.id DESC LIMIT 1
         ) le ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS purchases FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved'
         ) pc ON TRUE
         LEFT JOIN LATERAL (SELECT COUNT(*) AS total FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id) ec ON TRUE
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT fnh.automation_id) AS flow_ids
             FROM flow_node_hits fnh WHERE fnh.phone=c.phone AND fnh.workspace_id=c.workspace_id
         ) fl ON TRUE
         LEFT JOIN LATERAL (
           SELECT array_agg(ct.tag ORDER BY ct.tag) AS tags
             FROM contact_tags ct WHERE ct.phone=c.phone AND ct.workspace_id=c.workspace_id
         ) tg ON TRUE
         ${whereSql}
         ORDER BY c.last_seen DESC, c.phone DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { contacts: rows, total: Number(cnt?.n ?? 0) };
  } catch {
    return { contacts: [], total: 0 };
  }
}

// ── EXPORTAR contatos COM detalhe (Contatos → Exportar) ──────────────────────────────────────
// O export antigo era feito no NAVEGADOR, a partir da página carregada: saía no máximo 50 linhas e
// só com o que a lista já mostrava. Não respondia a pergunta que o dono faz de verdade — "quem
// clicou em bloquear, QUANDO pegou essa etiqueta e QUAIS modelos essa pessoa recebeu" (30/09).
// Aqui a resposta sai do banco, com os mesmos filtros da tela (busca + filtro + etiqueta).
export interface ContactExportRow {
  phone: string; name: string | null; email: string | null; platform: string | null;
  opted_out: boolean | null; first_seen: string | null; last_seen: string | null;
  etiquetas: string | null;      // "tag (dd/mm/aaaa hh:mm) | tag (…)"
  tag_em: string | null;         // quando pegou A etiqueta filtrada (só quando há filtro de tag)
  templates: string | null;      // "modelo (dd/mm hh:mm) | …" — os 10 últimos
  templates_qtd: number;
  ultimo_template: string | null;
  flow_ids: string[] | null;
  purchases: number;
}
export async function exportContacts(
  opts: { search?: string; filter?: string; tag?: string },
  wsId?: string,
): Promise<ContactExportRow[]> {
  if (!dbEnabled) return [];
  const where: string[] = ["c.workspace_id = $1"];
  const params: any[] = [wsId ?? getCurrentWorkspace()];
  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }
  if (opts.filter === "comprador") {
    where.push(`EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved')`);
  } else if (opts.filter === "carrinho") {
    where.push(`EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='cart_abandoned')
       AND NOT EXISTS (SELECT 1 FROM events e WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved')`);
  } else if (opts.filter === "optout") {
    where.push(`c.opted_out = TRUE`);
  }
  // A etiqueta filtrada é SEMPRE um parâmetro (string vazia quando não há filtro), pra o SQL ficar
  // estático: com ela vazia o EXISTS é desligado e o `tag_em` sai nulo.
  params.push(String(opts.tag ?? "").trim());
  const pTag = params.length;
  if (String(opts.tag ?? "").trim()) {
    where.push(`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.workspace_id=c.workspace_id AND ct.phone=c.phone AND ct.tag=$${pTag})`);
  }
  try {
    return await query<ContactExportRow>(
      `SELECT c.phone, c.name, c.email, c.platform, c.opted_out, c.first_seen, c.last_seen,
              tg.etiquetas, tsel.tag_em,
              tpl.templates, COALESCE(tpl.qtd, 0)::int AS templates_qtd,
              ut.value AS ultimo_template,
              fl.flow_ids,
              COALESCE(pc.purchases, 0)::int AS purchases
         FROM contacts c
         LEFT JOIN LATERAL (
           SELECT string_agg(ct.tag || ' (' || to_char(ct.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')', ' | '
                             ORDER BY ct.created_at DESC) AS etiquetas
             FROM contact_tags ct WHERE ct.phone=c.phone AND ct.workspace_id=c.workspace_id
         ) tg ON TRUE
         LEFT JOIN LATERAL (
           SELECT to_char(ct.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS tag_em
             FROM contact_tags ct
            WHERE ct.phone=c.phone AND ct.workspace_id=c.workspace_id AND $${pTag} <> '' AND ct.tag=$${pTag}
            LIMIT 1
         ) tsel ON TRUE
         -- MODELOS que esta pessoa recebeu. Casa pelo telefone E pela forma SEM o 9º dígito: o
         -- wa_id da Meta derruba o 9 em número antigo, então o contato fica numa chave e a conversa
         -- na outra — sem isto a coluna sairia vazia justo pros leads mais velhos da base.
         LEFT JOIN LATERAL (
           SELECT string_agg(x.linha, ' | ' ORDER BY x.ts DESC) AS templates, COUNT(*) AS qtd
             FROM (
               SELECT (im.extra->'tpl'->>'nome') || ' (' ||
                      to_char(to_timestamp(im.ts) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')' AS linha,
                      im.ts
                 FROM inbox_messages im
                WHERE im.workspace_id = c.workspace_id
                  AND im.from_me = TRUE
                  AND im.extra->'tpl'->>'nome' IS NOT NULL
                  AND (im.chat_id = c.phone
                       OR (right(im.chat_id, 8) = right(c.phone, 8) AND left(im.chat_id, 4) = left(c.phone, 4)))
                ORDER BY im.ts DESC
                LIMIT 10
             ) x
         ) tpl ON TRUE
         LEFT JOIN LATERAL (
           SELECT cf.value FROM contact_fields cf
            WHERE cf.workspace_id=c.workspace_id AND cf.phone=c.phone AND cf.field='ultimo_template' LIMIT 1
         ) ut ON TRUE
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT fnh.automation_id) AS flow_ids
             FROM flow_node_hits fnh WHERE fnh.phone=c.phone AND fnh.workspace_id=c.workspace_id
         ) fl ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS purchases FROM events e
            WHERE e.phone=c.phone AND e.workspace_id=c.workspace_id AND e.event='purchase_approved'
         ) pc ON TRUE
        WHERE ${where.join(" AND ")}
        ORDER BY c.last_seen DESC, c.phone DESC
        LIMIT 20000`,
      params,
    );
  } catch (e: any) {
    throw new Error("não consegui montar a exportação: " + String(e?.message ?? e));
  }
}

export async function getContactDetail(
  phone: string,
  wsId?: string,
): Promise<{ contact: Record<string, unknown>; events: Array<Record<string, unknown>> } | null> {
  if (!dbEnabled) return null;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT phone, name, email, avatar_url, platform, opted_out, notes, address, first_seen, last_seen FROM contacts WHERE workspace_id=$1 AND phone=$2`,
      [ws, phone],
    );
    if (!rows.length) return null;
    const tagRows = await query<{ tag: string }>(
      `SELECT tag FROM contact_tags WHERE workspace_id=$1 AND phone=$2 ORDER BY tag`, [ws, phone],
    );
    rows[0].tags = tagRows.map((t) => t.tag);
    const events = await query<Record<string, unknown>>(
      `SELECT event, platform, product, amount, created_at FROM events WHERE workspace_id=$1 AND phone=$2 ORDER BY id DESC LIMIT 100`,
      [ws, phone],
    );
    return { contact: rows[0], events };
  } catch {
    return null;
  }
}

// ── ARQUIVO DAS CONVERSAS (histórico NOSSO) ───────────────────────────────────
// Por que existe: a UazAPI só guarda o que passou por ela desde a conexão da instância (medido
// 06/08: 92 mensagens / ~1 semana num grupo ativo, com hasMore=false) e ZERA se o número for
// reconectado. Aqui as mensagens ficam no nosso Postgres pra sempre — alimentado em dois pontos:
// (1) o webhook, em tempo real (pega tudo, mesmo com o painel fechado);
// (2) toda vez que uma conversa é aberta no painel (arquiva o que a UazAPI ainda tem).
export interface MsgArquivada {
  msg_id: string; mid?: string; from_me: boolean; sender_name?: string;
  body: string; msg_type?: string; ts?: number; extra?: Record<string, unknown>;
  // Desempate de quem tem o MESMO segundo (ts): ordem real de gravação, em ms. Só leitura.
  ord?: number;
}

export async function arquivarMensagens(
  chatId: string, msgs: MsgArquivada[], account = "lite", wsId?: string,
): Promise<void> {
  if (!dbEnabled || !chatId || !msgs.length) return;
  const ws = wsId ?? getCurrentWorkspace();
  // ON CONFLICT: reprocessar a mesma conversa não duplica; atualiza status/mídia que possam ter mudado.
  const valores: any[] = [];
  const linhas = msgs
    .filter((m) => m.msg_id)
    .map((m, i) => {
      const b = i * 11;
      valores.push(ws, account, chatId, m.msg_id, m.mid ?? null, !!m.from_me, m.sender_name ?? null,
        m.body ?? "", m.msg_type ?? null, m.ts ?? null,
        JSON.stringify(m.extra ?? {})); // coluna NOT NULL: sempre um objeto, nunca null
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11}::jsonb)`;
    });
  if (!linhas.length) return;
  try {
    await query(
      // `extra` existia no tipo (MsgArquivada) mas o INSERT não gravava — o retrato do template
      // (botões/rodapé) que o inbox oficial precisa mostrar viajava até aqui e morria na porta.
      // No conflito, MERGE (antigo || novo): o ack de entrega que o webhook grava via UPDATE não
      // pode ser apagado por um re-arquivamento da mesma mensagem.
      `INSERT INTO inbox_messages(workspace_id, account, chat_id, msg_id, mid, from_me, sender_name, body, msg_type, ts, extra)
       VALUES ${linhas.join(",")}
       ON CONFLICT (workspace_id, msg_id) DO UPDATE SET
         body = EXCLUDED.body, msg_type = EXCLUDED.msg_type, mid = COALESCE(EXCLUDED.mid, inbox_messages.mid),
         extra = inbox_messages.extra || EXCLUDED.extra`,
      valores,
    );
  } catch { /* arquivo é best-effort: NUNCA derruba o inbox */ }
}

// Conversas da API OFICIAL a partir do nosso arquivo. Diferente do LITE (onde a UazAPI guarda o
// histórico e a gente consulta), aqui o banco é a única fonte — a Meta não devolve conversa antiga.
// Uma linha por telefone, com a última mensagem e a contagem, do mais recente pro mais antigo.
export interface ChatOficial {
  chat_id: string; name: string | null; last_body: string; last_ts: number | null; from_me: boolean; total: number;
  // A Cloud API NÃO expõe foto de perfil do cliente (a Meta não tem esse endpoint). Mas se a MESMA
  // pessoa também fala pelo WhatsApp Lite (ou veio do import da agenda), o CRM já tem a foto dela —
  // então aproveitamos essa. Sem foto em lugar nenhum, o painel usa as iniciais.
  avatar_url: string | null;
}
// ── Mescla das DUAS formas do 9º dígito BR ───────────────────────────────────────────────────
// Antes da correção de 27/08, o envio arquivava pelo número DIGITADO e o webhook pelo wa_id da
// Meta — a mesma pessoa virava dois chats (caso Matheus: "Matheus" + "+55 41 99617-9777"). Os
// envios novos já gravam pelo wa_id; esta função conserta a LEITURA do que ficou dividido no
// banco, sem migração destrutiva. Exportada pra ser testável.
// Canônico = o lado que tem mensagem RECEBIDA (só o webhook grava recebida, e ele usa o wa_id);
// sem recebida em nenhum, fica o mais recente. Nome/foto/última mensagem: o melhor dos dois.
export function mesclaChatsOficial(rows: Array<ChatOficial & { recebidas?: number }>): ChatOficial[] {
  const porId = new Map(rows.map((r) => [r.chat_id, r]));
  const saem = new Set<string>();
  const prontos: ChatOficial[] = [];
  for (const r of rows) {
    if (saem.has(r.chat_id)) continue;
    const irmaId = variante9BR(r.chat_id);
    const irma = irmaId ? porId.get(irmaId) : undefined;
    if (!irma || saem.has(irma.chat_id)) { prontos.push(r); continue; }
    const canonico =
      (r.recebidas ?? 0) > 0 === (irma.recebidas ?? 0) > 0
        ? (Number(r.last_ts ?? 0) >= Number(irma.last_ts ?? 0) ? r : irma)
        : ((r.recebidas ?? 0) > 0 ? r : irma);
    const outro = canonico === r ? irma : r;
    const maisNova = Number(r.last_ts ?? 0) >= Number(irma.last_ts ?? 0) ? r : irma;
    prontos.push({
      chat_id: canonico.chat_id,
      name: canonico.name ?? outro.name,
      avatar_url: canonico.avatar_url ?? outro.avatar_url,
      last_body: maisNova.last_body,
      last_ts: maisNova.last_ts,
      from_me: maisNova.from_me,
      total: Number(r.total ?? 0) + Number(irma.total ?? 0),
    });
    saem.add(r.chat_id);
    saem.add(irma.chat_id);
  }
  return prontos;
}

// `limit` era 100 FIXO e o endpoint nem passava outro: depois de um disparo de 1.139 contatos, a
// tela do WPP Api mostrava 100 conversas e as outras mil simplesmente não existiam pra quem olhava
// (Admin, 30/09). Agora dá pra pedir mais e pra BUSCAR por nome/número — com mil conversas, rolar
// a lista não é caminho.
// `contas` = as contas oficiais QUE SÃO DESTE workspace. Sem esse filtro a lista pegava qualquer
// `meta-%`, então as linhas vazadas de outro cliente (ver MetaGatewayCreds.wsId) apareciam aqui
// como se fossem conversas do dono. É a trava de exibição do isolamento entre contas.
// Lista de conversas do WPP Api. SEM TETO por padrão (o dono pediu: "carregue ilimitada") —
// depois de um disparo de mil contatos, qualquer corte esconde gente de verdade.
//
// ⚡ A consulta antiga fazia DUAS subconsultas correlacionadas POR CONVERSA (total e recebidas):
// com 1.253 conversas eram ~2.500 varreduras. Agora as contagens saem de UMA agregação só, e a
// última mensagem de um DISTINCT ON que usa o índice (workspace_id, chat_id, ts DESC). É o que
// torna o "ilimitado" viável em vez de derrubar a tela.
//
// `contas` = as contas oficiais QUE SÃO DESTE workspace. Sem esse filtro a lista pegava qualquer
// `meta-%`, então linha vazada de outro cliente aparecia aqui como se fosse conversa do dono.
// É a trava de EXIBIÇÃO do isolamento entre contas (ver MetaGatewayCreds.wsId).
export interface PaginaChats { chats: ChatOficial[]; total: number; temMais: boolean }
export async function chatsDaApiOficial(
  wsId?: string,
  limit = 0, // 0 ou negativo = sem teto
  opts?: { busca?: string; contas?: string[]; offset?: number; fixados?: string[] },
): Promise<PaginaChats> {
  if (!dbEnabled) return { chats: [], total: 0, temMais: false };
  const ws = wsId ?? getCurrentWorkspace();
  const params: any[] = [ws];
  let filtroConta = "m.account LIKE 'meta-%'";
  const contas = (opts?.contas ?? []).filter(Boolean);
  if (contas.length) {
    params.push(contas);
    filtroConta = `m.account = ANY($${params.length})`;
  }
  let filtroBusca = "";
  const busca = String(opts?.busca ?? "").trim();
  if (busca) {
    params.push(`%${busca}%`);
    filtroBusca = ` WHERE (u.chat_id ILIKE $${params.length} OR c.name ILIKE $${params.length} OR u.sender_name ILIKE $${params.length})`;
  }
  try {
    const rows = await query<ChatOficial & { recebidas: number }>(
      `WITH base AS (
         SELECT m.chat_id, m.body, m.ts, m.from_me, m.sender_name
           FROM inbox_messages m
          WHERE m.workspace_id = $1 AND ${filtroConta}
       ),
       agg AS (
         SELECT chat_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE NOT from_me)::int AS recebidas
           FROM base GROUP BY chat_id
       ),
       ultima AS (
         SELECT DISTINCT ON (chat_id) chat_id, body, ts, from_me, sender_name
           FROM base ORDER BY chat_id, ts DESC NULLS LAST
       )
       SELECT u.chat_id,
              COALESCE(c.name, u.sender_name) AS name,
              COALESCE(c.avatar_url, av.url) AS avatar_url,
              u.body AS last_body, u.ts AS last_ts, u.from_me,
              a.total, a.recebidas
         FROM ultima u
         JOIN agg a ON a.chat_id = u.chat_id
         LEFT JOIN contacts c ON c.phone = u.chat_id AND c.workspace_id = $1
         LEFT JOIN chat_avatars av ON av.chat_id = u.chat_id AND av.workspace_id = $1
        ${filtroBusca}
        ORDER BY u.ts DESC NULLS LAST`,
      params,
    );
    // ⚠️ A FUSÃO VEM ANTES DE FATIAR, e é por isso que a paginação NÃO é feita no SQL: casar as
    // duas formas do 9º dígito exige a lista inteira em mãos. Paginando no banco, as duas metades
    // do mesmo lead podem cair em páginas diferentes e a pessoa apareceria DUAS vezes na tela.
    // FIXADAS no topo (pedido do dono, 13/10 — igual o WPP ao Vivo): a marca vem da config
    // "chats-fixados:api" e é aplicada ANTES de fatiar, senão uma fixada na página 3 nunca subiria.
    const fix = new Set((opts?.fixados ?? []).map(String));
    const prontos = mesclaChatsOficial(rows)
      .map((c) => (fix.size ? { ...c, pinned: fix.has(String(c.chat_id)) } : c))
      .sort((a: any, b: any) => Number(!!b.pinned) - Number(!!a.pinned) || Number(b.last_ts ?? 0) - Number(a.last_ts ?? 0));
    const desde = Math.max(0, Number(opts?.offset) || 0);
    const teto = Number(limit) || 0;
    const pagina = teto > 0 ? prontos.slice(desde, desde + teto) : prontos.slice(desde);
    return { chats: pagina, total: prontos.length, temMais: desde + pagina.length < prontos.length };
  } catch {
    return { chats: [], total: 0, temMais: false };
  }
}

export async function lerMensagensArquivadas(
  chatId: string, limit = 300, wsId?: string,
): Promise<MsgArquivada[]> {
  if (!dbEnabled || !chatId) return [];
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const rows = await query<any>(
      `SELECT msg_id, mid, from_me, sender_name, body, msg_type, ts, extra,
              (extract(epoch from created_at) * 1000)::bigint AS ord
         FROM inbox_messages WHERE workspace_id=$1 AND chat_id=$2
        ORDER BY ts DESC NULLS LAST, created_at DESC LIMIT $3`,
      [ws, chatId, Math.min(1000, Math.max(1, limit))],
    );
    return rows.map((r) => ({
      msg_id: r.msg_id, mid: r.mid ?? undefined, from_me: !!r.from_me,
      sender_name: r.sender_name ?? undefined, body: r.body ?? "",
      msg_type: r.msg_type ?? undefined, ts: r.ts ? Number(r.ts) : undefined,
      extra: r.extra && typeof r.extra === "object" ? r.extra : undefined,
      ord: r.ord != null ? Number(r.ord) : undefined,
    }));
  } catch {
    return [];
  }
}

// Diagnóstico do "não aparece chat ao vivo": tem mensagem arquivada pra ESTE número oficial?
// Separa recebidas de enviadas — só recebida prova que o webhook da Meta está entregando.
export async function pulsoDaContaOficial(wsId: string, phoneNumberId: string): Promise<{ recebidas: number; enviadas: number; ultimaRecebidaTs: number | null }> {
  const vazio = { recebidas: 0, enviadas: 0, ultimaRecebidaTs: null };
  if (!dbEnabled || !phoneNumberId) return vazio;
  try {
    const r = await query<any>(
      `SELECT COUNT(*) FILTER (WHERE NOT from_me)::int AS recebidas,
              COUNT(*) FILTER (WHERE from_me)::int     AS enviadas,
              MAX(ts) FILTER (WHERE NOT from_me)       AS ultima
         FROM inbox_messages WHERE workspace_id = $1 AND account = $2`,
      [wsId, "meta-" + phoneNumberId],
    );
    const x = r[0] ?? {};
    return { recebidas: Number(x.recebidas ?? 0), enviadas: Number(x.enviadas ?? 0), ultimaRecebidaTs: x.ultima ? Number(x.ultima) : null };
  } catch { return vazio; }
}

// Quantas mensagens já temos guardadas (aparece no painel: "N no arquivo").
export async function totalArquivado(chatId: string, wsId?: string): Promise<number> {
  if (!dbEnabled || !chatId) return 0;
  const ws = wsId ?? getCurrentWorkspace();
  try {
    const r = await query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM inbox_messages WHERE workspace_id=$1 AND chat_id=$2", [ws, chatId],
    );
    return Number(r[0]?.n ?? 0);
  } catch { return 0; }
}


// ── Pedidos da Kiwify (ingresso + bumps) → {{resumo_compra}} ──────────────────────────────────
export async function registraPedidoKiwify(p: {
  orderId: string; wsId: string; phone?: string | null; email?: string | null; produto?: string | null;
  bruto?: number | null; liquido?: number | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null } | null;
}): Promise<void> {
  if (!dbEnabled || !p.orderId) return;
  await query(
    `INSERT INTO kiwify_pedidos(order_id, workspace_id, phone, email, produto, bruto, liquido,
                                utm_source, utm_medium, utm_campaign, utm_content, utm_term)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (order_id) DO NOTHING`,
    [p.orderId, p.wsId, p.phone || null, (p.email || "").trim().toLowerCase() || null, p.produto || null,
     p.bruto ?? null, p.liquido ?? null, p.utm?.source || null, p.utm?.medium || null,
     p.utm?.campaign || null, p.utm?.content || null, p.utm?.term || null],
  ).catch(() => {});
}
const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Tudo que a MESMA pessoa (telefone ou e-mail) comprou nos últimos 30 min, com o líquido de cada
// produto, o total e a origem (UTM do pedido principal). Vazio se não achar nada.
export async function resumoCompraRecente(wsId: string, phone?: string | null, email?: string | null): Promise<string> {
  if (!dbEnabled) return "";
  const fone = String(phone ?? "").replace(/\D/g, "");
  const mail = String(email ?? "").trim().toLowerCase();
  if (!fone && !mail) return "";
  const rows = await query<any>(
    `SELECT produto, bruto, liquido, utm_source, utm_medium, utm_campaign, utm_content, utm_term
       FROM kiwify_pedidos
      WHERE workspace_id=$1 AND created_at > now() - interval '30 minutes'
        AND ((length($2) >= 10 AND right(regexp_replace(coalesce(phone,''),'\\D','','g'), 10) = right($2, 10))
             OR ($3 <> '' AND email = $3))
      ORDER BY created_at`,
    [wsId, fone, mail],
  ).catch(() => [] as any[]);
  if (!rows.length) return "";
  let totL = 0, totB = 0;
  const linhas = rows.map((r) => {
    const l = Number(r.liquido ?? 0), b = Number(r.bruto ?? 0);
    totL += l; totB += b;
    return `• ${r.produto || "Produto"} · ${brl(l)} líquido`;
  });
  const u = rows.find((r) => r.utm_source || r.utm_campaign) ?? {};
  const origem = [u.utm_source, u.utm_medium].filter(Boolean).join(" / ");
  const partes = [
    linhas.join("\n"),
    `*Total líquido: ${brl(totL)}* (bruto ${brl(totB)})`,
    origem || u.utm_campaign
      ? `Origem: ${origem || "—"}${u.utm_campaign ? `\nCampanha: ${u.utm_campaign}` : ""}${u.utm_content ? `\nAnúncio: ${u.utm_content}` : ""}${u.utm_term ? `\nPúblico: ${u.utm_term}` : ""}`
      : "Origem: sem UTM (link direto / X1)",
  ];
  return partes.join("\n\n");
}


// ── Disparos feitos por FLUXO (Loop) → tela "Em andamento" ────────────────────────────────────
export async function registraDisparoFluxo(p: { id?: string; wsId: string; automationId: string; nome?: string; total: number; intervaloMs: number; templates: string[] }): Promise<void> {
  if (!dbEnabled || p.total <= 0) return;
  await query(
    "INSERT INTO disparos_fluxo(id, workspace_id, automation_id, nome, total, intervalo_ms, templates) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [p.id ?? "df-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), p.wsId, p.automationId, p.nome ?? null, p.total, p.intervaloMs, p.templates],
  ).catch(() => {});
}
