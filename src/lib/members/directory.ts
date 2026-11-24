import type { SupabaseClient } from "@supabase/supabase-js";

/** What member_directory() returns to members, and nothing more (no email, phone, role or links). */
export type DirectoryMember = { id: string; full_name: string; photo_url: string | null; year: number | null; faculty: string | null };

/**
 * Everyone in the club, for the members' directory (DECISIONS 25.11). member_directory() is
 * members-only in the database (empty for anyone else). Only the listed fields are kept, so a
 * future column on the function can't reach the page by accident. null on an error.
 */
export async function getMemberDirectory(supabase: SupabaseClient): Promise<DirectoryMember[] | null> {
  const { data, error } = await supabase.rpc("member_directory");
  if (error || !Array.isArray(data)) return null;
  return (data as DirectoryMember[]).map(({ id, full_name, photo_url, year, faculty }) => ({ id, full_name, photo_url, year, faculty }));
}
