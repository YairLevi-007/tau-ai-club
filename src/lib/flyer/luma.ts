// Import an event from its public Luma page. Rule-based: Luma pages carry schema.org Event
// JSON-LD (name, startDate, endDate, location, image, description) plus OG tags.
// Pure module except for `fetchLumaPage`, which takes the fetch function as a parameter
// so tests can feed it a mocked Luma.

import { utcToWallTime } from "@/lib/wall-time";
import { emptyDraft, guessKind, hasHebrew, toBlurb, type DraftField, type ImportDraft } from "./draft";
import { findSpeakersInText, matchVenue } from "./match";

const LUMA_HOSTS = new Set(["lu.ma", "www.lu.ma", "luma.com", "www.luma.com"]);
const IMAGE_HOST = "images.lumacdn.com";

/**
 * "lu.ma/abc", "https://luma.com/abc?x=1" → "https://luma.com/abc". Null for anything that
 * isn't a plain Luma event path on an allowlisted host (no other host, port, user info or scheme).
 */
export function normalizeLumaUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!LUMA_HOSTS.has(host)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (!/^(\/[A-Za-z0-9_-]{2,80}){1,2}$/.test(path)) return null;
  return `https://${host}${path}`;
}

export type LumaFetchError = "bad_url" | "redirect" | "not_found" | "blocked" | "too_large" | "timeout" | "failed";
export type LumaFetchResult = { ok: true; url: string; html: string } | { ok: false; error: LumaFetchError };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Fetch a Luma event page with SSRF guards: allowlisted hosts only, redirects followed by hand
 * and re-checked against the allowlist (lu.ma → luma.com is fine, anything else is refused),
 * a total timeout, an HTML content type and a byte cap.
 */
export async function fetchLumaPage(
  input: string,
  { fetcher = fetch as Fetcher, timeoutMs = 8000, maxBytes = 3_000_000, maxRedirects = 3 }: { fetcher?: Fetcher; timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<LumaFetchResult> {
  let url = normalizeLumaUrl(input);
  if (!url) return { ok: false, error: "bad_url" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetcher(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; TAU-AI-Club-site event import)" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        let next: string | null = null;
        try {
          next = location ? normalizeLumaUrl(new URL(location, url).toString()) : null;
        } catch {
          next = null;
        }
        if (!next) return { ok: false, error: "redirect" };
        url = next;
        continue;
      }
      if (res.status === 404 || res.status === 410) return { ok: false, error: "not_found" };
      if (res.status === 401 || res.status === 403 || res.status === 429) return { ok: false, error: "blocked" };
      if (!res.ok) return { ok: false, error: "failed" };
      if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return { ok: false, error: "failed" };
      if (Number(res.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, error: "too_large" };
      const html = await readCapped(res, maxBytes);
      if (html === null) return { ok: false, error: "too_large" };
      return { ok: true, url, html };
    }
    return { ok: false, error: "redirect" };
  } catch {
    return { ok: false, error: ctrl.signal.aborted ? "timeout" : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) {
    const text = await res.text();
    return new TextEncoder().encode(text).length > maxBytes ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** What we keep from a Luma page. Times are ISO instants (with offset), or "". */
export type LumaEvent = {
  url: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  venue_address: string;
  image_url: string;
};

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function safeImage(v: unknown): string {
  const list = Array.isArray(v) ? v : [v];
  const urls = list
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? (x as { url?: unknown }).url : null))
    .filter((x): x is string => typeof x === "string")
    .filter((x) => {
      try {
        const u = new URL(x);
        return u.protocol === "https:" && u.hostname === IMAGE_HOST && !u.port && !u.username;
      } catch {
        return false;
      }
    });
  // The square "uploads/" cover is usually the flyer itself; the "event-social/" card is a generated preview.
  return urls.find((x) => x.includes("/uploads/")) ?? urls[0] ?? "";
}

function findEvent(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const e = findEvent(n, depth + 1);
      if (e) return e;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && /Event$/.test(t))) return o;
  return findEvent(o["@graph"], depth + 1);
}

