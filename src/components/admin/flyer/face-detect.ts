// Crop helpers for speaker photos taken from a flyer. The faces themselves are found in
// read-flyer.ts (MediaPipe, in the admin's browser).

export type Box = { x: number; y: number; w: number; h: number };
export type Square = { x: number; y: number; size: number };

export function clampSquare(s: Square, imgW: number, imgH: number): Square {
  const size = Math.max(32, Math.min(s.size, imgW, imgH));
  return { size, x: Math.min(Math.max(0, s.x), imgW - size), y: Math.min(Math.max(0, s.y), imgH - size) };
}

/** The square as a 512×512 JPEG. */
export function cropToJpeg(img: HTMLImageElement, s: Square, out = 512): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, s.x, s.y, s.size, s.size, 0, 0, out, out);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}
