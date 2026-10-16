import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Equipe do workspace: dono + membros + convites pendentes.
export async function GET() {
  const r = await motor.get("/app/team");
  return Response.json(r.data, { status: r.status });
}
