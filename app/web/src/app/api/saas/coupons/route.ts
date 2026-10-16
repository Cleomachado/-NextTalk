import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.get("/admin/coupons");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.put("/admin/coupons", await req.json().catch(() => ({})));
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.post("/admin/coupons/toggle", await req.json().catch(() => ({})));
  return Response.json(r.data, { status: r.status });
}
