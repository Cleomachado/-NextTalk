import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Inbox da API Oficial: lê o arquivo do motor (a Meta não devolve histórico).
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  const r = await motor.get("/admin/oficial/chats" + (qs ? "?" + qs : ""));
  return Response.json(r.data, { status: r.status });
}
