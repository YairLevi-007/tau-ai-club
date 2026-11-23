import { expect, test, type Page } from "@playwright/test";
import {
  LESSON_CSP,
  LESSON_IFRAME_SANDBOX,
  LESSON_MESSAGE,
  LESSON_SHIM,
  MAX_LESSON_BYTES,
  MAX_LESSON_STATE,
  lessonHeaders,
  readLessonUpload,
  stateFromMessage,
  stateToHash,
  withLessonShim,
} from "../../src/lib/content/lesson";

// Interactive HTML lessons (Ido's quizzes). The uploaded HTML is untrusted: it must never run
// with the site's origin, cookies or session. These pin the sandbox, the localStorage stand-in
// that keeps quiz progress working inside it, the upload check, and the route's guest answer.

const enc = (s: string) => new TextEncoder().encode(s);
const ID = "00000000-0000-4000-8000-0000000000aa";

test.describe("lesson helpers", () => {
  test.skip(({ isMobile }) => isMobile, "pure functions: desktop project only");

  test("uploads: a .html document is a lesson; anything else is refused", () => {
    expect(readLessonUpload("quiz.html", enc("<!doctype html><html><body>x</body></html>")).ok).toBe(true);
    expect(readLessonUpload("Quiz.HTM", enc("﻿\n  <html lang=he><body>x</body></html>")).ok).toBe(true);
    expect(readLessonUpload("quiz.js", enc("<!doctype html>")).ok).toBe(false);
    expect(readLessonUpload("quiz.html.svg", enc("<!doctype html>")).ok).toBe(false);
    expect(readLessonUpload("quiz.html", enc("%PDF-1.4 ...")).ok).toBe(false);
    expect(readLessonUpload("quiz.html", enc("")).ok).toBe(false);
    expect(readLessonUpload("quiz.html", new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0xff, 0xfe])).ok, "not UTF-8").toBe(false);
    const big = readLessonUpload("big.html", new Uint8Array(MAX_LESSON_BYTES + 1).fill(0x20));
    expect(big).toEqual({ ok: false, reason: "size" });
  });

  test("the stand-in goes first in <head>, before the lesson's own scripts", () => {
    const out = withLessonShim('<!doctype html><html><head><meta charset="utf-8"><script>localStorage.getItem("x")</script></head><body></body></html>');
    expect(out.indexOf(LESSON_SHIM)).toBeGreaterThan(-1);
    expect(out.indexOf(LESSON_SHIM)).toBeLessThan(out.indexOf('<meta charset="utf-8">'));
    expect(withLessonShim("<!DOCTYPE html><p>no head</p>").startsWith("<!DOCTYPE html>" + LESSON_SHIM)).toBe(true);
    expect(withLessonShim("<p>bare</p>").startsWith(LESSON_SHIM)).toBe(true);
  });

  test("saved state: only an object of strings, within the size cap, is kept or handed back", () => {
    expect(stateFromMessage({ type: LESSON_MESSAGE, state: { a: "1", "quiz:x": '{"pos":2}' } })).toBe('{"a":"1","quiz:x":"{\\"pos\\":2}"}');
    for (const bad of [null, "x", { type: "other", state: { a: "1" } }, { type: LESSON_MESSAGE, state: [] }, { type: LESSON_MESSAGE, state: { a: 1 } }, { type: LESSON_MESSAGE }]) {
      expect(stateFromMessage(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(stateFromMessage({ type: LESSON_MESSAGE, state: { a: "x".repeat(MAX_LESSON_STATE) } })).toBeNull();
    expect(stateToHash('{"a":"1"}')).toBe("#" + encodeURIComponent('{"a":"1"}'));
    for (const bad of [null, "", "not json", "[1,2]", "null", "x".repeat(MAX_LESSON_STATE + 1)]) expect(stateToHash(bad), String(bad).slice(0, 20)).toBe("");
  });

  test("the sandbox never grants the site's origin or top navigation", () => {
    for (const flags of [LESSON_IFRAME_SANDBOX, LESSON_CSP.split(";")[0]]) {
      expect(flags).toContain("allow-scripts");
      expect(flags).not.toMatch(/allow-same-origin|allow-top-navigation|allow-modals|allow-forms/);
    }
    expect(LESSON_CSP.startsWith("sandbox ")).toBe(true);
    expect(LESSON_CSP).toContain("connect-src 'none'");
    expect(LESSON_CSP).toContain("form-action 'none'");
    expect(LESSON_CSP).toContain("frame-ancestors 'self'");
    expect(lessonHeaders()["X-Frame-Options"]).toBe("SAMEORIGIN");
  });
});

/** A page like /lessons/<id>: the frame, sandboxed, with the saved state in the fragment. Served by page.route. */
async function openLesson(page: Page, lesson: string, saved: object | null) {
  const origin = "http://lesson-host.test";
  await page.context().addCookies([{ name: "sb-test-auth-token", value: "secret-session", url: origin, sameSite: "Lax" }]);
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/lessons/${ID}`) return route.fulfill({ body: withLessonShim(lesson), headers: lessonHeaders() });
    if (path === "/secret") return route.fulfill({ body: "members data", headers: { "content-type": "text/plain" } });
    const hash = stateToHash(saved ? JSON.stringify(saved) : null);
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><iframe id="f" sandbox="${LESSON_IFRAME_SANDBOX}" src="/api/lessons/${ID}${hash}"></iframe>
        <script>window.got=[];addEventListener("message",function(e){if(e.source===document.getElementById("f").contentWindow)window.got.push(e.data)})</script></body></html>`,
    });
  });
  await page.goto(`${origin}/lessons/${ID}`);
  const frame = page.frameLocator("#f");
  await expect(frame.locator("#done")).toHaveText("1");
  return frame;
}

