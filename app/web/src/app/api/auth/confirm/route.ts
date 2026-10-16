import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Confirma o e-mail (token do link) → o motor devolve a sessão, e aqui setamos o cookie (já loga).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/confirm", { token: b?.token });
  if (r.ok && r.data?.token) {
    (await cookies()).set("zc_session", r.data.token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
    return Response.json({ ok: true });
  }
  return Response.json(r.data, { status: r.status });
}
