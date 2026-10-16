import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Versão do deploy no ar (tag do deploy.sh) — o Shell compara e avisa aba desatualizada.
export async function GET() {
  const r = await motor.get("/health");
  return Response.json({ versao: (r.data as any)?.versao ?? "" }, { status: 200 });
}
