import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// Super-admin: define o perfil do negócio do cliente (ex.: advocacia), que liga recursos do segmento.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/clients/perfil", body);
  return Response.json(r.data, { status: r.status });
}
