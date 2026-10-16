import { createHash } from "node:crypto";

// ⚖️ TERMOS ACEITOS DENTRO DO PAINEL — a prova de que o cliente foi avisado.
//
// Por que isto existe: quando o número de um cliente é banido pela Meta, a primeira reação dele é
// culpar a ferramenta. Cláusula no site não basta como defesa — o que ganha a discussão é PROVA de
// que aquela pessoa, naquele dia, naquele IP, leu o aviso e clicou em "aceito" ANTES de conectar o
// número. É por isso que o texto abaixo mora no SERVIDOR e é gravado com hash: se um dia o texto
// mudar, ainda dá pra provar qual versão estava na tela no dia do aceite.
//
// REGRA AO MEXER: mudou o texto → suba a VERSAO. O hash muda junto e todo mundo aceita de novo.
// Nunca edite o texto de uma versão já publicada — isso apaga a prova de quem já aceitou.

export const TERMOS_VERSAO = "v1-2026-08-22";

// O que aparece no modal. Curto de propósito: aviso que ninguém lê não protege ninguém.
// Cada item existe por um motivo jurídico, não por enfeite.
export const TERMOS_ITENS = [
  {
    titulo: "Quem manda a mensagem é você",
    texto: "O ZapConverte é a ferramenta; o conteúdo, a lista e o momento do envio são escolha sua. Você é o responsável legal por tudo que sai do seu número.",
  },
  {
    titulo: "Só envie para quem autorizou",
    texto: "A Meta exige autorização prévia (opt-in) de cada destinatário. Lista comprada, contato raspado de site ou grupo, e número obtido para outra finalidade NÃO valem como autorização.",
  },
  {
    titulo: "Respeite o pedido de parar",
    texto: "Quem pedir para não receber mais tem que ser removido na hora, em qualquer palavra que use. Continuar enviando é a causa nº 1 de bloqueio.",
  },
  {
    titulo: "O banimento é decisão da Meta, e é irreversível para nós",
    texto: "Denúncia e bloqueio dos destinatários derrubam a qualidade do número e podem levar ao banimento pela Meta. Essa decisão é exclusiva dela: o ZapConverte não tem como impedir, reverter, recorrer ou recuperar um número banido — e não responde por prejuízo decorrente disso.",
  },
  {
    titulo: "O número e a conta na Meta são seus",
    texto: "Você continua dono do seu número e da sua conta comercial. Se encerrar a assinatura, leva os dois com você.",
  },
  {
    titulo: "Uso proibido derruba a conta",
    texto: "Spam, fraude, golpe, ou os produtos vedados pela Política de Comércio do WhatsApp levam à suspensão imediata, sem devolução.",
  },
];

// A frase do checkbox. É ela que transforma o clique em declaração.
export const TERMOS_DECLARACAO =
  "Li e concordo com os Termos de Serviço e a Política de Privacidade. Entendo que sou o responsável " +
  "pelas mensagens que envio e pela autorização de quem as recebe, e que o banimento do número pela " +
  "Meta é decisão dela — não do ZapConverte.";

// O aviso extra que só aparece na hora de conectar um número. É o momento de maior risco, e é o
// aceite que mais vale em juízo: foi dado imediatamente antes de pôr AQUELE número em operação.
export const TERMOS_AVISO_CANAL =
  "Você está prestes a conectar um número de WhatsApp. A partir daqui, tudo que for enviado por ele " +
  "é de sua responsabilidade. Números que enviam mensagem sem autorização são bloqueados pelos " +
  "destinatários e banidos pela Meta — e não existe recurso que devolva um número banido.";

// O TEXTO EXATO que foi para a tela, em forma canônica. É disto que sai o hash gravado no aceite.
// Qualquer mudança de vírgula muda o hash — que é exatamente a propriedade que queremos.
export function textoCanonico(momento: "login" | "canal"): string {
  const partes = [
    `VERSAO=${TERMOS_VERSAO}`,
    `MOMENTO=${momento}`,
    ...(momento === "canal" ? [`AVISO=${TERMOS_AVISO_CANAL}`] : []),
    ...TERMOS_ITENS.map((i) => `${i.titulo}: ${i.texto}`),
    `DECLARACAO=${TERMOS_DECLARACAO}`,
  ];
  return partes.join("\n");
}

export function hashTermos(momento: "login" | "canal"): string {
  return createHash("sha256").update(textoCanonico(momento), "utf8").digest("hex");
}

// O que o painel precisa para desenhar o modal.
export function pacoteTermos(momento: "login" | "canal") {
  return {
    versao: TERMOS_VERSAO,
    momento,
    hash: hashTermos(momento),
    aviso: momento === "canal" ? TERMOS_AVISO_CANAL : null,
    itens: TERMOS_ITENS,
    declaracao: TERMOS_DECLARACAO,
  };
}
