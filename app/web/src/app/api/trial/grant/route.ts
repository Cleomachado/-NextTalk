import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Libera acesso (trial/cortesia) de N dias pra um e-mail (admin).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const r = await motor.post("/admin/trial/grant", body);
  return Response.json(r.data, { status: r.status });
}
