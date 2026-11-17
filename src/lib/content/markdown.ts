/**
 * A tiny, safe Markdown renderer for lecture and workshop content (no npm package).
 *
 * Safe by construction: every piece of source text is HTML-escaped, and the only markup
 * that comes out is a fixed set of tags this file writes itself (no attributes from the
 * source except a link's href, which must be http(s), mailto, a site path or #anchor,
 * and is escaped too). Raw HTML in the source is shown as text, never parsed.
 *
 * Supported: # headings, paragraphs, - / * / 1. lists, - [ ] / - [x] checklists,
 * > quotes, ``` code blocks, `code`, **bold**, *italic* / _italic_, [links](https://…), ---.
 * Pure and dependency-free: used by the server pages and the admin preview alike.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Only these link targets survive; anything else (javascript:, data:, //host) renders as text. */
export function safeHref(raw: string): string | null {
  const u = raw.trim();
  if (/^https?:\/\/[^\s<>"'`]+$/i.test(u)) return u;
  if (/^mailto:[^\s<>"'`]+@[^\s<>"'`]+$/i.test(u)) return u;
  if (/^\/(?![/\\])[^\s<>"'`]*$/.test(u)) return u;
  if (/^#[\w-]+$/.test(u)) return u;
  return null;
}

function emphasis(escaped: string) {
  return escaped
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?![\w])/g, "$1<em>$2</em>");
}

/** Inline markup for one block of text: code spans, links, bold, italic. */
export function renderInline(text: string): string {
  let out = "";
  // Code spans first: their content is literal.
  for (const part of text.split(/(`[^`\n]+`)/)) {
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      out += `<code dir="ltr">${escapeHtml(part.slice(1, -1))}</code>`;
      continue;
    }
    let last = 0;
    for (const m of part.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
      out += emphasis(escapeHtml(part.slice(last, m.index)));
      const href = safeHref(m[2]);
      const label = emphasis(escapeHtml(m[1]));
      if (href) {
        const external = /^(https?:|mailto:)/i.test(href);
        out += `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
      } else {
        out += label;
      }
      last = (m.index ?? 0) + m[0].length;
    }
    out += emphasis(escapeHtml(part.slice(last)));
  }
  return out;
}

type ListKind = "ul" | "ol";

/**
 * Render Markdown to HTML. `baseLevel` is the tag for "#" and "##" (the page already has
 * an h1 and a section h2, so content headings start at h3 by default).
 */
export function renderMarkdown(src: string, { baseLevel = 3 }: { baseLevel?: number } = {}): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${renderInline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.kind}>${list.items.join("")}</${list.kind}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      flushAll();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) code.push(lines[i]);
      html.push(`<pre dir="ltr"><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!trimmed) {
      flushAll();
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (h) {
      flushAll();
      const level = Math.min(6, Math.max(baseLevel, h[1].length + baseLevel - 2));
      html.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      continue;
    }
    const q = /^>\s?(.*)$/.exec(trimmed);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ol = /^\d{1,3}[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      flushPara();
      flushQuote();
      const kind: ListKind = ul ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      if (!list) list = { kind, items: [] };
      const body = (ul ?? ol)![1];
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(body);
      list.items.push(
        task
          ? `<li class="md-task"><label><input type="checkbox" disabled${task[1] === " " ? "" : " checked"}> <span>${renderInline(task[2])}</span></label></li>`
          : `<li>${renderInline(body)}</li>`,
      );
      continue;
    }
    // A continuation line of a list item (indented) joins the last item.
    if (list && /^\s{2,}\S/.test(line)) {
      const items: string[] = list.items;
      items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, ` ${renderInline(trimmed)}</li>`);
      continue;
    }
    flushList();
    flushQuote();
    para.push(trimmed);
  }
  flushAll();
  return html.join("\n");
}

/** Plain text of a Markdown snippet (for meta descriptions and previews): no markup at all. */
export function markdownToText(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d{1,3}[.)])\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
