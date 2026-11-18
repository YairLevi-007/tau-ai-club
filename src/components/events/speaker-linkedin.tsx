import { LinkedInIcon } from "@/components/site/linkedin-icon";
import { cn } from "@/lib/utils";

// Same rule as the DB check (speakers_linkedin_url_check), so a bad value never becomes a link.
const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_%-]{2,100}\/?$/;

/**
 * A speaker's public LinkedIn profile as an icon link; nothing when there is none.
 * Public profile data entered by an admin, not contact data. Server and client safe.
 */
export function SpeakerLinkedIn({ url, name, className }: { url: string | null; name: string; className?: string }) {
  if (!url || !LINKEDIN.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`LinkedIn – ${name}`}
      data-testid="speaker-linkedin"
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors duration-150 hover:bg-surface-hover hover:text-fg",
        className,
      )}
    >
      <LinkedInIcon className="size-[1.125rem]" />
    </a>
  );
}
