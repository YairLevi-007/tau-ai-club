import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export type SpeakerContact = { email?: string; phone?: string; linkedin?: string };
export type SpeakerContacts = Record<string, SpeakerContact>;

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/**
 * Speaker contact details for one published event, for members only.
 *
 * The event page is ISR and identical for everyone, so contact data must never be in
 * it. A client island calls this endpoint instead; it answers per request, is never
 * cached, and returns `{}` to guests and non-members. The database decides: the RPC
 * member_speaker_contact() returns nothing unless is_member(), and only the fields
 * the speaker agreed to share.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/events/[slug]/speaker-contacts">) {
  const empty = (res?: (r: NextResponse) => NextResponse) => {
    const r = NextResponse.json({ contacts: {} }, { headers: NO_STORE });
    return res ? res(r) : r;
  };

  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) return empty();
  const rc = routeClient(request);
  if (!rc) return empty();
  const { supabase, apply } = rc;

  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return empty(apply);

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return empty(apply);
  const { data: isMember } = await supabase.rpc("is_member");
  if (isMember !== true) return empty(apply);

  const { data: event } = await supabase
    .from("events")
    .select("id, event_speakers(speaker_id)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const speakerIds = ((event?.event_speakers ?? []) as { speaker_id: string }[]).map((s) => s.speaker_id);

  const contacts: SpeakerContacts = {};
  await Promise.all(
    speakerIds.map(async (id) => {
      const { data } = await supabase.rpc("member_speaker_contact", { p_speaker_id: id });
      const row = (Array.isArray(data) ? data[0] : null) as { email: string | null; phone: string | null; linkedin_url: string | null } | null;
      if (!row) return;
      const c: SpeakerContact = {};
      if (row.email) c.email = row.email;
      if (row.phone) c.phone = row.phone;
      if (row.linkedin_url?.startsWith("https://")) c.linkedin = row.linkedin_url;
      if (Object.keys(c).length) contacts[id] = c;
    }),
  );

  const res = NextResponse.json({ contacts }, { headers: NO_STORE });
  return apply(res);
}
