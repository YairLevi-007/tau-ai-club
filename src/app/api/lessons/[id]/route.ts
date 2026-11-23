import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";
import { lessonHeaders, withLessonShim } from "@/lib/content/lesson";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Errors get the same sandbox headers as a lesson, so nothing this route sends ever runs with
// the site's origin.
const reply = (body: string, status: number) => new NextResponse(body, { status, headers: { ...lessonHeaders(), "Content-Type": "text/plain; charset=utf-8" } });

/**
 * GET /api/lessons/<id> → an interactive HTML lesson, members only, served inside a CSP sandbox
 * (opaque origin; see src/lib/content/lesson.ts). Same two locks as /api/files: RLS on
 * event_files hides unpublished lessons and non-members get no row; Storage RLS on the private
 * `event-files` bucket refuses an object no published row points at. The page that embeds it is
 * /[locale]/lessons/<id>.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/lessons/[id]">) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return reply("members only", 403);
  const rc = routeClient(request);
  if (!rc) return reply("members only", 403);
  const { supabase, apply } = rc;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return apply(reply("not found", 404));

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return apply(reply("members only", 403));

  const { data: file } = await supabase.from("event_files").select("path").eq("id", id).eq("status", "published").eq("kind", "lesson").maybeSingle();
  if (!file) return apply(reply("not found", 404));

  const { data: blob, error } = await supabase.storage.from("event-files").download(file.path);
  if (error || !blob) return apply(reply("not found", 404));
  const html = withLessonShim(await blob.text());
  return apply(new NextResponse(html, { status: 200, headers: lessonHeaders() }));
}
