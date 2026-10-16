import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Estado do conector Google Contatos (nunca devolve o token — só e-mail e se está configurado).
export async function GET() {
  const r = await motor.get("/app/google/contacts/status");
  return Response.json(r.data, { status: r.status });
}
