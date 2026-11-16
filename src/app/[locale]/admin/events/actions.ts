"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { adminClient } from "@/lib/auth/viewer";
import { EVENT_KINDS, contentErrorKey, revalidatePublicContent, str } from "@/lib/admin/content";
import { wallTimeToUtc } from "@/lib/wall-time";
import type { ActionState } from "@/components/admin/action-form";

/** Create or update an event and its line-up in one transaction (admin_save_event). */
export async function saveEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");

  const startsAt = wallTimeToUtc(str(fd, "starts_at"));
  const endsAt = wallTimeToUtc(str(fd, "ends_at"));
  if (!startsAt || !endsAt) return { ok: false, message: t("errorTime") };
  if (endsAt <= startsAt) return { ok: false, message: t("errorEndsBeforeStarts") };
  const kind = str(fd, "kind");
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) return { ok: false, message: t("errorInvalid") };
  const status = str(fd, "status") === "published" ? "published" : "draft";

  const speakerIds = fd
    .getAll("speaker_id")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (new Set(speakerIds).size !== speakerIds.length) return { ok: false, message: t("errorDuplicateSpeaker") };

  const id = str(fd, "id");
  const payload = {
    id,
    slug: str(fd, "slug").toLowerCase(),
    cohort_id: str(fd, "cohort_id"),
    kind,
    series: str(fd, "series").toLowerCase(),
    series_no: str(fd, "series_no"),
    title_he: str(fd, "title_he"),
    title_en: str(fd, "title_en"),
    blurb_he: str(fd, "blurb_he"),
    blurb_en: str(fd, "blurb_en"),
    starts_at: startsAt,
    ends_at: endsAt,
    venue_id: str(fd, "venue_id"),
    venue_note_he: str(fd, "venue_note_he"),
    venue_note_en: str(fd, "venue_note_en"),
    luma_url: str(fd, "luma_url"),
    is_tentative: fd.get("is_tentative") === "on",
    status,
    speaker_ids: speakerIds,
  };
  if (!payload.slug || !payload.title_he || !payload.title_en || !payload.cohort_id) {
    return { ok: false, message: t("errorRequired") };
  }

  const { data, error } = await supabase.rpc("admin_save_event", { p: payload });
  if (error || typeof data !== "string") return { ok: false, message: t(contentErrorKey(error?.code)) };

  revalidatePublicContent();
  if (!id) {
    const locale = await getLocale();
    redirect({ href: { pathname: `/admin/events/${data}`, query: { created: "1" } }, locale });
  }
  return { ok: true, message: t("saved") };
}

export async function deleteEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const { error, count } = await supabase.from("events").delete({ count: "exact" }).eq("id", str(fd, "id"));
  if (error || !count) return { ok: false, message: t(contentErrorKey(error?.code)) };
  revalidatePublicContent();
  const locale = await getLocale();
  redirect({ href: "/admin/events", locale });
  return { ok: true, message: t("deleted") };
}