test.describe("a lesson inside the sandbox", () => {
  test.skip(({ isMobile }) => isMobile, "browser sandbox behaviour: desktop project only");

  test("it gets no origin, cookies, parent page or network", async ({ page }) => {
    const lesson = `<!doctype html><html><head></head><body><pre id="r"></pre><b id="done"></b><script>
      (async function(){ var r = { origin: self.origin };
        try { r.cookie = document.cookie; } catch (e) { r.cookie = "blocked"; }
        try { r.parent = String(parent.document.cookie); } catch (e) { r.parent = "blocked"; }
        try { await fetch("/secret"); r.fetch = "allowed"; } catch (e) { r.fetch = "blocked"; }
        try { top.location.href = "https://example.test/"; r.top = "allowed"; } catch (e) { r.top = "blocked"; }
        document.getElementById("r").textContent = JSON.stringify(r); document.getElementById("done").textContent = "1"; })();
    </script></body></html>`;
    const frame = await openLesson(page, lesson, null);
    const r = JSON.parse((await frame.locator("#r").textContent()) ?? "{}");
    expect(r).toEqual({ origin: "null", cookie: "blocked", parent: "blocked", fetch: "blocked", top: "blocked" });
    await expect(page).toHaveURL(/lesson-host\.test\/lessons\//);
  });

  test("quiz progress: localStorage works like the real thing and round-trips through the parent", async ({ page }) => {
    const lesson = `<!doctype html><html><head><script>
      var before = localStorage.getItem("quiz");
      localStorage.setItem("quiz", JSON.stringify({ pos: 3 }));
      localStorage.theme = "dark";
      var r = { before: before, keys: Object.keys(localStorage).sort(), length: localStorage.length, prop: localStorage.theme, missing: localStorage.getItem("nope"), session: (sessionStorage.setItem("s", "1"), sessionStorage.getItem("s")) };
      delete localStorage.theme;
      r.afterDelete = localStorage.getItem("theme");
    </script></head><body><pre id="r"></pre><b id="done"></b><script>document.getElementById("r").textContent = JSON.stringify(r); document.getElementById("done").textContent = "1";</script></body></html>`;
    const frame = await openLesson(page, lesson, { quiz: '{"pos":1}', old: "kept" });
    const r = JSON.parse((await frame.locator("#r").textContent()) ?? "{}");
    expect(r).toEqual({ before: '{"pos":1}', keys: ["old", "quiz", "theme"], length: 3, prop: "dark", missing: null, session: "1", afterDelete: null });
    // Every change was reported to the parent, in the shape the viewer keeps; sessionStorage never is.
    const got = (await page.evaluate(() => (window as unknown as { got: unknown[] }).got)) as unknown[];
    const last = got.at(-1);
    expect(stateFromMessage(last)).toBe(JSON.stringify({ quiz: '{"pos":3}', old: "kept" }));
    expect(got.every((m) => stateFromMessage(m) !== null)).toBe(true);
    expect(JSON.stringify(got)).not.toContain('"s":"1"');
  });
});

test.describe("the lesson route and page, as a guest", () => {
  test.skip(({ isMobile }) => isMobile, "headers: desktop project only");

  test("guests get 403 (404 for a malformed id), with the sandbox headers even on the error", async ({ request }) => {
    for (const p of [`/api/lessons/${ID}`, "/api/lessons/not-a-uuid"]) {
      for (const headers of [{}, { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" }] as Record<string, string>[]) {
        const res = await request.get(p, { headers, maxRedirects: 0 });
        const what = `${p} ${headers.cookie ? "forged cookie" : "no cookie"}`;
        expect([403, 404], what).toContain(res.status());
        if (p.endsWith(ID)) expect(res.status(), what).toBe(403);
        const h = res.headers();
        expect(h["content-security-policy"], what).toMatch(/^sandbox allow-scripts/);
        expect(h["x-frame-options"], "the site-wide DENY is replaced, not doubled").toBe("SAMEORIGIN");
        expect(h["cache-control"]).toContain("no-store");
        expect(await res.text()).toMatch(/^(members only|not found)$/);
      }
    }
  });

  test("the rest of the site still refuses to be framed", async ({ request }) => {
    const res = await request.get("/en");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });

  test("/lessons/<id> sends a guest to log in", async ({ request }) => {
    for (const p of [`/lessons/${ID}`, `/en/lessons/${ID}`]) {
      const r = await request.get(p, { maxRedirects: 0 });
      const loc = r.headers()["location"] ?? "";
      expect(([303, 307, 308].includes(r.status()) && /\/login|\/members-only/.test(loc)) || [403, 404].includes(r.status()), `${p} -> ${r.status()} ${loc}`).toBe(true);
    }
  });
});
