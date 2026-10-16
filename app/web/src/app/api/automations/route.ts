import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await motor.get("/admin/automations");
  return Response.json(r.data, { status: r.status });
}

export async function PUT(req: Request) {
  // Não engole falha de parse: um body vazio/malformado NÃO deve virar {} e ser repassado ao motor
  // (lá o validador diria "automações devem ser uma lista", um erro assustador e enganoso). Rejeita claro.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo da requisição inválido — nada foi salvo, tente de novo" }, { status: 400 });
  }
  const r = await motor.put("/admin/automations", body);
  return Response.json(r.data, { status: r.status });
}
