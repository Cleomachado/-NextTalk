import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Contatos de um segmento do CRM (?origem=... | ?tag=... | vazio = todos, sem opt-out, máx. 5.000).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of ["origem", "tag"]) { const v = u.searchParams.get(k); if (v) qs.set(k, v); }
  const r = await motor.get("/admin/contacts/segment?" + qs.toString());
  return Response.json(r.data, { status: r.status });
}
