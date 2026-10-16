import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await motor.get("/app/me");
  return Response.json(r.data, { status: r.status });
}
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/app/me/profile", body);
  return Response.json(r.data, { status: r.status });
}
