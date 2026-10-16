import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Status do contrato deste telefone no sistema do escritório (aguardando, assinado…).
export async function GET(req: Request) {
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  const r = await motor.get("/admin/advocacia/contrato/status?phone=" + encodeURIComponent(phone));
  return Response.json(r.data, { status: r.status });
}
