import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Transfere um WhatsApp conectado do painel do super-admin pro workspace de um cliente
// (sessão continua viva — muda só a atribuição). Body: { email, account }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/clients/vincular-whats", body);
  return Response.json(r.data, { status: r.status });
}
