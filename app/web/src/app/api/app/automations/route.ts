import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Fluxos DO CLIENTE (escopados pela sessão no motor).
export async function GET() {
  const r = await motor.get("/app/automations");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo da requisição inválido — nada foi salvo, tente de novo" }, { status: 400 });
  }
  const r = await motor.put("/app/automations", body);
  return Response.json(r.data, { status: r.status });
}
