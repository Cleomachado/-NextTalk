import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Guarda (ou apaga) o exemplo de teste do gatilho DENTRO do fluxo, pra sobreviver a reload e deploy.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-example", body);
  return Response.json(r.data, { status: r.status });
}
