import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Board do CRM: colunas + cards (escopado por sessão).
export async function GET() {
  const r = await motor.get("/app/crm/board");
  return Response.json(r.data, { status: r.status });
}
