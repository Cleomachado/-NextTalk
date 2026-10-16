// CRM KANBAN (board estilo Trello): colunas (crm_stages) + cards (os próprios contatos).
// Tudo escopado pelo workspace corrente (getCurrentWorkspace) — cliente vê só o board dele.
//
// POSIÇÃO: `position`/`crm_pos` são DOUBLE. Ao soltar entre dois vizinhos, a nova posição é a MÉDIA
// dos dois (padrão do Trello) — 1 UPDATE por arraste, sem renumerar a coluna toda. Quando a média
// não tem mais espaço (gap < 1e-6, ~50 inserções no mesmo ponto), a coluna é renumerada (0,1,2…).
import { randomUUID } from "node:crypto";
import { dbEnabled, query } from "./db.js";
import { getCurrentWorkspace } from "./workspace-context.js";

export interface CrmStage { id: string; name: string; color: string | null; position: number; }
export interface CrmCard {
  phone: string; name: string | null; email: string | null; address: string | null; notes: string | null;
  value: number | null; avatar_url: string | null; stage_id: string | null; pos: number | null;
  platform: string | null; last_seen: string; opted_out: boolean; tags: string[];
}

const COLORS = ["#25D366", "#2AA9E0", "#7C6CF0", "#E8A33D", "#E5544B", "#12C46E"];
// Funil inicial (o cliente renomeia/apaga à vontade) — semeado na 1ª abertura do board.
const SEED = ["Novo lead", "Em conversa", "Proposta enviada", "Fechado ✅", "Perdido"];

// Semeia as 5 colunas padrão na PRIMEIRA abertura do funil. O `WHERE NOT EXISTS` na própria query
// evita o funil DUPLICADO (10 colunas) quando o painel abre em duas abas ao mesmo tempo — antes
// os dois liam "nenhuma coluna" e os dois semeavam.
async function seedStages(ws: string): Promise<void> {
  const nomes = SEED;
  const ids = nomes.map(() => "st_" + randomUUID());
  const cores = nomes.map((_, i) => COLORS[i % COLORS.length]);
  await query(
    `INSERT INTO crm_stages(id, workspace_id, name, color, position)
     SELECT v.id, $1, v.nome, v.cor, v.pos
       FROM (SELECT unnest($2::text[]) AS id, unnest($3::text[]) AS nome, unnest($4::text[]) AS cor,
                    generate_subscripts($2::text[], 1) - 1 AS pos) v
      WHERE NOT EXISTS (SELECT 1 FROM crm_stages WHERE workspace_id = $1)`,
    [ws, ids, nomes, cores],
  );
}

// Board completo: colunas + todos os cards. Contatos SEM coluna caem na primeira (o board não
// esconde ninguém) — assim os contatos que já existiam aparecem no funil sem migração manual.
export async function getBoard(): Promise<{ stages: CrmStage[]; cards: CrmCard[] }> {
  if (!dbEnabled) return { stages: [], cards: [] };
  const ws = getCurrentWorkspace();
  let stages = await query<CrmStage>("SELECT id, name, color, position FROM crm_stages WHERE workspace_id=$1 ORDER BY position ASC, created_at ASC", [ws]);
  if (!stages.length) {
    await seedStages(ws);
    stages = await query<CrmStage>("SELECT id, name, color, position FROM crm_stages WHERE workspace_id=$1 ORDER BY position ASC, created_at ASC", [ws]);
  }
  const first = stages[0]?.id ?? null;
  const cards = await query<any>(
    `SELECT c.phone, c.name, c.email, c.address, c.notes, c.crm_value AS value, c.avatar_url,
            c.crm_stage_id AS stage_id, c.crm_pos AS pos, c.platform, c.last_seen, c.opted_out,
            COALESCE((SELECT ARRAY_AGG(ct.tag ORDER BY ct.tag) FROM contact_tags ct
                       WHERE ct.workspace_id=c.workspace_id AND ct.phone=c.phone), '{}') AS tags
       FROM contacts c
      WHERE c.workspace_id=$1
      ORDER BY c.crm_pos ASC NULLS LAST, c.last_seen DESC
      LIMIT 2000`,
    [ws],
  );
  return {
    stages,
    // Card órfão (coluna apagada por fora / nunca posicionado) → vai pra primeira coluna na LEITURA.
    cards: cards.map((c) => ({
      ...c,
      value: c.value == null ? null : Number(c.value),
      stage_id: c.stage_id && stages.some((s) => s.id === c.stage_id) ? c.stage_id : first,
      tags: Array.isArray(c.tags) ? c.tags : [],
    })),
  };
}

