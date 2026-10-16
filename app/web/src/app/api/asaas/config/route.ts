import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Status da integração Asaas do workspace (a chave nunca volta — só configurado + últimos 4).
export async function GET() {
  const r = await motor.get("/admin/asaas/config");
  return Response.json(r.data, { status: r.status });
}

// Salva (ou remove, com chave vazia) a chave de API do Asaas — cifrada no motor, por workspace.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/asaas/config", body);
  return Response.json(r.data, { status: r.status });
}
