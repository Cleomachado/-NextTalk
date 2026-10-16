// PERMISSÕES FINAS POR MEMBRO — modelo puro, sem banco e sem e-mail de propósito.
// Fica num módulo próprio porque saas.ts (sessão) e team.ts (equipe) precisam dos dois lados:
// se morasse em team.ts, saas↔team viraria ciclo de importação, e ciclo em ESM quebra calado
// quando o primeiro acesso acontece antes do módulo terminar de carregar.
// O dono decide, pessoa a pessoa, QUAIS PÁGINAS ela abre e QUAIS CONTAS (números) ela enxerga.
// Ex.: um funcionário só de Templates da API Oficial, sem Painel, sem Lite, sem Disparador.
//
// Como o servidor aplica (ver o preHandler em server.ts):
//   • cada área reivindica prefixos de rota; uma rota só passa se ALGUMA área liberada a reivindica;
//   • rota que nenhuma área reivindica é encanamento compartilhado (/app/me, /app/accounts…) e passa;
//   • `paginas: null` = sem restrição (é o que todo membro antigo tem — nada muda pra quem já existe).
// As travas antigas (DONO_ONLY e a de atendente) continuam valendo POR CIMA desta.
export interface Permissoes { paginas?: string[] | null; contas?: string[] | null }

export const AREAS_PERMISSAO: Array<{ id: string; rotulo: string; grupo: string; rotas: string[] }> = [
  { id: "/",                    rotulo: "Painel (visão geral)",     grupo: "Operação",      rotas: ["/app/stats", "/app/events", "/app/flow-totals", "/app/flow-stats"] },
  { id: "/contatos",            rotulo: "Contatos e funil",         grupo: "Operação",      rotas: ["/app/contacts", "/app/crm", "/app/tags"] },
  { id: "/integracoes",         rotulo: "Integrações",              grupo: "Operação",      rotas: ["/app/asaas", "/app/google", "/app/ai"] },
  { id: "/atendente",           rotulo: "Atendente IA",             grupo: "Operação",      rotas: ["/app/atendente"] },
  { id: "/resumos",             rotulo: "Resumos e relatórios",     grupo: "Operação",      rotas: ["/app/resumos"] },
  { id: "/logs",                rotulo: "Logs ao vivo",             grupo: "Operação",      rotas: ["/app/logs"] },
  { id: "/ao-vivo",             rotulo: "WPP ao Vivo (conversas)",  grupo: "WhatsApp Lite", rotas: ["/app/inbox", "/app/lite"] },
  { id: "/fluxos",              rotulo: "Fluxos",                   grupo: "WhatsApp Lite", rotas: ["/app/automations", "/app/flow-", "/app/code/testar"] },
  { id: "/lembretes",           rotulo: "Lembretes",                grupo: "WhatsApp Lite", rotas: ["/app/reminders"] },
  { id: "/oficial/inbox",       rotulo: "WPP Api (conversas)",      grupo: "Meta · API Oficial", rotas: ["/app/oficial/chats", "/app/oficial/messages", "/app/oficial/send"] },
  { id: "/oficial",             rotulo: "Conexão e perfil da conta", grupo: "Meta · API Oficial", rotas: ["/app/meta", "/app/oficial/perfil", "/app/oficial/diagnostico"] },
  { id: "/oficial/fluxos",      rotulo: "Fluxos (API)",             grupo: "Meta · API Oficial", rotas: ["/app/oficial/inbox-fluxo"] },
  { id: "/oficial/templates",   rotulo: "Templates Meta (criar e enviar pra aprovação)", grupo: "Meta · API Oficial", rotas: ["/app/meta/templates", "/app/oficial/templates"] },
  { id: "/oficial/disparador",  rotulo: "Disparador (envio em massa)", grupo: "Meta · API Oficial", rotas: ["/app/oficial/disparo"] },
  { id: "/oficial/formularios", rotulo: "Formulários (Flows)",      grupo: "Meta · API Oficial", rotas: ["/app/oficial/flows"] },
  { id: "/oficial/metricas",    rotulo: "Métricas da API",          grupo: "Meta · API Oficial", rotas: ["/app/oficial/metricas"] },
  { id: "/meus-sites",          rotulo: "Meus sites",               grupo: "Vendas & Rede", rotas: ["/app/afiliado"] },
];
const IDS_AREA = new Set(AREAS_PERMISSAO.map((a) => a.id));

// Guarda só o que a gente reconhece: id inventado no corpo da requisição não vira permissão.
export function normalizaPermissoes(raw: any): Permissoes | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Permissoes = {};
  if (Array.isArray(raw.paginas)) out.paginas = [...new Set<string>(raw.paginas.map((x: any) => String(x)))].filter((x) => IDS_AREA.has(x)).slice(0, 40);
  if (Array.isArray(raw.contas)) out.contas = [...new Set<string>(raw.contas.map((x: any) => String(x).slice(0, 60)))].slice(0, 20);
  return Object.keys(out).length ? out : null;
}
export function lePermissoes(txt: unknown): Permissoes | null {
  if (!txt) return null;
  try { return normalizaPermissoes(JSON.parse(String(txt))); } catch { return null; }
}

// A rota pode rodar com estas permissões? Regra em 3 linhas (a justificativa está no topo).
export function rotaLiberada(url: string, p: Permissoes | null): boolean {
  const permitidas = p?.paginas;
  if (!permitidas) return true;                       // sem restrição
  const donas = AREAS_PERMISSAO.filter((a) => a.rotas.some((r) => url === r || url.startsWith(r)));
  if (!donas.length) return true;                     // encanamento compartilhado
  return donas.some((a) => permitidas.includes(a.id));
}