export async function createStage(name: string): Promise<CrmStage | { error: string }> {
  const ws = getCurrentWorkspace();
  const nm = String(name ?? "").trim().slice(0, 40);
  if (!nm) return { error: "dê um nome pra coluna" };
  const { count } = (await query<{ count: string }>("SELECT COUNT(*)::int AS count FROM crm_stages WHERE workspace_id=$1", [ws]))[0] ?? { count: "0" };
  if (Number(count) >= 20) return { error: "limite de 20 colunas — junte ou apague alguma antes" };
  const max = (await query<{ m: number | null }>("SELECT MAX(position) AS m FROM crm_stages WHERE workspace_id=$1", [ws]))[0]?.m ?? -1;
  const id = "st_" + randomUUID();
  const color = COLORS[Number(count) % COLORS.length];
  await query("INSERT INTO crm_stages(id, workspace_id, name, color, position) VALUES($1,$2,$3,$4,$5)", [id, ws, nm, color, Number(max) + 1]);
  return { id, name: nm, color, position: Number(max) + 1 };
}

export async function updateStage(id: string, patch: { name?: string; color?: string }): Promise<{ ok: true } | { error: string }> {
  const ws = getCurrentWorkspace();
  const nm = patch.name != null ? String(patch.name).trim().slice(0, 40) : undefined;
  if (nm !== undefined && !nm) return { error: "o nome não pode ficar vazio" };
  const color = patch.color != null ? String(patch.color).slice(0, 16) : undefined;
  const r = await query<{ id: string }>(
    "UPDATE crm_stages SET name=COALESCE($3,name), color=COALESCE($4,color) WHERE workspace_id=$1 AND id=$2 RETURNING id",
    [ws, id, nm ?? null, color ?? null],
  );
  return r.length ? { ok: true } : { error: "coluna não encontrada" };
}

// Apaga a coluna e MOVE os cards dela pra outra (nunca perde contato).
// ⚠️ Os cards são movidos ANTES do DELETE: se o DELETE falhasse depois, ninguém ficaria órfão.
// E o DELETE só acontece se ainda sobrar outra coluna NAQUELE INSTANTE (subconsulta na própria
// query) — sem isso, dois usuários apagando ao mesmo tempo zeravam o board e o funil era
// recriado do zero, empilhando todos os contatos na primeira coluna.
export async function deleteStage(id: string): Promise<{ ok: true; movedTo: string | null } | { error: string }> {
  const ws = getCurrentWorkspace();
  const alvo = String(id ?? "");
  const all = await query<{ id: string }>("SELECT id FROM crm_stages WHERE workspace_id=$1 ORDER BY position ASC", [ws]);
  if (!all.some((s) => s.id === alvo)) return { error: "coluna não encontrada" };
  if (all.length <= 1) return { error: "o board precisa de pelo menos uma coluna" };
  const destino = all.find((s) => s.id !== alvo)?.id ?? null;

  // 1) muda os cards de coluna JÁ renumerando: sem isso, duas colunas com posições 0,10,20 se
  //    fundiam com posições repetidas e a ordem virava empate resolvido por acaso.
  const base = (await query<{ m: number | null }>(
    "SELECT MAX(crm_pos) AS m FROM contacts WHERE workspace_id=$1 AND crm_stage_id=$2", [ws, destino],
  ))[0]?.m;
  await query(
    `UPDATE contacts AS c SET crm_stage_id=$3, crm_pos = $4 + (v.ordem * 10)
       FROM (SELECT phone, (ROW_NUMBER() OVER (ORDER BY crm_pos ASC NULLS LAST, last_seen DESC)) AS ordem
               FROM contacts WHERE workspace_id=$1 AND crm_stage_id=$2) v
      WHERE c.workspace_id=$1 AND c.phone=v.phone`,
    [ws, alvo, destino, Number(base ?? 0)],
  );
  // 2) só então apaga — e apenas se ainda houver outra coluna neste exato momento.
  const r = await query<{ id: string }>(
    `DELETE FROM crm_stages WHERE workspace_id=$1 AND id=$2
       AND (SELECT COUNT(*) FROM crm_stages WHERE workspace_id=$1) > 1 RETURNING id`,
    [ws, alvo],
  );
  if (!r.length) return { error: "o board precisa de pelo menos uma coluna" };
  return { ok: true, movedTo: destino };
}

