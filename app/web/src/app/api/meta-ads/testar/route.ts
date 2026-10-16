import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Prova a credencial: gasto de hoje + fuso da conta de anúncio.
export async function POST() {
  const r = await motor.post("/admin/meta-ads/testar", {});
  return Response.json(r.data, { status: r.status });
}
