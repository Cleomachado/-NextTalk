import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// "Esqueci minha senha" → o motor manda o link de reset por e-mail (resposta sempre genérica).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/forgot", { email: b?.email });
  return Response.json(r.data, { status: r.status });
}
