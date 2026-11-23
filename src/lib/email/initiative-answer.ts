import "server-only";
import { getTranslations } from "next-intl/server";
import { SITE_URL } from "@/config/site";
import type { Mail } from "./mailer";

/**
 * The email a member gets when an admin answers their initiative proposal: published (as the
 * club's or as theirs), returned with a note, or not approved. Hebrew first, then English, as in
 * design/email/code-email.html. The wording lives in messages/{he,en}.json ("initiativeEmail").
 *
 * Everything the member or the admin wrote (title, note) is escaped: plain text only, no links
 * or markup from them (security review F3). The colours are written out because email clients
 * can't read CSS variables; they're the brand tokens from src/app/tokens.css.
 */

export type Answer = "published" | "published_club" | "returned" | "rejected";

const C = { bg: "#0B0A1F", card: "#120B3A", border: "#2A2540", fg: "#F6F4FF", muted: "#CFC8F0", subtle: "#9C93C9", faint: "#5B5575", soft: "#A970FF", purple: "#8A2BFF", onPurple: "#FFFFFF" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function initiativeAnswerMail({
  to,
  answer,
  title,
  note,
  id,
}: {
  to: string;
  answer: Answer;
  title: string;
  note: string | null;
  id: string;
}): Promise<Mail> {
  const [he, en] = await Promise.all([
    getTranslations({ locale: "he", namespace: "initiativeEmail" }),
    getTranslations({ locale: "en", namespace: "initiativeEmail" }),
  ]);
  const path = answer === "returned" ? `/initiatives/${id}/edit` : answer === "rejected" ? "/initiatives?filter=mine" : `/initiatives/${id}`;
  const url = { he: `${SITE_URL}${path}`, en: `${SITE_URL}/en${path}` };
  const n = note?.trim() || null;

  const block = (t: typeof he, lang: "he" | "en") => {
    const dir = lang === "he" ? "rtl" : "ltr";
    const align = lang === "he" ? "right" : "left";
    return `
      <tr><td dir="${dir}" lang="${lang}" align="${align}" style="padding:20px 32px 0;color:${C.fg}">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:${lang === "he" ? "0" : "2px"};color:${C.soft}">■ ${esc(t("eyebrow"))}</p>
        <h1 style="margin:0 0 12px;font-size:${lang === "he" ? "24px" : "20px"};line-height:1.3;color:${C.fg}">${esc(t(`heading.${answer}`))}</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.muted}">${esc(t(`body.${answer}`))}</p>
        <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${C.fg}"><b><bdi>${esc(title)}</bdi></b></p>
        ${n ? `<p style="margin:0 0 12px;padding:12px 14px;border-${align === "right" ? "right" : "left"}:2px solid ${C.purple};background:${C.bg};font-size:15px;line-height:1.6;color:${C.muted}"><b style="color:${C.fg}">${esc(t("noteLabel"))}</b> <bdi>${esc(n)}</bdi></p>` : ""}
        <p style="margin:16px 0 20px"><a href="${esc(url[lang])}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${C.purple};color:${C.onPurple};font-size:15px;font-weight:bold;text-decoration:none">${esc(t(`cta.${answer}`))}</a></p>
      </td></tr>`;
  };

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};padding:32px 12px;font-family:Arial,Helvetica,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${C.card};border:1px solid ${C.border};border-radius:16px">
      <tr><td align="center" style="padding:32px 24px 0"><img src="${SITE_URL}/brand/logo.png" width="104" height="64" alt="TAU AI Club" style="display:block;border:0"></td></tr>
      ${block(he, "he")}
      <tr><td style="padding:0 32px"><div style="height:1px;background:${C.border};line-height:1px">&nbsp;</div></td></tr>
      ${block(en, "en")}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${C.faint}"><a href="${SITE_URL}" style="color:${C.soft};text-decoration:none">${esc(SITE_URL.replace(/^https?:\/\//, ""))}</a> · Tel Aviv University AI Club</p>
  </td></tr>
</table>`;

  const textBlock = (t: typeof he, lang: "he" | "en") =>
    [t(`heading.${answer}`), t(`body.${answer}`), `"${title}"`, n ? `${t("noteLabel")} ${n}` : null, `${t(`cta.${answer}`)}: ${url[lang]}`]
      .filter(Boolean)
      .join("\n");

  return {
    to,
    subject: `${he(`subject.${answer}`)} · ${en(`subject.${answer}`)}`,
    html,
    text: `${textBlock(he, "he")}\n\n---\n\n${textBlock(en, "en")}\n`,
  };
}
