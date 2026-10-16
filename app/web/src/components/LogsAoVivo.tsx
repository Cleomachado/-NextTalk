"use client";

// LOGS AO VIVO (só super-admin): tail do que o motor está fazendo AGORA, direto do ring em memória.
// Pra que serve: "mandei um oi e não apareceu" → abre aqui, manda de novo e OLHA — o webhook bateu?
// a assinatura passou? achou o dono do número (grep "SEM DONO")? o fluxo disparou?
// Poll incremental a cada 2s (?depois=<último id>); pausa, filtro e auto-rolagem quando no fim.
import { useCallback, useEffect, useRef, useState } from "react";
import { jget } from "@/lib/client";

interface Linha { id: number; ts: number; nivel: "info" | "aviso" | "erro"; texto: string }

const COR: Record<Linha["nivel"], string> = { info: "var(--ink)", aviso: "var(--warn)", erro: "var(--crit)" };
const MAX_TELA = 3000; // acima disso corta o começo — a tela é lupa, não arquivo

export function LogsAoVivo() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pausado, setPausado] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const ultimoId = useRef(0);
  const fimRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);

  const busca = useCallback(async () => {
    try {
      const d = await jget("/api/logs?depois=" + ultimoId.current);
      const novas: Linha[] = Array.isArray(d.linhas) ? d.linhas : [];
      if (novas.length) {
        ultimoId.current = novas[novas.length - 1].id;
        setLinhas((prev) => {
          const tudo = [...prev, ...novas];
          return tudo.length > MAX_TELA ? tudo.slice(tudo.length - MAX_TELA) : tudo;
        });
      }
      setErro("");
    } catch (e: any) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    if (pausado) return;
    busca();
    const t = setInterval(busca, 2000);
    return () => clearInterval(t);
  }, [busca, pausado]);

  // Auto-rolagem SÓ se você já está no fim (subiu pra ler → a tela não te puxa de volta).
  useEffect(() => {
    if (grudado.current) fimRef.current?.scrollIntoView({ behavior: "auto" });
  }, [linhas]);
  function aoRolar() {
    const el = areaRef.current;
    if (el) grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo ? linhas.filter((l) => l.texto.toLowerCase().includes(termo)) : linhas;
  const hora = (ts: number) => new Date(ts).toLocaleTimeString("pt-BR", { hour12: false }) + "." + String(ts % 1000).padStart(3, "0");

  return (
    <div className="card">
      <div className="card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
        <input
          className="inp"
          style={{ flex: "1 1 260px", maxWidth: 420 }}
          placeholder="Filtrar (ex.: meta, SEM DONO, fluxo, erro)…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <button className="btn" onClick={() => setPausado((p) => !p)}>{pausado ? "Retomar" : "Pausar"}</button>
        <button className="btn" onClick={() => { setLinhas([]); }}>Limpar a tela</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {pausado ? "pausado" : "ao vivo · atualiza a cada 2s"} · {visiveis.length} linha{visiveis.length === 1 ? "" : "s"}
        </span>
      </div>
      {erro && (
        <div className="card-pad" style={{ color: "var(--crit)", fontSize: 13, borderBottom: "1px solid var(--line)" }}>
          Falhou ao buscar os logs: {erro}
        </div>
      )}
      <div
        ref={areaRef}
        onScroll={aoRolar}
        style={{ height: "calc(100vh - 250px)", minHeight: 320, overflowY: "auto", padding: "10px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.55 }}
      >
        {visiveis.length === 0 ? (
          <div className="muted">Nenhuma linha ainda{termo ? " com esse filtro" : ""}. O motor grava aqui tudo que loga — mande uma mensagem de teste e acompanhe.</div>
        ) : (
          visiveis.map((l) => (
            <div key={l.id} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: COR[l.nivel] }}>
              <span className="muted" style={{ marginRight: 8 }}>{hora(l.ts)}</span>
              {l.texto}
            </div>
          ))
        )}
        <div ref={fimRef} />
      </div>
    </div>
  );
}
