// 🔵 ETIQUETAS DA META — espelho do ETIQUETAS_META do motor (server.ts): os NOMES são contrato.
// São etiquetas fixas (não dá pra criar, renomear nem excluir) que, marcadas num contato, disparam
// o evento correspondente na API de Conversões de MENSAGENS da Meta (business_messaging +
// ctwa_clid). Servem pra campanha de Click-to-WhatsApp aprender qual conversa virou venda.
export interface EtiquetaMeta { tag: string; evento: string | null; dica: string }

export const ETIQUETAS_META: EtiquetaMeta[] = [
  { tag: "Compra aprovada", evento: "Purchase", dica: "Venda fechada nesta conversa — aceita o valor em R$ e vira Purchase na Meta." },
  { tag: "Lead qualificado", evento: "QualifiedLead", dica: "Lead com perfil de compra — a campanha aprende a buscar gente assim." },
  { tag: "Lead cadastrado", evento: "LeadSubmitted", dica: "Deixou os dados, virou cadastro." },
  { tag: "Checkout iniciado", evento: "InitiateCheckout", dica: "Recebeu o link de pagamento e começou a pagar." },
  { tag: "Carrinho abandonado", evento: "CartAbandoned", dica: "Começou a comprar e parou no meio." },
  { tag: "Lead desqualificado", evento: null, dica: "Só organiza aqui dentro — a Meta não tem evento negativo." },
];

export const ehEtiquetaMeta = (t: string) =>
  ETIQUETAS_META.some((e) => e.tag.toLowerCase() === String(t ?? "").trim().toLowerCase());
