import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Tour de boas-vindas por USUÁRIO (guardado no motor — vale em qualquer navegador/aparelho).
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const r = await motor.get("/app/me/tour?key=" + encodeURIComponent(key));
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/me/tour", body);
  return Response.json(r.data, { status: r.status });
}
