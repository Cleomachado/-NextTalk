import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Segredo do webhook DA PLATAFORMA (o "Token" que a Kiwify mostra ao criar o webhook). Guardado
// criptografado no motor e NUNCA devolvido — o painel só sabe se está configurado ou não.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/flow-webhook-secret", body);
  return Response.json(r.data, { status: r.status });
}