const isIsoInstant = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s));

/** Read a Luma page's JSON-LD Event (falling back to OG tags for title/description/image). */
export function parseLumaHtml(html: string, url: string): LumaEvent | null {
  let ev: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ev = findEvent(JSON.parse(m[1]));
    } catch {
      ev = null;
    }
    if (ev) break;
  }
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=(?:"([^"]*)"|'([^']*)')/i);
    return content ? decodeEntities(content[1] ?? content[2] ?? "").trim() : "";
  };

  const loc = (ev?.location ?? null) as Record<string, unknown> | null;
  const address = loc && typeof loc === "object" ? loc.address : null;
  const addressText =
    typeof address === "string"
      ? address
      : address && typeof address === "object"
        ? ["streetAddress", "addressLocality"].map((k) => str((address as Record<string, unknown>)[k], 200)).filter(Boolean).join(", ")
        : "";
  const start = str(ev?.startDate, 40);
  const end = str(ev?.endDate, 40);
  const out: LumaEvent = {
    url,
    title: str(ev?.name, 200) || meta("og:title").replace(/\s*[·|]\s*Luma\s*$/i, "").slice(0, 200),
    description: str(ev?.description) || meta("og:description").slice(0, 5000),
    starts_at: isIsoInstant(start) ? start : "",
    ends_at: isIsoInstant(end) ? end : "",
    venue_name: loc && typeof loc === "object" && loc["@type"] !== "VirtualLocation" ? str(loc.name, 200) : "",
    venue_address: addressText.slice(0, 200),
    image_url: safeImage(ev?.image) || safeImage(meta("og:image")),
  };
  return out.title || out.starts_at ? out : null;
}

type Named = { id: string; name_he: string; name_en: string };

/** Luma event → draft for the form, matching venue and speakers against the database. */
export function lumaToDraft(ev: LumaEvent, speakers: Named[], venues: Named[]): ImportDraft {
  const d = emptyDraft("luma");
  const filled = new Set<DraftField>();
  const fill = (f: DraftField, ok: boolean) => ok && filled.add(f);

  if (hasHebrew(ev.title)) d.title_he = ev.title;
  else d.title_en = ev.title;
  fill(hasHebrew(ev.title) ? "title_he" : "title_en", !!ev.title);

  const blurb = toBlurb(ev.description);
  if (hasHebrew(blurb)) d.blurb_he = blurb;
  else d.blurb_en = blurb;
  fill(hasHebrew(blurb) ? "blurb_he" : "blurb_en", !!blurb);

  if (ev.starts_at) {
    const s = utcToWallTime(ev.starts_at);
    d.date = s.slice(0, 10);
    d.start_time = s.slice(11);
    fill("date", true);
    fill("start_time", true);
    if (ev.ends_at && Date.parse(ev.ends_at) > Date.parse(ev.starts_at)) {
      const e = utcToWallTime(ev.ends_at);
      if (e.slice(0, 10) === d.date) {
        d.end_time = e.slice(11);
        fill("end_time", true);
      } else d.hints.push({ what: "ends", text: e.replace("T", " ") });
    }
  }

  const venueText = [ev.venue_name, ev.venue_address && ev.venue_address !== ev.venue_name ? ev.venue_address : ""].filter(Boolean).join(", ");
  const venue = matchVenue(venueText, venues);
  d.venue_id = venue?.id ?? null;
  d.venue_text = venue ? "" : venueText;
  fill("venue", !!venue || !!venueText);

  d.speakers = findSpeakersInText(`${ev.title}\n${ev.description}`, speakers).map((s) => ({ id: s.id, name_he: s.name_he, name_en: s.name_en }));
  fill("speakers", d.speakers.length > 0);

  d.kind = guessKind(`${ev.title} ${ev.description.slice(0, 400)}`);
  fill("kind", !!d.kind);

  d.luma_url = ev.url;
  d.image_url = ev.image_url;
  fill("luma_url", true);
  d.filled = [...filled];
  return d;
}
