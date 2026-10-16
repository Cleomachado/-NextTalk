import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Texto livre → fluxo pronto (a IA monta os nós; quem salva é o PUT /api/automations).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/automations/gerar-ia", body);
  return Response.json(r.data, { status: r.status });
}
