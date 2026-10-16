"use client";

import { useEffect } from "react";

export function Toggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
  return <span className={"toggle" + (on ? "" : " off")} onClick={() => onToggle(!on)} />;
}

// `sujo` = tem alteração pendente. Quando informado, o botão SOME enquanto está tudo salvo e
// reaparece (verde, pulsando uma vez) assim que algo muda — a barra vira a resposta de "preciso
// salvar?" sem a pessoa ter que lembrar. Sem o campo, o botão fica sempre visível (uso antigo).
// ══ AVISO DE ALTERAÇÃO NÃO SALVA ════════════════════════════════════════════════════════════
// Duas saídas precisam ser cobertas, e elas são bem diferentes:
//  1. Fechar/recarregar a aba → só o `beforeunload` do navegador alcança (e ele não deixa
//     personalizar o texto nem oferecer "salvar agora" — é o diálogo padrão do Chrome).
//  2. Clicar num link do painel (menu lateral, "← Fluxos") → o Next troca de rota SEM recarregar,
//     então o beforeunload nunca dispara. Aqui a gente intercepta o clique na fase de CAPTURA,
//     antes do router, e pergunta se é pra sair mesmo.
//
// O aviso NÃO salva por conta própria (pedido do dono, 25/08). Antes o OK gravava e saía, e
// isso é a pior combinação: quem clica em OK num diálogo de alerta está querendo SAIR, não
// publicar o que estava no meio da edição — e um "OK" que grava sem querer não tem como desfazer.
// Agora OK = sair ciente de que perde, Cancelar = voltar pro fluxo. Salvar é o botão Salvar.
export function useAvisoNaoSalvo(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;
    const aoFechar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aoFechar);

    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      // Âncora interna, download e link pra outra aba não trocam a rota — deixa passar.
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      const destino = new URL(a.href, location.href);
      if (destino.origin !== location.origin) return;             // sai do painel: o beforeunload cobre
      if (destino.pathname === location.pathname) return;          // mesma tela
      e.preventDefault();
      e.stopPropagation();
      const sairMesmo = window.confirm(
        "Você tem alterações que ainda não foram salvas.\n\n" +
        "OK = sair assim mesmo e perder o que você mudou agora.\n" +
        "Cancelar = voltar pro fluxo (aí é só clicar em Salvar).",
      );
      if (!sairMesmo) return;
      // Tira o beforeunload ANTES de navegar: sem isso o Chrome perguntaria de novo ("sair do
      // site?") logo depois do OK, porque a alteração continua pendente — a pessoa já respondeu.
      window.removeEventListener("beforeunload", aoFechar);
      location.href = destino.href;
    };
    document.addEventListener("click", aoClicar, true); // captura: antes do router do Next

    return () => {
      window.removeEventListener("beforeunload", aoFechar);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo]);
}

export function SaveBar({ status, onSave, sujo }: { status: string; onSave: () => void; sujo?: boolean }) {
  const busy = status === "salvando…";
  const isErr = status && status !== "salvo!" && !busy;
  const controlado = sujo !== undefined;
  const mostra = !controlado || sujo || busy;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {mostra ? (
        <button className={"btn primary" + (controlado ? " salvar-pulsa" : "")} onClick={onSave} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      ) : (
        <span className="salvo-selo" title="Não há alterações pendentes">✓ Salvo</span>
      )}
      {status && (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: isErr ? "var(--crit)" : "var(--accent-deep)" }}>
          {status}
        </span>
      )}
    </div>
  );
}

/* Bolinha de perfil. Com `src`, mostra a foto do WhatsApp conectado (recortada redonda). */
export function Pfp({ size = 42, ring = true, src }: { size?: number; ring?: boolean; src?: string }) {
  return (
    <span className="pfp" style={{ width: size, height: size }}>
      <span className="pfp-in">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="15.5" r="7" fill="#fff" fillOpacity=".92" />
            <path d="M7 35c1.2-7.5 6.4-11 13-11s11.8 3.5 13 11z" fill="#fff" fillOpacity=".92" />
          </svg>
        )}
      </span>
      {ring && <span className="on-ring" />}
    </span>
  );
}

export function EmBreve({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="em-breve">
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
          <div style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>{title}</div>
          <div>Tela em construção — próxima a sair do papel.</div>
        </div>
      </div>
    </div>
  );
}

export function BackTo({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="btn" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 12.5 }}>
      ← {label}
    </a>
  );
}
