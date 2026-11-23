// Interactive HTML lessons (an admin uploads a self-contained HTML page per lecture: a quiz,
// a walkthrough). Pure helpers, shared by the upload action, the /api/lessons/<id> route, the
// member viewer and the tests.
//
// The uploaded HTML is UNTRUSTED. It never runs with tauaiclub.com's origin:
//   1. /api/lessons/<id> serves it with `Content-Security-Policy: sandbox allow-scripts ...`, so
//      even opened on its own it gets an opaque origin ("null"): no cookies, no site
//      localStorage, no same-origin requests; connect-src 'none' blocks fetch/XHR/WebSocket
//      to anywhere, and form-action 'none' blocks form posts.
//   2. The viewer page embeds it in <iframe sandbox="allow-scripts ...">: no allow-same-origin,
//      no allow-top-navigation, so it can't touch or navigate the page around it.
// Quiz progress still saves: LESSON_SHIM (injected first in <head>) gives the page an
// in-memory localStorage that starts from the URL fragment and reports every change to the
// parent with postMessage. The parent (LessonFrame) keeps one JSON blob per lesson in its own
// localStorage and hands it back in the fragment next time. The parent only ever stores
// strings it receives, capped in size, and never runs anything from the lesson.

/** Server Action body limit is 3 MB (next.config.ts); a lesson is usually ~300 KB. */
export const MAX_LESSON_BYTES = 3 * 1024 * 1024;
/** What one lesson may keep in the parent's localStorage (quiz answers, theme). */
export const MAX_LESSON_STATE = 200 * 1024;
/** Marks a lesson's postMessage, so the viewer ignores anything else. */
export const LESSON_MESSAGE = "tau-lesson-state";

export const lessonStateKey = (id: string) => `tau-lesson:${id}`;

/** The headers /api/lessons/<id> sends with a lesson (and with its errors). */
export const LESSON_CSP = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export function lessonHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": LESSON_CSP,
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  };
}

/** The sandbox flags for the viewer's iframe. Never add allow-same-origin or allow-top-navigation. */
export const LESSON_IFRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/**
 * The localStorage stand-in. Plain ES5, no template values: it must run before the lesson's own
 * scripts in any browser. Reads the starting state from location.hash (a JSON object of strings).
 */
export const LESSON_SHIM = `<script>(function(){var d={};try{var h=location.hash.slice(1);if(h){var o=JSON.parse(decodeURIComponent(h));if(o&&typeof o==="object")for(var k in o)if(typeof o[k]==="string")d[k]=o[k];}}catch(e){}
function mk(d,save){var has=function(k){return Object.prototype.hasOwnProperty.call(d,k)};
var m={getItem:function(k){k=String(k);return has(k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v);save(d)},removeItem:function(k){delete d[String(k)];save(d)},clear:function(){for(var k in d)delete d[k];save(d)},key:function(i){var ks=Object.keys(d);return i>=0&&i<ks.length?ks[i]:null}};
if(typeof Proxy!=="function"){try{Object.defineProperty(m,"length",{get:function(){return Object.keys(d).length}});}catch(e){}return m}
return new Proxy(m,{get:function(t,k){if(k==="length")return Object.keys(d).length;if(typeof k!=="string"||k in t)return t[k];return has(k)?d[k]:undefined},
set:function(t,k,v){if(typeof k==="string")m.setItem(k,v);return true},deleteProperty:function(t,k){m.removeItem(k);return true},has:function(t,k){return has(k)||k in t},
ownKeys:function(){return Object.keys(d)},getOwnPropertyDescriptor:function(t,k){return has(k)?{value:d[k],writable:true,enumerable:true,configurable:true}:undefined}})}
var ls=mk(d,function(x){try{if(window.parent!==window)window.parent.postMessage({type:"${LESSON_MESSAGE}",state:x},"*");}catch(e){}});
var ss=mk({},function(){});
try{Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return ls}});}catch(e){}
try{Object.defineProperty(window,"sessionStorage",{configurable:true,get:function(){return ss}});}catch(e){}})();</script>`;

/** The lesson with the shim as the first thing in <head> (or at the very top when there's no head). */
export function withLessonShim(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + LESSON_SHIM + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return doctype[0] + LESSON_SHIM + html.slice(doctype[0].length);
  return LESSON_SHIM + html;
}

/**
 * An upload that looks like a lesson: a .html file, at most MAX_LESSON_BYTES, valid UTF-8, and an
 * HTML document (starts with <!doctype html> or <html, after an optional BOM and whitespace).
 * This is about catching the wrong file, not security: the sandbox is the security boundary.
 */
export function readLessonUpload(name: string, bytes: Uint8Array): { ok: true; html: string } | { ok: false; reason: "type" | "size" } {
  if (!/\.html?$/i.test(name)) return { ok: false, reason: "type" };
  if (bytes.byteLength === 0) return { ok: false, reason: "type" };
  if (bytes.byteLength > MAX_LESSON_BYTES) return { ok: false, reason: "size" };
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "type" };
  }
  if (!/^﻿?\s*(<!doctype\s+html|<html[\s>])/i.test(html)) return { ok: false, reason: "type" };
  return { ok: true, html };
}

/** Saved state → the fragment the viewer puts on the iframe's URL. Bad or oversize state starts fresh. */
export function stateToHash(saved: string | null): string {
  if (!saved || saved.length > MAX_LESSON_STATE) return "";
  try {
    const o = JSON.parse(saved);
    if (!o || typeof o !== "object" || Array.isArray(o)) return "";
    return "#" + encodeURIComponent(JSON.stringify(o));
  } catch {
    return "";
  }
}

/** A message from the lesson → the JSON to keep, or null to ignore it (wrong shape, non-strings, too big). */
export function stateFromMessage(data: unknown): string | null {
  if (!data || typeof data !== "object" || (data as { type?: unknown }).type !== LESSON_MESSAGE) return null;
  const state = (data as { state?: unknown }).state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== "string") return null;
    clean[k] = v;
  }
  const json = JSON.stringify(clean);
  return json.length > MAX_LESSON_STATE ? null : json;
}
