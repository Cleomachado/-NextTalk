import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Importa uma lista de contatos (lida de csv/txt/xlsx no navegador) com tags opcionais.
// Cliente (não-admin) é remapeado pra /app/contacts/import pelo portão do motor.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/contacts/import", body);
  return Response.json(r.data, { status: r.status });
}
