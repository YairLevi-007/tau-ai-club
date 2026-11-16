import { NextResponse, type NextRequest } from "next/server";
import { routeClient } from "@/lib/auth/route-client";
import { hasAuthCookie } from "@/lib/supabase/config";
import { FLYER_MAX_BYTES, FLYER_TYPES, extractFlyer, flyerMode, sniffFlyer, type FlyerType } from "@/lib/flyer/extract";
import { matchSpeaker, matchVenue } from "@/lib/flyer/match";
import type { FlyerExtraction } from "@/lib/flyer/schema";

export const dynamic = "force-dynamic";
// The Claude call can take a while on a dense PDF.
export const maxDuration = 60;

type Named = { id: string; name_he: string; name_en: string };

export type FlyerResponse =
  | {
      ok: true;
      mode: "live" | "mock";
      extraction: FlyerExtraction;
      /** Per extracted speaker: the existing speaker id it matched, or null. */
      speakerMatches: (string | null)[];
      venueId: string | null;
    }
  | { ok: false; error: string };

const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error } satisfies FlyerResponse, { status, headers: NO_STORE });

/**
 * POST multipart `flyer` (PNG/JPEG/WebP/PDF, ≤ 10 MB) → extracted event fields + matches.
 * Admins only (is_admin() in the database, not the UI); everyone else gets 403.
 * Nothing is written: the admin reviews the result in the form and saves a draft.
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

  const mode = flyerMode();
  if (mode === "off") return apply(fail(503, "not_configured"));

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > FLYER_MAX_BYTES + 64 * 1024) return apply(fail(413, "too_large"));

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("flyer");
  } catch {
    return apply(fail(400, "bad_request"));
  }
  if (!(file instanceof File) || file.size === 0) return apply(fail(400, "no_file"));
  if (file.size > FLYER_MAX_BYTES) return apply(fail(413, "too_large"));
  if (!(FLYER_TYPES as readonly string[]).includes(file.type)) return apply(fail(415, "bad_type"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffFlyer(file.type, bytes)) return apply(fail(415, "bad_type"));

  const result = await extractFlyer(bytes, file.type as FlyerType);
  if (!result.ok) return apply(fail(result.error === "not_configured" ? 503 : 502, result.error));

  const [{ data: speakers }, { data: venues }] = await Promise.all([
    supabase.from("speakers").select("id, name_he, name_en"),
    supabase.from("venues").select("id, name_he, name_en"),
  ]);
  const speakerMatches = result.extraction.speakers.map((s) => matchSpeaker(s, (speakers ?? []) as Named[])?.id ?? null);
  const venueId = matchVenue(result.extraction.venue_text, (venues ?? []) as Named[])?.id ?? null;

  const body: FlyerResponse = { ok: true, mode, extraction: result.extraction, speakerMatches, venueId };
  return apply(NextResponse.json(body, { headers: NO_STORE }));
}
