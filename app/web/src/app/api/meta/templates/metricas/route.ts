import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Métricas de TODOS os templates numa resposta (a faixinha embaixo de cada card).
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  const r = await motor.get("/admin/meta/templates/metricas" + (qs ? "?" + qs : ""));
  return Response.json(r.data, { status: r.status });
}
