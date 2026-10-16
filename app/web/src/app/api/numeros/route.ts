import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Cliente cai em /app/numeros pelo remap do motor.ts; admin fala com /admin/numeros (sem teto).
export async function GET() {
  const r = await motor.get("/admin/numeros");
  return Response.json(r.data, { status: r.status });
}
