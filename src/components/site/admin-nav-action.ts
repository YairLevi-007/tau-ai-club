"use server";

import { getViewer } from "@/lib/auth/viewer";
import { authEnabled } from "@/lib/supabase/config";

/**
 * For the header's admin link (DECISIONS 25.11). The header is cached HTML, the same for
 * everyone, so a client island asks this once per page load, and only in a browser with the
 * member hint. The answer comes from the database (getViewer → current_member()), never from a
 * cookie, and only says whether the caller themself is an admin. The admin pages check again on
 * the server (requireAdmin) and RLS checks every query; this only decides whether to show a link.
 */
export async function viewerIsAdmin(): Promise<boolean> {
  if (!authEnabled()) return false;
  const viewer = await getViewer();
  return viewer.kind === "member" && viewer.member.role === "admin";
}
