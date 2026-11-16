"use client";

import { useActionState, useState } from "react";
import type { ActionState, FormAction } from "@/components/admin/action-form";
import { inputClass, labelClass } from "@/components/admin/styles";

type Labels = {
  shareEmail: string;
  sharePhone: string;
  shareLinkedin: string;
  linkedinPublic: string;
  email: string;
  phone: string;
  linkedin: string;
  linkedinHint: string;
  membersOnlyNote: string;
  consent: string;
  submit: string;
  doneTitle: string;
  doneBody: string;
};

/**
 * Per-field consent: every box starts unticked, a field's input only turns on once its
 * box is ticked, and nothing is sent without the explicit consent box.
 */
export function SpeakerContactForm({ action, token, labels }: { action: FormAction; token: string; labels: Labels }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [share, setShare] = useState({ email: false, phone: false, linkedin: false });

  if (state?.ok) {
    return (
      <div role="status" data-testid="speaker-form-done" className="grid gap-2 rounded-lg border border-border-accent bg-surface p-5">
        <p className="text-h3 font-semibold text-fg">{labels.doneTitle}</p>
        <p className="text-fg-muted">{labels.doneBody}</p>
      </div>
    );
  }

  const field = (
    key: "email" | "phone" | "linkedin",
    shareLabel: string,
    inputLabel: string,
    input: React.InputHTMLAttributes<HTMLInputElement>,
    extra?: React.ReactNode,
  ) => (
    <fieldset className="grid gap-3 rounded-lg border border-border p-4">
      <legend className="sr-only">{inputLabel}</legend>
      <label className="flex items-start gap-3 text-fg">
        <input
          type="checkbox"
          name={`share_${key}`}
          checked={share[key]}
          onChange={(e) => setShare((s) => ({ ...s, [key]: e.target.checked }))}
          className="mt-1 size-4 accent-brand-purple"
        />
        {shareLabel}
      </label>
      <label className={labelClass}>
        {inputLabel}
        <input
          name={key}
          dir="ltr"
          disabled={!share[key]}
          required={share[key]}
          className={`${inputClass} disabled:opacity-50`}
          {...input}
        />
      </label>
      {extra}
    </fieldset>
  );

  return (
    <form action={formAction} aria-busy={pending} className="grid gap-4" noValidate={false}>
      <input type="hidden" name="token" value={token} />
      {field("email", labels.shareEmail, labels.email, { type: "email", autoComplete: "email", maxLength: 254 })}
      {field("phone", labels.sharePhone, labels.phone, { type: "tel", autoComplete: "tel", maxLength: 30 })}
      {field(
        "linkedin",
        labels.shareLinkedin,
        labels.linkedin,
        { type: "url", autoComplete: "url", maxLength: 200, placeholder: labels.linkedinHint, "aria-describedby": "li-hint" },
        <label className="flex items-start gap-3 text-sm text-fg-muted">
          <input type="checkbox" name="linkedin_public" disabled={!share.linkedin} className="mt-0.5 size-4 accent-brand-purple" />
          {labels.linkedinPublic}
        </label>,
      )}
      <p id="li-hint" className="text-sm text-fg-subtle">
        {labels.membersOnlyNote}
      </p>
      <label className="flex items-start gap-3 text-fg">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-brand-purple" />
        {labels.consent}
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-destructive">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-fit">
        {labels.submit}
      </button>
    </form>
  );
}
