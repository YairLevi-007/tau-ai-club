import { expect, test } from "@playwright/test";
import { markdownToText, renderInline, renderMarkdown, safeHref } from "../../src/lib/content/markdown";

// The content renderer (no npm package). Pure: these run without a server.
test.describe("markdown renderer", () => {
  test.skip(({ isMobile }) => isMobile, "pure function: desktop project only");

  test("raw HTML is shown as text, never parsed", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n**<b>x</b>**');
    expect(html).not.toMatch(/<script|<img|<b>|onerror="/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
  });

  test("only safe link targets survive", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.test/x", "/\\evil.test", "vbscript:x"]) {
      expect(safeHref(bad), bad).toBeNull();
      expect(renderInline(`[x](${bad})`)).not.toContain("<a");
    }
    expect(renderInline("[docs](https://example.test/a?b=1&c=2)")).toBe(
      '<a href="https://example.test/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    expect(renderInline("[home](/en/lectures)")).toBe('<a href="/en/lectures">home</a>');
    // A quote can't break out of the href attribute.
    expect(renderInline('[x](https://a.test/"onmouseover="alert(1))')).not.toContain('"onmouseover');
  });

  test("headings, lists, checklists, code, quotes", () => {
    const html = renderMarkdown(
      "## כותרת\n\nפסקה עם **הדגשה** ו-*נטוי* ו-`claude --help`.\n\n- אחד\n- שניים\n\n1. first\n2. second\n\n- [ ] Claude Code\n- [x] Pro\n\n```\nnpm i <x>\n```\n\n> quote\n\n---",
    );
    expect(html).toContain("<h3>כותרת</h3>");
    expect(html).toContain("<strong>הדגשה</strong>");
    expect(html).toContain("<em>נטוי</em>");
    expect(html).toContain('<code dir="ltr">claude --help</code>');
    expect(html).toContain("<ul><li>אחד</li><li>שניים</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(html).toContain('<li class="md-task"><label><input type="checkbox" disabled> <span>Claude Code</span></label></li>');
    expect(html).toContain('<input type="checkbox" disabled checked>');
    expect(html).toContain('<pre dir="ltr"><code>npm i &lt;x&gt;</code></pre>');
    expect(html).toContain("<blockquote><p>quote</p></blockquote>");
    expect(html).toContain("<hr>");
    // "#" and "##" both start at h3 (the page has its h1 and a section h2); deeper levels follow.
    expect(renderMarkdown("# a\n### b\n#### c")).toBe("<h3>a</h3>\n<h4>b</h4>\n<h5>c</h5>");
  });

  test("underscores inside words and identifiers stay as they are", () => {
    expect(renderInline("snake_case_name and __init__")).not.toContain("<em>");
  });

  test("plain text for descriptions", () => {
    expect(markdownToText("## Title\n\n- **bold** [link](https://x.test)\n- [ ] task `code`")).toBe("Title bold link task code");
  });
});
