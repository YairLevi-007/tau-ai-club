// Renders the sample flyers used by tests/m2/flyer-ocr.spec.ts, in the club's look (brand fonts
// from Google Fonts, dark indigo, purple accents). Text and names are seed data, not real events.
//   node scripts/make-sample-flyers.mjs
// Writes tests/m2/fixtures/flyer-he.png (clean export) and flyer-he-phone.jpg (the same flyer
// photographed on a phone: tilted, soft, uneven light, JPEG).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../tests/m2/fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// Brand values (src/app/tokens.css); fixture only, not app code.
const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&family=Silkscreen&family=IBM+Plex+Mono:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0}
  .f{width:1080px;height:1350px;box-sizing:border-box;padding:84px 80px;background:
    radial-gradient(900px 600px at 85% 0%,rgba(138,43,255,.35),transparent 70%),#0B0A1F;color:#F6F4FF;
    font-family:Rubik,sans-serif;display:flex;flex-direction:column;gap:28px;position:relative;overflow:hidden}
  .eyebrow{font-family:Silkscreen,monospace;font-size:30px;letter-spacing:.12em;color:#A970FF;direction:ltr;text-align:right}
  .tag{align-self:flex-start;border:2px solid #8A2BFF;border-radius:999px;padding:8px 26px;font-weight:500;font-size:34px;color:#A970FF}
  h1{font-size:118px;line-height:1.02;font-weight:800;margin:24px 0 0}
  .en{font-size:46px;font-weight:500;color:#CFC8F0;direction:ltr;text-align:right;margin:0}
  .who{font-size:44px;font-weight:500;margin-top:30px}
  .who b{color:#A970FF;font-weight:700}
  .box{margin-top:auto;border-top:2px solid rgba(169,112,255,.35);padding-top:40px;display:grid;gap:18px;font-size:44px}
  .mono{font-family:"IBM Plex Mono",monospace}
  .cta{font-size:38px;color:#CFC8F0}
  .grid{position:absolute;inset:auto auto 0 0;width:420px;height:420px;opacity:.18;
    background-image:linear-gradient(#8A2BFF 2px,transparent 2px),linear-gradient(90deg,#8A2BFF 2px,transparent 2px);background-size:42px 42px}
</style></head><body>
<div class="f" id="flyer">
  <div class="grid"></div>
  <div class="eyebrow">TAU AI CLUB · COHORT 02</div>
  <div class="tag">הרצאה · Zero to Hero #3</div>
  <h1>סוכני AI<br>בעולם האמיתי</h1>
  <p class="en">AI agents in the real world</p>
  <div class="who">עם <b>אורי גושן</b> ו<b>שי יהל</b></div>
  <div class="box">
    <div>יום רביעי, <span class="mono">13.01</span> · <span class="mono">18:00–20:00</span></div>
    <div>אולם ברודקום, אוניברסיטת תל אביב</div>
    <div class="cta">הרשמה: <span class="mono" dir="ltr">lu.ma/tau-ai-agents</span></div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const png = await page.locator("#flyer").screenshot({ type: "png" });
writeFileSync(new URL("flyer-he.png", OUT), png);

// "Phone photo": the print on a table, tilted 4°, slightly soft, warm uneven light, JPEG 0.6.
const phone = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1600;
  const x = c.getContext("2d");
  x.fillStyle = "#6b5a49";
  x.fillRect(0, 0, c.width, c.height);
  x.save();
  x.translate(c.width / 2, c.height / 2);
  x.rotate((4 * Math.PI) / 180);
  x.filter = "blur(1.2px) brightness(1.15) contrast(0.85)";
  x.drawImage(img, -486, -608, 972, 1215);
  x.restore();
  const g = x.createRadialGradient(300, 200, 50, 600, 800, 1100);
  g.addColorStop(0, "rgba(255,240,200,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height);
  let seed = 7;
  for (let i = 0; i < d.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const n = ((seed / 2147483647) - 0.5) * 22;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL("image/jpeg", 0.6).split(",")[1];
}, png.toString("base64"));
writeFileSync(new URL("flyer-he-phone.jpg", OUT), Buffer.from(phone, "base64"));
await browser.close();
console.log("wrote tests/m2/fixtures/flyer-he.png and flyer-he-phone.jpg");
