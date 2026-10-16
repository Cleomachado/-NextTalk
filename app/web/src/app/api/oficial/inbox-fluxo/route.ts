import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Envia um FLUXO (com template dentro) pra UMA conversa do inbox oficial — reabre a janela de 24h
// já com os ramos dos botões armados. Cliente cai no /app/* escopado pelo remap do motor.ts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/inbox-fluxo", body);
  return Response.json(r.data, { status: r.status });
}
