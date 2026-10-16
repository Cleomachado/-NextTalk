import type { Step, FlowEdge } from "@/lib/client";

// Um template de fluxo = uma automação pronta (gatilho + passos), com metadados
// pra galeria (categoria/busca). "Usar" cria um fluxo novo a partir daqui.
// edges + layout são OPCIONAIS (fluxos ramificados, ex.: agente IA com caminhos):
// quando presentes, os passos precisam de `_id` e as arestas/posições referenciam esses ids.
export interface FlowTemplate {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  tags: string[]; // categorias (alimentam os chips de filtro)
  trigger: string;
  keyword?: string; // só quando trigger === "keyword"
  steps: Step[];
  edges?: FlowEdge[];
  layout?: Record<string, { x: number; y: number }>;
}

// Categorias na ordem dos chips (todas batem com o motor LITE de WhatsApp).
export const TEMPLATE_CATEGORIES = ["IA", "Vendas", "Recuperação", "Pós-venda", "Assinatura", "Grupo", "Atendimento"];

// Variáveis que o motor substitui em runtime: {{nome}} {{primeiro_nome}} {{produto}} {{valor}} {{link}} {{pix}}
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "lguc-meta-ads",
    name: "Sua Empresa — lead de anúncio (Click-to-WhatsApp)",
    emoji: "\u{1F4E3}",
    desc: "Recebe o lead que veio do Meta Ads, a Ana qualifica e leva pro checkout certo. 4 follow-ups que cabem DENTRO da janela de 24h e se cancelam sozinhos se o lead responder.",
    tags: ["IA", "Vendas", "Assinatura"],
    trigger: "primeiro_contato",
    steps: [
      { _id: "tag", type: "tag", tags: ["Lead Meta Ads \u00B7 LGUC"] },
      { _id: "abertura", type: "text", text: "Opa! Aqui \u00E9 a Ana, do Sua Empresa \u{1F44B}\n\nVi que voc\u00EA veio pelo an\u00FAncio. Me conta rapidinho: o que voc\u00EA vende pelo Instagram hoje?" },
      { _id: "manu", type: "ai_agent", maxTurns: 12, keepAlive: true, systemPrompt: `Você é a Ana, atendente do Sua Empresa.

Esta pessoa veio de um ANÚNCIO e clicou pra falar no WhatsApp — ela já demonstrou interesse, mas ainda não sabe direito o que a ferramenta faz. É um lead morno: trate com atenção, sem pressa e sem despejar informação.

COMO FALAR
Leve, humana e direta, como um atendente real no WhatsApp.
Mensagens CURTAS. Nunca um textão.
Nunca exagere nas gírias. Nunca pareça robô. Nunca faça interrogatório.
Uma pergunta por vez.

COMO CHAMAR A PESSOA (regra importante)
Olhe o nome e escolha UM dos três casos.

1) Nome claramente MASCULINO (João, Pedro, Carlos, Marcelo, Lucas, Rafael):
   "fala comigo meu irmão", "opa, beleza pura irmão?", "meu amigo", "beleza mano".

2) Nome claramente FEMININO (Maria, Ana, Joana, Clara, Luiza, Fernanda):
   "opa minha amiga, tudo beleza pura?".

3) QUALQUER OUTRO CASO — e este é o mais importante:
   NÃO use tratamento de gênero nenhum.
   Use "opa!", "e aí, tudo bem?", "fala comigo", "beleza?" ou só o nome.
   Entram aqui:
   · nomes que servem para os dois (Jovan, Alex, Ariel, Darci, Renê, Wesley)
   · nome de EMPRESA ou marca (Agência tal, Produtora Raio de Sol, PizzaRio) — não é pessoa. Palavra com som feminino ("agência", "produtora", "loja") NÃO quer dizer que quem digita é mulher.
   · nome estrangeiro ou incomum que você não reconhece com segurança
   · perfil sem nome, só o número

REGRA DE OURO: na menor dúvida, use o caso 3. Errar o gênero irrita e queima a conversa; ser neutro não custa nada.

QUALIFICAÇÃO — FAÇA ANTES DE QUALQUER LINK
Nunca mande link na primeira mensagem. Descubra, conversando, duas coisas:
  1. O que a pessoa vende e se vende pelo Instagram.
  2. Quantos perfis de Instagram ela precisa automatizar (1, ou mais de um).

O número de perfis é o que define o plano. Se ela não disser, pergunte.
Só escolha um caminho quando tiver CERTEZA. Na dúvida, pergunte.

OS PLANOS (valor fixo por mês, sem fidelidade, sem cobrança por lead)
  · 1 conta de Instagram .... R$ 147/mês
  · 3 contas ................ R$ 297/mês
  · 5 contas ................ R$ 597/mês

Nunca invente preço, desconto ou plano que não está nesta lista.

QUEBRA DE OBJEÇÕES
Responda curto, sem discurso decorado. Use o argumento, não o texto pronto.

"Tá caro"
  → Compare com o custo de responder na mão: 1 pessoa respondendo Direct custa muito mais que R$ 147. E a ferramenta trabalha 24h, inclusive de madrugada, que é quando cai a maior parte dos comentários de reels.
  → Se insistir, ofereça o teste de 3 dias em vez de dar desconto.

"O ManyChat eu já uso / é mais barato"
  → O ManyChat cobra POR LEAD. Se um reel viraliza, a fatura explode — tem gente que pulou de R$ 150 pra mais de R$ 500 num mês só por ter dado certo. Aqui é valor fixo por conta: viralizou, o preço não muda.
  → Nunca chame o produto de "ManyChat brasileiro".

"É difícil? Preciso saber mexer?"
  → Não tem código. Vem com modelos prontos, é só editar as mensagens em português. Quem monta um story monta um fluxo.

"Vai dar ban na minha conta?"
  → Não. Roda na API oficial do Instagram, dentro da política da Meta. Nada de automação proibida ou robô de spam.

"Tem fidelidade? E se eu não gostar?"
  → Mensal, sem fidelidade, cancela em 1 clique. E dá pra testar 3 dias antes.

"Vou pensar" / "depois eu vejo"
  → Não empurre a venda. Ofereça o teste de 3 dias: risco zero, não pede cartão.

"Funciona pro meu nicho?"
  → Funciona pra quem VENDE pelo Instagram: infoproduto, loja, clínica, serviço, agência. Se a pessoa não vende nada pelo Instagram, seja honesta e diga que a ferramenta não vai ajudar — é melhor não vender do que vender errado.

O QUE NUNCA FAZER
  · Não prometa "verificação de quem segue" automática. A trava de seguidor é o lead confirmando no botão que segue — é assim que a Meta permite.
  · Não prometa integração, recurso ou prazo que não está descrito aqui.
  · Não mande dois links na mesma mensagem.
  · Se a pessoa pedir pra falar com uma pessoa de verdade, escolha o caminho "Falar com humano" na hora — isso vem antes de qualquer venda.`, paths: [
        { name: "Assinar 1 conta", description: "vende pelo Instagram, tem UM perfil s\u00F3 e quer assinar agora", reply: "Fechou! Pra 1 conta de Instagram o plano \u00E9 R$ 147/m\u00EAs \u{1F447}" },
        { name: "Assinar 3 contas", description: "gerencia MAIS DE UM perfil, at\u00E9 3 no total (ag\u00EAncia, social media, dono de v\u00E1rias marcas) \u2014 j\u00E1 confirmou a quantidade", reply: "Show! Pra at\u00E9 3 perfis o plano \u00E9 R$ 297/m\u00EAs \u{1F447}" },
        { name: "Assinar 5 contas", description: "gerencia de 4 a 5 perfis de Instagram \u2014 j\u00E1 confirmou a quantidade", reply: "Perfeito! Pra at\u00E9 5 perfis o plano \u00E9 R$ 597/m\u00EAs \u{1F447}" },
        { name: "Testar 3 dias", description: "se interessou mas quer ver funcionando antes de pagar, disse \"vou pensar\", ou travou no pre\u00E7o", reply: "Ent\u00E3o testa antes de decidir \u2014 3 dias, sem cart\u00E3o \u{1F447}" },
        { name: "Falar com humano", description: "PRIORIDADE M\u00C1XIMA: pediu pra falar com uma pessoa de verdade, quer negociar, tem d\u00FAvida muito espec\u00EDfica ou est\u00E1 irritada. Escolha este mesmo que na mesma mensagem demonstre interesse em assinar", reply: "Claro! J\u00E1 estou chamando algu\u00E9m do time aqui pra te responder \u{1F64C}" },
        { name: "Fora do perfil", description: "n\u00E3o vende nada pelo Instagram, entrou por engano, s\u00F3 curiosidade, ou quer algo que a ferramenta n\u00E3o faz (automa\u00E7\u00E3o de WhatsApp, rob\u00F4 de spam, seguidores)", reply: "Entendi! Ent\u00E3o vou ser honesta com voc\u00EA \u{1F447}" },
      ] },
      { _id: "ck1", type: "text", text: "\u00C9 mensal e sem fidelidade \u2014 cancela quando quiser.\n\nAssina aqui \u{1F449} https://pay.kiwify.com.br/SEU-CHECKOUT\n\nAssim que o pagamento cair, o acesso chega no seu e-mail." },
      { _id: "ck3", type: "text", text: "\u00C9 mensal e sem fidelidade \u2014 cancela quando quiser.\n\nAssina aqui \u{1F449} https://pay.kiwify.com.br/SEU-CHECKOUT\n\nAssim que o pagamento cair, o acesso chega no seu e-mail." },
      { _id: "ck5", type: "text", text: "\u00C9 mensal e sem fidelidade \u2014 cancela quando quiser.\n\nAssina aqui \u{1F449} https://pay.kiwify.com.br/SEU-CHECKOUT\n\nAssim que o pagamento cair, o acesso chega no seu e-mail." },
      { _id: "teste", type: "text", text: "Voc\u00EA cria a conta, conecta o Instagram e j\u00E1 v\u00EA coment\u00E1rio virando DM.\n\n\u{1F449} https://seudominio.com.br\n\nS\u00E3o 3 dias corridos, ent\u00E3o vale come\u00E7ar hoje pra aproveitar tudo." },
      { _id: "avisa", type: "notify", targets: [], text: "\u{1F6A8} Lead do Meta Ads quer FALAR COM HUMANO \u2014 {{nome}} ({{telefone}}). Fluxo: Sua Empresa." },
      { _id: "humano", type: "text", text: "J\u00E1 avisei o time aqui \u2014 algu\u00E9m te responde por aqui mesmo, nesta conversa." },
      { _id: "fora", type: "text", text: "Pelo que voc\u00EA me contou, o Sua Empresa n\u00E3o vai te ajudar de verdade \u2014 ele foi feito pra quem vende pelo Instagram.\n\nPrefiro te falar isso agora do que te vender algo que n\u00E3o serve. Obrigada pelo papo, e sucesso a\u00ED! \u{1F64C}" },
      { _id: "w1", type: "wait", ms: 1200000, cancelOnReply: true },
      { _id: "fu1", type: "text", text: "{{primeiro_nome}}, ficou alguma d\u00FAvida?\n\nSe preferir, d\u00E1 pra testar 3 dias sem cart\u00E3o e ver funcionando na sua conta:\nhttps://seudominio.com.br" },
      { _id: "w2", type: "wait", ms: 9600000, cancelOnReply: true },
      { _id: "fu2", type: "text", text: "S\u00F3 pra voc\u00EA ver na pr\u00E1tica o que ele faz:\n\nalgu\u00E9m comenta uma palavra no seu post \u2192 recebe sua mensagem no Direct sozinho, na hora, mesmo 3 da manh\u00E3.\n\nQuer que eu te mostre como fica no seu caso?" },
      { _id: "w3", type: "wait", ms: 18000000, cancelOnReply: true },
      { _id: "fu3", type: "text", text: "{{primeiro_nome}}, uma d\u00FAvida que quase todo mundo tem: n\u00E3o precisa saber nada de t\u00E9cnico. Vem com os modelos prontos, voc\u00EA s\u00F3 troca o texto.\n\nTeste 3 dias, sem cart\u00E3o: https://seudominio.com.br" },
      { _id: "w4", type: "wait", ms: 43200000, cancelOnReply: true },
      { _id: "fu4", type: "text", text: "Vou parar de te chamar por aqui pra n\u00E3o incomodar \u{1F642}\n\nSe quiser testar depois, o link fica valendo:\nhttps://seudominio.com.br\n\nE se preferir falar com algu\u00E9m do time, \u00E9 s\u00F3 me responder aqui que eu chamo." },
    ],
    edges: [
      { id: "a1", source: "trigger", target: "tag" },
      { id: "a2", source: "tag", target: "abertura" },
      { id: "a3", source: "abertura", target: "manu" },
      { id: "a4", source: "manu", sourceHandle: "p:Assinar 1 conta", target: "ck1" },
      { id: "a5", source: "manu", sourceHandle: "p:Assinar 3 contas", target: "ck3" },
      { id: "a6", source: "manu", sourceHandle: "p:Assinar 5 contas", target: "ck5" },
      { id: "a7", source: "manu", sourceHandle: "p:Testar 3 dias", target: "teste" },
      { id: "a8", source: "manu", sourceHandle: "p:Falar com humano", target: "avisa" },
      { id: "a9", source: "avisa", target: "humano" },
      { id: "a10", source: "manu", sourceHandle: "p:Fora do perfil", target: "fora" },
      { id: "a11", source: "manu", target: "w1" },
      { id: "a12", source: "w1", target: "fu1" },
      { id: "a13", source: "fu1", target: "w2" },
      { id: "a14", source: "w2", target: "fu2" },
      { id: "a15", source: "fu2", target: "w3" },
      { id: "a16", source: "w3", target: "fu3" },
      { id: "a17", source: "fu3", target: "w4" },
      { id: "a18", source: "w4", target: "fu4" },
    ],
    layout: {
      trigger: { x: 40, y: 40 }, tag: { x: 40, y: 180 }, abertura: { x: 40, y: 300 }, manu: { x: 40, y: 440 },
      ck1: { x: 520, y: 60 }, ck3: { x: 520, y: 200 }, ck5: { x: 520, y: 340 }, teste: { x: 520, y: 480 },
      avisa: { x: 520, y: 620 }, humano: { x: 900, y: 620 }, fora: { x: 520, y: 760 },
      w1: { x: 40, y: 640 }, fu1: { x: 40, y: 760 }, w2: { x: 40, y: 900 }, fu2: { x: 40, y: 1020 },
      w3: { x: 40, y: 1160 }, fu3: { x: 40, y: 1280 }, w4: { x: 40, y: 1420 }, fu4: { x: 40, y: 1540 },
    },
  },
  {
    id: "lembrete-por-mensagem",
    name: "⏰ Lembrete por mensagem (#lembrete)",
    emoji: "⏰",
    desc: "Digite #lembrete (pode ser no seu próprio chat) e DITE o lembrete em áudio ou texto — a IA entende o dia, a hora e pra quem, e agenda o envio sozinha.",
    tags: ["Atendimento"],
    trigger: "keyword",
    keyword: "#lembrete",
    steps: [
      { type: "reminder", text: "Ok, Admin! Estou na escuta do lembrete que você quer fazer — pode ser áudio ou texto. Manda! 🎙️\n(diga o dia, a hora, pra quem e a mensagem)" },
    ],
  },
  {
    id: "demo-stories-completo",
    name: "🎬 Demo completo (pra stories)",
    emoji: "🎬",
    desc: "Fluxo visualmente robusto com TODOS os recursos: IA, vídeo bolinha, áudio, mídia, marcação em grupo, botões, agente com caminhos e aviso ao supervisor. Gatilho #teste.",
    tags: ["IA", "Atendimento"],
    trigger: "keyword",
    keyword: "#teste",
    steps: [
      { _id: "nota1", type: "note", text: "🎬 FLUXO DEMO PARA STORIES\n\nGatilho: #teste. Mostra IA, vídeo bolinha ▶️, áudio, mídia, marcação em grupo, botões e agente com caminhos.\n\n⚠️ Troque as mídias (áudio/vídeo/imagem) e os grupos/números pelos SEUS antes de gravar!" },
      { _id: "avisa", type: "notify", targets: [], text: "🔔 Novo lead entrou no fluxo: {{nome}} ({{telefone}})" },
      { _id: "dig1", type: "presence", presence: "composing", ms: 2000 },
      { _id: "saud", type: "text", text: "Oii {{primeiro_nome}}! 👋 Que bom te ver por aqui. Deixa eu te mostrar uma coisa 👇" },
      { _id: "audio", type: "ptt", file: "" },
      { _id: "grav", type: "presence", presence: "recording", ms: 1800 },
      { _id: "ptv1", type: "ptv", file: "" },
      { _id: "img1", type: "media", mediaType: "image", file: "", caption: "Olha só o que preparei pra você 🎁" },
      { _id: "marca", type: "mention_all", groupJid: "", text: "📣 Pessoal, entrou um lead novo no funil! Bora atender 🔥", hidden: false },
      { _id: "esp1", type: "wait", ms: 3000 },
      { _id: "botoes", type: "buttons", text: "O que você quer ver primeiro? 👇", buttons: ["Ver os planos", "Falar com humano", "Tirar dúvida"] },
      { _id: "txplanos", type: "text", text: "Aqui estão nossos planos 👇\n\n✅ Start\n✅ Profissional\n✅ Escala\n\nGaranta o seu 👉 {{link}}" },
      { _id: "avisasup", type: "notify", targets: [], text: "🆘 Lead {{nome}} ({{telefone}}) quer FALAR COM HUMANO / suporte." },
      { _id: "txsup", type: "text", text: "Prontinho! Já avisei nosso time, em instantes alguém te chama 🙌" },
      { _id: "anna", type: "ai_agent", systemPrompt: "Você é a Anna, atendente do [SEU NEGÓCIO]. Fale leve, humana e direta, como no WhatsApp. Entenda a necessidade ANTES de agir e escolha um caminho só quando tiver certeza do que a pessoa quer.", maxTurns: 6, keepAlive: true, paths: [
        { name: "Comprar", description: "quando o lead quer comprar, ver planos ou preços", reply: "Perfeito! Já te mostro 👇" },
        { name: "Dúvida", description: "quando o lead tem uma dúvida sobre o produto", reply: "Boa pergunta! Deixa eu te explicar 👇" },
        { name: "Suporte", description: "quando o lead precisa de suporte ou ajuda técnica", reply: "Vou chamar o suporte pra você agora 🙌" },
      ] },
      { _id: "ptvdemo", type: "ptv", file: "" },
      { _id: "txcompra", type: "text", text: "Aqui está a demonstração! Gostou? É só clicar pra garantir o seu 👉 {{link}}" },
      { _id: "txduvida", type: "text", text: "Qualquer dúvida que ficar, é só me chamar por aqui que eu respondo na hora 💬" },
      { _id: "txfim", type: "text", text: "Foi um prazer te atender, {{primeiro_nome}}! Qualquer coisa, é só chamar 💚" },
      { _id: "txfall", type: "text", text: "Deixa eu te passar pra uma pessoa do time pra te ajudar melhor 👥" },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "nota1" },
      { id: "e2", source: "nota1", target: "avisa" },
      { id: "e3", source: "avisa", target: "dig1" },
      { id: "e4", source: "dig1", target: "saud" },
      { id: "e5", source: "saud", target: "audio" },
      { id: "e6", source: "audio", target: "grav" },
      { id: "e7", source: "grav", target: "ptv1" },
      { id: "e8", source: "ptv1", target: "img1" },
      { id: "e9", source: "img1", target: "marca" },
      { id: "e10", source: "marca", target: "esp1" },
      { id: "e11", source: "esp1", target: "botoes" },
      { id: "e12", source: "botoes", sourceHandle: "b0", target: "txplanos" },
      { id: "e13", source: "botoes", sourceHandle: "b1", target: "avisasup" },
      { id: "e14", source: "avisasup", target: "txsup" },
      { id: "e15", source: "botoes", sourceHandle: "b2", target: "anna" },
      { id: "e16", source: "anna", sourceHandle: "p:Comprar", target: "ptvdemo" },
      { id: "e17", source: "ptvdemo", target: "txcompra" },
      { id: "e18", source: "anna", sourceHandle: "p:Dúvida", target: "txduvida" },
      { id: "e19", source: "anna", sourceHandle: "p:Suporte", target: "avisasup" },
      { id: "e20", source: "anna", sourceHandle: "ended", target: "txfim" },
      { id: "e21", source: "anna", sourceHandle: "fallback", target: "txfall" },
    ],
    layout: {
      trigger: { x: 80, y: 0 }, nota1: { x: 380, y: -20 }, avisa: { x: 80, y: 120 }, dig1: { x: 80, y: 215 },
      saud: { x: 80, y: 305 }, audio: { x: 80, y: 405 }, grav: { x: 80, y: 500 }, ptv1: { x: 80, y: 595 },
      img1: { x: 80, y: 730 }, marca: { x: 80, y: 930 }, esp1: { x: 80, y: 1030 }, botoes: { x: 80, y: 1130 },
      txplanos: { x: 480, y: 1055 }, avisasup: { x: 480, y: 1185 }, txsup: { x: 800, y: 1190 },
      anna: { x: 480, y: 1330 }, ptvdemo: { x: 880, y: 1300 }, txcompra: { x: 1170, y: 1310 },
      txduvida: { x: 880, y: 1440 }, txfim: { x: 880, y: 1560 }, txfall: { x: 880, y: 1680 },
    },
  },
  {
    id: "ia-completo",
    name: "🧠 IA COMPLETO — 6 caminhos + reengajamento 24h",
    emoji: "🧠",
    desc: "O fluxo mais completo: avisa você + o grupo, etiqueta o lead, pergunta o nome, e um Agente de IA que roteia pra 6 saídas (gestão de tráfego → vídeo bolinha, aprender IA → imagem, mentoria → material, atendimento humano → botões, seguir → grupo, agendar call → áudio). Cada saída tem follow-up de vácuo + pós-follow-up. Um dos caminhos espera 24h e chama um 2º Agente de IA pra reengajar. Precisa da sua chave OpenAI. Gatilho: #ia.",
    tags: ["IA", "Vendas", "Atendimento"],
    trigger: "keyword",
    keyword: "#ia",
    steps: [
      { _id: "nota", type: "note", text: "🧠 TEMPLATE IA COMPLETO\n\nGatilho: #ia (troque pelo que fizer sentido — pra tráfego de anúncio, use o texto do anúncio ou mude o gatilho pra 'contém').\n\n⚠️ ANTES de usar de verdade, troque:\n• os NÚMEROS/GRUPOS dos passos 'Avisar' e 'Adicionar ao grupo'\n• o VÍDEO BOLINHA, a IMAGEM, o MATERIAL (PDF) e o ÁUDIO\n• os LINKS (site, curso, agenda) e o @ do seu Instagram\n• os campos [SEU NOME] / [SEU NEGÓCIO] no prompt dos agentes\n\nPrecisa da sua chave OpenAI ligada (Configurações → IA)." },
      { _id: "avisaVoce", type: "notify", targets: [], text: "🔔 Novo lead no funil de IA: {{nome}} ({{telefone}}). Acabou de entrar no fluxo IA COMPLETO." },
      { _id: "avisaGrupo", type: "notify", targets: [], text: "📣 Time! Entrou um lead novo no funil de IA ({{nome}}). Bora acompanhar de perto 🔥" },
      { _id: "tagLead", type: "tag", tags: ["lead IA"] },
      { _id: "perguntaNome", type: "ask", text: "Opa! Que bom te ver por aqui 🙌 Antes da gente começar, como posso te chamar?", variable: "nome", hint: "o primeiro nome da pessoa" },
      { _id: "digita", type: "presence", presence: "composing", ms: 2500 },
      { _id: "agente", type: "ai_agent", keepAlive: false, maxTurns: 8, systemPrompt:
        "Você é o assistente de IA do [SEU NOME] — [SEU NEGÓCIO], especialista em IA e tráfego pago.\n" +
        "O lead chegou pelo WhatsApp (pode ter vindo de um anúncio ou dos stories). Fale leve, humano e direto, como no WhatsApp — mensagens curtas, no máximo 2 linhas.\n" +
        "Seu trabalho é entender o que a pessoa quer e encaminhar pro caminho certo. Faça no MÁXIMO 1 ou 2 perguntas de qualificação antes de escolher — não enrole.\n" +
        "Chame a pessoa pelo nome: {{primeiro_nome}}.\n" +
        "Caminhos possíveis: gestão de tráfego (anúncios), aprender IA, mentoria individual, atendimento humano (falar direto com o [SEU NOME]), seguir nas redes, ou agendar uma call.\n" +
        "REGRAS: (1) se pedir atendimento humano, priorize 'Atendimento humano' antes de qualquer link. (2) Só escolha um caminho quando tiver CERTEZA — na dúvida, pergunte. (3) NUNCA invente preço; se perguntarem valor, encaminhe pro caminho certo que a gente fala lá.",
        paths: [
          { name: "Gestão de tráfego", description: "quer que você faça a gestão de tráfego/anúncios (veio de anúncio, quer escalar, quer mais clientes ou vendas com ads).", reply: "Boa, {{primeiro_nome}}! Gestão de tráfego é comigo mesmo 🚀 Já te mostro na prática como funciona 👇" },
          { name: "Aprender IA", description: "quer APRENDER IA, usar IA no próprio negócio, ou fazer o curso/treinamento de IA.", reply: "Amei! Bora te mostrar como aprender IA do jeito certo, sem enrolação 🤖👇" },
          { name: "Mentoria", description: "quer uma MENTORIA individual, acompanhamento de perto, consultoria 1:1.", reply: "Mentoria é o nível mais próximo comigo 🤝 Te mando agora o que está incluso 👇" },
          { name: "Atendimento humano", description: "quer falar DIRETO com você (humano), negociar, tirar uma dúvida pessoal. PRIORIDADE: pedido de humano vem antes de qualquer link ou venda.", reply: "Fechou! Já vou te conectar direto com o [SEU NOME] 🙌" },
          { name: "Me seguir", description: "quer seguir você nas redes, acompanhar o conteúdo, entrar na comunidade.", reply: "Show de bola! Bora te colocar onde eu solto conteúdo de IA e tráfego todo dia 📲👇" },
          { name: "Agendar call", description: "quer AGENDAR uma call, reunião ou conversa marcada.", reply: "Perfeito! Bora marcar nossa call 📅 Escuta esse áudio rapidinho que eu explico 👇" },
        ],
      },

      // ── Caminho 1: GESTÃO DE TRÁFEGO → vídeo bolinha + follow-ups + espera 24h → 2º Agente IA
      { _id: "p1ptv", type: "ptv", file: "" },
      { _id: "p1esp1", type: "wait", ms: 1_200_000 },
      { _id: "p1fu", type: "text", text: "{{primeiro_nome}}, vi que você abriu mas não me respondeu 👀 Ficou alguma dúvida sobre a gestão de tráfego? Posso te explicar como aplico no seu nicho." },
      { _id: "p1esp2", type: "wait", ms: 10_800_000 },
      { _id: "p1pos", type: "text", text: "Última chamada por hoje 🙌 Tenho POUCAS vagas de gestão esse mês pra dar atenção de verdade. Se quiser garantir a sua, é só me responder aqui." },
      { _id: "p1esp24", type: "wait", ms: 86_400_000 },
      { _id: "agente2", type: "ai_agent", keepAlive: false, maxTurns: 6, systemPrompt:
        "Você é o assistente de IA do [SEU NOME] fazendo um REENGAJAMENTO 24h depois. O lead demonstrou interesse em gestão de tráfego mas não fechou.\n" +
        "Retome de forma leve e sem pressão, chamando pelo nome ({{primeiro_nome}}). Descubra se ele quer avançar, se tem alguma objeção, ou se não é o momento.\n" +
        "Mensagens curtas, tom de quem quer ajudar (não de quem quer empurrar). Nunca invente preço.",
        paths: [
          { name: "Quero fechar", description: "demonstra que quer avançar/contratar a gestão de tráfego agora.", reply: "Isso! 🚀 Me conta rapidinho: qual seu nicho e quanto você investe hoje em anúncio? Já adianto a proposta pra você." },
          { name: "Ainda em dúvida", description: "ainda está em dúvida, quer pensar, tem alguma objeção.", reply: "Tranquilo, sem pressa 🙏 Me conta qual a sua MAIOR dúvida agora que eu te ajudo a decidir com clareza." },
          { name: "Agora não", description: "não quer agora, não é o momento, sem interesse por enquanto.", reply: "Sem problema nenhum! Vou te deixar recebendo meu conteúdo pra quando fizer sentido. Quando quiser, é só me chamar 💚" },
        ],
      },
      { _id: "a2avisa", type: "notify", targets: [], text: "🔥🔥 LEAD QUENTE! {{nome}} ({{telefone}}) quer FECHAR a gestão de tráfego. Chama AGORA enquanto tá quente!" },
      { _id: "a2tag", type: "tag", tags: ["frio - IA", "reengajar depois"] },

      // ── Caminho 2: APRENDER IA → imagem + follow-ups
      { _id: "p2img", type: "media", mediaType: "image", file: "", caption: "Esse é o método que uso pra ensinar IA na prática 🤖 do zero ao aplicado." },
      { _id: "p2esp1", type: "wait", ms: 1_200_000 },
      { _id: "p2fu", type: "text", text: "E aí {{primeiro_nome}}, bateu a vontade de aprender IA? 🤖 Posso te mandar exatamente por onde começar 👇" },
      { _id: "p2esp2", type: "wait", ms: 10_800_000 },
      { _id: "p2pos", type: "text", text: "Deixa eu facilitar: quer que eu te mande o link da turma de IA com uma condição especial? Responde AQUI que eu te passo 🙌" },

      // ── Caminho 3: MENTORIA → material (PDF) + follow-ups
      { _id: "p3mid", type: "media", mediaType: "document", file: "", caption: "Baixa aqui o programa completo da mentoria 📄 (o que a gente faz junto, passo a passo)." },
      { _id: "p3esp1", type: "wait", ms: 1_200_000 },
      { _id: "p3fu", type: "text", text: "{{primeiro_nome}}, deu pra dar uma olhada no programa da mentoria? 🤝 Qualquer dúvida eu tiro por aqui mesmo." },
      { _id: "p3esp2", type: "wait", ms: 10_800_000 },
      { _id: "p3pos", type: "text", text: "As vagas de mentoria são limitadas por mês pra eu conseguir dar atenção individual de verdade. Quer garantir a sua? Me responde 🙏" },

      // ── Caminho 4: ATENDIMENTO HUMANO → botões + aviso + follow-ups
      { _id: "p4bot", type: "buttons", text: "Perfeito, {{primeiro_nome}}! Como você prefere falar? 👇", buttons: ["Falar agora no WhatsApp", "Me manda um resumo", "Prefiro por e-mail"] },
      { _id: "p4avisa", type: "notify", targets: [], text: "🙋 {{nome}} ({{telefone}}) quer FALAR DIRETO com você (caminho de atendimento humano do funil IA)." },
      { _id: "p4txt", type: "text", text: "Prontinho! Pode me chamar direto aqui 👉 https://wa.me/5511999999999 — quem responde sou eu mesmo, pode mandar sua dúvida 🙌" },
      { _id: "p4esp1", type: "wait", ms: 1_200_000 },
      { _id: "p4fu", type: "text", text: "{{primeiro_nome}}, consegui te ajudar? Se ainda quiser falar comigo, é só responder por aqui 👀" },
      { _id: "p4esp2", type: "wait", ms: 10_800_000 },
      { _id: "p4pos", type: "text", text: "Tô por aqui sempre que precisar 💚 Qualquer coisa sobre IA ou tráfego, é só chamar." },

      // ── Caminho 5: ME SEGUIR → adiciona ao grupo + follow-ups
      { _id: "p5add", type: "add_to_group", groupJid: "" },
      { _id: "p5txt", type: "text", text: "Te coloquei no meu grupo de conteúdo 🚀 e me segue no Insta também: @seu_instagram. Todo dia tem IA e tráfego por lá!" },
      { _id: "p5esp1", type: "wait", ms: 1_200_000 },
      { _id: "p5fu", type: "text", text: "{{primeiro_nome}}, curtiu o grupo? Se quiser, também te mostro como a gente pode trabalhar junto 👇" },
      { _id: "p5esp2", type: "wait", ms: 10_800_000 },
      { _id: "p5pos", type: "text", text: "Fica ligado no grupo hoje que vou postar um conteúdo matador de IA 🔥 não perde." },

      // ── Caminho 6: AGENDAR CALL → áudio + follow-ups
      { _id: "p6aud", type: "ptt", file: "" },
      { _id: "p6txt", type: "text", text: "Escolhe um horário aqui que eu já reservo pra gente 👉 https://calendly.com/seu-link 📅" },
      { _id: "p6esp1", type: "wait", ms: 1_200_000 },
      { _id: "p6fu", type: "text", text: "{{primeiro_nome}}, conseguiu escolher um horário pra nossa call? Me avisa que eu confirmo do meu lado 📅" },
      { _id: "p6esp2", type: "wait", ms: 10_800_000 },
      { _id: "p6pos", type: "text", text: "Se preferir, me manda 2 ou 3 horários que funcionam pra você que eu me viro pra encaixar 🙌" },
    ],
    edges: [
      // início (linear)
      { id: "x1", source: "trigger", target: "nota" },
      { id: "x2", source: "nota", target: "avisaVoce" },
      { id: "x3", source: "avisaVoce", target: "avisaGrupo" },
      { id: "x4", source: "avisaGrupo", target: "tagLead" },
      { id: "x5", source: "tagLead", target: "perguntaNome" },
      { id: "x6", source: "perguntaNome", target: "digita" },
      { id: "x7", source: "digita", target: "agente" },
      // agente → 6 saídas (uma por caminho)
      { id: "a-p1", source: "agente", sourceHandle: "p:Gestão de tráfego", target: "p1ptv" },
      { id: "a-p2", source: "agente", sourceHandle: "p:Aprender IA", target: "p2img" },
      { id: "a-p3", source: "agente", sourceHandle: "p:Mentoria", target: "p3mid" },
      { id: "a-p4", source: "agente", sourceHandle: "p:Atendimento humano", target: "p4bot" },
      { id: "a-p5", source: "agente", sourceHandle: "p:Me seguir", target: "p5add" },
      { id: "a-p6", source: "agente", sourceHandle: "p:Agendar call", target: "p6aud" },
      // caminho 1 + reengajamento 24h
      { id: "c1a", source: "p1ptv", target: "p1esp1" },
      { id: "c1b", source: "p1esp1", target: "p1fu" },
      { id: "c1c", source: "p1fu", target: "p1esp2" },
      { id: "c1d", source: "p1esp2", target: "p1pos" },
      { id: "c1e", source: "p1pos", target: "p1esp24" },
      { id: "c1f", source: "p1esp24", target: "agente2" },
      { id: "c1g", source: "agente2", sourceHandle: "p:Quero fechar", target: "a2avisa" },
      { id: "c1h", source: "agente2", sourceHandle: "p:Agora não", target: "a2tag" },
      // caminho 2
      { id: "c2a", source: "p2img", target: "p2esp1" },
      { id: "c2b", source: "p2esp1", target: "p2fu" },
      { id: "c2c", source: "p2fu", target: "p2esp2" },
      { id: "c2d", source: "p2esp2", target: "p2pos" },
      // caminho 3
      { id: "c3a", source: "p3mid", target: "p3esp1" },
      { id: "c3b", source: "p3esp1", target: "p3fu" },
      { id: "c3c", source: "p3fu", target: "p3esp2" },
      { id: "c3d", source: "p3esp2", target: "p3pos" },
      // caminho 4
      { id: "c4a", source: "p4bot", target: "p4avisa" },
      { id: "c4b", source: "p4avisa", target: "p4txt" },
      { id: "c4c", source: "p4txt", target: "p4esp1" },
      { id: "c4d", source: "p4esp1", target: "p4fu" },
      { id: "c4e", source: "p4fu", target: "p4esp2" },
      { id: "c4f", source: "p4esp2", target: "p4pos" },
      // caminho 5
      { id: "c5a", source: "p5add", target: "p5txt" },
      { id: "c5b", source: "p5txt", target: "p5esp1" },
      { id: "c5c", source: "p5esp1", target: "p5fu" },
      { id: "c5d", source: "p5fu", target: "p5esp2" },
      { id: "c5e", source: "p5esp2", target: "p5pos" },
      // caminho 6
      { id: "c6a", source: "p6aud", target: "p6txt" },
      { id: "c6b", source: "p6txt", target: "p6esp1" },
      { id: "c6c", source: "p6esp1", target: "p6fu" },
      { id: "c6d", source: "p6fu", target: "p6esp2" },
      { id: "c6e", source: "p6esp2", target: "p6pos" },
    ],
    layout: {
      trigger: { x: 80, y: 0 }, nota: { x: 400, y: -30 },
      avisaVoce: { x: 80, y: 110 }, avisaGrupo: { x: 80, y: 210 }, tagLead: { x: 80, y: 310 },
      perguntaNome: { x: 80, y: 410 }, digita: { x: 80, y: 520 }, agente: { x: 80, y: 620 },
      // caminho 1 (x=80)
      p1ptv: { x: 80, y: 800 }, p1esp1: { x: 80, y: 900 }, p1fu: { x: 80, y: 1000 }, p1esp2: { x: 80, y: 1100 },
      p1pos: { x: 80, y: 1200 }, p1esp24: { x: 80, y: 1300 }, agente2: { x: 80, y: 1410 },
      a2avisa: { x: 80, y: 1600 }, a2tag: { x: 380, y: 1600 },
      // caminho 2 (x=460)
      p2img: { x: 460, y: 800 }, p2esp1: { x: 460, y: 900 }, p2fu: { x: 460, y: 1000 }, p2esp2: { x: 460, y: 1100 }, p2pos: { x: 460, y: 1200 },
      // caminho 3 (x=840)
      p3mid: { x: 840, y: 800 }, p3esp1: { x: 840, y: 900 }, p3fu: { x: 840, y: 1000 }, p3esp2: { x: 840, y: 1100 }, p3pos: { x: 840, y: 1200 },
      // caminho 4 (x=1220)
      p4bot: { x: 1220, y: 800 }, p4avisa: { x: 1220, y: 900 }, p4txt: { x: 1220, y: 1000 }, p4esp1: { x: 1220, y: 1100 },
      p4fu: { x: 1220, y: 1200 }, p4esp2: { x: 1220, y: 1300 }, p4pos: { x: 1220, y: 1400 },
      // caminho 5 (x=1600)
      p5add: { x: 1600, y: 800 }, p5txt: { x: 1600, y: 900 }, p5esp1: { x: 1600, y: 1000 }, p5fu: { x: 1600, y: 1100 }, p5esp2: { x: 1600, y: 1200 }, p5pos: { x: 1600, y: 1300 },
      // caminho 6 (x=1980)
      p6aud: { x: 1980, y: 800 }, p6txt: { x: 1980, y: 900 }, p6esp1: { x: 1980, y: 1000 }, p6fu: { x: 1980, y: 1100 }, p6esp2: { x: 1980, y: 1200 }, p6pos: { x: 1980, y: 1300 },
    },
  },
  {
    id: "boas-vindas-compra",
    name: "Boas-vindas pós-compra",
    emoji: "🎉",
    desc: "Assim que a compra é aprovada, dá as boas-vindas e entrega o acesso no privado.",
    tags: ["Vendas"],
    trigger: "purchase_approved",
    steps: [
      { type: "presence", presence: "composing", ms: 2000 },
      { type: "text", text: "Oi {{primeiro_nome}}! 🎉 Sua compra do *{{produto}}* foi aprovada. Seja muito bem-vindo(a)!" },
      { type: "wait", ms: 2500 },
      { type: "text", text: "Aqui está seu acesso 👉 {{link}}\n\nQualquer dúvida, é só me chamar por aqui. 💚" },
    ],
  },
  {
    id: "entrega-acesso",
    name: "Entrega de acesso",
    emoji: "✅",
    desc: "Mensagem enxuta de confirmação + link de acesso logo após o pagamento.",
    tags: ["Vendas"],
    trigger: "purchase_approved",
    steps: [
      { type: "text", text: "✅ Pagamento confirmado, {{primeiro_nome}}! Seu *{{produto}}* já está liberado." },
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "👉 Acesse aqui: {{link}}\n\nSalva meu contato pra não perder nenhum aviso. 😉" },
    ],
  },
  {
    id: "recuperar-pix",
    name: "Recuperar PIX (3 toques)",
    emoji: "💠",
    desc: "PIX gerado e não pago: sequência de 3 lembretes com o código, espaçados no tempo.",
    tags: ["Recuperação"],
    trigger: "pix_generated",
    steps: [
      { type: "presence", presence: "composing", ms: 2000 },
      { type: "text", text: "Oi {{primeiro_nome}}! Vi que você gerou o PIX do *{{produto}}* mas ainda não caiu aqui. Ficou com alguma dúvida? 🤔" },
      { type: "wait", ms: 900000 },
      { type: "text", text: "⏰ Ainda dá tempo! É só copiar e colar o PIX:\n\n{{pix}}" },
      { type: "wait", ms: 1800000 },
      { type: "text", text: "Última chamada, {{primeiro_nome}} 🙏 A condição pode sair do ar. Bora garantir? {{link}}" },
    ],
  },
  {
    id: "recuperar-boleto",
    name: "Recuperar boleto",
    emoji: "🧾",
    desc: "Boleto gerado e em aberto: lembra do valor e reenvia o link 1h depois.",
    tags: ["Recuperação"],
    trigger: "boleto_generated",
    steps: [
      { type: "text", text: "Oi {{primeiro_nome}}! Seu boleto do *{{produto}}* ({{valor}}) ainda está em aberto." },
      { type: "wait", ms: 3600000 },
      { type: "text", text: "📄 Paga rapidinho pra garantir: {{link}}\n\nAssim que compensar, o acesso é liberado automático. 😉" },
    ],
  },
  {
    id: "carrinho-abandonado",
    name: "Carrinho abandonado",
    emoji: "🛒",
    desc: "Quem abandonou o carrinho recebe um empurrãozinho com o link de volta.",
    tags: ["Recuperação"],
    trigger: "cart_abandoned",
    steps: [
      { type: "presence", presence: "composing", ms: 2000 },
      { type: "text", text: "Ei {{primeiro_nome}}, você esqueceu o *{{produto}}* no carrinho! 🛒" },
      { type: "wait", ms: 600000 },
      { type: "text", text: "Ficou com alguma dúvida? Posso te ajudar a finalizar agora 👉 {{link}}" },
    ],
  },
  {
    id: "checkout-ajuda",
    name: "Ajuda no checkout",
    emoji: "🛍️",
    desc: "Iniciou a compra e travou: oferece ajuda pra destravar a conversão.",
    tags: ["Recuperação"],
    trigger: "checkout_started",
    steps: [
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "Oi {{primeiro_nome}}! Vi que você começou a compra do *{{produto}}*. Deu tudo certo aí ou precisa de uma ajudinha? 🙂" },
    ],
  },
  {
    id: "pedir-avaliacao",
    name: "Peça uma avaliação",
    emoji: "⭐",
    desc: "Dois dias depois da compra, pede um feedback do cliente (prova social).",
    tags: ["Pós-venda"],
    trigger: "purchase_approved",
    steps: [
      { type: "wait", ms: 172800000 },
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "Oi {{primeiro_nome}}! Já deu pra aproveitar o *{{produto}}*? 😊 Se puder, me conta rapidinho o que achou — sua opinião ajuda demais! ⭐" },
    ],
  },
  {
    id: "upsell-pos-compra",
    name: "Upsell pós-compra",
    emoji: "🚀",
    desc: "Um dia após a compra, oferece um produto complementar com condição de cliente.",
    tags: ["Pós-venda"],
    trigger: "purchase_approved",
    steps: [
      { type: "wait", ms: 86400000 },
      { type: "text", text: "{{primeiro_nome}}, quem levou o *{{produto}}* costuma amar isto também 👇" },
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "Separei uma condição especial só pra quem já é cliente 👉 [coloque aqui o link da oferta]" },
    ],
  },
  {
    id: "renovacao-atrasada",
    name: "Cobrança de renovação",
    emoji: "🔁",
    desc: "Pagamento de assinatura atrasado: avisa e manda o link pra não perder o acesso.",
    tags: ["Assinatura"],
    trigger: "payment_delayed",
    steps: [
      { type: "text", text: "Oi {{primeiro_nome}}! A renovação do seu *{{produto}}* está pendente. Pra não perder o acesso, é só regularizar aqui 👉 {{link}} 🙏" },
    ],
  },
  {
    id: "retencao-cancelamento",
    name: "Retenção pós-cancelamento",
    emoji: "💔",
    desc: "Assinatura cancelada: entende o motivo e oferece uma condição pra voltar.",
    tags: ["Assinatura"],
    trigger: "subscription_canceled",
    steps: [
      { type: "presence", presence: "composing", ms: 2000 },
      { type: "text", text: "{{primeiro_nome}}, vi que você cancelou o *{{produto}}* 😢 Posso te perguntar o que faltou? Se for algo que eu resolva, quero muito te ajudar." },
      { type: "wait", ms: 3000 },
      { type: "text", text: "E se quiser voltar, deixei uma condição especial pra você 👉 [coloque aqui o link]" },
    ],
  },
  {
    id: "ptv-abertura",
    name: "Vídeo bolinha (PTV) de abertura",
    emoji: "🎥",
    desc: "Abre com um texto curto e um vídeo bolinha (PTV) — grave/anexe o seu vídeo no builder. Fecha com o link. (Motor LITE / não-oficial.)",
    tags: ["Atendimento"],
    trigger: "checkout_started",
    steps: [
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "Oi {{primeiro_nome}}! Deixa eu te mostrar uma coisa rapidinho 👇" },
      { type: "ptv", file: "" },
      { type: "text", text: "Bora? É só clicar aqui 👉 {{link}}" },
    ],
  },
  {
    id: "audio-ptv",
    name: "Áudio + vídeo bolinha (PTV)",
    emoji: "🎙️",
    desc: "Manda um áudio de voz e logo um vídeo bolinha — cria conexão rápida. Anexe o áudio e o vídeo no builder. (LITE / não-oficial.)",
    tags: ["Atendimento"],
    trigger: "checkout_started",
    steps: [
      { type: "ptt", file: "" },
      { type: "ptv", file: "" },
      { type: "text", text: "Qualquer dúvida é só me chamar por aqui, {{primeiro_nome}} 💚" },
    ],
  },
  {
    id: "nome-ptv-link",
    name: "Chama pelo nome + PTV + link",
    emoji: "🙋",
    desc: "Texto personalizado com o primeiro nome do lead, um vídeo bolinha e o link no fim. Anexe o vídeo no builder. (LITE / não-oficial.)",
    tags: ["Atendimento"],
    trigger: "checkout_started",
    steps: [
      { type: "presence", presence: "composing", ms: 1500 },
      { type: "text", text: "Oi {{primeiro_nome}}, tudo bem? 😊 Separei uma mensagem rápida pra você:" },
      { type: "ptv", file: "" },
      { type: "text", text: "Toma o link que te falei 👉 [cole aqui seu link]" },
    ],
  },
  {
    id: "ptv-imagem-nome",
    name: "PTV + imagem com o NOME do lead (Nifty)",
    emoji: "🖼️",
    desc: "Texto + vídeo bolinha + uma IMAGEM personalizada que já vem com o nome do lead escrito nela (via niftyimages). O motor troca {{nome}} na URL. Anexe o vídeo no builder.",
    tags: ["Atendimento"],
    trigger: "checkout_started",
    steps: [
      { type: "text", text: "Oi {{primeiro_nome}}! Fiz uma coisa especial pra você, olha só 👇" },
      { type: "ptv", file: "" },
      { type: "media", mediaType: "image", file: "https://img1.niftyimages.com/jflh/_vd7/po6p?name={{nome}}", caption: "Feito pra você, {{primeiro_nome}} 🎨" },
    ],
  },
  {
    id: "agente-anna",
    name: "Agente Anna (IA) — atendimento com caminhos",
    emoji: "🤖",
    desc: "A Anna conversa com o lead, qualifica e escolhe o caminho certo (página da agência, falar com você, curso). Igual ao fluxo do Sua Empresa, agora no WhatsApp. Usa sua chave OpenAI.",
    tags: ["IA", "Atendimento", "Vendas"],
    trigger: "keyword",
    keyword: "atendimento",
    steps: [
      {
        type: "ai_agent",
        systemPrompt:
          "Você é a Anna, atendente da Sua Empresa.\n" +
          "Esta pessoa te chamou no WhatsApp — é um lead orgânico e quente. Comece perguntando no que pode ajudar.\n" +
          "Fale de forma leve, humana e direta, como um atendente real.\n" +
          "IMPORTANTE: converse e entenda a necessidade ANTES de mandar qualquer link. Faça pelo menos uma pergunta de qualificação. " +
          "Só escolha um caminho quando tiver CERTEZA do que a pessoa quer — se estiver em dúvida, pergunte.",
        maxTurns: 10,
        keepAlive: true,
        paths: [
          {
            name: "Link Página",
            description: "Quando a pessoa quer contratar a agência de marketing para gestão de tráfego.",
            reply: "Aqui está o site da agência 👉 https://agenciaborapracima.com.br",
          },
          {
            name: "Contato Admin",
            description:
              "Quando a pessoa quer falar direto com o dono: pedir contato, negociar, dúvida pessoal, ou pede atendimento humano. " +
              "PRIORIDADE: pedido de humano vem antes de qualquer link ou venda.",
            reply: "Deixa eu te passar pro dono pra entender melhor o que você precisa 🙌 chama ele aqui: https://wa.me/5511999999999",
          },
          {
            name: "Curso Claude Code",
            description: "Quando a pessoa quer aprender Claude Code + Google Ads.",
            reply: "Toma o link do curso 👉 https://pay.kiwify.com.br/SEU-CHECKOUT",
          },
        ],
      },
      { type: "text", text: "Qualquer coisa é só me chamar de novo por aqui, {{primeiro_nome}} 💚" },
    ],
  },
  {
    id: "adicionar-ao-grupo",
    name: "Adicionar comprador ao grupo VIP",
    emoji: "👥",
    desc: "Compra aprovada → dá as boas-vindas e adiciona o cliente a um grupo (escolha o grupo no builder).",
    tags: ["Grupo", "Vendas"],
    trigger: "purchase_approved",
    steps: [
      { type: "text", text: "🎉 Bem-vindo(a) ao clube, {{primeiro_nome}}! Já vou te colocar no nosso grupo exclusivo." },
      { type: "add_to_group", groupJid: "" },
    ],
  },
];
