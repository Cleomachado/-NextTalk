// RECUPERAÇÃO POR E-MAIL do Pix e do carrinho — só do produto ZapConverte (vendas do dono).
// Pedido de 03/10/2026: o Pix gerado chegava no webhook da Kiwify e nenhum e-mail saía (nem o
// código, nem lembrete). O WhatsApp da recuperação é um FLUXO na conta do dono (editável no
// builder); o e-mail mora aqui porque fluxo não manda e-mail.
//
// Régua (cada etapa é uma linha em `recuperacao_email`, sobrevive a restart):
//   Pix gerado → na hora (QR + copia e cola) · +2h lembrete · 3h antes de vencer, último aviso
//   Carrinho   → na hora (a Kiwify já manda o abandono atrasado) · +24h
// Travas:
//   · na hora de enviar, consulta `sales`: pagou (venda que libera acesso, depois do evento) → cancela;
//   · evento novo do mesmo e-mail (gerou outro Pix, voltou ao carrinho) cancela a régua anterior;
//   · compra aprovada cancela tudo do e-mail na hora.
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { query, dbEnabled } from "./db.js";
import { sendEmail } from "./lib/mail.js";
import { tplPixGerado, tplPixLembrete, tplPixVence, tplCarrinho, tplCarrinho24h, type DadosPix } from "./emails.js";

export type TipoRecuperacao = "pix" | "carrinho";
const HORA = 3_600_000;
const MOTOR_URL = (process.env.MOTOR_PUBLIC_URL || "https://app.seudominio.com.br").replace(/\/+$/, "");

// "05/10/2026 16:30" (hora de Brasília, como a Kiwify manda) → Date. Inválido → null.
export function lePrazoKiwify(s: unknown): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Quando cada etapa sai. Pura (testável): agora + prazo do Pix → lista de {etapa, runAt}.
// O último aviso só entra se couber depois do lembrete com folga de 1h e ainda antes do prazo.
export function planoRecuperacao(tipo: TipoRecuperacao, agora: Date, expira: Date | null): Array<{ etapa: number; runAt: Date }> {
  const t = agora.getTime();
  if (tipo === "carrinho") return [{ etapa: 1, runAt: new Date(t) }, { etapa: 2, runAt: new Date(t + 24 * HORA) }];
  const out = [{ etapa: 1, runAt: new Date(t) }, { etapa: 2, runAt: new Date(t + 2 * HORA) }];
  const fim = expira?.getTime() ?? t + 48 * HORA;
  const ultimo = fim - 3 * HORA;
  if (ultimo > t + 3 * HORA && ultimo < fim) out.push({ etapa: 3, runAt: new Date(ultimo) });
  return out;
}

export async function initRecuperacao(): Promise<void> {
  if (!dbEnabled) return;
  await query(`
    CREATE TABLE IF NOT EXISTS recuperacao_email (
      id         TEXT PRIMARY KEY,
      order_id   TEXT,
      email      TEXT NOT NULL,
      tipo       TEXT NOT NULL,              -- 'pix' | 'carrinho'
      etapa      INT  NOT NULL,
      dados      JSONB NOT NULL DEFAULT '{}'::jsonb,
      run_at     TIMESTAMPTZ NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviando | enviado | falhou | cancelado | pago
      sent_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS recuperacao_email_fila ON recuperacao_email (status, run_at);
    CREATE INDEX IF NOT EXISTS recuperacao_email_email ON recuperacao_email (lower(email));
  `);
}

export interface EventoRecuperacao {
  tipo: TipoRecuperacao;
  email: string;
  orderId: string | null;
  nome: string;
  valor: number | null;
  pix: string | null;
  expira: string | null; // texto da Kiwify, "DD/MM/AAAA HH:MM"
  checkout: string | null;
}

export async function agendaRecuperacao(ev: EventoRecuperacao): Promise<number> {
  if (!dbEnabled) return 0;
  const email = ev.email.trim().toLowerCase();
  if (!email.includes("@")) return 0;
  if (ev.tipo === "pix" && !ev.pix) return 0;          // Pix sem código: não há o que mandar
  if (ev.tipo === "carrinho" && !ev.checkout) return 0; // carrinho sem link: idem
  // Reenvio do MESMO evento pela Kiwify: não duplica a régua.
  if (ev.orderId) {
    const ja = await query("SELECT 1 FROM recuperacao_email WHERE order_id=$1 AND tipo=$2 LIMIT 1", [ev.orderId, ev.tipo]);
    if (ja.length) return 0;
  }
  // Evento novo do mesmo e-mail substitui a régua anterior (gerou outro Pix, voltou ao carrinho).
  await query("UPDATE recuperacao_email SET status='cancelado' WHERE lower(email)=$1 AND status='pendente'", [email]);
  const expira = lePrazoKiwify(ev.expira);
  const dados = { nome: ev.nome, valor: ev.valor, pix: ev.pix, expira: ev.expira, checkout: ev.checkout };
  const plano = planoRecuperacao(ev.tipo, new Date(), expira);
  for (const p of plano) {
    await query(
      "INSERT INTO recuperacao_email(id, order_id, email, tipo, etapa, dados, run_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      ["rec_" + randomUUID().replace(/-/g, ""), ev.orderId, email, ev.tipo, p.etapa, JSON.stringify(dados), p.runAt],
    );
  }
  console.log(`📧 recuperação (${ev.tipo}) agendada · ${email} · ${plano.length} e-mail(s)`);
  void processaRecuperacao();
  return plano.length;
}

