"use client";

import { useActionState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type ActionState = { ok: boolean; message: string; link?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a Server Action, with an accessible status line. Works without
 * JS (progressive enhancement); with JS it disables itself while pending, can ask
 * for confirmation first, and resets after success.
 */
export function ActionForm({
  action,
  children,
  confirmText,
  className,
  resetOnSuccess = false,
  render,
}: {
  action: FormAction;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
  resetOnSuccess?: boolean;
  /** Extra output after the status line, e.g. a one-time link. */
  render?: (state: ActionState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    // Lets a wrapper react to a successful save (e.g. the personal area folds the form away).
    if (state?.ok) ref.current?.dispatchEvent(new CustomEvent("tau:action-ok", { bubbles: true, detail: state.message }));
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className={className}
      aria-busy={pending}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={cn("basis-full text-sm", state.ok ? "text-fg-muted" : "text-destructive")}
        >
          {state.message}
        </p>
      )}
      {render?.(state)}
    </form>
  );
}
