import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Foto de perfil do usuário: envia o dataUri pro motor hospedar e gravar a URL.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/me/photo", body);
  return Response.json(r.data, { status: r.status });
}
