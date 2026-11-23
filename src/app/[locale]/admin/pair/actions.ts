"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { adminClient } from "@/lib/auth/viewer";
import { str } from "@/lib/admin/content";
import { getPairAdminData, UUID } from "@/lib/pair/data";
import { history, makeGroups } from "@/lib/pair/match";
import type { ActionState } from "@/components/admin/action-form";

const refresh = () => revalidatePath("/[locale]/admin/pair", "layout");

/** Start pairing for a meetup: the round opens with everyone registered on Luma. */
export async function openRound(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const eventId = str(fd, "event_id");
  if (!UUID.test(eventId)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("admin_pair_open_round", { p_event_id: eventId });
  if (error) return { ok: false, message: t("errorGeneric") };
  refresh();
  const locale = await getLocale();
  redirect({ href: `/admin/pair/${eventId}`, locale });
  return { ok: true, message: "" };
}

/** Who is coming: the ticked boxes replace the list (and clear a draft's conversations). */
export async function savePeople(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const roundId = str(fd, "round_id");
  const ids = fd.getAll("member").map(String).filter((id) => UUID.test(id));
  if (!UUID.test(roundId)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("admin_pair_set_people", { p_round_id: roundId, p_member_ids: ids });
  if (error) return { ok: false, message: t(error.message.includes("published") ? "errorPublished" : "errorGeneric") };
  refresh();
  return { ok: true, message: t("peopleSaved", { n: ids.length }) };
}

/** pAIr's "create matching": new conversations that avoid pairs who already met. */
export async function generateGroups(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const roundId = str(fd, "round_id");
  if (!UUID.test(roundId)) return { ok: false, message: t("errorGeneric") };
  const data = await getPairAdminData(supabase);
  const round = data.rounds.find((r) => r.id === roundId);
  if (data.error || !round) return { ok: false, message: t("errorGeneric") };
  if (round.status !== "draft") return { ok: false, message: t("errorPublished") };
  const ids = [...round.people.keys()].filter((id) => data.persons.has(id)).sort();
  if (ids.length < 2) return { ok: false, message: t("needTwo") };
  const groups = makeGroups(ids, history(data.rounds, round.id));
  if (!groups) return { ok: false, message: t("needTwo") };
  const { error } = await supabase.rpc("admin_pair_save_groups", { p_round_id: roundId, p_groups: groups });
  if (error) return { ok: false, message: t("errorGeneric") };
  refresh();
  return { ok: true, message: t("generated", { n: groups.length }) };
}

/** Lock and publish to members, or take back to a draft (hides it, clears confirmations). */
export async function publishRound(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const roundId = str(fd, "round_id");
  const on = str(fd, "publish") === "1";
  if (!UUID.test(roundId)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("admin_pair_publish", { p_round_id: roundId, p_publish: on });
  if (error) return { ok: false, message: t(on ? "errorNothingToPublish" : "errorGeneric") };
  refresh();
  revalidatePath("/[locale]/me", "page");
  return { ok: true, message: t(on ? "published" : "unpublished") };
}

/** An admin's mark on one conversation: met, missed, or back to the members' confirmations. */
export async function markGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const groupId = str(fd, "group_id");
  const raw = str(fd, "mark");
  const mark = raw === "met" || raw === "missed" ? raw : null;
  if (!UUID.test(groupId)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("admin_pair_mark_group", { p_group_id: groupId, p_mark: mark });
  if (error) return { ok: false, message: t("errorGeneric") };
  refresh();
  return { ok: true, message: t("markSaved") };
}

export async function deleteRound(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await adminClient();
  const t = await getTranslations("pair");
  const roundId = str(fd, "round_id");
  if (!UUID.test(roundId)) return { ok: false, message: t("errorGeneric") };
  const { error } = await supabase.rpc("admin_pair_delete_round", { p_round_id: roundId });
  if (error) return { ok: false, message: t("errorGeneric") };
  refresh();
  revalidatePath("/[locale]/me", "page");
  const locale = await getLocale();
  redirect({ href: "/admin/pair", locale });
  return { ok: true, message: "" };
}
