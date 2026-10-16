import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Disparos em andamento (Disparador + fluxos com Loop), com progresso e métricas.
export async function GET() {
  const r = await motor.get("/admin/oficial/disparos");
  return Response.json(r.data, { status: r.status });
}
