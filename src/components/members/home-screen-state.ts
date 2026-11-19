"use client";

import { useSyncExternalStore } from "react";

/**
 * Logic for the /me "home screen" card (option 2, approved by the user 19.11, docs/DECISIONS.md).
 * No markup here, so the designer can restyle home-screen-card.tsx freely.
 *
 * The card shows only:
 * - on a phone (iPhone, or Android with a mobile browser),
 * - in the browser, never when the club was opened from its icon (display-mode standalone),
 * - until the member adds it or taps "not now" (remembered on this device).
 *
 * iPhone: a site can't add itself, so the card opens a two-step explainer. Safari never tells
 * the site whether the icon was added, so "got it" in the explainer counts as added.
 * Android: the card appears only once Chrome has offered the install (beforeinstallprompt,
 * caught early by a script in the locale layout), and its button opens Chrome's own window.
 */

export type HomeScreenMode = "hidden" | "ios" | "android";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __tauInstallPrompt?: InstallPromptEvent | null;
  }
}

const STORAGE_KEY = "tau-home-screen"; // "added" | "dismissed"
const CHANGE = "tau:homescreen";
let memoryChoice: string | null = null; // when storage is blocked (private mode)

function storedChoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryChoice;
  } catch {
    return memoryChoice;
  }
}

function remember(choice: "added" | "dismissed") {
  memoryChoice = choice;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode: the in-memory value hides the card for this visit.
  }
  dispatchEvent(new Event(CHANGE));
}

/** "ios" | "android" for phones, null for everything else. Exported for tests. */
export function phonePlatform(ua: string): "ios" | "android" | null {
  // In-app browsers (Instagram, Facebook, LINE) can't add to the home screen.
  if (/FBAN|FBAV|Instagram|Line\//.test(ua)) return null;
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua) && /Mobile/.test(ua)) return "android";
  return null;
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches
  );
}

function snapshot(): HomeScreenMode {
  const platform = phonePlatform(navigator.userAgent);
  if (!platform || isStandalone() || storedChoice()) return "hidden";
  if (platform === "android") return window.__tauInstallPrompt ? "android" : "hidden";
  return "ios";
}

function subscribe(onChange: () => void) {
  const standalone = matchMedia("(display-mode: standalone)");
  const onInstalled = () => remember("added");
  addEventListener(CHANGE, onChange);
  addEventListener("tau:installprompt", onChange);
  addEventListener("storage", onChange);
  addEventListener("appinstalled", onInstalled);
  standalone.addEventListener("change", onChange);
  return () => {
    removeEventListener(CHANGE, onChange);
    removeEventListener("tau:installprompt", onChange);
    removeEventListener("storage", onChange);
    removeEventListener("appinstalled", onInstalled);
    standalone.removeEventListener("change", onChange);
  };
}

/** Opens Chrome's install window. The event can be used once, so it's cleared either way. */
async function install() {
  const prompt = window.__tauInstallPrompt;
  if (!prompt) return;
  window.__tauInstallPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === "accepted") remember("added");
  else dispatchEvent(new Event(CHANGE)); // hides the card until Chrome offers again
}

export function useHomeScreen() {
  // The server (and the first client render) never shows the card, so there's no flash.
  const mode = useSyncExternalStore(subscribe, snapshot, () => "hidden" as const);
  return {
    mode,
    install,
    /** "Not now". */
    dismiss: () => remember("dismissed"),
    /** iPhone explainer: "got it" (Safari can't tell us whether the icon was added). */
    markAdded: () => remember("added"),
  };
}
