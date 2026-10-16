import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Só admin: o motor não tem /app/agendamentos, então o remap do cliente cai em 404 (sem vazamento).
export async function GET() {
  const r = await motor.get("/admin/agendamentos");
  return Response.json(r.data, { status: r.status });
}
