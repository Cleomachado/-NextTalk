import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Funil de um fluxo (quantas pessoas passaram por cada nó). Repassa since/until pro motor.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const automationId = url.searchParams.get("automationId") ?? "";
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  if (automationId) qs.set("automationId", automationId);
  if (since) qs.set("since", since);
  if (until) qs.set("until", until);
  const r = await motor.get("/admin/flow-stats?" + qs.toString());
  return Response.json(r.data, { status: r.status });
}
