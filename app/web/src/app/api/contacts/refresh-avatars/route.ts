import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Dispara o enriquecimento de fotos de perfil (motor puxa do WhatsApp LITE e hospeda).
export async function POST() {
  const r = await motor.post("/admin/contacts/refresh-avatars", {});
  return Response.json(r.data, { status: r.status });
}
