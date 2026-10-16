import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Números oficiais EXTRAS (2º, 3º… número) — não encostam na conexão principal.
export async function GET() {
  const r = await motor.get("/admin/meta/extras");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/meta/extras", body);
  return Response.json(r.data, { status: r.status });
}
