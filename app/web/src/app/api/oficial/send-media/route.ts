import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Anexo na conversa da API Oficial. Binário cru (?chatid=&mime=&caption=) é o caminho de hoje —
// pelo JSON, um vídeo passava de 10MB em base64 e a requisição morria sem explicação.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/octet-stream")) {
    const qs = new URL(req.url).searchParams.toString();
    const bytes = Buffer.from(await req.arrayBuffer());
    const r = await motor.postRaw("/admin/oficial/send-media" + (qs ? "?" + qs : ""), bytes);
    return Response.json(r.data, { status: r.status });
  }
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/send-media", body);
  return Response.json(r.data, { status: r.status });
}
