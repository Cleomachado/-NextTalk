// ══ MÉTRICAS DO DIA — números internos pro relatório diário (nó "Métricas do dia") ═══════════
// O irmão do nó Meta Ads: enquanto aquele pergunta à Meta o que ela GASTOU e atribui, este conta o
// que de fato aconteceu AQUI — conversas novas na API Oficial (separando quem veio de anúncio
// Click-to-WhatsApp de quem chegou orgânico) e os pedidos aprovados da Kiwify (fonte da verdade de
// venda — regra da casa: a UTM real da Kiwify vence a atribuição da Meta).
import { query } from "../db.js";
import { getCurrentWorkspace } from "../workspace-context.js";

const TZ = "America/Araguaina"; // UTC-3 o ano todo — o mesmo fuso do resto do produto

// Início/fim do período em EPOCH (segundos), calculados no fuso do produto.
export function limitesDoPeriodo(periodo: "hoje" | "ontem", agora = new Date()): { ini: number; fim: number; rotulo: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(agora);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  // meia-noite de HOJE no fuso: como o fuso é fixo em -03:00, dá pra montar o instante direto.
  const meiaNoiteHoje = Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`) / 1000;
  const DIA = 86_400;
  if (periodo === "ontem") {
    const d = new Date((meiaNoiteHoje - DIA) * 1000);
    const rot = d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
    return { ini: meiaNoiteHoje - DIA, fim: meiaNoiteHoje, rotulo: rot };
  }
  return { ini: meiaNoiteHoje, fim: meiaNoiteHoje + DIA, rotulo: `${get("day")}/${get("month")}` };
}

export interface MetricasDia {
  conversasNovas: number;
  conversasAnuncio: number;   // conversa nova com marcador de clique (ctwa) no período
  conversasOrganico: number;
  pedidos: number;            // 1 linha por pedido da Kiwify (order bump conta separado)
  faturamento: number;        // soma do bruto
  liquido: number;
  ticketMedio: number;
}

export async function metricasDoDia(periodo: "hoje" | "ontem"): Promise<MetricasDia> {
  const ws = getCurrentWorkspace();
  const { ini, fim } = limitesDoPeriodo(periodo);
  // Conversa NOVA = a PRIMEIRA mensagem recebida daquele chat (na história toda) cai no período.
  // O agregado é global de propósito: filtrar o período antes do GROUP BY faria chat antigo que
  // respondeu hoje contar como novo. O marcador "ctwa" (gravado com ts-1s) diz quem veio de anúncio.
  const conversas = await query<{ total: string; anuncio: string }>(
    `WITH novas AS (
       SELECT chat_id, MIN(ts) AS primeira
         FROM inbox_messages
        WHERE workspace_id = $1 AND account LIKE 'meta-%' AND NOT from_me
        GROUP BY chat_id
       HAVING MIN(ts) >= $2 AND MIN(ts) < $3
     )
     SELECT count(*) AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM inbox_messages m
               WHERE m.workspace_id = $1 AND m.chat_id = novas.chat_id
                 AND m.msg_type = 'ctwa' AND m.ts >= $2 AND m.ts < $3
            )) AS anuncio
       FROM novas`,
    [ws, ini, fim],
  ).catch(() => [{ total: "0", anuncio: "0" }]);
  const vendas = await query<{ pedidos: string; bruto: string; liq: string }>(
    `SELECT count(*) AS pedidos, COALESCE(SUM(bruto), 0) AS bruto, COALESCE(SUM(liquido), 0) AS liq
       FROM kiwify_pedidos
      WHERE workspace_id = $1 AND created_at >= to_timestamp($2) AND created_at < to_timestamp($3)`,
    [ws, ini, fim],
  ).catch(() => [{ pedidos: "0", bruto: "0", liq: "0" }]);
  const total = Number(conversas[0]?.total) || 0;
  const anuncio = Number(conversas[0]?.anuncio) || 0;
  const pedidos = Number(vendas[0]?.pedidos) || 0;
  const faturamento = Number(vendas[0]?.bruto) || 0;
  const liquido = Number(vendas[0]?.liq) || 0;
  return {
    conversasNovas: total,
    conversasAnuncio: anuncio,
    conversasOrganico: Math.max(0, total - anuncio),
    pedidos, faturamento, liquido,
    ticketMedio: pedidos ? faturamento / pedidos : 0,
  };
}
