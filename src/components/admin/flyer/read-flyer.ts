// Read a flyer in the admin's browser, for free: MediaPipe finds the faces, Tesseract (Hebrew +
// English) reads the text. Nothing leaves the page. The libraries, wasm, models and language data
// load on demand from public CDNs at pinned versions, only when an admin reads a flyer.
//
// For each face we propose a square head-and-shoulders crop and OCR only the text right next to
// it (under it, and beside it), where flyers print the speaker's name, role and company. With
// `page: true` the whole flyer is read too (dates, times, links, venue).
//
// `readFlyer` is self-contained (no imports or module-level values inside it) so the Playwright
// accuracy test runs this exact code with page.evaluate().

import type { CaptionLine } from "@/lib/flyer/people";

export type FlyerSquare = { x: number; y: number; size: number };
export type FlyerPerson = { face: { x: number; y: number; w: number; h: number }; square: FlyerSquare; caption: CaptionLine[] };
export type FlyerPageLine = { text: string; height: number; confidence: number };
export type FlyerReading = { width: number; height: number; people: FlyerPerson[]; lines: FlyerPageLine[]; facesAvailable: boolean };

export async function readFlyer(src: string, opts: { page?: boolean } = {}, onProgress?: (p: number) => void): Promise<FlyerReading> {
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist";
  const CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0";
  const LANG_URL = (code: string) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}@1.0.0/4.0.0_best_int/${code}.traineddata.gz`;
  const CACHE = "tau-flyer-ocr/1.0.0";
  const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3";
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const report = (p: number) => onProgress?.(Math.max(0, Math.min(1, p)));

  // 1. Faces (MediaPipe BlazeFace). Any failure just means no faces.
  type Box = { x: number; y: number; w: number; h: number };
  let faces: Box[] = [];
  let facesAvailable = true;
  try {
    type Detection = { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories?: { score: number }[] };
    const vision = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${VISION}/vision_bundle.mjs`)) as {
      FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
      FaceDetector: { createFromOptions(fs: unknown, o: object): Promise<{ detect(i: HTMLImageElement | HTMLCanvasElement): { detections: Detection[] }; close(): void }> };
    };
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const detector = await vision.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL }, minDetectionConfidence: 0.6 });
    // The short-range model looks at a 128 px copy of its input, so faces that are small on the
    // page are missed. Run it on the whole page and on overlapping tiles, then merge duplicates.
    const found: (Box & { score: number })[] = [];
    const detectIn = (sx: number, sy: number, sw: number, sh: number) => {
      const c = document.createElement("canvas");
      const k = Math.min(1, 640 / Math.max(sw, sh));
      c.width = Math.round(sw * k);
      c.height = Math.round(sh * k);
      c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      for (const d of detector.detect(c).detections) {
        const b = d.boundingBox;
        if (b) found.push({ x: sx + b.originX / k, y: sy + b.originY / k, w: b.width / k, h: b.height / k, score: d.categories?.[0]?.score ?? 0 });
      }
    };
    detectIn(0, 0, W, H);
    const T = Math.round(Math.min(W, H) * 0.55);
    for (let y = 0; y < H; y += T / 2) for (let x = 0; x < W; x += T / 2) detectIn(Math.min(x, W - T), Math.min(y, H - T), T, T);
    detector.close();
    const overlap = (a: Box, b: Box) => {
      const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return (w * h) / Math.min(a.w * a.h, b.w * b.h);
    };
    // Bigger first: a face cut by a tile edge gives a smaller, partial box.
    for (const f of found.sort((a, b) => b.w * b.h * b.score - a.w * a.h * a.score)) if (!faces.some((o) => overlap(o, f) > 0.4)) faces.push({ x: f.x, y: f.y, w: f.w, h: f.h });
    faces = faces.filter((b) => b.w >= 24 && b.h >= 24).sort((a, b) => a.y - b.y || a.x - b.x);
  } catch (e) {
    console.warn("[flyer] face detection unavailable", e);
    facesAvailable = false;
  }
  report(0.1);

  // A head-and-shoulders square around each face, kept inside the image.
  const squares: FlyerSquare[] = faces.map((f) => {
    const size = Math.max(32, Math.min(W, H, Math.round(Math.max(f.w, f.h) * 1.9)));
    const x = Math.round(f.x + f.w / 2 - size / 2);
    const y = Math.round(f.y + f.h * 0.55 - size / 2);
    return { size, x: Math.min(Math.max(0, x), W - size), y: Math.min(Math.max(0, y), H - size) };
  });

  // Greyscale, stretch the contrast, and invert light-on-dark text (Tesseract wants dark on light).
  const prepare = (sx: number, sy: number, sw: number, sh: number, target: number) => {
    const scale = Math.min(3, Math.max(1, target / Math.max(sw, sh)));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    const n = px.length / 4;
    const grey = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      // Max channel mixed in, so purple/violet text stays bright against a dark background.
      grey[j] = Math.max(px[i], px[i + 1], px[i + 2]) * 0.6 + (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * 0.4;
      hist[grey[j]]++;
      sum += grey[j];
    }
    let lo = 0;
    let hi = 255;
    for (let v = 0, acc = 0; v < 256; v++) if ((acc += hist[v]) > n * 0.01) { lo = v; break; }
    for (let v = 255, acc = 0; v >= 0; v--) if ((acc += hist[v]) > n * 0.01) { hi = v; break; }
    const dark = sum / n < 128;
    const span = Math.max(1, hi - lo);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const v = ((grey[j] - lo) * 255) / span;
      px[i] = px[i + 1] = px[i + 2] = dark ? 255 - v : v;
      px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return { canvas: c, scale };
  };

  // Caption regions: under the photo and on each side, never reaching past the halfway point to
  // a neighbouring face in the same row (so one speaker's caption isn't read as the other's).
  type Region = { region: CaptionLine["region"]; x: number; y: number; w: number; h: number; person: number };
  const regions: Region[] = [];
  squares.forEach((s, i) => {
    const sameRow = squares.filter((o, j) => j !== i && o.y < s.y + s.size && o.y + o.size > s.y);
    const cx = s.x + s.size / 2;
    const leftWall = Math.max(0, ...sameRow.filter((o) => o.x + o.size / 2 < cx).map((o) => (o.x + o.size / 2 + cx) / 2));
    const rightWall = Math.min(W, ...sameRow.filter((o) => o.x + o.size / 2 > cx).map((o) => (o.x + o.size / 2 + cx) / 2));
    const below = squares.filter((o, j) => j !== i && o.y > s.y + s.size * 0.5 && o.x < s.x + s.size && o.x + o.size > s.x).map((o) => o.y);
    const bottom = Math.min(H, s.y + s.size * 2.3, ...below);
    const add = (region: Region["region"], x0: number, y0: number, x1: number, y1: number) => {
      const x = Math.max(0, Math.round(x0));
      const y = Math.max(0, Math.round(y0));
      const w = Math.round(Math.min(W, x1) - x);
      const h = Math.round(Math.min(H, y1) - y);
      if (w >= 40 && h >= 24) regions.push({ region, x, y, w, h, person: i });
    };
    add("below", Math.max(leftWall, s.x - s.size * 0.8), s.y + s.size * 0.8, Math.min(rightWall, s.x + s.size * 1.8), bottom);
    add("right", s.x + s.size, s.y, Math.min(rightWall, s.x + s.size * 3.4), s.y + s.size);
    add("left", Math.max(leftWall, s.x - s.size * 2.4), s.y, s.x, s.y + s.size);
  });

  const people: FlyerPerson[] = faces.map((face, i) => ({ face, square: squares[i], caption: [] }));
  const lines: FlyerPageLine[] = [];
  if (!regions.length && !opts.page) return { width: W, height: H, people, lines, facesAvailable };

  // 2. Text (Tesseract). Hebrew and English live in two packages but Tesseract takes one
  // langPath, so both are fetched here and put in its own IndexedDB cache (idb-keyval
  // "keyval-store", key "<cachePath>/<code>.traineddata"), where the worker looks first.
  // Without IndexedDB (private window) we fall back to Hebrew only.
  const langs = await Promise.all(
    ["heb", "eng"].map(async (code) => {
      const res = await fetch(LANG_URL(code));
      if (!res.ok) throw new Error(`language data ${code}: ${res.status}`);
      return { code, data: new Uint8Array(await res.arrayBuffer()) };
    }),
  );
  const seeded = await new Promise<boolean>((resolve) => {
    try {
      const open = indexedDB.open("keyval-store");
      open.onupgradeneeded = () => open.result.createObjectStore("keyval");
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction("keyval", "readwrite");
          for (const l of langs) tx.objectStore("keyval").put(l.data, `${CACHE}/${l.code}.traineddata`);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
  report(0.25);

  type Line = { text: string; confidence: number; bbox: { y0: number; y1: number } };
  type Worker = {
    setParameters(p: Record<string, string>): Promise<unknown>;
    recognize(image: HTMLCanvasElement, opts: object, output: object): Promise<{ data: { blocks?: { paragraphs: { lines: Line[] }[] }[] | null } }>;
    terminate(): Promise<unknown>;
  };
  type TesseractModule = { createWorker(langs: unknown, oem: number, options: object): Promise<Worker> };
  const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${TESSERACT}/tesseract.esm.min.js`)) as Partial<TesseractModule> & { default?: TesseractModule };
  const T = (mod.createWorker ? mod : mod.default) as TesseractModule;
  const worker = await T.createWorker(seeded ? "heb+eng" : "heb", 1, {
    workerPath: `${TESSERACT}/worker.min.js`,
    corePath: CORE,
    cachePath: CACHE,
    langPath: LANG_URL("heb").replace(/\/heb\.traineddata\.gz$/, ""),
  });
  const read = async (canvas: HTMLCanvasElement, scale: number) => {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const out: { text: string; confidence: number; height: number; y: number }[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines) {
          const text = l.text.trim();
          if (text) out.push({ text, confidence: Math.round(l.confidence), height: Math.round((l.bbox.y1 - l.bbox.y0) / scale), y: Math.round(l.bbox.y0 / scale) });
        }
    return out;
  };
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const jobs = regions.length + (opts.page ? 1 : 0);
    let done = 0;
    // Captions are a few short lines in one block: read them as a single block (page
    // segmentation mode 6). The whole page goes back to automatic layout (mode 3).
    if (regions.length) await worker.setParameters({ tessedit_pageseg_mode: "6" });
    for (const r of regions) {
      const { canvas, scale } = prepare(r.x, r.y, r.w, r.h, 1400);
      for (const l of await read(canvas, scale)) people[r.person].caption.push({ ...l, region: r.region });
      report(0.25 + (0.75 * ++done) / jobs);
    }
    if (opts.page) {
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
      const { canvas, scale } = prepare(0, 0, W, H, 2400);
      for (const l of await read(canvas, scale)) lines.push({ text: l.text, confidence: l.confidence, height: l.height });
      report(1);
    }
  } finally {
    await worker.terminate();
  }
  return { width: W, height: H, people, lines, facesAvailable };
}
