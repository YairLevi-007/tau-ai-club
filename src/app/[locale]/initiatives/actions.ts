"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { INITIATIVE_CATEGORIES, type InitiativeCategory } from "@/lib/initiatives";
import type { ActionState } from "@/components/admin/action-form";

/**
 * Initiatives: the member's writes. Each action is its own public endpoint, so each checks
 * membership here; the database checks it again (every write is an RPC that knows the caller,
 * the lead and the initiative's state). Nothing here trusts an id or a field from the form.
 */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

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

type Fields = {
  p_lang: "he" | "en";
  p_proposed_kind: "club" | "member";
  p_category: InitiativeCategory;
  p_title: string;
  p_summary: string | null;
  p_when: string | null;
  p_where: string | null;
  p_spots: number | null;
  p_signup_until: string | null;
};

type ErrorKey = "errorTitle" | "errorSummary" | "errorShort" | "errorSpots" | "errorDate";

/** The form's fields, checked the same way the database will check them (friendlier messages first). */
async function readFields(fd: FormData): Promise<Fields | ErrorKey> {
  const locale = (await getLocale()) === "en" ? "en" : "he";
  const title = str(fd, "title");
  const summary = str(fd, "summary");
  const when = str(fd, "when");
  const where = str(fd, "where");
  const spotsRaw = str(fd, "spots");
  const until = str(fd, "signup_until");
  const category = str(fd, "category");
  if (!title || title.length > 120) return "errorTitle";
  if (summary.length > 3000) return "errorSummary";
  if (when.length > 120 || where.length > 120) return "errorShort";
  const spots = spotsRaw ? Number(spotsRaw) : null;
  if (spots !== null && !(Number.isInteger(spots) && spots >= 1 && spots <= 1000)) return "errorSpots";
  if (until && !(/^\d{4}-\d{2}-\d{2}$/.test(until) && !Number.isNaN(Date.parse(until)))) return "errorDate";
  return {
    p_lang: locale,
    p_proposed_kind: str(fd, "proposed_kind") === "club" ? "club" : "member",
    p_category: (INITIATIVE_CATEGORIES as readonly string[]).includes(category) ? (category as InitiativeCategory) : "other",
    p_title: title,
    p_summary: summary || null,
    p_when: when || null,
    p_where: where || null,
    p_spots: spots,
    p_signup_until: until || null,
  };
}

/** Which message a database error maps to. */
function dbErrorKey(message: string) {
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
  return { ok: true, message: t("youreIn") };
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
