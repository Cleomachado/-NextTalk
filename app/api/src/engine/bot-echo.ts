// Supressão de ECO do próprio bot.
// Tudo que ENVIAMOS num chat 1:1 volta pelo webhook como fromMe. A escuta de lembrete aceita
// fromMe (o dono ditando) — então, sem isto, QUALQUER mensagem que o bot manda nesse chat (prompt,
// passo de fluxo, lembrete agendado, notify…) seria interpretada como "o lembrete ditado" → parse
// falha → loop / lembrete-fantasma. Registramos o texto de TODO envio 1:1 e ignoramos o eco exato.
import type { WhatsAppGateway } from "../gateway/types.js";

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");
const recent = new Map<string, { texts: string[]; at: number }>();
const WINDOW = 10 * 60_000;

export function noteBotEcho(to: string, text: string): void {
  const t = (text || "").trim();
  if (!t) return;
  const key = onlyDigits(to);
  if (!key) return;
  const e = recent.get(key) ?? { texts: [], at: 0 };
  e.texts = [...e.texts.slice(-8), t];
  e.at = Date.now();
  recent.set(key, e);
  if (recent.size > 800) {
    for (const [k, v] of recent) if (Date.now() - v.at > WINDOW) recent.delete(k);
  }
}

export function isBotEcho(phone: string, text: string): boolean {
  const t = (text || "").trim();
  const e = recent.get(onlyDigits(phone));
  if (!e || !t || Date.now() - e.at > WINDOW) return false;
  return e.texts.includes(t);
}

// Envolve um gateway pra que TODO envio 1:1 registre o eco automaticamente (raiz da supressão).
// Só intercepta sendText/sendMedia(caption)/sendButtons; o resto delega intacto (this = gw original,
// pra métodos internos como sendPtt→sendMedia não perderem o vínculo).
export function withEchoGuard(gw: WhatsAppGateway): WhatsAppGateway {
  return new Proxy(gw, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (prop === "sendText") {
        return (to: string, text: string, delayMs?: number) => {
          noteBotEcho(to, text);
          return (orig as WhatsAppGateway["sendText"]).call(target, to, text, delayMs);
        };
      }
      if (prop === "sendButtons") {
        return (to: string, text: string, buttons: string[], delayMs?: number) => {
          noteBotEcho(to, text);
          return (orig as WhatsAppGateway["sendButtons"]).call(target, to, text, buttons, delayMs);
        };
      }
      if (prop === "sendMedia") {
        return (input: Parameters<WhatsAppGateway["sendMedia"]>[0]) => {
          if (input?.caption) noteBotEcho(input.to, input.caption);
          return (orig as WhatsAppGateway["sendMedia"]).call(target, input);
        };
      }
      return typeof orig === "function" ? (orig as (...a: unknown[]) => unknown).bind(target) : orig;
    },
  });
}
