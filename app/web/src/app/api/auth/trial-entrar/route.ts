import { NextResponse } from "next/server";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Porta de entrada do TESTE GRÁTIS de afiliado: o lead chega de seudominio.com.br/promo/<slug>
// com um código de 1 uso (?c=), o motor troca por sessão e o lead cai LOGADO no painel.
// Código inválido/expirado → tela de entrar (a conta existe; ele entra com "esqueci a senha"
// ou pede novo acesso — nunca fica preso numa página em branco).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("c") ?? "";
  const r = code ? await motor.post("/auth/trial-code", { code }) : { ok: false, data: null as any };
  const token = r.ok ? String((r.data as any)?.token ?? "") : "";
  const res = NextResponse.redirect(new URL(token ? "/" : "/entrar", url.origin));
  if (token) res.cookies.set("zc_session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
  return res;
}
