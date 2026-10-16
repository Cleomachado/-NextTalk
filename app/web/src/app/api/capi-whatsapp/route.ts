import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Conversões de WhatsApp (CAPI de mensagens): dataset + token por workspace. Cliente cai no /app/*.
export async function GET() {
  const r = await motor.get("/admin/capi-whatsapp");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/capi-whatsapp", body);
  return Response.json(r.data, { status: r.status });
}
