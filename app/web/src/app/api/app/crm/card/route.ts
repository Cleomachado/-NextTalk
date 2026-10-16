import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// PUT = salva a ficha do card · POST = cria card manual
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/app/crm/card", body);
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/crm/card", body);
  return Response.json(r.data, { status: r.status });
}
