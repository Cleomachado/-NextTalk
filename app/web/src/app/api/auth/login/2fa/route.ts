import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// 2º passo do login (2FA): ticket + código do app → motor valida → sessão no cookie.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/login/2fa", { tfa: b?.tfa, code: b?.code });
  if (r.ok && r.data?.token) {
    (await cookies()).set("zc_session", r.data.token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
    return Response.json({ ok: true });
  }
  return Response.json(r.data, { status: r.status });
}
