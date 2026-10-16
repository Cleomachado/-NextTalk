import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Resgata um cupom pra conta logada (estende o teste).
export async function POST(req: Request) {
  const token = (await cookies()).get("zc_session")?.value;
  if (!token) return Response.json({ error: "não autenticado" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = await motor.post("/auth/redeem", { coupon: b?.coupon }, { "x-session-token": token });
  return Response.json(r.data, { status: r.status });
}
