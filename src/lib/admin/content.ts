import "server-only";
import { revalidatePath } from "next/cache";

export const EVENT_KINDS = ["opening", "lecture", "workshop", "joint", "closing", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Postgres error code → the admin message key to show. */
export function contentErrorKey(code: string | undefined) {
  if (code === "23505") return "errorSlugTaken";
  if (code === "23503") return "errorInUse";
  if (code === "23514" || code === "22P02" || code === "22023" || code === "22007" || code === "23502") return "errorInvalid";
  return "errorGeneric";
}

/**
 * After any content change: re-render every public page now (home + Next event card,
 * event pages, season, sitemap, calendar feeds) instead of waiting for the 300s ISR window.
 */
export function revalidatePublicContent() {
  revalidatePath("/", "layout");
}
