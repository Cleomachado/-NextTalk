import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Apaga a captura de teste do webhook guardada no motor (botão "apagar captura" do builder).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-clear", body);
  return Response.json(r.data, { status: r.status });
}
