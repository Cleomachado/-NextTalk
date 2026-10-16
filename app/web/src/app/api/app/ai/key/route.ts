import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Estado da chave OpenAI do workspace (nunca devolve a chave inteira, só configured + last4).
export async function GET() {
  const r = await motor.get("/app/ai/key");
  return Response.json(r.data, { status: r.status });
}
// Salva/troca a chave (criptografada no motor).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/ai/key", body);
  return Response.json(r.data, { status: r.status });
}
