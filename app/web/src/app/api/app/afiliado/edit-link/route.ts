import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Gera um NOVO link de edição da página de afiliado (o antigo deixa de valer).
export async function POST() {
  const r = await motor.post("/app/afiliado/edit-link", {});
  return Response.json(r.data, { status: r.status });
}
