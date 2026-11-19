"use client";

import { useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Share, SquarePlus } from "lucide-react";
import { raisedPanelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { useHomeScreen } from "./home-screen-state";

/**
 * "The club on your home screen" card in /me (option 2, DECISIONS 19.11). Markup only: when it
 * shows and what the buttons do live in home-screen-state.ts. Look: the /me raised panel, the icon
 * lit like a real app icon, and a bottom sheet with numbered steps (design/home-screen/option-2.png).
 * Renders nothing on the server and on desktops.
 */
export function HomeScreenCard() {
  const t = useTranslations("homeScreen");
  const { mode, install, dismiss, markAdded } = useHomeScreen();
  const sheet = useRef<HTMLDialogElement>(null);

  if (mode === "hidden") return null;

  const close = () => sheet.current?.close();
  const step = (key: "step1" | "step2", Icon: typeof Share) =>
    t.rich(key, {
      b: (chunks) => <strong className="font-bold text-fg">{chunks}</strong>,
      icon: () => <Icon aria-hidden className="inline size-5 align-text-bottom text-brand-purple-soft" />,
    });

  return (
    <section
      aria-labelledby="home-screen-heading"
      className={cn(raisedPanelClass, "grid gap-4 p-5 shadow-[var(--highlight-top)] sm:p-6")}
      data-testid="home-screen-card"
      data-mode={mode}
    >
      <div className="flex items-start gap-4">
        <Image
          src="/home-screen/icon-192.png"
          alt=""
          width={56}
          height={56}
          className="size-14 shrink-0 rounded-[13px] shadow-[var(--shadow-cta-hover)] ring-1 ring-border-accent"
        />
        <div className="grid min-w-0 gap-1">
          <h2 id="home-screen-heading" className="text-lg leading-tight font-bold text-balance text-fg">
            {t("title")}
          </h2>
          <p className="text-[0.9375rem] leading-snug text-pretty text-fg-muted">{t("body")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "ios" ? (
          <button type="button" className="btn btn-primary h-11 px-4" onClick={() => sheet.current?.showModal()}>
            {t("howTo")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary h-11 px-4" onClick={install}>
            {t("install")}
          </button>
        )}
        <button type="button" className="btn btn-ghost h-11 px-3.5" onClick={dismiss}>
          {t("notNow")}
        </button>
      </div>

      {mode === "ios" && (
        <dialog
          ref={sheet}
          aria-labelledby="home-screen-sheet-heading"
          className="inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-2xl border-t border-border-accent bg-bg-raised px-5 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] text-fg shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)] backdrop:bg-bg/75"
          data-testid="home-screen-sheet"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="mx-auto grid max-w-md gap-4">
            <span aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-border-strong" />
            <div className="flex items-start gap-4">
              <Image
                src="/home-screen/icon-192.png"
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-[15px] shadow-[var(--shadow-cta-hover)] ring-1 ring-border-accent"
              />
              <div className="grid min-w-0 gap-1">
                <h2 id="home-screen-sheet-heading" className="text-xl leading-tight font-extrabold text-balance">
                  {t("sheetTitle")}
                </h2>
                <p className="leading-snug text-pretty text-fg-muted">{t("sheetBody")}</p>
              </div>
            </div>
            <ol className="grid gap-2.5">
              {([["step1", Share], ["step2", SquarePlus]] as const).map(([key, Icon], i) => (
                <li key={key} className="flex items-center gap-3 rounded-md border border-border bg-bg/60 px-3.5 py-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-sm border border-border-accent bg-brand-purple/15 font-mono text-base font-bold text-brand-purple-soft"
                  >
                    {i + 1}
                  </span>
                  <span>{step(key, Icon)}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn btn-primary h-12 w-full"
              onClick={() => {
                close();
                markAdded();
              }}
            >
              {t("gotIt")}
            </button>
            <button type="button" className="btn btn-ghost h-11 w-full border-transparent" onClick={close}>
              {t("later")}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
