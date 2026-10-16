import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// 📞 Liga pro contato pelo WhatsApp, com o número LITE ativo. FALTAVA esta rota: o motor já
// tinha o /app/lite/call, mas sem o proxy o painel batia num 404 do próprio Next — foi o
// "Não consegui ligar: Erro 404" que o dono viu.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/app/lite/call", body);
  return Response.json(r.data, { status: r.status });
}
