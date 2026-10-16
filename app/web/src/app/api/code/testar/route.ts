import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// "Execute step" do nó de código — mesmo executor isolado que roda em produção.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/code/testar", body);
  return Response.json(r.data, { status: r.status });
}
