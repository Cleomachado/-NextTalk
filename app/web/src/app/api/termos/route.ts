import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const momento = new URL(req.url).searchParams.get("momento") === "canal" ? "canal" : "login";
  const r = await motor.get(`/app/termos?momento=${momento}`);
  return Response.json(r.data, { status: r.status });
}
