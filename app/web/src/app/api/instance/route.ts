import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await motor.get("/admin/instance");
  return Response.json(r.data, { status: r.status });
}
