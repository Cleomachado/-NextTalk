import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// O "Escutar" do gatilho webhook: o painel faz polling aqui até o POST de teste chegar no motor.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  qs.set("automationId", url.searchParams.get("automationId") ?? "");
  qs.set("since", url.searchParams.get("since") ?? "0");
  const r = await motor.get("/admin/flow-webhook-last?" + qs.toString());
  return Response.json(r.data, { status: r.status });
}
