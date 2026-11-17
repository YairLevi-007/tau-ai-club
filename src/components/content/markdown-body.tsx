import { renderMarkdown } from "@/lib/content/markdown";
import { cn } from "@/lib/utils";

/** Reading styles for rendered Markdown: token colors only, logical properties only. */
export const markdownClass = cn(
  "max-w-[68ch] text-[1.0625rem] leading-relaxed text-fg-muted",
  "[&>*+*]:mt-4",
  "[&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-balance [&_h3]:text-fg",
  "[&_h4]:mt-6 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-fg",
  "[&_h5]:mt-5 [&_h5]:font-semibold [&_h5]:text-fg [&_h6]:mt-5 [&_h6]:font-semibold [&_h6]:text-fg",
  "[&_strong]:font-semibold [&_strong]:text-fg",
  "[&_a]:text-brand-purple-soft [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-fg",
  "[&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:ps-6 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-2 [&_ol]:ps-6",
  "[&_li]:ps-1 [&_li::marker]:text-brand-purple-soft",
  "[&_li.md-task]:-ms-6 [&_li.md-task]:list-none [&_li.md-task]:ps-0",
  "[&_li.md-task_label]:flex [&_li.md-task_label]:items-start [&_li.md-task_label]:gap-3",
  "[&_li.md-task_input]:mt-1.5 [&_li.md-task_input]:size-4 [&_li.md-task_input]:shrink-0 [&_li.md-task_input]:accent-brand-purple",
  "[&_code]:rounded-sm [&_code]:bg-surface-hover [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-fg",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-deep [&_pre]:p-4 [&_pre]:text-start",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:border-s-2 [&_blockquote]:border-border-accent [&_blockquote]:ps-4 [&_blockquote]:text-fg",
  "[&_hr]:border-border",
);

/**
 * Rendered Markdown. The renderer escapes every piece of source text and writes only its
 * own fixed tags (see lib/content/markdown.ts), so the HTML is safe to inject.
 */
export function MarkdownBody({
  source,
  lang,
  className,
  testId,
}: {
  source: string;
  /** Language of the text: sets lang and direction, e.g. Hebrew shown on an English page. */
  lang?: "he" | "en";
  className?: string;
  testId?: string;
}) {
  return (
    <div
      lang={lang}
      dir={lang ? (lang === "he" ? "rtl" : "ltr") : undefined}
      className={cn(markdownClass, className)}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
