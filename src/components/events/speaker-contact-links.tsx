"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Link2, LockKeyhole, Mail, Phone } from "lucide-react";
import type { SpeakerContact, SpeakerContacts } from "@/app/api/events/[slug]/speaker-contacts/route";

// One request per page, shared by every speaker on it.
const requests = new Map<string, Promise<SpeakerContacts>>();
function load(slug: string) {
  let p = requests.get(slug);
  if (!p) {
    p = fetch(`/api/events/${encodeURIComponent(slug)}/speaker-contacts`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { contacts: {} }))
      .then((j: { contacts?: SpeakerContacts }) => j.contacts ?? {})
      .catch(() => ({}));
    requests.set(slug, p);
  }
  return p;
}

export type ContactLabels = { title: string; email: string; phone: string; linkedin: string };

/**
 * Members-only contact links for one speaker. The event page is cached HTML that is the
 * same for everyone, so the details are fetched after load from a no-store endpoint
 * that returns nothing to guests. Renders nothing until (and unless) there is data.
 */
export function SpeakerContactLinks({ slug, speakerId, labels }: { slug: string; speakerId: string; labels: ContactLabels }) {
  const [contact, setContact] = useState<SpeakerContact | null>(null);
  useEffect(() => {
    let live = true;
    load(slug).then((all) => {
      if (live) setContact(all[speakerId] ?? null);
    });
    return () => {
      live = false;
    };
  }, [slug, speakerId]);

  if (!contact) return null;
  // Chips, so a long email never breaks the card; icons carry the field, the sr-only label names it.
  const chip =
    "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-bg-deep/45 px-2.5 py-1.5 text-sm text-fg transition-colors duration-150 hover:border-border-accent";
  const icon = "size-3.5 shrink-0 text-brand-purple-soft";
  return (
    <div className="mt-3 border-t border-border pt-3" data-testid="speaker-contact">
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
        {labels.title}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {contact.email && (
          <li className="min-w-0">
            <a href={`mailto:${contact.email}`} className={chip}>
              <Mail aria-hidden className={icon} />
              <span className="sr-only">{labels.email}: </span>
              <bdi dir="ltr" className="truncate">
                {contact.email}
              </bdi>
            </a>
          </li>
        )}
        {contact.phone && (
          <li>
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={chip}>
              <Phone aria-hidden className={icon} />
              <span className="sr-only">{labels.phone}: </span>
              <bdi dir="ltr" className="font-mono text-[0.8125rem]">
                {contact.phone}
              </bdi>
            </a>
          </li>
        )}
        {contact.linkedin && (
          <li>
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className={chip}>
              <Link2 aria-hidden className={icon} />
              {labels.linkedin}
              <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-fg-subtle rtl:-scale-x-100" />
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
