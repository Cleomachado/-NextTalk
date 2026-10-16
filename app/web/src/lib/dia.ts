// Separação por DIA nas conversas — compartilhado pelos dois inboxes (LITE e API Oficial).
// Vivia dentro do Inbox.tsx; o oficial não tinha separador nem a pílula flutuante de dia
// (pedido do dono, 08/09). Uma fonte só: os dois mostram o mesmo rótulo pro mesmo dia.

// Rótulo como o WhatsApp: "Hoje", "Ontem", o dia da semana quando é recente, e a data seca
// quando já passou uma semana (com o ano se for de outro ano). Aceita segundos OU milissegundos.
export function rotuloDoDia(ts?: number): string {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const zero = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((zero(new Date()) - zero(d)) / 86400000);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias > 1 && dias < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" });
  const mesmoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("pt-BR", mesmoAno ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Chave do dia (pra saber QUANDO trocar de separador) — não dá pra comparar o rótulo, porque
// dois sábados diferentes teriam o mesmo texto.
export function chaveDoDia(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
