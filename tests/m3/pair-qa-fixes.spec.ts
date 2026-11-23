import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { commonInterests } from "../../src/lib/pair/common";
import { confirmedAfter } from "../../src/lib/pair/confirm-state";
import { PairMatrix } from "../../src/components/pair/pair-matrix";

// QA's three pAIr findings (notes pair-pr2-screens/REPORT.md, 23.11), pinned so they stay fixed.

test.describe("pAIr: what two members have in common", () => {
  test.skip(({ isMobile }) => isMobile, "pure function: desktop project only");

  test("degree and campus words never count as a shared interest (Hebrew)", () => {
    const pairs = [
      [{ program: "תואר ראשון, עיבוד אותות", faculty: "הנדסת חשמל" }, { program: "תואר שני", faculty: "הנדסה ביו-רפואית" }],
      [{ program: "תואר שלישי", faculty: "מתמטיקה" }, { program: "תואר ראשון", faculty: "כלכלה" }],
      [{ program: "MBA", bio_he: "סטודנטית בפקולטה לניהול באוניברסיטת תל אביב" }, { program: "תואר שני", bio_he: "לומד בתל אביב, שנה שנייה בתואר" }],
    ];
    for (const [a, b] of pairs) expect(commonInterests([a, b]), JSON.stringify([a, b])).toEqual([]);
  });

  test("degree and campus words never count as a shared interest (English)", () => {
    const a = { program: "BSc Computer Science", bio_en: "Second year student at Tel Aviv University, faculty of exact sciences." };
    const b = { program: "MSc", bio_en: "First year master's degree student at TAU. Department of physics." };
    expect(commonInterests([a, b])).toEqual([]);
  });

  test("real interests still show, next to the degree words", () => {
    const he = commonInterests([
      { program: "תואר שני, למידת מכונה", bio_he: "אוהבת רובוטיקה וקפה" },
      { program: "תואר ראשון", bio_he: "מתעניין ברובוטיקה ובמודלי שפה" },
    ]);
    expect(he).toContain("רובוטיקה");
    expect(he.join(" ")).not.toMatch(/תואר|ראשון|שני/);
    const en = commonInterests([{ program: "PhD", bio_en: "I love robotics and chess" }, { program: "BA", bio_en: "Chess and robotics on weekends" }]);
    expect(en).toEqual(expect.arrayContaining(["robotics", "chess"]));
  });
});

test.describe("pAIr: 'the meeting happened' reads as done", () => {
  test.skip(({ isMobile }) => isMobile, "pure function: desktop project only");

  test("a successful press switches to done even when the server sends no time", () => {
    const now = new Date("2026-11-25T18:40:00Z");
    expect(confirmedAfter(true, null, now)).toBe(now.toISOString());
    expect(confirmedAfter(true, undefined, now)).toBe(now.toISOString());
    expect(confirmedAfter(true, "2026-11-25T18:39:00+00:00", now)).toBe("2026-11-25T18:39:00+00:00");
    expect(confirmedAfter(false, "2026-11-25T18:39:00+00:00", now)).toBeNull();
  });
});

test.describe("pAIr: the who-met-whom matrix on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone width only");

  test("12 members: the grid scrolls in its own box, the page never scrolls sideways", async ({ page }) => {
    const names = ["אורי פרידמן", "איתי מזרחי", "גיא אוחיון", "דנה כהן", "יובל אברהם", "ליאור חזן", "מאיה שפירא", "מיכל ברק", "נועה לוי", "עומר בן-דוד", "שירה גולן", "תמר רוזן"];
    const people = names.map((full_name, i) => ({ id: `p${i}`, full_name }));
    const html = renderToStaticMarkup(
      createElement(PairMatrix, {
        people,
        count: (a: string, b: string) => ((a + b).length % 3 === 0 ? 1 : 0),
        labels: { caption: "Who met whom", cell: (a: string, b: string, n: number) => `${a} and ${b} met ${n} times`, cellNot: (a: string, b: string) => `${a} and ${b} haven't met` },
      }),
    );
    // A real page of the site, so the site's own CSS applies; then the grid goes where the admin page puts it.
    await page.goto("/");
    await page.locator("main").evaluate((main, markup) => {
      main.innerHTML = `<div class="mx-auto grid max-w-site grid-cols-[minmax(0,1fr)] gap-8 px-4"><div class="grid grid-cols-[minmax(0,1fr)] gap-6">${markup}</div></div>`;
    }, html);
    const box = page.getByTestId("pair-matrix-scroll");
    await expect(box).toBeVisible();
    const m = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>("[data-testid=pair-matrix-scroll]")!;
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, inner: box.scrollWidth - box.clientWidth };
    });
    expect(m.inner, "the grid is wider than a phone, so it scrolls inside its box").toBeGreaterThan(0);
    expect(m.page, "the page itself never scrolls sideways").toBeLessThanOrEqual(0);
  });
});
