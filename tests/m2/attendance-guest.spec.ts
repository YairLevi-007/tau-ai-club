import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Attendance (Luma guest CSV): guest-level checks written by QA. The builder's own spec (attendance.spec.ts) covers parsing
 * and admin flows; this file covers who can reach the pages and the CSV export. Admin/member output needs a real session.
 */
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const get = (request: APIRequestContext, path: string, headers?: Record<string, string>) => request.get(path, { maxRedirects: 0, headers });

async function finalAnswer(request: APIRequestContext, path: string) {
  let r = await get(request, path);
  for (let hop = 0; hop < 3 && [303, 307, 308].includes(r.status()) && /^\/(en\/)?admin/.test(r.headers()["location"] ?? ""); hop++) {
    r = await get(request, r.headers()["location"]!);
  }
  return r;
}

for (const prefix of ["", "/en"]) {
  test(`attendance pages refuse guests [${prefix || "he"}]`, async ({ request }) => {
    for (const p of ["/admin/attendance", `/admin/attendance/${UUID}`]) {
      const r = await finalAnswer(request, prefix + p);
      const loc = r.headers()["location"] ?? "";
      const refused = ([303, 307, 308].includes(r.status()) && /\/login|\/members-only/.test(loc)) || [403, 404].includes(r.status());
      expect(refused, `${prefix}${p} -> ${r.status()} ${loc}`).toBe(true);
      const body = await r.text();
      expect(body, `${prefix}${p}`).not.toMatch(/attendance-grid|attendance-row|member-history|member-rate|admin_import_attendance|attendance-export/);
      expect(r.headers()["cache-control"] ?? "", p).not.toMatch(/public|s-maxage/);
    }
  });
}

test("attendance CSV export refuses guests, garbage cookies and forged JWTs; never cacheable", async ({ request }) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: UUID, role: "authenticated", email: "admin@tau.test", exp: 4102444800 })}.`;
  const forged = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: "x", token_type: "bearer", expires_in: 3600, expires_at: 4102444800 })).toString("base64url");
  const cases: Record<string, Record<string, string> | undefined> = {
    "no cookie": undefined,
    "garbage cookie": { cookie: "sb-127-auth-token=base64-garbage" },
    "forged unsigned JWT": { cookie: `sb-127-auth-token=${forged}` },
  };
  for (const [label, headers] of Object.entries(cases)) {
    for (const q of [`?cohort=${UUID}`, "", "?cohort=not-a-uuid", `?cohort=${UUID}&cohort=other`, "?cohort=%27%20or%201=1"]) {
      const r = await get(request, `/api/admin/attendance${q}`, headers);
      expect(r.status(), `${label} ${q}`).toBe(403);
      expect(r.headers()["cache-control"] ?? "", `${label} ${q}`).toMatch(/no-store/);
      expect(r.headers()["content-type"] ?? "", `${label} ${q}`).not.toMatch(/csv/);
      expect(await r.text(), `${label} ${q}`).not.toMatch(/@|member,|attended/i);
    }
  }
  // Other verbs are not an export path.
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    const r = await request.fetch("/api/admin/attendance", { method, maxRedirects: 0 });
    expect([403, 404, 405], method).toContain(r.status());
  }
});

test("guest HTML, bundles and feeds carry no attendance data or admin attendance names", async ({ page, request }) => {
  const seen = new Set<string>();
  page.on("response", (r) => {
    if (/\/_next\/static\/.*\.js/.test(r.url())) seen.add(r.url());
  });
  for (const p of ["/", "/en", "/en/events/zero-to-hero-1", "/en/login"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    expect(html, p).not.toMatch(/my-attendance|attendance-grid|admin_import_attendance|guests_checked_in/);
  }
  for (const url of seen) {
    const js = await (await request.get(url)).text();
    expect(js.match(/admin_import_attendance|attendance_imports|guests_checked_in|api\/admin\/attendance/g) ?? [], url).toEqual([]);
  }
  for (const f of ["/calendar.ics", "/calendar-en.ics", "/sitemap.xml"]) {
    expect(await (await request.get(f)).text(), f).not.toMatch(/attendance|checked.in/i);
  }
});

test("/profile refuses guests and does not render the attendance section", async ({ request }) => {
  for (const p of ["/profile", "/en/profile"]) {
    const r = await get(request, p);
    expect([303, 307, 308], p).toContain(r.status());
    expect(r.headers()["location"] ?? "", p).toMatch(/\/login/);
    expect(await r.text(), p).not.toMatch(/my-attendance/);
  }
});
