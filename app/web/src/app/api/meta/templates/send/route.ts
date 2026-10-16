import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Envia um template de teste (funciona fora da janela de 24h).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const r = await motor.post("/admin/meta/templates/send", body);
  return Response.json(r.data, { status: r.status });
}
