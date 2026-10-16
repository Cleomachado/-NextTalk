import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// MODO TESTE: lista de números que o robô pode responder. Lista VAZIA = atende todo mundo.
// Existia só no motor — sem esta rota, não havia como ver/desligar pelo navegador, e um modo teste
// esquecido deixa o robô mudo pra leads novos em silêncio (caso real 12/08).
export async function GET() {
  const r = await motor.get("/admin/bot-allowlist");
  return Response.json(r.data, { status: r.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/bot-allowlist", body);
  return Response.json(r.data, { status: r.status });
}
