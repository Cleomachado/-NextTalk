import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Chave da Resend do workspace (Integrações → Resend), pro passo "Enviar e-mail" dos fluxos.
// A chave nunca volta: só configurado, últimos 4, remetente e nome.
export async function GET() {
  const r = await motor.get("/admin/resend/config");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/resend/config", body);
  return Response.json(r.data, { status: r.status });
}
