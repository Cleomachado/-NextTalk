import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/pin", body);
  return Response.json(r.data, { status: r.status });
}
