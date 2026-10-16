import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Sobe o arquivo do cabeçalho do template (imagem/vídeo/PDF) como BINÁRIO CRU e devolve o handle
// da Meta. Vai separado da criação do template de propósito: antes o arquivo viajava em base64
// dentro do JSON e um MP4 de 16MB virava ~21MB de texto numa requisição só.
export async function POST(req: Request) {
  const qs = new URL(req.url).searchParams;
  const mime = qs.get("mime") ?? "";
  const esperado = Number(qs.get("bytes") ?? 0);
  const bytes = Buffer.from(await req.arrayBuffer());
  // Primeira barreira: o upload do navegador até aqui. Se caiu no meio, para AGORA — deixar seguir
  // gera um template com vídeo quebrado que só falha lá na frente, na hora do disparo.
  if (esperado > 0 && bytes.length < esperado) {
    return Response.json(
      { error: `o arquivo chegou incompleto (${(bytes.length / 1048576).toFixed(1)}MB de ${(esperado / 1048576).toFixed(1)}MB) — a conexão caiu no meio do envio. Tente de novo, de preferência com um vídeo mais leve.` },
      { status: 400 },
    );
  }
  const r = await motor.postRaw(
    "/admin/meta/templates/header?mime=" + encodeURIComponent(mime) + (esperado > 0 ? "&bytes=" + esperado : ""),
    bytes,
  );
  return Response.json(r.data, { status: r.status });
}
