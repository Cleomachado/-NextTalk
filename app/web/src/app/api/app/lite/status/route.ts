import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Status da conexão do número do cliente (o QR já espelhou?).
export async function GET(req: Request) {
  const conta = new URL(req.url).searchParams.get("account") ?? "";
  const r = await motor.get("/app/lite/status?account=" + encodeURIComponent(conta));
  return Response.json(r.data, { status: r.status });
}
