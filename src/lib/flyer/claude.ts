import "server-only";
import type { ExtractResult, FlyerType } from "./extract";

// TEMPORARY stub: @anthropic-ai/sdk isn't installed yet (pnpm is blocked on this machine).
// The real implementation replaces this file once the dependency is added.
export async function extractWithClaude(bytes: Uint8Array, type: FlyerType): Promise<ExtractResult> {
  void bytes;
  void type;
  console.warn("[flyer] live mode needs @anthropic-ai/sdk; not installed yet");
  return { ok: false, error: "not_configured" };
}
