import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Caixa "Envie sua sugestão" da página Novidades → motor guarda e avisa o dono no WhatsApp.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/sugestao", body);
  return Response.json(r.data, { status: r.status });
}
