import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Catálogo das áreas que dá pra ligar/desligar por membro (vem do motor).
export async function GET() {
  const r = await motor.get("/app/team/areas");
  return Response.json(r.data, { status: r.status });
}
