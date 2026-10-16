import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Descobre (ou cria) o conjunto de dados da WABA conectada — 1 clique, sem caçar ID no Gerenciador.
export async function POST() {
  const r = await motor.post("/admin/capi-whatsapp/descobrir", {});
  return Response.json(r.data, { status: r.status });
}
