import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// Super-admin: libera quantos números de WhatsApp um cliente pode conectar.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/clients/number-limit", body);
  return Response.json(r.data, { status: r.status });
}
