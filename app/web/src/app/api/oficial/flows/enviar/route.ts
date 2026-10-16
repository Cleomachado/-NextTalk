import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Envia um Flow publicado numa conversa: { chatid|to, flowId, cta?, texto?, tela? }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/flows/enviar", body);
  return Response.json(r.data, { status: r.status });
}
