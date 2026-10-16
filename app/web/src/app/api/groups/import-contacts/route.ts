import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Importa os participantes de um grupo pro CRM (com a tag escolhida + a tag universal).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const r = await motor.post("/admin/groups/import-contacts", body);
  return Response.json(r.data, { status: r.status });
}
