// Renders board.html into the review boards. Run from the repo root: node design/motion/src/boards.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(path.resolve("package.json"));
const { chromium } = require("@playwright/test");
const HERE = path.resolve("design/motion");
const url = pathToFileURL(path.join(HERE, "board.html")).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
for (const [q, out] of [["?view=overview", "overview"], ["?opt=1", "option-1"], ["?opt=2", "option-2"], ["?opt=3", "option-3"]]) {
  await page.goto(url + q, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(HERE, `${out}.png`), fullPage: true });
  console.log(out);
}
await browser.close();
