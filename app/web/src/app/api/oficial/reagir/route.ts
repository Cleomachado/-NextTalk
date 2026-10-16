import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Reagir a uma mensagem do WPP Api ({ chatid, mid, emoji }); emoji "" tira a reação.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/reagir", body);
  return Response.json(r.data, { status: r.status });
}
