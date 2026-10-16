"use client";

// Tour de boas-vindas: escurece a tela, dá um SPOTLIGHT num elemento do menu (via [data-tour="chave"])
// e mostra uma instrução. Roda no 1º acesso (localStorage) e pode ser reaberto pelo botão "?".
// Reutilizável — na Fase 6 do multi-tenant ele guia o cliente novo a conectar o número dele.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Icon } from "@/components/icons";

export interface TourStep {
  target?: string; // valor do data-tour do elemento a destacar; ausente = passo centralizado
  title: string;
  body: string;
  side?: "right" | "left" | "bottom" | "top"; // onde o balão aparece (default: auto)
}

const SEEN_KEY = "zc-tour-v1";

// Tour padrão do painel. Quando o multi-tenant chegar, dá pra trocar os passos por conta/estado.
export const PANEL_TOUR: TourStep[] = [
  { title: "Bem-vindo ao ZapConverte! 👋", body: "Deixa eu te mostrar o essencial em poucos passos. Leva 30 segundos." },
  { target: "connect", side: "right", title: "1. Conecte seu WhatsApp", body: "É aqui que tudo começa. Clique no + para conectar um número — você escolhe entre a API Oficial da Meta ou o modo rápido (QR Code)." },
  { target: "nav-fluxos", side: "right", title: "2. Crie seus fluxos", body: "Aqui você monta as automações: um gatilho (ex.: uma venda) dispara uma sequência que atende, envia áudio, vídeo e até usa IA — sozinho." },
  { target: "nav-painel", side: "right", title: "3. Acompanhe tudo", body: "O Painel mostra, em tempo real, o que o motor fez: vendas, eventos e contatos que entraram no seu funil." },
  { target: "nav-vendas", side: "right", title: "4. Seus ganhos", body: "Aqui ficam suas vendas, seus ganhos líquidos e o que é pago aos afiliados — direto da Kiwify." },
  { title: "Pronto pra começar! 🚀", body: "Qualquer hora que quiser rever isto, clique no ? no topo. Bora vender no automático!" },
];

// Tour do CLIENTE (não-admin). Fala do que importa PRA ELE — sem vendas/afiliados/Kiwify (que são do admin).
export const CLIENT_TOUR: TourStep[] = [
  { title: "Bem-vindo ao ZapConverte! 👋", body: "Deixa eu te mostrar onde fica cada coisa do seu WhatsApp. Leva 30 segundos." },
  { target: "connect", side: "right", title: "Seu WhatsApp", body: "Aqui fica seu número conectado. Dá pra pausar a automação, remover ou conectar outro (QR ou API Oficial da Meta)." },
  { target: "nav-aovivo", side: "right", title: "Chat ao vivo", body: "Veja e responda TODAS as conversas do seu WhatsApp por aqui — com foto, áudio e documento, sem sair do painel." },
  { target: "nav-fluxos", side: "right", title: "Crie seus fluxos", body: "Monte respostas automáticas: quando alguém mandar uma palavra (ex.: “orçamento”), o WhatsApp responde sozinho — texto, áudio e até com IA." },
  { target: "nav-contatos", side: "right", title: "Contatos & CRM", body: "Todo mundo que te chamou fica organizado aqui, com etiquetas (cliente, orçamento, atendido…) pra você não perder ninguém." },
  { title: "Equipe, em breve 👥", body: "Logo você vai poder adicionar sua equipe pra atender junto no mesmo número. Pra rever este tour, clique no ? lá no topo. Bora! 🚀" },
];

// Tour do DISPARADOR. Pedido do dono (30/09) depois de dois dias errando o caminho aqui:
// template × fluxo, mídia do topo que a Meta exige, variáveis com {{nome}}, e o "enviados" que
// quer dizer "a Meta aceitou", não "chegou". Cada passo é uma dessas pedras, na ordem do wizard.
export const DISPARADOR_TOUR: TourStep[] = [
  { title: "Como disparar sem tomar susto", body: "São 3 passos e quatro armadilhas. Em 40 segundos você não cai em nenhuma." },
  { target: "disp-modo", side: "bottom", title: "1. Template ou fluxo?", body: "“Um template” manda a mensagem e para — o fluxo com o gatilho “Respondeu o template” assume quando a pessoa clica num botão. “Um fluxo completo” só aceita fluxo que tenha um PASSO de template dentro dele." },
  { target: "disp-template", side: "bottom", title: "2. Escolha o modelo", body: "Só aparecem modelos já aprovados pela Meta. Atenção ao nome: o fluxo se liga ao template pelo nome EXATO — se não bater, a pessoa clica e não acontece nada." },
  { target: "disp-variaveis", side: "top", title: "3. Preencha as variáveis", body: "Escreva {{nome}} pra puxar o nome de cada contato da lista. Se a pessoa não tiver nome na planilha, a Meta recusa a mensagem inteira — então garanta a coluna de nome." },
  { target: "disp-midia", side: "top", title: "4. A mídia do topo é obrigatória", body: "Se o modelo tem imagem ou vídeo no cabeçalho, anexe o arquivo AQUI. Sem isso a Meta tenta baixar o arquivo de exemplo, que expira, e devolve erro 131053 em toda a lista." },
  { target: "disp-lista", side: "top", title: "5. A lista de contatos", body: "Planilha, colar números ou um segmento do CRM. O painel tira hífen, parênteses e espaços, e põe o 55 quando o número tem cara de brasileiro. Cabeçalho aceito: nome/telefone/whatsapp (maiúscula não importa)." },
  { target: "disp-ritmo", side: "top", title: "6. Ritmo e proteção", body: "O intervalo entre envios protege a qualidade do número. Ligue “pausar se houver falhas” pra ele parar sozinho depois de 5 erros seguidos, em vez de queimar a lista inteira." },
  { title: "Por último: “enviados” não é “entregues”", body: "O contador diz quantas a Meta ACEITOU. A reprovação (número sem WhatsApp, limite, pagamento) chega segundos depois. Confira sempre em Métricas se entregou de verdade. Pra rever este tour, clique no ? aqui do Disparador." },
];

