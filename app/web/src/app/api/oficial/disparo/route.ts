import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Status do disparo em massa (o painel polla isto pra ver o contador subir).
export async function GET(req: Request) {
  // ?desde=N → só os itens (números já decididos) a partir de N; o painel acumula entre polls.
  const qs = new URL(req.url).search;
  const r = await motor.get("/admin/oficial/disparo" + qs);
  return Response.json(r.data, { status: r.status });
}

// Inicia um disparo em massa: { numeros[], name, language, params?, headerUrl?, intervaloSeg }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await motor.post("/admin/oficial/disparo", body);
  return Response.json(r.data, { status: r.status });
}
