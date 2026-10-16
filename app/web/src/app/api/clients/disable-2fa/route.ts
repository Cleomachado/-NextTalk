import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// Super-admin: desliga o 2FA de um cliente que perdeu o celular (resgate de suporte).
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/clients/disable-2fa", body);
  return Response.json(r.data, { status: r.status });
}
