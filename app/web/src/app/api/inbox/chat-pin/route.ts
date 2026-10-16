import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Fixa/desafixa uma conversa no topo da lista (até 10, igual o WhatsApp).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/chat-pin", body);
  return Response.json(r.data, { status: r.status });
}
