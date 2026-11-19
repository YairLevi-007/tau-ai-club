"use client";

import { startTransition, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { memberNextEvent } from "./member-next-event-action";

// Same hint as the header's member links (src/components/site/member-nav.tsx): a non-HttpOnly
// `tau_member=1` cookie set at login. It only decides whether to ask; the server decides what to show.
const subscribe = () => () => {};
const hasMemberHint = () => /(?:^|;\s*)tau_member=1(?:;|$)/.test(document.cookie);

/**
 * The home page's slot for the members' Next event card (design review item 5).
 *
 * The server render, and every guest, gets `children` (what guests see today), so the cached
 * HTML holds no schedule. In a browser with the member hint, it asks the server once for the
 * card (`memberNextEvent`, which checks membership in the database) and shows it in place of
 * `children`. The card itself is server-rendered and has no entrance animation. A non-member,
 * an error, or no answer leaves `children` as they are. Guests send no request at all.
 */
export function MemberNextEvent({ children }: { children?: ReactNode }) {
  const member = useSyncExternalStore(subscribe, hasMemberHint, () => false);
  const locale = useLocale();
  const [card, setCard] = useState<ReactNode>(null);

  useEffect(() => {
    if (!member) return;
    let live = true;
    startTransition(async () => {
      try {
        const result = await memberNextEvent(locale);
        if (live && result) startTransition(() => setCard(result));
      } catch {
        // Keep the guest view.
      }
    });
    return () => {
      live = false;
    };
  }, [member, locale]);

  return card ?? children;
}
