import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Detalhes da conta oficial (IDs, qualidade, limite) + perfil comercial (foto, descrição).
export async function GET() {
  const r = await motor.get("/admin/oficial/perfil");
  return Response.json(r.data, { status: r.status });
}

// Atualiza o perfil: { fotoDataUri?, description?, about?, email?, address?, websites? }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/perfil", body);
  return Response.json(r.data, { status: r.status });
}
