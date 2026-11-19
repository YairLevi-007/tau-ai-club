// Renders board.html into design/initiatives/option-{1,2,3}.png and overview.png. Run from the repo root.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(path.resolve("package.json"));
const { chromium } = require("@playwright/test");
const HERE = path.resolve("design/initiatives");
const url = pathToFileURL(path.join(HERE, "board.html")).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2040, height: 1200 }, deviceScaleFactor: 1 });
for (const [q, out] of [["?opt=1", "option-1"], ["?opt=2", "option-2"], ["?opt=3", "option-3"], ["?view=all", "overview"]]) {
  await page.goto(url + q, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#board").screenshot({ path: path.join(HERE, out + ".png") });
  console.log(out);
}
await browser.close();
