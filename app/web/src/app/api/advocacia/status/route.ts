import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Perfil advocacia: perfil da conta + se a API de contratos está configurada (nunca o token).
export async function GET() {
  const r = await motor.get("/admin/advocacia/status");
  return Response.json(r.data, { status: r.status });
}
