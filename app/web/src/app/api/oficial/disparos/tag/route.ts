import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Aplica uma etiqueta em TODOS os contatos de um status do disparo: { id, status, tag }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/disparos/tag", body);
  return Response.json(r.data, { status: r.status });
}
