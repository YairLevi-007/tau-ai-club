"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formStr, isUuid, readInitiativeFields } from "@/lib/initiative-fields";
import type { ActionState } from "@/components/admin/action-form";

/**
 * Initiatives: the member's writes. Each action is its own public endpoint, so each checks
 * membership here; the database checks it again (every write is an RPC that knows the caller,
 * the lead and the initiative's state). Nothing here trusts an id or a field from the form.
 */

const str = formStr;
const isId = isUuid;

async function memberClient() {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (viewer.kind !== "member" || !supabase) throw new Error("Members only");
  return supabase;
}

function revalidateInitiatives(id?: string) {
  revalidatePath("/[locale]/initiatives", "page");
  if (id) revalidatePath(`/[locale]/initiatives/${id}`, "page");
  revalidatePath("/[locale]/admin/initiatives", "page");
}

/** The form's fields in the page's language (the database checks them again). */
async function readFields(fd: FormData) {
  return readInitiativeFields(fd, await getLocale());
}

/** Which message a database error maps to. */
function dbErrorKey(message: string) {
  if (/too many proposals today/i.test(message)) return "errorTooManyToday" as const;
  if (/too many proposals/i.test(message)) return "errorTooMany" as const;
  if (/no spots left/i.test(message)) return "errorFull" as const;
  if (/sign-up has closed/i.test(message)) return "errorClosed" as const;
  if (/title/i.test(message)) return "errorTitle" as const;
  return "errorGeneric" as const;
}

export async function proposeInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await memberClient();
  const [t, locale] = await Promise.all([getTranslations("initiatives"), getLocale()]);
  const fields = await readFields(fd);
  if (typeof fields === "string") return { ok: false, message: t(fields) };
  const { data, error } = await supabase.rpc("propose_initiative", fields);
  if (error) return { ok: false, message: t(dbErrorKey(error.message)) };
  revalidateInitiatives(typeof data === "string" ? data : undefined);
  // An admin's goes up at once: show it. A member's waits: show "Mine" with the "sent" note.
  const { data: row } = await supabase.from("initiatives").select("status").eq("id", data).maybeSingle();
  if (row?.status === "published") return redirect({ href: `/initiatives/${data}`, locale });
  return redirect({ href: { pathname: "/initiatives", query: { filter: "mine", sent: "1" } }, locale });
}

export async function updateInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await memberClient();
  const [t, locale] = await Promise.all([getTranslations("initiatives"), getLocale()]);
  const id = str(fd, "id");
  if (!isId(id)) return { ok: false, message: t("errorGeneric") };
  const fields = await readFields(fd);
  if (typeof fields === "string") return { ok: false, message: t(fields) };
  const { error } = await supabase.rpc("update_my_initiative", { p_id: id, ...fields });
  if (error) return { ok: false, message: t(dbErrorKey(error.message)) };
  revalidateInitiatives(id);
  return redirect({ href: { pathname: "/initiatives", query: { filter: "mine", sent: "1" } }, locale });
}

export async function withdrawInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await memberClient();
  const [t, locale] = await Promise.all([getTranslations("initiatives"), getLocale()]);
  const id = str(fd, "id");
  if (!isId(id)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("withdraw_my_initiative", { p_id: id });
  if (error) return { ok: false, message: t("errorGeneric") };
  revalidateInitiatives(id);
  return redirect({ href: { pathname: "/initiatives", query: { filter: "mine" } }, locale });
}

export async function joinInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await memberClient();
  const t = await getTranslations("initiatives");
  const id = str(fd, "id");
  if (!isId(id)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("join_initiative", { p_id: id });
  if (error) return { ok: false, message: t(dbErrorKey(error.message)) };
  revalidateInitiatives(id);
  // The control itself switches to "You're in", so no status line (it showed the word twice: QA m6).
  return { ok: true, message: "" };
}

export async function leaveInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await memberClient();
  const t = await getTranslations("initiatives");
  const id = str(fd, "id");
  if (!isId(id)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("leave_initiative", { p_id: id });
  if (error) return { ok: false, message: t("errorGeneric") };
  revalidateInitiatives(id);
  return { ok: true, message: "" };
}
