import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Meta Ads (métricas de campanha): conta de anúncio + token por workspace. Cliente cai no /app/*.
export async function GET() {
  const r = await motor.get("/admin/meta-ads/config");
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/meta-ads/config", body);
  return Response.json(r.data, { status: r.status });
}
