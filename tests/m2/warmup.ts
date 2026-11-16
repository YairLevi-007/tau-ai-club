/**
 * Global setup for the M2 page specs: request every route once, sequentially, before any worker starts.
 * `next dev` compiles a route on its first request, and parallel cold requests to the same route can 500
 * (Next-internal "Unexpected end of JSON input" race). Warming removes that race, so retries can stay at 0.
 */
const PORT = Number(process.env.PW_M2_PORT) || 3600;

const ROUTES = [
  "/", "/en", "/login", "/en/login", "/members-only", "/en/members-only", "/welcome", "/en/welcome",
  "/profile", "/en/profile", "/members/123e4567-e89b-42d3-a456-426614174000", "/en/members/123e4567-e89b-42d3-a456-426614174000",
  "/admin", "/en/admin", "/admin/members", "/en/admin/members", "/admin/events", "/en/admin/events",
  "/admin/events/123e4567-e89b-42d3-a456-426614174000", "/en/admin/events/123e4567-e89b-42d3-a456-426614174000",
  "/admin/events/new", "/en/admin/events/new", "/admin/venues", "/en/admin/venues",
  "/admin/speaker-profiles", "/en/admin/speaker-profiles", "/admin/speakers", "/en/admin/speakers",
  "/events/zero-to-hero-1", "/en/events/zero-to-hero-1", "/events/joint-event-ori-goshen", "/en/events/joint-event-ori-goshen",
  `/speaker/${"a".repeat(64)}`, `/en/speaker/${"a".repeat(64)}`, "/speaker/abc", "/en/speaker/abc", "/speaker/..%2F..%2Fetc%2Fpasswd",
  "/api/events/zero-to-hero-1/speaker-contacts", "/api/auth/signin", "/api/auth/callback", "/calendar.ics", "/calendar-en.ics",
  "/sitemap.xml", "/robots.txt",
];

export default async function globalSetup() {
  for (const p of ROUTES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`http://localhost:${PORT}${p}`, { redirect: "manual" }).catch(() => null);
      if (r && r.status < 500) break;
    }
  }
}
