import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Botão "Testar" do passo Enviar webhook: o motor é quem faz o POST (o destino é outro domínio e
// não libera CORS pra nós). Cliente cai no /app/* escopado pelo remap do motor.ts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-test", body);
  return Response.json(r.data, { status: r.status });
}
