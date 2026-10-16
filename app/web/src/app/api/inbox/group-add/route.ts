import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Adiciona membros a um grupo (modal "Dados da conversa" → Membros → Adicionar).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/group-add", body);
  return Response.json(r.data, { status: r.status });
}
