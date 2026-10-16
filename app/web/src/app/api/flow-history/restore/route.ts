import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Restaura uma versão do histórico do fluxo (a restauração vira uma versão nova).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-history/restore", body);
  return Response.json(r.data, { status: r.status });
}
