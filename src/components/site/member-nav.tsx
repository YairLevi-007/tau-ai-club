"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { viewerIsAdmin } from "./admin-nav-action";

/**
 * The header is cached HTML, the same for everyone, so it can't know who is signed in.
 * After a member logs in, the server sets a non-HttpOnly `tau_member=1` hint cookie, and
 * these islands show the members' links. This is a UI hint, NOT access control: the
 * members' pages check membership on the server and RLS checks it in the database.
 * The server render (and any guest) gets the guest version. No padlocks here: the person
 * who sees these links can open them (the guest preview with locks is the auth-off header).
 */
const subscribe = () => () => {};
const isMember = () => /(?:^|;\s*)tau_member=1(?:;|$)/.test(document.cookie);
const useMemberHint = () => useSyncExternalStore(subscribe, isMember, () => false);

export function MemberSectionLinks({
  lessons,
  initiatives,
  admin,
  className,
  linkClassName,
}: {
  lessons: string;
  initiatives: string;
  /** Label of the admins' own link (DECISIONS 25.11); shown only after the server says so. */
  admin: string;
  className: string;
  linkClassName: string;
}) {
  const member = useMemberHint();
  if (!member) return null;
  return (
    <ul className={className} data-testid="member-section-links">
      <li>
        <Link href="/learn" className={linkClassName}>
          {lessons}
        </Link>
      </li>
      <li>
        <Link href="/initiatives" className={linkClassName}>
          {initiatives}
        </Link>
      </li>
      <AdminNavItem label={admin} className={linkClassName} />
    </ul>
  );
}

/**
 * "ניהול / Admin", for admins only (DECISIONS 25.11). The member hint only decides whether to
 * ask; the server answers from the database whether this viewer is an admin. Members, guests,
 * a forged hint cookie, an error or no answer: no link. The header stays mounted across
 * client-side navigation, so this asks once per page load.
 */
function AdminNavItem({ label, className }: { label: string; className: string }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let live = true;
    viewerIsAdmin()
      .then((yes) => {
        if (live) setAdmin(yes === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!admin) return null;
  return (
    <li>
      <Link href="/admin" className={className} data-testid="nav-admin">
        <ShieldCheck aria-hidden className="size-4 text-brand-purple-soft" />
        {label}
      </Link>
    </li>
  );
}

/**
 * "Member log in" for guests, "My area" after a member logs in. Used in the header and, with its
 * own test ids, in the home hero and the bottom band (so the header's ids stay unique on the page).
 */
export function MemberAction({
  login,
  myArea,
  className,
  memberClassName,
  loginTestId = "nav-login",
  myAreaTestId = "nav-my-area",
}: {
  login: string;
  myArea: string;
  /** Guest link classes (and the member link's, unless memberClassName is set). */
  className: string;
  memberClassName?: string;
  loginTestId?: string;
  myAreaTestId?: string;
}) {
  const member = useMemberHint();
  return member ? (
    <Link href="/me" className={memberClassName ?? className} data-testid={myAreaTestId}>
      {myArea}
    </Link>
  ) : (
    <Link href="/login" className={className} data-testid={loginTestId}>
      {login}
    </Link>
  );
}
