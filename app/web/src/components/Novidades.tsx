"use client";

// Página "Novidades": o changelog do produto em linha do tempo. O conteúdo vive em lib/novidades.ts
// (é lá que se escreve o que saiu). Quem marca como lida é o Shell — ele já sabe a rota atual.
import { NOVIDADES, VERSAO_ATUAL } from "@/lib/novidades";

const fmtData = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function NovidadesView() {
  return (
    <div style={{ maxWidth: 760 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad">
          <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>Novidades</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            O que melhoramos pra você. A ferramenta evolui toda semana — você está na versão <b>v{VERSAO_ATUAL}</b>.
          </p>
        </div>
      </div>

      {NOVIDADES.map((v) => (
        <div key={v.versao} style={{ marginBottom: 22 }}>
          <div className="nov-ver">
            <span className="nov-ver-num">v{v.versao}</span>
            <span className="muted" style={{ fontSize: 12 }}>{fmtData(v.data)}</span>
          </div>
          <div className="nov-lista">
            {v.itens.map((it) => (
              <div key={it.titulo} className="nov-item">
                <div className="card">
                  <div className="card-pad">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <b style={{ fontSize: 14.5 }}>{it.titulo}</b>
                      <span className={"nov-tag" + (it.tipo === "novo" ? " novo" : "")}>{it.tipo === "novo" ? "NOVO" : "MELHORIA"}</span>
                    </div>
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{it.texto}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        Tem uma ideia ou sentiu falta de algo? Fale com a gente no WhatsApp do suporte — boa parte do que
        está aqui em cima nasceu de pedido de cliente.
      </p>
    </div>
  );
}
