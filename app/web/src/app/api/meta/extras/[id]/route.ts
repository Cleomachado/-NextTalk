import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Remove um número oficial extra do painel (a conta na Meta continua existindo).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await motor.del("/admin/meta/extras/" + encodeURIComponent(id));
  return Response.json(r.data, { status: r.status });
}
