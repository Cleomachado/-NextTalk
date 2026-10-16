"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, TrialBanner } from "@/components/Auth";
import { ClientHome } from "@/components/ClientHome";
import { AvisoDesconectado } from "@/components/AvisoDesconectado";
import { WelcomeTour, useWelcomeTour, PANEL_TOUR, CLIENT_TOUR } from "@/components/WelcomeTour";
import { ModalTermos, useTermosLogin } from "@/components/TermosAceite";
import { UserMenu } from "@/components/UserMenu";
import { ModoPrivado } from "@/components/ModoPrivado";
import { SeletorIdioma, useI18n, type Idioma } from "@/lib/i18n";
import { MorningAffirmationModal, useMorningAffirmation } from "@/components/MorningAffirmation";
import { Icon } from "@/components/icons";
import { VERSAO_ATUAL, CHAVE_NOVIDADES_VISTA } from "@/lib/novidades";
import { useEffect, useState } from "react";
import { Pfp } from "@/components/ui";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccounts, fmtNumber } from "@/components/accounts";

const S = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

type Mode = "both" | "lite" | "api";
type NavItem = { href: string; title: string; group: string; badge?: string; mode: Mode; tour?: string; icon: React.ReactNode; children?: { href: string; title: string }[]; client?: boolean };

