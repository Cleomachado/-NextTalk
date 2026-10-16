import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Liga a captura de métricas de template na WABA. A Meta só começa a contar DEPOIS disso e não
// devolve histórico — por isso é um botão explícito, com o aviso na tela.
export async function POST() {
  const r = await motor.post("/admin/meta/templates/insights/ativar", {});
  return Response.json(r.data, { status: r.status });
}
