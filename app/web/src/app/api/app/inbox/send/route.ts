import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Enviar mensagem por uma conversa do cliente.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/inbox/send", body);
  return Response.json(r.data, { status: r.status });
}
