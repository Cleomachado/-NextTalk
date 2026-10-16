import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Lista os WhatsApp Flows (formulários nativos) da conta oficial, com status.
export async function GET() {
  const r = await motor.get("/admin/oficial/flows");
  return Response.json(r.data, { status: r.status });
}
