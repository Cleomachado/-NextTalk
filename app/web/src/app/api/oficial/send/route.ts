import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Responder pela API Oficial (só vale dentro da janela de 24h — o motor traduz o erro da Meta).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/send", body);
  return Response.json(r.data, { status: r.status });
}
