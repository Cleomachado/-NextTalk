import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/login", { email: b?.email, password: b?.password });
  if (r.ok && r.data?.token) {
    (await cookies()).set("zc_session", r.data.token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 86400, path: "/" });
    return Response.json({ ok: true });
  }
  return Response.json(r.data, { status: r.status });
}
