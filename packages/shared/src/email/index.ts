/**
 * CircleInbox Email Client
 *
 * Sends transactional emails via CircleInbox API
 */

interface EmailAddress {
  email: string;
  name?: string;
}

interface SendEmailOptions {
  from?: EmailAddress;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export class CircleInboxClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultFrom: EmailAddress;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    defaultFrom: EmailAddress;
  }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://circleinbox.com/api/v1';
    this.defaultFrom = options.defaultFrom;
  }

  async send(options: SendEmailOptions): Promise<SendEmailResponse> {
    // Create abort controller for timeout (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          replyTo: options.replyTo,
          tags: options.tags,
          metadata: options.metadata,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as { error?: { code: string; message: string }; messageId?: string };

      if (!response.ok) {
        return {
          success: false,
          error: data.error || { code: 'UNKNOWN', message: 'Failed to send email' },
        };
      }

      return {
        success: true,
        messageId: data.messageId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'TIMEOUT', message: 'Email request timed out' },
        };
      }

      // Handle network errors
      if (error instanceof TypeError) {
        return {
          success: false,
          error: { code: 'NETWORK_ERROR', message: 'Network error: Unable to reach email service' },
        };
      }

      // Handle other errors
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        },
      };
    }
  }

  /**
   * Send email confirmation email
   */
  async sendEmailConfirmation(email: string, confirmUrl: string): Promise<SendEmailResponse> {
    return this.send({
      to: email,
      subject: 'Confirm your Liveport account',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #0f172a; margin: 0;">Liveport</h1>
  </div>

  <h2 style="color: #0f172a;">Confirm your email address</h2>

  <p>Thanks for signing up for Liveport! Please confirm your email address by clicking the button below:</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${confirmUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
      Confirm Email
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${confirmUrl}" style="color: #0f172a;">${confirmUrl}</a>
  </p>

  <p style="color: #666; font-size: 14px;">This link expires in 24 hours.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    If you didn't create a Liveport account, you can safely ignore this email.
  </p>
</body>
</html>
      `.trim(),
      text: `Confirm your Liveport account\n\nThanks for signing up! Please confirm your email by visiting:\n${confirmUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create a Liveport account, you can safely ignore this email.`,
      tags: ['auth', 'email-confirmation'],
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, resetUrl: string): Promise<SendEmailResponse> {
    return this.send({
      to: email,
      subject: 'Reset your Liveport password',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #0f172a; margin: 0;">Liveport</h1>
  </div>

  <h2 style="color: #0f172a;">Reset your password</h2>

  <p>We received a request to reset your password. Click the button below to choose a new password:</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${resetUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
      Reset Password
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${resetUrl}" style="color: #0f172a;">${resetUrl}</a>
  </p>

  <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #999; font-size: 12px; text-align: center;">
    If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.
  </p>
</body>
</html>
      `.trim(),
      text: `Reset your Liveport password\n\nWe received a request to reset your password. Visit the link below to choose a new password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`,
      tags: ['auth', 'password-reset'],
    });
  }
}

// Singleton instance
let emailClient: CircleInboxClient | null = null;

export function getEmailClient(): CircleInboxClient {
  if (!emailClient) {
    const apiKey = process.env.CIRCLEINBOX_API_KEY;
    if (!apiKey) {
      throw new Error('CIRCLEINBOX_API_KEY environment variable is not set');
    }

    emailClient = new CircleInboxClient({
      apiKey,
      defaultFrom: {
        email: process.env.EMAIL_FROM_ADDRESS || 'noreply@liveport.dev',
        name: process.env.EMAIL_FROM_NAME || 'Liveport',
      },
    });
  }

  return emailClient;
}

export { CircleInboxClient as EmailClient };
export type { SendEmailOptions, SendEmailResponse, EmailAddress };
