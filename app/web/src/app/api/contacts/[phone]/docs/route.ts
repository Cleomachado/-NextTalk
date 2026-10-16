import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Upload de documento do contato (RG/CPF/CNH…) em BINÁRIO cru: ?tipo=&nome=&mime=.
export async function POST(req: Request, ctx: { params: Promise<{ phone: string }> }) {
  const { phone } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const qs = new URLSearchParams({ tipo: q.get("tipo") ?? "", nome: q.get("nome") ?? "", mime: q.get("mime") ?? "" });
  const bytes = Buffer.from(await req.arrayBuffer());
  const r = await motor.postRaw("/admin/contacts/" + encodeURIComponent(phone) + "/docs?" + qs.toString(), bytes);
  return Response.json(r.data, { status: r.status });
}
