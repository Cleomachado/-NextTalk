// CHANGELOG do ZapConverte — o que aparece na página /novidades e o "v1.x · novidades" da sidebar.
// Escrito PRO CLIENTE (benefício, sem jargão técnico), não pro dev. Ao lançar algo novo:
//   1. adicione o item no TOPO (versão nova ou item novo na versão do dia);
//   2. suba o número da versão quando o pacote for relevante — é ele que dispara o aviso de
//      "tem novidade" pra quem ainda não leu (comparação por VERSAO_ATUAL no Shell).
// Regra de estilo: título curto, 1-2 frases de benefício, sem emoji (ver feedback-ui-sem-emoji).

export type TipoNovidade = "novo" | "melhoria";
export interface ItemNovidade { titulo: string; tipo: TipoNovidade; texto: string }
export interface VersaoNovidade { versao: string; data: string; itens: ItemNovidade[] }

export const NOVIDADES: VersaoNovidade[] = [
  {
    versao: "1.0.0",
    data: "2026-10-14",
    itens: [
      { titulo: "Versão inicial", tipo: "novo", texto: "Primeira versão do seu sistema de WhatsApp: API Oficial, WhatsApp Lite, fluxos, disparos e IA." },
    ],
  },
];

export const VERSAO_ATUAL = NOVIDADES[0]?.versao ?? "1.0.0";
export const CHAVE_NOVIDADES_VISTA = "zc-novidades-vista"; // localStorage: última versão que o usuário leu
