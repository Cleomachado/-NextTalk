import { motor } from "@/lib/motor";
export const dynamic = "force-dynamic";
// Teste de aceitação de cada escopo do login Google (doc | planilha | agenda).
export async function POST(req: Request, ctx: { params: Promise<{ oque: string }> }) {
  const { oque } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/google/test/" + encodeURIComponent(oque), body);
  return Response.json(r.data, { status: r.status });
}
