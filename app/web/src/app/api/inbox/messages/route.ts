import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const account = u.searchParams.get("account") ?? "lite";
  const chatid = u.searchParams.get("chatid") ?? "";
  const r = await motor.get(
    `/admin/inbox/messages?account=${encodeURIComponent(account)}&chatid=${encodeURIComponent(chatid)}`,
  );
  return Response.json(r.data, { status: r.status });
}
