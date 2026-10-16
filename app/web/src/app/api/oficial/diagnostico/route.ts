import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// JSON cru dos números da conta oficial (o que a Meta realmente devolve) — pra diagnosticar
// campo vazio na tela de Métricas. Abra logado: /api/oficial/diagnostico
export async function GET() {
  const r = await motor.get("/admin/oficial/diagnostico");
  return Response.json(r.data, { status: r.status });
}
