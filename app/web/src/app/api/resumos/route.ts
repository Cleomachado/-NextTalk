import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";
// O relatório lê até 40 conversas e chama a IA em lotes: pode passar de 30 s.
export const maxDuration = 180;

// Resumos (conversa · grupo · período). Mesma rota no motor pra dono (/admin) e cliente (/app):
// o remap do `motor` escolhe pela sessão.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/resumos", body);
  return Response.json(r.data, { status: r.status });
}
