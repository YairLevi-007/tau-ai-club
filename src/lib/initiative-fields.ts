import "server-only";
import { INITIATIVE_CATEGORIES, type InitiativeCategory } from "@/lib/initiatives";

/**
 * The initiative form's fields, checked the way the database checks them (so the member gets a
 * friendly message first). Shared by the member's actions and the admin's edit. The database
 * checks again; nothing here is a security boundary.
 */

export const formStr = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export type InitiativeFields = {
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

export type FieldError = "errorTitle" | "errorSummary" | "errorShort" | "errorSpots" | "errorDate";

export function readInitiativeFields(fd: FormData, locale: string): InitiativeFields | FieldError {
  const title = formStr(fd, "title");
  const summary = formStr(fd, "summary");
  const when = formStr(fd, "when");
  const where = formStr(fd, "where");
  const spotsRaw = formStr(fd, "spots");
  const until = formStr(fd, "signup_until");
  const category = formStr(fd, "category");
  if (!title || title.length > 120) return "errorTitle";
  if (summary.length > 3000) return "errorSummary";
  if (when.length > 120 || where.length > 120) return "errorShort";
  const spots = spotsRaw ? Number(spotsRaw) : null;
  if (spots !== null && !(Number.isInteger(spots) && spots >= 1 && spots <= 1000)) return "errorSpots";
  if (until && !(/^\d{4}-\d{2}-\d{2}$/.test(until) && !Number.isNaN(Date.parse(until)))) return "errorDate";
  return {
    p_lang: locale === "en" ? "en" : "he",
    p_proposed_kind: formStr(fd, "proposed_kind") === "club" ? "club" : "member",
    p_category: (INITIATIVE_CATEGORIES as readonly string[]).includes(category) ? (category as InitiativeCategory) : "other",
    p_title: title,
    p_summary: summary || null,
    p_when: when || null,
    p_where: where || null,
    p_spots: spots,
    p_signup_until: until || null,
  };
}
