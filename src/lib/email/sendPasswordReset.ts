/**
 * Password-reset email via Resend.
 */

import { sendResendEmail, siteOrigin, type ResendSendResult } from "@/lib/email/sendResend";

export type ResetSendResult = ResendSendResult;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail(input: {
  to: string;
  token: string;
  name?: string;
}): Promise<ResetSendResult> {
  const to = input.to.trim().toLowerCase();
  const origin = siteOrigin();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(input.token)}`;
  const name = input.name?.trim() || to.split("@")[0] || "explorer";
  const subject = "Reset your OVERLANDCOIN password";
  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset the password on your OVERLANDCOIN profile.",
    "This link expires in one hour and can be used once:",
    "",
    resetUrl,
    "",
    "If you did not ask for this, you can ignore this email — your password stays the same.",
    "",
    "The OVERLANDCOIN team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0b1220;font-family:Georgia,Times,'Times New Roman',serif;color:#e8eef8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121a2b;border:1px solid #2a3550;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d4b36a;">OVERLANDCOIN</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#fff;">Reset your password</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">
                  Use the button below to choose a new password. The link expires in one hour and works only once.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#d4b36a;color:#1a1408;text-decoration:none;border-radius:8px;font-weight:600;">Choose a new password</a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#9aacbf;">If you did not request this, ignore the email — nothing changes.<br/>The OVERLANDCOIN team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendResendEmail({ to, subject, html, text });
}

export { mailConfigured as passwordResetConfigured } from "@/lib/email/sendResend";
