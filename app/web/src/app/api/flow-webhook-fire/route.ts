import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// DISPARO DE VERDADE do gatilho (webhook e checkout), a partir do exemplo guardado no fluxo.
// Quem faz o POST é o MOTOR, não este route: o gatilho de checkout com token da plataforma salvo
// exige o corpo ASSINADO, e a assinatura só pode ser feita onde o segredo mora. Antes o POST saía
// daqui sem assinatura nenhuma — o que funcionava no webhook simples e levava 401 no checkout.
// O motor bate na URL PÚBLICA do próprio fluxo, de propósito: o teste percorre o caminho real
// (mesmo endereço, mesmo token, mesmo motor, mesma conta de envio).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { automationId?: string; payload?: unknown };
  if (!body?.automationId || !body?.payload || typeof body.payload !== "object") {
    return Response.json({ error: "informe o fluxo e o payload" }, { status: 400 });
  }
  const r = await motor.post("/admin/flow-webhook-fire", body);
  return Response.json(r.data, { status: r.status });
}
