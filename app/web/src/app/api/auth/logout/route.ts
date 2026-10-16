import { cookies } from "next/headers";
import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("zc_session")?.value;
  if (token) await motor.post("/auth/logout", {}, { "x-session-token": token });
  jar.delete("zc_session");
  return Response.json({ ok: true });
}
