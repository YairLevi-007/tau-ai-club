import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/config";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MARKER = `/storage/v1/object/authenticated/${AVATAR_BUCKET}/`;
const SIGNED_SECONDS = 60 * 60;

/**
 * profiles.photo_url stores the canonical object URL (private bucket). It is never
 * served as is: pages sign it per request, so photos stay members-only.
 */
export function avatarObjectUrl(path: string) {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  return `${env.url.replace(/\/+$/, "")}${MARKER}${path}`;
}

/** "<member_id>/<file>" from a stored photo_url, or null. */
export function avatarPath(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  const i = photoUrl.indexOf(MARKER);
  return i === -1 ? null : photoUrl.slice(i + MARKER.length);
}

/** Short-lived signed URLs for stored photo_urls, keyed by the stored value. */
export async function signPhotos(supabase: SupabaseClient, photoUrls: (string | null | undefined)[]) {
  const byPath = new Map<string, string>();
  for (const url of photoUrls) {
    const path = avatarPath(url);
    if (path && url) byPath.set(path, url);
  }
  const out = new Map<string, string>();
  if (byPath.size === 0) return out;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls([...byPath.keys()], SIGNED_SECONDS);
  for (const row of data ?? []) {
    const original = row.path ? byPath.get(row.path) : undefined;
    if (original && row.signedUrl) out.set(original, row.signedUrl);
  }
  return out;
}
