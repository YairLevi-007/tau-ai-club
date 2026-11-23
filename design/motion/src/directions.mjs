// Three UI directions (fonts + motion) for the owner to pick from. Each one is injected into the
// REAL local pages by shoot.mjs: a Google Fonts link, a CSS layer, and a script that exposes
// window.__mo.seek(t) (t = 0..1 for the intro) and window.__mo.scroll() so frames are deterministic.
// Colours come only from the existing tokens (var(--…)); nothing here is shipped code.

const GF = (q) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

// Shared helpers injected before every direction script.
export const BASE_JS = String.raw`
window.__mo = { parts: [], seek(t) { for (const p of this.parts) p(t); }, scroll: [] };
{ const clamp = (x) => Math.max(0, Math.min(1, x));
  const quint = (x) => 1 - Math.pow(1 - clamp(x), 5);
  window.__h = { clamp, quint, span: (t, a, b) => quint((t - a) / (b - a)) }; }
`;

// ── D1 · דיוק — quiet precision. IBM Plex Sans Hebrew everywhere. Motion: line-mask reveal of the
// headline, the hero grid draws in from the start edge, cards rise 10px, numbers tick, a thin light
// runs along the card border on hover. No video. ~0 KB extra besides the font.
export const D1 = {
  key: "d1",
  name: "דיוק",
  meCss: "main h1 { font-weight: 600 !important; letter-spacing: -0.03em; }",
  fonts: GF("family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600;700"),
  css: String.raw`
html:root, html body { --font-rubik: "IBM Plex Sans Hebrew", system-ui, sans-serif !important; }
h1#hero-heading { font-weight: 600 !important; letter-spacing: -0.035em; line-height: 1.02 !important; }
h1#hero-heading .intro { display: block; overflow: hidden; padding-bottom: .06em; }
h1#hero-heading .intro > .mo-in { display: inline-block; will-change: transform; }
main h2 { font-weight: 600 !important; letter-spacing: -0.03em; }
main h3 { font-weight: 500 !important; letter-spacing: -0.01em; }
main p { font-weight: 400; }
.mo-gridlines { position:absolute; inset:0; pointer-events:none; overflow:hidden;
  mask-image: radial-gradient(70% 60% at 50% 30%, #000 30%, transparent 80%); }
.mo-gridlines i { position:absolute; background: var(--logo-grid); }
.mo-gridlines i.v { top:0; bottom:0; width:1px; transform-origin: top; }
.mo-gridlines i.h { left:0; right:0; height:1px; transform-origin: right; }
.hero-grid { opacity: 0 !important; }
.mo-sweep { position: relative; isolation: isolate; }
.mo-sweep::after { content:""; position:absolute; inset:-1px; border-radius: inherit; padding:1.5px; pointer-events:none;
  background: conic-gradient(from var(--a, 200deg), transparent 0 55%, var(--brand-purple) 72%, var(--brand-purple-soft) 80%, transparent 92%);
  filter: drop-shadow(0 0 6px var(--brand-purple));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: var(--sweep, 0); }
`,
  js: String.raw`
const { span } = window.__h;
// headline: wrap each line so it can rise out of a mask
const lines = [...document.querySelectorAll("h1#hero-heading .intro")];
for (const l of lines) { const s = document.createElement("span"); s.className = "mo-in"; s.append(...l.childNodes); l.append(s); }
// grid lines that draw in
const host = document.querySelector(".hero-grid")?.parentElement;
const g = document.createElement("div"); g.className = "mo-gridlines";
const W = host.clientWidth, H = host.clientHeight, step = 56, cx = W / 2;
const vs = [], hs = [];
for (let x = cx % step; x < W; x += step) { const i = document.createElement("i"); i.className = "v"; i.style.left = x + "px"; g.append(i); vs.push(i); }
for (let y = 0; y < H; y += step) { const i = document.createElement("i"); i.className = "h"; i.style.top = y + "px"; g.append(i); hs.push(i); }
host.prepend(g);
const lede = [...document.querySelectorAll("#hero-heading ~ p, section:has(#hero-heading) > p")];
const faces = [...document.querySelectorAll("[data-testid=hero-faces], [data-testid=hero-faces-wide]")];
const cards = [...document.querySelectorAll("main section li")]
  .filter((el) => /border/.test(el.className + (el.firstElementChild?.className ?? "")) && !el.closest("[data-testid^=hero-faces], [data-testid=next-event]"))
  .map((el) => (/border/.test(el.className) ? el : el.firstElementChild))
  .filter((el, i, a) => !a.some((o) => o !== el && o.contains(el)));
cards.forEach((c) => c.classList.add("mo-sweep"));
window.__mo.parts.push((t) => {
  lines.forEach((l, i) => { const p = span(t, 0.05 + i * 0.12, 0.55 + i * 0.12); l.firstChild.style.transform = "translateY(" + (1 - p) * 105 + "%)"; });
  vs.forEach((v, i) => { const d = Math.abs(i - vs.length / 2) / vs.length; v.style.transform = "scaleY(" + span(t, d * 0.5, 0.6 + d * 0.5) + ")"; });
  hs.forEach((h, i) => { h.style.transform = "scaleX(" + span(t, i * 0.04, 0.5 + i * 0.04) + ")"; });
  lede.forEach((p, i) => { const k = span(t, 0.35 + i * 0.08, 0.85 + i * 0.08); p.style.opacity = k; p.style.transform = "translateY(" + (1 - k) * 10 + "px)"; });
  faces.forEach((f, i) => { const k = span(t, 0.4 + i * 0.04, 0.9 + i * 0.04); f.style.opacity = k; f.style.transform = "translateY(" + (1 - k) * 10 + "px)"; });
});
// below the fold: rise 10px when scrolled into view; the hovered card shows the border light
window.__mo.reveal = (on) => cards.forEach((c, i) => { c.style.transition = "none"; c.style.opacity = on ? 1 : 0; c.style.transform = on ? "none" : "translateY(10px)"; });
window.__mo.sweep = (el, a) => { el.style.setProperty("--sweep", 1); el.style.setProperty("--a", a + "deg"); };
window.__mo.cards = cards;
`,
};

