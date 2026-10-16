// ══ PERFIL ADVOCACIA: contrato e procuração a partir da conversa ═══════════════════════════════
// Pedido do dono (04/10): cliente de advocacia (Escritório Exemplo) ganha no chat o botão "Gerar
// contrato e procuração". O ZapConverte NÃO guarda modelo .docx nem fala com a ZapSign: quem
// gera é o sistema do escritório (POST /api/contratos, ver docs/ZAPSIGN.md do Escritório Virtual),
// que devolve o link de assinatura. Aqui fica só:
//   • o PERFIL do workspace ("advocacia"), que o super admin marca em Clientes;
//   • o endereço + token da API de contratos (token cifrado, nunca volta pro painel);
//   • a extração dos dados da conversa (mesma IA do "guardar dados" do Agente IA);
//   • a chamada à API do escritório e o status do contrato.
//
// ⚠️ A UI esconder o botão NÃO é controle: todo endpoint confere o perfil no motor.
import { getCachedFor, saveConfigFor } from "./config-store.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { getCurrentWorkspace } from "./workspace-context.js";
import { getAgentSession, getContactFields, getContactName, setContactField } from "./repo.js";
import { extractFields } from "./engine/ai.js";
import { destinoPublicoOk, destinoResolveParaPublico, fetchSeguro } from "./lib/rede-segura.js";

export const PERFIS = ["advocacia"] as const;
export type Perfil = (typeof PERFIS)[number];

const CHAVE_PERFIL = "perfil-negocio";
const CHAVE_CONFIG = "advocacia-contratos";

interface ConfigContratos { url?: string; tokenEnc?: string; last4?: string; updatedAt?: string }

export function perfilDoWorkspace(wsId: string): Perfil | null {
  const v = getCachedFor<string>(wsId, CHAVE_PERFIL);
  return PERFIS.includes(v as Perfil) ? (v as Perfil) : null;
}
export async function salvarPerfil(wsId: string, perfil: string | null): Promise<Perfil | null> {
  const p = PERFIS.includes(perfil as Perfil) ? (perfil as Perfil) : null;
  await saveConfigFor(wsId, CHAVE_PERFIL, p);
  return p;
}

// Os dados que o contrato e a procuração pedem — mesmos nomes do modelo do Agente IA
// (FlowBuilder DADOS_CONTRATO), pra a ficha preenchida pela Anna servir aqui também.
export const CAMPOS_CONTRATO: Array<{ variable: string; rotulo: string; hint?: string; obrigatorio?: boolean }> = [
  { variable: "nome_completo", rotulo: "Nome completo", hint: "nome completo da pessoa", obrigatorio: true },
  { variable: "cpf", rotulo: "CPF", obrigatorio: true },
  { variable: "rg", rotulo: "RG" },
  { variable: "estado_civil", rotulo: "Estado civil", obrigatorio: true },
  { variable: "profissao", rotulo: "Profissão", obrigatorio: true },
  { variable: "nacionalidade", rotulo: "Nacionalidade" },
  { variable: "endereco", rotulo: "Endereço", hint: "rua, número, complemento e bairro", obrigatorio: true },
  { variable: "cep", rotulo: "CEP" },
  { variable: "cidade", rotulo: "Cidade", obrigatorio: true },
  { variable: "uf", rotulo: "UF", hint: "sigla do estado, 2 letras", obrigatorio: true },
  { variable: "email", rotulo: "E-mail" },
];

function cfg(wsId: string): ConfigContratos {
  return getCachedFor<ConfigContratos>(wsId, CHAVE_CONFIG) ?? {};
}
const soDig = (s: string) => String(s ?? "").replace(/\D/g, "");

