"use client";

import { useSyncExternalStore } from "react";
import { LockKeyhole } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * The header is cached HTML, the same for everyone, so it can't know who is signed in.
 * After a member logs in, the server sets a non-HttpOnly `tau_member=1` hint cookie, and
 * these islands show the members' links. This is a UI hint, NOT access control: the
 * members' pages check membership on the server and RLS checks it in the database.
 * The server render (and any guest) gets the guest version.
 */
const subscribe = () => () => {};
const isMember = () => /(?:^|;\s*)tau_member=1(?:;|$)/.test(document.cookie);
const useMemberHint = () => useSyncExternalStore(subscribe, isMember, () => false);

export function MemberSectionLinks({
  lectures,
  workshops,
  membersOnly,
  className,
  linkClassName,
}: {
  lectures: string;
  workshops: string;
  membersOnly: string;
  className: string;
  linkClassName: string;
}) {
  const member = useMemberHint();
  if (!member) return null;
  return (
    <ul className={className} data-testid="member-section-links">
      <li>
        <Link href="/lectures" className={linkClassName}>
          {lectures}
          <LockKeyhole aria-hidden className="size-3.5 text-fg-subtle" />
          <span className="sr-only"> ({membersOnly})</span>
        </Link>
      </li>
      <li>
        <Link href="/workshops" className={linkClassName}>
          {workshops}
          <LockKeyhole aria-hidden className="size-3.5 text-fg-subtle" />
          <span className="sr-only"> ({membersOnly})</span>
        </Link>
      </li>
    </ul>
  );
}

export function MemberAction({ login, myArea, className }: { login: string; myArea: string; className: string }) {
  const member = useMemberHint();
  return member ? (
    <Link href="/me" className={className} data-testid="nav-my-area">
      {myArea}
    </Link>
  ) : (
    <Link href="/login" className={className} data-testid="nav-login">
      {login}
    </Link>
  );
}
