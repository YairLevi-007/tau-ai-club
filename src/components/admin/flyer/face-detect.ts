// Face detection in the admin's browser with MediaPipe (free, nothing is sent anywhere:
// the image never leaves the page). The library, its wasm and the model are loaded on
// demand from public CDNs, pinned to one version, only when an admin imports a flyer.

const VERSION = "1.2.3";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type Box = { x: number; y: number; w: number; h: number };
export type Square = { x: number; y: number; size: number };

type Detector = { detect(img: HTMLImageElement): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] } };
type VisionModule = {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  FaceDetector: { createFromModelPath(fileset: unknown, path: string): Promise<Detector> };
};

let detector: Promise<Detector> | null = null;
function getDetector() {
  detector ??= (async () => {
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ BUNDLE)) as VisionModule;
    const fileset = await mod.FilesetResolver.forVisionTasks(WASM);
    return mod.FaceDetector.createFromModelPath(fileset, MODEL);
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

/** Face boxes in natural image pixels, left to right. Empty on any failure. */
export async function detectFaces(img: HTMLImageElement): Promise<Box[]> {
  try {
    const d = await getDetector();
    return d
      .detect(img)
      .detections.flatMap((r) => (r.boundingBox ? [{ x: r.boundingBox.originX, y: r.boundingBox.originY, w: r.boundingBox.width, h: r.boundingBox.height }] : []))
      .sort((a, b) => a.x - b.x);
  } catch (e) {
    console.warn("[flyer] face detection unavailable", e);
    return [];
  }
}

/** A head-and-shoulders square around a face box, kept inside the image. */
export function suggestSquare(face: Box, imgW: number, imgH: number): Square {
  const size = Math.min(imgW, imgH, Math.round(Math.max(face.w, face.h) * 1.9));
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h * 0.55;
  return clampSquare({ x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), size }, imgW, imgH);
}

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

/** Big photos are shrunk before upload (Claude reads ~1.5k px anyway; Vercel caps bodies at 4.5 MB). */
export async function shrinkForUpload(file: File, img: HTMLImageElement, maxEdge = 2000): Promise<Blob> {
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  if (long <= maxEdge && file.size <= 3.5 * 1024 * 1024) return file;
  const scale = Math.min(1, maxEdge / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return blob ?? file;
}
