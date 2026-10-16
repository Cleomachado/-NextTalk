import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await motor.del("/admin/oficial/templates/rascunhos/" + encodeURIComponent(id));
  return Response.json(r.data, { status: r.status });
}
