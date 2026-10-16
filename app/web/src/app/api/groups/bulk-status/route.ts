import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const r = await motor.get("/admin/groups/bulk-status?jobId=" + encodeURIComponent(jobId));
  return Response.json(r.data, { status: r.status });
}
