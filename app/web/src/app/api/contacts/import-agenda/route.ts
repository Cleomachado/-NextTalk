import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Importa a agenda inteira do celular como contatos (motor puxa GET /contacts da UazAPI).
// Cliente (não-admin) é remapeado pra /app/contacts/import-agenda pelo portão do motor.
export async function POST() {
  const r = await motor.post("/admin/contacts/import-agenda", {});
  return Response.json(r.data, { status: r.status });
}
