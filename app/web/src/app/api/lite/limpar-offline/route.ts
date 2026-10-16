import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Limpa as bolinhas offline: apaga as instâncias EXTRAS desconectadas e "esquece" o perfil antigo
// da principal (que não pode ser apagada — o token vem do .env). Cliente não é tocado.
export async function POST() {
  const r = await motor.post("/admin/lite/limpar-offline", {});
  return Response.json(r.data, { status: r.status });
}
