import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Lista as tags do workspace (escopado por sessão).
export async function GET() {
  const r = await motor.get("/app/tags");
  return Response.json(r.data, { status: r.status });
}
