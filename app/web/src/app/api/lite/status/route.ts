import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const conta = new URL(req.url).searchParams.get("account") ?? "";
  const r = await motor.get("/admin/lite/status?account=" + encodeURIComponent(conta));
  return Response.json(r.data, { status: r.status });
}
