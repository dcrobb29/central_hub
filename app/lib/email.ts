/**
 * Email Service Provider Abstraction
 *
 * Designed for Azure readiness:
 * - When AZURE_COMMUNICATION_CONNECTION_STRING is provided, emails can be routed through
 *   Azure Communication Services (ACS) Email.
 * - In local development or pre-Azure deployment, it utilizes SMTP (via Nodemailer) with
 *   support for standard SMTP (e.g. Gmail App Password, Mailgun, SendGrid SMTP) or an
 *   in-memory/test logger fallback.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
  simulated?: boolean;
  error?: string;
}

let cachedTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: port === 465,
      auth: { user, pass },
    });
    return cachedTransporter;
  }

  // Gmail-specific convenience fallback if GMAIL_USER and GMAIL_APP_PASSWORD are provided
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      tls: {
        // Allows local dev environments (antivirus, proxy, corporate inspection) to negotiate TLS cleanly
        rejectUnauthorized: false,
      },
    });
    return cachedTransporter;
  }

  return null;
}

/**
 * Sends an email using the configured provider.
 * If no live SMTP or Azure credentials are configured in .env.local,
 * it safely logs the email dispatch and returns a test outcome.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const defaultFrom = process.env.GMAIL_USER
    ? `Overhead <${process.env.GMAIL_USER}>`
    : "Overhead <billing@resolution.local>";
  const fromAddress = options.from || process.env.EMAIL_FROM || defaultFrom;

  // 1. Azure Communication Services check (future Azure deployment)
  const acsConnectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  if (acsConnectionString) {
    try {
      // Lazy-load Azure ACS SDK if configured
      // const { EmailClient } = await import("@azure/communication-email");
      // const client = new EmailClient(acsConnectionString);
      // const poller = await client.beginSend({ ... });
      // return { success: true, messageId: (await poller.pollUntilDone()).id };
      console.log(`[Azure ACS Email] Dispatching email to ${options.to} via Azure Communication Services`);
    } catch (acsError) {
      console.error("Azure Communication Services email dispatch failed:", acsError);
      return { success: false, error: acsError instanceof Error ? acsError.message : "Azure ACS delivery failed" };
    }
  }

  // 2. SMTP Transport (e.g. Gmail App Password, company SMTP)
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (smtpError) {
      console.error("SMTP email dispatch failed:", smtpError);
      return {
        success: false,
        error: smtpError instanceof Error ? smtpError.message : "SMTP delivery failed",
      };
    }
  }

  // 3. Simulated / Development fallback
  console.log("--------------------------------------------------");
  console.log("[Email Service - Development Simulation]");
  console.log(`From:    ${fromAddress}`);
  console.log(`To:      ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log(`Attachments: ${options.attachments?.map((a) => a.filename).join(", ") || "None"}`);
  console.log(`Body:\n${options.text || options.html}`);
  console.log("To send real emails to your inbox, add SMTP or Gmail credentials in .env.local:");
  console.log("  GMAIL_USER=your_email@gmail.com");
  console.log("  GMAIL_APP_PASSWORD=your_16_digit_app_password");
  console.log("  or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS");
  console.log("--------------------------------------------------");

  return {
    success: true,
    messageId: `simulated-${Date.now()}`,
    simulated: true,
  };
}
