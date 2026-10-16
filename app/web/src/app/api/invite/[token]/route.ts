import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// PÚBLICO: dados do convite (de quem é, qual papel, se precisa criar conta).
// O caminho no motor começa com /auth/ → o portão do motor.ts não exige sessão.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = String(token ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (!clean) return Response.json({ error: "convite inválido" }, { status: 400 });
  const r = await motor.get(`/auth/invite/${clean}`);
  return Response.json(r.data, { status: r.status });
}