function useSpotlightRect(target?: string, tick = 0) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [target, tick]);
  return rect;
}

export function WelcomeTour({ steps = PANEL_TOUR, open, onClose, seenKey = SEEN_KEY }: { steps?: TourStep[]; open: boolean; onClose: () => void; seenKey?: string }) {
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);
  const step = steps[i];
  const rect = useSpotlightRect(step?.target, tick);

  // reposiciona ao trocar de passo (o elemento pode precisar de um frame pra existir/mover)
  useEffect(() => { const t = setTimeout(() => setTick((x) => x + 1), 60); return () => clearTimeout(t); }, [i]);

  // "Pular"/terminar marca o visto NO SERVIDOR (por usuário — vale em qualquer aparelho) e no
  // localStorage (cache/fallback se a rede falhar).
  const finish = useCallback(() => {
    try { localStorage.setItem(seenKey, "1"); } catch {}
    fetch("/api/app/me/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: seenKey }) }).catch(() => {});
    setI(0);
    onClose();
  }, [onClose, seenKey]);
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());
  const prev = () => setI(Math.max(0, i - 1));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !step) return null;
  const pad = 8;
  const box = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;

  // Posição do balão: ao lado do alvo, PUXADO pro centro vertical e TRAVADO nas bordas da janela.
  // Caso real (onboarding 06/08): em tela pequena compartilhada no Meet, o balão alinhado ao topo
  // do alvo estourava a dobra e o botão "Próximo" ficava invisível — a pessoa não conseguia seguir.
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const ALT = 250, LARG = 332; // tamanho estimado do balão + margem
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - ALT));
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - LARG));
  let tip: React.CSSProperties;
  if (!box) tip = { top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  else {
    const side = step.side ?? "right";
    const meioDoAlvo = box.top + box.height / 2 - ALT / 2; // centraliza em relação ao alvo
    if (side === "right") tip = { top: clampTop(meioDoAlvo), left: clampLeft(box.left + box.width + 16) };
    else if (side === "left") tip = { top: clampTop(meioDoAlvo), left: clampLeft(box.left - LARG - 8) };
    else if (side === "bottom") {
      const abaixo = box.top + box.height + 16;
      // sem espaço embaixo → abre PRA CIMA (o pedido do dono), nunca corta o botão
      tip = abaixo + ALT > vh
        ? { top: clampTop(box.top - ALT - 16), left: clampLeft(box.left) }
        : { top: abaixo, left: clampLeft(box.left) };
    } else tip = { top: clampTop(box.top - ALT - 16), left: clampLeft(box.left) };
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true">
      {/* camada que bloqueia cliques na página atrás (a navegação é pelos botões do balão) */}
      <div className="tour-block" />
      {/* Spotlight: um buraco iluminado sobre o alvo; o resto escurece via box-shadow gigante. */}
      {box ? (
        <div className="tour-hole" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      ) : (
        <div className="tour-dim" />
      )}

      <div className="tour-tip" style={tip} onClick={(e) => e.stopPropagation()}>
        <div className="tour-step-count">{i + 1} / {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="tour-skip" onClick={finish}>Pular</button>
          <div style={{ display: "flex", gap: 8 }}>
            {i > 0 && <button className="btn" onClick={prev}>Voltar</button>}
            <button className="btn tour-next ic" onClick={next}>{i < steps.length - 1 ? "Próximo" : <><Icon name="rocket" size={15} />Começar</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook: decide se o tour abre sozinho no 1º acesso. A verdade é POR USUÁRIO no servidor —
// membro novo no mesmo navegador do dono vê o tour DELE; quem pulou não vê nunca mais, em
// aparelho nenhum. localStorage vira cache local + migração dos usuários antigos.
// `pronto` = a SESSÃO já carregou. É obrigatório esperar: enquanto ela carrega, quem chama não
// sabe se é admin ou cliente e passa a chave do ADMIN — o hook abria o tour com a chave errada e,
// quando a chave certa chegava ("já viu"), o tour continuava aberto pra sempre. Era exatamente
// isso que fazia o "Pular" não colar no painel do CLIENTE (bug do cliente Roba, 06-07/08).
export function useWelcomeTour(seenKey: string = SEEN_KEY, pronto = true) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!pronto) return; // ainda não sei quem é o usuário → não decide nada
    let alive = true;
    setOpen(false); // chave nova: fecha o que uma chave anterior possa ter aberto
    const vistoLocal = (() => { try { return !!localStorage.getItem(seenKey); } catch { return false; } })();
    const marcarNoServidor = () =>
      fetch("/api/app/me/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: seenKey }) }).catch(() => {});
    fetch("/api/app/me/tour?key=" + encodeURIComponent(seenKey))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.seen) { setOpen(false); return; } // já pulou/terminou: nunca mais abre sozinho
        if (vistoLocal) {
          // Já tinha visto NESTE navegador (usuário anterior à mudança, ou o POST falhou da 1ª vez):
          // migra pro servidor e NÃO reabre.
          marcarNoServidor();
          setOpen(false);
          return;
        }
        setOpen(true);
      })
      .catch(() => { if (alive && !vistoLocal) setOpen(true); }); // rede falhou → comportamento antigo
    return () => { alive = false; };
  }, [seenKey, pronto]);
  return { open, openTour: () => setOpen(true), closeTour: () => setOpen(false) };
}
