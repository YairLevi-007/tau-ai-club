// Renders the sample flyers used by tests/m2/flyer-ocr.spec.ts, in the club's look (brand fonts
// from Google Fonts, dark indigo, purple accents). Speaker faces are drawn (no real people's
// photos) and the caption names are made up; the first flyer reuses seed names in its text.
//   node scripts/make-sample-flyers.mjs
// Writes to tests/m2/fixtures/, for each flyer a clean export (.png) and the same flyer
// "photographed on a phone" (-phone.jpg: tilted 4°, soft, uneven light, noise, JPEG 0.6), plus
// flyers.json with the ground truth (photo frames and captions) the accuracy test checks against.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../tests/m2/fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// Brand values (src/app/tokens.css); fixture only, not app code.
const head = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&family=Silkscreen&family=IBM+Plex+Mono:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0}
  .f{width:1080px;height:1350px;box-sizing:border-box;padding:84px 80px;background:
    radial-gradient(900px 600px at 85% 0%,rgba(138,43,255,.35),transparent 70%),#0B0A1F;color:#F6F4FF;
    font-family:Rubik,sans-serif;display:flex;flex-direction:column;gap:28px;position:relative;overflow:hidden}
  .eyebrow{font-family:Silkscreen,monospace;font-size:30px;letter-spacing:.12em;color:#A970FF;direction:ltr;text-align:right}
  .tag{align-self:flex-start;border:2px solid #8A2BFF;border-radius:999px;padding:8px 26px;font-weight:500;font-size:34px;color:#A970FF}
  h1{font-size:118px;line-height:1.02;font-weight:800;margin:24px 0 0}
  h1.s{font-size:92px;margin-top:8px}
  .en{font-size:46px;font-weight:500;color:#CFC8F0;direction:ltr;text-align:right;margin:0}
  .who{font-size:44px;font-weight:500;margin-top:30px}
  .who b{color:#A970FF;font-weight:700}
  .box{margin-top:auto;border-top:2px solid rgba(169,112,255,.35);padding-top:40px;display:grid;gap:18px;font-size:44px}
  .mono{font-family:"IBM Plex Mono",monospace}
  .cta{font-size:38px;color:#CFC8F0}
  .grid{position:absolute;inset:auto auto 0 0;width:420px;height:420px;opacity:.18;
    background-image:linear-gradient(#8A2BFF 2px,transparent 2px),linear-gradient(90deg,#8A2BFF 2px,transparent 2px);background-size:42px 42px}
  .people{display:flex;gap:64px;justify-content:center;margin-top:24px}
  .person{display:grid;justify-items:center;gap:10px;text-align:center}
  .photo{border-radius:20px;border:3px solid #8A2BFF;display:block}
  .pname{font-size:46px;font-weight:700}
  .prole{font-size:32px;color:#CFC8F0;font-weight:500}
</style></head><body>`;

const flyers = [
  {
    name: "flyer-he",
    body: `<div class="f" id="flyer">
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
</div>`,
  },
  {
    name: "flyer-he-speaker",
    body: `<div class="f" id="flyer">
  <div class="grid"></div>
  <div class="eyebrow">TAU AI CLUB · COHORT 02</div>
  <h1 class="s">איך מודלים לומדים</h1>
  <div class="people">
    <div class="person"><canvas class="photo" width="400" height="400" data-skin="#e8b896" data-hair="#3b2a20"></canvas>
      <div class="pname">תמר לוי</div><div class="prole">חוקרת AI, Example Labs</div></div>
  </div>
  <div class="box">
    <div>יום שלישי, <span class="mono">09.02</span> · <span class="mono">18:00</span></div>
    <div>המרכז ליזמות</div>
  </div>
</div>`,
    people: [{ name: "תמר לוי", role: "חוקרת AI", company: "Example Labs" }],
  },
  {
    name: "flyer-two-speakers",
    body: `<div class="f" id="flyer">
  <div class="grid"></div>
  <div class="eyebrow">TAU AI CLUB · COHORT 02</div>
  <h1 class="s">ערב סוכנים</h1>
  <p class="en">Agents night</p>
  <div class="people">
    <div class="person"><canvas class="photo" width="340" height="340" data-skin="#c99372" data-hair="#151515"></canvas>
      <div class="pname">נועה ברק</div><div class="prole">מהנדסת מחקר · Example Labs</div></div>
    <div class="person"><canvas class="photo" width="340" height="340" data-skin="#efc7a6" data-hair="#7a5230"></canvas>
      <div class="pname" dir="ltr">Daniel Mor</div><div class="prole" dir="ltr">CTO @ Sample AI</div></div>
  </div>
  <div class="box">
    <div>יום רביעי, <span class="mono">17.03</span> · <span class="mono">18:00–20:00</span></div>
    <div class="cta">הרשמה: <span class="mono" dir="ltr">lu.ma/agents-night</span></div>
  </div>
</div>`,
    people: [
      { name: "נועה ברק", role: "מהנדסת מחקר", company: "Example Labs" },
      { name: "Daniel Mor", role: "CTO", company: "Sample AI" },
    ],
  },
];

// A drawn head-and-shoulders portrait (MediaPipe detects these like photos; no real person).
const drawFaces = () => {
  for (const c of document.querySelectorAll("canvas.photo")) {
    const ctx = c.getContext("2d");
    const r = c.width * 0.3;
    const cx = c.width / 2;
    const cy = c.height * 0.46;
    const skin = c.dataset.skin;
    const hair = c.dataset.hair;
    ctx.fillStyle = "#cfd6e0";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#2d3a55";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.9, r * 1.5, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.fillRect(cx - r * 0.35, cy + r * 0.8, r * 0.7, r * 0.7);
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.25, r * 0.9, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.1, r * 0.1, cx, cy, r);
    g.addColorStop(0, skin);
    g.addColorStop(1, "#a8765a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 0.72, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.62, r * 0.74, r * 0.36, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.3;
      const ey = cy - r * 0.08;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.15, r * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a3426";
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hair;
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.16, ey - r * 0.16);
      ctx.quadraticCurveTo(ex, ey - r * 0.24, ex + r * 0.16, ey - r * 0.15);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(90,50,35,.6)";
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.02);
    ctx.lineTo(cx - r * 0.07, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.05, cy + r * 0.33);
    ctx.stroke();
    ctx.fillStyle = "#a4454a";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.52, r * 0.2, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

// "Phone photo": the print on a table, tilted 4°, slightly soft, warm uneven light, noise, JPEG 0.6.
const phoneShot = async (b64) => {
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
    const n = (seed / 2147483647 - 0.5) * 22;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL("image/jpeg", 0.6).split(",")[1];
};

const truth = {};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (const f of flyers) {
  await page.setContent(`${head}${f.body}</body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(drawFaces);
  const png = await page.locator("#flyer").screenshot({ type: "png" });
  writeFileSync(new URL(`${f.name}.png`, OUT), png);
  writeFileSync(new URL(`${f.name}-phone.jpg`, OUT), Buffer.from(await page.evaluate(phoneShot, png.toString("base64")), "base64"));
  const frames = await page.locator("canvas.photo").evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), size: Math.round(b.width) };
    }),
  );
  truth[f.name] = (f.people ?? []).map((p, i) => ({ ...p, frame: frames[i] }));
}
await browser.close();
writeFileSync(new URL("flyers.json", OUT), `${JSON.stringify(truth, null, 2)}\n`);
console.log(`wrote ${flyers.map((f) => f.name).join(", ")} (+ -phone.jpg) and flyers.json to tests/m2/fixtures/`);
