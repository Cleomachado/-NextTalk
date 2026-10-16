// Taxonomia canônica de eventos — as 8 plataformas de venda mapeiam para ISTO.
// O motor de automação só enxerga estes nomes, nunca os nomes crus de cada plataforma.
export type CanonicalEvent =
  | "purchase_approved"
  | "purchase_refused"
  | "pix_generated"
  | "boleto_generated"
  | "cart_abandoned"
  | "checkout_started"
  | "refund"
  | "chargeback"
  | "subscription_canceled"
  | "subscription_renewed"
  | "payment_delayed"
  | "primeiro_contato" // gatilho de atendimento (inbound) — motor ainda NÃO gera este evento
  | "template_reply"   // cliente respondeu/clicou num TEMPLATE enviado (o gatilho do disparo em massa)
  | "keyword" // palavra-chave recebida (inbound) — dispara pelo /webhooks/uazapi
  // Gatilhos de GRUPO (inbound): alguém marcou o número num grupo, ou escreveu a palavra-chave lá.
  | "group_mention"
  | "group_keyword"
  // "checkout" NÃO é um evento que chega: é o GATILHO SWITCH do builder — um nó que escuta vários
  // eventos de venda (`automation.eventos`) e dá uma saída por evento. Fica aqui porque o campo
  // `trigger` da automação usa este mesmo tipo.
  | "checkout"
  // Lead entrou num TESTE GRÁTIS num site parceiro (ex.: seudominio.com.br) e o AFILIADO precisa saber
  // na hora. Chega pelo /webhooks/trial. ⚠️ Aqui o `contact` é o AFILIADO (é ele quem recebe o
  // WhatsApp); os dados do lead vêm em `fields` ({{lead_nome}}, {{lead_telefone}}…).
  | "lead_trial"
  // Lead se AFILIOU pelo popup do site (afiliados.html). ⚠️ Aqui o `contact` é o PRÓPRIO LEAD
  // (ele recebe o WhatsApp de boas-vindas). Vem com {{grupo}} e {{acesso_link}} (30 dias grátis).
  | "novo_afiliado"
  // Gatilho GENÉRICO por webhook: qualquer site/formulário/sistema chama a URL do fluxo e ele
  // dispara. Os campos do JSON viram variáveis ({{nome}}, {{email}}…). É o "conector universal".
  | "webhook"
  // Gatilho por HORÁRIO/RECORRÊNCIA (cron): dispara sozinho pra um destino fixo (telefone ou
  // grupo) configurado no próprio gatilho — sem evento de fora, sem lead. É o equivalente do
  // "Schedule Trigger" do n8n (pedido do dono, 25/08, pra importar o workflow dele 1:1).
  | "schedule"
  | "unknown";

export interface NormalizedEvent {
  platform: string; // "kiwify", "hotmart", ...
  event: CanonicalEvent;
  eventId: string; // para idempotência/dedup
  contact: {
    name: string;
    firstName: string;
    phone: string | null; // já normalizado (E.164 sem +, ex.: 5511999999999)
    email?: string;
  };
  // Variáveis extras do evento pro texto do fluxo ({{lead_nome}}, {{afiliado_slug}}…). Elas se
  // juntam aos campos salvos do contato na hora de montar a mensagem.
  fields?: Record<string, string>;
  // Mensagem do lead que a resposta deve MARCAR/citar (vem quando ele mandou várias de uma vez).
  // Fica no evento porque a abertura do Agente IA acontece lá dentro do motor, longe do inbound.
  replyToId?: string;
  // O que o lead ACABOU de escrever, pra entrar como 1ª fala da conversa com o Agente IA. Fica FORA
  // de `fields` de propósito: `fields` é gravado na ficha do contato, e isto é contexto de conversa,
  // não dado do lead. Sem isto a Atendente IA responderia "oi, como posso ajudar?" pra quem já
  // tinha perguntado o preço — e a pessoa teria que repetir a pergunta.
  falaInicial?: string;
  product?: { id?: string; name?: string };
  amount?: number; // em reais (bruto = charge_amount / 100)
  currency?: string;
  // Plano/oferta (Kiwify): plano da assinatura + código da oferta (checkout_link).
  plan?: { id?: string | null; name?: string | null; offerCode?: string | null } | null;
  // Financeiro da venda (pro dashboard de ganhos): taxa da Kiwify e o LÍQUIDO do produtor (Admin).
  // my_commission já desconta a taxa E a comissão do afiliado — é o "seus ganhos" real.
  fees?: { kiwify?: number | null; producerNet?: number | null } | null;
  // Afiliado da venda (quando veio por um afiliado da Kiwify) — alimenta o painel/ranking de afiliados.
  affiliate?: { id?: string | null; name?: string | null; email?: string | null; commission?: number | null } | null;
  // UTM/origem da venda (utm_source/medium/campaign/content) — pra ver de onde veio no painel.
  // term/sck entram porque a Kiwify DEVOLVE esses campos e a gente jogava fora. O sck é o slot
  // onde cabe o ad_id da Meta — sem ele dá pra saber a campanha, mas não QUAL anúncio vendeu.
  tracking?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null; sck?: string | null } | null;
  links?: { checkout?: string; boleto?: string; pix?: string };
  pixCode?: string;
  raw: unknown;
}
