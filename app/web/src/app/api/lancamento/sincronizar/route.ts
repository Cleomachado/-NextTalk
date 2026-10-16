import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Puxa agora os últimos 30 dias da Meta (além do automático de 30 em 30 min).
export async function POST() {
  const r = await motor.post("/admin/lancamento/sincronizar", {});
  return Response.json(r.data, { status: r.status });
}
