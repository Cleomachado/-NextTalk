import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/google/test-sheets", body);
  return Response.json(r.data, { status: r.status });
}
