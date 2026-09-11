/**
 * Welcome email via Resend.
 */

import {
  RESEND_TEST_FROM,
  sendResendEmail,
  siteOrigin,
  type ResendSendResult,
} from "@/lib/email/sendResend";

export type WelcomeSendResult = ResendSendResult;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function welcomeCopy(name: string, origin: string) {
  const mapUrl = `${origin}/map`;
  const presaleUrl = `${origin}/presale`;
  const dashboardUrl = `${origin}/dashboard`;
  const subject = "Welcome to OVERLANDCOIN";
  const text = [
    `Hi ${name},`,
    "",
    "Welcome to OVERLANDCOIN — adventure powered, location rewarded.",
    "Your profile is ready. Here’s a quick start:",
    "",
    `Quest Map: ${mapUrl}`,
    `Presale: ${presaleUrl}`,
    `Dashboard: ${dashboardUrl}`,
    "",
    "Hit the trail, check in at waypoints, and keep an eye on the live batch.",
    "",
    "See you out there,",
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
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#fff;">Welcome to OVERLANDCOIN</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">
                  Adventure powered. Location rewarded. Your profile is ready — come explore the map, join the live presale batch, and keep your dashboard handy.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${mapUrl}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;background:#d4b36a;color:#1a1408;text-decoration:none;border-radius:8px;font-weight:600;">Quest Map</a>
                  <a href="${presaleUrl}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border:1px solid #d4b36a;color:#d4b36a;text-decoration:none;border-radius:8px;font-weight:600;">Presale</a>
                  <a href="${dashboardUrl}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border:1px solid #d4b36a;color:#d4b36a;text-decoration:none;border-radius:8px;font-weight:600;">Dashboard</a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#9aacbf;">See you on the trail.<br/>The OVERLANDCOIN team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export async function sendWelcomeEmail(input: {
  to: string;
  name?: string;
}): Promise<WelcomeSendResult> {
  const to = input.to.trim().toLowerCase();
  const name = input.name?.trim() || to.split("@")[0] || "explorer";
  const { subject, text, html } = welcomeCopy(name, siteOrigin());
  return sendResendEmail({ to, subject, html, text });
}

export { resendApiKey, mailConfigured } from "@/lib/email/sendResend";
export const RESEND_TEST_FROM_ADDRESS = RESEND_TEST_FROM;
