import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/app/me/workspace", body);
  return Response.json(r.data, { status: r.status });
}
