import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Token do workspace pro rastreio de origem da página (Integrações → Origem dos leads). Cria na 1ª vez.
export async function GET() {
  const r = await motor.get("/admin/clique/token");
  return Response.json(r.data, { status: r.status });
}
