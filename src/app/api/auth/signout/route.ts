import { NextResponse, type NextRequest } from "next/server";
import { localeParam, localized, routeClient } from "@/lib/auth/route-client";

export const dynamic = "force-dynamic";

/** POST /api/auth/signout (form field `locale`). Clears the session cookies. */
export async function POST(request: NextRequest) {
  // Same-origin form posts only (a cross-site page can't sign people out).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const raw = form?.get("locale");
  const locale = localeParam(typeof raw === "string" ? raw : null);
  const home = new URL(localized(locale, "/"), request.nextUrl.origin);

  const client = routeClient(request);
  if (!client) return NextResponse.redirect(home, 303);
  await client.supabase.auth.signOut({ scope: "local" });
  return client.apply(NextResponse.redirect(home, 303));
}
