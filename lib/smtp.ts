import { env } from "cloudflare:workers";
import { smtpConfig, smtpTransaction } from "./smtp-transport";
import type { MailMessage, SmtpConnector } from "./smtp-transport";

export function directSmtpConfigured() {
  return Boolean(
    (env.SMTP_USERNAME || env.SMTP_USER) &&
    env.SMTP_PASSWORD &&
    env.SMTP_FROM_EMAIL,
  );
}
export async function smtp(message?: MailMessage) {
  const { connect } = await import("cloudflare:sockets");
  return smtpTransaction(
    connect as unknown as SmtpConnector,
    smtpConfig(env as unknown as Record<string, string | undefined>),
    message,
  );
}
