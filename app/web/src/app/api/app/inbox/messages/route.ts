import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Mensagens de uma conversa do cliente.
export async function GET(req: Request) {
  const chatid = new URL(req.url).searchParams.get("chatid") ?? "";
  const r = await motor.get("/app/inbox/messages?chatid=" + encodeURIComponent(chatid));
  return Response.json(r.data, { status: r.status });
}
