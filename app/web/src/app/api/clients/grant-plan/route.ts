import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Libera PLANO na mão (venda por fora da Kiwify) — soma dias no paid_until do cliente.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/clients/grant-plan", body);
  return Response.json(r.data, { status: r.status });
}
