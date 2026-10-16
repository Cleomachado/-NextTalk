import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Sai do grupo (modal "Dados da conversa" → Sair do grupo).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/group-leave", body);
  return Response.json(r.data, { status: r.status });
}
