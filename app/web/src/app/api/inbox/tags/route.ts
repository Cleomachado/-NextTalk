import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Etiquetas do contato aberto no chat (ler / pôr e tirar). Cliente cai no /app/* pelo remap do motor.
export async function GET(req: Request) {
  const phone = new URL(req.url).searchParams.get("phone") ?? "";
  const r = await motor.get("/admin/inbox/tags?phone=" + encodeURIComponent(phone));
  return Response.json(r.data, { status: r.status });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/inbox/tags", body);
  return Response.json(r.data, { status: r.status });
}
