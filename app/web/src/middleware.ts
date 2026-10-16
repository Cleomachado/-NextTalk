import { NextResponse, type NextRequest } from "next/server";

// Portão de sessão do painel: sem cookie de sessão → /entrar.
// A validação REAL do token acontece no servidor (lib/motor.ts checa a sessão no motor
// em toda chamada proxied) — aqui é só o redirecionamento amigável + captura de ?ref/?cupom.
// /convite/<token> e /api/invite/ são públicos: quem foi convidado pra Equipe ainda não tem conta.
// /esqueci, /redefinir e /confirmar são públicas: quem redefine senha ou confirma e-mail NÃO tem
// sessão ainda — sem isto o link do e-mail bounce pro /entrar (bug de 09/08).
const PUBLIC_PREFIXES = ["/entrar", "/cadastro", "/api/auth/", "/convite/", "/api/invite/", "/seja-afiliado", "/esqueci", "/redefinir", "/confirmar"];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  const token = req.cookies.get("zc_session")?.value;

  let res: NextResponse;
  if (!isPublic && !token) {
    if (pathname.startsWith("/api/")) {
      res = NextResponse.json({ error: "não autenticado" }, { status: 401 });
    } else {
      const url = new URL("/entrar", req.url);
      res = NextResponse.redirect(url);
    }
  } else if ((pathname === "/entrar" || pathname === "/cadastro") && token) {
    // Já logado → painel (evita ficar preso na tela de login).
    res = NextResponse.redirect(new URL("/", req.url));
  } else {
    res = NextResponse.next();
  }

  // Link de afiliado (?ref=CODIGO) e cupom (?cupom=CODIGO) — guarda 30 dias pro cadastro.
  const ref = searchParams.get("ref");
  if (ref) res.cookies.set("zc_ref", ref.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40), { maxAge: 30 * 86400, path: "/" });
  const cupom = searchParams.get("cupom");
  if (cupom) res.cookies.set("zc_cupom", cupom.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40), { maxAge: 30 * 86400, path: "/" });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)).*)"],
};
