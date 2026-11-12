import { test } from "@playwright/test";

/** Milestone 2 stubs, see qa/TEST-PLAN.md section 2. Un-skip when auth + RLS land. */
const roles = ["guest", "non-allowlisted", "member", "admin"] as const;

for (const role of roles) {
  test.describe(`M2 access [${role}]`, () => {
    test.skip("page access matrix (members-only shows 'Members only' for guest/non-allowlisted; admin routes denied for member)", async () => {});
  });
}

test.describe("M2 speaker contact leaks", () => {
  test.skip("email/phone absent from rendered DOM (guest + non-allowlisted, he + en)", async () => {});
  test.skip("email/phone/LinkedIn absent from raw HTML, RSC payload and __NEXT_DATA__", async () => {});
  test.skip("anon-key PostgREST: select=*, embeds, RPCs, filter/order on hidden columns return no contact data", async () => {});
  test.skip("non-allowlisted JWT PostgREST: same as anon", async () => {});
  test.skip("OG/meta tags, JSON-LD, sitemap, mailto:/tel: absent of contact data", async () => {});
  test.skip("LinkedIn public only when opted in; opt-out removes it after revalidation", async () => {});
  test.skip("member-rendered page not served to guest from cache", async () => {});
  test.skip("writes by anon/non-allowlisted/member to events, speakers, allowlist, roles are rejected; no self-promotion to admin", async () => {});
  test.skip("RLS enabled on every public table; views security_invoker; advisors clean", async () => {});
});
