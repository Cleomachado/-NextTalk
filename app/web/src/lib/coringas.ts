// Templates CORINGA: corpo 100% variável ({{1}}..{{4}}) aprovado como Utility — na hora do
// disparo, as variáveis (e a mídia do cabeçalho) carregam o conteúdo real. As 6 variações cobrem
// texto / imagem / vídeo, com e sem botões.
//
// ⚠️ RISCO (deixar sempre visível na UI): enviar conteúdo de MARKETING num template aprovado como
// UTILITY viola as políticas da Meta. A punição escala: template pausado → qualidade do número
// caindo → tier reduzido → banimento da WABA/BM. A ferramenta existe; a conta é de quem arrisca.

export interface Coringa {
  id: string;
  rotulo: string;
  descricao: string;
  headerTipo: "none" | "image" | "video";
  botoes: Array<{ tipo: "resposta"; texto: string; url: string; telefone: string }>;
}

// ══ MODELOS DE CORPO POR QUANTIDADE DE VARIÁVEL ═════════════════════════════════════════════
// A Meta recusa template com "muitas variáveis para sua extensão": ela compara o número de
// variáveis com a quantidade de TEXTO FIXO do corpo. O coringa antigo era
// "Olá {{1}}, tudo bem?\n\n{{2}}\n\n{{3}}\n\n{{4}}" — 4 variáveis e ~20 caracteres de texto real.
// Reprovava (confirmado no teste do dono em 19/08; aprovou quando ele escreveu texto no corpo).
// Regra prática usada aqui: quanto mais variável, mais texto fixo tem que sobrar em volta.
export interface ModeloCoringa {
  vars: 2 | 3 | 4;
  rotulo: string;
  dica: string;
  corpo: string;
  exemplos: string[];
}
export const MODELOS_CORINGA: ModeloCoringa[] = [
  // O texto fixo é DE PROPÓSITO neutro de nicho (pedido do dono, 25/08): "se precisar remarcar"
  // amarrava o coringa a consulta/agendamento — em e-commerce ou infoproduto ficava sem sentido.
  // O fecho "responder esta mensagem" fica: além de genérico, resposta do cliente REABRE a janela
  // de 24h — é estratégia, não enfeite.
  {
    vars: 2,
    rotulo: "2 variáveis",
    dica: "O que aprova mais fácil. Muito texto fixo, dois espaços livres.",
    corpo:
      "Olá {{1}}, tudo bem?\n\n" +
      "Passando para deixar com você as informações que combinamos:\n\n" +
      "{{2}}\n\n" +
      "Qualquer dúvida, é só responder esta mensagem — estou por aqui para te ajudar.",
    exemplos: [
      "João",
      "Seu pedido foi confirmado e a entrega está prevista para quinta-feira, dia 28.",
    ],
  },
  {
    vars: 3,
    rotulo: "3 variáveis",
    dica: "O equilíbrio: três espaços livres e texto fixo suficiente pra passar.",
    corpo:
      "Olá {{1}}, tudo bem?\n\n" +
      "{{2}}\n\n" +
      "{{3}}\n\n" +
      "Qualquer dúvida, é só responder esta mensagem — estou por aqui para te ajudar.",
    exemplos: [
      "João",
      "Aqui é da nossa equipe de atendimento, passando com uma atualização para você.",
      "O que você solicitou já está pronto — é só me avisar quando quiser continuar.",
    ],
  },
  {
    vars: 4,
    rotulo: "4 variáveis",
    dica: "O mais flexível no disparo. Só passa com bastante texto fixo em volta — já vem assim.",
    corpo:
      "Olá {{1}}, tudo bem?\n\n" +
      "Passando para deixar com você estas informações importantes:\n\n" +
      "{{2}}\n\n" +
      "{{3}}\n\n" +
      "{{4}}\n\n" +
      "Qualquer coisa que precisar, é só responder esta mensagem — estou por aqui para te ajudar. Obrigado pela confiança!",
    exemplos: [
      "João",
      "Seu pedido nº 1042 foi aprovado e já está em preparação.",
      "A previsão de entrega é quarta-feira, dia 27 de agosto.",
      "Se precisar mudar alguma informação, me avise até amanhã.",
    ],
  },
];
export const MODELO_PADRAO = MODELOS_CORINGA[1]; // 3 variáveis
export const CORINGA_RODAPE = "Fico à disposição para qualquer dúvida.";

// Quanto texto FIXO sobra por variável — é o que a Meta olha pra recusar por "muitas variáveis
// para sua extensão". Serve pra avisar ANTES de enviar, em vez de descobrir na recusa.
export function textoFixoPorVariavel(corpo: string): { fixo: number; vars: number; porVar: number } {
  const vars = new Set(corpo.match(/\{\{\s*\d+\s*\}\}/g) ?? []).size;
  const fixo = corpo.replace(/\{\{\s*\d+\s*\}\}/g, "").replace(/\s+/g, " ").trim().length;
  return { fixo, vars, porVar: vars ? Math.round(fixo / vars) : fixo };
}
// Abaixo disso a Meta costuma recusar. Não é número publicado por ela — é a margem que a gente
// mediu no teste que reprovou (≈5 por variável) e no que aprovou (≈22).
export const MIN_TEXTO_POR_VARIAVEL = 18;

const BOTOES_PADRAO: Coringa["botoes"] = [
  { tipo: "resposta", texto: "Quero saber mais", url: "", telefone: "" },
  { tipo: "resposta", texto: "Falar com atendente", url: "", telefone: "" },
];

export const CORINGAS: Coringa[] = [
  { id: "coringa_texto", rotulo: "Só texto", descricao: "Corpo inteiro em variáveis. O coringa mais simples e o que aprova mais rápido.", headerTipo: "none", botoes: [] },
  { id: "coringa_texto_botoes", rotulo: "Texto + botões", descricao: "Corpo variável + 2 respostas rápidas (quem clica reabre a janela de 24h).", headerTipo: "none", botoes: BOTOES_PADRAO },
  { id: "coringa_imagem", rotulo: "Imagem + texto", descricao: "Imagem no topo (trocável a cada disparo) + corpo variável.", headerTipo: "image", botoes: [] },
  { id: "coringa_imagem_botoes", rotulo: "Imagem + texto + botões", descricao: "O coringa completo: imagem trocável, corpo variável e 2 botões.", headerTipo: "image", botoes: BOTOES_PADRAO },
  { id: "coringa_video", rotulo: "Vídeo + texto", descricao: "Vídeo no topo (trocável a cada disparo) + corpo variável.", headerTipo: "video", botoes: [] },
  { id: "coringa_video_botoes", rotulo: "Vídeo + texto + botões", descricao: "Vídeo trocável, corpo variável e 2 botões de resposta rápida.", headerTipo: "video", botoes: BOTOES_PADRAO },
];
