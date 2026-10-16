import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Testa a chave salva com a chamada mais leve da API do Asaas (lista 1 cliente).
export async function POST() {
  const r = await motor.post("/admin/asaas/testar", {});
  return Response.json(r.data, { status: r.status });
}
