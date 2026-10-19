import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Puxa da Meta agora: { dias: 30 } no botão "Atualizar Meta"; { dias: 3 } sozinho ao abrir o dashboard.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/lancamento/sincronizar", { dias: b?.dias });
  return Response.json(r.data, { status: r.status });
}
