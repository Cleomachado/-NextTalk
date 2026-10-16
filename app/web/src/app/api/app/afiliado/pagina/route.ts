import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// "Meus sites": a página /promo do e-mail do usuário logado (admin e cliente caem no mesmo /app/*).
export async function GET() {
  const r = await motor.get("/app/afiliado/pagina");
  return Response.json(r.data, { status: r.status });
}
