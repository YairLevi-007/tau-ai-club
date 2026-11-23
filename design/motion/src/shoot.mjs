// Shoots the three motion/font directions into the REAL pages of a local dev server
// (fixtures + the scratch mock Supabase, port 3670). Run from the repo root:
//   node design/motion/src/shoot.mjs [onlyRegex]
// Output (design/motion/screens/):
//   <d>-home-{phone,desk}.png   settled end state, top of the page (+ below the fold)
//   <d>-me-{phone,desk}.png     the personal area with the new fonts
//   frames/<d>-{phone,desk}/NN.png   motion frames (D1/D3: intro timeline, D2: scroll positions)
//   before-*.png                the site today, same frames, for before/after
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { DIRECTIONS, BASE_JS } from "./directions.mjs";

const require = createRequire(path.resolve("package.json"));
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3670";
const OUT = path.resolve("design/motion/screens");
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;

// A fake session for the local mock only (no real keys).
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const ID = "00000000-0000-4000-8000-00000000aa01", EMAIL = "avigail.benshoshan.rosenblum@mail.tau.ac.il";
const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ID, email: EMAIL, role: "authenticated", aud: "authenticated", iat: now, exp: now + 86400, session_id: "mock" })}.c2ln`;
const session = { access_token: jwt, refresh_token: "mock", token_type: "bearer", expires_in: 86400, expires_at: now + 86400, user: { id: ID, email: EMAIL, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
const cookies = [{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }, { name: "tau_member", value: "1", url: BASE }];

const VIEWS = [["phone", 390, 844, true], ["desk", 1440, 900, false]];
const browser = await chromium.launch();

async function open(w, h, mob, member, url) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, timezoneId: "Asia/Jerusalem", reducedMotion: "reduce", locale: "he-IL" });
  if (member) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  // load lazy photos, then back to the top
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
  return { ctx, page };
}
async function apply(page, d, home) {
  await page.addStyleTag({ url: d.fonts });
  await page.addStyleTag({ content: d.css + "\n" + (home ? "" : d.meCss) });
  if (home) {
    await page.evaluate(() => document.body.classList.add("mo-home"));
    await page.addScriptTag({ content: BASE_JS });
    await page.addScriptTag({ content: "{" + d.js + "}" });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
const shotTop = (page, file, w, mob, hMax) => page.evaluate(() => document.documentElement.scrollHeight).then((full) =>
  page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(full, hMax) } }));

for (const [v, w, h, mob] of VIEWS) {
  // BEFORE (today's site), viewport frames to match
  if (!ONLY || ONLY.test("before")) {
    const { ctx, page } = await open(w, h, mob, false, "/");
    await page.screenshot({ path: path.join(OUT, `before-hero-${v}.png`) });
    await shotTop(page, path.join(OUT, `before-home-${v}.png`), w, mob, mob ? 3200 : 2200);
    await ctx.close();
    const m = await open(w, h, mob, true, "/me");
    await shotTop(m.page, path.join(OUT, `before-me-${v}.png`), w, mob, mob ? 2600 : 1600);
    await m.ctx.close();
  }
  for (const d of DIRECTIONS) {
    if (ONLY && !ONLY.test(d.key)) continue;
    // HOME
    const { ctx, page } = await open(w, h, mob, false, "/");
    await apply(page, d, true);
    // motion frames
    const fdir = path.join(OUT, "frames", `${d.key}-${v}`);
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    if (d.key === "d2") {
      const N = 36, maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      const stopY = Math.min(maxY, mob ? 3000 : 2300);
      for (let i = 0; i < N; i++) {
        const y = Math.round(stopY * (i / (N - 1)) ** 1.15);
        await page.evaluate((y) => { scrollTo(0, y); window.__mo.at(y); }, y);
        await page.screenshot({ path: path.join(fdir, String(i).padStart(2, "0") + ".png") });
      }
      await page.evaluate(() => { scrollTo(0, 0); window.__mo.at(0); });
    } else {
      const N = d.key === "d3" ? 40 : 24;
      await page.evaluate(() => window.__mo.reveal?.(true));
      for (let i = 0; i < N; i++) {
        await page.evaluate((t) => window.__mo.seek(t), d.key === "d3" ? i / N : i / (N - 1));
        await page.screenshot({ path: path.join(fdir, String(i).padStart(2, "0") + ".png") });
      }
    }
    // settled stills
    if (d.key === "d2") {
      await page.evaluate(() => { scrollTo(0, 0); window.__mo.at(0); });
      await page.screenshot({ path: path.join(OUT, `${d.key}-hero-${v}.png`) });
      // a mid-scroll still: the mark has gathered, chapter 01 is on screen
      const y = await page.evaluate(() => { const r = document.querySelector("[data-testid=club-about]").getBoundingClientRect(); return Math.round(scrollY + r.top - innerHeight * 0.35); });
      await page.evaluate((y) => { scrollTo(0, y); window.__mo.at(y); }, y);
      await page.screenshot({ path: path.join(OUT, `${d.key}-chapter-${v}.png`) });
      await page.evaluate(() => { scrollTo(0, 0); window.__mo.at(700); });
    } else {
      await page.evaluate((k) => window.__mo.seek(k === "d3" ? 0.55 : 1), d.key);
      await page.screenshot({ path: path.join(OUT, `${d.key}-hero-${v}.png`) });
      if (d.key === "d1") { // hover light on one speaker card
        await page.evaluate(() => { const c = document.querySelector("[data-testid=season-speakers] li") ?? window.__mo.cards[0]; window.__mo.sweep(c, 205); c.scrollIntoView({ block: "center" }); });
        await page.screenshot({ path: path.join(OUT, `d1-hover-${v}.png`) });
        await page.evaluate(() => scrollTo(0, 0));
      }
    }
    await shotTop(page, path.join(OUT, `${d.key}-home-${v}.png`), w, mob, mob ? 3200 : 2200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(d.key, v, "home", over ? "SIDE-SCROLL!" : "ok");
    await ctx.close();
    // ME (fonts only + calm)
    const m = await open(w, h, mob, true, "/me");
    await apply(m.page, d, false);
    await shotTop(m.page, path.join(OUT, `${d.key}-me-${v}.png`), w, mob, mob ? 2600 : 1600);
    console.log(d.key, v, "me");
    await m.ctx.close();
  }
}
await browser.close();
