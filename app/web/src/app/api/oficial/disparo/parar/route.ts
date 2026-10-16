import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Para o disparo em andamento (o que já foi enviado, foi — o relatório mostra até onde chegou).
export async function POST() {
  const r = await motor.post("/admin/oficial/disparo/parar", {});
  return Response.json(r.data, { status: r.status });
}
