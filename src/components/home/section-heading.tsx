import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * A home-page section title in two parts, "אל תחכו · לסוף התואר.", with the second part in purple
 * and the brand's pixel square after it in Hebrew. One balanced line where it fits, two on a phone.
 * The leading comes after the size on purpose: cn() (tailwind-merge) drops a leading-* that sits
 * before a text-[size], which left these titles at the body's 1.7 line height.
 */
export function SectionHeading({
  id,
  locale,
  line1,
  line2,
  size = "lg",
  className,
}: {
  id: string;
  locale: Locale;
  line1: string;
  line2: string;
  size?: "lg" | "md";
  className?: string;
}) {
  const en = locale === "en";
  return (
    <h2
      id={id}
      className={cn(
        "max-w-[22ch] text-balance text-fg",
        en ? "font-pixel tracking-[0.02em] uppercase" : "font-semibold tracking-[-0.03em]",
        size === "lg"
          ? en
            ? "text-[clamp(2rem,6vw,3.5rem)]"
            : "text-[clamp(2.125rem,6.5vw,3.5rem)]"
          : en
            ? "text-[clamp(1.625rem,4.5vw,2.5rem)]"
            : "text-[clamp(1.75rem,5vw,2.625rem)]",
        en ? "leading-[1.1]" : "leading-[1.08]",
        className,
      )}
    >
      {line1}{" "}
      <span className="text-brand-purple">
        {line2}
        {!en && <span aria-hidden className="ms-[0.22em] inline-block size-[0.26em] bg-brand-purple align-[0.06em]" />}
      </span>
    </h2>
  );
}
