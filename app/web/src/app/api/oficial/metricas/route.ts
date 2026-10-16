import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Métricas da conta oficial: qualidade do número, limite de envio, volume e custo (?dias=7|30|90).
export async function GET(req: Request) {
  // Repassa `dias` (atalho 7/30/90) OU `de`/`ate` (calendário) — sem isso a data personalizada
  // escolhida na tela nunca chegava no motor.
  const u = new URL(req.url); const qs = new URLSearchParams();
  for (const k of ["dias", "de", "ate"]) { const v = u.searchParams.get(k); if (v) qs.set(k, v); }
  const r = await motor.get("/admin/oficial/metricas" + (qs.toString() ? "?" + qs.toString() : ""));
  return Response.json(r.data, { status: r.status });
}
