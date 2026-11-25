"use client";

import { useActionState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { StalePageNotice, hasFile, isStalePage } from "@/components/admin/stale-page";

export type ActionState = {
  ok: boolean;
  message: string;
  link?: string;
  /** Set here, never by an action: the page is from an older deployment ("file": it carried a file). */
  stale?: "page" | "file";
} | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a Server Action, with an accessible status line. It disables itself while
 * pending, can ask for confirmation first, and resets after success. If the page is from an
 * older deployment (the site was updated after it was opened), the action no longer exists on
 * the server: instead of an error page it says "out of date, refresh" (and to choose the file
 * again when there was one). That catch runs in the browser, so these admin forms need JS.
 */
export function ActionForm({
  action,
  children,
  confirmText,
  className,
  resetOnSuccess = false,
  stayOpen = false,
  render,
}: {
  action: FormAction;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
  resetOnSuccess?: boolean;
  /** Don't tell a wrapper about the success (the personal area keeps its form open for these). */
  stayOpen?: boolean;
  /** Extra output after the status line, e.g. a one-time link. */
  render?: (state: ActionState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    try {
      return await action(prev, formData);
    } catch (e) {
      if (isStalePage(e)) return { ok: false, message: "", stale: hasFile(formData) ? "file" : "page" };
      throw e;
    }
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    // Lets a wrapper react to a successful save (e.g. the personal area folds the form away).
    if (state?.ok && !stayOpen) ref.current?.dispatchEvent(new CustomEvent("tau:action-ok", { bubbles: true, detail: state.message }));
  }, [state, resetOnSuccess, stayOpen]);

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
      {state?.stale && <StalePageNotice file={state.stale === "file"} className="basis-full" />}
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
