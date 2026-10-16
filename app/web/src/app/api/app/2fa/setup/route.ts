import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await motor.post("/app/2fa/setup", {});
  return Response.json(r.data, { status: r.status });
}
