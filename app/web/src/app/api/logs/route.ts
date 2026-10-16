import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Tail dos logs do motor (só super-admin — pra cliente o remap cai em /app/logs, que não existe: 404).
export async function GET(req: Request) {
  const qs = new URL(req.url).searchParams.toString();
  const r = await motor.get("/admin/logs" + (qs ? "?" + qs : ""));
  return Response.json(r.data, { status: r.status });
}
