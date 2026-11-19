// Renders the final home-screen assets from make.html at exact pixel sizes (option 2, DECISIONS 19.11).
// Run from the repo root:  node design/home-screen/final/make.mjs
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(path.resolve("package.json"));
const { chromium } = require("@playwright/test");
const page0 = pathToFileURL(path.resolve("design/home-screen/final/make.html")).href;

// iPhone portrait launch images: [css width, css height, dpr]. One per screen size Apple ships.
export const LAUNCH = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [414, 736, 3], [320, 568, 2],
];
const out = [
  ["icon", 512, 512, "public/home-screen/icon-512.png"],
  ["icon", 192, 192, "public/home-screen/icon-192.png"],
  ["maskable", 512, 512, "public/home-screen/icon-maskable-512.png"],
  ["icon", 180, 180, "src/app/apple-icon.png"],
  ...LAUNCH.map(([w, h, d]) => ["launch", w * d, h * d, `public/home-screen/launch/launch-${w * d}x${h * d}.png`]),
];
fs.mkdirSync("public/home-screen/launch", { recursive: true });
const browser = await chromium.launch();
for (const [kind, w, h, file] of out) {
  // Render icons at 4x and let the browser downscale, so a 180px icon stays crisp.
  const scale = kind === "launch" ? 1 : 4;
  const page = await browser.newPage({ viewport: { width: w * scale, height: h * scale }, deviceScaleFactor: 1 });
  await page.goto(`${page0}?kind=${kind}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const buf = await page.screenshot({ type: "png" });
  if (scale === 1) fs.writeFileSync(file, buf);
  else {
    const p2 = await browser.newPage({ viewport: { width: w, height: h } });
    await p2.setContent(`<body style="margin:0"><img src="data:image/png;base64,${buf.toString("base64")}" style="width:${w}px;height:${h}px;display:block">`);
    await p2.waitForFunction(() => document.images[0].complete);
    fs.writeFileSync(file, await p2.screenshot({ type: "png" }));
    await p2.close();
  }
  console.log(file, `${w}x${h}`);
  await page.close();
}
await browser.close();
