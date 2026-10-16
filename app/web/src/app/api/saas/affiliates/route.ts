import { motor } from "@/lib/motor";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.get("/admin/affiliates");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const r = await motor.put("/admin/affiliates", await req.json().catch(() => ({})));
  return Response.json(r.data, { status: r.status });
}
// Ações: { action: "toggle"|"remove"|"grant-trial", ...campos }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "só o admin" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const path =
    b?.action === "toggle" ? "/admin/affiliates/toggle" :
    b?.action === "remove" ? "/admin/affiliates/remove" :
    b?.action === "grant-trial" ? "/admin/trial/grant" : null;
  if (!path) return Response.json({ error: "ação inválida" }, { status: 400 });
  const r = await motor.post(path, b);
  return Response.json(r.data, { status: r.status });
}
