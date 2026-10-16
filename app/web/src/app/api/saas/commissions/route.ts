import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.get("/admin/commissions");
  return Response.json(r.data, { status: r.status });
}
// Marca uma comissão como paga: { id }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.post("/admin/commissions/pay", await req.json().catch(() => ({})));
  return Response.json(r.data, { status: r.status });
}
