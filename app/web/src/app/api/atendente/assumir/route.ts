import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// O Atendente IA assume uma conversa já parada: responde a última mensagem recebida do contato.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/atendente/assumir", body);
  return Response.json(r.data, { status: r.status });
}
