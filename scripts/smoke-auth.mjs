// Auth smoke test (no real Supabase needed). Start: USE_FIXTURES=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fake next dev -p 3500, then: node scripts/smoke-auth.mjs http://localhost:3500
const base = process.argv[2] ?? "http://localhost:3500";
let fails = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${c ? "" : "  " + extra}`);
  if (!c) fails++;
};
const get = (p, init = {}) => fetch(base + p, { redirect: "manual", ...init });
const loc = (r) => r.headers.get("location") ?? "";

{
  const r = await get("/api/auth/signin?next=/admin/members&locale=en");
  const l = new URL(loc(r));
  ok(r.status === 303 && l.pathname === "/auth/v1/authorize" && l.searchParams.get("provider") === "google", "signin → Supabase authorize (google)", `${r.status} ${loc(r)}`);
  const redirectTo = new URL(l.searchParams.get("redirect_to"));
  ok(redirectTo.pathname === "/api/auth/callback" && redirectTo.searchParams.get("next") === "/admin/members" && redirectTo.searchParams.get("locale") === "en", "redirect_to = our callback with next + locale", redirectTo.href);
  ok(l.searchParams.get("code_challenge_method")?.toLowerCase() === "s256", "PKCE S256");
  const sc = r.headers.getSetCookie();
  ok(sc.some((c) => /code-verifier=/.test(c) && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), "PKCE verifier cookie is HttpOnly + SameSite=Lax", sc.join(" | "));
  ok(/no-store/.test(r.headers.get("cache-control") ?? ""), "signin response is no-store");
}
for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example", "/%0d%0aSet-Cookie:x", "/api/auth/signout"]) {
  const r = await get(`/api/auth/signin?next=${encodeURIComponent(evil)}`);
  const redirectTo = new URL(new URL(loc(r)).searchParams.get("redirect_to"));
  const n = redirectTo.searchParams.get("next");
  // An encoded "%0d%0a" stays literal text (never a real CR/LF), so it may pass through.
  ok(!/[\r\n]/.test(n) && n.startsWith("/") && !n.startsWith("//") && (evil.startsWith("/%") || n === "/"), `open redirect blocked: next=${evil}`, redirectTo.href);
}
{
  const r = await get("/api/auth/callback?error=access_denied&locale=en");
  ok(r.status === 303 && loc(r).endsWith("/en/login?error=cancelled"), "callback with ?error → /en/login?error=cancelled", loc(r));
  const r2 = await get("/api/auth/callback?code=bogus&next=https://evil.example");
  ok(r2.status === 303 && new URL(loc(r2)).pathname === "/login" && new URL(loc(r2)).host === new URL(base).host, "callback with a bad code → /login?error=failed on our host", loc(r2));
}
for (const [path, want] of [
  ["/admin/members", "/login?next=%2Fadmin%2Fmembers"],
  ["/en/admin/members", "/en/login?next=%2Fadmin%2Fmembers"],
  ["/admin/speakers", "/login?next=%2Fadmin%2Fspeakers"],
  ["/welcome", "/login?next=%2Fwelcome"],
  ["/en/welcome", "/en/login?next=%2Fwelcome"],
]) {
  const r = await get(path);
  ok([303, 307].includes(r.status) && loc(r).endsWith(want), `[guest] ${path} → ${want}`, `${r.status} ${loc(r)}`);
}
{
  const r = await get("/admin/members", { headers: { cookie: "sb-127-auth-token=base64-garbage" } });
  ok([303, 307].includes(r.status) && loc(r).includes("/login"), "[garbage session cookie] /admin/members → /login (no 500)", `${r.status}`);
}
{
  const he = await (await get("/members-only")).text();
  ok(he.includes("המועדון סגור לחברים בלבד"), "/members-only says המועדון סגור לחברים בלבד");
  ok(!/בקשת הצטרפות|להצטרף|request to join|join request/i.test(he.replace(/<script[\s\S]*?<\/script>/g, "")), "/members-only has no join request");
  const en = await (await get("/en/members-only")).text();
  ok(en.includes("Members only"), "/en/members-only says Members only");
  const login = await (await get("/en/login?error=unavailable")).text();
  ok(login.includes("Sign in with Google") && login.includes("switched on"), "/en/login renders with the error message");
  ok(/noindex/.test(login), "/login is noindex");
}
for (const t of ["abc", "0".repeat(64)]) {
  const r = await get(`/speaker/${t}`);
  const html = await r.text();
  ok(r.status === 200 && html.includes("הקישור לא בתוקף"), `/speaker/${t.slice(0, 6)}… shows "link not valid"`);
  ok(/name="referrer" content="no-referrer"/.test(html) && /noindex/.test(html), "speaker page: no-referrer + noindex");
  ok(/no-store/.test(r.headers.get("cache-control") ?? ""), "speaker page is not cacheable", r.headers.get("cache-control"));
}
{
  const r = await get("/api/auth/signout", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "locale=he" });
  ok(r.status === 403, "cross-site sign-out POST is rejected (403)");
  const r2 = await get("/api/auth/signout", { method: "POST", headers: { origin: base, "content-type": "application/x-www-form-urlencoded" }, body: "locale=en" });
  ok(r2.status === 303 && loc(r2).endsWith("/en"), "same-origin sign-out → /en", loc(r2));
}
{
  const home = await get("/");
  ok(home.status === 200, "home still 200");
  const html = await home.text();
  ok(html.includes('href="/login"'), "header has the members link");
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
