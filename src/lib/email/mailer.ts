import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * Sends the site's own emails (today: the answer to an initiative proposal) through the club's
 * Gmail, with an app password. Free, no paid service.
 *
 * The owner sets SMTP_USER and SMTP_APP_PASSWORD in Vercel (server-only env vars, never
 * NEXT_PUBLIC_*). While either is missing, nothing is sent and nothing fails: the caller carries
 * on, and the member still sees the answer on the site under "Mine". A send that fails is logged
 * without the address or any secret, and never throws.
 */

export type Mail = { to: string; subject: string; html: string; text: string };
export type SendResult = "sent" | "not-configured" | "failed";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

let transport: Transporter | null = null;

export async function sendMail(mail: Mail): Promise<SendResult> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) return "not-configured";
  try {
    transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transport.sendMail({ from: { name: "TAU AI Club", address: user }, ...mail });
    return "sent";
  } catch (e) {
    // No address, password or message body in the log: just what went wrong.
    console.error("[mail] send failed:", e instanceof Error ? e.message.replace(/\S+@\S+/g, "<address>") : "unknown error");
    transport = null;
    return "failed";
  }
}
