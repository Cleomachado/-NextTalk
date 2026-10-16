// Modelo de GRAFO do fluxo (nós + arestas). O motor percorre o grafo seguindo as arestas.
// Retrocompatível: um fluxo salvo como `steps[]` (linear) é migrado pra um grafo linear
// (trigger → s0 → s1 → …) que executa IDÊNTICO. Ramificação (saídas por handle) entra por cima.
import type { Step } from "./runner.js";

export interface FlowNode {
  id: string;
  type: string; // "trigger" ou um tipo de passo
  data: any; // trigger: { trigger, keyword }; passo: o próprio Step
  position?: { x: number; y: number };
}
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string | null; // ramo de saída (ex.: nome do caminho do agente, "b0" do botão, "ended")
  target: string;
}
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface GraphSource {
  steps?: Step[];
  edges?: FlowEdge[];
  trigger?: string;
  keyword?: string;
  layout?: Record<string, { x: number; y: number }>;
}

// Constrói o grafo: os NÓS são sempre os steps[] (id = _id); as CONEXÕES vêm de `edges` se
// existirem (fluxo ramificado), senão são geradas lineares (trigger → s0 → s1 → …).
export function toGraph(a: GraphSource): FlowGraph {
  const steps = Array.isArray(a.steps) ? a.steps : [];
  const idOf = (s: Step | undefined, i: number) => s?._id ?? "s" + i;
  const nodes: FlowNode[] = [{ id: "trigger", type: "trigger", data: { trigger: a.trigger, keyword: a.keyword }, position: a.layout?.trigger }];
  steps.forEach((s, i) => {
    const id = idOf(s, i);
    nodes.push({ id, type: s.type, data: s, position: a.layout?.[id] });
  });
  // [] ≠ ausente. `edges: []` é um grafo MATERIALIZADO sem conexões (a pessoa apagou a última
  // seta); só `edges` AUSENTE significa fluxo linear antigo (espinha deduzida da ordem dos passos).
  // Tratar [] como "volta a ser linear" fazia a seta apagada RENASCER na tela e o motor rodar uma
  // espinha que o canvas não mostrava (bug do × que "não rompia", 20/08).
  const edges: FlowEdge[] =
    Array.isArray(a.edges)
      ? a.edges
      : steps.map((s, i) => ({ id: "e" + i, source: i === 0 ? "trigger" : idOf(steps[i - 1], i - 1), target: idOf(s, i) }));
  return { nodes, edges };
}

export function getNode(g: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  return id ? g.nodes.find((n) => n.id === id) : undefined;
}

// Próximo nó a partir de `fromId`. Com `handle`, procura a aresta daquele ramo; se não achar,
// cai na aresta default (sem handle). Sem `handle`, usa a default. Retorna null se não houver saída.
export function nextNodeId(g: FlowGraph, fromId: string, handle?: string | null): string | null {
  const out = g.edges.filter((e) => e.source === fromId);
  if (handle != null) {
    const exact = out.find((e) => (e.sourceHandle ?? null) === handle);
    if (exact) return exact.target;
    const def = out.find((e) => e.sourceHandle == null);
    return def ? def.target : null;
  }
  const def = out.find((e) => e.sourceHandle == null) ?? out[0];
  return def ? def.target : null;
}

// Saída PADRÃO no sentido estrito: só a aresta sem handle. Diferente de nextNodeId(…, null), que
// cai no `out[0]` quando não há padrão — num Agente IA com vários caminhos, esse `out[0]` é o
// PRIMEIRO caminho desenhado, ou seja, um ramo escolhido por acaso. Serve pra quando a IA falha ou
// a conversa encerra: melhor não seguir nada do que despejar um ramo aleatório no lead.
export function saidaPadrao(g: FlowGraph, fromId: string): string | null {
  const def = g.edges.find((e) => e.source === fromId && e.sourceHandle == null);
  return def ? def.target : null;
}

// Existe uma aresta EXPLÍCITA (com esse handle) saindo do nó? (distingue ramo definido de fallback)
export function hasHandleEdge(g: FlowGraph, fromId: string, handle: string): boolean {
  return g.edges.some((e) => e.source === fromId && (e.sourceHandle ?? null) === handle);
}

// Saídas do AGENTE IA desenhadas no canvas: "ended" (✓✓ encerrou — a agente chamou encerrar) e
// "fallback" (? não identificou / turnos — estourou os turnos, a IA falhou ou o caminho não existe).
// O builder sempre ofereceu essas portas, mas o motor só seguia a ligação SEM porta: a seta do
// fluxo do Dr. Exemplo (fallback → espera 20 min → "Ficou alguma dúvida?") nunca rodava (04/10).
// A porta desenhada manda; sem ela, cai na saída padrão — fluxo antigo continua idêntico.
export function saidaDoAgente(g: FlowGraph, fromId: string, porta: "ended" | "fallback"): string | null {
  return hasHandleEdge(g, fromId, porta) ? nextNodeId(g, fromId, porta) : saidaPadrao(g, fromId);
}
