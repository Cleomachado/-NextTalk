import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Rascunhos de template (template pela metade) — guardados no motor, por workspace.
export async function GET() {
  const r = await motor.get("/admin/oficial/templates/rascunhos");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/templates/rascunhos", body);
  return Response.json(r.data, { status: r.status });
}
