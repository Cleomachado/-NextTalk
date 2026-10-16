// ACÚMULO de mensagens antes de o Agente IA responder — a parte PURA (sem banco, sem rede), pra
// poder ser testada sozinha. Pedido do dono (02/10): o lead MARCA uma mensagem e responde, marca
// outra e responde — e a agente respondia linha por linha, sem saber a que pergunta cada "Sim"/"Não"
// se referia. Duas peças resolvem: (1) o nó do agente pode pedir uma espera maior que os 6 s
// padrão da rajada; (2) cada fala chega ao agente com a mensagem marcada na frente.

export const ESPERA_RAJADA_MS = 6_000;   // silêncio que indica "acabou de falar" (padrão)
export const TETO_RAJADA_MS = 25_000;    // teto total padrão: quem escreve sem parar não espera pra sempre
export const ACUMULO_MAX_SEG = 600;      // o nó aceita até 10 min de espera

/** Normaliza o `acumularSeg` do nó: ausente, zero ou lixo = 0 (não muda nada). */
export function acumuloSeg(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, ACUMULO_MAX_SEG) : 0;
}

/** Silêncio a esperar e teto total da rajada. Sem pedido do nó, o padrão de sempre (6 s / 25 s).
 *  Com pedido: espera = o que o nó pediu (nunca menos que o padrão) e teto = 4 silêncios, pra quem
 *  não para de escrever não ficar sem resposta — limitado a 15 min. */
export function janelaRajada(acumular: unknown): { esperaMs: number; tetoMs: number } {
  const seg = acumuloSeg(acumular);
  if (!seg) return { esperaMs: ESPERA_RAJADA_MS, tetoMs: TETO_RAJADA_MS };
  const esperaMs = Math.max(ESPERA_RAJADA_MS, seg * 1000);
  return { esperaMs, tetoMs: Math.min(Math.max(TETO_RAJADA_MS, esperaMs * 4), 15 * 60_000) };
}

/** A fala do lead como o AGENTE deve ler: com a mensagem que ele marcou (citou) na frente.
 *  Sem citação devolve o texto intacto — keyword e captura continuam comparando o texto cru. */
export function falaComCitacao(texto: string, cit?: { texto?: string; tipo?: string } | null): string {
  const t = String(texto ?? "");
  if (!cit) return t;
  const alvo = String(cit.texto ?? "").replace(/\s+/g, " ").trim();
  const rotulo = alvo ? `"${alvo.length > 160 ? alvo.slice(0, 157) + "…" : alvo}"` : cit.tipo ? `um(a) ${cit.tipo}` : "";
  return rotulo ? `[marcou a mensagem: ${rotulo}] ${t}` : t;
}
