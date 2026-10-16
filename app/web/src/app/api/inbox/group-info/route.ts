import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Ficha do grupo (descrição, criador, membros) — pro modal "Dados da conversa".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await motor.get("/admin/inbox/group-info" + url.search);
  return Response.json(r.data, { status: r.status });
}
