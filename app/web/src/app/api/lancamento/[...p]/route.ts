import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Repasse das sub-rotas do Dashboard de Lançamento (lives, criativos…) pro motor em /admin/lancamento/*.
// O motor.ts já barra sessão de cliente em /admin/*; aqui só aceitamos segmentos simples.
async function repassa(req: Request, ctx: { params: Promise<{ p: string[] }> }) {
  const { p } = await ctx.params;
  if (!p.every((s) => /^[A-Za-z0-9_:.-]{1,200}$/.test(s) && s !== ".." && s !== ".")) {
    return Response.json({ error: "caminho inválido" }, { status: 400 });
  }
  const caminho = "/admin/lancamento/" + p.map(encodeURIComponent).join("/") + new URL(req.url).search;
  const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.json().catch(() => ({}));
  const r = req.method === "GET" ? await motor.get(caminho)
    : req.method === "DELETE" ? await motor.del(caminho)
    : req.method === "PUT" ? await motor.put(caminho, body)
    : await motor.post(caminho, body);
  return Response.json(r.data, { status: r.status });
}
export const GET = repassa, POST = repassa, PUT = repassa, DELETE = repassa;
