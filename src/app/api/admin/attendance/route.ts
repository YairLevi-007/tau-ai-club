import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";
import { getSeasonAttendance } from "@/lib/attendance/data";
import { csvCell } from "@/lib/attendance/luma-csv";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forbidden = () => new NextResponse("forbidden", { status: 403, headers: NO_STORE });

/**
 * GET ?cohort=<id> → the season's attendance grid as CSV (members × meetups, the same as
 * /admin/attendance). Admins only (is_admin() in the database). Member names only: no
 * emails, and nothing about non-member guests except their per-event count.
 */
export async function GET(request: NextRequest) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return forbidden();
  const rc = routeClient(request);
  if (!rc) return forbidden();
  const { supabase, apply } = rc;
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return apply(forbidden());
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return apply(forbidden());

  const cohort = request.nextUrl.searchParams.get("cohort") ?? "";
  if (!UUID.test(cohort)) return apply(new NextResponse("bad cohort", { status: 400, headers: NO_STORE }));
  const season = await getSeasonAttendance(supabase, cohort);
  if (season.error) return apply(new NextResponse("failed", { status: 500, headers: NO_STORE }));

  const date = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(iso));
  const lines: unknown[][] = [];
  lines.push(["member", ...season.events.map((e) => `${date(e.starts_at)} ${e.title_en}`), "attended", "rate"]);
  for (const m of season.members) {
    lines.push([
      m.full_name,
      ...season.events.map((e) => (season.imports.has(e.id) ? (season.cells.get(`${m.id}:${e.id}`)?.status ?? "not_registered") : "")),
      m.attended,
      m.rate === null ? "" : `${Math.round(m.rate * 100)}%`,
    ]);
  }
  lines.push(["(non-member guests checked in)", ...season.events.map((e) => season.imports.get(e.id)?.guests_checked_in ?? ""), "", ""]);
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return apply(
    new NextResponse(body, {
      headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${date(new Date().toISOString())}.csv"` },
    }),
  );
}
