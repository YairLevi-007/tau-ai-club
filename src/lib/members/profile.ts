import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileLinks = { linkedin?: string; github?: string; website?: string };
export const LINK_KEYS = ["linkedin", "github", "website"] as const;

export type MemberProfile = {
  id: string;
  full_name: string;
  photo_url: string | null;
  year: number | null;
  faculty: string | null;
  program: string | null;
  bio_he: string | null;
  bio_en: string | null;
  links: ProfileLinks;
  is_self: boolean;
};

/** One member's profile through member_profile(): members only, no emails or role. */
export async function getMemberProfile(supabase: SupabaseClient, memberId: string): Promise<MemberProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return null;
  const { data, error } = await supabase.rpc("member_profile", { p_member_id: memberId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : null) as MemberProfile | null;
  return row ?? null;
}

export type MyContact = { phone: string | null; contact_email: string | null; share_phone: boolean; share_email: boolean };

/** The signed-in member's own contact details and sharing toggles (my_contact()). */
export async function getMyContact(supabase: SupabaseClient): Promise<MyContact | null> {
  const { data, error } = await supabase.rpc("my_contact");
  if (error) return null;
  return ((Array.isArray(data) ? data[0] : null) as MyContact | null) ?? null;
}

/**
 * Another member's contact details, as member_contact() returns them: only the fields
 * they chose to show (both hidden by default). Members only; never on public pages.
 */
export async function getMemberContact(supabase: SupabaseClient, memberId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return null;
  const { data, error } = await supabase.rpc("member_contact", { p_member_id: memberId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : null) as { phone: string | null; contact_email: string | null } | null;
  return row && (row.phone || row.contact_email) ? row : null;
}
