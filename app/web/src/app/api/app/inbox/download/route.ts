import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Baixa a mídia de uma mensagem recebida (retorna a URL hospedada pela UazAPI).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const r = await motor.get("/app/inbox/download?id=" + encodeURIComponent(id));
  return Response.json(r.data, { status: r.status });
}
