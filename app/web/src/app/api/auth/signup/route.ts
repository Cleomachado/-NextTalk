import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Cadastro: cria a conta no motor e já entra (cookie de sessão).
// O ?ref (afiliado) e ?cupom capturados pelo middleware entram automaticamente.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const jar = await cookies();
  const ref = b?.ref || jar.get("zc_ref")?.value || undefined;
  const coupon = b?.coupon || jar.get("zc_cupom")?.value || undefined;
  const r = await motor.post("/auth/signup", { name: b?.name, email: b?.email, password: b?.password, coupon, ref });
  if (r.ok && r.data?.token) {
    jar.set("zc_session", r.data.token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
    jar.delete("zc_ref");
    jar.delete("zc_cupom");
    // couponWarning: cupom não aplicado (inválido/esgotado). O usuário precisa saber — senão
    // cai no paywall achando que tinha teste. A tela de cadastro mostra esse aviso antes de entrar.
    return Response.json({ ok: true, couponWarning: r.data?.couponWarning });
  }
  return Response.json(r.data, { status: r.status });
}
