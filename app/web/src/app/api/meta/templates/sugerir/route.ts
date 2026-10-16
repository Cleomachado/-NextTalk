import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// IA sugere um template pronto (com tentativa de encaixe UTILITY) a partir de texto livre.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/meta/templates/sugerir", body);
  return Response.json(r.data, { status: r.status });
}
