import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Meta de vendas + comparecimento de uma turma do workshop (o que Kiwify e Meta não sabem).
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/lancamento/turma", body);
  return Response.json(r.data, { status: r.status });
}
