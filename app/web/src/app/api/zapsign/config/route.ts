import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Token da API da ZapSign do workspace (Integrações → ZapSign). Nunca volta o valor, só configurado + últimos 4.
export async function GET() {
  const r = await motor.get("/admin/zapsign/config");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/zapsign/config", body);
  return Response.json(r.data, { status: r.status });
}
