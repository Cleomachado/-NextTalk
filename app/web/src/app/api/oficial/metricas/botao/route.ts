import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Quem clicou num botão de resposta de um template no período (?template=&botao=&waba=&de=&ate=).
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  const r = await motor.get("/admin/oficial/metricas/botao" + qs);
  return Response.json(r.data, { status: r.status });
}
