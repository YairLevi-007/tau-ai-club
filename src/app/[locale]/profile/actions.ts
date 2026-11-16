"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, AVATAR_TYPES, avatarObjectUrl, avatarPath } from "@/lib/members/photos";
import { LINK_KEYS, type ProfileLinks } from "@/lib/members/profile";
import type { ActionState } from "@/components/admin/action-form";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Members-only guard for these actions. RLS limits every write to the caller's own row. */
async function memberClient() {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (viewer.kind !== "member" || !supabase) throw new Error("Members only");
  return { supabase, member: viewer.member };
}

function revalidateProfile(memberId: string) {
  revalidatePath("/[locale]/profile", "page");
  revalidatePath(`/[locale]/members/${memberId}`, "page");
}

/** "github.com/x" → "https://github.com/x". Anything else is left for the DB check. */
function normalizeUrl(value: string) {
  if (!value) return "";
  return /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
}

export async function saveProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, member } = await memberClient();
  const t = await getTranslations("profile");

  const fullName = str(fd, "full_name");
  const yearRaw = str(fd, "year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;
  if (!fullName || fullName.length > 120) return { ok: false, message: t("errorName") };
  if (year !== null && !(Number.isInteger(year) && year >= 1 && year <= 10)) return { ok: false, message: t("errorYear") };

  const links: ProfileLinks = {};
  for (const key of LINK_KEYS) {
    const v = normalizeUrl(str(fd, key));
    if (v) links[key] = v;
  }

  if (fullName !== member.fullName) {
    const { error } = await supabase.rpc("update_my_name", { p_full_name: fullName });
    if (error) return { ok: false, message: t("errorName") };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      year,
      faculty: str(fd, "faculty") || null,
      bio_he: str(fd, "bio_he") || null,
      bio_en: str(fd, "bio_en") || null,
      links,
    })
    .eq("member_id", member.id)
    .select("member_id");
  if (error) return { ok: false, message: error.code === "23514" ? t("errorLinks") : t("errorGeneric") };
  if (!data?.length) return { ok: false, message: t("errorGeneric") };

  revalidateProfile(member.id);
  return { ok: true, message: t("saved") };
}

/** True when the bytes really start like the claimed image type. */
function looksLike(type: string, b: Uint8Array) {
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/webp") {
    const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  }
  return false;
}

async function currentPhotoPath(supabase: Awaited<ReturnType<typeof memberClient>>["supabase"], memberId: string) {
  const { data } = await supabase.from("profiles").select("photo_url").eq("member_id", memberId).maybeSingle();
  return avatarPath((data as { photo_url: string | null } | null)?.photo_url);
}

export async function uploadPhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, member } = await memberClient();
  const t = await getTranslations("profile");

  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: t("errorNoFile") };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ok: false, message: t("errorPhotoType") };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, message: t("errorPhotoSize") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes)) return { ok: false, message: t("errorPhotoType") };

  const old = await currentPhotoPath(supabase, member.id);
  // A new name each time, so no cached signed URL ever shows the old photo.
  const path = `${member.id}/${randomUUID()}.${ext}`;
  const storage = supabase.storage.from(AVATAR_BUCKET);
  const up = await storage.upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "3600" });
  if (up.error) return { ok: false, message: t("errorGeneric") };

  const { error } = await supabase.from("profiles").update({ photo_url: avatarObjectUrl(path) }).eq("member_id", member.id);
  if (error) {
    await storage.remove([path]);
    return { ok: false, message: t("errorGeneric") };
  }
  if (old) await storage.remove([old]);

  revalidateProfile(member.id);
  return { ok: true, message: t("photoSaved") };
}

export async function removePhoto(): Promise<ActionState> {
  const { supabase, member } = await memberClient();
  const t = await getTranslations("profile");
  const old = await currentPhotoPath(supabase, member.id);
  const { error } = await supabase.from("profiles").update({ photo_url: null }).eq("member_id", member.id);
  if (error) return { ok: false, message: t("errorGeneric") };
  if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
  revalidateProfile(member.id);
  return { ok: true, message: t("photoRemoved") };
}
