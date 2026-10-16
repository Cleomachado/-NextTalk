import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// GET = URL atual sem trocar o token (abrir o painel não invalida o endereço em uso);
// POST = gera/troca. O remap admin→app do motor.ts resolve o papel da sessão.
export async function GET(req: Request) {
  const automationId = new URL(req.url).searchParams.get("automationId") ?? "";
  const r = await motor.get("/admin/flow-webhook-token?automationId=" + encodeURIComponent(automationId));
  return Response.json(r.data, { status: r.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-token", body);
  return Response.json(r.data, { status: r.status });
}
