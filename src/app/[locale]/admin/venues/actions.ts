"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { adminClient } from "@/lib/auth/viewer";
import { contentErrorKey, revalidatePublicContent, str } from "@/lib/admin/content";
import type { ActionState } from "@/components/admin/action-form";

const fields = (fd: FormData) => ({
  name_he: str(fd, "name_he"),
  name_en: str(fd, "name_en"),
  address_he: str(fd, "address_he") || null,
  address_en: str(fd, "address_en") || null,
  maps_url: str(fd, "maps_url") || null,
});

export async function saveVenue(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const row = fields(fd);
  if (!row.name_he || !row.name_en) return { ok: false, message: t("errorRequired") };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("venues").update(row).eq("id", id)
    : await supabase.from("venues").insert(row);
  if (error) return { ok: false, message: t(contentErrorKey(error.code)) };
  revalidatePath("/[locale]/admin/venues", "page");
  revalidatePublicContent();
  return { ok: true, message: id ? t("saved") : t("added") };
}

/** Events at this venue fall back to "venue TBD" (venue_id on delete set null). */
export async function deleteVenue(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const { error, count } = await supabase.from("venues").delete({ count: "exact" }).eq("id", str(fd, "id"));
  if (error || !count) return { ok: false, message: t(contentErrorKey(error?.code)) };
  revalidatePath("/[locale]/admin/venues", "page");
  revalidatePublicContent();
  return { ok: true, message: t("deleted") };
}
