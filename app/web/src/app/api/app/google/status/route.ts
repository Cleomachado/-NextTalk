import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Estado do conector Google (nunca devolve o JSON — só client_email e datas).
export async function GET() {
  const r = await motor.get("/app/google/status");
  return Response.json(r.data, { status: r.status });
}
