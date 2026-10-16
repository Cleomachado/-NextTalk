"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pt } from "./pt";
import { en } from "./en";
import { es } from "./es";

// 🌐 IDIOMAS DO PAINEL.
//
// Por que sem biblioteca: o next-intl e afins pedem roteamento por locale (/en/fluxos), o que
// mudaria TODAS as rotas do painel e quebraria os links que o dono já mandou pros clientes.
// Aqui o idioma é estado, não caminho — troca na hora, sem navegar e sem recarregar.
//
// Por que o idioma vive no SERVIDOR (users.idioma) e não só no navegador: quem escolhe inglês
// e entra de outro computador tem que continuar em inglês. O localStorage entra só como CACHE,
// pra primeira pintura não sair em português e "piscar" pro idioma certo depois.

export type Idioma = "pt" | "en" | "es";

export const IDIOMAS: { id: Idioma; bandeira: string; nome: string }[] = [
  { id: "pt", bandeira: "🇧🇷", nome: "Português" },
  { id: "en", bandeira: "🇺🇸", nome: "English" },
  { id: "es", bandeira: "🇪🇸", nome: "Español" },
];

const DICIONARIOS: Record<Idioma, Record<string, string>> = { pt, en, es };
const CACHE = "zc-idioma";

type Ctx = { idioma: Idioma; trocar: (i: Idioma, persistir?: boolean) => void; t: (chave: string, vars?: Record<string, string | number>) => string };
const I18n = createContext<Ctx>({ idioma: "pt", trocar: () => {}, t: (c) => c });

export const useI18n = () => useContext(I18n);
/** Atalho pro caso comum: `const t = useT()` e depois `t("nav.painel")`. */
export const useT = () => useContext(I18n).t;

function ehIdioma(v: unknown): v is Idioma {
  return v === "pt" || v === "en" || v === "es";
}

/** Idioma do navegador, usado só quando o usuário nunca escolheu. */
function idiomaDoNavegador(): Idioma {
  try {
    const n = (navigator.language || "pt").slice(0, 2).toLowerCase();
    return ehIdioma(n) ? n : "pt";
  } catch {
    return "pt";
  }
}

export function I18nProvider({ children, inicial }: { children: React.ReactNode; inicial?: Idioma }) {
  // Ordem de decisão: o que veio da sessão (servidor) > cache local > idioma do navegador.
  const [idioma, setIdioma] = useState<Idioma>(inicial ?? "pt");

  useEffect(() => {
    if (inicial) { setIdioma(inicial); return; }
    try {
      const c = localStorage.getItem(CACHE);
      setIdioma(ehIdioma(c) ? c : idiomaDoNavegador());
    } catch {
      setIdioma(idiomaDoNavegador());
    }
  }, [inicial]);

  // `lang` no <html> importa de verdade: é o que faz o corretor ortográfico, o leitor de tela e
  // a oferta de tradução do navegador se comportarem — e é o que a Meta olha na revisão do app.
  useEffect(() => {
    try { document.documentElement.lang = idioma === "pt" ? "pt-BR" : idioma === "es" ? "es" : "en"; } catch { /* SSR */ }
  }, [idioma]);

  // persistir=false: veio do próprio servidor (sessão) — só aplica, não regrava.
  const trocar = useCallback((novo: Idioma, persistir = true) => {
    setIdioma(novo);
    try { localStorage.setItem(CACHE, novo); } catch { /* modo anônimo */ }
    if (!persistir) return;
    // Grava no perfil sem travar a UI: a troca já aconteceu na tela; se a rede falhar, o cache
    // local segura até a próxima vez que der certo.
    fetch("/api/me/idioma", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idioma: novo }),
    }).catch(() => { /* fica só no cache local */ });
  }, []);

  const t = useCallback((chave: string, vars?: Record<string, string | number>) => {
    // Falta a chave no idioma escolhido? Cai no português em vez de mostrar a chave crua na
    // cara do usuário. O script scripts/i18n-cobertura.mjs mede o quanto ainda falta.
    const dic = DICIONARIOS[idioma] ?? pt;
    let texto = dic[chave] ?? pt[chave] ?? chave;
    if (vars) for (const [k, v] of Object.entries(vars)) texto = texto.split(`{${k}}`).join(String(v));
    return texto;
  }, [idioma]);

  const valor = useMemo(() => ({ idioma, trocar, t }), [idioma, trocar, t]);
  return <I18n.Provider value={valor}>{children}</I18n.Provider>;
}

/** Seletor de bandeira. Compacto de propósito: mora na barra de cima, ao lado do tema. */
export function SeletorIdioma() {
  const { idioma, trocar } = useI18n();
  const [aberto, setAberto] = useState(false);
  const atual = IDIOMAS.find((i) => i.id === idioma) ?? IDIOMAS[0];

  useEffect(() => {
    if (!aberto) return;
    const fecha = () => setAberto(false);
    window.addEventListener("click", fecha);
    return () => window.removeEventListener("click", fecha);
  }, [aberto]);

  return (
    <div className="idioma-wrap" onClick={(e) => e.stopPropagation()}>
      <button className="idioma-btn" onClick={() => setAberto((a) => !a)}
              title={atual.nome} aria-label={`Idioma: ${atual.nome}`} aria-expanded={aberto}>
        <span className="idioma-bandeira">{atual.bandeira}</span>
        <span className="idioma-sigla">{atual.id.toUpperCase()}</span>
      </button>
      {aberto && (
        <div className="idioma-pop" role="menu">
          {IDIOMAS.map((i) => (
            <button key={i.id} role="menuitem"
                    className={"idioma-item" + (i.id === idioma ? " on" : "")}
                    onClick={() => { trocar(i.id); setAberto(false); }}>
              <span className="idioma-bandeira">{i.bandeira}</span>
              <span>{i.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
