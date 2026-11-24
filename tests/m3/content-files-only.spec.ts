import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTENT_SECTIONS, TEXT_SECTIONS_ENABLED, editableSectionsFor, sectionsFor } from "../../src/lib/content/sections";

// Event content is files only (DECISIONS 24.11). The admin editor shows the files panel and no text
// editors; lecture and workshop pages leave empty sections out. One switch (TEXT_SECTIONS_ENABLED) undoes it.

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

test.describe("event content: files only", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  test("the switch is off: the editor gets no text sections for either kind", () => {
    expect(TEXT_SECTIONS_ENABLED).toBe(false);
    expect(editableSectionsFor("lecture")).toEqual([]);
    expect(editableSectionsFor("workshop")).toEqual([]);
  });

  test("switching it back on brings every section back (easy to undo; nothing removed)", () => {
    expect(editableSectionsFor("lecture", true)).toEqual(sectionsFor("lecture"));
    expect(editableSectionsFor("workshop", true)).toEqual(sectionsFor("workshop"));
    expect(CONTENT_SECTIONS.length).toBe(8);
  });

  test("the editor page renders the files panel first and text editors only through the switch", () => {
    const page = src("src/app/[locale]/admin/content/[id]/page.tsx");
    const files = page.indexOf("<FilesPanel");
    const editors = page.indexOf("<SectionEditor");
    expect(files).toBeGreaterThan(-1);
    expect(editors).toBeGreaterThan(files);
    expect(page).toMatch(/editableSectionsFor\(kind\)\.map\(/);
    expect(page).not.toMatch(/sectionsFor\(kind\)\.map\(/);
  });

  test("the workshop page shows its empty-sections panel only when text sections are on", () => {
    const page = src("src/app/[locale]/workshops/[slug]/page.tsx");
    expect(page).toMatch(/authOn && TEXT_SECTIONS_ENABLED && empty\.length > 0 &&/);
    const lecture = src("src/app/[locale]/lectures/[slug]/page.tsx");
    expect(lecture).toMatch(/TEXT_SECTIONS_ENABLED && <p className="text-fg-subtle">\{t\("summaryComing"\)\}<\/p>/);
  });

  test("the files panel is one simple upload form (file, one title, upload), then the uploaded files", () => {
    const panel = src("src/components/admin/content/files-panel.tsx");
    const inputs = [...panel.matchAll(/<(?:input|FilePicker)[^>]*name="([^"]+)"/g)].map((m) => m[1]);
    // The upload form's fields, then the per-file show/hide and delete forms (hidden ids only).
    expect(inputs.filter((n) => !["event_id", "id", "status"].includes(n))).toEqual(["file", "title"]);
    expect(panel).not.toMatch(/name="title_(he|en)"/);
    expect(panel.indexOf("uploadEventFile}")).toBeLessThan(panel.indexOf("files.map("));
    expect(panel).toMatch(/action=\{setFileStatus\}/);
    expect(panel).toMatch(/action=\{deleteEventFile\}/);
  });
});
