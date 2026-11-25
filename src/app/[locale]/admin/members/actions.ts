"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { adminClient } from "@/lib/auth/viewer";
import { parseMemberCsv } from "@/lib/auth/csv";
import type { ActionState } from "@/components/admin/action-form";

// Every action re-checks admin (adminClient) and RLS re-checks it again in the database.

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const role = (v: string) => (v === "admin" ? "admin" : "member");

async function fail(error: PostgrestError | Error): Promise<ActionState> {
  const t = await getTranslations("admin");
  const code = "code" in error ? error.code : "";
  if (code === "23505") return { ok: false, message: t("errorEmailTaken") };
  if (code === "P0001" && /last admin/.test(error.message)) return { ok: false, message: t("errorLastAdmin") };
  if (code === "23514" || code === "22023" || code === "22P02") return { ok: false, message: t("errorInvalid") };
  return { ok: false, message: t("errorGeneric") };
}

async function done(key: "saved" | "added" | "removed"): Promise<ActionState> {
  revalidatePath("/[locale]/admin/members", "page");
  const t = await getTranslations("admin");
  return { ok: true, message: t(key) };
}

export async function addMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const { error } = await supabase.rpc("admin_add_member", {
    p_email: str(fd, "email"),
    p_full_name: str(fd, "full_name"),
    p_role: role(str(fd, "role")),
  });
  return error ? fail(error) : done("added");
}

export async function setRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const { error } = await supabase.from("members").update({ role: role(str(fd, "role")) }).eq("id", str(fd, "member_id"));
  return error ? fail(error) : done("saved");
}

export async function removeMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const { error } = await supabase.from("members").delete().eq("id", str(fd, "member_id"));
  return error ? fail(error) : done("removed");
}

export async function addEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const { error } = await supabase
    .from("member_emails")
    .insert({ member_id: str(fd, "member_id"), email: str(fd, "email").toLowerCase(), is_primary: false });
  return error ? fail(error) : done("added");
}

export async function removeEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  // Only secondary emails; the primary one goes with the member.
  const { error } = await supabase.from("member_emails").delete().eq("email", str(fd, "email")).eq("is_primary", false);
  return error ? fail(error) : done("removed");
}

/** A Luma address linked to a member (by an admin, or added by the member): match only. */
export async function removeLumaEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const { error } = await supabase.from("member_luma_emails").delete().eq("email", str(fd, "email"));
  return error ? fail(error) : done("removed");
}

const MAX_CSV_BYTES = 256 * 1024;

export async function importCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("admin");
  const file = fd.get("file");
  let text = str(fd, "text");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { ok: false, message: t("errorImport", { detail: "file > 256 KB" }) };
    text = await file.text();
  }
  const rows = parseMemberCsv(text);
  if (!rows.length) return { ok: false, message: t("errorEmpty") };

  const { data, error } = await supabase.rpc("admin_import_members", { p_rows: rows });
  if (error) {
    // The database names the failing row ("row 3: invalid email"); safe to show admins.
    if (error.code === "22023") return { ok: false, message: t("errorImport", { detail: error.message }) };
    return fail(error);
  }
  const res = (Array.isArray(data) ? data[0] : data) as { inserted: number; updated: number } | null;
  revalidatePath("/[locale]/admin/members", "page");
  return { ok: true, message: t("imported", { inserted: res?.inserted ?? 0, updated: res?.updated ?? 0 }) };
}
