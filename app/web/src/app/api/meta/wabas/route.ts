import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Contas oficiais (WABAs) do workspace — alimenta o seletor de "aprovar em qual conta".
// O motor.get remapeia /admin/* → /app/* pra quem não é super admin.
export async function GET() {
  const r = await motor.get("/admin/meta/wabas");
  return Response.json(r.data, { status: r.status });
}
