import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Ação sobre um membro do grupo (menu do modal): promover/tirar admin, remover do grupo.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/group-member", body);
  return Response.json(r.data, { status: r.status });
}
