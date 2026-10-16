import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// "Colar payload" do gatilho webhook: manda o JSON de exemplo pro motor processar e guardar
// como captura de teste (sem disparar nada).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-simulate", body);
  return Response.json(r.data, { status: r.status });
}
