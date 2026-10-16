import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Aplica o reset com o token do e-mail + a nova senha.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/reset", { token: b?.token, password: b?.password });
  return Response.json(r.data, { status: r.status });
}
