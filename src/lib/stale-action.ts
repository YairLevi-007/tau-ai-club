// A Server Action call that failed because the page is from an older deployment: the site was
// updated after the page was opened, so the action's id no longer exists on the server and Next
// throws UnrecognizedActionError in the browser. Only a full reload fixes it. 25.11: this is what
// stopped the session 3 Luma upload, behind the generic "That didn't work".
// The notice the forms show for it: components/admin/stale-page.tsx.

import { unstable_isUnrecognizedActionError } from "next/navigation";

export const isStalePage = (e: unknown): boolean => unstable_isUnrecognizedActionError(e);

/** True when a form carried a chosen file (it's gone after the reload, so say to pick it again). */
export const hasFile = (fd: FormData): boolean => [...fd.values()].some((v) => typeof v !== "string" && v.size > 0);
