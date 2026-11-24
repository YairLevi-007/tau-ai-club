import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentEditPath } from "../../src/lib/content/admin-edit";

// Admins get a way from a lecture or workshop page to its content editor; nobody else does (24.11).

const ID = "11111111-2222-4333-8444-555555555555";
const ROOT = resolve(__dirname, "../..");

test.describe("lecture and workshop pages: the admin's edit link", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  test("an admin gets the content editor for that event", () => {
    expect(contentEditPath({ kind: "member", member: { role: "admin" } }, ID)).toBe(`/admin/content/${ID}`);
  });

  test("members, outsiders, guests and a missing viewer get nothing", () => {
    for (const role of ["member", "speaker", "", "Admin"]) expect(contentEditPath({ kind: "member", member: { role } }, ID), role).toBeNull();
    expect(contentEditPath({ kind: "outsider" }, ID)).toBeNull();
    expect(contentEditPath({ kind: "guest" }, ID)).toBeNull();
    expect(contentEditPath(null, ID)).toBeNull();
    expect(contentEditPath(undefined, ID)).toBeNull();
    expect(contentEditPath({ kind: "member", member: { role: "admin" } }, "")).toBeNull();
  });

  test("both pages show the bar only through contentEditPath, with the server-side viewer", () => {
    for (const page of ["lectures", "workshops"]) {
      const src = readFileSync(resolve(ROOT, `src/app/[locale]/${page}/[slug]/page.tsx`), "utf8");
      expect(src, page).toMatch(/const viewer = [^;]*await requireMember\(/);
      expect(src, page).toMatch(/const editHref = contentEditPath\(viewer, event\.id\)/);
      expect(src, page).toMatch(/\{editHref && <AdminEditBar href=\{editHref\}/);
      expect(src, page).not.toMatch(/"use client"/);
    }
  });
});
