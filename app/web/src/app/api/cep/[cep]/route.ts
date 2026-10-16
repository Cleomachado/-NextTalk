import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// CEP → rua, bairro, cidade e UF (ViaCEP, consultado pelo motor).
export async function GET(_req: Request, ctx: { params: Promise<{ cep: string }> }) {
  const { cep } = await ctx.params;
  const r = await motor.get("/admin/cep/" + encodeURIComponent(cep.replace(/\D/g, "")));
  return Response.json(r.data, { status: r.status });
}
