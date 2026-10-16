import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Conversas do número do CLIENTE (escopado pela sessão no motor).
export async function GET() {
  const r = await motor.get("/app/inbox/chats");
  return Response.json(r.data, { status: r.status });
}
