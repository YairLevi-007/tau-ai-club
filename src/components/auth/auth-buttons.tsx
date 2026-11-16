import { getLocale, getTranslations } from "next-intl/server";
import { LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/** Starts Google sign-in. A plain link: /api/auth/* isn't a localized route. */
export async function SignInButton({
  next = "/",
  label,
  variant = "primary",
}: {
  next?: string;
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const [t, locale] = await Promise.all([getTranslations("auth"), getLocale()]);
  const href = `/api/auth/signin?${new URLSearchParams({ locale, next })}`;
  return (
    <a href={href} className={cn("btn w-fit", variant === "primary" ? "btn-primary" : "btn-ghost")}>
      <LogIn aria-hidden className="rtl:-scale-x-100" />
      {label ?? t("signInGoogle")}
    </a>
  );
}

/** POSTs to /api/auth/signout, which clears the session cookies. Works without JS. */
export async function SignOutButton() {
  const [t, locale] = await Promise.all([getTranslations("auth"), getLocale()]);
  return (
    <form action="/api/auth/signout" method="post">
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="btn btn-ghost">
        <LogOut aria-hidden className="rtl:-scale-x-100" />
        {t("signOut")}
      </button>
    </form>
  );
}

/** Common frame for the small auth pages (login, members-only, welcome). */
export function AuthPanel({
  eyebrow,
  title,
  children,
  testId,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="mx-auto grid max-w-site gap-4 px-4 pt-16 pb-16 sm:px-8 lg:pt-24">
      {eyebrow}
      <h1 className="max-w-[24ch] text-h1 font-bold text-balance">{title}</h1>
      <div className="grid max-w-[65ch] gap-5 text-fg-muted">{children}</div>
    </section>
  );
}
