import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// GET com ?email= → o super admin vê o que aquele cliente tem liberado (catálogo + marcados).
// GET sem email → o painel do CLIENTE pergunta o que a própria conta tem (remap manda pro /app).
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  const r = await motor.get("/admin/features" + (email ? "?email=" + encodeURIComponent(email) : ""));
  return Response.json(r.data, { status: r.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/features", body);
  return Response.json(r.data, { status: r.status });
}