// O que o painel precisa saber (nunca o token).
export function estadoAdvocacia(wsId: string) {
  const c = cfg(wsId);
  return {
    perfil: perfilDoWorkspace(wsId),
    url: c.url ?? "",
    configurado: !!(c.url && c.tokenEnc),
    last4: c.last4 ?? null,
    campos: CAMPOS_CONTRATO.map(({ variable, rotulo, obrigatorio }) => ({ variable, rotulo, obrigatorio: !!obrigatorio })),
  };
}

export async function salvarConfig(wsId: string, b: { url?: unknown; token?: unknown }): Promise<{ erro?: string }> {
  const atual = cfg(wsId);
  const url = b.url == null ? atual.url ?? "" : String(b.url).trim();
  let alvo: URL;
  try { alvo = new URL(url); } catch { return { erro: "endereço inválido — cole o endereço completo, começando com https://" }; }
  if (alvo.protocol !== "https:") return { erro: "o endereço precisa começar com https://" };
  if (!destinoPublicoOk(alvo)) return { erro: "esse endereço é de rede interna — use o endereço público do sistema" };
  const token = b.token == null ? "" : String(b.token).trim();
  if (token && token.length < 8) return { erro: "token curto demais — cole o token completo" };
  await saveConfigFor(wsId, CHAVE_CONFIG, {
    url: alvo.toString(),
    tokenEnc: token ? encryptSecret(token) : atual.tokenEnc,
    last4: token ? token.slice(-4) : atual.last4,
    updatedAt: new Date().toISOString(),
  } satisfies ConfigContratos);
  return {};
}
export async function removerConfig(wsId: string): Promise<void> {
  await saveConfigFor(wsId, CHAVE_CONFIG, null);
}

// Dados pra pré-preencher o formulário. Fontes, da mais forte pra mais fraca:
//   1. IA sobre as falas do lead (as que o painel mostra + as da conversa com o Agente IA, que
//      trazem o áudio já transcrito);
//   2. ficha do contato (o "guardar dados" do Agente IA grava lá com os mesmos nomes);
//   3. nome salvo do contato, só pro nome completo.
// Roda DENTRO do contexto do workspace (runWithWorkspace).
export async function extrairDados(phone: string, falasDoPainel: string[]): Promise<{ dados: Record<string, string>; origem: Record<string, "conversa" | "ficha"> }> {
  const sessao = await getAgentSession(phone).catch(() => null);
  const daSessao = (sessao?.history ?? []).filter((h) => h.role === "user").map((h) => h.content);
  // Sessão primeiro, painel depois: o painel tem as falas mais recentes e "a última versão vence".
  const falas = [...daSessao, ...falasDoPainel].map((f) => String(f ?? "").trim()).filter(Boolean).slice(-200);
  const achados = (await extractFields(falas, CAMPOS_CONTRATO).catch(() => null)) ?? {};
  const ficha = await getContactFields(phone).catch(() => ({} as Record<string, string>));
  const nomeSalvo = await getContactName(phone).catch(() => "");
  const dados: Record<string, string> = {};
  const origem: Record<string, "conversa" | "ficha"> = {};
  for (const c of CAMPOS_CONTRATO) {
    const daConversa = achados[c.variable];
    const daFicha = String(ficha[c.variable] ?? "").trim();
    if (daConversa) { dados[c.variable] = daConversa; origem[c.variable] = "conversa"; }
    else if (daFicha) { dados[c.variable] = daFicha; origem[c.variable] = "ficha"; }
    else dados[c.variable] = "";
  }
  // Nome do WhatsApp só serve se parece nome completo (duas palavras ou mais, sem dígito).
  if (!dados.nome_completo && /^\D+\s+\D+$/.test(nomeSalvo.trim())) { dados.nome_completo = nomeSalvo.trim(); origem.nome_completo = "ficha"; }
  return { dados, origem };
}

