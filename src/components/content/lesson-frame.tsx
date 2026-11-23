"use client";

import { useEffect, useRef } from "react";
import { LESSON_IFRAME_SANDBOX, lessonStateKey, stateFromMessage, stateToHash } from "@/lib/content/lesson";

/**
 * An interactive lesson in a sandboxed frame (src/lib/content/lesson.ts says why it's safe).
 * The lesson's saved answers live here, in this page's localStorage, one JSON blob per lesson:
 * handed to the frame in the URL fragment, and updated from its postMessage reports. Only
 * messages from this frame, in the right shape and size, are kept; nothing from the lesson runs here.
 */
export function LessonFrame({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(lessonStateKey(id));
    } catch {}
    const onMessage = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const json = stateFromMessage(e.data);
      if (json === null) return;
      try {
        window.localStorage.setItem(lessonStateKey(id), json);
      } catch {}
    };
    window.addEventListener("message", onMessage);
    // The src is set here, after the listener: the saved state is in this browser only, never in the HTML.
    if (ref.current) ref.current.src = `/api/lessons/${id}${stateToHash(saved)}`;
    return () => window.removeEventListener("message", onMessage);
  }, [id]);

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox={LESSON_IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      allow="fullscreen 'none'; camera 'none'; microphone 'none'; geolocation 'none'"
      className="block h-[calc(100dvh-11rem)] min-h-[28rem] w-full rounded-lg border border-border-accent bg-bg-raised"
      data-testid="lesson-frame"
    />
  );
}
