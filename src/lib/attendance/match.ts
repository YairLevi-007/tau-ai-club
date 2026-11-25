// Helping the admin match an unmatched Luma row to a member (25.11). Pure, browser side.

/** Same person, any order and case: "Shani Gal" = "gal shani". */
export const nameKey = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

/** The member whose name is the Luma name (any order and case), if exactly one is; else "". */
export function suggestMember(lumaName: string | undefined, members: { id: string; full_name: string }[]): string {
  const k = lumaName ? nameKey(lumaName) : "";
  if (!k) return "";
  const hits = members.filter((m) => nameKey(m.full_name) === k);
  return hits.length === 1 ? hits[0].id : "";
}
