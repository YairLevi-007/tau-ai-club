// Reads a PDF's text in the admin's browser with pdf.js (Mozilla's PDF reader, loaded only when a
// PDF is picked). Nothing is uploaded: the file's bytes go to a local worker and come back as
// text items. XFA forms and embedded fonts are off (pdf.js 6 never evaluates code from a PDF); only
// text is extracted.

import type { PdfTextItem } from "./luma-pdf";

const MAX_PAGES = 50;

export async function pdfTextItems(bytes: ArrayBuffer): Promise<PdfTextItem[][]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  const doc = await task.promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items.flatMap((it) => ("str" in it && it.str ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number }] : [])),
      );
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
