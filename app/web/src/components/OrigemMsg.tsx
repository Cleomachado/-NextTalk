"use client";

// Selo de ORIGEM numa mensagem enviada por nós: mostra quando foi uma PESSOA (e por onde), pra dar
// pra ver de relance que houve intervenção humana numa conversa da IA (pedido do dono, 02/10).
// Mensagem do robô não leva selo — é o caso normal, e selo em tudo vira ruído.
// `origem` vem do nosso arquivo (o motor classifica cada mensagem nossa que volta pelo webhook);
// `source` é o que o WhatsApp informa e cobre o histórico antigo do celular (android/ios).
import { Icon } from "@/components/icons";

// "ia" = fala do Agente IA (fluxo ou Atendente IA); "bot" = passo automático de fluxo. Antes a
// mensagem do robô não levava selo; o dono pediu pra IA aparecer também (03/10).
const ROTULO: Record<string, string> = { android: "Android", ios: "iPhone", web: "WhatsApp Web", painel: "ZapConverte", ia: "Agente IA", bot: "Automação IA", auto: "Automática do WhatsApp" };
const DE_MAQUINA = new Set(["ia", "bot", "auto"]);

export function rotuloOrigem(origem?: string | null, source?: string | null): string {
  if (origem && ROTULO[origem]) return ROTULO[origem];
  const s = String(source ?? "").toLowerCase();
  return s === "android" || s === "ios" ? ROTULO[s] : "";
}

// Quem da equipe respondeu pelo painel: o selo mostra o PRIMEIRO nome ("David") em vez de
// "ZapConverte"; o nome completo fica no tooltip (pedido do dono, 05/10). Mensagem antiga, sem
// autor gravado, continua "ZapConverte".
const primeiroNome = (n: string) => {
  const p = String(n || "").trim().split(/\s+/)[0] || "";
  return p.includes("@") ? p.split("@")[0] : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
};

export function OrigemMsg({ origem, source, autor }: { origem?: string | null; source?: string | null; autor?: string | null }) {
  const doPainelComNome = origem === "painel" && !!String(autor ?? "").trim();
  const r = doPainelComNome ? primeiroNome(autor!) : rotuloOrigem(origem, source);
  if (!r) return null;
  const maquina = !!origem && DE_MAQUINA.has(origem);
  return (
    <span className={"msg-origem" + (maquina ? " maquina" : "")}
      title={doPainelComNome ? `Enviada por ${autor} pelo ZapConverte, não pela IA` : origem === "ia" ? "Respondida pelo Agente IA" : origem === "bot" ? "Enviada automaticamente (fluxo ou IA)" : origem === "auto" ? "Saudação ou ausência automática configurada no app WhatsApp Business" : `Enviada por uma pessoa, pelo ${r} — não pela IA`}>
      <Icon name={maquina ? "bot" : "user"} size={10} />{r}
    </span>
  );
}
