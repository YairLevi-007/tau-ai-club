import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { SpeakerAvatar, roleCapsClass } from "./flyer-bits";
import { SpeakerLinkedIn } from "./speaker-linkedin";

/**
 * One person in a "Meet our ..." grid (season speakers, club founders), after the club's
 * Instagram posts: ringed round photo, name, company, role in small caps, LinkedIn.
 * Public fields only. Server-rendered, no motion.
 */
export function PersonCard({
  locale,
  name,
  photoUrl,
  company,
  role,
  linkedinUrl,
  testId,
}: {
  locale: Locale;
  name: string;
  photoUrl: string | null;
  company: string | null;
  role: string | null;
  linkedinUrl: string | null;
  testId: string;
}) {
  return (
    <li
      data-testid={testId}
      className="relative flex w-[calc(50%-0.375rem)] flex-col items-center rounded-lg border border-border-accent bg-bg-raised px-3 pt-6 pb-4 text-center shadow-[var(--highlight-top)] lg:w-[calc(25%-0.75rem)]"
    >
      <span aria-hidden className="absolute -top-px inset-x-[14%] h-[3px] rounded-b-[3px] bg-brand-purple" />
      <SpeakerAvatar name={name} photoUrl={photoUrl} company={company} size={88} />
      <p className="mt-4 leading-tight font-bold text-fg lg:text-lg">{name}</p>
      {company && (
        <p className="mt-1 text-sm text-fg-muted">
          <bdi>{company}</bdi>
        </p>
      )}
      {role && <p className={cn("mt-1.5 text-balance", roleCapsClass(locale))}>{role}</p>}
      <SpeakerLinkedIn url={linkedinUrl} name={name} className="mt-2" />
    </li>
  );
}
