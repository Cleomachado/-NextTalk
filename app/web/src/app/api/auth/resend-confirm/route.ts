import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Reenvia o e-mail de confirmação (resposta sempre genérica).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/resend-confirm", { email: b?.email });
  return Response.json(r.data, { status: r.status });
}
