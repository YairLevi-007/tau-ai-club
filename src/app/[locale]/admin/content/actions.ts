"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { adminClient, getViewer } from "@/lib/auth/viewer";
import { revalidatePublicContent, str } from "@/lib/admin/content";
import { CONTENT_SECTIONS, type ContentSection } from "@/lib/content/sections";
import type { ActionState } from "@/components/admin/action-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 60000;
const MAX_FILE = 3 * 1024 * 1024; // Server Action body limit is 3 MB (next.config.ts)

function refresh(eventId: string) {
  revalidatePublicContent();
  revalidatePath(`/[locale]/admin/content/${eventId}`, "page");
}

/** Create or update one section of an event (Markdown he/en, audience, draft/published). */
export async function saveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("content");
  const viewer = await getViewer();

  const eventId = str(fd, "event_id");
  const section = str(fd, "section") as ContentSection;
  if (!UUID.test(eventId) || !(CONTENT_SECTIONS as readonly string[]).includes(section)) return { ok: false, message: t("errorFailed") };
  // Keep the text exactly as written (no trim inside), but treat whitespace-only as empty.
  const raw = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.replace(/\r\n/g, "\n") : "";
  };
  const bodyHe = raw("body_he").trim() ? raw("body_he").trimEnd() : "";
  const bodyEn = raw("body_en").trim() ? raw("body_en").trimEnd() : null;
  if (bodyHe.length > MAX_BODY || (bodyEn?.length ?? 0) > MAX_BODY) return { ok: false, message: t("errorTooLong") };

  const { error } = await supabase.from("event_content").upsert(
    {
      event_id: eventId,
      section,
      body_he: bodyHe,
      body_en: bodyEn,
      visibility: str(fd, "visibility") === "public" ? "public" : "members",
      status: str(fd, "status") === "published" ? "published" : "draft",
      updated_by: viewer.kind === "member" ? viewer.member.id : null,
    },
    { onConflict: "event_id,section" },
  );
  if (error) {
    console.error("[content] save failed", error.code);
    return { ok: false, message: t("errorFailed") };
  }
  refresh(eventId);
  return { ok: true, message: t("saved") };
}

/** Upload a PDF to the private `event-files` bucket and list it for members (published). */
export async function uploadEventFile(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("content");

  const eventId = str(fd, "event_id");
  const file = fd.get("file");
  if (!UUID.test(eventId) || !(file instanceof File) || file.size === 0) return { ok: false, message: t("fileErrorType") };
  if (file.size > MAX_FILE) return { ok: false, message: t("fileErrorSize") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A real PDF starts with "%PDF-", whatever the browser says the type is.
  if (!/\.pdf$/i.test(file.name) || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { ok: false, message: t("fileErrorType") };

  const { data: event } = await supabase.from("events").select("slug").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, message: t("errorFailed") };
  const base =
    file.name
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 80) || "file";
  const path = `${event.slug}/${base}.pdf`;

  const up = await supabase.storage.from("event-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) {
    console.error("[content] upload failed", up.error.message);
    return { ok: false, message: t("errorFailed") };
  }
  const title = (k: string) => str(fd, k).slice(0, 200) || file.name.slice(0, 200);
  const { error } = await supabase
    .from("event_files")
    .upsert({ event_id: eventId, path, title_he: title("title_he"), title_en: title("title_en"), status: "published" }, { onConflict: "path" });
  if (error) {
    console.error("[content] file row failed", error.code);
    return { ok: false, message: t("errorFailed") };
  }
  refresh(eventId);
  return { ok: true, message: t("fileUploaded") };
}

export async function setFileStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("content");
  const id = str(fd, "id");
  const eventId = str(fd, "event_id");
  if (!UUID.test(id) || !UUID.test(eventId)) return { ok: false, message: t("errorFailed") };
  const { error } = await supabase
    .from("event_files")
    .update({ status: str(fd, "status") === "published" ? "published" : "draft" })
    .eq("id", id);
  if (error) return { ok: false, message: t("errorFailed") };
  refresh(eventId);
  return { ok: true, message: t("saved") };
}

export async function deleteEventFile(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("content");
  const id = str(fd, "id");
  const eventId = str(fd, "event_id");
  if (!UUID.test(id) || !UUID.test(eventId)) return { ok: false, message: t("errorFailed") };
  const { data: row } = await supabase.from("event_files").select("path").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: t("errorFailed") };
  // Row first: once it's gone, members can't sign the object even if the removal below fails.
  const { error } = await supabase.from("event_files").delete().eq("id", id);
  if (error) return { ok: false, message: t("errorFailed") };
  await supabase.storage.from("event-files").remove([row.path]);
  refresh(eventId);
  return { ok: true, message: t("saved") };
}
