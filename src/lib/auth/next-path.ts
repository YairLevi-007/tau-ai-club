/**
 * Only same-site, absolute, locale-free paths are allowed as a post-login
 * destination, so `?next=` can never become an open redirect (no `//host`,
 * `/\host`, schemes, control characters or whitespace).
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\s\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  // Never bounce back into the auth endpoints themselves.
  if (next.startsWith("/api/")) return fallback;
  return next;
}
