import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Cria um contato de teste na conta ligada — prova que o nó do fluxo vai funcionar.
export async function POST() {
  const r = await motor.post("/app/google/contacts/test", {});
  return Response.json(r.data, { status: r.status });
}
