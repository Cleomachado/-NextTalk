import { motor } from "../../../../lib/motor";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await motor.get("/admin/config/summary");
  return Response.json(r.data, { status: r.status });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/config/summary", body);
  return Response.json(r.data, { status: r.status });
}
