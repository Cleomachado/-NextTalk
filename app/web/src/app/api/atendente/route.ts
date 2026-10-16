import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Config da Atendente IA (inbound sempre ligada) — por workspace.
export async function GET() {
  const r = await motor.get("/admin/atendente");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/atendente", body);
  return Response.json(r.data, { status: r.status });
}
