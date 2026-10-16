import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Conexão em 1 clique (Embedded Signup). GET = o botão está disponível neste servidor?
// POST = fecha o ciclo com o `code` que o popup da Meta devolveu.
export async function GET() {
  const r = await motor.get("/admin/meta/embedded");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/meta/embedded", body);
  return Response.json(r.data, { status: r.status });
}
