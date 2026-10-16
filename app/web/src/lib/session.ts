import { cookies } from "next/headers";

const BASE = (process.env.API_BASE ?? "http://app:3333").replace(/\/+$/, "");

// Sessão do usuário logado (cookie zc_session), validada no motor.
export async function getSessionInfo(): Promise<any | null> {
  const token = (await cookies()).get("zc_session")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/auth/session`, { headers: { "x-session-token": token }, cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Só o admin (Admin) passa — usado nas rotas de cupons/afiliados/comissões.
export async function requireAdmin(): Promise<boolean> {
  const s = await getSessionInfo();
  return s?.user?.role === "admin";
}