// Reordena as colunas: recebe a ordem final dos ids e grava 0,1,2… (barato: são poucas colunas).
export async function reorderStages(ids: string[]): Promise<{ ok: true } | { error: string }> {
  const ws = getCurrentWorkspace();
  if (!Array.isArray(ids) || !ids.length) return { error: "ordem inválida" };
  const mine = await query<{ id: string }>("SELECT id FROM crm_stages WHERE workspace_id=$1", [ws]);
  const set = new Set(mine.map((m) => m.id));
  // Anti-IDOR (id de outro workspace) + DEDUP e teto: sem o dedup, mandar o mesmo id 500 mil vezes
  // rodava 500 mil UPDATEs no pool compartilhado e travava a API dos outros clientes.
  const clean = [...new Set(ids.map((i) => String(i)).filter((i) => set.has(i)))].slice(0, 50);
  if (!clean.length) return { error: "ordem inválida" };
  // Uma query só. As colunas não listadas vão pro fim (position alta), preservando a ordem antiga.
  await query(
    `UPDATE crm_stages AS s SET position = v.pos
       FROM (SELECT unnest($2::text[]) AS id, generate_subscripts($2::text[], 1) - 1 AS pos) v
      WHERE s.workspace_id = $1 AND s.id = v.id`,
    [ws, clean],
  );
  await query(
    "UPDATE crm_stages SET position = position + 1000 WHERE workspace_id=$1 AND NOT (id = ANY($2::text[])) AND position < 1000",
    [ws, clean],
  );
  return { ok: true };
}

// Move um card pra uma coluna, no ÍNDICE de destino (0 = topo). O front manda o índice porque é o
// que ele sabe de verdade ao soltar; o backend resolve a posição lendo a coluna REAL naquele momento
// (imune a posição desatualizada / dois atendentes arrastando ao mesmo tempo).
export async function moveCard(phone: string, stageId: string, index: number): Promise<{ ok: true; pos: number } | { error: string }> {
  const ws = getCurrentWorkspace();
  const ph = String(phone ?? "").trim();
  if (!ph) return { error: "card inválido" };
  const st = await query<{ id: string }>("SELECT id FROM crm_stages WHERE workspace_id=$1 AND id=$2", [ws, String(stageId ?? "")]);
  if (!st.length) return { error: "coluna não encontrada" };
  // O contato existe MESMO? Sem isto, o ramo de renumeração dava "ok" pra um telefone inexistente
  // (o RETURNING só cobre o caminho normal) e a tela marcava sucesso num card que não existe.
  const alvo = await query<{ phone: string }>("SELECT phone FROM contacts WHERE workspace_id=$1 AND phone=$2", [ws, ph]);
  if (!alvo.length) return { error: "contato não encontrado" };

  // ⚠️ A PRIMEIRA coluna também contém os contatos SEM coluna: o getBoard mostra todo contato
  // órfão (crm_stage_id NULL, que é como TODO lead de inbound nasce) na primeira coluna. Se os
  // vizinhos fossem só os que têm crm_stage_id=$2, a lista do backend viria quase vazia enquanto
  // a da tela está cheia — e o índice pedido pelo arraste cairia no lugar errado (o card ia
  // sempre pro topo). Aqui a lista é montada EXATAMENTE como a tela mostra.
  const primeira = await query<{ id: string }>(
    "SELECT id FROM crm_stages WHERE workspace_id=$1 ORDER BY position ASC, created_at ASC LIMIT 1",
    [ws],
  );
  const ehPrimeira = primeira[0]?.id === stageId;
  const rows = await query<{ phone: string; crm_pos: number | null }>(
    ehPrimeira
      ? `SELECT phone, crm_pos FROM contacts
          WHERE workspace_id=$1 AND phone<>$3
            AND (crm_stage_id=$2 OR crm_stage_id IS NULL
                 OR crm_stage_id NOT IN (SELECT id FROM crm_stages WHERE workspace_id=$1))
          ORDER BY crm_pos ASC NULLS LAST, last_seen DESC`
      : `SELECT phone, crm_pos FROM contacts
          WHERE workspace_id=$1 AND crm_stage_id=$2 AND phone<>$3
          ORDER BY crm_pos ASC NULLS LAST, last_seen DESC`,
    [ws, stageId, ph],
  );
  const i = Math.max(0, Math.min(Number(index) || 0, rows.length));
  const posOf = (n: number): number | null => (rows[n]?.crm_pos == null ? null : Number(rows[n].crm_pos));
  const antes = i > 0 ? posOf(i - 1) : null;   // vizinho de cima
  const depois = posOf(i);                      // vizinho de baixo

  let pos: number;
  if (antes == null && depois == null) pos = 0;              // coluna vazia
  else if (antes == null) pos = depois! - 10;                 // no topo
  else if (depois == null) pos = antes + 10;                  // no fim
  else if (depois - antes > 1e-6) pos = (antes + depois) / 2;  // entre os dois (caso normal)
  else {
    // Espaço esgotado entre os vizinhos → renumera a coluna com o card JÁ no índice certo (0,10,20…).
    // UMA query só (unnest): eram N UPDATEs sequenciais — com uma coluna grande isso demorava e,
    // pior, um outro atendente arrastando no meio da renumeração calculava média sobre posições
    // que estavam sendo reescritas (o card dele sumia de lugar). Agora é tudo de uma vez.
    const ordem = [...rows.slice(0, i).map((r) => r.phone), ph, ...rows.slice(i).map((r) => r.phone)];
    const posicoes = ordem.map((_, k) => k * 10);
    await query(
      `UPDATE contacts AS c SET crm_pos = v.pos, crm_stage_id = $2
         FROM (SELECT unnest($3::text[]) AS phone, unnest($4::float8[]) AS pos) v
        WHERE c.workspace_id = $1 AND c.phone = v.phone`,
      [ws, stageId, ordem, posicoes],
    );
    return { ok: true, pos: i * 10 };
  }
  const r = await query<{ phone: string }>(
    "UPDATE contacts SET crm_stage_id=$3, crm_pos=$4 WHERE workspace_id=$1 AND phone=$2 RETURNING phone",
    [ws, ph, stageId, pos],
  );
  if (!r.length) return { error: "contato não encontrado" };
  return { ok: true, pos };
}

