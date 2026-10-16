import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await motor.get("/admin/inbox/download" + url.search);
  return Response.json(r.data, { status: r.status });
}
