import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Conecta o WhatsApp do cliente (cria instância LITE no workspace dele + QR).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/lite/init", body);
  return Response.json(r.data, { status: r.status });
}