// Pagou → encerra a régua do e-mail.
export async function encerraRecuperacao(email: string): Promise<void> {
  if (!dbEnabled || !email) return;
  const r = await query("UPDATE recuperacao_email SET status='pago' WHERE lower(email)=$1 AND status='pendente' RETURNING id", [email.trim().toLowerCase()]);
  if (r.length) console.log(`📧 recuperação encerrada (pagou) · ${email} · ${r.length} e-mail(s) cancelado(s)`);
}

const brl = (v: number | null | undefined) => (v == null ? null : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

let rodando = false;
export async function processaRecuperacao(): Promise<void> {
  if (!dbEnabled || rodando) return;
  rodando = true;
  try {
    // Claim atômico: dois ticks sobrepostos nunca pegam a mesma linha.
    const lote = await query<{ id: string; email: string; tipo: TipoRecuperacao; etapa: number; dados: any; created_at: string }>(
      `UPDATE recuperacao_email SET status='enviando'
        WHERE id IN (SELECT id FROM recuperacao_email WHERE status='pendente' AND run_at <= now()
                      ORDER BY run_at LIMIT 20 FOR UPDATE SKIP LOCKED)
        RETURNING id, email, tipo, etapa, dados, created_at`,
    );
    for (const l of lote) {
      // Pagou depois do evento? (5 min de folga: a aprovação pode ser gravada um tiquinho antes.)
      const pago = await query(
        "SELECT 1 FROM sales WHERE lower(buyer_email)=$1 AND status='paga' AND grants_access AND created_at >= $2::timestamptz - interval '5 minutes' LIMIT 1",
        [l.email, l.created_at],
      ).catch(() => []);
      if (pago.length) {
        await query("UPDATE recuperacao_email SET status='pago' WHERE id=$1", [l.id]);
        continue;
      }
      const d = l.dados ?? {};
      const nome = String(d.nome ?? "").split(" ")[0] || "";
      let tpl;
      if (l.tipo === "pix") {
        const dp: DadosPix = { nome, valor: brl(d.valor), pix: String(d.pix ?? ""), qrUrl: `${MOTOR_URL}/pix/qr/${l.id}.png`, expira: d.expira ?? null, checkout: d.checkout ?? null };
        tpl = l.etapa === 1 ? tplPixGerado(dp) : l.etapa === 2 ? tplPixLembrete(dp) : tplPixVence(dp);
      } else {
        const dc = { nome, checkout: String(d.checkout ?? "") };
        tpl = l.etapa === 1 ? tplCarrinho(dc) : tplCarrinho24h(dc);
      }
      const ok = await sendEmail(l.email, tpl.subject, tpl.html).catch(() => false);
      await query("UPDATE recuperacao_email SET status=$2, sent_at=now() WHERE id=$1", [l.id, ok ? "enviado" : "falhou"]);
      console.log(`📧 recuperação ${l.tipo} etapa ${l.etapa} → ${l.email} · ${ok ? "enviado" : "FALHOU"}`);
    }
  } catch (e: any) {
    console.error("recuperação por e-mail:", e?.message ?? e);
  } finally {
    rodando = false;
  }
}

// PNG do QR Code de uma linha da régua de Pix. O id é aleatório (não dá pra adivinhar) e o
// código Pix é uma cobrança A FAVOR do dono — expor a imagem pra quem tem o link não é risco.
export async function qrDoPix(id: string): Promise<Buffer | null> {
  if (!dbEnabled || !/^rec_[0-9a-f]{32}$/.test(id)) return null;
  const r = await query<{ dados: any }>("SELECT dados FROM recuperacao_email WHERE id=$1 AND tipo='pix' LIMIT 1", [id]);
  const pix = String(r[0]?.dados?.pix ?? "");
  if (!pix) return null;
  return QRCode.toBuffer(pix, { type: "png", width: 440, margin: 1, errorCorrectionLevel: "M" });
}
