/**
 * Browser-only: turns any photo the browser can open (a 5MB phone photo, an iPhone HEIC)
 * into a JPEG of at most `maxSide` px, well under the 2MB upload limit. Returns the original
 * file when it's already small and in an accepted type, or null when the browser can't read it.
 */
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function shrinkImage(file: File, maxSide = 1200, quality = 0.85): Promise<File | null> {
  if (OK_TYPES.includes(file.type) && file.size <= 1024 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // PNGs with transparency get a white background in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
