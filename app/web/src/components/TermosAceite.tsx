"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";

// ⚖️ ACEITE DOS TERMOS DENTRO DO PAINEL.
//
// Existe por um motivo concreto: quando a Meta bane o número de um cliente, a primeira reação dele
// é culpar a ferramenta — e já houve ameaça de processo por isso em SaaS parecido. Cláusula no site
// sozinha é defesa fraca, porque o cliente alega que nunca viu. O que vira prova é o registro de
// que AQUELA pessoa, naquele IP, naquele minuto, leu o aviso e clicou em "aceito" — e, no caso do
// canal, segundos ANTES de conectar aquele número.
//
// Dois momentos:
//  · login → uma vez por versão do texto (some depois de aceito)
//  · canal → toda vez que aperta o "+" pra conectar um número (é o que mais vale)
//
// O texto e o hash vêm do SERVIDOR. O navegador não escolhe o que "leu".

type Item = { titulo: string; texto: string };
type Pacote = {
  versao: string;
  momento: "login" | "canal";
  hash: string;
  aviso: string | null;
  itens: Item[];
  declaracao: string;
  aceito?: boolean;
};

// O que o navegador consegue informar sobre o aparelho.
// ⚠️ Endereço MAC não entra nesta lista porque NENHUM navegador expõe isso a uma página web —
// é barreira do próprio navegador, em qualquer sistema. O que sustenta a prova é o trio
// IP (visto pelo servidor) + user-agent + horário do servidor; o resto aqui é reforço.
function dadosDoAparelho() {
  try {
    return {
      tela: `${window.screen?.width ?? "?"}x${window.screen?.height ?? "?"}`,
      pixelRatio: window.devicePixelRatio ?? null,
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      idioma: navigator.language ?? null,
      plataforma: (navigator as any).userAgentData?.platform ?? navigator.platform ?? null,
      horaLocal: new Date().toISOString(),
      toque: navigator.maxTouchPoints ?? 0,
    };
  } catch {
    return null;
  }
}

async function buscaPacote(momento: "login" | "canal"): Promise<Pacote | null> {
  try {
    const r = await fetch(`/api/termos?momento=${momento}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function registraAceite(p: Pacote, referencia?: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch("/api/termos/aceite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        momento: p.momento,
        hash: p.hash,
        dispositivo: dadosDoAparelho(),
        ...(referencia ? { referencia } : {}),
      }),
    });
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => null);
    return { ok: false, erro: d?.error ?? "não consegui registrar — tente de novo" };
  } catch {
    return { ok: false, erro: "sem conexão com o servidor — tente de novo" };
  }
}

// ── O modal ──────────────────────────────────────────────────────────────────
export function ModalTermos({
  momento, referencia, onAceito, onCancelar,
}: {
  momento: "login" | "canal";
  referencia?: string;
  onAceito: () => void;
  onCancelar?: () => void;      // ausente = não dá pra fechar (caso do login)
}) {
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [marcado, setMarcado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { buscaPacote(momento).then(setPacote); }, [momento]);

  async function aceitar() {
    if (!pacote || !marcado || salvando) return;
    setSalvando(true); setErro("");
    const r = await registraAceite(pacote, referencia);
    if (r.ok) { onAceito(); return; }
    setErro(r.erro ?? "erro"); setSalvando(false);
  }

  if (!pacote) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560, padding: 0, maxHeight: "88vh", display: "flex", flexDirection: "column" }}
           onClick={(e) => e.stopPropagation()}>

        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--line, #e1e9e4)" }}>
          <h3 style={{ margin: 0, fontSize: 19, letterSpacing: "-.01em" }}>
            {momento === "canal" ? "Antes de conectar este número" : "Antes de começar"}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, opacity: .75 }}>
            Leia com atenção — é o que separa um número saudável de um número banido.
          </p>
        </div>

        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
          {pacote.aviso && (
            <div style={{ background: "rgba(232,163,61,.12)", border: "1px solid rgba(232,163,61,.45)",
                          borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13.5, lineHeight: 1.55 }}>
              <Icon name="warn" size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              {pacote.aviso}
            </div>
          )}

          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>
            {pacote.itens.map((i) => (
              <li key={i.titulo} style={{ marginBottom: 12 }}>
                <b>{i.titulo}.</b> <span style={{ opacity: .85 }}>{i.texto}</span>
              </li>
            ))}
          </ol>

          <p style={{ marginTop: 16, fontSize: 12.5, opacity: .7 }}>
            Texto completo em{" "}
            <a href="https://seudominio.com.br/termos-de-servicos" target="_blank" rel="noreferrer">Termos de Serviço</a>
            {" "}e{" "}
            <a href="https://seudominio.com.br/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.
          </p>
        </div>

        <div style={{ padding: "14px 24px 20px", borderTop: "1px solid var(--line, #e1e9e4)" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, cursor: "pointer" }}>
            <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)}
                   style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, cursor: "pointer" }} />
            <span>{pacote.declaracao}</span>
          </label>

          {erro && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger, #c0392b)" }}>{erro}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
            {onCancelar && (
              <button className="btn" onClick={onCancelar} disabled={salvando}>Cancelar</button>
            )}
            <button className="btn primary" onClick={aceitar} disabled={!marcado || salvando}>
              {salvando ? "Registrando…" : momento === "canal" ? "Aceito — conectar número" : "Aceito e quero continuar"}
            </button>
          </div>

          <p style={{ margin: "12px 0 0", fontSize: 11.5, opacity: .55, lineHeight: 1.5 }}>
            Para sua segurança e a nossa, registramos a data, a hora, o endereço IP e o navegador
            usados neste aceite, junto da versão exata do texto acima ({pacote.versao}).
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Hook do aceite de LOGIN ──────────────────────────────────────────────────
// `ativo` evita perguntar antes da sessão carregar (senão pisca o modal e some).
export function useTermosLogin(ativo: boolean) {
  const [precisa, setPrecisa] = useState(false);
  const [verificado, setVerificado] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    buscaPacote("login").then((p) => {
      if (!vivo) return;
      // Falha de rede NÃO tranca o painel: sem resposta, segue a vida e pergunta na próxima visita.
      setPrecisa(!!p && !p.aceito);
      setVerificado(true);
    });
    return () => { vivo = false; };
  }, [ativo]);

  const concluir = useCallback(() => setPrecisa(false), []);
  return { precisa: precisa && verificado, concluir };
}
