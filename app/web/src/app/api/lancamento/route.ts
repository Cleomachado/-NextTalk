import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Dashboard de Lançamento (admin): Meta Ads × vendas reais Kiwify × conversas, por período.
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  const r = await motor.get("/admin/lancamento" + qs);
  return Response.json(r.data, { status: r.status });
}
