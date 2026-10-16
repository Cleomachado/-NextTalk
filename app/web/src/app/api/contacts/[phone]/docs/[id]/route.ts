import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Abre o documento do contato. Só com sessão (o motor confere o workspace) e sem cache público.
export async function GET(_req: Request, ctx: { params: Promise<{ phone: string; id: string }> }) {
  const { phone, id } = await ctx.params;
  const r = await motor.getBytes("/admin/contacts/" + encodeURIComponent(phone) + "/docs/" + encodeURIComponent(id));
  if (!r.ok || !r.data?.buf) return Response.json(r.data, { status: r.status });
  return new Response(new Uint8Array(r.data.buf), {
    headers: {
      "content-type": r.data.mime,
      "content-disposition": r.data.disposition || "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ phone: string; id: string }> }) {
  const { phone, id } = await ctx.params;
  const r = await motor.del("/admin/contacts/" + encodeURIComponent(phone) + "/docs/" + encodeURIComponent(id));
  return Response.json(r.data, { status: r.status });
}
