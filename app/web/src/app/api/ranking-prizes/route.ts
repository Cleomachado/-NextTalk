import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Premiação do ranking de afiliados (valores por posição). Só o admin edita.
export async function GET() {
  const r = await motor.get("/admin/config/ranking-prizes");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/config/ranking-prizes", body);
  return Response.json(r.data, { status: r.status });
}