// ── D2 · סיפור בגלילה — scroll story. Karantina (condensed Hebrew display) for huge headlines,
// Assistant for text. Motion: the pixel blocks of the hero gather into the club's grid mark as you
// scroll; each section is a numbered chapter with a big outline numeral and a progress rail.
// Real build: CSS scroll-driven animations (animation-timeline: view()) + static fallback.
export const D2 = {
  key: "d2",
  name: "סיפור בגלילה",
  meCss: 'main h1 { font-family: "Karantina", sans-serif !important; font-weight: 700 !important; font-size: clamp(4rem, 13vw, 6.5rem) !important; line-height: .85 !important; } main h2 { font-weight: 700 !important; }',
  fonts: GF("family=Karantina:wght@400;700&family=Assistant:wght@300;400;500;600;700"),
  css: String.raw`
html:root, html body { --font-rubik: "Assistant", system-ui, sans-serif !important; }
h1#hero-heading { font-family: "Karantina", var(--font-rubik) !important; font-weight: 700 !important;
  font-size: clamp(5.4rem, 15vw, 11.5rem) !important; line-height: .78 !important; letter-spacing: -0.01em; }
.mo-home main h2 { font-family: "Karantina", var(--font-rubik) !important; font-weight: 700 !important;
  font-size: clamp(3.6rem, 9vw, 6.5rem) !important; line-height: .86 !important; letter-spacing: 0; }
.mo-home main h3 { font-weight: 700 !important; }
.mo-chap { position: relative; }
.mo-num { position: absolute; inset-inline-end: 0; top: -0.18em; font-family: "Karantina", sans-serif; font-weight: 700;
  font-size: clamp(9rem, 26vw, 19rem); line-height: .8; color: transparent; -webkit-text-stroke: 1px var(--border-accent);
  pointer-events: none; z-index: 0; user-select: none; }
[dir=rtl] .mo-num { inset-inline-end: auto; inset-inline-start: auto; left: 0; }
.mo-chap > :not(.mo-num) { position: relative; z-index: 1; }
.mo-rail { position: fixed; top: 50%; translate: 0 -50%; inset-inline-start: 18px; z-index: 40; display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
[dir=rtl] .mo-rail { right: 18px; left: auto; }
.mo-rail b { font: 400 10px/1 var(--font-pixel); letter-spacing: .2em; color: var(--fg-subtle); display:flex; gap:8px; align-items:center; }
.mo-rail b::before { content:""; width: 18px; height: 1px; background: var(--border-strong); }
.mo-rail b.on { color: var(--brand-purple-soft); }
.mo-rail b.on::before { width: 34px; background: var(--brand-purple); }
.mo-rail .bar { position:absolute; inset-inline-start: -10px; top: 0; bottom: 0; width: 2px; background: var(--border); }
.mo-rail .bar i { position:absolute; inset-inline: 0; top: 0; background: var(--brand-purple); height: var(--p, 0%); }
@media (max-width: 767px) {
  .mo-rail { top: auto; bottom: 0; translate: none; left: 0 !important; right: 0 !important; flex-direction: row; justify-content: center; gap: 18px;
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom)); background: color-mix(in oklab, var(--bg) 82%, transparent); backdrop-filter: blur(10px); border-top: 1px solid var(--border); }
  .mo-rail .bar { inset: auto 0 0 0; width: auto; height: 2px; top: 0; }
  .mo-rail .bar i { height: 100%; width: var(--p, 0%); inset-inline-end: auto; }
  [dir=rtl] .mo-rail .bar i { right: 0; left: auto; }
  .mo-rail b::before { display: none; }
}
.mo-px { position: absolute; top: 0; left: 0; width: var(--s); height: var(--s); background: var(--logo-block); z-index: 0; pointer-events: none; }
.mo-px.hi { background: var(--brand-purple); }
`,
  js: String.raw`
const { span, clamp } = window.__h;
const hero = document.querySelector("main > div.relative.isolate");
// pixel blocks: scattered at the top of the scroll, gathered into a 5x5 club grid mark (our own
// blocks, not anyone's logo) next to the headline by ~60% of the hero.
const mob = innerWidth < 768;
const S = mob ? 11 : 22, G = mob ? 3 : 4;
const shape = ["11111","10001","10101","10001","11111"]; // a framed square with a centre pixel
const target = []; shape.forEach((r, y) => [...r].forEach((c, x) => c === "1" && target.push([x, y])));
const ox = mob ? 22 : 640, oy = mob ? 300 : 190; // inline-start corner of the mark (left side in RTL pages)
const px = target.map(([x, y], i) => {
  const d = document.createElement("i"); d.className = "mo-px" + ((x === 2 && y === 2) || (x + y) % 5 === 0 ? " hi" : ""); d.style.setProperty("--s", S + "px");
  const rnd = (n) => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  const from = [rnd(1) * hero.clientWidth, rnd(2) * 640 + 30]; const to = [ox + x * (S + G), oy + y * (S + G)];
  hero.append(d); return { d, from, to, delay: rnd(3) * 0.25 };
});
const chapters = [["[data-testid=club-about]", "01", "המועדון"], ["[data-testid=season-speakers]", "02", "המרצים"], ["founders", "03", "המייסדים"]];
const rail = document.createElement("nav"); rail.className = "mo-rail"; rail.setAttribute("aria-label", "פרקים");
rail.innerHTML = '<span class="bar"><i></i></span>';
const marks = [];
for (const [sel, n, label] of chapters) {
  const sec = sel === "founders" ? [...document.querySelectorAll("main section")].find((x) => /מקימי/.test(x.querySelector("h2")?.textContent ?? "")) : document.querySelector(sel);
  if (!sec || !sec.querySelector("h2")) continue;
  const h2 = sec.querySelector("h2"); const box = h2?.parentElement ?? sec;
  box.classList.add("mo-chap"); const num = document.createElement("span"); num.className = "mo-num"; num.setAttribute("aria-hidden", "true"); num.textContent = n; box.prepend(num);
  const b = document.createElement("b"); b.textContent = n + (mob ? "" : "  " + label); rail.append(b); marks.push({ sec, b, h2, num });
}
document.body.append(rail);
// frame = scroll position; everything is a pure function of scrollY so a still is reproducible.
window.__mo.at = (y) => {
  const t = clamp(y / (mob ? 520 : 640));
  px.forEach(({ d, from, to, delay }) => { const k = span(t, delay, 0.6 + delay); d.style.transform = "translate(" + (from[0] + (to[0] - from[0]) * k) + "px," + (from[1] + (to[1] - from[1]) * k) + "px) rotate(" + (1 - k) * 90 + "deg)"; d.style.opacity = 0.35 + 0.65 * k; });
  const h1 = document.querySelector("#hero-heading"); h1.style.transform = "translateY(" + (-t * 40) + "px)"; h1.style.opacity = 1 - t * 0.35;
  const doc = document.documentElement.scrollHeight - innerHeight; rail.style.setProperty("--p", (clamp(y / doc) * 100) + "%");
  let cur = -1; marks.forEach((m, i) => { const r = m.sec.getBoundingClientRect(); if (r.top < innerHeight * 0.6) cur = i;
    const k = span(1 - r.top / innerHeight, 0.05, 0.55); m.num.style.transform = "translateY(" + (1 - k) * 60 + "px)"; m.num.style.opacity = k;
    m.h2.style.clipPath = "inset(0 0 " + (1 - k) * 100 + "% 0)"; });
  marks.forEach((m, i) => m.b.classList.toggle("on", i === cur));
  rail.style.opacity = y > 200 ? 1 : 0;
};
window.__mo.parts.push(() => {});
`,
};

