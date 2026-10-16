import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Pausas do corte da IA (dono assumiu a conversa pelo celular): lista as ativas.
export async function GET() {
  const r = await motor.get("/admin/bot-pausas");
  return Response.json(r.data, { status: r.status });
}
