import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { loc } from "@/lib/event-format";
import { INITIATIVE_CATEGORIES, type Initiative } from "@/lib/initiatives";
import { ActionForm, type FormAction } from "@/components/admin/action-form";
import { hintClass, inputClass, labelClass, raisedPanelClass, smallBtn } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

/**
 * Propose an initiative, or edit one that's waiting or was returned. Written in the page's
 * language (the other language falls back to it). An admin's goes up at once as the club's, so an
 * admin isn't asked which kind it is.
 */
export async function InitiativeForm({
  action,
  locale,
  isAdmin,
  initiative,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  locale: Locale;
  isAdmin: boolean;
  initiative?: Initiative;
  /** The admin's edit of a published initiative: "Save" and back to the admin tab. */
  submitLabel?: string;
  cancelHref?: string;
}) {
  const t = await getTranslations("initiatives");
  const i = initiative;
  const kind = i?.proposed_kind ?? "member";
  const radio = "size-4 accent-brand-purple";
  return (
    <ActionForm action={action} className={cn(raisedPanelClass, "grid gap-5 p-5 sm:p-6")}>
      {i && <input type="hidden" name="id" value={i.id} />}
      {!isAdmin && (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium text-fg-muted">{t("kindLabel")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2 text-fg">
              <input type="radio" name="proposed_kind" value="member" defaultChecked={kind === "member"} className={radio} />
              {t("kindMemberOption")}
            </label>
            <label className="inline-flex items-center gap-2 text-fg">
              <input type="radio" name="proposed_kind" value="club" defaultChecked={kind === "club"} className={radio} />
              {t("kindClubOption")}
            </label>
          </div>
          <p className={hintClass}>{t("kindHint")}</p>
        </fieldset>
      )}
      <label className={labelClass}>
        {t("categoryLabel")}
        <select name="category" defaultValue={i?.category ?? "project"} className={cn(inputClass, "sm:w-64")}>
          {INITIATIVE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {t("titleLabel")}
        <input name="title" required maxLength={120} defaultValue={i ? (loc(i, "title", locale) ?? "") : ""} className={inputClass} />
      </label>
      <label className={labelClass}>
        {t("summaryLabel")}
        <textarea
          name="summary"
          rows={5}
          maxLength={3000}
          defaultValue={i ? (loc(i, "summary", locale) ?? "") : ""}
          aria-describedby="summary-hint"
          className={cn(inputClass, "h-auto py-2 leading-relaxed")}
        />
        <span id="summary-hint" className={hintClass}>
          {t("summaryHint")}
        </span>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          {t("whenLabel")}
          <input name="when" maxLength={120} defaultValue={i?.when_text ?? ""} aria-describedby="when-hint" className={inputClass} />
          <span id="when-hint" className={hintClass}>
            {t("whenHint")}
          </span>
        </label>
        <label className={labelClass}>
          {t("whereLabel")}
          <input name="where" maxLength={120} defaultValue={i?.where_text ?? ""} className={inputClass} />
        </label>
        <label className={labelClass}>
          {t("spotsLabel")}
          <input
            name="spots"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            defaultValue={i?.spots ?? ""}
            aria-describedby="spots-hint"
            className={cn(inputClass, "sm:w-40")}
          />
          <span id="spots-hint" className={hintClass}>
            {t("spotsHint")}
          </span>
        </label>
        <label className={labelClass}>
          {t("untilLabel")}
          <input
            name="signup_until"
            type="date"
            defaultValue={i?.signup_until ?? ""}
            aria-describedby="until-hint"
            className={cn(inputClass, "sm:w-48")}
          />
          <span id="until-hint" className={hintClass}>
            {t("untilHint")}
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <button type="submit" className="btn btn-primary h-11 w-full px-6 sm:w-fit" data-testid="submit">
          {submitLabel ?? (isAdmin ? t("submitAdmin") : i ? t("resend") : t("submit"))}
        </button>
        <Link href={cancelHref ?? { pathname: "/initiatives", query: i ? { filter: "mine" } : {} }} className={cn(smallBtn, "w-full sm:w-fit")}>
          {t("cancel")}
        </Link>
      </div>
    </ActionForm>
  );
}
