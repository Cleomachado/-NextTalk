import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Diagnóstico: últimos inbounds recebidos no motor + fluxos de keyword ativos.
export async function GET() {
  const r = await motor.get("/admin/webhook-debug");
  return Response.json(r.data, { status: r.status });
}