// A sidebar ADAPTA à conta ativa: itens "both" sempre; "lite" só com conta LITE; "api" só com conta API.
const NAV: NavItem[] = [
  { href: "/", title: "Painel", group: "Operação", mode: "both", tour: "nav-painel", icon: S("M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z") },
  { href: "/contatos", title: "Contatos", group: "Operação", mode: "both", client: true, tour: "nav-contatos", icon: S("M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M18 3.13a4 4 0 0 1 0 7.75") },
  { href: "/integracoes", title: "Integrações", group: "Operação", mode: "both", client: true, icon: S("M9 7V3M15 7V3M7 7h10a1 1 0 0 1 1 1v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a1 1 0 0 1 1-1zM12 17v4") },
  { href: "/configuracoes", title: "Configurações", group: "Operação", mode: "both", client: true, icon: S("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z") },

  { href: "/resumos", title: "Resumos", group: "Operação", mode: "both", client: true, icon: S("M4 5h16M4 10h16M4 15h10M4 20h6M17 15l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z") },
  { href: "/atendente", title: "Atendente IA", group: "Operação", mode: "both", client: true, icon: S("M12 2a3 3 0 0 1 3 3v1h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h2V5a3 3 0 0 1 3-3zM9 12h.01M15 12h.01M9.5 16h5") },

  { href: "/logs", title: "Logs ao vivo", badge: "admin", group: "Operação", mode: "both", icon: S("M4 17l6-5-6-5M12 19h8") },

  { href: "/ao-vivo", title: "WPP ao Vivo", group: "WhatsApp Lite", mode: "lite", client: true, tour: "nav-aovivo", icon: S("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z") },
  { href: "/fluxos", title: "Fluxos", group: "WhatsApp Lite", mode: "lite", client: true, tour: "nav-fluxos", icon: S("M6 8.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3M6 6a2 2 0 1 0 0-.01M18 6a2 2 0 1 0 0-.01M12 20a2 2 0 1 0 0-.01"), children: [{ href: "/fluxos", title: "Meus fluxos" }, { href: "/fluxos/templates", title: "Templates" }] },
  { href: "/grupos", title: "Grupos", group: "WhatsApp Lite", mode: "lite", icon: S("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z") },
  { href: "/lembretes", title: "Lembretes", group: "WhatsApp Lite", mode: "lite", icon: S("M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0") },
  { href: "/modelos", title: "Modelos", group: "WhatsApp Lite", mode: "lite", icon: S("M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5") },

  { href: "/oficial/inbox", title: "WPP Api", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z") },
  { href: "/oficial", title: "Conexão", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8") },
  { href: "/oficial/fluxos", title: "Fluxos (API)", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M6 8.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3M6 6a2 2 0 1 0 0-.01M18 6a2 2 0 1 0 0-.01M12 20a2 2 0 1 0 0-.01") },
  { href: "/oficial/templates", title: "Templates Meta", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M9 9h1"), children: [{ href: "/oficial/templates", title: "Meus templates" }, { href: "/oficial/templates/coringa", title: "Coringa" }] },
  { href: "/oficial/disparador", title: "Disparador", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M22 2 11 13M22 2l-7 20-4-9-9-4z"), children: [{ href: "/oficial/disparador", title: "Novo disparo" }, { href: "/oficial/disparos", title: "Em andamento" }, { href: "/oficial/disparos/realizados", title: "Realizados" }] },
  { href: "/oficial/formularios", title: "Formulários", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M9 11h6M9 15h4M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6") },
  { href: "/oficial/metricas", title: "Métricas", group: "Meta · API Oficial", mode: "api", client: true, icon: S("M3 3v18h18M7 16v-6M12 16V8M17 16v-9") },

  { href: "/meus-sites", title: "Meus sites", group: "Vendas & Rede", mode: "both", client: true, icon: S("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a15.3 15.3 0 0 1 0 18M12 3a15.3 15.3 0 0 0 0 18") },
  { href: "/lancamento", title: "Dashboard Lançamento", badge: "admin", group: "Vendas & Rede", mode: "both", icon: S("M3 3v18h18M7 14l4-4 3 3 5-6") },
  { href: "/vendas", title: "Vendas & Ganhos", badge: "admin", group: "Vendas & Rede", mode: "both", tour: "nav-vendas", icon: S("M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6") },
  { href: "/clientes", title: "Clientes", badge: "admin", group: "Vendas & Rede", mode: "both", icon: S("M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75") },
  { href: "/afiliados", title: "Afiliados", badge: "admin", group: "Vendas & Rede", mode: "both", icon: S("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6") },
  { href: "/cupons", title: "Cupons de teste", badge: "admin", group: "Vendas & Rede", mode: "both", icon: S("M4 7h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V8a1 1 0 0 1 1-1z") },
];
// Tradução do menu SEM mexer nos identificadores: o `title`/`group` em português continua
// sendo a chave interna (GROUP_ORDER, SO_DONO e os filtros dependem dele) — aqui só o texto
// que aparece na tela vira i18n. Título sem entrada no mapa cai no próprio português.
const CHAVE_NAV: Record<string, string> = {
  "Operação": "nav.grupo.operacao", "WhatsApp Lite": "nav.grupo.lite",
  "Meta · API Oficial": "nav.grupo.oficial", "Vendas & Rede": "nav.grupo.vendas",
  "Painel": "nav.painel", "Contatos": "nav.contatos", "Integrações": "nav.integracoes",
  "Configurações": "nav.configuracoes", "Atendente IA": "nav.atendenteIa",
  "Logs ao vivo": "nav.logs", "WPP ao Vivo": "nav.wppAoVivo", "Fluxos": "nav.fluxos",
  "Meus fluxos": "nav.meusFluxos", "Templates": "nav.templates", "Grupos": "nav.grupos",
  "Lembretes": "nav.lembretes", "Modelos": "nav.modelos", "WPP Api": "nav.wppApi",
  "Conexão": "nav.conexao", "Fluxos (API)": "nav.fluxosApi",
  "Templates Meta": "nav.templatesMeta", "Meus templates": "nav.meusTemplates",
  "Coringa": "nav.coringa", "Disparador": "nav.disparador", "Novo disparo": "nav.novoDisparo", "Em andamento": "nav.emAndamento", "Realizados": "nav.realizados", "Formulários": "nav.formularios",
  "Métricas": "nav.metricas", "Meus sites": "nav.meusSites",
  "Vendas & Ganhos": "nav.vendasGanhos", "Clientes": "nav.clientes",
  "Afiliados": "nav.afiliados", "Cupons de teste": "nav.cupons",
};
const SO_DONO = new Set(["/resumos", "/fluxos", "/integracoes", "/oficial", "/oficial/fluxos", "/oficial/templates", "/oficial/disparador", "/oficial/disparos", "/oficial/disparos/realizados", "/oficial/formularios", "/oficial/metricas"]);
const GROUP_ORDER = ["Operação", "WhatsApp Lite", "Meta · API Oficial", "Vendas & Rede"];

const META: Record<string, { title: string; hint: string }> = {
  "/": { title: "Painel", hint: "O que o motor fez hoje — dados reais" },
  "/logs": { title: "Logs ao vivo", hint: "O que o motor está fazendo agora — tempo real" },
  "/grupos": { title: "Grupos", hint: "Automações de grupo — escolha uma pra configurar" },
  "/grupos/boas-vindas": { title: "Boas-vindas no grupo", hint: "Mensagem no PV pra quem entra no grupo" },
  "/grupos/resumo-ia": { title: "Resumo do dia (IA)", hint: "A IA resume o grupo e envia no horário" },
  "/grupos/marcar-todos": { title: "Marcar todos", hint: "Mencione todos os membros de um grupo" },
  "/grupos/criar-massa": { title: "Criar grupos em massa", hint: "Vários grupos de uma vez, com delay" },
  "/fluxos": { title: "Meus fluxos", hint: "Suas automações: um gatilho → uma sequência de passos" },
  "/fluxos/templates": { title: "Templates de fluxo", hint: "Modelos prontos — veja a prévia, use e edite" },
  "/lembretes": { title: "Lembretes", hint: "Mensagens agendadas e recorrentes (Lite)" },
  "/modelos": { title: "Modelos", hint: "Automações prontas pra usar" },
  "/contatos": { title: "Contatos", hint: "Seu CRM — busque, filtre e veja o histórico de cada cliente" },
  "/resumos": { title: "Resumos", hint: "Resumo de conversa, de grupo e relatório do período — com IA" },
  "/atendente": { title: "Atendente IA", hint: "A IA que responde quem chama e nenhum fluxo atendeu — Lite e API Oficial" },
  "/integracoes": { title: "Integrações", hint: "Conecte o ZapConverte a outras ferramentas" },
  "/configuracoes": { title: "Configurações", hint: "Preferências do painel" },
  "/ao-vivo": { title: "WPP ao Vivo", hint: "Suas conversas do WhatsApp Lite — veja e responda" },
  "/oficial/inbox": { title: "WPP Api", hint: "Conversas da API Oficial" },
  "/oficial": { title: "API Oficial — Conexão", hint: "Conecte seu número oficial da Meta" },
  "/oficial/fluxos": { title: "Fluxos (API Oficial)", hint: "Automações pela Cloud API" },
  "/oficial/templates": { title: "Templates Meta", hint: "Modelos aprovados pela Meta" },
  "/oficial/templates/coringa": { title: "Templates Coringa", hint: "Corpo em variáveis — aprova uma vez, conteúdo definido a cada disparo" },
  "/oficial/metricas": { title: "Métricas da API", hint: "Entregas, custo, qualidade e limite de envio" },
  "/oficial/disparador": { title: "Disparador", hint: "Envio em massa de templates pela API Oficial do WhatsApp" },
  "/oficial/disparos": { title: "Disparos em andamento", hint: "O que está rodando agora — acompanhe, pause ou pare" },
  "/oficial/disparos/realizados": { title: "Disparos realizados", hint: "Histórico com métricas: clique numa linha pra expandir, e num número pra ver a lista" },
  "/oficial/formularios": { title: "Formulários (Flows)", hint: "Formulários nativos do WhatsApp — a pessoa preenche sem sair da conversa" },
  "/meus-sites": { title: "Meus sites", hint: "Sua página de vendas de afiliado — link, divulgação e edição" },
  "/novidades": { title: "Novidades", hint: "O que mudou no ZapConverte" },
  "/lancamento": { title: "Dashboard de Lançamento", hint: "Meta Ads × vendas reais da Kiwify × conversas — o funil do workshop" },
  "/vendas": { title: "Vendas & Ganhos", hint: "Seus ganhos líquidos e o que é pago aos afiliados" },
  "/clientes": { title: "Clientes", hint: "Suas contas pagantes e o status de cada assinatura" },
  "/afiliados": { title: "Afiliados", hint: "Rede, comissão recorrente e ranking" },
  "/cupons": { title: "Cupons de teste", hint: "Libere trial com um código" },
};

function metaFor(path: string): { title: string; hint: string } {
  if (META[path]) return META[path];
  if (path.startsWith("/contatos/")) return { title: "Ficha do contato", hint: "Dados e histórico" };
  if (path.startsWith("/fluxos/")) return { title: "Editar fluxo", hint: "Gatilho → passos" };
  return { title: "ZapConverte", hint: "" };
}

// Item ativo = a href mais específica que casa com o caminho (inclui sub-itens).
function bestMatch(path: string, hrefs: string[]): string {
  if (path === "/") return "/";
  let best = "";
  for (const h of hrefs) {
    if (path === h || (h !== "/" && path.startsWith(h + "/"))) {
      if (h.length > best.length) best = h;
    }
  }
  return best;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const [theme, setTheme] = useState("tech");
  const [collapsed, setCollapsed] = useState(false);
  const { activeAcct, accounts, loading: accountsLoading } = useAccounts();
  const { session, loading: carregandoSessao } = useAuth();
  // Tour por papel: admin vê o tour do painel; cliente vê o tour DELE (chaves separadas p/ abrir fresco).
  const isClientSession = !!session && session.user.role !== "admin";
  const tourKey = isClientSession ? "zc-client-tour-v1" : "zc-tour-v1";
  // Só decide o tour DEPOIS que a sessão carregou — senão a chave usada é a do admin (ver o hook).
  const { open: tourOpen, openTour, closeTour } = useWelcomeTour(tourKey, !carregandoSessao && !!session);
  // Só o CLIENTE aceita; o admin é quem escreve os termos. Espera a sessão pra não piscar o modal.
  const { precisa: precisaTermos, concluir: concluiTermos } = useTermosLogin(!carregandoSessao && isClientSession);
  // Idioma salvo no perfil manda mais que o cache local: aplica assim que a sessão chega.
  const { idioma, trocar: trocarIdioma, t } = useI18n();
  const rot = (txt: string) => (CHAVE_NAV[txt] ? t(CHAVE_NAV[txt]) : txt);
  const idiomaDaSessao = session?.user.idioma as Idioma | undefined;
  useEffect(() => {
    if (idiomaDaSessao && idiomaDaSessao !== idioma) trocarIdioma(idiomaDaSessao, false);
  }, [idiomaDaSessao]); // eslint-disable-line react-hooks/exhaustive-deps
  const affirm = useMorningAffirmation();

  // ★ Detector de aba DESATUALIZADA (caso real 06/08: cliente com a aba de ontem não recebia
  // nenhum fix — SPA roda o bundle antigo até recarregar). Compara a versão do deploy a cada 5min
  // e mostra o aviso de atualizar. A 1ª leitura é a referência.
  const [temAtualizacao, setTemAtualizacao] = useState(false);
  useEffect(() => {
    let base = "";
    let vivo = true;
    const le = () => fetch("/api/versao").then((r) => r.json()).then((d) => String(d?.versao ?? "")).catch(() => "");
    le().then((v) => { if (vivo) base = v; });
    const t = setInterval(async () => {
      const v = await le();
      if (vivo && base && v && v !== base) setTemAtualizacao(true);
    }, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const router = useRouter();
  // Cliente só circula em rotas com superfície escopada (WPP ao Vivo + Fluxos). Se cair em qualquer
  // outra (ex.: "/" Painel, que chama /api/stats sem /app/*), manda pro WPP ao Vivo — evita a tela de erro.
  // Atendente (Equipe) não entra em /fluxos — cai no WPP ao Vivo se tentar pela URL.
  const soAtende = !!session && session.user.role !== "admin" && session.user.wsRole === "atendente";
  // DERIVADO DO NAV (a MESMA lista que monta o menu): rota é navegável pelo cliente se algum item
  // client:true a cobre. Antes era uma segunda lista escrita à mão — o menu ganhava página nova
  // (ex.: WPP Api pro cliente) e o portão não sabia dela: o replace daqui brigava com o replace da
  // página e a tela PISCAVA num pingue-pongue infinito (visto ao vivo no painel da BMA, 18/08).
  const paginasDaSessao = session?.user.permissoes?.paginas ?? null;
  const rotasDoCliente = NAV
    .filter((v) => v.client && !(soAtende && SO_DONO.has(v.href)) && (!paginasDaSessao || paginasDaSessao.includes(v.href)))
    .flatMap((v) => [v.href, ...(v.children?.map((c) => c.href) ?? [])]);
  const clientSafeRoute = path === "/novidades" || rotasDoCliente.some((h) => h !== "/" && (path === h || path.startsWith(h + "/")));
  // "Tem número" = já espelhou algum WhatsApp (o /app/accounts só lista instância que espelhou ao
  // menos uma vez, conectada OU NÃO). Antes a conta precisava estar CONECTADA pra entrar no painel:
  // número que caía (caso Dr. Exemplo, 03/10 — o celular desvinculou o aparelho) jogava o cliente na
  // tela de PRIMEIRO ACESSO e ele perdia o acesso às conversas que já tinha. Offline entra no
  // painel normal e vê a faixa de reconectar (AvisoDesconectado).
  const clienteComNumero = !!session && session.user.role !== "admin" && !accountsLoading && accounts.length > 0;
  useEffect(() => {
    if (clienteComNumero && !clientSafeRoute) router.replace("/ao-vivo");
  }, [clienteComNumero, clientSafeRoute, router]);

  useEffect(() => { setCollapsed(localStorage.getItem("zc-nav-collapsed") === "1"); }, []);
  function toggleCollapse() {
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("zc-nav-collapsed", n ? "1" : "0"); } catch {} return n; });
  }
  // Janela estreita (sair do maximizar, tablet): a sidebar vira a barra de ícones SOZINHA, e o
  // painel continua ao lado. A preferência manual do usuário fica intacta no localStorage — ao
  // voltar pra tela larga, a sidebar volta como ele deixou.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1000px)");
    const aplica = () => setNarrow(mq.matches);
    aplica();
    mq.addEventListener("change", aplica);
    return () => mq.removeEventListener("change", aplica);
  }, []);
  const rail = collapsed || narrow; // como a sidebar aparece AGORA (≠ da preferência salva)
  // "v1.x · novidades" na marca: pontinho enquanto o usuário não abriu a página desta versão.
  const [temNovidade, setTemNovidade] = useState(false);
  useEffect(() => {
    if (path === "/novidades") {
      try { localStorage.setItem(CHAVE_NOVIDADES_VISTA, VERSAO_ATUAL); } catch { /* modo anônimo */ }
      setTemNovidade(false);
      return;
    }
    try { setTemNovidade(localStorage.getItem(CHAVE_NOVIDADES_VISTA) !== VERSAO_ATUAL); } catch { setTemNovidade(false); }
  }, [path]);

  const activeType: Mode = activeAcct?.type === "API" ? "api" : "lite";
  const connected = !!activeAcct?.connected;
  const displayName = activeAcct?.name ?? "Conecte um número";
  const pic = activeAcct?.avatar;
  const number = activeAcct?.number;

  // Tema escolhido PERSISTE (preferência cosmética → localStorage; o layout aplica antes da 1ª
  // pintura). Antes voltava pro "tech" a cada refresh/login.
  useEffect(() => {
    try {
      const t = localStorage.getItem("zc-theme");
      if (t) { setTheme(t); document.documentElement.setAttribute("data-theme", t); }
    } catch { /* modo privado */ }
  }, []);
  function setT(t: string) {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("zc-theme", t); } catch { /* modo privado */ }
  }

  // Páginas de login/cadastro vivem SEM o Shell (tela cheia própria).
  if (path === "/entrar" || path === "/cadastro" || path === "/seja-afiliado") return <>{children}</>;

  // ⚖️ ACEITE DOS TERMOS — trava dura, ANTES de qualquer tela do cliente. Fica aqui em cima de
  // propósito: as telas do cliente têm vários returns antecipados (sem workspace, paywall, ainda
  // sem número), e justamente quem "ainda não conectou" é o que mais precisa ler o aviso. Bloquear
  // o painel inteiro também é o que dá força ao registro: não dá pra alegar que passou batido.
  if (precisaTermos) {
    return (
      <div className="client-wrap">
        <main className="client-main" />
        <ModalTermos momento="login" onAceito={concluiTermos} />
      </div>
    );
  }

  // Conta comum (não-admin), multi-tenant Fase 5: acesso ATIVO → tela escopada do cliente (conecta o
  // próprio WhatsApp; usa SÓ /api/app/*, nunca os dados do dono). No PAYWALL/sem acesso → sala de
  // espera + popup de planos por cima (AuthProvider), podendo assinar/usar cupom.
  if (session && session.user.role !== "admin") {
    // Removido da equipe (conta sem workspace) → tela explicativa, NUNCA o checkout (ele não é o dono).
    if (session.orphan) return <NoWorkspace name={session.user.name} />;
    if (session.paywall) return <PendingWorkspace session={session} />;
    if (accountsLoading) return <div className="client-wrap"><main className="client-main"><div className="muted">Carregando…</div></main></div>;
    // Já espelhou um WhatsApp (conectado ou caído) → PAINEL COMPLETO (nav filtrado só p/ itens do
    // cliente). NUNCA espelhou → tela focada de conectar (ClientHome). Tudo escopado por sessão (o
    // proxy remapeia /admin/* → /app/*), então o cliente NUNCA toca dados do dono.
    // Membro ATENDENTE não conecta número (não é papel dele) — em vez do QR, explica a espera.
    if (accounts.length === 0) {
      if (session.user.wsRole === "atendente") return <AwaitingOwner name={session.user.name} ws={session.workspace.name} />;
      // /oficial passa direto: quem vai conectar SÓ a API Oficial precisa alcançar o wizard antes de
      // ter qualquer número — senão o link do e-mail/suporte cai nesta tela e ele não sai do lugar.
      if (path !== "/oficial") return <ClientHome name={session.user.name} />;
    }
    // Conectado mas numa rota não-escopada (ex.: "/") → spinner enquanto o effect redireciona pro WPP ao Vivo.
    if (!clientSafeRoute) return <div className="client-wrap"><main className="client-main"><div className="muted">Abrindo…</div></main></div>;
  }

  const isAdmin = session?.user.role === "admin";
  const meta = metaFor(path);
  // EQUIPE: o ATENDENTE só ATENDE. Ele vê as DUAS caixas de conversa (WPP ao Vivo e WPP Api),
  // Contatos e o próprio perfil — nunca o que CONFIGURA a operação (fluxos, templates, disparo,
  // conexão da WABA, métricas). O motor barra a escrita de qualquer jeito (preHandler de papéis);
  // aqui é a UX. Lista EXATA de href: prefixo pegaria /oficial/inbox junto com /oficial.
  const ehAtendente = !isAdmin && session?.user.wsRole === "atendente";
  // Não-admin (cliente): só vê itens marcados client:true (têm superfície /app/* escopada). Admin vê tudo.
  // Páginas liberadas pra este membro (null = sem restrição). Esconder aqui é conforto: o bloqueio
  // de verdade está no motor, que recusa a rota mesmo se a pessoa digitar o endereço na barra.
  const paginasOk = session?.user.permissoes?.paginas ?? null;
  const liberada = (href: string) => !paginasOk || paginasOk.includes(href);
  const visible = NAV.filter((v) => (v.mode === "both" || v.mode === activeType) && (v.badge !== "admin" || isAdmin) && (isAdmin || v.client) && !(ehAtendente && SO_DONO.has(v.href)) && liberada(v.href));
  const groups = GROUP_ORDER.filter((g) => visible.some((v) => v.group === g));
  const candidates = visible.flatMap((v) => (v.children ? v.children.map((c) => c.href) : [v.href]));
  const activeHref = bestMatch(path, candidates);

  return (
    <div className={"app" + (rail ? " nav-collapsed" : "")}>
      <aside className={"sidebar" + (rail ? " collapsed" : "")}>
        <div className="brand">
          <div className="brand-mark">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div className="brand-txt">
            <div className="brand-name">Zap<span>Converte</span></div>
            <Link href="/novidades" className="brand-ver" title="Ver o que mudou no ZapConverte">
              v{VERSAO_ATUAL} · novidades{temNovidade && <span className="brand-ver-dot" aria-label="tem novidade" />}
            </Link>
          </div>
          {/* Em janela estreita a barra de ícones é obrigatória — some o botão (não haveria espaço). */}
          <button className="side-collapse" onClick={toggleCollapse} title={collapsed ? "Expandir menu" : "Recolher menu"} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} style={narrow ? { display: "none" } : undefined}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: rail ? "rotate(180deg)" : "none" }}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <AccountSwitcher />

        {groups.map((g) => (
          <div key={g}>
            <div className="nav-label">{rot(g)}</div>
            {visible.filter((v) => v.group === g).map((v) =>
              v.children ? (
                <div key={v.href} className={"nav-group-item" + (path.startsWith(v.href) ? " open" : "")}>
                  {/* O cabeçalho NAVEGA pro 1º filho (v.href): no celular a barra vira só ícones,
                      o submenu some, e o clique aqui era um beco sem saída (print 23/08 — não dava
                      pra chegar nos Templates Meta). No desktop o hover segue abrindo o submenu. */}
                  <Link href={v.href} className={"nav-item nav-head" + (v.children.some((c) => c.href === activeHref) ? " filho-ativo" : "")} data-tour={v.tour} title={rot(v.title)}>
                    {v.icon}
                    <span className="nav-txt">{rot(v.title)}</span>
                  </Link>
                  <div className="nav-subs">
                    {v.children.map((c) => (
                      <Link key={c.href + c.title} href={c.href} title={rot(c.title)} className={"nav-item nav-sub" + (c.href === activeHref ? " active" : "")}>
                        <span className="nav-dot" />
                        <span className="nav-txt">{rot(c.title)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link key={v.href} href={v.href} title={rot(v.title)} data-tour={v.tour} className={"nav-item" + (v.href === activeHref ? " active" : "")}>
                  {v.icon}
                  <span className="nav-txt">{rot(v.title)}</span>
                  {v.badge && <span className="nav-badge adm">{v.badge}</span>}
                </Link>
              ),
            )}
          </div>
        ))}

        <div className="side-foot">
          <div className="side-acc">
            <Pfp size={38} src={pic} ring={connected} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{displayName}</b>
              <div className="tnum">
                {number ? fmtNumber(number) + " · " : ""}
                <span style={{ color: connected ? "var(--accent-deep)" : "var(--crit)", fontWeight: 600 }}>
                  {connected ? "Conectado" : "Desconectado"}
                </span>
              </div>
            </div>
            {session && (
              <button
                className="side-logout"
                title={`Sair — você está logado como ${session.user.name} (${session.user.email})`}
                onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/entrar"; }}
              >Sair</button>
            )}
          </div>
          <SeletorIdioma />
          <div className="theme-seg">
            {["light", "dark", "tech"].map((t) => (
              <button key={t} className={theme === t ? "on" : ""} onClick={() => setT(t)}>
                {t === "light" ? "Claro" : t === "dark" ? "Escuro" : "Tech"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="main">
        <TrialBanner />
        <AvisoDesconectado />
        <header className="topbar">
          <div>
            <div className="page-title">{meta.title}</div>
            <div className="page-hint">{meta.hint}</div>
          </div>
          <div className="top-actions">
            {/* O "Buscar…" que ficava aqui era DECORATIVO (uma div sem ação) desde o primeiro layout.
                Busca de verdade existe onde há o que buscar: na lista de conversas e dentro da
                conversa aberta (WPP Api e WPP ao Vivo). Enfeite que parece função só gera clique morto. */}
            {/* O "?" saiu daqui (18/09): virou item do menu da foto — a barra ficava com um
                ponto de interrogação solto e a foto não fazia nada ao clicar. */}
            <ModoPrivado ativo={!!isAdmin} />
            <UserMenu
              nome={session?.user.name}
              email={session?.user.email}
              foto={session?.user.avatar || pic}
              podeVerTour={isAdmin || clienteComNumero}
              onTour={openTour}
            />
          </div>
        </header>

        <div className="views">{children}</div>
      </div>

      {temAtualizacao && (
        <div className="upd-banner" role="status">
          <span>✨ O ZapConverte foi atualizado.</span>
          <button className="btn primary" style={{ padding: "5px 14px", fontSize: 12.5 }} onClick={() => window.location.reload()}>Atualizar agora</button>
        </div>
      )}

      {/* Tour por papel: admin → tour do painel; cliente conectado → tour DELE. Declaração matinal = só admin. */}
      {(isAdmin || clienteComNumero) && <WelcomeTour steps={isAdmin ? PANEL_TOUR : CLIENT_TOUR} seenKey={tourKey} open={tourOpen} onClose={closeTour} />}
      {isAdmin && <MorningAffirmationModal open={affirm.open} onClose={affirm.close} onDisable={affirm.disableForever} />}
    </div>
  );
}

// Conta SEM workspace: foi removida da equipe (ou o workspace sumiu). Não é caso de paywall — não
// adianta oferecer plano, porque a assinatura é do dono. Explica e oferece sair.
function NoWorkspace({ name }: { name: string }) {
  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div className="pending-mark"><Icon name="user" size={38} /></div>
        <h1>Olá, {name.split(" ")[0]}</h1>
        <p className="muted">
          Sua conta não faz parte de nenhuma equipe no momento. Se você era da equipe de alguém,
          o responsável pode ter removido o seu acesso — fale com ele pra te convidar de novo.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>Se você quer sua PRÓPRIA conta do ZapConverte, fale com a gente que a gente libera.</p>
        <button
          className="side-logout"
          style={{ marginTop: 6 }}
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/entrar"; }}
        >Sair</button>
      </div>
    </div>
  );
}

// Membro ATENDENTE da equipe entrou, mas o DONO ainda não espelhou o WhatsApp. Conectar número não
// é papel de atendente — então em vez do QR (que o motor barraria), explica a espera com clareza.
function AwaitingOwner({ name, ws }: { name: string; ws: string }) {
  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div className="pending-mark"><Icon name="check" size={38} /></div>
        <h1>Tudo pronto, {name.split(" ")[0]}!</h1>
        <p className="muted">
          Você já faz parte da equipe de <b>{ws}</b>. Falta só o responsável conectar o WhatsApp —
          assim que ele espelhar o número, as conversas aparecem aqui pra você atender.
        </p>
        <div className="pending-pill">👥 Seu acesso: Atendente</div>
        <p className="muted" style={{ fontSize: 13 }}>Avise quem te convidou que você já está dentro. Depois é só recarregar esta página.</p>
        <button className="btn" style={{ marginTop: 4 }} onClick={() => window.location.reload()}>Recarregar</button>
        <button
          className="side-logout"
          style={{ marginTop: 6 }}
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/entrar"; }}
        >Sair</button>
      </div>
    </div>
  );
}

// Tela de conta comum: a conta existe e o trial/assinatura valem, mas o painel operacional
// (single-tenant hoje) fica reservado ao admin até o isolamento por cliente ficar pronto.
function PendingWorkspace({ session }: { session: { user: { name: string; email: string }; workspace: { days_left: number | null; paid_until: string | null } } }) {
  const ativo = !!session.workspace.paid_until || (session.workspace.days_left ?? 0) > 0;
  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div className="pending-mark"><Icon name="check" size={38} /></div>
        <h1>Conta criada, {session.user.name.split(" ")[0]}!</h1>
        <p className="muted">
          {ativo
            ? "Seu acesso está ativo. Estamos preparando o seu painel individual — em breve você conecta o seu próprio WhatsApp e roda suas automações aqui."
            : "Sua conta está pronta. Assim que seu painel individual estiver liberado, você conecta o seu WhatsApp e começa a automatizar."}
        </p>
        {ativo && session.workspace.days_left != null && !session.workspace.paid_until && (
          <div className="pending-pill">⏳ Teste ativo · {session.workspace.days_left} dia{session.workspace.days_left === 1 ? "" : "s"} restante{session.workspace.days_left === 1 ? "" : "s"}</div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          Qualquer dúvida, fale com a gente no WhatsApp. Enquanto isso, seu acesso já está garantido.
        </p>
        <button
          className="side-logout"
          style={{ marginTop: 6 }}
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/entrar"; }}
        >Sair</button>
      </div>
    </div>
  );
}
