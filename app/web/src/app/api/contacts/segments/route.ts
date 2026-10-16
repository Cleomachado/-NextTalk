import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Opções de segmento do Disparador (total + origens + tags do CRM, com contagem).
export async function GET() {
  const r = await motor.get("/admin/contacts/segments");
  return Response.json(r.data, { status: r.status });
}
