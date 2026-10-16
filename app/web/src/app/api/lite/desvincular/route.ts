import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Desvincular (super-admin): tira da conta do dono um WhatsApp de cliente que caiu aqui,
// SEM apagar a sessão do cliente (devolve pro workspace dono).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/lite/desvincular", body);
  return Response.json(r.data, { status: r.status });
}
