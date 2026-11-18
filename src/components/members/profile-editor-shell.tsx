"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { raisedPanelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

/**
 * The details in the personal area fold away (user, 18.11): a short card with photo, name and
 * an "edit" button; the form opens under it and closes again after a successful save.
 * The form stays mounted (only hidden), so nothing typed is lost when it's folded.
 */
export function ProfileEditorShell({
  summary,
  actions,
  editor,
  startOpen,
  openLabel,
  closeLabel,
}: {
  summary: React.ReactNode;
  actions: React.ReactNode;
  editor: React.ReactNode;
  startOpen: boolean;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(startOpen);
  const [saved, setSaved] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onOk = (e: Event) => {
      setSaved((e as CustomEvent<string>).detail || null);
      setOpen(false);
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    el.addEventListener("tau:action-ok", onOk);
    return () => el.removeEventListener("tau:action-ok", onOk);
  }, []);

  return (
    <div className="grid gap-5" data-testid="profile-editor">
      <section ref={cardRef} className={cn(raisedPanelClass, "grid gap-4 p-5 shadow-[var(--highlight-top)] sm:p-6")}>
        {summary}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => {
              setOpen((o) => !o);
              setSaved(null);
            }}
            className={cn("btn h-10 px-3.5 text-sm", open ? "btn-ghost" : "btn-primary")}
            data-testid="profile-edit-toggle"
          >
            {open ? <ChevronDown aria-hidden className="rotate-180" /> : <Pencil aria-hidden />}
            {open ? closeLabel : openLabel}
          </button>
          {actions}
        </div>
        {saved && (
          <p role="status" className="text-sm text-fg-muted">
            {saved}
          </p>
        )}
      </section>
      <div id={id} ref={editorRef} hidden={!open}>
        {editor}
      </div>
    </div>
  );
}
