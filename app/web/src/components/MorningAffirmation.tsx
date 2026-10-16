"use client";

// Declaração matinal: um popup que abre 1x por dia na 1ª vez que o dono abre o ZapConverte,
// com a frase que ele fala em voz alta pra começar o dia. Tem "não abrir mais" (desliga) e um
// liga/desliga em Configurações. Estado no localStorage (pessoal, por navegador — instantâneo).
import { useEffect, useState } from "react";

const ENABLED_KEY = "zc-affirm-enabled"; // "1" | "0" — ausente = ligado (padrão)
const LAST_KEY = "zc-affirm-last"; // "YYYY-MM-DD" da última vez que apareceu

export function affirmationEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setAffirmationEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignora */
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A declaração, em blocos pra leitura em voz alta.
const BLOCKS: string[] = [
  "O dinheiro vem fácil, de forma livre, de diversas formas, em contínuas fontes, em quantidades cada vez maiores — e comigo fica: para a construção da minha riqueza, proteção da minha família, expansão do evangelho de Cristo e para servir ao próximo. É isso que eu acredito, creio, me aproximo e atraio, em nome de Jesus. Amém.",
  "Eu sou forte, eu sou corajoso, eu sou inteligente, eu sou criativo, eu sou visionário, eu sou ousado, eu sou estratégico, eu sou um excelente gestor das minhas finanças. Eu posso mais, eu posso muito, muito, muito mais.",
  "Meus sonhos são reais. Hoje eu vou ter um dia maravilhoso, hoje eu vou ter uma notícia maravilhosa. Tudo dá certo pra mim, tudo que eu faço dá certo. Eu sou capaz, eu consigo, eu mereço.",
];

// Popup apresentacional (puro): quem controla open/onClose/onDisable é o Shell (auto) ou Configurações (preview).
export function MorningAffirmationModal({
  open,
  onClose,
  onDisable,
}: {
  open: boolean;
  onClose: () => void;
  onDisable: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="affirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="affirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="affirm-eyebrow">Declaração de hoje</div>
        <h2 className="affirm-title">Fale em voz alta e comece o dia no controle</h2>
        <div className="affirm-body">
          {BLOCKS.map((b, i) => (
            <p key={i}>{b}</p>
          ))}
        </div>
        <div className="affirm-actions">
          <button className="btn primary affirm-amen" onClick={onClose}>Amém 🙏</button>
          <button className="affirm-never" onClick={onDisable}>Não abrir mais essa mensagem</button>
        </div>
      </div>
    </div>
  );
}

// Hook do Shell: decide se abre hoje. active=false não abre (ex.: fora do painel admin).
export function useMorningAffirmation(active = true) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    try {
      if (!affirmationEnabled()) return;
      if (!localStorage.getItem("zc-tour-v1")) return; // deixa o tour de boas-vindas ir primeiro (1º acesso)
      if (localStorage.getItem(LAST_KEY) === todayStr()) return; // já viu hoje
      setOpen(true);
    } catch {
      /* ignora */
    }
  }, [active]);

  const markSeenToday = () => {
    try {
      localStorage.setItem(LAST_KEY, todayStr());
    } catch {
      /* ignora */
    }
  };
  return {
    open,
    close: () => {
      markSeenToday();
      setOpen(false);
    },
    disableForever: () => {
      setAffirmationEnabled(false);
      markSeenToday();
      setOpen(false);
    },
  };
}
