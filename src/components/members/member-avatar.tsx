import { initialsOf } from "@/components/events/speaker-face";
import { cn } from "@/lib/utils";

/**
 * A member's photo (a short-lived signed URL) or their initials. A plain <img>, not
 * next/image: member photos are private and must not land in the shared image cache.
 * Decorative, since the name is always written next to it.
 * Round with a soft purple ring everywhere, as in the personal area (review 19.11, item 2: it was
 * a square on a member's page and round in /me).
 */
export function MemberAvatar({
  name,
  src,
  size,
  className,
}: {
  name: string;
  src: string | null;
  size: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-purple-deeper font-bold text-fg ring-2 ring-brand-purple/40 ring-offset-2 ring-offset-bg",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
