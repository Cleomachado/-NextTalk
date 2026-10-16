import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get("zc_session")?.value;
  if (!token) return Response.json({ error: "não autenticado" }, { status: 401 });
  const r = await motor.get("/auth/session", { "x-session-token": token });
  return Response.json(r.data, { status: r.status });
}
