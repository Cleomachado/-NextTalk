import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Liga/desliga a automação de um número LITE extra (número dormente = recebe mas não roda fluxo).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/lite/automation", body);
  return Response.json(r.data, { status: r.status });
}
