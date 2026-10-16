import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Histórico de versões de um fluxo (quem salvou, quando). O remap admin→app cobre o cliente.
export async function GET(req: Request) {
  const automationId = new URL(req.url).searchParams.get("automationId") ?? "";
  const r = await motor.get("/admin/flow-history?automationId=" + encodeURIComponent(automationId));
  return Response.json(r.data, { status: r.status });
}
