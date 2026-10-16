import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Lista de contatos de um disparo por status (?id=&status=enviados|entregues|lidas|falhas).
export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  const r = await motor.get("/admin/oficial/disparos/contatos" + qs);
  return Response.json(r.data, { status: r.status });
}
