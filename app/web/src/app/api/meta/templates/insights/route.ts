import { motor } from "@/lib/motor";

export const dynamic = "force-dynamic";

// Insights de um template (funil + série diária): ?id=<template_id>&waba=<wabaId>&dias=7|30|90.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of ["id", "waba", "dias", "de", "ate"]) { const v = u.searchParams.get(k); if (v) qs.set(k, v); }
  const r = await motor.get("/admin/meta/templates/insights?" + qs.toString());
  return Response.json(r.data, { status: r.status });
}
