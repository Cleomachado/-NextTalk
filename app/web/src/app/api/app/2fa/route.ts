import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Status do 2FA do usuário da sessão.
export async function GET() {
  const r = await motor.get("/app/2fa/status");
  return Response.json(r.data, { status: r.status });
}
