import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Pausa MANUAL da IA numa conversa (botão do chat). O motor expõe a mesma rota em /admin (dono) e
// /app (cliente) — o remap do `motor` escolhe a certa pela sessão.
export async function GET(req: Request) {
  const chatid = new URL(req.url).searchParams.get("chatid") ?? "";
  const r = await motor.get("/admin/inbox/pausa?chatid=" + encodeURIComponent(chatid));
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/pausa", body);
  return Response.json(r.data, { status: r.status });
}
