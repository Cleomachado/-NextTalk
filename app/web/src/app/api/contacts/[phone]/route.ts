import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const r = await motor.get("/admin/contacts/" + encodeURIComponent(phone));
  return Response.json(r.data, { status: r.status });
}

// Editar a ficha (nome, e-mail, notas, tags, opt-out).
export async function PUT(req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await motor.put("/admin/contacts/" + encodeURIComponent(phone), body);
  return Response.json(r.data, { status: r.status });
}

// Excluir o contato (e as tags dele). O histórico de eventos fica.
export async function DELETE(_req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const r = await motor.del("/admin/contacts/" + encodeURIComponent(phone));
  return Response.json(r.data, { status: r.status });
}