// Salva a ficha do card (o que o dono pediu: nome, e-mail, telefone-de-contato, endereço,
// descrição/bullets e valor). O `phone` é a CHAVE (id do WhatsApp) e não muda por aqui.
export async function updateCard(phone: string, patch: { name?: string; email?: string; address?: string; notes?: string; value?: number | null }): Promise<{ ok: true } | { error: string }> {
  const ws = getCurrentWorkspace();
  const ph = String(phone ?? "").trim();
  if (!ph) return { error: "card inválido" };
  // A coluna é NUMERIC(12,2): valor absurdo estourava no Postgres e o painel recebia um 500 seco.
  // Faixa: 0 a 9.999.999.999,99 (negativo não existe em "valor do negócio" e bagunçava a soma).
  const bruto = patch.value === null || patch.value === undefined ? null : Number(patch.value);
  const val = bruto === null || !Number.isFinite(bruto) ? null : Math.min(Math.max(bruto, 0), 9_999_999_999.99);
  const r = await query<{ phone: string }>(
    `UPDATE contacts SET
        name    = COALESCE($3, name),
        email   = COALESCE($4, email),
        address = COALESCE($5, address),
        notes   = COALESCE($6, notes),
        crm_value = CASE WHEN $7::boolean THEN $8::numeric ELSE crm_value END
      WHERE workspace_id=$1 AND phone=$2 RETURNING phone`,
    [
      ws, ph,
      patch.name != null ? String(patch.name).trim().slice(0, 120) : null,
      patch.email != null ? String(patch.email).trim().slice(0, 160) : null,
      patch.address != null ? String(patch.address).trim().slice(0, 300) : null,
      patch.notes != null ? String(patch.notes).slice(0, 4000) : null,
      patch.value !== undefined, val,
    ],
  );
  return r.length ? { ok: true } : { error: "contato não encontrado" };
}

// Cria um card novo à mão (lead que chegou por fora do WhatsApp). O telefone é a chave.
export async function createCard(input: { phone: string; name?: string; stageId?: string }): Promise<{ ok: true; phone: string } | { error: string }> {
  const ws = getCurrentWorkspace();
  const ph = String(input.phone ?? "").replace(/\D/g, "");
  if (ph.length < 10) return { error: "informe o telefone com DDD" };
  const exists = await query("SELECT 1 FROM contacts WHERE workspace_id=$1 AND phone=$2", [ws, ph]);
  if (exists.length) return { error: "já existe um contato com esse telefone" };
  const stage = input.stageId
    ? (await query<{ id: string }>("SELECT id FROM crm_stages WHERE workspace_id=$1 AND id=$2", [ws, input.stageId]))[0]?.id
    : (await query<{ id: string }>("SELECT id FROM crm_stages WHERE workspace_id=$1 ORDER BY position ASC LIMIT 1", [ws]))[0]?.id;
  const m = (await query<{ m: number | null }>("SELECT MAX(crm_pos) AS m FROM contacts WHERE workspace_id=$1 AND crm_stage_id=$2", [ws, stage ?? null]))[0]?.m;
  await query(
    "INSERT INTO contacts(workspace_id, phone, name, platform, crm_stage_id, crm_pos) VALUES($1,$2,$3,'manual',$4,$5)",
    [ws, ph, String(input.name ?? "").trim().slice(0, 120) || null, stage ?? null, (Number(m ?? 0) || 0) + 1],
  );
  return { ok: true, phone: ph };
}
