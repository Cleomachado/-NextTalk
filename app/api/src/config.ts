import { fileURLToPath } from "node:url";

// Carrega variáveis de ambiente do .env (Node 24 tem loadEnvFile nativo — sem dependência).
// fileURLToPath decodifica corretamente espaços no caminho (ex.: "Oxi Zap").
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // sem .env: usa o ambiente do processo (ex.: em produção via Docker/Swarm)
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3333),
  uazapi: {
    url: required("UAZAPI_URL").replace(/\/+$/, ""),
    token: required("UAZAPI_TOKEN"),
    // Admin token do servidor UazAPI — cria/gerencia instâncias LITE (número novo por QR).
    adminToken: process.env.UAZAPI_ADMIN_TOKEN ?? "",
  },
  // Protege os endpoints /admin/* (usados pelo painel). Por padrão reaproveita o token
  // da instância; defina ADMIN_TOKEN pra ter um segredo dedicado (recomendado).
  adminToken: process.env.ADMIN_TOKEN || required("UAZAPI_TOKEN"),
  secrets: {
    kiwifyWebhookToken: process.env.KIWIFY_WEBHOOK_TOKEN ?? "",
    hotmartHottok: process.env.HOTMART_HOTTOK ?? "",
  },
  // App da Meta do ZapConverte como TECH PROVIDER (nível plataforma, não por cliente): é ele que
  // permite o "Conectar com a Meta" em 1 clique (Embedded Signup). Sem estas 3 variáveis o botão
  // nem aparece no painel — o cliente segue no passo a passo manual.
  metaApp: {
    appId: process.env.META_APP_ID ?? "",
    appSecret: process.env.META_APP_SECRET ?? "",
    configId: process.env.META_ES_CONFIG_ID ?? "", // id da configuração do fluxo de cadastro
  },
  // OAuth do Google POR USUÁRIO (login com consentimento) — usado pelo nó "Google Contatos", que
  // grava o lead no Google Contatos PESSOAL da pessoa. Diferente da conta de serviço (google-sa,
  // usada em Planilha/Agenda): Contatos pessoal o Google só libera via consentimento OAuth. Sem
  // estas variáveis o conector nem aparece. Crie um "OAuth client (Web application)" no Google
  // Cloud Console, com a URL de callback abaixo autorizada.
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    // Precisa bater EXATAMENTE com a "Authorized redirect URI" cadastrada no OAuth client.
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT ?? "https://app.seudominio.com.br/google/oauth/callback",
  },
  anthropic: {
    // Chave da Claude API (resumo de grupo). Sem ela, o resumo fica desligado.
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.SUMMARY_MODEL ?? "claude-opus-4-8",
    // Montar um fluxo inteiro é raro e vale muito mais que um resumo diário — usa um modelo mais
    // forte que o do resumo. Se a conta não tiver acesso, cai sozinho no modelo do resumo.
    flowModel: process.env.FLOW_MODEL ?? "claude-sonnet-5",
  },
  delay: {
    minMs: Number(process.env.STEP_DELAY_MIN_MS ?? 1500),
    maxMs: Number(process.env.STEP_DELAY_MAX_MS ?? 4000),
  },
};

// Atraso aleatório (anti-ban): nunca fixo.
export function jitterDelay(): number {
  const { minMs, maxMs } = config.delay;
  return Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
}
