import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const account = q.get("account") ?? "lite";
  const limit = q.get("limit"); // a busca do painel pede a lista completa (limit alto)
  const r = await motor.get("/admin/inbox/chats?account=" + encodeURIComponent(account) + (limit ? "&limit=" + encodeURIComponent(limit) : ""));
  return Response.json(r.data, { status: r.status });
}
