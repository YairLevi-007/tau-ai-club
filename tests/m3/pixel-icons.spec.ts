import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// The members' area uses the home page's pixel glyphs, not generic line icons in purple squares
// (DECISIONS 25.11). The members' pages need a signed-in member, which this setup can't make, so
// this is a source check; the screens are in the builder's notes (icons-*).

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

test("the members' area draws its section icons with PixelIcon", () => {
  test.skip(test.info().project.name !== "desktop", "source check: once");
  const me = read("src/app/[locale]/me/page.tsx");
  expect(me).toMatch(/"\/learn#lectures", [^\]]+"lecture"\]/);
  expect(me).toMatch(/"\/learn#workshops", [^\]]+"build"\]/);
  expect(me).toMatch(/"\/members", [^\]]+"people"\]/);
  expect(me).toMatch(/<PixelIcon glyph="week"/);
  expect(me).not.toMatch(/\b(Presentation|Wrench)\b/);
  expect(read("src/components/members/my-attendance.tsx")).toMatch(/<PixelIcon glyph="check"/);
  const tabs = read("src/components/content/lesson-tabs.tsx");
  expect(tabs).toMatch(/lectures: "lecture", workshops: "build"/);
  expect(tabs).not.toMatch(/lucide-react/);
  expect(read("src/app/[locale]/members/page.tsx")).toMatch(/<PixelIcon glyph="people"/);
  // Every glyph is a rectangle of equal rows, drawn only with ".", "#" and "+".
  const src = read("src/components/home/pixel-icon.tsx");
  for (const name of ["week", "build", "people", "lecture", "check"]) {
    const block = src.match(new RegExp(`\\n  ${name}: \\[([\\s\\S]*?)\\]`))?.[1];
    expect(block, name).toBeTruthy();
    const rows = [...block!.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(rows.length, name).toBe(9);
    expect(new Set(rows.map((r) => r.length)).size, name).toBe(1);
    expect(rows.join(""), name).toMatch(/^[.#+]+$/);
  }
});
