import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Hospeda mídia e devolve { url }.
// BINÁRIO (application/octet-stream + ?mime=) é o caminho de hoje: o corpo JSON desta rota trava
// em 10MB (medido em produção, 20/08) e base64 infla 33% — vídeo acima de ~7,5MB não passava.
// JSON com { dataUri } continua aceito pra não quebrar página já aberta.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/octet-stream")) {
    const mime = new URL(req.url).searchParams.get("mime") ?? "";
    const bytes = Buffer.from(await req.arrayBuffer());
    const r = await motor.postRaw("/admin/media?mime=" + encodeURIComponent(mime), bytes);
    return Response.json(r.data, { status: r.status });
  }
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/media", body);
  return Response.json(r.data, { status: r.status });
}
