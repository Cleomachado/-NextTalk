import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Diagnóstico: config de webhook (enabled/url/excludeMessages) de cada instância Lite.
export async function GET() {
  const r = await motor.get("/admin/webhook-status");
  return Response.json(r.data, { status: r.status });
}
