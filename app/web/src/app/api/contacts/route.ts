import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const qs = new URL(req.url).search; // repassa ?search=&filter=&limit=&offset=
  const r = await motor.get("/admin/contacts" + qs);
  return Response.json(r.data, { status: r.status });
}
