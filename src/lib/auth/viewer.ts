import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "member" | "admin";

export type Viewer =
  | { kind: "guest" }
  /** Signed in with Google, but the email isn't on the allowlist. */
  | { kind: "outsider"; email: string | null }
  | {
      kind: "member";
      email: string | null;
      member: { id: string; fullName: string; firstName: string; role: MemberRole };
    };

type CurrentMemberRow = { id: string; full_name: string | null; role: string };

/**
 * Who is looking at this request. Always dynamic (reads cookies), so use it only on
 * member/admin/auth pages, never on ISR public pages. Membership comes from the
 * database (`current_member()`, which matches the verified email), not from the JWT.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  await cookies(); // dynamic even when Supabase isn't configured
  const supabase = await createClient();
  if (!supabase) return { kind: "guest" };

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { kind: "guest" };
  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  const { data: rows } = await supabase.rpc("current_member");
  const row = (Array.isArray(rows) ? rows[0] : null) as CurrentMemberRow | null;
  if (!row) return { kind: "outsider", email };

  const fullName = String(row.full_name ?? "").trim();
  return {
    kind: "member",
    email,
    member: {
      id: row.id,
      fullName,
      firstName: fullName.split(/\s+/)[0] || fullName,
      role: row.role === "admin" ? "admin" : "member",
    },
  };
});

/** Members-only guard for Server Components. Guests → /login?next=path, outsiders → /members-only. */
export async function requireMember(path: string) {
  const viewer = await getViewer();
  if (viewer.kind === "member") return viewer;
  const locale = await getLocale();
  if (viewer.kind === "guest") {
    return redirect({ href: { pathname: "/login", query: { next: path } }, locale });
  }
  return redirect({ href: "/members-only", locale });
}

/** Admin guard for Server Components. Members who aren't admins get a 404. */
export async function requireAdmin(path: string) {
  const viewer = await requireMember(path);
  if (viewer.member.role !== "admin") notFound();
  return viewer;
}

/**
 * Admin guard for Server Actions (each action is its own public endpoint).
 * Returns the cookie-aware client; RLS re-checks every query in the database.
 */
export async function adminClient() {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (viewer.kind !== "member" || viewer.member.role !== "admin" || !supabase) {
    throw new Error("Admins only");
  }
  return supabase;
}
