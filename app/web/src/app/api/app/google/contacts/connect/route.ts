import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Devolve a URL de consentimento do Google (o painel abre pra pessoa autorizar).
export async function POST() {
  const r = await motor.post("/app/google/contacts/connect", {});
  return Response.json(r.data, { status: r.status });
}
