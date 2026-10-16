import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Rascunho do Disparador — guardado no motor (servidor), um por workspace.
export async function GET() {
  const r = await motor.get("/admin/oficial/disparo/rascunho");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/disparo/rascunho", body);
  return Response.json(r.data, { status: r.status });
}
