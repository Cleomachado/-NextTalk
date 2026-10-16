import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Teste AO VIVO: roda o fluxo de verdade a partir de um nó, pro número informado.
// (Diferente do "Testar" do builder, que é só simulação e não envia nada.)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/automations/teste-ao-vivo", body);
  return Response.json(r.data, { status: r.status });
}
