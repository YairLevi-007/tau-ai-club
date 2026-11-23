"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { adminClient } from "@/lib/auth/viewer";
import { formStr, isUuid, readInitiativeFields } from "@/lib/initiative-fields";
import { mailConfigured, sendMail } from "@/lib/email/mailer";
import { initiativeAnswerMail, type Answer } from "@/lib/email/initiative-answer";
import type { ActionState } from "@/components/admin/action-form";

/**
 * Initiatives, the admin side. Each action is its own public endpoint: adminClient() refuses
 * anyone but an admin, and the database checks again (admin_review_initiative asserts admin;
 * the table's write policy is admins-only).
 */

function revalidateAll(id: string) {
  revalidatePath("/[locale]/admin/initiatives", "page");
  revalidatePath("/[locale]/initiatives", "page");
  revalidatePath(`/[locale]/initiatives/${id}`, "page");
}

/**
 * Publish (the "זו יוזמה של המועדון" switch decides the kind), return with a note, or reject. Then
 * the proposer gets an email, if the site's email is set up; the answer shows on the site anyway.
 */
export async function reviewInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const [t, locale] = await Promise.all([getTranslations("initiativesAdmin"), getLocale()]);
  const id = formStr(fd, "id");
  const decision = formStr(fd, "decision");
  if (!isUuid(id) || !["publish", "return", "reject"].includes(decision)) return { ok: false, message: t("errorStale") };
  const makeClub = fd.get("make_club") === "on";
  const note = formStr(fd, "note").slice(0, 1000) || null;
  if (decision === "return" && !note) return { ok: false, message: t("errorNote") };
  const reason = makeClub ? formStr(fd, "club_reason").slice(0, 500) || null : null;

  const { data: row } = await supabase
    .from("initiatives")
    .select("title_he, title_en, lead_id")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (!row) return { ok: false, message: t("errorStale") };

  const { error } = await supabase.rpc("admin_review_initiative", {
    p_id: id,
    p_decision: decision,
    p_make_club: makeClub,
    p_note: decision === "publish" ? null : note,
    p_club_reason: reason,
    p_lang: locale === "en" ? "en" : "he",
  });
  if (error) return { ok: false, message: t("errorStale") };
  revalidateAll(id);

  // The email goes to the proposer's primary address (read here on the server, never sent to the page).
  const answer: Answer = decision === "publish" ? (makeClub ? "published_club" : "published") : decision === "return" ? "returned" : "rejected";
  const { data: lead } = await supabase
    .from("members")
    .select("status, member_emails(email, is_primary)")
    .eq("id", row.lead_id)
    .maybeSingle();
  const emails = (lead?.member_emails ?? []) as { email: string; is_primary: boolean }[];
  const to = lead?.status === "active" ? (emails.find((e) => e.is_primary) ?? emails[0])?.email : undefined;
  const sent = !mailConfigured()
    ? "not-configured"
    : to
    ? await sendMail(
        await initiativeAnswerMail({ to, answer, title: row.title_he ?? row.title_en ?? "", note: decision === "publish" ? null : note, id }),
      )
    : "failed";
  // The card leaves the queue, so the result (and whether the email went out) shows on the page.
  return redirect({ href: { pathname: "/admin/initiatives", query: { done: sent } }, locale });
}

/** An admin edits a published initiative (the lead can't once it's up: DECISIONS 19.11). Text in the page's language. */
export async function editInitiativeAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const [t, ti, locale] = await Promise.all([getTranslations("initiativesAdmin"), getTranslations("initiatives"), getLocale()]);
  const id = formStr(fd, "id");
  if (!isUuid(id)) return { ok: false, message: ti("errorGeneric") };
  const f = readInitiativeFields(fd, locale);
  if (typeof f === "string") return { ok: false, message: ti(f) };
  const { error, count } = await supabase
    .from("initiatives")
    .update(
      {
        category: f.p_category,
        [`title_${f.p_lang}`]: f.p_title,
        [`summary_${f.p_lang}`]: f.p_summary,
        when_text: f.p_when,
        where_text: f.p_where,
        spots: f.p_spots,
        signup_until: f.p_signup_until,
      },
      { count: "exact" },
    )
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: ti("errorGeneric") };
  revalidateAll(id);
  return { ok: true, message: t("saved") };
}

/** Remove an initiative, with everyone who joined it. */
export async function removeInitiative(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const [ti, locale] = await Promise.all([getTranslations("initiatives"), getLocale()]);
  const id = formStr(fd, "id");
  if (!isUuid(id)) return { ok: false, message: ti("errorGeneric") };
  const { error } = await supabase.from("initiatives").delete().eq("id", id);
  if (error) return { ok: false, message: ti("errorGeneric") };
  revalidateAll(id);
  return redirect({ href: { pathname: "/admin/initiatives", query: { tab: "published" } }, locale });
}
