"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/auth/viewer";
import { decodePrefill, encodePrefill } from "@/lib/flyer/prefill";
import { slugify } from "@/lib/flyer/match";
import { revalidatePublicContent } from "@/lib/admin/content";

export type SpeakerChoice =
  | { action: "existing"; id: string }
  | { action: "new"; name_he: string; name_en: string; company: string; role: string }
  | { action: "skip" };

export type ApplyFlyerResult = { ok: true; prefill: string } | { ok: false; error: "invalid" | "speaker" | "photo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_MAX = 2 * 1024 * 1024;

/**
 * The admin confirmed the flyer review: create the speakers they chose to add, upload the
 * face crops they accepted, and hand back the event-form prefill. The event itself is NOT
 * created here; the admin saves it from the form, as a draft unless they change it.
 *
 * FormData: `prefill` (encoded EventPrefill without speaker ids), `speakers` (JSON
 * SpeakerChoice[] in line-up order), `photo_<i>` (optional JPEG for speaker i).
 */
export async function applyFlyer(fd: FormData): Promise<ApplyFlyerResult> {
  const supabase = await adminClient();
  const prefillParam = fd.get("prefill");
  const prefill = decodePrefill(typeof prefillParam === "string" ? prefillParam : null);
  let choices: SpeakerChoice[];
  try {
    choices = JSON.parse(String(fd.get("speakers") ?? "[]"));
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!prefill || !Array.isArray(choices) || choices.length > 8) return { ok: false, error: "invalid" };

  const speakerIds: (string | null)[] = [];
  for (const c of choices) {
    if (c?.action === "existing" && typeof c.id === "string" && UUID.test(c.id)) {
      speakerIds.push(c.id);
    } else if (c?.action === "new") {
      const name_he = String(c.name_he ?? "").trim().slice(0, 120);
      const name_en = String(c.name_en ?? "").trim().slice(0, 120);
      if (!name_he && !name_en) return { ok: false, error: "speaker" };
      const base = slugify(name_en) || `speaker-${randomUUID().slice(0, 8)}`;
      let id: string | null = null;
      for (let attempt = 0; attempt < 5 && !id; attempt++) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const { data, error } = await supabase
          .from("speakers")
          .insert({
            slug,
            name_he: name_he || name_en,
            name_en: name_en || name_he,
            company_en: String(c.company ?? "").trim().slice(0, 120) || null,
            role_en: String(c.role ?? "").trim().slice(0, 120) || null,
          })
          .select("id")
          .single();
        if (data) id = (data as { id: string }).id;
        else if (error?.code !== "23505") return { ok: false, error: "speaker" };
      }
      if (!id) return { ok: false, error: "speaker" };
      speakerIds.push(id);
    } else {
      speakerIds.push(null);
    }
  }

  // Face crops: only for speakers the admin kept, only real JPEGs, ≤ 2 MB.
  const photos = supabase.storage.from("speaker-photos");
  let photoChanged = false;
  for (let i = 0; i < speakerIds.length; i++) {
    const sid = speakerIds[i];
    const file = fd.get(`photo_${i}`);
    if (!sid || !(file instanceof File) || file.size === 0) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.size > PHOTO_MAX || file.type !== "image/jpeg" || !(bytes[0] === 0xff && bytes[1] === 0xd8)) {
      return { ok: false, error: "photo" };
    }
    const path = `${sid}/${randomUUID()}.jpg`;
    const up = await photos.upload(path, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (up.error) return { ok: false, error: "photo" };
    const url = photos.getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("speakers").update({ photo_url: url }).eq("id", sid);
    if (error) return { ok: false, error: "photo" };
    photoChanged = true;
  }

  revalidatePath("/[locale]/admin/speaker-profiles", "page");
  // A new photo on a speaker who is already on a published event shows up right away.
  if (photoChanged) revalidatePublicContent();
  const ids = speakerIds.filter((x): x is string => !!x);
  return { ok: true, prefill: encodePrefill({ ...prefill, speaker_ids: [...new Set(ids)] }) };
}
