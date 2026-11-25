import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { hasFile, isStalePage } from "../../src/lib/stale-action";

// 25.11 (session 3's Luma upload): an admin page opened before a deploy calls a Server Action that
// no longer exists. The admin upload forms now say "this page is out of date, refresh" (and to
// choose the file again) with a refresh button, instead of a generic error or an error page.
// The admin pages need a signed-in admin, so this suite checks the pieces; the flow itself was
// checked headless against a local mock (the server answering with Next's action-not-found header).

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const msgs = (l: string) => JSON.parse(readFileSync(resolve(ROOT, `messages/${l}.json`), "utf8")).stalePage;

test.describe("an admin page from an older deployment", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  test("only Next's 'action not found' counts as an out-of-date page", () => {
    expect(isStalePage(new UnrecognizedActionError('Server Action "x" was not found on the server.'))).toBe(true);
    expect(isStalePage(new Error("network"))).toBe(false);
    expect(isStalePage(new TypeError("Failed to fetch"))).toBe(false);
    expect(isStalePage(null)).toBe(false);
  });

  test("a form that carried a file is told to choose it again", () => {
    const withFile = new FormData();
    withFile.append("title", "x");
    withFile.append("file", new File(["%PDF-"], "a.pdf", { type: "application/pdf" }));
    const emptyPicker = new FormData();
    emptyPicker.append("file", new File([], ""));
    const text = new FormData();
    text.append("title", "x");
    expect(hasFile(withFile)).toBe(true);
    expect(hasFile(emptyPicker)).toBe(false);
    expect(hasFile(text)).toBe(false);
  });

  test("the message in Hebrew and English: out of date, refresh, and the file again", () => {
    const he = msgs("he");
    const en = msgs("en");
    expect(Object.keys(he).sort()).toEqual(["body", "bodyFile", "refresh", "title"]);
    expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort());
    expect(he.title).toContain("לא מעודכן");
    expect(he.body).toContain("לרענן");
    expect(he.bodyFile).toContain("לבחור שוב את הקובץ");
    expect(en.title).toMatch(/out of date/i);
    expect(en.body).toMatch(/refresh/i);
    expect(en.bodyFile).toMatch(/choose the file again/i);
  });

  test("the notice reloads the page, and every admin upload uses it", () => {
    const notice = src("src/components/admin/stale-page.tsx");
    expect(notice).toContain('role="alert"');
    expect(notice).toContain("window.location.reload()");
    // The Luma import, both flyer readers: the action call's catch shows the notice, with the file note.
    for (const f of [
      "src/components/admin/attendance/attendance-import.tsx",
      "src/components/admin/flyer/flyer-import.tsx",
      "src/components/admin/flyer/speaker-from-flyer.tsx",
    ]) {
      const s = src(f);
      expect(s, f).toMatch(/catch \(e\) \{\s*if \(isStalePage\(e\)\)/);
      expect(s, f).toContain("<StalePageNotice file />");
    }
    // Every ActionForm (event files upload, content, members, settings): caught once, there.
    const form = src("src/components/admin/action-form.tsx");
    expect(form).toMatch(/if \(isStalePage\(e\)\) return \{ ok: false, message: "", stale: hasFile\(formData\) \? "file" : "page" \}/);
    expect(form).toContain('<StalePageNotice file={state.stale === "file"}');
    // Anything else still fails as before (not swallowed).
    expect(form).toMatch(/isStalePage\(e\)\)[^\n]*\n\s*throw e;/);
  });
});
