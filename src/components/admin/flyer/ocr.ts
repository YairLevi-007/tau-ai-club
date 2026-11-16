// Read the text off a flyer in the admin's browser with Tesseract (free, open source; the image
// never leaves the page). The library, its wasm core and the Hebrew + English language data are
// loaded on demand from jsDelivr, pinned to exact versions (the data to a tessdata commit), only when an admin reads a flyer.
//
// `runFlyerOcr` is self-contained (no imports or module-level values inside it) so the
// Playwright accuracy test can run the exact same code with page.evaluate().

export type OcrResultLine = { text: string; height: number; confidence: number };

/** OCR an image URL (object URL, data URL, or a CORS-enabled https URL). */
export async function runFlyerOcr(src: string, onProgress?: (p: number) => void): Promise<OcrResultLine[]> {
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist";
  const CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0";
  // Tesseract's language data, one npm package per language, pinned.
  const LANG_URL = (code: string) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}@1.0.0/4.0.0_best_int/${code}.traineddata.gz`;
  const CACHE = "tau-flyer-ocr/1.0.0";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  // Tesseract reads dark text on a light page best: scale to a readable size, grey it,
  // stretch the contrast, and invert it when the flyer is light-on-dark (ours are).
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(3, Math.max(1, 2400 / long));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const grey = new Uint8ClampedArray(px.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Max channel instead of luma: purple/violet text stays bright against a near-black background.
    const g = Math.max(px[i], px[i + 1], px[i + 2]) * 0.6 + (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * 0.4;
    grey[j] = g;
    hist[grey[j]]++;
  }
  const n = grey.length;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  for (let v = 0; v < 256; v++) if ((acc += hist[v]) > n * 0.01) { lo = v; break; }
  acc = 0;
  for (let v = 255; v >= 0; v--) if ((acc += hist[v]) > n * 0.01) { hi = v; break; }
  const dark = sum / n < 128;
  const span = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = ((grey[j] - lo) * 255) / span;
    if (dark) v = 255 - v;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);

  // Tesseract takes a single langPath, but Hebrew and English live in two packages. So we fetch
  // both ourselves and put them in Tesseract's own IndexedDB cache (idb-keyval "keyval-store",
  // key "<cachePath>/<code>.traineddata"), where the worker looks before it downloads anything.
  // If IndexedDB isn't available (private window), fall back to Hebrew only from its package.
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
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const { data: out } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const lines: OcrResultLine[] = [];
    for (const b of out.blocks ?? []) {
      for (const p of b.paragraphs) {
        for (const l of p.lines) {
          const text = l.text.trim();
          if (text) lines.push({ text, confidence: Math.round(l.confidence), height: Math.round((l.bbox.y1 - l.bbox.y0) / scale) });
        }
      }
    }
    return lines;
  } finally {
    await worker.terminate();
  }
}
