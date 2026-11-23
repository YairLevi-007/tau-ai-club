import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { SpeakerAvatar, roleCapsClass } from "./flyer-bits";
import { SpeakerLinkedIn } from "./speaker-linkedin";

/**
 * One person in a "Meet our ..." grid (season speakers, club founders), after the club's
 * Instagram posts: ringed round photo, name, company, role in small caps, LinkedIn.
 * Public fields only. Server-rendered, no motion.
 * `row`: the compact form for the founders (photo at the start, text beside it), so the home page
 * doesn't show the same tall grid twice in a row.
 */
export function PersonCard({
  locale,
  name,
  photoUrl,
  company,
  role,
  linkedinUrl,
  testId,
  variant = "card",
}: {
  locale: Locale;
  name: string;
  photoUrl: string | null;
  company: string | null;
  role: string | null;
  linkedinUrl: string | null;
  testId: string;
  variant?: "card" | "row";
}) {
  if (variant === "row") {
    return (
      <li
        data-testid={testId}
        data-reveal
        className="card-light relative flex items-center gap-4 rounded-lg border border-border-accent bg-bg-raised p-4 shadow-[var(--highlight-top)]"
      >
        <SpeakerAvatar name={name} photoUrl={photoUrl} company={company} size={64} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="leading-tight font-bold text-fg">{name}</p>
          {company && (
            <p className="text-sm text-fg-muted">
              <bdi>{company}</bdi>
            </p>
          )}
          {role && <p className={roleCapsClass(locale)}>{role}</p>}
        </div>
        <SpeakerLinkedIn url={linkedinUrl} name={name} className="size-11 shrink-0" />
      </li>
    );
  }
  return (
    <li
      data-testid={testId}
      data-reveal
      className="card-light relative flex w-[calc(50%-0.375rem)] flex-col items-center rounded-lg border border-border-accent bg-bg-raised px-3 pt-6 pb-4 text-center shadow-[var(--highlight-top)] lg:w-[calc(25%-0.75rem)]"
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
