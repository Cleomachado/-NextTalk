import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// PÚBLICO: aceita o convite (cria a conta ou vincula a existente) e já entrega a sessão no cookie.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/invite/accept", { token: b?.token, name: b?.name, password: b?.password });
  if (r.ok && r.data?.token) {
    (await cookies()).set("zc_session", r.data.token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
    return Response.json({ ok: true });
  }
  // Conta já existia COM 2FA: entrou na equipe, mas precisa logar (o código do app é exigido lá).
  if (r.ok && r.data?.needLogin) return Response.json({ ok: true, needLogin: true });
  return Response.json(r.data, { status: r.status });
}
