// 🎟️ ESTEIRA DO WORKSHOP WHATSAPP API + CLAUDE IA (fonte única do Dashboard de Lançamento).
// Ingresso (front) → order bumps no checkout (Gravação, Acesso vitalício) → pitch AO VIVO no sábado
// (White Label do ZapConverte). A Kiwify manda cada bump como um pedido separado; o produto chega
// pelo NOME, então a classificação é por nome — o "Gravação Workshop…" contém "Workshop", por isso
// a ordem dos testes importa (vitalício e gravação antes do ingresso).
// Ver docs/metricas-lancamentos.md (valores líquidos reais) e a memória funil-workshop-white-label.

export type EtapaEsteira = "ingresso" | "gravacao" | "vitalicio" | "whitelabel" | "outro";

export interface ProdutoEsteira {
  etapa: EtapaEsteira;
  nome: string;           // como aparece no painel
  papel: string;          // onde entra no funil
  preco: string;          // preço de tabela
  checkout?: string;      // código do checkout na Kiwify (pay.kiwify.com.br/<código>)
  produtoId?: string;     // Product.product_id da Kiwify (só o do ingresso é conhecido até 18/10)
}

export const ESTEIRA: ProdutoEsteira[] = [
  { etapa: "ingresso", nome: "Produto principal", papel: "Produto principal (front)", preco: "R$ 0,00",
    checkout: "CODIGO", produtoId: "ID-DO-PRODUTO" },
  { etapa: "gravacao", nome: "Order bump 1", papel: "Order bump no checkout", preco: "R$ 0,00", checkout: "CODIGO" },
  { etapa: "vitalicio", nome: "Order bump 2", papel: "Order bump no checkout", preco: "R$ 0,00" },
  { etapa: "whitelabel", nome: "Oferta do Pitch", papel: "Pitch ao vivo no sábado", preco: "R$ 0,00", checkout: "CODIGO" },
];

export function etapaDoProduto(produto: string | null | undefined): EtapaEsteira {
  const p = String(produto ?? "");
  if (/white\s*label/i.test(p)) return "whitelabel";
  if (/vital[ií]cio/i.test(p)) return "vitalicio";
  if (/grava[cç][aã]o/i.test(p)) return "gravacao";
  if (/workshop/i.test(p)) return "ingresso";
  return "outro";
}

export const NOME_ETAPA: Record<EtapaEsteira, string> = {
  ingresso: "Ingresso", gravacao: "Gravação", vitalicio: "Vitalício", whitelabel: "White Label", outro: "Outros",
};

// Campanha da Meta que é do workshop (o resto da conta de anúncio fica fora do ROAS do lançamento).
export const ehCampanhaWorkshop = (nome: string) => /workshop|\bws\b/i.test(nome);

// ── Calendário das turmas ─────────────────────────────────────────────────────────────────────
// Aula todo SÁBADO 9h–14h (horário na config do Workshop). Regra fechada com o dono em 18/10/2026:
//  · INGRESSO: próximo sábado; comprado no sábado ANTES do fim da aula é daquele sábado (quem compra
//    às 9h39 entra na live); depois do fim, já é da turma seguinte.
//  · GRAVAÇÃO: comprada no sábado, a qualquer hora, é a gravação DAQUELA aula (quem compra às 21h quer
//    rever o que viu de manhã); nos outros dias vai junto com o ingresso, pra próxima aula.
//  · WHITE LABEL: vendido no pitch — conta pra turma cujo sábado (a partir das 9h) veio por último:
//    "ao vivo" = no próprio sábado; "na semana" = do domingo à sexta seguintes.
//  · INDICAÇÃO: venda sem UTM que o dono atribui a uma turma à mão fica com utm_campaign
//    "workshop-DD-MM" no banco (ex.: a Mariane → 10/10) e vence qualquer regra de data.
const somaDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// `inicio`/`fim` = hora da aula (config do Workshop no motor; padrão 9h–14h).
export function turmaDaVenda(etapa: EtapaEsteira, data: string, dow: number, hora: number, inicio = 9, fim = 14, utmCampaign?: string | null): string {
  const forcada = /^workshop-(\d{2})-(\d{2})$/.exec(String(utmCampaign ?? ""));
  if (forcada) return `${data.slice(0, 4)}-${forcada[2]}-${forcada[1]}`;
  if (etapa === "gravacao") return dow === 6 ? data : somaDias(data, 6 - dow);
  if (etapa === "whitelabel") {
    const volta = dow === 6 ? (hora >= inicio ? 0 : 7) : dow + 1;
    return somaDias(data, -volta);
  }
  if (dow === 6) return hora >= fim ? somaDias(data, 7) : data;
  return somaDias(data, 6 - dow);
}

// Venda que veio de tráfego PAGO (anúncio) × orgânico/disparo/X1 — pela UTM real da Kiwify.
export function ehTrafegoPago(source?: string | null, medium?: string | null): boolean {
  const s = String(source ?? ""), m = String(medium ?? "");
  if (/organ|x1|whats|ex-alunos|live/i.test(m)) return false;
  return /paid|cpc|cpm|ads/i.test(m) || /^(meta|facebook|fb|ig|instagram|google|tiktok)$/i.test(s);
}

