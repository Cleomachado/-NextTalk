// ══ FEATURES LIBERADAS POR CLIENTE ═══════════════════════════════════════════════════════════
// Recurso que exige aprovação prévia do super admin: nasce ligado só pra ele e cada cliente é
// liberado a dedo, na tela de Clientes. (Pedido do dono, 25/08 — pro nó de código, que executa
// JavaScript e não pode ficar aberto pra qualquer conta nova.)
//
// ⚠️ REGRA: a UI esconder NÃO é controle. Quem decide é o MOTOR, na hora de rodar e na hora de
// salvar — senão bastava importar um JSON com o nó dentro pra usar sem liberação. A lista visual
// é conveniência; o portão é `workspacePodeUsar`.
import { getCachedFor, getPrimaryWorkspace } from "./config-store.js";

export interface FeatureCatalogo {
  id: string;
  nome: string;
  descricao: string;
  risco?: string; // por que exige aprovação (aparece na tela de liberação)
}

export const FEATURES: FeatureCatalogo[] = [
  {
    id: "code_node",
    nome: "Nó de código (JavaScript)",
    descricao: "Deixa o cliente escrever JavaScript dentro do fluxo pra tratar dados — formatar data, calcular valor, montar texto.",
    risco: "Executa código escrito pelo cliente. Roda num interpretador isolado, sem rede, sem arquivos e sem variáveis de ambiente, com limite de tempo — mas ainda assim é o recurso mais sensível do produto.",
  },
];

const CHAVE = "features-liberadas";

export function featuresDoWorkspace(wsId: string): string[] {
  const v = getCachedFor<string[]>(wsId, CHAVE);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// O super admin tem TODAS as features — é ele quem aprova, então não precisa se aprovar.
export function workspacePodeUsar(wsId: string, featureId: string): boolean {
  if (wsId === getPrimaryWorkspace()) return true;
  return featuresDoWorkspace(wsId).includes(featureId);
}
