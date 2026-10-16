import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const since = new URL(req.url).searchParams.get("since");
  const r = await motor.get("/admin/sales-summary" + (since ? `?since=${encodeURIComponent(since)}` : ""));
  return Response.json(r.data, { status: r.status });
}
