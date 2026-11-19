// Shoots the Initiatives mockups into real pages of a local dev server (fixtures + the scratch
// mock Supabase in "admin" mode, port 3670). Run from the repo root:
//   node design/initiatives/src/shoot.mjs [onlyRegex]
// Output: design/initiatives/screens/<screen>-{phone,desk}.png
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import * as S from "./screens.mjs";

const require = createRequire(path.resolve("package.json"));
const { chromium } = require("@playwright/test");
const BASE = process.env.BASE ?? "http://localhost:3670";
const HERE = path.resolve("design/initiatives");
const OUT = path.join(HERE, "screens");
fs.mkdirSync(OUT, { recursive: true });
const CSS = fs.readFileSync(path.join(HERE, "src/mock.css"), "utf8");
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;

// A fake session for the local mock only (no real keys).
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const ID = "00000000-0000-4000-8000-00000000aa01", EMAIL = "avigail.benshoshan.rosenblum@mail.tau.ac.il";
const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ID, email: EMAIL, role: "authenticated", aud: "authenticated", iat: now, exp: now + 86400, session_id: "mock" })}.c2ln`;
const session = { access_token: jwt, refresh_token: "mock", token_type: "bearer", expires_in: 86400, expires_at: now + 86400, user: { id: ID, email: EMAIL, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
const cookies = [{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }, { name: "tau_member", value: "1", url: BASE }];

// [name, base page, kind, html, phone mode]  kind: member | guest | admin ; phone: full | view
const SCREENS = [
  ["o1-list", "/lectures", "member", S.o1List, "full"],
  ["o1-item", "/lectures", "member", S.o1Item, "full"],
  ["o1-post", "/lectures", "member", S.o1Post, "view"],
  ["o2-list", "/lectures", "member", S.o2List, "full"],
  ["o2-item", "/lectures", "member", S.o2Item, "full"],
  ["o2-post", "/lectures", "member", S.o2Post, "view"],
  ["o3-list", "/lectures", "guest", S.o3List, "full"],
  ["o3-item", "/lectures", "guest", S.o3Item, "full"],
  ["o3-post", "/lectures", "member", S.o3Post, "view"],
  ["flow-pending", "/lectures", "member", S.flowPending, "full"],
  ["flow-admin", "/admin/events", "admin", S.flowAdmin, "full"],
].filter(([n]) => !ONLY || ONLY.test(n));

function inject({ html, kind }) {
  // Header: add the "יוזמות" tab (current page) to both tab rows.
  const rows = [...document.querySelectorAll("header ul")];
  for (const ul of rows) {
    const li = ul.lastElementChild.cloneNode(true);
    const a = li.querySelector("a");
    a.textContent = "יוזמות";
    a.classList.add("tab-new");
    a.setAttribute("aria-current", "page");
    if (kind === "guest") ul.replaceChildren(li);
    else ul.append(li);
  }
  if (kind === "guest") {
    const pill = document.querySelector('header a[href$="/me"]');
    if (pill) { pill.className = "btn btn-primary h-9 px-3.5 text-[0.8125rem]"; pill.textContent = "כניסה לחברים"; }
  }
  if (kind === "admin") {
    const tabs = document.querySelector('main nav ul');
    for (const a of tabs.querySelectorAll("a")) { a.removeAttribute("aria-current"); a.className = a.className.replace("border-brand-purple text-fg", "border-transparent text-fg-muted"); }
    const li = tabs.firstElementChild.cloneNode(true);
    const a = li.querySelector("a");
    a.textContent = "יוזמות";
    a.className = a.className.replace("border-transparent text-fg-muted", "border-brand-purple text-fg");
    tabs.insertBefore(li, tabs.children[1]);
    const body = document.querySelector("main > div > div.grid.gap-8");
    body.innerHTML = html;
  } else {
    document.querySelector("main .relative.isolate > div.mx-auto").innerHTML = html;
  }
  // Overlays (scrim, sheet) go to <body> so they cover the header too, like a real dialog.
  for (const el of document.querySelectorAll("main .scrim, main .sheet")) document.body.append(el);
  window.scrollTo(0, 0);
}

const browser = await chromium.launch();
for (const [name, base, kind, html, mode] of SCREENS) {
  for (const [w, h, mob] of [[390, 844, true], [1440, 900, false]]) {
    const vh = mode === "view" ? (mob ? 1127 : 1000) : h; // "view": fill the board frame (360x1040 phone, 1440x1000 desk)
    const ctx = await browser.newContext({ viewport: { width: w, height: vh }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, timezoneId: "Asia/Jerusalem", reducedMotion: "reduce", locale: "he-IL" });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    await page.goto(BASE + base, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: CSS + "\nnextjs-portal{display:none!important}" });
    await page.evaluate(inject, { html, kind });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const file = path.join(OUT, `${name}-${mob ? "phone" : "desk"}.png`);
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    if (mode === "view") await page.screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(full, mob ? 2200 : 1400) } });
    const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(path.basename(file), full, over ? "SIDE-SCROLL!" : "");
    await ctx.close();
  }
}
await browser.close();
