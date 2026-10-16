import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Contas (números) DO CLIENTE — escopadas pela sessão no motor (/app/*).
export async function GET() {
  const r = await motor.get("/app/accounts");
  return Response.json(r.data, { status: r.status });
}
