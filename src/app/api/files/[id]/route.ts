import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = () => new NextResponse("members only", { status: 403, headers: NO_STORE });

/**
 * GET /api/files/<id> → a 60-second signed download URL for a lecture/workshop file, for
 * members only. Two locks: RLS on event_files hides the row from non-members and for
 * unpublished files, and Storage RLS on the private `event-files` bucket refuses to sign
 * an object that no published row points at.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return deny();
  const rc = routeClient(request);
  if (!rc) return deny();
  const { supabase, apply } = rc;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return apply(new NextResponse("not found", { status: 404, headers: NO_STORE }));

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return apply(deny());

  const { data: file } = await supabase.from("event_files").select("path").eq("id", id).eq("status", "published").maybeSingle();
  if (!file) return apply(new NextResponse("not found", { status: 404, headers: NO_STORE }));

  const name = file.path.split("/").pop() ?? "file.pdf";
  const { data: signed, error } = await supabase.storage.from("event-files").createSignedUrl(file.path, 60, { download: name });
  if (error || !signed?.signedUrl) return apply(new NextResponse("not found", { status: 404, headers: NO_STORE }));
  return apply(NextResponse.redirect(signed.signedUrl, { status: 303, headers: NO_STORE }));
}
