import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Ficha do contato (clique no nome da conversa): campos do contrato, telefones, endereço e documentos.
export async function GET(_req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const r = await motor.get("/admin/contacts/" + encodeURIComponent(phone) + "/ficha");
  return Response.json(r.data, { status: r.status });
}

export async function PUT(req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/contacts/" + encodeURIComponent(phone) + "/ficha", body);
  return Response.json(r.data, { status: r.status });
}
