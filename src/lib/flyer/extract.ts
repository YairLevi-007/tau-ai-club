import "server-only";
import { IS_PRODUCTION } from "@/config/site";
import { MOCK_EXTRACTION, type FlyerExtraction } from "./schema";

export type FlyerMode = "live" | "mock" | "off";

export const FLYER_MAX_BYTES = 10 * 1024 * 1024;
export const FLYER_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export type FlyerType = (typeof FLYER_TYPES)[number];

/**
 * live: ANTHROPIC_API_KEY is set (server env only).
 * mock: FLYER_MOCK=1 outside production; returns a fixed sample, costs nothing.
 * off:  neither; the admin UI says "flyer reading isn't set up yet" and manual entry works.
 */
export function flyerMode(): FlyerMode {
  if (process.env.FLYER_MOCK === "1" && !IS_PRODUCTION) return "mock";
  return process.env.ANTHROPIC_API_KEY ? "live" : "off";
}

/** True when the bytes really start like the claimed type. */
export function sniffFlyer(type: string, b: Uint8Array): type is FlyerType {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b[0] === 0x89 && ascii(1, 4) === "PNG";
  if (type === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (type === "application/pdf") return ascii(0, 5) === "%PDF-";
  return false;
}

export type ExtractResult =
  | { ok: true; extraction: FlyerExtraction }
  | { ok: false; error: "not_configured" | "refused" | "truncated" | "invalid_output" | "api_error" };

export async function extractFlyer(bytes: Uint8Array, type: FlyerType): Promise<ExtractResult> {
  const mode = flyerMode();
  if (mode === "mock") {
    console.info("[flyer] mock extraction", { type, bytes: bytes.byteLength, usage: { input_tokens: 0, output_tokens: 0 } });
    return { ok: true, extraction: MOCK_EXTRACTION };
  }
  if (mode === "off") return { ok: false, error: "not_configured" };
  const { extractWithClaude } = await import("./claude");
  return extractWithClaude(bytes, type);
}
