import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Apaga UMA passagem do funil (linha da lista de leads de um nó). O remap do motor manda
// cliente pra /app/* — cada um só apaga o que é do próprio workspace.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-node-hit-delete", body);
  return Response.json(r.data, { status: r.status });
}