// Faixas de referência (mentoria de lançamento pago, enviadas pelo dono em 18/10/2026 — ver memória
// metricas-referencia-lancamento-pago). `min` em %; `txt` é o que a tela mostra.
// tom → cor do card: otimo/bom = verde, ok = amarelo, ruim/pessimo = vermelho.
export type Faixa = { min: number; rot: string; txt: string; tom: "otimo" | "bom" | "ok" | "ruim" | "pessimo" };
export const FAIXAS: Record<string, Faixa[]> = {
  ctr: [
    { min: 1.8, rot: "Oscar", txt: "1,8% +", tom: "otimo" }, { min: 1.5, rot: "Excelente", txt: "1,5 a 1,7%", tom: "otimo" },
    { min: 1.2, rot: "Ótimo", txt: "1,2 a 1,4%", tom: "otimo" }, { min: 0.9, rot: "Bom", txt: "0,9 a 1,1%", tom: "bom" },
    { min: 0.7, rot: "Razoável", txt: "0,7 a 0,8%", tom: "ok" }, { min: 0.5, rot: "Ruim", txt: "0,5 a 0,6%", tom: "ruim" },
    { min: -1, rot: "Horrível", txt: "0,4% ou menos", tom: "pessimo" },
  ],
  connect: [
    { min: 81, rot: "Excelente", txt: "81% +", tom: "otimo" }, { min: 75, rot: "Ótimo", txt: "75 a 80%", tom: "otimo" },
    { min: 69, rot: "Bom", txt: "69 a 75%", tom: "bom" }, { min: 61, rot: "Ok", txt: "61 a 68%", tom: "ok" },
    { min: 55, rot: "Ruim", txt: "55 a 60%", tom: "ruim" }, { min: -1, rot: "Horrível", txt: "54% ou menos", tom: "pessimo" },
  ],
  paginaCheckout: [
    { min: 40, rot: "Excelente", txt: "40% +", tom: "otimo" }, { min: 32, rot: "Ótimo", txt: "32 a 39%", tom: "otimo" },
    { min: 26, rot: "Bom", txt: "26 a 31%", tom: "bom" }, { min: 21, rot: "Razoável", txt: "21 a 25%", tom: "ok" },
    { min: 18, rot: "Ruim", txt: "18 a 20%", tom: "ruim" }, { min: -1, rot: "Horrível", txt: "17% ou menos", tom: "pessimo" },
  ],
  checkoutCompra: [
    { min: 25, rot: "Excelente", txt: "25% +", tom: "otimo" }, { min: 18, rot: "Muito bom", txt: "18 a 24%", tom: "otimo" },
    { min: 12, rot: "Bom", txt: "12 a 17%", tom: "bom" }, { min: 8, rot: "Regular", txt: "8 a 11%", tom: "ok" },
    { min: 5, rot: "Ruim", txt: "5 a 7%", tom: "ruim" }, { min: -1, rot: "Horrível", txt: "4% ou menos", tom: "pessimo" },
  ],
  paginaCompra: [
    { min: 8, rot: "Excelente", txt: "8% +", tom: "otimo" }, { min: 6, rot: "Boa", txt: "6 a 7%", tom: "bom" },
    { min: 3, rot: "Regular", txt: "3 a 5%", tom: "ok" }, { min: -1, rot: "Ruim", txt: "2% ou menos", tom: "ruim" },
  ],
  // Regra do dono: comparecimento bom é ACIMA de 50% dos compradores na live.
  comparecimento: [
    { min: 50, rot: "Bom", txt: "acima de 50%", tom: "bom" }, { min: 35, rot: "Atenção", txt: "35 a 50%", tom: "ok" },
    { min: -1, rot: "Baixo", txt: "abaixo de 35%", tom: "ruim" },
  ],
};
// CPM × ticket que a conta aguenta (mesma mentoria). O pitch do workshop é o White Label (R$ 697),
// então a cor compara com isso: até R$ 20 verde, até R$ 40 amarelo, acima vermelho.
export function faixaCpm(cpm: number): Faixa | null {
  if (!Number.isFinite(cpm) || cpm <= 0) return null;
  if (cpm <= 20) return { min: 0, rot: "Ticket R$ 1–2 mil", txt: "R$ 11 a 20", tom: "bom" };
  if (cpm <= 40) return { min: 0, rot: "Ticket R$ 1,5–4 mil", txt: "R$ 21 a 40", tom: "ok" };
  if (cpm <= 60) return { min: 0, rot: "Ticket R$ 2,5–6 mil", txt: "R$ 41 a 60", tom: "ruim" };
  if (cpm <= 80) return { min: 0, rot: "Ticket R$ 7–15 mil", txt: "R$ 61 a 80", tom: "ruim" };
  if (cpm <= 110) return { min: 0, rot: "High ticket 10 mil+", txt: "R$ 81 a 110", tom: "pessimo" };
  return { min: 0, rot: "Só fecha com high ticket", txt: "R$ 111+", tom: "pessimo" };
}
export const faixaDe = (tipo: keyof typeof FAIXAS, pct: number): Faixa | null =>
  Number.isFinite(pct) ? FAIXAS[tipo].find((f) => pct >= f.min) ?? null : null;
// Dias de anúncio que contam pra turma: de domingo a sábado da semana da aula.
export const inicioDaTurma = (turma: string) => somaDias(turma, -6);
export const proximoSabado = (hojeIso: string) => {
  const dow = new Date(hojeIso + "T12:00:00Z").getUTCDay();
  return somaDias(hojeIso, (6 - dow + 7) % 7);
};
export { somaDias };
