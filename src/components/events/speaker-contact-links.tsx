"use client";

import { useEffect, useState } from "react";
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
  const link = "text-brand-purple-soft underline underline-offset-4 hover:text-fg";
  return (
    <div className="mt-2" data-testid="speaker-contact">
      <p className="text-xs text-fg-subtle">{labels.title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {contact.email && (
          <li>
            <span className="sr-only">{labels.email}: </span>
            <a href={`mailto:${contact.email}`} className={link}>
              <bdi dir="ltr">{contact.email}</bdi>
            </a>
          </li>
        )}
        {contact.phone && (
          <li>
            <span className="sr-only">{labels.phone}: </span>
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className={link}>
              <bdi dir="ltr">{contact.phone}</bdi>
            </a>
          </li>
        )}
        {contact.linkedin && (
          <li>
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className={link}>
              {labels.linkedin}
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
