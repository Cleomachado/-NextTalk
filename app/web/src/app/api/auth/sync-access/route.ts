import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// "Já assinei": re-checa a compra na Kiwify e libera o plano se o e-mail já pagou.
export async function POST() {
  const token = (await cookies()).get("zc_session")?.value;
  if (!token) return Response.json({ error: "não autenticado" }, { status: 401 });
  const r = await motor.post("/auth/sync-access", {}, { "x-session-token": token });
  return Response.json(r.data, { status: r.status });
}
