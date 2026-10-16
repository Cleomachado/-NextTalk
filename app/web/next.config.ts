import type { NextConfig } from "next";

// 🔐 CABEÇALHOS DE SEGURANÇA (auditoria 07/09). O painel não mandava nenhum.
//
// O que cada um resolve AQUI, neste produto — nada é boilerplate:
//  · HSTS ......... o painel redireciona http→https, mas a PRIMEIRA visita (ou a aba digitada à
//                   mão) ainda sai em texto claro. Num Wi-Fi de coworking dá pra interceptar esse
//                   salto e servir um painel clonado que colhe e-mail e senha. Com HSTS o
//                   navegador nem tenta http depois da primeira visita.
//  · nosniff ...... o painel serve anexo e mídia por /api/media e /api/inbox/download; sem isto o
//                   navegador pode "adivinhar" o tipo e executar como HTML o que era pra ser anexo.
//  · frame ........ ninguém emoldura o painel (o cookie é SameSite=Lax, então dentro de um iframe
//                   de terceiro ele já apareceria deslogado — mas negar é mais barato que explicar).
//  · Referrer ..... o painel tem MUITO link pra fora (Kiwify, Meta Business, wa.me). Sem política,
//                   a URL interna que a pessoa estava vendo viaja no Referer pro site de destino.
//  · Permissions .. microfone fica LIBERADO de propósito: o painel grava áudio de verdade (o PTT do
//                   inbox e do builder). Câmera pode negar — o QR é DESENHADO na tela, nunca lido.
//
// CSP fica de fora por enquanto, e de propósito: o App Router injeta script inline de hidratação,
// então uma CSP útil aqui exige plumbing de nonce no middleware. Entrar com 'unsafe-inline' daria
// uma falsa sensação de proteção. O caminho certo está descrito no SECURITY_AUDIT.md (subir como
// Content-Security-Policy-Report-Only primeiro, observar, depois enforçar).
const seguranca = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Painel visual do ZapConverte. Roda NA VPS (Docker + Traefik), nunca local.
  // "standalone" gera um servidor auto-contido — imagem Docker pequena.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default nextConfig;
