import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Diagnóstico das métricas de template (só admin): a resposta CRUA da Graph, pra fechar com
// evidência o caso "cards em — com o Gerenciador cheio". Abre direto no navegador logado.
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  const r = await motor.get("/admin/meta/templates/metricas-debug" + (qs ? "?" + qs : ""));
  return Response.json(r.data, { status: r.status });
}
