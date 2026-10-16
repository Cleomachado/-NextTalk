import { motor } from "../../../lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = new URL(req.url).searchParams.get("limit") ?? "20";
  const r = await motor.get(`/admin/events?limit=${encodeURIComponent(limit)}`);
  return Response.json(r.data, { status: r.status });
}
