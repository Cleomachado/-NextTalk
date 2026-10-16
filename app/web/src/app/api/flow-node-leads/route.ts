import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const qs = new URL(req.url).search; // repassa ?automationId=&nodeId=&since=&until=
  const r = await motor.get("/admin/flow-node-leads" + qs);
  return Response.json(r.data, { status: r.status });
}
