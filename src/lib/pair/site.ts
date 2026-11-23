import "server-only";

// pAIr's doorway to the site, server side (docs/PAIR.md). pAIr files import site code (`@/…`) only
// from here or from `@/components/pair/site-ui`; tests/m3/pair-boundary.spec.ts enforces it.
// The site keeps these names and meanings stable, or updates pAIr in the same change.

export { getViewer, requireAdmin, adminClient } from "@/lib/auth/viewer";
export { createClient } from "@/lib/supabase/server";
export { currentCohort } from "@/lib/attendance/data";
export { signPhotos } from "@/lib/members/photos";
export { str } from "@/lib/admin/content";
export type { ProfileLinks } from "@/lib/members/profile";
