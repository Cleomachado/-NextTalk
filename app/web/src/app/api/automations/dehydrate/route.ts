import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Gatilho do conserto de mídia inline: o motor hospeda o base64 legado e regrava só as URLs.
// Corpo minúsculo (o trabalho pesado é interno ao motor) — não esbarra no teto de corpo do painel.
export async function POST() {
  const r = await motor.post("/admin/automations/dehydrate", {});
  return Response.json(r.data, { status: r.status });
}
