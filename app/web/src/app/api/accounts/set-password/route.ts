import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Reseta a senha de um cliente (admin) e devolve a nova pro dono repassar.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const r = await motor.post("/admin/accounts/set-password", body);
  return Response.json(r.data, { status: r.status });
}
