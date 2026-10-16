import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Reativa a IA pra um telefone ({phone}) ou pra todas as conversas (corpo vazio).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/bot-pausas/clear", body);
  return Response.json(r.data, { status: r.status });
}
