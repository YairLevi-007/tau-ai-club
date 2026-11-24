// Where an admin edits an event's content and files, or null for everyone else. Pure, so the
// rule "admins only" is testable on its own. Callers pass the server-side viewer (getViewer /
// requireMember): the decision is never made in the browser. The admin page itself and RLS
// still check again; this only decides whether to show the way there.

type ViewerLike = { kind: string; member?: { role: string } } | null | undefined;

export function contentEditPath(viewer: ViewerLike, eventId: string | null | undefined): string | null {
  if (!viewer || viewer.kind !== "member" || viewer.member?.role !== "admin" || !eventId) return null;
  return `/admin/content/${eventId}`;
}
