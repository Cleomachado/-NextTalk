"use client";

import { useEffect, useState } from "react";
import { jget } from "@/lib/client";

export interface Permissoes { paginas?: string[] | null; contas?: string[] | null }
interface Area { id: string; rotulo: string; grupo: string }
interface Conta { id: string; name?: string; number?: string; type?: string }

// Editor de PERMISSÕES de um membro: quais páginas ele abre e quais contas (números) enxerga.
// O catálogo de áreas vem do MOTOR — a tela nunca oferece uma permissão que o servidor não
// saiba aplicar. "Acesso total" é o estado sem restrição (o mesmo de quem já estava na equipe).
export function PermissoesMembro({ valor, onChange, titulo }: {
  valor: Permissoes | null;
  onChange: (p: Permissoes | null) => void;
  titulo?: string;
}) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);

  useEffect(() => {
    jget("/api/app/team/areas").then((d) => setAreas(d?.areas ?? [])).catch(() => {});
    jget("/api/accounts").then((d) => setContas(d?.accounts ?? [])).catch(() => {});
  }, []);

  const restrito = !!valor?.paginas;
  const paginas = valor?.paginas ?? [];
  const contasSel = valor?.contas ?? null;

  function togglePagina(id: string) {
    const nova = paginas.includes(id) ? paginas.filter((p) => p !== id) : [...paginas, id];
    onChange({ ...(valor ?? {}), paginas: nova });
  }
  function toggleConta(id: string) {
    const base = contasSel ?? contas.map((c) => c.id);
    const nova = base.includes(id) ? base.filter((c) => c !== id) : [...base, id];
    onChange({ ...(valor ?? {}), paginas: valor?.paginas ?? [], contas: nova });
  }

  const grupos = [...new Set(areas.map((a) => a.grupo))];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {titulo && <div style={{ fontSize: 13, fontWeight: 650 }}>{titulo}</div>}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={!restrito}
          onChange={(e) => onChange(e.target.checked ? null : { paginas: [], contas: null })} />
        Acesso total (tudo que o papel dele permite)
      </label>

      {restrito && (
        <>
          <div className="muted" style={{ fontSize: 12 }}>
            Marque só o que essa pessoa pode abrir. O que ficar desmarcado some do menu dela e é
            recusado pelo servidor, mesmo se ela digitar o endereço.
          </div>

          {grupos.map((g) => (
            <div key={g} style={{ display: "grid", gap: 5 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{g}</div>
              {areas.filter((a) => a.grupo === g).map((a) => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={paginas.includes(a.id)} onChange={() => togglePagina(a.id)} />
                  {a.rotulo}
                </label>
              ))}
            </div>
          ))}

          {contas.length > 1 && (
            <div style={{ display: "grid", gap: 5, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>Números que ela enxerga</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={contasSel === null}
                  onChange={(e) => onChange({ ...(valor ?? {}), paginas: valor?.paginas ?? [], contas: e.target.checked ? null : contas.map((c) => c.id) })} />
                Todos os números
              </label>
              {contasSel !== null && contas.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingLeft: 18 }}>
                  <input type="checkbox" checked={contasSel.includes(c.id)} onChange={() => toggleConta(c.id)} />
                  {c.name || c.id} {c.number ? <span className="muted">· {c.number}</span> : null}
                  {c.type && <span className="muted" style={{ fontSize: 11 }}>({c.type})</span>}
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