// ── D3 · קולנועי — cinematic. Frank Ruhl Libre (Hebrew serif) for display, Rubik stays for text.
// The hero becomes a full-bleed looping "film": in this mockup a tiny procedural canvas (purple light
// streaks running through the club grid + drifting pixels), standing in for a real 6–8 s muted loop.
// A pause button sits on it (needed for any auto-playing motion). /me gets fonts only.
export const D3 = {
  key: "d3",
  name: "קולנועי",
  meCss: 'main h1 { font-family: "Frank Ruhl Libre", serif !important; font-weight: 900 !important; font-size: clamp(2.6rem, 7vw, 4rem) !important; line-height: 1 !important; } main h2 { font-family: "Frank Ruhl Libre", serif !important; font-weight: 700 !important; }',
  fonts: GF("family=Frank+Ruhl+Libre:wght@500;700;900"),
  css: String.raw`
h1#hero-heading { font-family: "Frank Ruhl Libre", serif !important; font-weight: 900 !important;
  font-size: clamp(3.6rem, 9.2vw, 8.4rem) !important; line-height: .98 !important; letter-spacing: -0.02em; }
.mo-home main h2 { font-family: "Frank Ruhl Libre", serif !important; font-weight: 700 !important; letter-spacing: -0.015em; font-size: clamp(2.2rem, 5vw, 3.6rem) !important; }
.mo-home main h3 { font-family: "Frank Ruhl Libre", serif !important; font-weight: 700 !important; font-size: 1.25em; }
.mo-film { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
.mo-film canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.mo-film::after { content:""; position:absolute; inset:0;
  background: linear-gradient(to bottom, transparent 60%, var(--bg) 99%),
              radial-gradient(45% 55% at 78% 42%, color-mix(in oklab, var(--bg) 72%, transparent), transparent 80%); }
.mo-hero { min-height: min(88svh, 820px); align-content: center; }
@media (max-width: 767px) { .mo-hero { min-height: 72svh; align-content: end; } }
.hero-grid, .hero-glow { display: none !important; }
.mo-pause { position: absolute; bottom: 22px; inset-inline-end: 22px; z-index: 5; display:inline-flex; gap: 8px; align-items:center;
  height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--fg-muted);
  background: color-mix(in oklab, var(--bg) 60%, transparent); backdrop-filter: blur(8px); font: 500 12px/1 var(--font-rubik); }
[dir=rtl] .mo-pause { left: 22px; right: auto; }
.mo-pause svg { width: 12px; height: 12px; }
.mo-tag { font: 400 10px/1 var(--font-pixel); letter-spacing: .24em; color: var(--brand-purple-soft); margin-bottom: 18px; display:block; }
`,
  js: String.raw`
const { span } = window.__h;
const hero = document.querySelector("main > div.relative.isolate");
const grid = hero.querySelector(":scope > div.mx-auto");
grid?.classList.add("mo-hero");
const film = document.createElement("div"); film.className = "mo-film"; film.setAttribute("aria-hidden", "true");
const cv = document.createElement("canvas"); film.append(cv);
const top = hero.querySelector(".hero-grid")?.parentElement; (top ?? hero).before(film); hero.prepend(film);
film.style.height = (grid ? grid.offsetHeight + grid.offsetTop + 40 : 900) + "px"; film.style.bottom = "auto";
const btn = document.createElement("button"); btn.className = "mo-pause"; btn.type = "button";
btn.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>עצירת הווידאו';
film.after(btn); btn.style.top = (parseFloat(film.style.height) - 60) + "px"; btn.style.bottom = "auto";
const css = getComputedStyle(document.documentElement);
const C = { p: css.getPropertyValue("--brand-purple").trim(), s: css.getPropertyValue("--brand-purple-soft").trim(), g: css.getPropertyValue("--logo-grid").trim(), b: css.getPropertyValue("--logo-block").trim(), bg: css.getPropertyValue("--bg").trim() };
const dpr = Math.min(2, devicePixelRatio);
function draw(time) { // time in seconds, loops every 8 s
  const w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext("2d"); x.scale(dpr, dpr);
  x.fillStyle = C.bg; x.fillRect(0, 0, w, h);
  // perspective floor grid sliding toward the viewer
  const hz = h * 0.42, cx = w * 0.32; x.strokeStyle = C.g; x.lineWidth = 1;
  for (let i = -24; i <= 24; i++) { x.beginPath(); x.moveTo(cx + i * 18, hz); x.lineTo(cx + i * 260, h); x.globalAlpha = 0.9; x.stroke(); }
  for (let k = 0; k < 14; k++) { const f = ((k + (time / 8) * 14 * 0.5) % 14) / 14; const y = hz + (h - hz) * f * f; x.globalAlpha = 0.2 + 0.6 * f; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
  x.globalAlpha = 1;
  // light streaks running along the floor lines
  for (let i = 0; i < 14; i++) { const lane = (i * 3 - 20); const ph = ((time / 8) * (1 + (i % 3) * 0.5) + i * 0.137) % 1;
    const sx = cx + lane * 18, ex = cx + lane * 260; const a = ph, b = Math.min(1, ph + 0.18);
    const g = x.createLinearGradient(sx + (ex - sx) * a, hz + (h - hz) * a, sx + (ex - sx) * b, hz + (h - hz) * b);
    g.addColorStop(0, "transparent"); g.addColorStop(1, i % 2 ? C.s : C.p);
    x.strokeStyle = g; x.lineWidth = 2.5 + 4 * b; x.shadowColor = C.p; x.shadowBlur = 24; x.beginPath();
    x.moveTo(sx + (ex - sx) * a, hz + (h - hz) * a); x.lineTo(sx + (ex - sx) * b, hz + (h - hz) * b); x.stroke(); }
  x.shadowBlur = 0;
  // horizon glow
  const rg = x.createRadialGradient(cx, hz, 0, cx, hz, w * 0.55); rg.addColorStop(0, C.p + "99"); rg.addColorStop(1, "transparent");
  x.fillStyle = rg; x.fillRect(0, 0, w, h);
  // drifting pixels (club blocks)
  for (let i = 0; i < 26; i++) { const r = (n) => { const v = Math.sin(i * 91.7 + n * 47.3) * 9631.7; return v - Math.floor(v); };
    const s = 4 + Math.floor(r(1) * 4) * 4; const y = ((r(2) * h - time * (10 + r(3) * 22)) % h + h) % h; const xx = r(4) * w;
    x.globalAlpha = 0.25 + r(5) * 0.6; x.fillStyle = r(6) > 0.75 ? C.p : C.b; x.fillRect(Math.round(xx), Math.round(y), s, s); }
  x.globalAlpha = 1;
}
const h1 = document.querySelector("#hero-heading");
const rest = [...h1.querySelectorAll(".intro"), ...document.querySelectorAll("section:has(#hero-heading) > p")];
window.__mo.film = draw;
window.__mo.parts.push((t) => {
  draw(t * 8);
  rest.forEach((el, i) => { const k = span(t * 8, 0.6 + i * 0.25, 1.8 + i * 0.25); el.style.opacity = k; el.style.transform = "translateY(" + (1 - k) * 12 + "px)"; el.style.filter = "blur(" + (1 - k) * 6 + "px)"; });
});
`,
};

export const DIRECTIONS = [D1, D2, D3];
