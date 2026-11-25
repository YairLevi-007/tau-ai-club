import { getTranslations } from "next-intl/server";
import { Plus, X } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import {
  hintClass,
  inputClass,
  labelClass,
  smallBtn,
} from "@/components/admin/styles";
import { addLumaEmail, removeLumaEmail } from "@/app/[locale]/profile/actions";

const MAX = 3;

/**
 * "The email I use on Luma" in the personal area (25.11). The club asks members to register on
 * Luma with their site email; one who uses another can add it here so their attendance counts.
 * Only for matching Luma uploads: it never lets anyone sign in. Members only (the personal area).
 */
export async function LumaEmails({ emails }: { emails: string[] }) {
  const t = await getTranslations("profile");
  return (
    <section
      aria-labelledby="luma-heading"
      className="grid gap-3 border-t border-border pt-5"
      data-testid="luma-emails"
    >
      <div className="grid gap-1">
        <h3 id="luma-heading" className="text-base font-semibold text-fg">
          {t("lumaTitle")}
        </h3>
        <p className="max-w-[65ch] text-sm text-fg-muted">{t("lumaBody")}</p>
      </div>
      {emails.length > 0 && (
        <ul className="grid gap-2">
          {emails.map((email) => (
            <li
              key={email}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-deep/40 px-3 py-2"
              data-testid="luma-email"
            >
              <bdi
                dir="ltr"
                className="min-w-0 truncate font-mono text-sm text-fg"
              >
                {email}
              </bdi>
              <ActionForm action={removeLumaEmail} stayOpen>
                <input type="hidden" name="luma_email" value={email} />
                <button
                  type="submit"
                  className={smallBtn}
                  data-testid="luma-remove"
                >
                  <X aria-hidden />
                  {t("lumaRemove")}
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      {emails.length < MAX ? (
        <ActionForm
          action={addLumaEmail}
          resetOnSuccess
          stayOpen
          className="grid gap-2"
        >
          <label htmlFor="luma-new" className={labelClass}>
            {t("lumaAdd")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="luma-new"
              name="luma_email"
              type="email"
              dir="ltr"
              required
              maxLength={254}
              autoComplete="off"
              className={`${inputClass} min-w-0 flex-1 basis-56 text-start`}
              data-testid="luma-input"
            />
            <button
              type="submit"
              className="btn btn-primary h-10 px-4 text-sm"
              data-testid="luma-add"
            >
              <Plus aria-hidden />
              {t("lumaAddButton")}
            </button>
          </div>
          <p className={hintClass}>{t("lumaHint")}</p>
        </ActionForm>
      ) : (
        <p className={hintClass}>{t("lumaMax", { n: MAX })}</p>
      )}
    </section>
  );
}
