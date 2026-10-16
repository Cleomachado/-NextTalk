import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Lista os templates da conta oficial (com status de aprovação).
export async function GET() {
  const r = await motor.get("/admin/meta/templates");
  return Response.json(r.data, { status: r.status });
}

// Cria/submete um template pra aprovação da Meta.
//
// ⚠️ LIMITE MEDIDO (20/08, em produção): o corpo JSON desta rota trava em 10 MB exatos
// (10.485.760 bytes) — 9 MB passa, 10 MB não. É por isso que o template com o MP4 de 12,9 MB
// falhava: em base64 o vídeo virava ~17 MB de JSON. O caminho NOVO manda o arquivo em binário
// pela rota /header (testado com os mesmos 12,9 MB: passa), então este limite deixa de importar
// — mas quem ainda estiver com a página antiga aberta cai aqui, e merece saber o motivo real.
const LIMITE_JSON = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_JSON) {
    return Response.json(
      {
        error: `este envio tem ${(declarado / 1048576).toFixed(1)}MB e o limite por requisição é 10MB. `
          + `Recarregue a página (Ctrl+Shift+R): a versão nova manda o arquivo separado e não passa por este limite.`,
      },
      { status: 413 },
    );
  }
  let cru = "";
  try {
    cru = await req.text();
  } catch (e: any) {
    return Response.json(
      { error: `não consegui ler o envio (${(declarado / 1048576).toFixed(1)}MB anunciados). Detalhe: ${String(e?.message ?? e)}` },
      { status: 400 },
    );
  }
  const chegou = new TextEncoder().encode(cru).length;
  let body: unknown;
  try {
    body = JSON.parse(cru || "{}");
  } catch (e: any) {
    const faltou = declarado && chegou < declarado;
    console.error(`[templates] JSON inválido · anunciado=${declarado}B recebido=${chegou}B · ${String(e?.message ?? e).slice(0, 200)}`);
    return Response.json(
      {
        error: faltou
          ? `o envio chegou incompleto: o navegador anunciou ${(declarado / 1048576).toFixed(1)}MB e chegaram ${(chegou / 1048576).toFixed(1)}MB.`
          : `o conteúdo chegou inteiro (${(chegou / 1048576).toFixed(1)}MB) mas não é um JSON válido: ${String(e?.message ?? e).slice(0, 160)}`,
      },
      { status: 400 },
    );
  }
  const r = await motor.post("/admin/meta/templates", body);
  return Response.json(r.data, { status: r.status });
}

// Exclui um template pelo nome (?name=).
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const r = await motor.del("/admin/meta/templates?name=" + encodeURIComponent(name));
  return Response.json(r.data, { status: r.status });
}
