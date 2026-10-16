import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// ▶ Passo a passo DE VERDADE: executa um nó do fluxo com o payload capturado e devolve o próximo.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/automations/executar-passo", body);
  return Response.json(r.data, { status: r.status });
}
