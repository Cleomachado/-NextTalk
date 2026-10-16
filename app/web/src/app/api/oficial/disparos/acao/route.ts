import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// { id, acao: "pausar" | "retomar" | "parar" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/disparos/acao", body);
  return Response.json(r.data, { status: r.status });
}
