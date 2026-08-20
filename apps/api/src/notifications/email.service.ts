import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * EmailService — stub for sending email notifications.
 *
 * Per build-pack/02-mvp-prd.md: real email integration is deferred.
 * This stub logs the email content instead of sending it, so we can
 * verify the notification flow end-to-end without an SMTP server.
 *
 * Phase 8 will replace `send()` with a real SMTP/Nodemailer implementation.
 * The interface is stable so no consumer code needs to change.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>(
      'EMAIL_FROM',
      'no-reply@legalops.local',
    );
  }

  /**
   * Send an email. Stub implementation: logs the email content.
   *
   * In production (Phase 8), this will call Nodemailer with the
   * configured SMTP transport.
   *
   * @returns true if "sent" (stub always returns true)
   */
  async send(input: {
    to: string;
    subject: string;
    body: string;
    isHtml?: boolean;
  }): Promise<boolean> {
    this.logger.log(
      `[EMAIL STUB] To: ${input.to} | Subject: ${input.subject}\n` +
        `Body preview: ${input.body.slice(0, 200)}${input.body.length > 200 ? '…' : ''}`,
    );

    // In Phase 8, this becomes:
    // const transporter = nodemailer.createTransport({ host, port, auth });
    // await transporter.sendMail({ from: this.fromAddress, ...input });

    return true;
  }

  /**
   * Send a notification email to a user.
   * Convenience wrapper that formats the notification as an email.
   */
  async sendNotification(input: {
    to: string;
    title: string;
    body: string;
    actionUrl?: string;
  }): Promise<boolean> {
    const actionLine = input.actionUrl
      ? `\n\nView in app: ${input.actionUrl}`
      : '';
    return this.send({
      to: input.to,
      subject: input.title,
      body: `${input.body}${actionLine}`,
    });
  }
}
