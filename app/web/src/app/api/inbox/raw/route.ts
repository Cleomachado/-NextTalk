import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Diagnóstico: JSON cru das mensagens de um tipo numa conversa (ex.: enquete), pra descobrir o
// formato real que a UazAPI manda. Abra logado:
//   /api/inbox/raw?account=lite-xxxxxxx&chatid=1203...@g.us&tipo=poll
export async function GET(req: Request) {
  const u = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of ["account", "chatid", "tipo"]) { const v = u.searchParams.get(k); if (v) qs.set(k, v); }
  const r = await motor.get("/admin/inbox/raw?" + qs.toString());
  return Response.json(r.data, { status: r.status });
}
