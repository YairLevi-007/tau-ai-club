import type { NextRequest } from "next/server";
import { localeParam } from "@/lib/auth/route-client";
import { eventIcsResponse } from "@/lib/ics";

/** GET /api/calendar/<slug>?locale=en: one meetup as a .ics download (public event data only). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/calendar/[slug]">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response("Not found", { status: 404 });
  return eventIcsResponse(slug, localeParam(request.nextUrl.searchParams.get("locale")));
}
