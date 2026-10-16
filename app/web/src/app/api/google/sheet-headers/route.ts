import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Nomes das colunas (linha 1) de uma planilha do Google — pro passo Planilha mapear sem chave.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await motor.get("/admin/google/sheet-headers?sheetUrl=" + encodeURIComponent(url.searchParams.get("sheetUrl") ?? ""));
  return Response.json(r.data, { status: r.status });
}
