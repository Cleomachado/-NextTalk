import { motor } from "../../../lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ?refresh=1 → busca direto no WhatsApp (pro "↻ Atualizar" do seletor).
  // ?account=lite-xxx → grupos SÓ daquele número. Grupo pertence ao APARELHO, não à conta:
  // sem isso o seletor mostrava os grupos do número primário mesmo com outro selecionado.
  const q = new URL(req.url).searchParams;
  const p = new URLSearchParams();
  if (q.get("refresh") === "1") p.set("refresh", "1");
  const acc = (q.get("account") ?? "").trim();
  if (acc) p.set("account", acc);
  const r = await motor.get("/admin/groups" + (p.toString() ? "?" + p.toString() : ""));
  return Response.json(r.data, { status: r.status });
}
