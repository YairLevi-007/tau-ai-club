import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";
import { fetchLumaPage, normalizeLumaUrl, parseLumaHtml, type LumaEvent } from "@/lib/flyer/luma";

export const dynamic = "force-dynamic";

export type LumaResponse = { ok: true; event: LumaEvent } | { ok: false; error: string };

const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error } satisfies LumaResponse, { status, headers: NO_STORE });

/**
 * POST {"url": "https://luma.com/…"} → the event's public details from its Luma page.
 * Admins only (is_admin() in the database, not the UI); everyone else gets 403.
 * Only lu.ma / luma.com are fetched (see fetchLumaPage for the SSRF guards). Nothing is written.
 */
export async function POST(request: NextRequest) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return fail(403, "forbidden");
  const rc = routeClient(request);
  if (!rc) return fail(403, "forbidden");
  const { supabase, apply } = rc;

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return apply(fail(403, "forbidden"));
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return apply(fail(403, "forbidden"));

  if (Number(request.headers.get("content-length") ?? 0) > 4096) return apply(fail(413, "too_large"));
  let url: unknown;
  try {
    url = ((await request.json()) as { url?: unknown })?.url;
  } catch {
    return apply(fail(400, "bad_request"));
  }
  if (typeof url !== "string" || !normalizeLumaUrl(url)) return apply(fail(400, "bad_url"));

  const page = await fetchLumaPage(url);
  if (!page.ok) {
    console.warn("[luma import] fetch failed", { error: page.error });
    return apply(fail(502, page.error));
  }
  const event = parseLumaHtml(page.html, page.url);
  if (!event) return apply(fail(422, "no_data"));
  return apply(NextResponse.json({ ok: true, event } satisfies LumaResponse, { headers: NO_STORE }));
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