async function chamaEscritorio(wsId: string, metodo: "GET" | "POST", caminhoExtra: string, params: Record<string, string>) {
  const c = cfg(wsId);
  const token = c.tokenEnc ? decryptSecret(c.tokenEnc) ?? "" : "";
  if (!c.url || !token) return { status: 0, json: { ok: false, motivo: "nao_configurado", mensagem: "Configure o endereço e o token da API de contratos em Configurações." } as any };
  const alvo = new URL(c.url);
  if (caminhoExtra) alvo.pathname = alvo.pathname.replace(/\/+$/, "") + caminhoExtra;
  if (!destinoPublicoOk(alvo) || !(await destinoResolveParaPublico(alvo))) {
    return { status: 0, json: { ok: false, motivo: "endereco_bloqueado", mensagem: "O endereço configurado aponta pra rede interna." } as any };
  }
  const headers: Record<string, string> = { authorization: "Bearer " + token };
  let body: string | undefined;
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) alvo.searchParams.set(k, v);
  else { headers["content-type"] = "application/json"; body = JSON.stringify(params); }
  try {
    // A ZapSign cria 2 documentos por envelope: dá folga pro escritório responder.
    const r = await fetchSeguro(alvo, { method: metodo, headers, body, signal: AbortSignal.timeout(45_000) });
    const texto = (await r.text().catch(() => "")).slice(0, 20_000);
    let json: any;
    try { json = JSON.parse(texto); } catch { json = { ok: false, motivo: "resposta_invalida", mensagem: `O sistema de contratos respondeu ${r.status} sem JSON.` }; }
    if (r.status === 401 || r.status === 403) json = { ok: false, motivo: "token_recusado", mensagem: "O sistema de contratos recusou o token. Confira o token em Configurações." };
    return { status: r.status, json };
  } catch (e: any) {
    const tempo = e?.name === "TimeoutError";
    return { status: 0, json: { ok: false, motivo: tempo ? "tempo_esgotado" : "falha_rede", mensagem: tempo ? "O sistema de contratos demorou demais pra responder. Tente de novo em instantes: o mesmo dado não gera contrato duplicado." : "Não consegui falar com o sistema de contratos." } };
  }
}

// Gera (ou recupera — o escritório devolve o mesmo link pra dados iguais) o contrato + procuração.
export async function gerarContrato(phone: string, dadosBrutos: Record<string, unknown>, modelo: "trabalhista" | "previdenciario" = "trabalhista") {
  const wsId = getCurrentWorkspace();
  const dados: Record<string, string> = {};
  for (const c of CAMPOS_CONTRATO) dados[c.variable] = String(dadosBrutos?.[c.variable] ?? "").trim().slice(0, 300);
  const faltam = CAMPOS_CONTRATO.filter((c) => c.obrigatorio && !dados[c.variable]).map((c) => c.rotulo);
  if (faltam.length) return { ok: false, motivo: "dados_incompletos", mensagem: "Faltam: " + faltam.join(", ") + "." };
  const telefone = soDig(phone);
  const { json } = await chamaEscritorio(wsId, "POST", "", {
    telefone, nome: dados.nome_completo, ...Object.fromEntries(Object.entries(dados).filter(([k, v]) => v && k !== "nome_completo")),
    modelo,
  });
  // Guarda na ficha o que foi usado (a próxima geração já abre preenchida) e o link/estado.
  for (const [k, v] of Object.entries(dados)) if (v) await setContactField(phone, k, v).catch(() => {});
  if (json?.ok && json.link) {
    await setContactField(phone, "contrato_link", String(json.link)).catch(() => {});
    await setContactField(phone, "contrato_status", String(json.status ?? "aguardando_assinatura")).catch(() => {});
  }
  console.log(`⚖️ contrato ${json?.ok ? "gerado" : "recusado (" + (json?.motivo ?? "?") + ")"} · …${telefone.slice(-4)} · ws ${wsId}`);
  return json;
}

export async function statusContrato(phone: string) {
  const { json } = await chamaEscritorio(getCurrentWorkspace(), "GET", "/status", { telefone: soDig(phone) });
  return json;
}
