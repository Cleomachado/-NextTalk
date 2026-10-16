import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// De onde o lead veio (UTM do checkout / anúncio) → selo ADS + lista de UTMs no cabeçalho da conversa.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await motor.get("/admin/inbox/rastreio" + url.search);
  return Response.json(r.data, { status: r.status });
}
