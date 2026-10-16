// ══ DESTINO SEGURO (anti-SSRF) ═══════════════════════════════════════════════════════════════
// Sempre que o MOTOR chama uma URL que o cliente escreveu (passo de HTTP/webhook de saída), o
// campo de URL vira uma janela pra rede interna se ninguém olhar: localhost, 10.x, e o
// 169.254.169.254 de metadados de nuvem. O cliente usaria o nosso servidor como procurador pra
// alcançar o que ele nunca alcançaria de fora.
//
// Estas funções nasceram na auditoria de 22/08 e viviam só no server.ts — usadas apenas pelo
// botão "testar" do painel. O passo que roda em PRODUÇÃO não passava por elas (só conferia se a
// URL começava com http). Extraído aqui pra ter UMA regra usada nos dois lugares.
import { lookup as dnsLookup } from "node:dns/promises";

// Um IP (v4 ou v6) que NÃO pode ser alcançado a partir daqui. Reescrito na auditoria 22/08: a
// versão anterior comparava a string do hostname, e o WHATWG URL entrega IPv6 COM colchetes —
// `new URL("http://[::1]/").hostname === "[::1]"`. Ou seja: `h === "::1"` era sempre falso e
// http://[::1]:5432/, http://[fd00::1]/ e o IPv4-mapeado http://[::ffff:127.0.0.1]/ passavam.
export function ipPrivado(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // ::ffff:127.0.0.1 conecta no IPv4 correspondente em pilha dupla — testa o IPv4 de dentro.
  // ⚠️ O `new URL()` NÃO guarda a forma pontilhada: ele normaliza pra HEXADECIMAL, então
  // "http://[::ffff:127.0.0.1]/" chega aqui como "::ffff:7f00:1". Sem desmontar os dois grupos
  // hex a checagem passava batido (pego pelo teste em scratchpad/ssrf-test.mjs).
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const pontilhado = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const alvo = hex
    ? [parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join(".")
    : pontilhado ? pontilhado[1] : v;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(alvo)) {
    const [a, b] = alvo.split(".").map(Number);
    return a === 0 || a === 127 || a === 10 ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||          // link-local / metadados de nuvem
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224;                             // multicast e reservado
  }
  if (alvo === "::" || alvo === "::1") return true;
  if (/^f[cd]/.test(alvo)) return true;    // ULA fc00::/7
  if (/^fe[89ab]/.test(alvo)) return true; // link-local fe80::/10
  if (/^ff/.test(alvo)) return true;       // multicast
  return false;
}
export function destinoPublicoOk(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return false;
  // Nome curto sem ponto = nome de serviço do Swarm (app, postgres, redis…) — vizinho de rede.
  if (!h.includes(".") && !h.includes(":") && !h.startsWith("[")) return false;
  return !ipPrivado(h);
}
// A checagem de string não basta: `atacante.com` com um A record apontando pra 10.0.0.5 passa nela
// e só o fetch descobre. Resolve o nome ANTES e recusa se QUALQUER endereço cair na rede interna.
// (Resta a janela teórica de DNS rebinding entre esta resolução e a conexão. Fechar exigiria fixar
// o socket no IP validado; aqui o prêmio é ler 600 bytes de um VPS Hostinger — que não tem serviço
// de metadados — então a troca não compensa a complexidade.)
export async function destinoResolveParaPublico(u: URL): Promise<boolean> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipPrivado(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return true; // já é IP e já passou
  try {
    const enderecos = await dnsLookup(host, { all: true });
    return enderecos.length > 0 && !enderecos.some((e) => ipPrivado(e.address));
  } catch {
    return false; // não resolveu: não tem por que sair daqui
  }
}

// 🛡️ FETCH QUE NÃO SEGUE REDIRECIONAMENTO CEGO.
//
// O `fetch` do Node segue até 20 saltos sozinho, e o `Location` não passa por validação nenhuma.
// Isso anula por completo a checagem de destino: o cliente aponta o nó pra um host público que
// ele controla, o host responde 302 pra http://169.254.169.254/ ou pra app:3333 dentro do Swarm,
// e o motor busca — e ainda devolve a resposta pro fluxo, que a mostra no painel. SSRF com
// exfiltração, não cego (auditoria 07/09).
//
// Aqui cada salto é revalidado pelo MESMO portão do primeiro, com teto de saltos. Quem redireciona
// mais que isso é destino defeituoso, não caso de uso.
export async function fetchSeguro(
  alvo: URL,
  init: RequestInit,
  opts?: { maxSaltos?: number },
): Promise<Response> {
  const maxSaltos = opts?.maxSaltos ?? 3;
  let atual = alvo;
  for (let saltos = 0; ; saltos++) {
    const r = await fetch(atual.toString(), {
      ...init,
      // do 2º salto em diante é GET sem corpo: é o que todo cliente HTTP faz num 302/303.
      ...(saltos === 0 ? {} : { method: "GET", body: undefined }),
      redirect: "manual",
    });
    const destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!destino) return r;
    if (saltos + 1 > maxSaltos) throw new Error(`o destino redirecionou mais de ${maxSaltos} vezes`);
    let proximo: URL;
    try { proximo = new URL(destino, atual); } catch { throw new Error("o destino redirecionou pra um endereço inválido"); }
    if (!destinoPublicoOk(proximo) || !(await destinoResolveParaPublico(proximo))) {
      throw new Error(`o destino redirecionou pra um endereço de rede interna (${proximo.hostname})`);
    }
    atual = proximo;
  }
}
