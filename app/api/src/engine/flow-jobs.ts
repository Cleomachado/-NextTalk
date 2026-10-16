// FOLLOW-UP AGENDADO: retomada PERSISTENTE de fluxo depois de uma espera longa.
//
// Por que existe: o nó "Esperar" era um setTimeout em memória. Com 60min/24h isso dava dois problemas
// sérios — (1) travava a fila do telefone (o lead respondia "quero fechar!" e ficava sem resposta até
// a espera acabar) e (2) morria no redeploy (o follow-up simplesmente não acontecia).
//
// Agora: espera longa PAUSA o fluxo e grava onde retomar (flow_jobs). Um tick de 30s pega o que
// venceu e continua de onde parou — sem segurar a conversa e sobrevivendo a restart.
//
// CANCELAMENTO: é o comportamento certo de um follow-up de vácuo — se o lead responder antes da hora,
// o follow-up não deve disparar ("vi que você sumiu" pra quem acabou de falar é péssimo).
import { randomUUID } from "node:crypto";
import { dbEnabled, query } from "../db.js";

// Abaixo disto a espera continua sendo sleep em memória (é a pausa curta que faz o bot parecer
// humano — 2s, 30s). Acima, vira agendamento persistente.
export const SLEEP_MAX_MS = 120_000; // 2 minutos

export interface FlowJob {
  id: string; workspace_id: string; phone: string; automation_id: string; node_id: string;
  instance_token: string | null; run_at: string;
}

// Agenda a retomada do fluxo. Um job PENDENTE por (workspace, telefone, automação) — se o fluxo
// reentrar, o novo agendamento substitui o antigo (não empilha follow-up duplicado).
export async function scheduleResume(opts: {
  wsId: string; phone: string; automationId: string; nodeId: string;
  instanceToken: string | null; delayMs: number; cancelOnReply: boolean;
  // 📣 id da EXECUÇÃO do disparo (linha de disparos_fluxo): é o que deixa a tela "Em andamento"
  // pausar/contar SÓ os jobs daquele lote — antes tudo era por automation_id e 3 lotes do mesmo
  // fluxo se misturavam (bug 13/10).
  disparoId?: string;
}): Promise<void> {
  if (!dbEnabled) return;
  await query(
    "UPDATE flow_jobs SET status='canceled' WHERE workspace_id=$1 AND phone=$2 AND automation_id=$3 AND status='pending'",
    [opts.wsId, opts.phone, opts.automationId],
  ).catch(() => {});
  await query(
    `INSERT INTO flow_jobs(id, workspace_id, phone, automation_id, node_id, instance_token, run_at, cancel_on_reply, disparo_id)
     VALUES($1,$2,$3,$4,$5,$6, now() + ($7 || ' milliseconds')::interval, $8, $9)`,
    ["fj_" + randomUUID(), opts.wsId, opts.phone, opts.automationId, opts.nodeId, opts.instanceToken, String(Math.round(opts.delayMs)), opts.cancelOnReply, opts.disparoId ?? null],
  );
}

// O lead respondeu → mata os follow-ups de vácuo dele. Cobre 'pending' E 'claimed': um job já
// pego pelo tick mas ainda na fila do telefone TAMBÉM é cancelado — o consumeJob dele falha e o
// follow-up não sai logo depois de o lead ter acabado de falar.
export async function cancelOnReply(wsId: string, phone: string): Promise<number> {
  if (!dbEnabled) return 0;
  const r = await query<{ id: string }>(
    "UPDATE flow_jobs SET status='canceled' WHERE workspace_id=$1 AND phone=$2 AND status IN ('pending','claimed') AND cancel_on_reply=TRUE RETURNING id",
    [wsId, phone],
  ).catch(() => []);
  return r.length;
}

// Pega os jobs vencidos marcando como 'claimed' na mesma query (atômico): mesmo com dois ticks
// sobrepostos, cada job é pego UMA vez só. O 'done' de verdade só acontece no consumeJob, na hora
// de executar — assim a resposta do lead entre o claim e a execução ainda cancela o follow-up.
export async function claimDueJobs(limit = 25): Promise<FlowJob[]> {
  if (!dbEnabled) return [];
  // Resgate: job 'claimed' há 10min+ sem consumir = o motor caiu entre pegar e executar.
  // Volta pra 'pending' e o tick pega de novo (o consumeJob atômico garante execução única).
  await query(
    "UPDATE flow_jobs SET status='pending' WHERE status='claimed' AND run_at <= now() - interval '10 minutes'",
  ).catch(() => {});
  return await query<FlowJob>(
    `UPDATE flow_jobs SET status='claimed'
      WHERE id IN (
        SELECT id FROM flow_jobs WHERE status='pending' AND run_at <= now()
        ORDER BY run_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, workspace_id, phone, automation_id, node_id, instance_token, run_at`,
    [limit],
  ).catch(() => []);
}

// Consumo final (na hora de executar, já DENTRO da fila do telefone): só roda se ninguém cancelou
// no meio do caminho. false = o lead respondeu entre o claim e a vez do job → não dispara.
export async function consumeJob(id: string): Promise<boolean> {
  if (!dbEnabled) return true;
  const r = await query<{ id: string }>(
    "UPDATE flow_jobs SET status='done' WHERE id=$1 AND status='claimed' RETURNING id",
    [id],
  ).catch(() => []);
  return r.length > 0;
}

// Faxina: jobs concluídos/cancelados com mais de 7 dias não servem pra nada.
export async function purgeOldJobs(): Promise<void> {
  if (!dbEnabled) return;
  await query("DELETE FROM flow_jobs WHERE status<>'pending' AND created_at < now() - interval '7 days'").catch(() => {});
}
